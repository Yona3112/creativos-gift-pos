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

// Subscription references for cleanup
let salesSubscription: any = null;
let settingsSubscription: any = null;
let isSubscribed = false;

// Callback types
type SalesChangeCallback = (sale: Sale, eventType: 'INSERT' | 'UPDATE') => void;
type SettingsChangeCallback = (settings: any) => void;

/**
 * Subscribe to real-time changes on the sales and settings tables
 * Should be called once globally (in App.tsx) to avoid connection pool exhaustion
 */
export async function subscribeToRealtime(
    onSaleChange: SalesChangeCallback,
    onSettingsChange: SettingsChangeCallback
): Promise<() => void> {
    // Avoid duplicate subscriptions
    if (isSubscribed && (salesSubscription || settingsSubscription)) {
        console.log('📡 [Realtime] Ya existe una suscripción activa');
        return () => unsubscribeFromRealtime();
    }

    try {
        const { SupabaseService } = await import('./supabaseService');
        const client = await SupabaseService.getClient();

        if (!client) {
            console.warn('⚠️ [Realtime] Cliente Supabase no disponible');
            return () => { };
        }

        // --- SALES SUBSCRIPTION ---
        salesSubscription = client
            .channel('sales-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
                    schema: 'public',
                    table: 'sales'
                },
                async (payload: RealtimePayload) => {
                    console.log(`📡 [Realtime:Sales] Evento recibido: ${payload.eventType}`);

                    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                        const remoteSale = payload.new as Sale;

                        // CRITICAL: Validate remote sale has required fields
                        if (!remoteSale || !remoteSale.id) {
                            console.warn('⚠️ [Realtime:Sales] Datos de venta inválidos, ignorando');
                            return;
                        }

                        // Ensure items is always an array
                        if (!Array.isArray(remoteSale.items)) {
                            remoteSale.items = [];
                        }

                        // SINGLE SOURCE OF TRUTH: Remote Wins
                        // We always update local with remote data to ensure consistency
                        // Conflict resolution is removed in favor of "Supabase is Truth"
                        try {
                            // Check for local differences for logging only
                            const localSale = await db_engine.sales.get(remoteSale.id);

                            // Process update
                            await db_engine.sales.put(remoteSale);

                            if (localSale) {
                                console.log(`✅ [Realtime:Sales] Actualizado: ${remoteSale.folio} (Sync desde nube)`);
                            } else {
                                console.log(`🆕 [Realtime:Sales] Nuevo pedido: ${remoteSale.folio}`);
                            }

                            onSaleChange(remoteSale, payload.eventType);
                        } catch (err) {
                            console.error('❌ [Realtime:Sales] Error al guardar en IndexDB:', err);
                        }
                    } else if (payload.eventType === 'DELETE') {
                        const oldId = payload.old?.id;
                        if (oldId) {
                            await db_engine.sales.delete(oldId);
                            console.log(`🗑️ [Realtime:Sales] Pedido eliminado: ${oldId}`);
                        }
                    }
                }
            )
            .subscribe((status: string) => {
                if (status === 'SUBSCRIBED') {
                    console.log('📡 [Realtime:Sales] Suscripción activa');
                    isSubscribed = true;
                }
            });

        // --- SETTINGS SUBSCRIPTION ---
        settingsSubscription = client
            .channel('settings-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'settings'
                },
                async (payload: RealtimePayload) => {
                    console.log(`📡 [Realtime:Settings] Cambios detectados: ${payload.eventType}`);

                    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                        const remoteSettings = payload.new;
                        if (remoteSettings) {
                            // Update local settings immediately
                            await db.saveSettings(remoteSettings);
                            console.log('✅ [Realtime:Settings] Configuraciones actualizadas desde la nube');
                            onSettingsChange(remoteSettings);
                        }
                    }
                }
            )
            .subscribe((status: string) => {
                if (status === 'SUBSCRIBED') {
                    console.log('📡 [Realtime:Settings] Suscripción activa');
                }
            });

        // Return cleanup function
        return () => unsubscribeFromRealtime();

    } catch (error) {
        console.error('❌ [Realtime] Error al suscribirse:', error);
        return () => { };
    }
}

/**
 * Unsubscribe from all realtime channels
 */
export async function unsubscribeFromRealtime(): Promise<void> {
    try {
        const { SupabaseService } = await import('./supabaseService');
        const client = await SupabaseService.getClient();

        if (client) {
            if (salesSubscription) {
                await client.removeChannel(salesSubscription);
                console.log('📡 [Realtime:Sales] Canal eliminado');
            }
            if (settingsSubscription) {
                await client.removeChannel(settingsSubscription);
                console.log('📡 [Realtime:Settings] Canal eliminado');
            }
        }

        salesSubscription = null;
        settingsSubscription = null;
        isSubscribed = false;
    } catch (error) {
        console.warn('⚠️ [Realtime] Error al eliminar suscripciones:', error);
        isSubscribed = false;
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

        // CRITICAL: Deep merge shippingDetails to preserve productionImages and other nested data
        if (shippingDetails || currentData.shippingDetails) {
            const existingDetails = currentData.shippingDetails || {};
            const newDetails = shippingDetails || {};
            updatePayload.shippingDetails = {
                ...existingDetails,
                ...newDetails,
                // Explicitly preserve productionImages unless explicitly being updated
                productionImages: newDetails.productionImages !== undefined
                    ? newDetails.productionImages
                    : existingDetails.productionImages
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
