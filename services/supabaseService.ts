import { createClient } from '@supabase/supabase-js';
import { db, db_engine } from './storageService';

export class SupabaseService {
    private static client: any = null;

    /**
     * Helper for robust requests with exponential backoff
     */
    static async requestWithRetry<T>(operation: () => Promise<any>, tableName: string, maxRetries = 5): Promise<T | null> {
        let lastError: any = null;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const { data, error, status, statusText } = await operation();

                if (error) {
                    // DIAGNÓSTICO PARA ERROR 500: Extraer detalles si están disponibles
                    if (status === 500) {
                        console.error(`🚨 [${tableName}] INTERNAL SERVER ERROR (500):`, {
                            message: error.message,
                            details: error.details,
                            hint: error.hint,
                            code: error.code,
                            statusText
                        });
                    }

                    // PGRST002: Service Unavailable / Database starting up
                    // 503/502: Gateway timeout or Load balancer issues
                    if (error.code === 'PGRST002' || status === 503 || status === 502 || error.message?.includes('timeout')) {
                        const delay = Math.pow(2, attempt) * 1500 + (Math.random() * 1000);
                        console.warn(`🔄 [${tableName}] Supabase ocupado (status ${status}). Reintentando en ${Math.round(delay)}ms...`);
                        await new Promise(r => setTimeout(r, delay));
                        lastError = error;
                        continue;
                    }
                    throw error;
                }
                return data;
            } catch (err: any) {
                lastError = err;
                if (attempt === maxRetries - 1) break;
                const delay = Math.pow(2, attempt) * 2000;
                await new Promise(r => setTimeout(r, delay));
            }
        }
        console.error(`❌ [${tableName}] Falló tras reintentos:`, lastError);
        return null;
    }

    /**
     * Saneamiento Estricto Centralizado: Solo enviar columnas que existen en el esquema de Supabase.
     */
    private static sanitizeRecord(tableName: string, record: any): any {
        // ESQUEMAS DE COLUMNAS PERMITIDAS (White-List) por tabla
        // Esto previene enviar columnas que no existen en Supabase.
        const TABLE_SCHEMAS: Record<string, string[]> = {
            sales: [
                'id', 'folio', 'date', 'items', 'subtotal', 'taxAmount', 'discount',
                'total', 'paymentMethod', 'paymentDetails', 'customerId', 'customerName',
                'userId', 'branchId', 'status', 'cai', 'documentType', 'pointsUsed',
                'pointsMonetaryValue', 'fulfillmentStatus', 'shippingDetails',
                'originalQuoteId', 'isOrder', 'deposit', 'balance', 'updatedAt',
                'createdAt', 'fulfillmentHistory', 'balancePaymentDate',
                'balancePaymentMethod', 'balancePaid'
            ],
            products: [
                'id', 'code', 'name', 'description', 'price', 'cost', 'stock',
                'minStock', 'enableLowStockAlert', 'categoryId', 'providerId',
                'image', 'active', 'isTaxable', 'updatedAt'
            ],
            customers: [
                'id', 'type', 'name', 'legalRepresentative', 'phone', 'rtn', 'dni',
                'email', 'address', 'birthDate', 'points', 'totalSpent', 'level',
                'active', 'updatedAt'
            ],
            quotes: [
                'id', 'folio', 'date', 'items', 'subtotal', 'taxAmount', 'discount',
                'total', 'customerId', 'userId', 'branchId', 'expirationDate',
                'status', 'updatedAt'
            ],
            categories: ['id', 'name', 'color', 'icon', 'defaultMinStock', 'active', 'updatedAt'],
            branches: ['id', 'name', 'address', 'phone', 'manager', 'active', 'updatedAt'],
            users: ['id', 'name', 'email', 'password', 'role', 'branchId', 'active', 'updatedAt'],
            credits: [
                'id', 'customerId', 'saleId', 'principal', 'totalAmount', 'paidAmount',
                'status', 'dueDate', 'createdAt', 'payments', 'interestRate',
                'termMonths', 'monthlyPayment', 'updatedAt'
            ],
            expenses: [
                'id', 'date', 'description', 'amount', 'categoryId', 'paymentMethod',
                'userId', 'branchId', 'updatedAt'
            ],
            inventory_history: [
                'id', 'productId', 'date', 'type', 'quantity', 'previousStock',
                'newStock', 'reason', 'userId', 'referenceId', 'updatedAt'
            ],
            promotions: [
                'id', 'name', 'type', 'value', 'startDate', 'endDate', 'active',
                'productIds', 'categoryIds', 'updatedAt'
            ],
            suppliers: [
                'id', 'companyName', 'contactName', 'email', 'phone', 'rtn',
                'address', 'active', 'updatedAt'
            ],
            consumables: [
                'id', 'name', 'stock', 'minStock', 'category', 'cost', 'unit',
                'active', 'updatedAt'
            ],
            cash_cuts: [
                'id', 'date', 'userId', 'branchId', 'totalSales', 'cashExpected',
                'cashCounted', 'difference', 'details', 'updatedAt'
            ],
            credit_notes: [
                'id', 'folio', 'saleId', 'customerId', 'originalTotal',
                'remainingAmount', 'reason', 'date', 'status', 'updatedAt'
            ],
            price_history: [
                'id', 'productId', 'date', 'oldPrice', 'newPrice', 'oldCost',
                'newCost', 'userId', 'updatedAt'
            ]
        };

        const allowedColumns = TABLE_SCHEMAS[tableName];
        const cleaned: any = {};

        if (allowedColumns) {
            // Saneamiento por Lista Blanca
            allowedColumns.forEach(col => {
                if (record[col] !== undefined) {
                    cleaned[col] = record[col];
                }
            });
        } else {
            // Saneamiento Genérico por Lista Negra para tablas no configuradas
            Object.assign(cleaned, record);
            delete cleaned.lastCloudSync;
            delete cleaned.lastCloudPush;
            delete cleaned.deviceId;
            delete cleaned.id_old; // Si existiera
        }

        // Correcciones de tipo para columnas JSONB que no pueden ser null en esquemas estrictos
        if (cleaned.items === null || cleaned.items === undefined) {
            if (tableName === 'sales' || tableName === 'quotes') cleaned.items = [];
        }
        if (cleaned.payments === null || cleaned.payments === undefined) {
            if (tableName === 'credits') cleaned.payments = [];
        }

        return cleaned;
    }

    /**
     * Batch upsert to avoid compute limits/timeouts
     */
    private static async batchUpsert(client: any, tableName: string, records: any[], chunkSize = 50): Promise<boolean> {
        for (let i = 0; i < records.length; i += chunkSize) {
            const chunk = records.slice(i, i + chunkSize);

            // Saneamiento Estricto Centralizado
            const sanitizedChunk = chunk.map(record => this.sanitizeRecord(tableName, record));

            console.log(`📦 [${tableName}] Enviando lote ${Math.floor(i / chunkSize) + 1} (${chunk.length} registros)...`);

            const res = await this.requestWithRetry<any>(
                () => client.from(tableName).upsert(sanitizedChunk),
                tableName
            );

            if (res === null) return false;

            if (i + chunkSize < records.length) {
                await new Promise(r => setTimeout(r, 300));
            }
        }
        return true;
    }

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
        const lastPush = settings.lastCloudPush ? new Date(settings.lastCloudPush).getTime() : 0;
        const now = await db.getLocalNowISO();

        // SAFE PUSH DRIFT: Aumentado a 10 MINUTOS para garantizar que si un teléfono 
        // tiene el reloj levemente desincronizado, sus cambios siempre se suban.
        const safeLastPush = Math.max(0, lastPush - (10 * 60 * 1000));

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
                    // Always prefer updatedAt (has precision)
                    if (item.updatedAt) {
                        return new Date(item.updatedAt).getTime() > safeLastPush;
                    }
                    // Fallback to business date if updatedAt is missing
                    // We extract just the date part to avoid ISO/Timezone issues
                    const itemDate = item.date ? item.date.substring(0, 10) : '';
                    const lastPushDate = new Date(safeLastPush).toISOString().substring(0, 10);
                    return itemDate >= lastPushDate;
                });

                if (recordsToSync.length === 0) {
                    console.log(`⏭️ ${table.name}: sin cambios nuevos`);
                    results[table.name] = 'Sin cambios';
                    continue;
                }

                console.log(`📤 Sincronizando ${table.name}: ${recordsToSync.length} registros...`);

                try {
                    // Small delay between tables to avoid overloading PostgREST
                    await new Promise(r => setTimeout(r, 100));

                    if (table.name === 'users') {
                        let successCount = 0;
                        for (const user of recordsToSync) {
                            const sanitizedUser = this.sanitizeRecord('users', user);
                            const res = await this.requestWithRetry<any>(
                                () => client.from('users').upsert(sanitizedUser, { onConflict: 'id' }),
                                'users'
                            );
                            if (res !== null) successCount++;
                        }
                        results['users'] = `Incremental (${successCount}/${recordsToSync.length})`;
                        continue;
                    }

                    // Use batchUpsert for all other tables
                    const success = await this.batchUpsert(client, table.name, recordsToSync);

                    if (!success) {
                        results[table.name] = `Error: Falló tras reintentos o lotes excesivos`;
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
                'darkMode', 'enableBeep', 'currentSeason', 'updatedAt', 'deviceId'
            ];

            const settingsToSync: any = { id: 'main' };
            cloudColumns.forEach(col => {
                if (data.settings[col] !== undefined) {
                    settingsToSync[col] = data.settings[col];
                }
            });

            // Update local and cloud last push time (and sync time if full)
            settingsToSync.lastCloudPush = now;
            if (forceFull) settingsToSync.lastCloudSync = now;

            const { error: settingsError } = await client.from('settings').upsert(settingsToSync);
            if (!settingsError) {
                await db.saveSettings({ ...data.settings, lastCloudPush: now, lastCloudSync: forceFull ? now : data.settings.lastCloudSync });
                results['settings'] = 'OK';
            } else {
                console.error("❌ Error sincronizando ajustes (Settings):", settingsError);
                results['settings'] = `Error: ${settingsError.message}`;
            }
        }

        // Summarize errors
        const failedTables = Object.entries(results)
            .filter(([_, status]) => typeof status === 'string' && status.startsWith('Error:'))
            .map(([name, status]) => `${name} (${status})`);

        if (failedTables.length > 0) {
            const isMissingColumn = failedTables.some(e => e.includes('column') || e.includes('no existe la columna'));
            let errorMsg = `Error en tablas: ${failedTables.join(', ')}`;
            if (isMissingColumn) {
                errorMsg += "\n\n💡 TIP: Parece que faltan columnas en Supabase. Por favor, ejecuta el script SQL que te envié en el editor de Supabase.";
            }
            throw new Error(errorMsg);
        }

        console.log("🏁 Sincronización completa sin errores críticos:", results);
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
        cutoff.setDate(cutoff.getDate() - 90);
        const cutoffDateOnly = cutoff.toISOString().split('T')[0];

        for (const table of tables) {
            // Small staggering delay to prevent simultaneous queries
            await new Promise(r => setTimeout(r, 200));

            const data = await this.requestWithRetry<any[]>(async () => {
                let query = client.from(table).select('*');
                if (largeTables.includes(table)) {
                    query = query.gte('date', cutoffDateOnly).order('date', { ascending: false }).limit(200);
                }
                return await query;
            }, table);

            if (data) {
                pulledData[table] = data;
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
            // Update both timestamps after full pull
            const currentSett = await db.getSettings();
            await db.saveSettings({ ...currentSett, lastCloudSync: now, lastCloudPush: now });
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
        if (!lastSync) return this.pullAll();
        console.log(`📥 PullDelta: Usando marca de tiempo PULL dedicada: ${lastSync}`);

        // CLOCK DRIFT PROTECTION: Aumentado a 60 min (1 hora) para máxima robustez.
        // Esto previene que pedidos se queden "perdidos" por desincronización de reloj.
        const lastSyncDate = new Date(lastSync);
        const driftedSync = new Date(lastSyncDate.getTime() - (60 * 60 * 1000)).toISOString();

        const now = await db.getLocalNowISO(); // Use unified timestamp
        const tables = [
            'products', 'categories', 'customers', 'sales', 'users',
            'branches', 'credits', 'promotions', 'suppliers',
            'consumables', 'quotes', 'cash_cuts', 'credit_notes',
            'expenses', 'settings'
            // OPTIMIZACIÓN: Excluimos history del polling rápido porque es pesado y no crítico para ventas
        ];

        let totalChanges = 0;
        const results: any = {};

        for (const table of tables) {
            try {
                // Stagger requests
                await new Promise(r => setTimeout(r, 150));

                // OPTIMIZACIÓN: Si es la tabla de productos, no traer la columna 'image' (Base64) en el polling rápido
                const columns = table === 'products'
                    ? 'id, code, name, description, price, cost, stock, minStock, enableLowStockAlert, categoryId, providerId, active, isTaxable, updatedAt'
                    : '*';

                // OPTIMIZACIÓN EXTREMA: Si es la tabla de ventas, pedir lotes muy pequeños
                const limitRows = table === 'sales' ? 20 : 50;

                const data = await this.requestWithRetry<any[]>(
                    () => client.from(table).select(columns).gte('updatedAt', driftedSync).limit(limitRows),
                    table
                );

                // Si aún así falla la tabla de ventas por timeout, intentamos con solo 5 (último recurso)
                if (data === null && table === 'sales') {
                    console.warn("⚠️ Reintentando ventas con límite ultra-bajo (5 registros)...");
                    const ultraLowData = await this.requestWithRetry<any[]>(
                        () => client.from(table).select(columns).gte('updatedAt', driftedSync).limit(5),
                        table
                    );
                    if (ultraLowData) {
                        results[table] = ultraLowData;
                        totalChanges += ultraLowData.length;
                    }
                    continue;
                }

                if (data && data.length > 0) {
                    results[table] = data;
                    totalChanges += data.length;
                    console.log(`📥 ${table}: ${data.length} cambios detectados desde ${driftedSync}`);
                }
            } catch (err) {
                console.warn(`⚠️ Excepción en pullDelta para tabla ${table}:`, err);
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
        // All tables now handled generically via bulkPut for architectural consistency
        const genericTables = [
            { cloud: 'sales', dexie: 'sales' },
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
            { cloud: 'cash_cuts', dexie: 'cashCuts' },
            { cloud: 'credit_notes', dexie: 'creditNotes' },
            { cloud: 'expenses', dexie: 'expenses' },
            { cloud: 'inventory_history', dexie: 'inventoryHistory' },
            { cloud: 'price_history', dexie: 'priceHistory' },
            { cloud: 'settings', dexie: 'settings' }
        ];

        for (const map of genericTables) {
            const data = delta[map.cloud];
            if (data && data.length > 0) {
                for (const item of data) {
                    const table = (db_engine as any)[map.dexie];

                    // Special case: Settings (Isolate device-local metadata)
                    if (map.dexie === 'settings') {
                        const local = await table.get('main');
                        if (local) {
                            // Only update non-sync fields from cloud
                            const cloudData = JSON.parse(JSON.stringify(item));
                            delete cloudData.lastCloudSync;
                            delete cloudData.lastCloudPush;
                            delete cloudData.deviceId;
                            delete cloudData.id; // IMPORTANT: Never update primary key 'main'

                            await table.update('main', cloudData);
                        } else {
                            await table.put(item);
                        }
                        continue;
                    }

                    // Standard case: Smart Merge with updatedAt check
                    const id = item.id;
                    const existing = id ? await table.get(id) : null;

                    // Saneamiento estricto centralizado al recibir de la nube
                    const sanitizedItem = this.sanitizeRecord(map.dexie, item);

                    if (existing) {
                        const remoteU = sanitizedItem.updatedAt ? new Date(sanitizedItem.updatedAt).getTime() : 0;
                        const localU = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;

                        if (remoteU > localU) {
                            await table.update(id, sanitizedItem);
                            if (map.dexie === 'sales') {
                                console.log(`✅ [sales] Actualizado: ${sanitizedItem.folio || sanitizedItem.id} → ${sanitizedItem.fulfillmentStatus || 'N/A'}`);
                            }
                        }
                    } else {
                        await table.put(sanitizedItem);
                        if (map.dexie === 'sales') {
                            console.log(`🆕 [sales] Nuevo desde nube: ${sanitizedItem.folio || sanitizedItem.id} → ${sanitizedItem.fulfillmentStatus || 'N/A'}`);
                        }
                    }
                }
            }
        }
    }
}
