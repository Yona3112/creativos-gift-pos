/**
 * Supabase Realtime Service
 * Handles real-time subscriptions for live data synchronization
 */

import { db, db_engine } from './storageService';
import { Sale, FulfillmentStatus, ShippingDetails } from '../types';

// Type for Realtime payload
interface RealtimePayload {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: any;
    old: any;
}

// Subscription reference for cleanup
let salesSubscription: any = null;
let isSubscribed = false;

// Callback type for UI updates
type SalesChangeCallback = (sale: Sale, eventType: 'INSERT' | 'UPDATE') => void;

/**
 * Subscribe to real-time changes on the sales table
 * Should be called once globally (in App.tsx) to avoid connection pool exhaustion
 */
export async function subscribeToSales(onSaleChange: SalesChangeCallback): Promise<() => void> {
    // Avoid duplicate subscriptions
    if (isSubscribed && salesSubscription) {
        console.log('📡 [Realtime] Ya existe una suscripción activa');
        return () => unsubscribeFromSales();
    }

    try {
        const { SupabaseService } = await import('./supabaseService');
        const client = await SupabaseService.getClient();

        if (!client) {
            console.warn('⚠️ [Realtime] Cliente Supabase no disponible');
            return () => { };
        }

        // Create channel for sales table
        const channel = client
            .channel('sales-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
                    schema: 'public',
                    table: 'sales'
                },
                async (payload: RealtimePayload) => {
                    console.log(`📡 [Realtime] Evento recibido: ${payload.eventType}`);

                    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                        const remoteSale = payload.new as Sale;

                        // CRITICAL: Validate remote sale has required fields
                        if (!remoteSale || !remoteSale.id) {
                            console.warn('⚠️ [Realtime] Datos de venta inválidos, ignorando');
                            return;
                        }

                        // Ensure items is always an array (Supabase may return null)
                        if (!Array.isArray(remoteSale.items)) {
                            remoteSale.items = [];
                        }

                        // Conflict resolution: Only apply if remote is newer
                        const localSale = await db_engine.sales.get(remoteSale.id);

                        if (localSale) {
                            const remoteTime = remoteSale.updatedAt ? new Date(remoteSale.updatedAt).getTime() : 0;
                            const localTime = localSale.updatedAt ? new Date(localSale.updatedAt).getTime() : 0;

                            if (remoteTime > localTime) {
                                // Remote is newer, update local
                                await db_engine.sales.put(remoteSale);
                                console.log(`✅ [Realtime] Actualizado: ${remoteSale.folio} → ${remoteSale.fulfillmentStatus}`);
                                onSaleChange(remoteSale, payload.eventType);
                            } else {
                                console.log(`⏭️ [Realtime] Ignorado (local más reciente): ${remoteSale.folio}`);
                            }
                        } else {
                            // New record, insert directly
                            await db_engine.sales.put(remoteSale);
                            console.log(`🆕 [Realtime] Nuevo pedido: ${remoteSale.folio}`);
                            onSaleChange(remoteSale, payload.eventType);
                        }
                    }
                }
            )
            .subscribe((status: string) => {
                if (status === 'SUBSCRIBED') {
                    console.log('📡 [Realtime] Suscripción activa - Escuchando cambios en tiempo real');
                    isSubscribed = true;
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('❌ [Realtime] Error en el canal');
                    isSubscribed = false;
                } else if (status === 'TIMED_OUT') {
                    console.warn('⚠️ [Realtime] Timeout en suscripción');
                    isSubscribed = false;
                }
            });

        salesSubscription = channel;

        // Return cleanup function
        return () => unsubscribeFromSales();

    } catch (error) {
        console.error('❌ [Realtime] Error al suscribirse:', error);
        return () => { };
    }
}

/**
 * Unsubscribe from sales channel
 * CRITICAL: Must be called when component unmounts to free connection pool
 */
