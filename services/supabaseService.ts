
import { createClient } from '@supabase/supabase-js';
import { db } from './storageService';

export class SupabaseService {
    private static client: any = null;

    static async getClient() {
        if (this.client) return this.client;

        const settings = await db.getSettings();
        if (settings.supabaseUrl && settings.supabaseKey) {
            this.client = createClient(settings.supabaseUrl, settings.supabaseKey);
            return this.client;
        }
        return null;
    }

    static async syncAll() {
        const client = await this.getClient();
        if (!client) throw new Error("Supabase no está configurado.");

        const data = await db.getAllData();
        const results: any = {};

        // For simplicity in this first version, we'll do an 'upsert' of everything
        // Note: In a real production app, we'd handle conflicts and timestamps

        const tables = [
            { name: 'products', data: data.products },
            { name: 'categories', data: data.categories },
            { name: 'customers', data: data.customers },
            { name: 'sales', data: data.sales },
            { name: 'users', data: data.users },
            { name: 'branches', data: data.branches },
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
                const { error } = await client.from(table.name).upsert(table.data);
                results[table.name] = error ? `Error: ${error.message}` : 'Sincronizado';
            }
        }

        // Settings is a special case (single row)
        if (data.settings) {
            await client.from('settings').upsert({ id: 'main', ...data.settings });
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
            }
        }

        // Map back to Dexie names
        const dexieData = {
            products: pulledData.products,
            categories: pulledData.categories,
            customers: pulledData.customers,
            sales: pulledData.sales,
            users: pulledData.users,
            branches: pulledData.branches,
            credits: pulledData.credits,
            promotions: pulledData.promotions,
            suppliers: pulledData.suppliers,
            consumables: pulledData.consumables,
            quotes: pulledData.quotes,
            cash_cuts: pulledData.cash_cuts,
            credit_notes: pulledData.credit_notes,
            expenses: pulledData.expenses,
            inventoryHistory: pulledData.inventory_history,
            priceHistory: pulledData.price_history,
            settings: pulledData.settings?.find((s: any) => s.id === 'main')
        };

        await db.restoreData(dexieData);
        return dexieData;
    }
}
