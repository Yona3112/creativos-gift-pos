import { createClient } from '@supabase/supabase-js';
import { db, db_engine } from './storageService';
import { logger } from './logger';

export class SupabaseService {
    private static client: any = null;

    /**
     * Helper for robust requests with exponential backoff
     */
    static async requestWithRetry<T>(operation: () => Promise<any>, tableName: string, maxRetries = 5): Promise<T | null> {
        let lastError: any = null;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await operation();
                const { data, error, status } = response;

                if (error) {
                    console.error(`🚨 [${tableName}] Error de Supabase (Status ${status}):`, {
                        message: error.message,
                        code: error.code,
                        details: error.details,
                        hint: error.hint
                    });

                    // Errores de Timeout o saturación (Reintentables)
                    if (error.code === 'PGRST002' || status === 503 || status === 502 || error.message?.includes('timeout') || error.code === '57014') {
                        const delay = Math.pow(2, attempt) * 1500 + (Math.random() * 1000);
                        logger.warn(`🔄 [${tableName}] Reintentando en ${Math.round(delay)}ms (Intento ${attempt + 1}/${maxRetries})...`);
                        await new Promise(r => setTimeout(r, delay));
                        lastError = error;
                        continue;
                    }

                    // --- NON-RETRYABLE: UNIQUE CONSTRAINT CONFLICT ---
                    if (status === 409 || error.code === '23505') {
                        throw { status, code: error.code, message: error.message, isConflict: true };
                    }

                    throw error;
                }

                return data !== null && data !== undefined ? data : ([] as unknown as T);
            } catch (err: any) {
                lastError = err;

                // If it's a conflict, don't retry! Throw it out of the loop immediately.
                const isConflict = err.isConflict ||
                    err.status === 409 ||
                    err.status === '409' ||
                    err.code === '23505' ||
                    (err.message && err.message.includes('unique constraint'));

                if (isConflict) {
                    logger.log(`🛡️ [${tableName}] Conflicto detectado en catch. Deteniendo intentos.`);
                    throw { ...err, isConflict: true };
                }

                console.error(`⚠️ [${tableName}] Excepción en intento ${attempt + 1}:`, err.message || err);
                if (attempt === maxRetries - 1) break;
                const delay = Math.pow(2, attempt) * 2000;
                await new Promise(r => setTimeout(r, delay));
            }
        }
        console.error(`❌ [${tableName}] Falló definitivamente tras ${maxRetries} reintentos:`, lastError);
        return null; // Return null to signal hard failure
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
            order_tracking: [
                'id', 'sale_id', 'status', 'user_id', 'details', 'created_at'
            ],
            price_history: [
                'id', 'productId', 'date', 'oldPrice', 'newPrice', 'oldCost',
                'newCost', 'userId', 'updatedAt'
            ]
        };

        // Mapper to translate Dexie table names to Supabase cloud table names
        const cloudName = this.getCloudTableName(tableName);
        const allowedColumns = TABLE_SCHEMAS[cloudName];
        const cleaned: any = {};

        if (allowedColumns) {
            // Saneamiento por Lista Blanca
            allowedColumns.forEach(col => {
                if (record[col] !== undefined) {
                    cleaned[col] = record[col];
                }
            });

            // OPTIMIZACIÓN: Remover Base64 pesados de ShippingDetails para evitar saturación de la tabla sales
            // Estos ya se guardan por separado en 'sale_attachments'
            if (tableName === 'sales' && cleaned.shippingDetails) {
                try {
                    const sd = { ...cleaned.shippingDetails };
                    if (sd.guideFile) delete sd.guideFile;
                    if (sd.productionImages) delete sd.productionImages;
                    cleaned.shippingDetails = sd;
                } catch (e) {
                    logger.warn("⚠️ Falló limpieza de shippingDetails:", e);
                }
            }
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

    private static async batchUpsert(client: any, tableName: string, records: any[], chunkSize = 50): Promise<boolean> {
        // OPTIMIZACIÓN CRÍTICA: Lotes pequeños para ventas para evitar Timeouts
        const effectiveChunkSize = tableName === 'sales' ? 10 : chunkSize;

        for (let i = 0; i < records.length; i += effectiveChunkSize) {
            try {
                const chunk = records.slice(i, i + effectiveChunkSize);

                // Saneamiento Estricto Centralizado
                const sanitizedChunk = chunk.map(record => this.sanitizeRecord(tableName, record));

                logger.log(`📦 [${tableName}] Enviando lote ${Math.floor(i / chunkSize) + 1} (${chunk.length} registros)...`);

                await this.requestWithRetry<any>(
                    () => client.from(this.getCloudTableName(tableName)).upsert(sanitizedChunk),
                    tableName
                );

                if (i + effectiveChunkSize < records.length) {
                    await new Promise(r => setTimeout(r, 300));
                }
            } catch (err: any) {
                // Handle batch conflict (extremely rare with individual upserts but possible in future)
                if (err.isConflict || err.status === 409 || err.code === '23505') {
                    logger.warn(`⚠️ [${tableName}] Lote contiene conflictos. Saltando para permitir avance.`);
                    continue;
                }
                console.error(`❌ [${tableName}] Lote fallido permanentemente. Deteniendo sincronización de esta tabla.`);
                return false;
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
                this.client = createClient(envUrl, envKey, {
                    realtime: {
                        params: {
                            eventsPerSecond: 10
                        }
                    },
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true
                    }
                });
                logger.log('✅ [Supabase] Cliente creado con soporte Realtime');
                return this.client;
            } catch (e) {
                console.error("Error al crear cliente Supabase desde env:", e);
            }
        }

        // Priority 2: Settings from local database (for local development)
        const settings = await db.getSettings();
        if (settings.supabaseUrl && settings.supabaseKey) {
            try {
                this.client = createClient(settings.supabaseUrl, settings.supabaseKey, {
                    realtime: {
                        params: {
                            eventsPerSecond: 10
                        }
                    },
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true
                    }
                });
                logger.log('✅ [Supabase] Cliente creado desde settings con soporte Realtime');
                return this.client;
            } catch (e) {
                console.error("Error al crear cliente Supabase:", e);
                return null;
            }
        }
        return null;
    }

    /**
     * Helper to translate Dexie table names to Supabase snake_case names
     */
    static getCloudTableName(tableName: string): string {
        const mapping: Record<string, string> = {
            'sales': 'sales',
            'products': 'products',
            'customers': 'customers',
            'categories': 'categories',
            'branches': 'branches',
            'users': 'users',
            'credits': 'credits',
            'promotions': 'promotions',
            'suppliers': 'suppliers',
            'consumables': 'consumables',
            'quotes': 'quotes',
            'cashCuts': 'cash_cuts',
            'creditNotes': 'credit_notes',
            'expenses': 'expenses',
            'inventoryHistory': 'inventory_history',
            'priceHistory': 'price_history',
            'orderTracking': 'order_tracking',
            'settings': 'settings'
        };
        return mapping[tableName] || tableName;
    }

    /**
     * Push a single record to Supabase immediately
     */
    static async pushRecord(tableName: string, record: any): Promise<boolean> {
        try {
            const client = await this.getClient();
            if (!client) return false;

            const cloudTable = this.getCloudTableName(tableName);
            const sanitized = this.sanitizeRecord(tableName, record);
            const { error, status } = await client
                .from(cloudTable)
                .upsert(sanitized);

            if (error) {
                console.error(`❌ [Push] Error enviando a ${cloudTable} (Status ${status}):`, error.message);

                // If conflict, throw it so SyncQueueService can catch it and decide to discard
                if (status === 409 || error.code === '23505') {
                    throw { status, code: error.code, message: error.message };
                }
                return false;
            }

            logger.log(`📡 [Push] ${cloudTable} synced: ${record.id || record.folio || 'Record'}`);
            return true;
        } catch (err: any) {
            // Re-throw if it's a structural conflict we should handle
            if (err.status === 409 || err.code === '23505') throw err;

            logger.warn(`⚠️ [Push] Fallo crítico en ${tableName}:`, err);
            return false;
        }
    }

    static async testConnection() {
        const client = await this.getClient();
        if (!client) throw new Error("Supabase no está configurado (URL o Key faltante).");

        const { data, error } = await client.from('settings').select('id').limit(1);
        if (error) throw new Error(`Error de conexión: ${error.message}`);
        return true;
    }

    /**
     * Get record counts for critical tables to verify sync status on startup
     */
    static async getRemoteCounts(): Promise<Record<string, number>> {
        const client = await this.getClient();
        if (!client) return {};

        const tables = ['sales', 'products', 'customers', 'expenses', 'quotes', 'cash_cuts'];
        const counts: Record<string, number> = {};

        for (const table of tables) {
            try {
                // Use head: true for light-weight count-only request
                const { count, error } = await client
                    .from(table)
                    .select('*', { count: 'exact', head: true });

                if (!error) counts[table] = count || 0;
            } catch (e) {
                logger.warn(`⚠️ [Counts] Fallo al contar ${table}:`, e);
            }
        }
        return counts;
    }

    /**
     * Delete a record from a specific Supabase table
     */
    static async deleteFromTable(tableName: string, id: string) {
        const client = await this.getClient();
        if (!client) return;

        try {
            const cloudTable = this.getCloudTableName(tableName);
            const { error } = await client.from(cloudTable).delete().eq('id', id);
            if (error) {
                console.error(`❌ [Delete] Error eliminando en ${cloudTable}:`, error.message);
            } else {
                logger.log(`✅ Eliminado de ${cloudTable}: ${id}`);
            }
        } catch (e) {
            logger.warn(`⚠️ Error en deleteFromTable(${tableName}):`, e);
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

            logger.log(`🗑️ Eliminados ${records.length} registros de ${tableName} en Supabase`);
            return { success: true, count: records.length };
        } catch (e: any) {
            console.error(`❌ Error limpiando ${tableName}:`, e);
            throw new Error(`Error al limpiar ${tableName}: ${e.message}`);
        }
    }

    static async syncAll(forceFull: boolean = false) {
        logger.log(`🔄 Iniciando sincronización ${forceFull ? 'TOTAL' : 'INCREMENTAL'}...`);
        const client = await this.getClient();
        if (!client) {
            console.error("❌ Supabase no está configurado - no hay cliente");
            throw new Error("Supabase no está configurado.");
        }

        const settings = await db.getSettings();
        const lastPush = settings.lastCloudPush ? new Date(settings.lastCloudPush).getTime() : 0;
        const now = db.getLocalNowISO();

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

        let allTablesSuccess = true;
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
                    const lastPushDate = db.getLocalNowISO(new Date(safeLastPush)).substring(0, 10);
                    return itemDate >= lastPushDate;
                });

                if (recordsToSync.length === 0) {
                    logger.log(`⏭️ ${table.name}: sin cambios nuevos`);
                    results[table.name] = 'Sin cambios';
                    continue;
                }

                logger.log(`📤 Sincronizando ${table.name}: ${recordsToSync.length} registros...`);

                try {
                    // Small delay between tables to avoid overloading PostgREST
                    await new Promise(r => setTimeout(r, 100));

                    if (table.name === 'users') {
                        let successCount = 0;
                        for (const user of recordsToSync) {
                            try {
                                const sanitizedUser = this.sanitizeRecord('users', user);
                                await this.requestWithRetry<any>(
                                    // USAR EMAIL COMO ANCLA para evitar conflictos 409 si el ID local es diferente al de la nube
                                    // Esto asegura que si el email ya existe, se actualice la información en lugar de fallar.
                                    () => client.from('users').upsert(sanitizedUser, { onConflict: 'email' }),
                                    'users'
                                );
                                successCount++;
                            } catch (err: any) {
                                if (err.isConflict || err.status === 409 || err.code === '23505') {
                                    logger.log(`ℹ️ [users] Conclicto detectado para ${(user as any).email || 'id: ' + (user as any).id} (ya existe). Saltando.`);
                                    successCount++; // Count as success to allow sync to proceed
                                } else {
                                    allTablesSuccess = false;
                                }
                            }
                        }
                        results['users'] = `Incremental (${successCount}/${recordsToSync.length})`;
                        continue;
                    }

                    // Use batchUpsert for all other tables
                    const success = await this.batchUpsert(client, table.name, recordsToSync);

                    if (!success) {
                        results[table.name] = `Error: Falló tras reintentos o lotes excesivos`;
                        allTablesSuccess = false;
                    } else {
                        results[table.name] = 'OK';
                    }
                } catch (tableError: any) {
                    console.error(`❌ Fallo crítico en ${table.name}:`, tableError);
                    results[table.name] = `Fallo: ${tableError.message}`;
                    allTablesSuccess = false;
                }
            }
        }

        // Settings is a special case (single row)
        if (data.settings && allTablesSuccess) {
            const cloudColumns = [
                'id', 'name', 'rtn', 'address', 'phone', 'email', 'cai',
                'billingRangeStart', 'billingRangeEnd', 'billingDeadline',
                'currentInvoiceNumber', 'currentTicketNumber', 'currentProductCode', 'currentQuoteNumber',
                'printerSize', 'moneyPerPoint', 'pointValue', 'defaultCreditRate', 'defaultCreditTerm',
                'creditDueDateAlertDays', 'enableCreditAlerts', 'showFloatingWhatsapp', 'whatsappTemplate',
                'logo', 'themeColor', 'whatsappNumber', 'masterPassword', 'supabaseUrl', 'supabaseKey',
                'autoSync', 'lastBackupDate', 'lastCloudSync', 'lastCloudPush', 'logoObjectFit', 'thanksMessage', 'warrantyPolicy', 'returnPolicy',
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

        logger.log("🏁 Sincronización completa sin errores críticos:", results);
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
        const now = db.getLocalNowISO();

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
        logger.log("☁️ [pullAll] Settings from cloud:", {
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
        let lastSync = settings.lastCloudSync;

        // If no lastSync, use 7 days ago instead of pulling ALL data
        // This prevents timeout on first sync while still getting recent data
        if (!lastSync) {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            lastSync = db.getLocalNowISO(sevenDaysAgo);
            logger.log(`📥 PullDelta: Primera sincronización - usando últimos 7 días`);
        } else {
            logger.log(`📥 PullDelta: Usando marca de tiempo: ${lastSync}`);
        }

        // CLOCK DRIFT PROTECTION: Aumentado a 60 min (1 hora) para máxima robustez.
        // Esto previene que pedidos se queden "perdidos" por desincronización de reloj.
        const lastSyncDate = new Date(lastSync);
        const driftedSync = db.getLocalNowISO(new Date(lastSyncDate.getTime() - (60 * 60 * 1000)));

        const now = await db.getLocalNowISO(); // Use unified timestamp
        const tables = [
            'settings', 'cash_cuts', 'branches', 'categories', 'users',
            'products', 'customers', 'sales', 'credits', 'promotions',
            'suppliers', 'consumables', 'quotes', 'credit_notes', 'expenses'
        ];

        let totalChanges = 0;
        const results: any = {};

        for (const table of tables) {
            try {
                // Stagger requests
                await new Promise(r => setTimeout(r, 150));

                // OPTIMIZACIÓN: Si es la tabla de productos o ventas, no traer columnas pesadas si no es necesario
                // Para ventas, traemos todo por ahora pero limitado en filas, 
                // pero podrías excluir 'fulfillmentHistory' si fuera muy grande.
                const columns = table === 'products'
                    ? 'id, code, name, description, price, cost, stock, minStock, enableLowStockAlert, categoryId, providerId, active, isTaxable, updatedAt'
                    : '*';

                // OPTIMIZACIÓN: Aumentar límite de ventas para capturar todas las ventas recientes
                // 200 ventas debería cubrir todas las ventas de los últimos 7 días típicos
                const limitRows = table === 'sales' ? 200 : 100;

                const data = await this.requestWithRetry<any[]>(
                    () => client.from(table).select(columns).gte('updatedAt', driftedSync).limit(limitRows),
                    table
                );

                // Si aún así falla la tabla de ventas por timeout, intentamos con solo 50 (último recurso)
                if (data === null && table === 'sales') {
                    logger.warn("⚠️ Reintentando ventas con límite reducido (50 registros)...");
                    const reducedData = await this.requestWithRetry<any[]>(
                        () => client.from(table).select(columns).gte('updatedAt', driftedSync).limit(50),
                        table
                    );
                    if (reducedData) {
                        results[table] = reducedData;
                        totalChanges += reducedData.length;
                    }
                    continue;
                }

                if (data && data.length > 0) {
                    results[table] = data;
                    totalChanges += data.length;
                    logger.log(`📥 ${table}: ${data.length} cambios detectados desde ${driftedSync}`);
                } else if (data === null) {
                    // Si la tabla falló permanentemente (null), salimos del loop para no saturar más el gateway
                    logger.warn(`🛑 [pullDelta] Abortando sincronización parcial por saturación en tabla ${table}`);
                    break;
                }
            } catch (err) {
                logger.warn(`⚠️ Excepción en pullDelta para tabla ${table}:`, err);
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
            { cloud: 'order_tracking', dexie: 'orderTracking' },
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
                        const cloudData = JSON.parse(JSON.stringify(item));
                        cloudData.id = 'main'; // FORCE ID main for app consistency

                        if (local) {
                            // Only update non-sync fields from cloud
                            delete cloudData.lastCloudSync;
                            delete cloudData.lastCloudPush;
                            delete cloudData.deviceId;

                            await table.update('main', cloudData);
                            logger.log("⚙️ [Settings] Ajustes actualizados desde nube (vía mergeDelta)");
                        } else {
                            await table.put(cloudData);
                            logger.log("⚙️ [Settings] Ajustes inicializados desde nube (vía mergeDelta)");
                        }
                        continue;
                    }

                    // Standard case: Smart Merge with updatedAt check
                    const id = item.id;
                    const existing = id ? await table.get(id) : null;

                    // Saneamiento estricto centralizado al recibir de la nube
                    const sanitizedItem = this.sanitizeRecord(map.dexie, item);

                    // CRITICAL: Field-level protection for sales financial data
                    // Prevents balance regression from multi-device conflicts (last-writer-wins)
                    // Scenario: Device A pays order (balance=0), Device B updates status (pushes old balance>0)
                    if (map.dexie === 'sales' && existing) {
                        const localPaid = (existing.balance === 0 || existing.balance === null) && existing.balancePaymentDate;
                        const cloudUnpaid = sanitizedItem.balance && sanitizedItem.balance > 0;

                        if (localPaid && cloudUnpaid) {
                            // Local says PAID, cloud says UNPAID → protect local financial fields
                            sanitizedItem.balance = 0;
                            sanitizedItem.deposit = existing.deposit;
                            sanitizedItem.isOrder = existing.isOrder;
                            sanitizedItem.balancePaid = existing.balancePaid;
                            sanitizedItem.balancePaymentDate = existing.balancePaymentDate;
                            sanitizedItem.balancePaymentMethod = existing.balancePaymentMethod;
                            sanitizedItem.paymentDetails = existing.paymentDetails;
                            logger.log(`🛡️ [sales] Protegido balance=0 para ${existing.folio} (cloud quería revertir a balance=${item.balance})`);
                        }
                    }

                    if (existing) {
                        const remoteU = sanitizedItem.updatedAt ? new Date(sanitizedItem.updatedAt).getTime() : 0;
                        const localU = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;

                        // Conflict Resolution Strategy:
                        // 1. If local is "clean" (already synced), ALWAYS accept cloud update (it's the new truth).
                        // 2. If local is "dirty" (unsynced changes), only accept if cloud is strictly newer.
                        const isLocalClean = existing._synced !== false;

                        if (isLocalClean || remoteU > localU) {
                            sanitizedItem._synced = true;
                            // Use put() to ensure we fully match the cloud state (replacing local structure)
                            await table.put(sanitizedItem);

                            if (map.dexie === 'sales') {
                                logger.log(`✅ [sales] Actualizado desde nube: ${sanitizedItem.folio || sanitizedItem.id} (${sanitizedItem.fulfillmentStatus})`);
                            }
                        } else {
                            logger.log(`🔒 [${map.dexie}] Conflicto: Se conserva cambio local (unsynced) de ${existing.id}`);
                        }
                    } else {
                        sanitizedItem._synced = true;
                        await table.put(sanitizedItem);
                        if (map.dexie === 'sales') {
                            logger.log(`🆕 [sales] Nuevo desde nube: ${sanitizedItem.folio || sanitizedItem.id} → ${sanitizedItem.fulfillmentStatus || 'N/A'}`);
                        }
                    }
                }
            }
        }
    }
}
