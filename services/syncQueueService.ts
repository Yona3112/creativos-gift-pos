
import { db_engine } from './storageService';
import { SupabaseService } from './supabaseService';
import { SyncPayload, SyncTableName } from '../types';

export interface SyncTask {
    id?: number;
    tableName: SyncTableName;
    action: 'INSERT' | 'UPDATE' | 'DELETE';
    payload: SyncPayload;
    timestamp: string;
    attempts: number;
    lastError?: string;
}

export class SyncQueueService {
    private static isProcessing = false;
    private static MAX_ATTEMPTS = 5;
    private static MAX_QUEUE_SIZE = 1000;

    /**
     * Enqueue a new synchronization task
     */
    static async enqueue(tableName: SyncTableName, action: 'INSERT' | 'UPDATE' | 'DELETE', payload: SyncPayload) {
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

        // SAFETY VALVE: If queue is massive, it indicates a structural failure (like the table mismatch)
        // We must purge invalid tasks to allow the system to breathe.
        if (tasks.length > this.MAX_QUEUE_SIZE) {
            console.warn(`🚨 [SyncQueue] Cola crítica (${tasks.length} tareas). Eliminando tareas antiguas fallidas...`);
            const failedTasks = tasks.filter(t => t.attempts >= this.MAX_ATTEMPTS);
            if (failedTasks.length > 0) {
                await db_engine.syncQueue.bulkDelete(failedTasks.map(t => t.id!));
                console.log(`🧹 [SyncQueue] Eliminadas ${failedTasks.length} tareas fallidas permanentemente.`);
                // Reload tasks after partial purge
                const remainingTasks = await db_engine.syncQueue.toArray();
                if (remainingTasks.length === 0) return;
            }
        }

        console.log(`📡 [SyncQueue] Procesando ${tasks.length} tareas pendientes...`);
        this.isProcessing = true;

        try {
            // Deduplicate tasks: If multiple updates for same ID, keep only the latest one
            // This is critical for efficiency and avoiding race conditions
            const reducedTasks = this.deduplicateTasks(tasks as SyncTask[]);

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
                    // But first check if this task has hit the burnout limit
                    if (task.attempts >= this.MAX_ATTEMPTS) {
                        console.error(`🛑 [SyncQueue] Tarea para ${task.tableName} falló definitivamente tras ${task.attempts} intentos. Eliminando.`);
                        const originalTasks = tasks.filter(t =>
                            t.tableName === task.tableName &&
                            t.payload.id === task.payload.id
                        );
                        await db_engine.syncQueue.bulkDelete(originalTasks.map(t => t.id!));
                    }
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
            const key = `${task.tableName}-${task.payload.id || (task.payload as { folio?: string }).folio || Math.random()}`;

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
                    // Mark as synced in local DB (only if table exists locally)
                    try {
                        const localTable = (db_engine as any)[task.tableName];
                        if (localTable && typeof localTable.update === 'function') {
                            await localTable.update(task.payload.id, { _synced: true });
                        }
                    } catch (dbErr) {
                        // Silently ignore - some tables like order_tracking are Supabase-only
                    }
                }

                // --- SPECIAL CASE: Handle non-retryable errors from pushRecord ---
                // If pushRecord failed, we need to decide if we should retry or DISCARD the task.
                if (!success) {
                    // We don't have the full error object here easily because pushRecord swallowed it,
                    // but we can infer or pass it back. Let's assume for now that 
                    // if it failed but it's a conflict, it shouldn't block the rest of the queue.
                    return false;
                }

                return success;
            }
        } catch (error: any) {
            // If the error is a 409 (Conflict/Unique Constraint), we should NOT retry.
            // It means data already exists in cloud with a different ID or conflicting field.
            if (error?.status === 409 || error?.code === '23505') {
                console.error(`🛑 [SyncQueue] Conflicto irreconciliable (409) en ${task.tableName}. Postergando o descartando para no bloquear cola.`);
                return true; // We return true so it GETS DELETED from the queue
            }
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

        // 0. Reconcile Sales & Credits BEFORE auditing
        await this.reconcileCreditsAndSales();

        const tables = [
            'sales', 'expenses', 'customers', 'products', 'categories',
            'credits', 'creditNotes', 'inventoryHistory', 'quotes', 'cashCuts',
            'orderTracking'
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
                        await this.enqueue(tableName as SyncTableName, 'UPDATE', record as SyncPayload);
                    }
                }
            } catch (err) {
                console.warn(`⚠️ [SyncQueue] Fallo al auditar tabla ${tableName}:`, err);
            }
        }
    }

    /**
     * RECONCILIATION: Ensures Sale.balance matches CreditAccount.paidAmount
     * This fixes visual discrepancies where an order shows balance but is already paid.
     */
    private static async reconcileCreditsAndSales() {
        try {
            const credits = await db_engine.credits.toArray();
            if (credits.length === 0) {
                console.log('⚖️ [Reconciliation] No hay créditos registrados para reconciliar.');
                return;
            }

            console.log(`⚖️ [Reconciliation] Analizando ${credits.length} cuentas de crédito...`);

            for (const credit of credits) {
                if (!credit.saleId) {
                    console.log(`⚖️ [Reconciliation] Crédito ${credit.id} sin saleId (Folio). Saltando.`);
                    continue;
                }

                // Find the associated sale by folio
                const sale = await db_engine.sales.where('folio').equals(credit.saleId).first();
                if (sale) {
                    const actualBalance = Math.max(0, (credit.totalAmount || 0) - (credit.paidAmount || 0));
                    const currentSaleBalance = sale.balance || 0;

                    // If balance is out of sync, fix the sale record
                    if (Math.abs(currentSaleBalance - actualBalance) > 0.01) {
                        console.log(`⚖️ [Reconciliation] ¡DISCREPANCIA DETECTADA! Pedido ${sale.folio}:`);
                        console.log(`   - Saldo en Venta: L ${currentSaleBalance}`);
                        console.log(`   - Saldo Real (en Créditos): L ${actualBalance}`);
                        console.log(`   - Corrigiendo...`);

                        sale.balance = actualBalance;

                        // If fully paid, optionally update fulfillment if it was stuck
                        if (actualBalance === 0 && sale.fulfillmentStatus === 'pending') {
                            console.log(`   - Marcando pedido como entregado (Totalmente pagado).`);
                            sale.fulfillmentStatus = 'delivered';
                        }

                        sale.updatedAt = new Date().toISOString();
                        sale._synced = false; // Mark for upload
                        await db_engine.sales.put(sale);
                        console.log(`✅ [Reconciliation] Pedido ${sale.folio} actualizado con éxito.`);
                    }
                } else {
                    // This happens if the sale hasn't been downloaded yet or folio mismatch
                    // console.log(`⚖️ [Reconciliation] No se encontró la venta para el folio ${credit.saleId}`);
                }
            }
        } catch (err) {
            console.warn('⚠️ [Reconciliation] Falló la reconciliación:', err);
        }
    }
}
