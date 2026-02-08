/**
 * Supabase Realtime Service
 * Handles real-time subscriptions for live data synchronization
 * Optimized for Supabase Pro limits (Concurrent connections / Message rate)
 */

import { db, db_engine } from './storageService';
import { SyncQueueService } from './syncQueueService';
import { Sale, Product, Customer, InventoryMovement, Quote, CreditAccount } from '../types';

// Type for Realtime payload
interface RealtimePayload<T> {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: T;
    old: Partial<T>;
}

// Subscription reference for cleanup
let globalSubscription: any = null;
let isSubscribed = false;

// Event Emitters for React Hooks
const listeners: Record<string, Function[]> = {
    'sales': [],
    'products': [],
    'customers': [],
    'inventory': [],
    'settings': []
};

/**
 * Register a listener for a specific table
 */
export function onRealtimeChange(table: string, callback: (payload: any) => void) {
    if (!listeners[table]) listeners[table] = [];
    listeners[table].push(callback);
    return () => {
        listeners[table] = listeners[table].filter(cb => cb !== callback);
    };
}

/**
 * Broadcast change to listeners
 */
function broadcastChange(table: string, payload: any) {
    if (listeners[table]) {
        listeners[table].forEach(cb => cb(payload));
    }
}

/**
 * Subscribe to real-time changes on ALL critical tables
 * Uses a single CHANNEL to multiplex subscriptions (Best Practice for Supabase)
 */
export async function subscribeToRealtime(): Promise<void> {
    if (isSubscribed) {
        console.log('📡 [Realtime] Ya conectado.');
        return;
    }

    try {
        const { SupabaseService } = await import('./supabaseService');
        const client = await SupabaseService.getClient();

        if (!client) {
            console.warn('⚠️ [Realtime] Cliente Supabase no disponible');
            return;
        }

        console.log('🔌 [Realtime] Iniciando conexión multiplexada...');

        // SINGLE CHANNEL for all tables (Efficient for Supabase Quotas)
        const channel = client.channel('global-app-changes');

        // 1. SALES / ORDERS
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, async (payload: RealtimePayload<Sale>) => {
            console.log(`📡 [RT:Sales] ${payload.eventType} ID: ${payload.new?.id || payload.old?.id}`);
            await handleGenericUpdate('sales', payload, db_engine.sales);
        });

        // 2. PRODUCTS (Stock updates)
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async (payload: RealtimePayload<Product>) => {
            await handleGenericUpdate('products', payload, db_engine.products);
        });

        // 3. CUSTOMERS
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, async (payload: RealtimePayload<Customer>) => {
            await handleGenericUpdate('customers', payload, db_engine.customers);
        });

        // 4. INVENTORY HISTORY (Audit)
        channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_history' }, async (payload: RealtimePayload<InventoryMovement>) => {
            // Only insert, history is append-only usually
            await handleGenericUpdate('inventoryHistory', payload, db_engine.inventoryHistory);
        });

        // 5. SETTINGS
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, async (payload: RealtimePayload<any>) => {
            if (payload.eventType === 'UPDATE' && payload.new) {
                await db.saveSettings(payload.new);
                broadcastChange('settings', payload.new);
            }
        });

        // 6. CREDITS (Critical for multi-device payments)
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'credits' }, async (payload: RealtimePayload<CreditAccount>) => {
            await handleGenericUpdate('credits', payload, db_engine.credits);
        });

        // 7. EXPENSES
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, async (payload: RealtimePayload<any>) => {
            await handleGenericUpdate('expenses', payload, db_engine.expenses);
        });

        // 8. QUOTES
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, async (payload: RealtimePayload<Quote>) => {
            await handleGenericUpdate('quotes', payload, db_engine.quotes);
        });

        // 9. CASH CUTS
        channel.on('postgres_changes', { event: '*', schema: 'public', table: 'cash_cuts' }, async (payload: RealtimePayload<any>) => {
            await handleGenericUpdate('cash_cuts', payload, db_engine.cashCuts);
        });

        globalSubscription = channel.subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED') {
                console.log('✅ [Realtime] Conectado y escuchando cambios (Ventas, Productos, Clientes, Inventario)');
                isSubscribed = true;
            } else if (status === 'CLOSED') {
                console.log('❌ [Realtime] Desconectado');
                isSubscribed = false;
            } else if (status === 'CHANNEL_ERROR') {
                console.error('❌ [Realtime] Error en el canal');
                isSubscribed = false;
                // Retry logic could go here
            }
        });

    } catch (error) {
        console.error('❌ [Realtime] Excepción al conectar:', error);
    }
}

