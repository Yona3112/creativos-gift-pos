
import { db_engine } from './storageService';
import { SupabaseService } from './supabaseService';

export interface SyncTask {
    id?: number;
    tableName: string;
    action: 'INSERT' | 'UPDATE' | 'DELETE';
    payload: any;
    timestamp: string;
    attempts: number;
    lastError?: string;
}

export class SyncQueueService {
    private static isProcessing = false;

    /**
     * Enqueue a new synchronization task
     */
    static async enqueue(tableName: string, action: 'INSERT' | 'UPDATE' | 'DELETE', payload: any) {
        const task: SyncTask = {
            tableName,
            action,
            payload,
            timestamp: new Date().toISOString(),
            attempts: 0
        };

        try {
            await db_engine.syncQueue.add(task);
            console.log(`📥 [SyncQueue] Tarea encolada: ${action} en ${tableName}`);

            // Trigger background processing (async)
            this.processQueue();
        } catch (error) {
            console.error('❌ [SyncQueue] Error al encolar tarea:', error);
        }
    }

    /**
     * Process all pending tasks in the queue
     */
    static async processQueue() {
        if (this.isProcessing) return;

        const tasks = await db_engine.syncQueue.toArray();
        if (tasks.length === 0) return;

        console.log(`📡 [SyncQueue] Procesando ${tasks.length} tareas pendientes...`);
        this.isProcessing = true;

        try {
            // Deduplicate tasks: If multiple updates for same ID, keep only the latest one
            // This is critical for efficiency and avoiding race conditions
            const reducedTasks = this.deduplicateTasks(tasks);

            for (const task of reducedTasks) {
                const success = await this.executeTask(task);

                if (success) {
                    // Remove all tasks for this same record that were part of this processing batch
                    const originalTasks = tasks.filter(t =>
                        t.tableName === task.tableName &&
                        t.payload.id === task.payload.id
                    );
                    await db_engine.syncQueue.bulkDelete(originalTasks.map(t => t.id!));
                    console.log(`✅ [SyncQueue] Tarea completada y eliminada: ${task.tableName} (${task.payload.id || 'N/A'})`);
                } else {
                    // Update attempts on all original tasks for this record
                    const originalTasks = tasks.filter(t =>
                        t.tableName === task.tableName &&
                        t.payload.id === task.payload.id
                    );
                    for (const t of originalTasks) {
                        await db_engine.syncQueue.update(t.id!, {
                            attempts: (t.attempts || 0) + 1,
                            lastError: 'Network Error or Cloud Rejection'
                        });
                    }
                    // Stop processing this batch if we hit a failure (likely network)
                    break;
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Group and deduplicate tasks to avoid redundant cloud updates
     */
    private static deduplicateTasks(tasks: SyncTask[]): SyncTask[] {
        const uniqueTasks = new Map<string, SyncTask>();

        for (const task of tasks) {
            const key = `${task.tableName}-${task.payload.id || task.payload.folio || Math.random()}`;

            // If it's a DELETE, it wins over any previous INSERT/UPDATE
            if (task.action === 'DELETE') {
                uniqueTasks.set(key, task);
                continue;
            }

            // For INSERT/UPDATE, keep the one with the latest timestamp
            const existing = uniqueTasks.get(key);
            if (!existing || new Date(task.timestamp) > new Date(existing.timestamp)) {
                uniqueTasks.set(key, task);
            }
        }

        return Array.from(uniqueTasks.values());
    }

    /**
     * Execute a single sync task against Supabase
     */
    private static async executeTask(task: SyncTask): Promise<boolean> {
        try {
            if (task.action === 'DELETE') {
                await SupabaseService.deleteFromTable(task.tableName, task.payload.id);
                return true;
            } else {
                // INSERT or UPDATE are handled by pushRecord (which uses upsert)
                const success = await SupabaseService.pushRecord(task.tableName, task.payload);
                if (success && task.payload.id) {
                    // Mark as synced in local DB
                    try {
                        await (db_engine as any)[task.tableName].update(task.payload.id, { _synced: true });
                    } catch (dbErr) {
                        console.warn(`⚠️ [SyncQueue] No se pudo marcar _synced en ${task.tableName}:`, dbErr);
                    }
                }
                return success;
            }
        } catch (error) {
            console.warn(`⚠️ [SyncQueue] Fallo al ejecutar tarea para ${task.tableName}:`, error);
            return false;
        }
    }

    /**
     * Check if a specific record has pending changes in the queue
     * Used for "Smart Merge" to avoid overwriting newer local data with stale cloud data
     */
    static async hasPendingChanges(tableName: string, recordId: string): Promise<boolean> {
        const count = await db_engine.syncQueue
            .filter(t => t.tableName === tableName && t.payload.id === recordId)
            .count();
        return count > 0;
    }

    /**
     * Scan critical tables for items that may have been missed by incremental sync
     * and enqueue them for processing.
     */
    static async auditAndEnqueueUnsynced() {
        console.log('🔍 [SyncQueue] Ejecutando auditoría de autocuración...');
        const tables = [
            'sales', 'expenses', 'customers', 'products', 'categories',
            'credits', 'creditNotes', 'inventoryHistory'
        ];

        for (const tableName of tables) {
            try {
                // Find records where _synced is NOT true (catches false and undefined/old records)
                const unsynced = await (db_engine as any)[tableName]
                    .filter((item: any) => item._synced !== true)
                    .toArray();

                if (unsynced.length > 0) {
                    console.log(`🩹 [SyncQueue] Autocuración: Encolando ${unsynced.length} registros huérfanos de ${tableName}`);
                    for (const record of unsynced) {
                        await this.enqueue(tableName, 'UPDATE', record);
                    }
                }
            } catch (err) {
                console.warn(`⚠️ [SyncQueue] Fallo al auditar tabla ${tableName}:`, err);
            }
        }
    }
}