export async function unsubscribeFromSales(): Promise<void> {
    if (salesSubscription) {
        try {
            const { SupabaseService } = await import('./supabaseService');
            const client = await SupabaseService.getClient();

            if (client) {
                await client.removeChannel(salesSubscription);
                console.log('📡 [Realtime] Suscripción eliminada - Conexión liberada');
            }

            salesSubscription = null;
            isSubscribed = false;
        } catch (error) {
            console.warn('⚠️ [Realtime] Error al eliminar suscripción:', error);
        }
    }
}

/**
 * Update order status via PostgreSQL RPC for atomic operation
 * This prevents race conditions when multiple devices update simultaneously
 */
export async function updateOrderStatusViaRPC(
    saleId: string,
    newStatus: FulfillmentStatus,
    shippingDetails?: Partial<ShippingDetails>
): Promise<{ success: boolean; message: string; sale?: Sale }> {
    try {
        const { SupabaseService } = await import('./supabaseService');
        const client = await SupabaseService.getClient();

        if (!client) {
            throw new Error('Cliente Supabase no disponible');
        }

        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), 5000)
        );

        // Call the RPC function with a 5-second timeout
        const rpcPromise = client.rpc('update_order_status', {
            p_sale_id: saleId,
            p_new_status: newStatus,
            p_shipping_details: shippingDetails ? JSON.stringify(shippingDetails) : null
        });

        const { data, error } = await Promise.race([rpcPromise, timeoutPromise]) as any;

        if (error) {
            // Fallback: If RPC doesn't exist, use direct update
            if (error.code === '42883') { // undefined_function
                console.warn('⚠️ [RPC] Función no existe, usando actualización directa');
                return await updateOrderStatusDirect(client, saleId, newStatus, shippingDetails);
            }
            throw error;
        }

        if (data && data.success) {
            const updatedSale = data.updated_sale as Sale;
            // Update local immediately
            await db_engine.sales.put(updatedSale);
            console.log(`✅ [RPC] Estado actualizado atómicamente: ${saleId} → ${newStatus}`);
            return { success: true, message: 'Estado actualizado', sale: updatedSale };
        } else {
            return { success: false, message: data?.message || 'Error desconocido' };
        }

    } catch (error: any) {
        console.error('❌ [RPC] Error:', error);
        return { success: false, message: error.message || 'Error al actualizar estado' };
    }
}

/**
 * Direct update fallback when RPC is not available
 */
async function updateOrderStatusDirect(
    client: any,
    saleId: string,
    newStatus: FulfillmentStatus,
    shippingDetails?: Partial<ShippingDetails>
): Promise<{ success: boolean; message: string; sale?: Sale }> {
    try {
        // First fetch current state to check for conflicts
        const { data: currentData, error: fetchError } = await client
            .from('sales')
            .select('*')
            .eq('id', saleId)
            .single();

        if (fetchError) throw fetchError;
        if (!currentData) return { success: false, message: 'Pedido no encontrado' };

        // Prepare update
        const now = new Date().toISOString();
        const updatePayload: any = {
            fulfillmentStatus: newStatus,
            updatedAt: now
        };

        if (shippingDetails) {
            updatePayload.shippingDetails = {
                ...currentData.shippingDetails,
                ...shippingDetails
            };
        }

        // Perform update
        const { data, error } = await client
            .from('sales')
            .update(updatePayload)
            .eq('id', saleId)
            .select()
            .single();

        if (error) throw error;

        // Update local
        await db_engine.sales.put(data);
        console.log(`✅ [Direct] Estado actualizado: ${saleId} → ${newStatus}`);

        return { success: true, message: 'Estado actualizado', sale: data };

    } catch (error: any) {
        console.error('❌ [Direct] Error:', error);
        return { success: false, message: error.message || 'Error al actualizar' };
    }
}

/**
 * Check if Realtime is currently connected
 */
export function isRealtimeConnected(): boolean {
    return isSubscribed;
}
