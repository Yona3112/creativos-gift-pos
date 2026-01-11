
import { createClient } from '@supabase/supabase-js';
import { db } from './storageService';

export class SupabaseService {
    private static client: any = null;

    static async getClient() {
        if (this.client) return this.client;

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

    static async syncAll() {
        const client = await this.getClient();
        if (!client) throw new Error("Supabase no está configurado.");

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
                // Ensure data is clean for Supabase (remove or rename fields if necessary)
                // For now, we assume the schema matches the local data
                const { error } = await client.from(table.name).upsert(table.data);
                if (error) {
                    console.error(`Error sincronizando tabla ${table.name}:`, error);
                    results[table.name] = `Error: ${error.message}`;
                } else {
                    results[table.name] = 'Sincronizado';
                }
            }
        }

        // Settings is a special case (single row)
        if (data.settings) {
            const { error } = await client.from('settings').upsert({ id: 'main', ...data.settings });
            results['settings'] = error ? `Error: ${error.message}` : 'Sincronizado';
        }

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
            settings: pulledData.settings?.find((s: any) => s.id === 'main')
        };

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