/**
 * Validates if the cloud object has the minimal required fields to be considered valid.
 * This prevents corrupt data from polluting the local DB.
 */
function isValidPayload(table: string, obj: any): boolean {
    if (!obj) return false;
    if (!obj.id) return false;

    // Specific validation rules per table
    if (table === 'sales') {
        // Sales must have a folio or an ID, and items should be defined (even if empty array)
        if (!obj.folio && !obj.id) return false;
        // Fix items if null
        if (!obj.items) obj.items = [];
    }

    return true;
}

/**
 * Generic handler for DB updates
 */
async function handleGenericUpdate(tableName: string, payload: RealtimePayload<any>, dbTable: any) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    const tableKey = tableName === 'inventoryHistory' ? 'inventory_history' : tableName; // Mapping for listeners

    try {
        if (eventType === 'DELETE') {
            if (oldRecord && oldRecord.id) {
                await dbTable.delete(oldRecord.id);
                console.log(`🗑️ [RT:${tableName}] Eliminado: ${oldRecord.id}`);
                broadcastChange(tableKey, { action: 'DELETE', id: oldRecord.id });
            }
            return;
        }

        // INSERT / UPDATE
        if (!newRecord || !isValidPayload(tableName, newRecord)) {
            console.warn(`⚠️ [RT:${tableName}] Payload inválido ignorado:`, newRecord);
            return;
        }

        // Conflict Protection: Don't overwrite if we have pending local changes for this specific ID
        const hasPending = await SyncQueueService.hasPendingChanges(tableName === 'inventoryHistory' ? 'inventory_history' : tableName, newRecord.id);
        if (hasPending) {
            console.log(`🛡️ [RT:${tableName}] Ignorando update Cloud para ${newRecord.id} porque hay cambios locales pendientes.`);
            return;
        }

        // Apply update
        // Ensure _synced is true since it came from cloud
        newRecord._synced = true;

        // Handle special fields
        if (tableName === 'sales' && !Array.isArray(newRecord.items)) newRecord.items = [];

        await dbTable.put(newRecord);
        console.log(`🔄 [RT:${tableName}] Sincronizado: ${newRecord.folio || newRecord.name || newRecord.id}`);

        broadcastChange(tableKey, { action: eventType, data: newRecord });

    } catch (err) {
        console.error(`❌ [Realtime] Error procesando ${tableName}:`, err);
    }
}

/**
 * Unsubscribe from all
 */
export async function unsubscribeFromRealtime(): Promise<void> {
    if (globalSubscription) {
        const { SupabaseService } = await import('./supabaseService');
        const client = await SupabaseService.getClient();
        if (client) await client.removeChannel(globalSubscription);
    }
    globalSubscription = null;
    isSubscribed = false;
    console.log('🔌 [Realtime] Desconectado manualmente');
}

/**
 * Status check
 */
export function isRealtimeConnected(): boolean {
    return isSubscribed;
}

/**
 * Update order status via PostgreSQL RPC for atomic operation
 */
export async function updateOrderStatusViaRPC(
    saleId: string,
    newStatus: string,
    shippingDetails?: any
): Promise<{ success: boolean; message: string; sale?: Sale }> {
    try {
        const { SupabaseService } = await import('./supabaseService');
        const client = await SupabaseService.getClient();
        if (!client) throw new Error('Sin conexión a Supabase');

        const { data, error } = await client.rpc('update_order_status', {
            p_sale_id: saleId,
            p_new_status: newStatus,
            p_shipping_details: shippingDetails ? JSON.stringify(shippingDetails) : null
        });

        if (error) throw error;

        if (data.success && data.updated_sale) {
            const updated = data.updated_sale;
            updated._synced = true;
            await db_engine.sales.put(updated);
            return { success: true, message: 'Actualizado', sale: updated };
        }

        return { success: false, message: data.message || 'Error desconocido' };

    } catch (e: any) {
        console.error("RPC Error:", e);
        // Fallback or rethrow? For Pro strategy, we prefer RPC to ensure data integrity
        return { success: false, message: e.message };
    }
}
