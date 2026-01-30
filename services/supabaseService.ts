
import { createClient } from '@supabase/supabase-js';
import { db } from './storageService';

export class SupabaseService {
    private static client: any = null;

    static async getClient() {
        if (this.client) return this.client;

        // Priority 1: Environment variables (for production on Vercel/Netlify)
        const envUrl = import.meta.env.VITE_SUPABASE_URL;
        const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (envUrl && envKey) {
            try {
                this.client = createClient(envUrl, envKey);
                return this.client;
            } catch (e) {
                console.error("Error al crear cliente Supabase desde env:", e);
            }
        }

        // Priority 2: Settings from local database (for local development)
        const settings = await db.getSettings();
        if (settings.supabaseUrl && settings.supabaseKey) {
            try {
                this.client = createClient(settings.supabaseUrl, settings.supabaseKey);
                return this.client;
            } catch (e) {
                console.error("Error al crear cliente Supabase:", e);
                return null;
            }
        }
        return null;
    }

    static async testConnection() {
        const client = await this.getClient();
        if (!client) throw new Error("Supabase no está configurado (URL o Key faltante).");

        const { data, error } = await client.from('settings').select('id').limit(1);
        if (error) throw new Error(`Error de conexión: ${error.message}`);
        return true;
    }

    /**
     * Delete a record from a specific Supabase table
     */
    static async deleteFromTable(tableName: string, id: string) {
        const client = await this.getClient();
        if (!client) {
            console.warn("⚠️ Supabase no configurado, eliminación local únicamente.");
            return;
        }

        try {
            const { error } = await client.from(tableName).delete().eq('id', id);
            if (error) {
                console.error(`❌ Error eliminando de ${tableName}:`, error);
            } else {
                console.log(`✅ Eliminado de ${tableName}: ${id}`);
            }
        } catch (e) {
            console.warn(`⚠️ Error en deleteFromTable(${tableName}):`, e);
        }
    }

    /**
     * Clear all records from a specific Supabase table
     */
    static async clearCloudTable(tableName: string): Promise<{ success: boolean; count: number }> {
        const client = await this.getClient();
        if (!client) {
            throw new Error("Supabase no está configurado.");
        }

        try {
            // First get all IDs
            const { data: records, error: fetchError } = await client.from(tableName).select('id');
            if (fetchError) throw fetchError;

            if (!records || records.length === 0) {
                return { success: true, count: 0 };
            }

            // Delete all records (Supabase requires a condition)
            const { error: deleteError } = await client.from(tableName).delete().neq('id', '___impossible___');
            if (deleteError) throw deleteError;

            console.log(`🗑️ Eliminados ${records.length} registros de ${tableName} en Supabase`);
            return { success: true, count: records.length };
        } catch (e: any) {
            console.error(`❌ Error limpiando ${tableName}:`, e);
            throw new Error(`Error al limpiar ${tableName}: ${e.message}`);
        }
    }

