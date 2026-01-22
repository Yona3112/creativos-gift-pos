
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

    static async syncAll() {
        console.log("🔄 Iniciando sincronización con Supabase...");
        const client = await this.getClient();
        if (!client) {
            console.error("❌ Supabase no está configurado - no hay cliente");
            throw new Error("Supabase no está configurado.");
        }

        const data = await db.getAllData();
        console.log("📦 Datos locales obtenidos:", Object.keys(data));
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
            { name: 'fixed_expenses', data: data.fixedExpenses },
            { name: 'expenses', data: data.expenses },
            { name: 'inventory_history', data: data.inventoryHistory },
            { name: 'price_history', data: data.priceHistory }
        ];

        for (const table of tables) {
            if (table.data && table.data.length > 0) {
                console.log(`📤 Sincronizando ${table.name}: ${table.data.length} registros...`);

                // Handle tables with unique constraints specially
                let upsertOptions: any = {};
                if (table.name === 'users') {
                    // Users have unique email constraint, use onConflict to update by id
                    upsertOptions = { onConflict: 'id', ignoreDuplicates: true };
                }

                const { error, data: responseData } = await client.from(table.name).upsert(table.data, upsertOptions);
                if (error) {
                    console.error(`❌ Error en ${table.name}:`, error);
                    results[table.name] = `Error: ${error.message}`;
                } else {
                    console.log(`✅ ${table.name} sincronizado`);
                    results[table.name] = 'Sincronizado';
                }
            } else {
                console.log(`⏭️ ${table.name}: sin datos para sincronizar`);
            }
        }

        // Settings is a special case (single row)
        if (data.settings) {
            console.log("📤 Sincronizando settings...");

            // List of columns that we know exist in the cloud table
            // This prevents errors if local settings has new UI-only or transient properties
            const cloudColumns = [
                'id', 'name', 'rtn', 'address', 'phone', 'email', 'cai',
                'billingRangeStart', 'billingRangeEnd', 'billingDeadline',
                'currentInvoiceNumber', 'currentTicketNumber', 'currentProductCode', 'currentQuoteNumber',
                'printerSize', 'moneyPerPoint', 'pointValue', 'defaultCreditRate', 'defaultCreditTerm',
                'creditDueDateAlertDays', 'enableCreditAlerts', 'showFloatingWhatsapp', 'whatsappTemplate',
                'logo', 'themeColor', 'whatsappNumber', 'masterPassword', 'supabaseUrl', 'supabaseKey',
                'autoSync', 'lastBackupDate', 'logoObjectFit', 'thanksMessage', 'warrantyPolicy', 'returnPolicy',
                'barcodeWidth', 'barcodeHeight', 'showLogoOnBarcode', 'barcodeLogoSize', 'legalOwnerName', 'legalCity',
                'darkMode', 'enableBeep', 'currentSeason'
            ];

            const settingsToSync: any = { id: 'main' };
            cloudColumns.forEach(col => {
                if (data.settings[col] !== undefined) {
                    settingsToSync[col] = data.settings[col];
                }
            });

            const { error } = await client.from('settings').upsert(settingsToSync);
            if (error) {
                console.error("❌ Error en settings:", error);
                results['settings'] = `Error: ${error.message}`;
            } else {
                console.log("✅ settings sincronizado");
                results['settings'] = 'Sincronizado';
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
            'expenses', 'inventory_history', 'price_history', 'settings', 'fixed_expenses'
        ];

        const pulledData: any = {};

        for (const table of tables) {
            const { data, error } = await client.from(table).select('*');
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
            fixedExpenses: pulledData.fixed_expenses || [],
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
            return dexieData;
        }

        return null;
    }
}