    static async syncAll(forceFull: boolean = false) {
        console.log(`🔄 Iniciando sincronización ${forceFull ? 'TOTAL' : 'INCREMENTAL'}...`);
        const client = await this.getClient();
        if (!client) {
            console.error("❌ Supabase no está configurado - no hay cliente");
            throw new Error("Supabase no está configurado.");
        }

        const settings = await db.getSettings();
        const lastSync = settings.lastCloudSync ? new Date(settings.lastCloudSync).getTime() : 0;
        const now = await db.getLocalNowISO(); // Use unified timestamp

        const data = await db.getAllData();
        const results: any = {};

        const tables = [
            { name: 'categories', data: data.categories },
            { name: 'branches', data: data.branches },
            { name: 'products', data: data.products },
            { name: 'customers', data: data.customers },
            { name: 'users', data: data.users },
            { name: 'sales', data: data.sales },
            { name: 'credits', data: data.credits },
            { name: 'promotions', data: data.promotions },
            { name: 'suppliers', data: data.suppliers },
            { name: 'consumables', data: data.consumables },
            { name: 'quotes', data: data.quotes },
            { name: 'cash_cuts', data: data.cash_cuts },
            { name: 'credit_notes', data: data.credit_notes },
            { name: 'expenses', data: data.expenses },
            { name: 'inventory_history', data: data.inventoryHistory },
            { name: 'price_history', data: data.priceHistory }
        ];

        for (const table of tables) {
            if (table.data && table.data.length > 0) {
                // DELTA FILTERING: Only records updated after last sync
                const recordsToSync = forceFull ? table.data : table.data.filter((item: any) => {
                    const itemUpdated = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
                    const itemCreated = item.date ? new Date(item.date).getTime() : 0;
                    return Math.max(itemUpdated, itemCreated) > lastSync;
                });

                if (recordsToSync.length === 0) {
                    console.log(`⏭️ ${table.name}: sin cambios nuevos`);
                    results[table.name] = 'Sin cambios';
                    continue;
                }

                console.log(`📤 Sincronizando ${table.name}: ${recordsToSync.length} registros nuevos/modificados...`);

                try {
                    // Handle users table specially due to unique email constraint
                    if (table.name === 'users') {
                        let successCount = 0;
                        for (const user of recordsToSync) {
                            try {
                                const { error } = await client.from('users').upsert(user, { onConflict: 'id' });
                                if (!error) successCount++;
                            } catch (e) {
                                // Skip problematic users silently
                            }
                        }
                        results['users'] = `Incremental (${successCount}/${recordsToSync.length})`;
                        continue;
                    }

                    // Normal upsert for other tables
                    const { error } = await client.from(table.name).upsert(recordsToSync);
                    if (error) {
                        console.error(`❌ Error en ${table.name}:`, error);
                        results[table.name] = `Error: ${error.message}`;
                    } else {
                        results[table.name] = 'OK';
                    }
                } catch (tableError: any) {
                    console.error(`❌ Fallo crítico en ${table.name}:`, tableError);
                    results[table.name] = `Fallo: ${tableError.message}`;
                }
            }
        }

        // Settings is a special case (single row)
        if (data.settings) {
            const cloudColumns = [
                'id', 'name', 'rtn', 'address', 'phone', 'email', 'cai',
                'billingRangeStart', 'billingRangeEnd', 'billingDeadline',
                'currentInvoiceNumber', 'currentTicketNumber', 'currentProductCode', 'currentQuoteNumber',
                'printerSize', 'moneyPerPoint', 'pointValue', 'defaultCreditRate', 'defaultCreditTerm',
                'creditDueDateAlertDays', 'enableCreditAlerts', 'showFloatingWhatsapp', 'whatsappTemplate',
                'logo', 'themeColor', 'whatsappNumber', 'masterPassword', 'supabaseUrl', 'supabaseKey',
                'autoSync', 'lastBackupDate', 'lastCloudSync', 'logoObjectFit', 'thanksMessage', 'warrantyPolicy', 'returnPolicy',
                'barcodeWidth', 'barcodeHeight', 'showLogoOnBarcode', 'barcodeLogoSize', 'legalOwnerName', 'legalCity',
                'darkMode', 'enableBeep', 'currentSeason'
            ];

            const settingsToSync: any = { id: 'main' };
            cloudColumns.forEach(col => {
                if (data.settings[col] !== undefined) {
                    settingsToSync[col] = data.settings[col];
                }
            });

            // Update local and cloud last sync time
            settingsToSync.lastCloudSync = now;

            const { error } = await client.from('settings').upsert(settingsToSync);
            if (!error) {
                // Update local settings with new lastCloudSync
                await db.saveSettings({ ...data.settings, lastCloudSync: now });
            }
        }

        console.log("🏁 Sincronización completa:", results);
        return results;
    }

    static async pullAll() {
        const client = await this.getClient();
        if (!client) throw new Error("Supabase no está configurado.");

        const tables = [
            'products', 'categories', 'customers', 'sales', 'users',
            'branches', 'credits', 'promotions', 'suppliers',
            'consumables', 'quotes', 'cash_cuts', 'credit_notes',
            'expenses', 'inventory_history', 'price_history', 'settings'
        ];

        const pulledData: any = {};
        const now = new Date().toISOString();

        // Tables that need date filtering to avoid timeout
        const largeTables = ['sales', 'inventory_history', 'price_history'];
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 60); // Last 60 days for full sync
        const cutoffStr = cutoff.toISOString();

        for (const table of tables) {
            let query = client.from(table).select('*');

            // Apply limits to large tables to avoid timeout
            if (largeTables.includes(table)) {
                query = query.gte('date', cutoffStr).order('date', { ascending: false }).limit(500);
            }

            const { data, error } = await query;
            if (!error && data) {
                pulledData[table] = data;
            } else if (error) {
                console.error(`Error descargando tabla ${table}:`, error);
            }
        }

        // Map back to Dexie names
        const dexieData: any = {
            products: pulledData.products || [],
            categories: pulledData.categories || [],
            customers: pulledData.customers || [],
            sales: pulledData.sales || [],
            users: pulledData.users || [],
            branches: pulledData.branches || [],
            credits: pulledData.credits || [],
            promotions: pulledData.promotions || [],
            suppliers: pulledData.suppliers || [],
            consumables: pulledData.consumables || [],
            quotes: pulledData.quotes || [],
            cash_cuts: pulledData.cash_cuts || [],
            credit_notes: pulledData.credit_notes || [],
            expenses: pulledData.expenses || [],
            inventoryHistory: pulledData.inventory_history || [],
            priceHistory: pulledData.price_history || [],
            settings: pulledData.settings?.find((s: any) => s.id === 'main')
        };

        // Debug: Log what settings we got from cloud
        console.log("☁️ [pullAll] Settings from cloud:", {
            hasSettings: !!dexieData.settings,
            hasLogo: !!dexieData.settings?.logo,
            logoLength: dexieData.settings?.logo?.length || 0,
            settingsKeys: dexieData.settings ? Object.keys(dexieData.settings) : []
        });

        const hasAnyData = dexieData.products.length > 0 ||
            dexieData.sales.length > 0 ||
            dexieData.customers.length > 0 ||
            dexieData.settings;

        if (hasAnyData) {
            await db.restoreData(dexieData);
            // Update lastCloudSync after full pull
            const currentSett = await db.getSettings();
            await db.saveSettings({ ...currentSett, lastCloudSync: now });
            return dexieData;
        }

        return null;
    }

    /**
     * INCREMENTAL SYNC: Fetch only changes from cloud since lastCloudSync
     */
    static async pullDelta() {
        const client = await this.getClient();
        if (!client) return null;
        const settings = await db.getSettings();
        const lastSync = settings.lastCloudSync;
        if (!lastSync) return this.pullAll(); // If no last sync, do full pull

        // CLOCK DRIFT PROTECTION: Subtract 2 minutes from lastSync to account for client/server time difference
        const lastSyncDate = new Date(lastSync);
        const driftedSync = new Date(lastSyncDate.getTime() - (2 * 60 * 1000)).toISOString();

        const now = await db.getLocalNowISO(); // Use unified timestamp
        const tables = [
            'products', 'categories', 'customers', 'sales', 'users',
            'branches', 'credits', 'promotions', 'suppliers',
            'consumables', 'quotes', 'cash_cuts', 'credit_notes',
            'expenses', 'inventory_history', 'price_history'
        ];

        let totalChanges = 0;
        const results: any = {};

        for (const table of tables) {
            try {
                // Fetch records updated after (lastSync - 2min)
                // Use .gte() to ensure we don't miss records exactly at the boundary
                const { data, error } = await client
                    .from(table)
                    .select('*')
                    .gte('updatedAt', driftedSync)
                    .limit(500);

                if (!error && data && data.length > 0) {
                    results[table] = data;
                    totalChanges += data.length;
                    console.log(`📥 ${table}: ${data.length} cambios detectados desde ${driftedSync}`);
                }
            } catch (err) {
                console.warn(`⚠️ Error en pullDelta para tabla ${table}:`, err);
            }
        }

        if (totalChanges > 0) {
            await this.mergeDelta(results);
        }

        // Always update last sync time even if no changes
        await db.saveSettings({ ...settings, lastCloudSync: now });

        return totalChanges;
    }

    private static async mergeDelta(delta: any) {
        // Sales handled differently to merge
        if (delta.sales) {
            console.log(`🔀 Procesando ${delta.sales.length} ventas de la nube...`);
            for (const cloudSale of delta.sales) {
                await db.insertSaleFromCloud(cloudSale);
            }
        }

        // Cash cuts merge
        if (delta.cash_cuts) {
            console.log(`🔀 Procesando ${delta.cash_cuts.length} cortes de caja de la nube...`);
            for (const cut of delta.cash_cuts) {
                await db.saveCashCut(cut);
            }
        }

        // Generic merge for most tables
        const genericTables = [
            { cloud: 'products', dexie: 'products' },
            { cloud: 'categories', dexie: 'categories' },
            { cloud: 'customers', dexie: 'customers' },
            { cloud: 'users', dexie: 'users' },
            { cloud: 'branches', dexie: 'branches' },
            { cloud: 'credits', dexie: 'credits' },
            { cloud: 'promotions', dexie: 'promotions' },
            { cloud: 'suppliers', dexie: 'suppliers' },
            { cloud: 'consumables', dexie: 'consumables' },
            { cloud: 'quotes', dexie: 'quotes' },
            { cloud: 'cash_cuts', dexie: 'cash_cuts' },
            { cloud: 'credit_notes', dexie: 'credit_notes' },
            { cloud: 'expenses', dexie: 'expenses' },
            { cloud: 'inventory_history', dexie: 'inventoryHistory' },
            { cloud: 'price_history', dexie: 'priceHistory' }
        ];

        for (const map of genericTables) {
            const data = delta[map.cloud];
            if (data && data.length > 0) {
                // Use put to update or add
                for (const item of data) {
                    await (db as any)[map.dexie].put(item);
                }
            }
        }
    }
}
