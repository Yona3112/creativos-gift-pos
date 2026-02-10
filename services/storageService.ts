
import { Dexie, Table } from 'dexie';
import {
  Product, Category, User, Sale, Customer, CompanySettings,
  Branch, CreditAccount, Promotion, Supplier, Consumable,
  CashCut, Quote, CreditNote, CreditPayment,
  Expense, InventoryMovement, MovementType, FulfillmentStatus, ShippingDetails, UserRole,
  PriceHistoryEntry, PaymentDetails, AuditLog, OrderTracking
} from '../types';
import { logger } from './logger';

// --- DATABASE CONFIGURATION (DEXIE) ---
class AppDatabase extends Dexie {
  products!: Table<Product>;
  categories!: Table<Category>;
  customers!: Table<Customer>;
  sales!: Table<Sale>;
  users!: Table<User>;
  settings!: Table<any>; // Single object
  branches!: Table<Branch>;
  credits!: Table<CreditAccount>;
  promotions!: Table<Promotion>;
  suppliers!: Table<Supplier>;
  consumables!: Table<Consumable>;
  quotes!: Table<Quote>;
  cashCuts!: Table<CashCut>;
  creditNotes!: Table<CreditNote>;
  expenses!: Table<Expense>;
  inventoryHistory!: Table<InventoryMovement>;
  priceHistory!: Table<PriceHistoryEntry>;
  auditLogs!: Table<AuditLog>;
  orderTracking!: Table<OrderTracking>;
  saleAttachments!: Table<{
    id: string;
    sale_id: string;
    file_type: string;
    file_name?: string;
    file_data: string;
    category: string;
    created_at: string;
    updatedAt?: string;
    _synced?: boolean;
  }>;
  syncQueue!: Table<{
    id?: number;
    tableName: string;
    action: 'INSERT' | 'UPDATE' | 'DELETE';
    payload: any;
    timestamp: string;
    attempts: number;
    lastError?: string;
  }>;

  constructor() {
    super('CreativosGiftDB');
    (this as any).version(5).stores({
      products: 'id, code, name, categoryId, active',
      categories: 'id, name',
      customers: 'id, name, phone, rtn, active',
      sales: 'id, folio, customerId, date, status',
      users: 'id, email, active',
      settings: 'id',
      branches: 'id, active',
      credits: 'id, customerId, saleId, status',
      promotions: 'id, active',
      suppliers: 'id',
      consumables: 'id',
      quotes: 'id, folio, status',
      cashCuts: 'id, date',
      creditNotes: 'id, folio, status',
      expenses: 'id, date, categoryId',
      inventoryHistory: '++id, productId, date, type',
      priceHistory: '++id, productId, date',
      auditLogs: 'id, date, userId, module, action',
      orderTracking: 'id, sale_id, created_at',
      saleAttachments: 'id, sale_id, category',
      syncQueue: '++id, tableName, timestamp'
    });
  }
}

export const db_engine = new AppDatabase();

export class StorageService {
  getLocalNowISO(date?: Date) {
    // Returns a full ISO string (YYYY-MM-DDTHH:mm:ss.sssZ) adjusted for Honduras time
    // but represented as if it were UTC to avoid automatic shifts by components
    const d = new Date((date || new Date()).toLocaleString("en-US", { timeZone: "America/Tegucigalpa" }));
    return d.toISOString();
  }

  getLocalTodayISO() {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Tegucigalpa" }));
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Interprets an ISO string stored in the DB as a local Honduras Date object.
   * This is necessary because we store 'shifted' times with a 'Z' marker.
   */
  getSystemDate(iso?: string) {
    if (!iso) return new Date();
    // Since we store shifted time + 'Z', we need to interpret it as UTC 
    // to get the correct numerical values that represent Honduras time.
    return new Date(iso);
  }

  /**
   * Returns the current time as a Date object in the system's shifted context.
   */
  getSystemNow() {
    return new Date(this.getLocalNowISO());
  }

  /**
   * Calculates real elapsed minutes between a stored ISO time and now.
   */
  getElapsedMinutes(iso: string) {
    const past = this.getSystemDate(iso).getTime();
    const now = this.getSystemNow().getTime();
    return Math.floor((now - past) / (1000 * 60));
  }

  // --- INITIALIZATION & MIGRATION ---
  async init() {
    const isMigrated = localStorage.getItem('dexie_migrated');
    if (!isMigrated) {
      logger.log("Iniciando migración de LocalStorage a IndexedDB...");
      await this.migrateFromLocalStorage();
      localStorage.setItem('dexie_migrated', 'true');
    }

    // Asegurar sucursal por defecto
    const branches = await db_engine.branches.toArray();
    if (branches.length === 0) {
      await db_engine.branches.add({
        id: 'main-branch',
        name: 'Sucursal Principal',
        address: 'Centro Ciudad',
        active: true
      });
    }

    // Asegurar usuario admin por defecto
    const users = await db_engine.users.toArray();
    if (users.length === 0) {
      await db_engine.users.add({
        id: 'admin-001',
        name: 'Administrador',
        email: 'admin@creativosgift.com',
        password: 'admin123',
        role: UserRole.ADMIN,
        branchId: 'main-branch',
        active: true
      });
    }

    // OPTIMIZATION: Cleanup in background, do NOT block startup
    // This process can be slow on mobile if there are thousands of sales
    this.cleanupSalesData().catch(e => logger.warn("Background cleanup failed:", e));
  }

  // Safe unique ID generator for mobile/insecure contexts
  generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'id-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
  }

  /**
   * Elimina las imágenes Base64 de las ventas antiguas en Dexie de forma eficiente.
   * Evita bloqueos de memoria y asegura que los datos locales sean ligeros.
   */
  private async cleanupSalesData() {
    try {
      // Usar modify() en lugar de toArray() para procesar registros uno a uno sin consumir RAM masiva
      await db_engine.sales.toCollection().modify((sale: any) => {
        let modified = false;
        if (sale.items && Array.isArray(sale.items)) {
          sale.items.forEach((item: any) => {
            if (item.image) {
              delete item.image;
              modified = true;
            }
          });
        }
        // Si no se modificó nada, retornar falso para no disparar escrituras innecesarias
        if (!modified) return false;
      });
      logger.log("✅ Auditoría de peso de ventas finalizada.");
    } catch (e) {
      logger.warn("⚠️ Error en cleanupSalesData (Optimizado):", e);
    }
  }

  private async migrateFromLocalStorage() {
    const keys = {
      products: 'products',
      categories: 'categories',
      customers: 'customers',
      sales: 'sales',
      users: 'users',
      branches: 'branches',
      credits: 'credits',
      promotions: 'promotions',
      suppliers: 'suppliers',
      consumables: 'consumables',
      quotes: 'quotes',
      cash_cuts: 'cash_cuts',
      credit_notes: 'credit_notes'
    };

    for (const [table, lsKey] of Object.entries(keys)) {
      const data = localStorage.getItem(lsKey);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            // @ts-ignore
            await db_engine[table === 'cash_cuts' ? 'cashCuts' : table === 'credit_notes' ? 'creditNotes' : table].bulkAdd(parsed);
          }
        } catch (e) { console.error(`Error migrando ${lsKey}`, e); }
      }
    }

    const settings = localStorage.getItem('settings');
    if (settings) {
      try {
        await db_engine.settings.put({ id: 'main', ...JSON.parse(settings) });
      } catch (e) { console.error("Error migrando settings", e); }
    }
  }

  async saveLog(module: string, action: string, details: string) {
    try {
      const activeUserStr = localStorage.getItem('active_user') || localStorage.getItem('creativos_gift_currentUser');
      const user = activeUserStr ? JSON.parse(activeUserStr) : null;

      const log: AuditLog = {
        id: crypto.randomUUID(),
        date: this.getLocalNowISO(),
        userId: user?.id || 'anonymous',
        branchId: user?.branchId || 'main',
        module,
        action,
        details,
        updatedAt: this.getLocalNowISO()
      };

      await db_engine.auditLogs.put(log);
      this.pushToCloud('audit_logs', log, 'INSERT');
    } catch (e) {
      logger.warn("Could not save audit log", e);
    }
  }

  // --- SETTINGS ---
  async getSettings(): Promise<CompanySettings> {
    const saved = await db_engine.settings.get('main');
    const defaults: CompanySettings = {
      name: 'Creativos Gift Shop',
      rtn: '00000000000000',
      address: 'Local Principal',
      phone: '9999-9999',
      email: 'contacto@creativosgift.com',
      cai: '000-000-000-000',
      billingRangeStart: '000-001-01-00000001',
      billingRangeEnd: '000-001-01-00001000',
      billingDeadline: new Date().toISOString().split('T')[0],
      currentInvoiceNumber: 1,
      currentTicketNumber: 1,
      currentProductCode: 1,
      currentQuoteNumber: 1,
      printerSize: '80mm',
      moneyPerPoint: 10,
      pointValue: 0.1,
      defaultCreditRate: 0,
      defaultCreditTerm: 1,
      showFloatingWhatsapp: true,
      whatsappTemplate: "👋 Hola *{CLIENT_NAME}*, me interesa hacer el siguiente pedido personalizado:\n\n{ITEMS_LIST}\n\n💰 *TOTAL: {TOTAL}*\n\n📍 Quedo pendiente de los detalles de personalización.",
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
      supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
      lastBackupDate: null,
      thanksMessage: '¡Gracias por su compra!',
      warrantyPolicy: 'Garantía por defectos de fábrica (30 días).',
      returnPolicy: 'No se aceptan devoluciones en productos personalizados.',
      barcodeWidth: 50,
      barcodeHeight: 25,
      showLogoOnBarcode: false,
      barcodeLogoSize: 10,
      legalOwnerName: '',
      legalCity: 'Tegucigalpa',
      themeColor: '#e62e8a',
      logo: 'https://i.imgur.com/K6mXQ0j.png', // New brand logo
      deviceId: undefined,
      lastCloudPush: null
    };

    if (saved && !saved.deviceId) {
      // Generate and save deviceId if missing in existing settings
      const deviceId = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const updated = { ...saved, deviceId };
      await db_engine.settings.put({ id: 'main', ...updated });
      return { ...defaults, ...updated };
    }

    if (!saved) {
      // For completely new settings, generate deviceId
      const deviceId = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      return { ...defaults, deviceId };
    }

    return { ...defaults, ...saved };
  }

  /**
   * Helper to push a record to Supabase immediately
   */
  /**
   * Helper to identify modified data that hasn't been synced yet.
   * This is useful for "Sync on Startup" verification.
   */
  async getUnsyncedCount(): Promise<number> {
    const settings = await this.getSettings();
    const lastPush = settings.lastCloudPush ? new Date(settings.lastCloudPush).getTime() : 0;
    const safeLastPush = Math.max(0, lastPush - (10 * 60 * 1000)); // 10 min drift

    const allData = await this.getAllData();
    let unsynced = 0;

    const tables = [
      allData.products, allData.customers, allData.sales,
      allData.categories, allData.users, allData.branches,
      allData.credits, allData.expenses, allData.quotes,
      allData.cash_cuts
    ];

    for (const table of tables) {
      if (table) {
        unsynced += table.filter((item: any) => {
          if (item.updatedAt) return new Date(item.updatedAt).getTime() > safeLastPush;
          if (item.date) return item.date.substring(0, 10) >= new Date(safeLastPush).toISOString().substring(0, 10);
          return false;
        }).length;
      }
    }
    return unsynced;
  }

  private async pushToCloud(tableName: string, record: any, action: 'INSERT' | 'UPDATE' | 'DELETE' = 'UPDATE') {
    try {
      // Clean internal flags before pushing to cloud
      const cleanRecord = { ...record };
      delete cleanRecord._synced;

      const { SyncQueueService } = await import('./syncQueueService');
      // Cast to any to bypass strict type checking for legacy table names
      await SyncQueueService.enqueue(tableName as any, action, cleanRecord as any);
    } catch (e) {
      logger.warn(`⚠️ [SyncQueue] Error al encolar en ${tableName}:`, e);
    }
  }



  async saveSettings(settings: CompanySettings) {
    settings.updatedAt = this.getLocalNowISO();
    await db_engine.settings.put({ id: 'main', ...settings });
    // Redundant immediate push removed to favor centralized sync
    // this.pushToCloud('settings', settings);
  }

  /**
   * Pull settings from Supabase and merge with local (newer wins)
   * This ensures that devices that were offline get the latest settings
   */
  async pullSettingsFromCloud(): Promise<CompanySettings | null> {
    try {
      const { SupabaseService } = await import('./supabaseService');
      const client = await SupabaseService.getClient();
      if (!client) {
        logger.log('☁️ [Settings] Sin conexión a Supabase, usando settings locales');
        return null;
      }

      const { data, error } = await client.from('settings').select('*').eq('id', 'main').single();

      if (error) {
        console.error('☁️ [Settings] Error al obtener settings de la nube:', error);
        return null;
      }

      if (!data) {
        logger.log('☁️ [Settings] No hay settings en la nube');
        return null;
      }

      const localSettings = await this.getSettings();
      const cloudUpdatedAt = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
      const localUpdatedAt = localSettings.updatedAt ? new Date(localSettings.updatedAt).getTime() : 0;

      logger.log(`☁️ [Settings] Comparando: Local=${new Date(localUpdatedAt).toISOString()} vs Cloud=${new Date(cloudUpdatedAt).toISOString()}`);

      if (cloudUpdatedAt > localUpdatedAt) {
        logger.log('☁️ [Settings] La nube tiene settings más recientes, actualizando local...');
        const mergedSettings = { ...localSettings, ...data, id: 'main' };
        await db_engine.settings.put(mergedSettings);
        logger.log(`✅ [Settings] Settings sincronizados: themeColor=${mergedSettings.themeColor}, darkMode=${mergedSettings.darkMode}`);
        return mergedSettings;
      } else {
        logger.log('☁️ [Settings] Local tiene settings más recientes o iguales');
        return localSettings;
      }
    } catch (e) {
      console.error('☁️ [Settings] Error en pullSettingsFromCloud:', e);
      return null;
    }
  }

  // --- SEQUENTIAL CODE GENERATORS WITH RECALCULATION ---

  // Recalculate next product code by scanning existing products
  private async recalculateNextProductCode(): Promise<number> {
    const products = await db_engine.products.toArray();
    const settings = await this.getSettings();

    let maxCode = settings.currentProductCode || 1;

    for (const product of products) {
      if (product.code?.toUpperCase().startsWith('PROD')) {
        const numStr = product.code.toUpperCase().replace('PROD', '').replace('-', '');
        const num = parseInt(numStr, 10);
        if (!isNaN(num) && num >= maxCode) {
          maxCode = num + 1;
        }
      }
    }

    return maxCode;
  }

  // Recalculate next ticket number by scanning existing sales
  private async recalculateNextTicketNumber(): Promise<number> {
    const sales = await db_engine.sales.toArray();
    const settings = await this.getSettings();

    let maxTicket = settings.currentTicketNumber || 1;

    for (const sale of sales) {
      if (sale.folio?.startsWith('T-')) {
        const numStr = sale.folio.replace('T-', '');
        const num = parseInt(numStr, 10);
        if (!isNaN(num) && num >= maxTicket) {
          maxTicket = num + 1;
        }
      }
    }

    return maxTicket;
  }

  async getNextProductCodeSequential(): Promise<string> {
    const nextNum = await this.recalculateNextProductCode();
    const settings = await this.getSettings();
    const code = `PROD${nextNum.toString().padStart(5, '0')}`;
    // Increment and save for next use
    settings.currentProductCode = nextNum + 1;
    await this.saveSettings(settings);
    return code;
  }

  async getNextQuoteNumber(): Promise<string> {
    const settings = await this.getSettings();
    const nextNum = (settings.currentQuoteNumber || 1);
    const folio = `COT-${nextNum.toString().padStart(6, '0')}`;
    // Increment and save for next use
    settings.currentQuoteNumber = nextNum + 1;
    await this.saveSettings(settings);
    return folio;
  }


  /**
   * Retrieves a single sale by ID.
   */
  async getSale(id: string): Promise<Sale | undefined> {
    return await db_engine.sales.get(id);
  }

  // --- PRODUCTS & KARDEX ---
  async getProducts(): Promise<Product[]> {
    const products = await db_engine.products.toArray();
    return products.filter(p => p.active === true);
  }

  async saveProduct(product: Product, userId: string = 'system') {
    if (!product.id) product.id = Date.now().toString();
    if (product.active === undefined) product.active = true;

    // Check for duplicate codes (excluding the product itself if editing)
    const duplicate = await db_engine.products
      .where('code')
      .equalsIgnoreCase(product.code)
      .first();

    if (duplicate && duplicate.id !== product.id && duplicate.active) {
      throw new Error(`DuplicateCode:${duplicate.name}`);
    }

    const existing = await db_engine.products.get(product.id);

    // Tracking de Stock
    if (existing && existing.stock !== product.stock) {
      await this.recordMovement({
        productId: product.id,
        type: 'ADJUSTMENT',
        quantity: product.stock - existing.stock,
        previousStock: existing.stock,
        newStock: product.stock,
        reason: 'Ajuste manual de inventario',
        userId
      });
    } else if (!existing) {
      await this.recordMovement({
        productId: product.id,
        type: 'PURCHASE',
        quantity: product.stock,
        previousStock: 0,
        newStock: product.stock,
        reason: 'Creación inicial de producto',
        userId
      });
    }

    // NEW: Tracking de Precio y Costo
    if (existing && (existing.price !== product.price || existing.cost !== product.cost)) {
      await db_engine.priceHistory.add({
        id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
        productId: product.id,
        oldPrice: existing.price,
        newPrice: product.price,
        oldCost: existing.cost,
        newCost: product.cost,
        date: this.getLocalNowISO(),
        userId
      });
      await this.saveLog('inventory', 'CHANGE_PRICE', `Precio de "${product.name}" cambiado de L${existing.price} a L${product.price}.`);
    }

    product.updatedAt = this.getLocalNowISO(); // Update timestamp
    product._synced = false;
    await db_engine.products.put(product);

    this.pushToCloud('products', product);
  }

  async deleteProduct(id: string) {
    const p = await db_engine.products.get(id);
    if (p) {
      p.active = false;
      p.updatedAt = this.getLocalNowISO();
      await db_engine.products.put(p);
      await this.saveLog('inventory', 'DELETE_PRODUCT', `Producto "${p.name}" (${p.code}) eliminado.`);
      // Redundant immediate push removed
      // this.pushToCloud('products', p);
    }
  }

  async updateStock(items: { id: string, quantity: number }[], type: MovementType, userId: string, refId?: string) {
    for (const item of items) {
      const p = await db_engine.products.get(item.id);
      if (p) {
        const prev = p.stock;
        p.stock -= item.quantity;
        // CRITICAL: Update the product's updatedAt timestamp so sync knows local is newer
        p.updatedAt = this.getLocalNowISO();
        await db_engine.products.put(p);
        await this.recordMovement({
          productId: item.id,
          type,
          quantity: -item.quantity,
          previousStock: prev,
          newStock: p.stock,
          reason: type === 'SALE' ? `Venta ${refId}` : 'Ajuste de inventario',
          userId,
          referenceId: refId
        });
      }
    }
  }

  private async recordMovement(move: Omit<InventoryMovement, 'id' | 'date'>) {
    await db_engine.inventoryHistory.add({
      ...move,
      id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
      date: this.getLocalNowISO(),
      updatedAt: this.getLocalNowISO()
    });
  }

  // Método público para guardar movimientos de inventario (usado por auditorías)
  async saveInventoryMovement(movement: InventoryMovement) {
    await db_engine.inventoryHistory.add(movement);
    // Redundant immediate push removed
    // this.pushToCloud('inventory_history', movement);
  }

  async getInventoryHistory(productId?: string): Promise<InventoryMovement[]> {
    if (productId) {
      return await db_engine.inventoryHistory.where('productId').equals(productId).reverse().sortBy('date');
    }
    return await db_engine.inventoryHistory.reverse().sortBy('date');
  }

  async getPriceHistory(productId?: string): Promise<PriceHistoryEntry[]> {
    if (productId) {
      return await db_engine.priceHistory.where('productId').equals(productId).reverse().sortBy('date');
    }
    return await db_engine.priceHistory.reverse().sortBy('date');
  }

  // --- CATEGORIES ---
  async getCategories(): Promise<Category[]> {
    const cats = await db_engine.categories.toArray();
    if (cats.length === 0) {
      const defaults: Category[] = [
        { id: 'general', name: 'General', color: '#6366F1', icon: 'tag', defaultMinStock: 5, active: true },
        { id: 'tazas', name: 'Tazas', color: '#F59E0B', icon: 'mug-hot', defaultMinStock: 10, active: true },
        { id: 'camisas', name: 'Camisas', color: '#10B981', icon: 'tshirt', defaultMinStock: 10, active: true },
        { id: 'manualidades', name: 'Manualidades', color: '#EC4899', icon: 'cut', defaultMinStock: 5, active: true }
      ];
      await db_engine.categories.bulkAdd(defaults);
      return defaults;
    }
    return cats.filter(c => c.active !== false);
  }

  async saveCategory(cat: Category) {
    if (!cat.id) cat.id = Date.now().toString();
    if (cat.active === undefined) cat.active = true;
    cat.updatedAt = this.getLocalNowISO();
    cat._synced = false;
    await db_engine.categories.put(cat);
    this.pushToCloud('categories', cat);
  }

  async deleteCategory(id: string) {
    const cat = await db_engine.categories.get(id);
    if (cat) {
      cat.active = false;
      cat.updatedAt = this.getLocalNowISO();
      await db_engine.categories.put(cat);
      this.pushToCloud('categories', cat);
    }
  }

  // --- CUSTOMER METHODS ---
  async getCustomers(): Promise<Customer[]> {
    const customers = await db_engine.customers.toArray();
    return customers.filter(c => c.active !== false);
  }
  async saveCustomer(c: Customer) {
    if (!c.id) c.id = Date.now().toString();
    if (c.active === undefined) c.active = true;

    // Auto-generate BP Code if missing
    if (!c.code) {
      // Use a timestamp suffix or random number for simplicity and uniqueness
      // Format: BP-YYYY-XXXX
      const year = new Date().getFullYear();
      const random = Math.floor(Math.random() * 9000) + 1000;
      c.code = `BP-${year}-${random}`;
    }

    c.updatedAt = this.getLocalNowISO();
    c._synced = false;
    await db_engine.customers.put(c);
    this.pushToCloud('customers', c);
  }
  async deleteCustomer(id: string) {
    const c = await db_engine.customers.get(id);
    if (c) {
      c.active = false;
      c.updatedAt = this.getLocalNowISO();
      await db_engine.customers.put(c);
      this.pushToCloud('customers', c);
    }
  }

  // --- SALES ---
  async getSales(): Promise<Sale[]> { return await db_engine.sales.toArray(); }

  // Insert a sale from cloud sync (without triggering autoSync back to cloud)
  async insertSaleFromCloud(sale: Sale): Promise<void> {
    await db_engine.sales.put(sale);
  }

  async createSale(data: Partial<Sale> & { creditData?: any }): Promise<Sale> {
    return await db_engine.transaction('rw', [db_engine.sales, db_engine.products, db_engine.inventoryHistory, db_engine.customers, db_engine.settings, db_engine.credits], async () => {
      const settings = await this.getSettings();
      let folio = '';
      if (data.documentType === 'FACTURA') {
        const nextNum = settings.currentInvoiceNumber;
        const startParts = settings.billingRangeStart.split('-');
        const endParts = settings.billingRangeEnd.split('-');
        const maxNum = parseInt(endParts[3]);

        // 1. Validar Rango
        if (nextNum > maxNum) {
          throw new Error(`Rango de facturación agotado (Max: ${maxNum}). Por favor solicite un nuevo rango en el SAR.`);
        }

        // 2. Validar Fecha Límite
        const deadlineDate = this.getSystemDate(settings.billingDeadline + 'T23:59:59Z');
        if (this.getSystemNow() > deadlineDate) {
          throw new Error(`La fecha límite de emisión de facturas ha expirado (${settings.billingDeadline}).`);
        }

        // 3. Validar CAI
        if (!settings.cai || settings.cai === '000-000-000-000') {
          throw new Error('Debe configurar un CAI válido en los ajustes antes de facturar.');
        }

        settings.currentInvoiceNumber++;
        folio = `${startParts[0]}-${startParts[1]}-${startParts[2]}-${nextNum.toString().padStart(8, '0')}`;
      } else {
        const nextNum = await this.recalculateNextTicketNumber();
        settings.currentTicketNumber = nextNum + 1;
        folio = `T-${nextNum.toString().padStart(6, '0')}`;
      }
      await this.saveSettings(settings);

      const newSale: Sale = {
        id: `sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        folio,
        date: this.getLocalNowISO(),
        items: (data.items || []).map(item => {
          const cleanedItem = { ...item };
          delete cleanedItem.image; // Eliminar imagen pesada para no duplicar en cada venta
          return cleanedItem;
        }),
        subtotal: data.subtotal || 0,
        taxAmount: data.taxAmount || 0,
        discount: data.discount || 0,
        total: data.total || 0,
        paymentMethod: data.paymentMethod || 'Efectivo',
        paymentDetails: data.paymentDetails,
        customerId: data.customerId,
        customerName: data.customerName,
        userId: data.userId || 'admin',
        branchId: data.branchId || 'main',
        status: 'active',
        cai: data.documentType === 'FACTURA' ? settings.cai : undefined,
        documentType: data.documentType,
        pointsUsed: data.pointsUsed,
        pointsMonetaryValue: data.pointsMonetaryValue,
        fulfillmentStatus: data.fulfillmentStatus || 'delivered',
        shippingDetails: data.shippingDetails ? {
          ...data.shippingDetails,
          guideFile: undefined, // Removed from main record
          productionImages: undefined // Removed from main record
        } : undefined,
        isOrder: data.isOrder,
        deliveryDate: data.deliveryDate,
        deposit: data.deposit,
        balance: data.balance,
        fulfillmentHistory: [{
          status: data.fulfillmentStatus || 'delivered',
          date: this.getLocalNowISO()
        }],
        createdAt: this.getLocalNowISO(),
        updatedAt: this.getLocalNowISO() // Set initial timestamp
      };

      await db_engine.sales.add(newSale);

      // --- OPTIMIZACIÓN: Guardar adjuntos pesados por separado ---
      if (data.shippingDetails) {
        if (data.shippingDetails.guideFile) {
          const attId = `att-guide-${newSale.id}`;
          const attachment = {
            id: attId,
            sale_id: newSale.id,
            file_type: data.shippingDetails.guideFileType || 'image',
            file_name: data.shippingDetails.guideFileName || 'guia.pdf',
            file_data: data.shippingDetails.guideFile,
            category: 'guide',
            created_at: this.getLocalNowISO(),
            updatedAt: this.getLocalNowISO(),
            _synced: false
          };
          await db_engine.saleAttachments.add(attachment);
          this.pushToCloud('saleAttachments', attachment, 'INSERT');
        }

        if (data.shippingDetails.productionImages && data.shippingDetails.productionImages.length > 0) {
          for (let i = 0; i < data.shippingDetails.productionImages.length; i++) {
            const img = data.shippingDetails.productionImages[i];
            const attId = `att-prod-${i}-${newSale.id}`;
            const attachment = {
              id: attId,
              sale_id: newSale.id,
              file_type: 'image',
              file_name: `prod-${i}.jpg`,
              file_data: img,
              category: 'production',
              created_at: this.getLocalNowISO(),
              updatedAt: this.getLocalNowISO(),
              _synced: false
            };
            await db_engine.saleAttachments.add(attachment);
            this.pushToCloud('saleAttachments', attachment, 'INSERT');
          }
        }
      }

      // Actualizar Stock y Kardex
      // MOVED TO DATABASE TRIGGER (Supabase) to prevent race conditions
      /*
      await this.updateStock(
        (newSale.items || []).filter(i => !i.id.startsWith('manual-')),
        'SALE',
        newSale.userId,
        newSale.folio
      );
      */

      if (newSale.customerId) {
        const customer = await db_engine.customers.get(newSale.customerId);
        if (customer) {
          customer.totalSpent += newSale.total;
          if (settings.moneyPerPoint > 0) {
            customer.points += Math.floor(newSale.total / settings.moneyPerPoint);
          }
          if (newSale.pointsUsed) customer.points = Math.max(0, customer.points - newSale.pointsUsed);
          await db_engine.customers.put(customer);
        }
      }

      if (data.creditData) {
        const initialPayments = data.creditData.downPayment > 0 ? [{
          id: Date.now().toString() + '-down',
          date: this.getLocalNowISO(),
          amount: data.creditData.downPayment,
          method: 'Efectivo',
          note: 'Prima / Enganche inicial'
        }] : [];

        await db_engine.credits.add({
          id: Date.now().toString(),
          customerId: newSale.customerId!,
          saleId: newSale.folio,
          principal: data.creditData.principal,
          totalAmount: data.creditData.totalWithInterest,
          paidAmount: data.creditData.downPayment || 0,
          status: (data.creditData.downPayment >= data.creditData.totalWithInterest - 0.1) ? 'paid' : 'pending',
          dueDate: new Date(this.getSystemNow().getTime() + (data.creditData.term * 30 * 24 * 60 * 60 * 1000)).toISOString(),
          createdAt: this.getLocalNowISO(),
          payments: initialPayments as CreditPayment[],
          interestRate: data.creditData.rate,
          termMonths: data.creditData.term,
          monthlyPayment: data.creditData.monthlyPayment
        });
      }

      // IMMEDIATE PUSH: Subir venta a Supabase inmediatamente para Realtime
      // Esto permite que otros dispositivos la reciban al instante
      // Redundant immediate push removed. Centralized sync will handle this.
      /*
      try {
        const { SupabaseService } = await import('./supabaseService');
        const client = await SupabaseService.getClient();
        if (client) {
          logger.log(`📤 Subiendo venta ${newSale.folio} a la nube inmediatamente...`);
          const { error } = await client.from('sales').upsert(newSale);
          if (error) {
            console.error('❌ Error al subir venta:', error.message);
          } else {
            logger.log(`✅ Venta ${newSale.folio} subida a la nube`);
          }
        }
      } catch (pushErr) {
        logger.warn('⚠️ Push inmediato falló (usará autoSync):', pushErr);
      }
      */
      newSale.updatedAt = this.getLocalNowISO();
      newSale._synced = false;

      await db_engine.sales.put(newSale);
      this.pushToCloud('sales', newSale, 'INSERT');
      return newSale;
    });
  }

  // Fix duplicate folios in existing orders/sales
  async fixDuplicateFolios(): Promise<{ fixed: number, details: string[] }> {
    const sales = await db_engine.sales.toArray();
    const folioMap = new Map<string, Sale[]>();

    // Group sales by folio
    for (const sale of sales) {
      if (!sale.folio) continue;
      const existing = folioMap.get(sale.folio) || [];
      existing.push(sale);
      folioMap.set(sale.folio, existing);
    }

    const settings = await this.getSettings();
    let maxTicket = settings.currentTicketNumber || 1;
    const details: string[] = [];
    let fixed = 0;

    // Find max ticket number first
    for (const sale of sales) {
      if (sale.folio?.startsWith('T-')) {
        const numStr = sale.folio.replace('T-', '');
        const num = parseInt(numStr, 10);
        if (!isNaN(num) && num >= maxTicket) {
          maxTicket = num + 1;
        }
      }
    }

    // Fix duplicates
    for (const [folio, duplicates] of folioMap.entries()) {
      if (duplicates.length > 1 && folio.startsWith('T-')) {
        // Keep the first one, reassign the rest
        for (let i = 1; i < duplicates.length; i++) {
          const sale = duplicates[i];
          const newFolio = `T-${maxTicket.toString().padStart(6, '0')}`;
          const oldFolio = sale.folio;
          sale.folio = newFolio;
          await db_engine.sales.put(sale);
          maxTicket++;
          fixed++;
          details.push(`${oldFolio} → ${newFolio} (${sale.id})`);
        }
      }
    }

    // Update settings with new max
    if (fixed > 0) {
      settings.currentTicketNumber = maxTicket;
      await this.saveSettings(settings);
      logger.log(`🔧 Fixed ${fixed} duplicate folios:`, details);
    }

    return { fixed, details };
  }

  async cancelSale(saleId: string, userId: string = 'system', refundType: 'cash' | 'creditNote' = 'creditNote', refundMethod?: 'Efectivo' | 'Tarjeta' | 'Transferencia') {
    await db_engine.transaction('rw', [db_engine.sales, db_engine.products, db_engine.inventoryHistory, db_engine.customers, db_engine.settings, db_engine.creditNotes, db_engine.credits], async () => {
      const sale = await db_engine.sales.get(saleId);
      if (sale && sale.status === 'active') {
        const settings = await this.getSettings();
        sale.status = 'cancelled';
        sale.balance = 0; // REPAIR: Cancelled sales should not have a pending balance
        sale.updatedAt = this.getLocalNowISO();
        await db_engine.sales.put(sale);

        // Cancelar Cuenta de Crédito (Contrato) si existe
        if (sale.paymentMethod === 'Crédito') {
          const credit = await db_engine.credits.where('saleId').equals(sale.id).first();
          if (credit) {
            credit.status = 'cancelled';
            credit.updatedAt = this.getLocalNowISO();
            await db_engine.credits.put(credit);
          }
        }

        // Revertir Stock en Kardex
        for (const item of sale.items) {
          if (!item.id.startsWith('manual-')) {
            const p = await db_engine.products.get(item.id);
            if (p) {
              const prev = p.stock;
              p.stock += item.quantity;
              await db_engine.products.put(p);
              await this.recordMovement({
                productId: item.id,
                type: 'CANCELLATION',
                quantity: item.quantity,
                previousStock: prev,
                newStock: p.stock,
                reason: `Anulación de venta ${sale.folio}`,
                userId
              });
            }
          }
        }

        // Revertir Puntos y Total Gastado del Cliente
        if (sale.customerId) {
          const customer = await db_engine.customers.get(sale.customerId);
          if (customer) {
            customer.totalSpent = Math.max(0, customer.totalSpent - sale.total);

            // Revertir puntos ganados (si aplica)
            if (settings.moneyPerPoint > 0) {
              const pointsEarned = Math.floor(sale.total / settings.moneyPerPoint);
              customer.points = Math.max(0, customer.points - pointsEarned);
            }

            // Revertir puntos usados (devolverlos al cliente)
            if (sale.pointsUsed) {
              customer.points += sale.pointsUsed;
            }

            await db_engine.customers.put(customer);
          }
        }

        // Generar registro de reembolso
        // BUG FIX: Only refund what was actually paid (Total - Balance)
        const paidAmount = sale.total - (sale.balance || 0);
        let refundable = paidAmount;
        if (sale.paymentMethod === 'Crédito' && (sale.balance || 0) > 0) {
          // Si es crédito y no se ha pagado nada, no hay nada que reembolsar en "efectivo/NC"
          // Pero si hubo un depósito inicial, ese sí es reembolsable
          refundable = sale.deposit || 0;
        }

        if (refundable > 0) {
          if (refundType === 'cash') {
            // Devolución en efectivo/banco: registrar como nota de crédito USADA inmediatamente
            const folio = `DEV-${sale.folio}`;
            await db_engine.creditNotes.add({
              id: folio.toLowerCase(), // Deterministic ID to avoid duplicates across devices
              folio: folio,
              saleId: sale.id,
              customerId: sale.customerId || '',
              originalTotal: refundable,
              remainingAmount: 0, // Ya devuelto
              reason: 'Devolución Directa',
              date: this.getLocalNowISO(),
              status: 'used', // Marcada como usada porque ya se devolvió el dinero
              // @ts-ignore - will add this to interface next
              refundMethod: refundMethod || 'Efectivo'
            });
          } else {
            // Nota de Crédito tradicional: disponible para uso futuro
            const folio = `NC-${sale.folio}`;
            await db_engine.creditNotes.add({
              id: folio.toLowerCase(), // Deterministic ID to avoid duplicates across devices
              folio: folio,
              saleId: sale.id,
              customerId: sale.customerId || '',
              originalTotal: refundable,
              remainingAmount: refundable,
              reason: 'Anulación de Venta',
              date: this.getLocalNowISO(),
              status: 'active'
            });
          }
        }
      }

      if (sale) {
        await db_engine.sales.put(sale);
        // Redundant immediate push removed
        // this.pushToCloud('sales', sale);
      }
    });
  }

  // --- EXPENSES ---
  async getExpenses(): Promise<Expense[]> { return await db_engine.expenses.toArray(); }

  async saveExpense(e: Expense) {
    if (!e.id) {
      e.id = `exp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
    // Normalize date to YYYY-MM-DD format
    e.date = e.date.substring(0, 10);
    e.updatedAt = this.getLocalNowISO();
    e._synced = false;
    await db_engine.expenses.put(e);
    this.pushToCloud('expenses', e);
    return e.id;
  }

  async deleteExpense(id: string) {
    await db_engine.expenses.delete(id);
    const settings = await this.getSettings();
    if (settings.autoSync) {
      import('./supabaseService').then(({ SupabaseService }) => {
        SupabaseService.deleteFromTable('expenses', id);
      });
    }
  }



  // --- CREDITS ---
  async getCredits(): Promise<CreditAccount[]> { return await db_engine.credits.toArray(); }

  async addCreditPayment(creditId: string, payment: Omit<CreditPayment, 'id'>) {
    const c = await db_engine.credits.get(creditId);
    if (c) {
      const p = { ...payment, id: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, date: this.getLocalNowISO() };
      c.payments.push(p);
      c.paidAmount += payment.amount;
      if (c.paidAmount >= c.totalAmount - 0.1) c.status = 'paid';
      c.updatedAt = this.getLocalNowISO();
      c._synced = false;
      await db_engine.credits.put(c);
      this.pushToCloud('credits', c);

      // ALSO UPDATE THE SALE BALANCE
      if (c.saleId) {
        const sale = await db_engine.sales.get(c.saleId);
        if (sale) {
          sale.balance = Math.max(0, (sale.balance || 0) - payment.amount);
          sale.updatedAt = this.getLocalNowISO();
          sale._synced = false;
          await db_engine.sales.put(sale);
          this.pushToCloud('sales', sale);
        }
      }
    }
  }

  // --- UTILS ---
  async compressImage(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (e) => {
        const img = new Image();
        img.src = e.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_WIDTH = 800; // Increased quality slightly for readability
          const MAX_HEIGHT = 800;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7)); // Balanced compression
        };
      };
    });
  }

  // --- ATTACHMENTS (High Egress Fix) ---
  // These methods interact directly with Supabase to avoid syncing heavy data via Realtime
  async saveAttachment(saleId: string, fileData: string, type: 'image' | 'pdf', fileName?: string, category: 'guide' | 'production' | 'general' = 'general') {
    // 1. Save locally in a separate collection if desired, or just cloud depending on strategy.
    // For this fix, we prioritize CLOUD storage to keep local DB light, 
    // BUT we need local access too. Let's use Dexie for cache but NOT sync it via the main channel.

    // We will assume this is primarily for the Cloud to avoid the 1GB egress issue on the 'sales' table.
    try {
      const { SupabaseService } = await import('./supabaseService');
      const client = await SupabaseService.getClient();
      if (client) {
        const { error } = await client.from('sale_attachments').insert({
          id: Date.now().toString(),
          sale_id: saleId,
          file_type: type,
          file_name: fileName,
          file_data: fileData,
          category: category
        });
        if (error) console.error("Error uploading attachment:", error);
      }
    } catch (e) {
      console.error("Failed to save attachment to cloud:", e);
    }
  }

  async getAttachments(saleId: string): Promise<any[]> {
    logger.log(`📎 [Attachments] Buscando adjuntos para venta: ${saleId}`);
    try {
      const { SupabaseService } = await import('./supabaseService');
      const client = await SupabaseService.getClient();
      if (client) {
        const { data, error } = await client
          .from('sale_attachments')
          .select('*')
          .eq('sale_id', saleId);

        if (error) {
          console.error("📎 [Attachments] Error al obtener adjuntos:", error);
          throw error;
        }
        logger.log(`📎 [Attachments] Encontrados ${data?.length || 0} adjuntos para ${saleId}`);
        return data || [];
      } else {
        logger.warn("📎 [Attachments] No hay cliente Supabase disponible");
      }
    } catch (e) {
      console.error("📎 [Attachments] Fallo al obtener adjuntos:", e);
      return [];
    }
    return [];
  }

  // --- LEGACY COMPATIBILITY WRAPPERS (To avoid breaking App.tsx) ---
  async getSuppliers() {
    const items = await db_engine.suppliers.toArray();
    return items.filter(i => i.active !== false);
  }
  async saveSupplier(s: Supplier) {
    if (!s.id) s.id = Date.now().toString();
    if (s.active === undefined) s.active = true;
    s.updatedAt = this.getLocalNowISO();
    await db_engine.suppliers.put(s);
    // Redundant immediate push removed
    // this.pushToCloud('suppliers', s);
  }
  async deleteSupplier(id: string) {
    const s = await db_engine.suppliers.get(id);
    if (s) {
      s.active = false;
      s.updatedAt = this.getLocalNowISO();
      await db_engine.suppliers.put(s);
      this.pushToCloud('suppliers', s);
    }
  }
  async getConsumables() {
    const items = await db_engine.consumables.toArray();
    return items.filter(i => i.active !== false);
  }
  async saveConsumable(c: Consumable) {
    if (!c.id) c.id = Date.now().toString();
    if (c.active === undefined) c.active = true;
    c.updatedAt = this.getLocalNowISO();
    await db_engine.consumables.put(c);
    // Redundant immediate push removed
    // this.pushToCloud('consumables', c);
  }
  async deleteConsumable(id: string) {
    const c = await db_engine.consumables.get(id);
    if (c) {
      c.active = false;
      c.updatedAt = this.getLocalNowISO();
      await db_engine.consumables.put(c);
      this.pushToCloud('consumables', c);
    }
  }
  async getPromotions() { return await db_engine.promotions.toArray(); }
  async savePromotion(p: Promotion) {
    if (!p.id) p.id = Date.now().toString();
    p.updatedAt = this.getLocalNowISO();
    await db_engine.promotions.put(p);
    // Redundant immediate push removed
    // this.pushToCloud('promotions', p);
  }
  async deletePromotion(id: string) {
    const p = await db_engine.promotions.get(id);
    if (p) {
      p.active = false;
      p.updatedAt = this.getLocalNowISO();
      await db_engine.promotions.put(p);
      this.pushToCloud('promotions', p);
    }
  }
  async getUsers() {
    const users = await db_engine.users.toArray();
    return users.filter(u => u.active !== false);
  }
  async saveUser(u: User) {
    if (!u.id) u.id = Date.now().toString();

    // Si es una actualización y no se proporciona contraseña, mantener la existente
    if (u.id) {
      const existing = await db_engine.users.get(u.id);
      if (existing && (!u.password || u.password.trim() === '')) {
        u.password = existing.password;
      }
    }
    u.updatedAt = this.getLocalNowISO();
    await db_engine.users.put(u);
    // Redundant immediate push removed
    // this.pushToCloud('users', u);
  }
  async deleteUser(id: string) {
    const u = await db_engine.users.get(id);
    if (u) {
      u.active = false;
      u.updatedAt = this.getLocalNowISO();
      await db_engine.users.put(u);
      this.pushToCloud('users', u);
    }
  }
  async getBranches() {
    const branches = await db_engine.branches.toArray();
    return branches.filter(b => b.active !== false);
  }
  async saveBranch(b: Branch) {
    if (!b.id) b.id = Date.now().toString();
    b.updatedAt = this.getLocalNowISO();
    await db_engine.branches.put(b);
    // Redundant immediate push removed
    // this.pushToCloud('branches', b);
  }
  async getQuotes() {
    const quotes = await db_engine.quotes.toArray();
    // Filtrar cotizaciones eliminadas (soft-delete)
    return quotes.filter(q => q.status !== 'deleted');
  }
  async saveQuote(q: Quote) {
    if (!q.id) q.id = Date.now().toString();
    q.updatedAt = this.getLocalNowISO();
    await db_engine.quotes.put(q);
    // Redundant immediate push removed
    // this.pushToCloud('quotes', q);
  }
  async getCreditNotes() { return await db_engine.creditNotes.toArray(); }

  async login(email: string, pass: string): Promise<User | null> {
    const users = await db_engine.users.toArray();
    return users.find(u => u.email === email && u.password === pass && u.active) || null;
  }

  async getCurrentUser(): Promise<User | null> {
    const stored = localStorage.getItem('active_user');
    return stored ? JSON.parse(stored) : null;
  }

  async getAllData() {
    return {
      products: await db_engine.products.toArray(),
      categories: await db_engine.categories.toArray(),
      customers: await db_engine.customers.toArray(),
      sales: await db_engine.sales.toArray(),
      users: await db_engine.users.toArray(),
      branches: await db_engine.branches.toArray(),
      credits: await db_engine.credits.toArray(),
      promotions: await db_engine.promotions.toArray(),
      suppliers: await db_engine.suppliers.toArray(),
      consumables: await db_engine.consumables.toArray(),
      quotes: await db_engine.quotes.toArray(),
      cash_cuts: await db_engine.cashCuts.toArray(),
      credit_notes: await db_engine.creditNotes.toArray(),
      expenses: await db_engine.expenses.toArray(),
      inventoryHistory: await db_engine.inventoryHistory.toArray(),
      priceHistory: await db_engine.priceHistory.toArray(),
      settings: await db_engine.settings.get('main')
    };
  }

  // --- NUEVA IMPLEMENTACIÓN DE ESTIMACIÓN DE ALMACENAMIENTO ---
  async getStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const total = estimate.quota || 1;
      return {
        used,
        total,
        percent: (used / total) * 100
      };
    }
    return { used: 0, total: 1024 * 1024 * 5, percent: 0 }; // Fallback a 5MB si no hay API
  }

  async deleteQuote(id: string) {
    // Soft-delete para sincronización correcta con la nube
    const quote = await db_engine.quotes.get(id);
    if (quote) {
      quote.status = 'deleted';
      await db_engine.quotes.put(quote);
      this.pushToCloud('quotes', quote);
    }
  }

  async updateCategoryStockThreshold(categoryId: string, threshold: number) {
    await db_engine.products.where('categoryId').equals(categoryId).modify({ minStock: threshold });
  }

  async processCreditNoteUsage(folio: string, amount: number): Promise<boolean> {
    const nc = await db_engine.creditNotes.where('folio').equals(folio).first();
    if (nc && nc.status === 'active' && nc.remainingAmount >= amount) {
      nc.remainingAmount -= amount;
      if (nc.remainingAmount < 0.01) nc.status = 'used';
      await db_engine.creditNotes.put(nc);
      return true;
    }
    return false;
  }

  async revertCreditNoteUsage(folio: string, amount: number) {
    const nc = await db_engine.creditNotes.where('folio').equals(folio).first();
    if (nc) {
      nc.remainingAmount += amount;
      nc.status = 'active';
      await db_engine.creditNotes.put(nc);
    }
  }

  // SMART MERGE: Instead of replacing all data, merge with local keeping newest
  async restoreData(data: any) {
    // Helper function to merge data intelligently
    const mergeTable = async (table: any, remoteData: any[], idField: string = 'id') => {
      if (!remoteData || remoteData.length === 0) return;

      for (const remoteItem of remoteData) {
        const localItem = await table.get(remoteItem[idField]);

        if (!localItem) {
          // Item doesn't exist locally
          // For expenses, do an extra check by content to avoid duplicates with different IDs
          if (table === db_engine.expenses) {
            const normalizedRemoteDate = remoteItem.date.substring(0, 10);
            const duplicateByContent = await table
              .filter((item: any) => {
                const itemDate = item.date.substring(0, 10);
                return itemDate === normalizedRemoteDate &&
                  item.amount === remoteItem.amount &&
                  item.categoryId === remoteItem.categoryId &&
                  item.description === remoteItem.description;
              })
              .first();

            if (duplicateByContent) {
              logger.log(`⏭️ Omitiendo gasto duplicado por contenido: ${remoteItem.description}`);
              continue;
            }
          }
          remoteItem._synced = true;
          await table.put(remoteItem);
        } else {
          // Item exists locally - compare by date if available
          const remoteDate = remoteItem.date || remoteItem.createdAt || remoteItem.updatedAt;
          const localDate = localItem.date || localItem.createdAt || localItem.updatedAt;

          if (remoteDate && localDate) {
            // Keep the most recent version
            if (new Date(remoteDate) > new Date(localDate)) {
              remoteItem._synced = true;
              await table.put(remoteItem);
            }
          } else {
            // If no dates available, remote data wins (user chose to restore/download)
            remoteItem._synced = true;
            await table.put(remoteItem);
          }
        }
      }
    };

    // SMART PRODUCT MERGE: Check inventory movements to preserve local stock if there are recent sales
    const mergeProductsWithInventoryCheck = async (remoteProducts: any[]) => {
      if (!remoteProducts || remoteProducts.length === 0) return;

      // Get all local inventory movements from the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentMovements = await db_engine.inventoryHistory
        .filter((m: any) => new Date(m.date) > sevenDaysAgo)
        .toArray();

      // Create a map of productId -> most recent movement date
      const productMovementMap = new Map<string, Date>();
      for (const movement of recentMovements) {
        const existing = productMovementMap.get(movement.productId);
        const movementDate = new Date(movement.date);
        if (!existing || movementDate > existing) {
          productMovementMap.set(movement.productId, movementDate);
        }
      }

      for (const remoteProduct of remoteProducts) {
        const localProduct = await db_engine.products.get(remoteProduct.id);

        if (!localProduct) {
          // Product doesn't exist locally, add it
          await db_engine.products.put(remoteProduct);
          logger.log(`➕ Nuevo producto desde nube: ${remoteProduct.name}`);
        } else {
          // Product exists locally - check if we have recent inventory movements
          const lastLocalMovement = productMovementMap.get(remoteProduct.id);
          const remoteUpdatedAt = remoteProduct.updatedAt ? new Date(remoteProduct.updatedAt) : null;
          const localUpdatedAt = localProduct.updatedAt ? new Date(localProduct.updatedAt) : null;

          // If there are recent local inventory movements for this product
          if (lastLocalMovement) {
            // And the remote product was updated BEFORE our last movement
            if (!remoteUpdatedAt || lastLocalMovement > remoteUpdatedAt) {
              // Preserve local stock but update other fields from remote
              const preservedStock = localProduct.stock;
              const merged = { ...remoteProduct, stock: preservedStock, updatedAt: localProduct.updatedAt };
              await db_engine.products.put(merged);
              logger.log(`🔒 Preservado stock local de "${localProduct.name}": ${preservedStock} (mov. local más reciente)`);
              continue;
            }
          }

          // Standard date comparison for products without recent movements
          if (remoteUpdatedAt && localUpdatedAt) {
            if (remoteUpdatedAt > localUpdatedAt) {
              await db_engine.products.put(remoteProduct);
              logger.log(`☁️ Actualizado desde nube: ${remoteProduct.name}`);
            } else {
              logger.log(`📱 Conservado local (más reciente): ${localProduct.name}`);
            }
          } else if (remoteUpdatedAt && !localUpdatedAt) {
            // Remote has date, local doesn't - but preserve local stock if we have movements
            if (lastLocalMovement) {
              const merged = { ...remoteProduct, stock: localProduct.stock };
              await db_engine.products.put(merged);
              logger.log(`🔄 Merge: datos de nube + stock local para "${localProduct.name}"`);
            } else {
              await db_engine.products.put(remoteProduct);
            }
          }
          // If neither has dates, keep local (don't overwrite potentially newer local data)
        }
      }
    };

    const mergeSalesWithTimestampCheck = async (remoteSales: Sale[]) => {
      for (const remoteSale of remoteSales) {
        const localSale = await db_engine.sales.get(remoteSale.id);
        if (!localSale) {
          await db_engine.sales.put(remoteSale);
          logger.log(`📥 Nuevo pedido descargado: ${remoteSale.folio}`);
        } else {
          const remoteUpdatedAt = remoteSale.updatedAt ? new Date(remoteSale.updatedAt).getTime() : 0;
          const localUpdatedAt = localSale.updatedAt ? new Date(localSale.updatedAt).getTime() : 0;

          if (remoteUpdatedAt > localUpdatedAt) {
            await db_engine.sales.put(remoteSale);
            logger.log(`☁️ Pedido actualizado desde nube: ${remoteSale.folio}`);
          } else {
            logger.log(`🔒 Pedido local ${localSale.folio} conservado (más reciente o igual)`);
          }
        }
      }
    };

    // Use smart merge for products
    if (data.products) await mergeProductsWithInventoryCheck(data.products);
    if (data.categories) await mergeTable(db_engine.categories, data.categories);
    if (data.customers) await mergeTable(db_engine.customers, data.customers);
    if (data.sales) await mergeSalesWithTimestampCheck(data.sales);
    if (data.users) await mergeTable(db_engine.users, data.users);
    if (data.branches) await mergeTable(db_engine.branches, data.branches);
    if (data.credits) await mergeTable(db_engine.credits, data.credits);
    if (data.promotions) await mergeTable(db_engine.promotions, data.promotions);
    if (data.suppliers) await mergeTable(db_engine.suppliers, data.suppliers);
    if (data.consumables) await mergeTable(db_engine.consumables, data.consumables);
    if (data.quotes) await mergeTable(db_engine.quotes, data.quotes);
    if (data.cash_cuts) await mergeTable(db_engine.cashCuts, data.cash_cuts);
    if (data.credit_notes) await mergeTable(db_engine.creditNotes, data.credit_notes);
    if (data.expenses) {
      // Simple merge: just add new expenses from cloud
      for (const exp of data.expenses) {
        exp.date = exp.date.substring(0, 10); // Normalize to YYYY-MM-DD
        const existing = await db_engine.expenses.get(exp.id);
        if (!existing) {
          await db_engine.expenses.put(exp);
        }
      }
    }
    if (data.inventoryHistory) await mergeTable(db_engine.inventoryHistory, data.inventoryHistory);
    if (data.priceHistory) await mergeTable(db_engine.priceHistory, data.priceHistory);

    // Settings: USE REMOTE as primary, only keep local counters and credentials
    if (data.settings) {
      logger.log("🔄 [restoreData] Remote settings:", JSON.stringify({
        name: data.settings.name,
        hasLogo: !!data.settings.logo,
        logoLength: data.settings.logo?.length || 0,
      }));

      const localSettings = await db_engine.settings.get('main');

      // START with remote settings as the BASE (this is what we want)
      const merged: any = {
        ...data.settings,  // Remote settings as BASE - all remote values come first
        id: 'main',
      };

      // Only preserve LOCAL values for these critical fields:
      if (localSettings) {
        // Keep highest counter values to prevent duplicate folios
        merged.currentInvoiceNumber = Math.max(localSettings.currentInvoiceNumber || 1, data.settings.currentInvoiceNumber || 1);
        merged.currentTicketNumber = Math.max(localSettings.currentTicketNumber || 1, data.settings.currentTicketNumber || 1);
        merged.currentProductCode = Math.max(localSettings.currentProductCode || 1, data.settings.currentProductCode || 1);
        merged.currentQuoteNumber = Math.max(localSettings.currentQuoteNumber || 1, data.settings.currentQuoteNumber || 1);

        // Keep local Supabase credentials (each device has its own)
        if (localSettings.supabaseUrl) merged.supabaseUrl = localSettings.supabaseUrl;
        if (localSettings.supabaseKey) merged.supabaseKey = localSettings.supabaseKey;
      }

      logger.log("🔄 [restoreData] Final merged:", JSON.stringify({
        name: merged.name,
        hasLogo: !!merged.logo,
        logoLength: merged.logo?.length || 0,
      }));

      await db_engine.settings.put(merged);
      logger.log("✅ [restoreData] Settings saved");
    }
  }

  calculateEarlyPayoff(credit: CreditAccount) {
    if (credit.status === 'paid' || !credit.interestRate) return null;
    const today = this.getSystemNow();
    const start = this.getSystemDate(credit.createdAt);
    const diffTime = Math.abs(today.getTime() - start.getTime());
    const daysElapsed = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const monthlyRate = credit.interestRate / 100;
    const dailyRate = monthlyRate / 30;
    const interestAccrued = credit.principal * dailyRate * daysElapsed;
    const totalDebtToday = credit.principal + interestAccrued;
    const remainingToPay = Math.max(0, totalDebtToday - credit.paidAmount);
    const savings = Math.max(0, credit.totalAmount - totalDebtToday);

    return { daysElapsed, interestAccrued, totalDebtToday, remainingToPay, savings };
  }

  async liquidateCredit(id: string, details: { finalAmount: number, savings: number }) {
    const c = await db_engine.credits.get(id);
    if (c) {
      c.paidAmount += details.finalAmount;
      c.status = 'paid';
      c.updatedAt = this.getLocalNowISO();
      c._synced = false;
      if (!Array.isArray(c.payments)) c.payments = [];
      c.payments.push({
        id: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        date: this.getLocalNowISO(),
        amount: details.finalAmount,
        method: 'Efectivo',
        note: `Liquidación anticipada. Ahorro: L ${details.savings.toFixed(2)}`
      });
      await db_engine.credits.put(c);
      this.pushToCloud('credits', c);

      // ALSO UPDATE THE SALE BALANCE
      if (c.saleId) {
        const sale = await db_engine.sales.get(c.saleId);
        if (sale) {
          sale.balance = 0; // Final liquidation
          sale.updatedAt = this.getLocalNowISO();
          sale._synced = false;
          await db_engine.sales.put(sale);
          this.pushToCloud('sales', sale);
        }
      }
    }
  }

  async getTodaysCreditPayments(date: string) {
    const credits = await db_engine.credits.toArray();
    let cash = 0, card = 0, transfer = 0;
    credits.forEach(c => {
      (c.payments || []).forEach(p => {
        if (p && p.date && p.date.startsWith(date)) {
          if (p.method === 'Efectivo') cash += p.amount;
          else if (p.method === 'Tarjeta') card += p.amount;
          else if (p.method === 'Transferencia') transfer += p.amount;
        }
      });
    });
    return { cash, card, transfer };
  }

  async saveCashCut(cut: CashCut) {
    if (!cut.id) cut.id = Date.now().toString();
    if (!cut.date) cut.date = this.getLocalNowISO();
    cut.updatedAt = this.getLocalNowISO();
    await db_engine.cashCuts.put(cut);
    const settings = await this.getSettings();
    await db_engine.cashCuts.put(cut);
    this.pushToCloud('cash_cuts', cut);
  }

  async getCashCuts(): Promise<CashCut[]> {
    return await db_engine.cashCuts.toArray();
  }

  async deleteCashCut(id: string): Promise<void> {
    await db_engine.cashCuts.delete(id);
    const settings = await this.getSettings();
  }

  async getLastCashCut(): Promise<CashCut | null> {
    const cuts = await db_engine.cashCuts.toArray();
    if (cuts.length === 0) return null;
    // Sort by date descending and return the most recent
    const sorted = [...cuts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sorted[0];
  }

  // --- CUSTOMER 360 DATA ---
  async getSalesByCustomer(customerId: string) {
    const allSales = await db_engine.sales.toArray();
    return allSales
      .filter(s => s.customerId === customerId && s.status !== 'cancelled')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async getCreditsByCustomer(customerId: string) {
    const allCredits = await db_engine.credits.toArray();
    return allCredits
      .filter(c => c.customerId === customerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // --- ORDER TRACKING (Sync Fix) ---
  async addOrderTracking(saleId: string, status: string, details?: string) {
    // 1. Save local log
    const entry: OrderTracking = {
      id: this.generateUUID(),
      sale_id: saleId,
      status,
      user_id: (await this.getCurrentUser())?.id,
      details,
      created_at: this.getLocalNowISO(),
      _synced: false
    };
    await db_engine.orderTracking.put(entry);

    // 2. Update local Sale immediately for UI responsiveness
    const sale = await db_engine.sales.get(saleId);
    if (sale) {
      sale.fulfillmentStatus = status as FulfillmentStatus;
      sale.updatedAt = entry.created_at;
      await db_engine.sales.put(sale);
    }

    // 3. Push to Cloud (The Trigger will handle the rest on other devices)
    this.pushToCloud('order_tracking', entry, 'INSERT');
  }

  async getOrderTracking(saleId: string) {
    return await db_engine.orderTracking
      .where('sale_id').equals(saleId)
      .sortBy('created_at');
  }

  // Fetch all financial data (sales, credit payments, expenses) since the last cash cut
  async getUncutData() {
    const lastCut = await this.getLastCashCut();
    const lastCutTime = lastCut ? new Date(lastCut.date).getTime() : 0;
    const now = new Date().getTime();

    // 1. Uncut Sales
    const allSales = await db_engine.sales.toArray();
    const uncutSales = allSales.filter(s => {
      const saleTime = new Date(s.date).getTime();
      // Only include active sales and balance payments since last cut
      const isNewSale = saleTime > lastCutTime && s.status === 'active';
      const isNewBalancePayment = s.balancePaymentDate && new Date(s.balancePaymentDate).getTime() > lastCutTime && s.status === 'active';
      return isNewSale || isNewBalancePayment;
    });

    // 2. Uncut Credit Payments
    const credits = await db_engine.credits.toArray();
    const uncutCreditPayments = { cash: 0, card: 0, transfer: 0 };
    credits.forEach(c => {
      (c.payments || []).forEach(p => {
        if (new Date(p.date).getTime() > lastCutTime) {
          if (p.method === 'Efectivo') uncutCreditPayments.cash += p.amount;
          else if (p.method === 'Tarjeta') uncutCreditPayments.card += p.amount;
          else if (p.method === 'Transferencia') uncutCreditPayments.transfer += p.amount;
        }
      });
    });

    // 3. Uncut Expenses
    const allExpenses = await db_engine.expenses.toArray();
    const uncutExpensesList = allExpenses.filter(e => {
      // Use updatedAt if available, fallback to date
      const expTime = e.updatedAt ? new Date(e.updatedAt).getTime() : new Date(e.date + 'T12:00:00').getTime();
      return expTime > lastCutTime;
    });

    const cashExpenses = uncutExpensesList
      .filter(e => e.paymentMethod === 'Efectivo')
      .reduce((acc, e) => acc + e.amount, 0);

    // 4. Uncut Cash Refunds (Notas de Crédito devueltas en efectivo)
    const allCN = await db_engine.creditNotes.toArray();
    const cashRefunds = allCN
      .filter(nc => {
        const ncTime = nc.updatedAt ? new Date(nc.updatedAt).getTime() : new Date(nc.date).getTime();
        // @ts-ignore
        return ncTime > lastCutTime && nc.status === 'used' && (nc.refundMethod === 'Efectivo' || !nc.refundMethod) && nc.reason === 'Devolución Directa';
      })
      .reduce((acc, nc) => acc + nc.originalTotal, 0);

    return {
      sales: uncutSales,
      creditPayments: uncutCreditPayments,
      cashExpenses,
      cashRefunds,
      lastCutTime,
      lastCutDate: lastCut?.date || null,
      uncutExpensesList
    };
  }

  // Check if there are sales from previous day(s) without a corresponding cash cut
  async hasPendingCashCut(): Promise<{ pending: boolean; lastCutDate: string | null; salesWithoutCut: number }> {
    const lastCut = await this.getLastCashCut();
    const lastCutTime = lastCut ? new Date(lastCut.date).getTime() : 0;

    // Start of the current local day (Honduras time)
    const todayLocal = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Tegucigalpa" }));
    todayLocal.setHours(0, 0, 0, 0);
    const todayStartTime = todayLocal.getTime();

    // A cut is pending if there are active sales made AFTER the last cut but BEFORE today began
    const allSales = await db_engine.sales.toArray();
    const pendingSales = allSales.filter(s => {
      const saleTime = new Date(s.date).getTime();
      const isLegacyUncut = saleTime > lastCutTime && saleTime < todayStartTime && s.status === 'active';

      // Also check balance payments (when people pay the remainder of an order)
      const isBalanceUncut = s.balancePaymentDate &&
        new Date(s.balancePaymentDate).getTime() > lastCutTime &&
        new Date(s.balancePaymentDate).getTime() < todayStartTime &&
        s.status === 'active';

      return isLegacyUncut || isBalanceUncut;
    });

    return {
      pending: pendingSales.length > 0,
      lastCutDate: lastCut ? lastCut.date : null,
      salesWithoutCut: pendingSales.length
    };
  }

  async refundCreditNote(id: string) {
    const nc = await db_engine.creditNotes.get(id);
    if (nc) {
      nc.remainingAmount = 0;
      nc.status = 'used';
      nc.updatedAt = this.getLocalNowISO();
      await db_engine.creditNotes.put(nc);
    }
  }

  async updateSaleStatus(id: string, status: FulfillmentStatus, shippingDetails?: Partial<ShippingDetails>) {
    const sale = await db_engine.sales.get(id);
    if (!sale) throw new Error("Pedido no encontrado");

    // VALIDATION: Cannot advance to shipped/delivered if balance > 0
    const unpaidBlockedStatuses: FulfillmentStatus[] = ['shipped', 'delivered'];
    if (unpaidBlockedStatuses.includes(status) && (sale.balance || 0) > 0) {
      throw new Error(`No se puede marcar como "${status === 'shipped' ? 'Enviado' : 'Entregado'}" hasta completar el pago. Saldo pendiente: L ${(sale.balance || 0).toFixed(2)}`);
    }

    const oldStatus = sale.fulfillmentStatus;
    const isStatusChange = oldStatus !== status;

    // 1. TRACKING SYSTEM (The Source of Truth for Status)
    if (isStatusChange) {
      // This updates the local sale status and timestamp immediately via db.addOrderTracking
      // And queues the tracking event for the cloud
      await this.addOrderTracking(id, status, `Cambio de estado: ${oldStatus} -> ${status}`);
    }

    // 2. RELOAD (to get updates from addOrderTracking)
    const updatedSale = await db_engine.sales.get(id) || sale;

    // 3. HANDLE DETAILS (Shipping, Images, etc)
    // If shippingDetails are provided, we MUST update the sale record itself
    // because order_tracking events don't carry full shipping objects.
    if (shippingDetails) {
      const existingDetails: Partial<ShippingDetails> = updatedSale.shippingDetails || {};
      const newDetails: Partial<ShippingDetails> = shippingDetails || {};

      updatedSale.shippingDetails = {
        ...existingDetails,
        ...newDetails,
        // Explicitly preserve productionImages unless explicitly being updated
        productionImages: newDetails.productionImages !== undefined
          ? newDetails.productionImages
          : existingDetails.productionImages
      } as ShippingDetails;

      // Update timestamp again to reflect the details change
      updatedSale.updatedAt = this.getLocalNowISO();
      updatedSale._synced = false;

      await db_engine.sales.put(updatedSale);
      this.pushToCloud('sales', updatedSale);
    } else if (isStatusChange) {
      // If ONLY status changed, addOrderTracking already updated local sale and queued tracking event.
      // We might want to push the Sale update too just in case, but it's redundant if the Trigger works.
      // However, for safety (legacy sync support), we can push the sale too.
      // But let's rely on Tracking for status to avoid race conditions.
    }

    // AUTO-CLOSE ORDER: If delivered and fully paid
    if (status === 'delivered' && (updatedSale.balance || 0) <= 0) {
      updatedSale.isOrder = false;
      await db_engine.sales.put(updatedSale);
      this.pushToCloud('sales', updatedSale);
    }

    return updatedSale;
  }

  async deleteBranch(id: string) {
    const b = await db_engine.branches.get(id);
    if (b) {
      b.active = false;
      b.updatedAt = this.getLocalNowISO();
      await db_engine.branches.put(b);
      const settings = await this.getSettings();
      // Redundant immediate push removed
      // this.pushToCloud('branches', b);
    }
  }

  // --- PRINTING HELPER ---
  async completeOrder(saleId: string, paymentDetails: PaymentDetails, newDocumentType?: 'FACTURA' | 'TICKET'): Promise<Sale> {
    const sale = await db_engine.sales.get(saleId);
    if (!sale) throw new Error("Pedido no encontrado");

    // Validar que tenga saldo
    const balance = sale.balance || 0;
    if (balance <= 0) throw new Error("Este pedido ya está pagado");

    // Si cambia a FACTURA, asignar folio
    let newFolio = sale.folio;
    let newDocType = sale.documentType;
    let newCAI = sale.cai;

    if (newDocumentType === 'FACTURA' && sale.documentType !== 'FACTURA') {
      const settings = await this.getSettings();

      // Validate billing range is configured
      if (!settings.billingRangeStart || !settings.billingRangeEnd) {
        throw new Error('Rango de facturación no configurado. Ve a Configuración > Facturación.');
      }

      // Validaciones de Factura
      const nextNum = settings.currentInvoiceNumber;
      const startParts = settings.billingRangeStart.split('-');
      const endParts = settings.billingRangeEnd.split('-');
      const maxNum = parseInt(endParts[3]);

      if (nextNum > maxNum) throw new Error(`Rango de facturación agotado.`);

      const deadline = new Date(settings.billingDeadline + 'T23:59:59');
      if (new Date() > deadline) throw new Error(`Fecha límite de facturación expirada.`);

      if (!settings.cai) throw new Error('CAI no configurado.');

      newFolio = `${startParts[0]}-${startParts[1]}-${startParts[2]}-${nextNum.toString().padStart(8, '0')}`;
      settings.currentInvoiceNumber++;
      await this.saveSettings(settings);
      newDocType = 'FACTURA';
      newCAI = settings.cai;
    }

    // Actualizar venta
    const balancePaidAmount = sale.balance || 0;  // Save amount before clearing
    sale.deposit = (sale.deposit || 0) + balancePaidAmount;
    sale.balance = 0;
    sale.isOrder = false; // Ya no está pendiente de pago
    sale.folio = newFolio;
    sale.documentType = newDocType;
    sale.cai = newCAI;
    sale.updatedAt = this.getLocalNowISO(); // CRITICAL: Update for multi-device sync
    sale._synced = false;

    // CASH FLOW TRACKING: Record payment date, method, and amount for today's cash flow
    sale.balancePaymentDate = this.getLocalNowISO(); // Payment received TODAY
    sale.balancePaid = balancePaidAmount; // Store exact amount for cash cut calculation
    // Determine payment method from paymentDetails
    if (paymentDetails.cash && paymentDetails.cash > 0) {
      sale.balancePaymentMethod = 'Efectivo';
    } else if (paymentDetails.card && paymentDetails.card > 0) {
      sale.balancePaymentMethod = 'Tarjeta';
    } else if (paymentDetails.transfer && paymentDetails.transfer > 0) {
      sale.balancePaymentMethod = 'Transferencia';
    }

    // Merge payment details BEFORE pushing to cloud (avoid double-save mismatch)
    sale.paymentDetails = { ...sale.paymentDetails, ...paymentDetails };

    await db_engine.sales.put(sale);
    this.pushToCloud('sales', sale);

    // ALSO SYNC WITH CREDIT ACCOUNT IF EXISTS
    try {
      const credit = await db_engine.credits.where('saleId').equals(sale.folio).first();
      if (credit && credit.status !== 'paid') {
        credit.paidAmount = credit.totalAmount;
        credit.status = 'paid';
        credit.updatedAt = this.getLocalNowISO();
        credit._synced = false;
        if (!Array.isArray(credit.payments)) credit.payments = [];
        credit.payments.push({
          id: `pay-complete-${Date.now()}`,
          date: this.getLocalNowISO(),
          amount: balancePaidAmount,
          method: sale.balancePaymentMethod || 'Efectivo',
          note: 'Liquidación automática desde Pedidos'
        });
        await db_engine.credits.put(credit);
        this.pushToCloud('credits', credit);
      }
    } catch (e) {
      logger.warn("⚠️ Error liquidando crédito asociado:", e);
    }

    return sale;
  }

  async clearTransactionalData(): Promise<void> {
    await db_engine.sales.clear();
    await db_engine.expenses.clear();
    await db_engine.credits.clear();
    await db_engine.creditNotes.clear();
    await db_engine.cashCuts.clear();
    await db_engine.quotes.clear();
    await db_engine.inventoryHistory.clear();
  }

  async purgeOldData(years: number): Promise<{ sales: number, history: number }> {
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - years);
    const cutoffStr = cutoffDate.toISOString();

    const oldSales = await db_engine.sales.where('date').below(cutoffStr).toArray();
    const oldHistory = await db_engine.inventoryHistory.where('date').below(cutoffStr).toArray();

    await db_engine.sales.bulkDelete(oldSales.map(s => s.id));
    await db_engine.inventoryHistory.bulkDelete(oldHistory.map(h => h.id));

    return {
      sales: oldSales.length,
      history: oldHistory.length
    };
  }

  async fullSystemReset(): Promise<void> {
    const tables = [
      db_engine.sales,
      db_engine.products,
      db_engine.categories,
      db_engine.customers,
      db_engine.expenses,
      db_engine.credits,
      db_engine.creditNotes,
      db_engine.cashCuts,
      db_engine.quotes,
      db_engine.inventoryHistory,
      db_engine.priceHistory,
      db_engine.promotions,
      db_engine.suppliers,
      db_engine.consumables
    ];

    for (const table of tables) {
      if (table) await table.clear();
    }
  }

  async updateExpenseDate(id: string, date: string) {
    const exp = await db_engine.expenses.get(id);
    if (exp) {
      exp.date = date;
      exp.updatedAt = this.getLocalNowISO();
      await db_engine.expenses.put(exp);
      // Redundant immediate push removed
      // this.pushToCloud('expenses', exp);
    }
  }

  async generateTicketHTML(sale: Sale, customer?: Customer): Promise<string> {
    const settings = await this.getSettings();
    const isFiscal = sale.documentType === 'FACTURA';
    const isOrder = sale.isOrder && (sale.balance || 0) > 0;

    const title = isOrder ? 'TICKET DE PEDIDO' : (isFiscal ? 'FACTURA' : 'TICKET DE VENTA');
    const dateStr = new Date(sale.date).toLocaleString('es-HN');

    const itemsHtml = (sale.items || []).map(item => `
        < tr style = "border-bottom: 1px dashed #eee;" >
          <td style="padding: 5px 0;" > ${item.quantity} x ${item.name} </td>
            < td style = "padding: 5px 0; text-align: right;" > L ${(item.price * item.quantity).toFixed(2)} </td>
              </tr>
                `).join('');

    return `
              < !DOCTYPE html >
                <html>
                <head>
                <style>
                @page { margin: 0; }
          body { font - family: 'Courier New', Courier, monospace; font - size: 12px; width: ${settings.printerSize === '58mm' ? '180px' : '280px'}; margin: 0 auto; color: #000; padding: 10px; }
          .center { text - align: center; }
          .bold { font - weight: bold; }
          .hr { border - top: 1px dashed #000; margin: 10px 0; }
          table { width: 100 %; border - collapse: collapse; }
          .footer { font - size: 10px; margin - top: 20px; }
          .row { display: flex; justify - content: space - between; margin - bottom: 2px; }
      </style>
        </head>
        < body >
        <div class="center" >
          ${settings.logo ? `<img src="${settings.logo}" style="max-height: 50px; margin-bottom: 5px;">` : ''}
      <h2 style="margin: 0; font-size: 14px;" > ${settings.name} </h2>
        < p style = "margin: 2px 0;" > RTN: ${settings.rtn} </p>
          < p style = "margin: 2px 0;" > ${settings.address} </p>
            < p style = "margin: 2px 0;" > Tel: ${settings.phone} </p>
              < div class="hr" > </div>
                < p class="bold" style = "font-size: 14px;" > ${title} </p>
                  < p class="bold" > NO.${sale.folio} </p>
                    < p style = "font-size: 10px;" > ${dateStr} </p>
                      </div>

                      < div class="hr" > </div>
                        < p > <strong>Cliente: </strong> ${customer?.name || 'Consumidor Final'}</p >
                          ${customer?.rtn ? `<p><strong>RTN:</strong> ${customer.rtn}</p>` : ''}

      <div class="hr" > </div>
        <table>
          ${itemsHtml}
      </table>

        < div class="hr" > </div>
          < div class="bold" >
            <div class="row" > <span>Subtotal: </span><span>L ${sale.subtotal.toFixed(2)}</span > </div>
              < div class="row" > <span>ISV(15 %): </span><span>L ${sale.taxAmount.toFixed(2)}</span > </div>
          ${sale.discount > 0 ? `<div class="row"><span>Descuento:</span><span>-L ${sale.discount.toFixed(2)}</span></div>` : ''}

      <div class="hr" style = "border-top-style: solid;" > </div>
        < div class="row" style = "font-size: 14px;" > <span>TOTAL: </span><span>L ${sale.total.toFixed(2)}</span > </div>
          
          ${isOrder ? `
            <div class="hr"></div>
            <div class="row"><span>ANTICIPO:</span><span>L ${(sale.deposit || 0).toFixed(2)}</span></div>
            <div class="row" style="font-size: 14px;"><span>PENDIENTE:</span><span>L ${(sale.balance || 0).toFixed(2)}</span></div>
          ` : ''
      }
      </div>

        < div class="hr" > </div>
          < p > <strong>Pago: </strong> ${sale.paymentMethod}</p >
            ${!isOrder && sale.paymentDetails?.cash ? `<p>Efectivo: L ${sale.paymentDetails.cash.toFixed(2)}</p>` : ''}
        ${!isOrder && sale.paymentDetails?.cash && sale.paymentDetails.cash >= sale.total ? `<p>Cambio: L ${(sale.paymentDetails.cash - sale.total).toFixed(2)}</p>` : ''}

        ${isFiscal ? `
          <div class="hr"></div>
          <div style="font-size: 10px;">
            <p><strong>CAI:</strong> ${settings.cai}</p>
            <p><strong>Rango Atzr:</strong><br/>${settings.billingRangeStart} al ${settings.billingRangeEnd}</p>
            <p><strong>Fecha Límite:</strong> ${settings.billingDeadline}</p>
          </div>
        ` : ''
      }

      <div class="footer center" >
        <p class="bold" > ${settings.thanksMessage || '¡Gracias por su compra!'} </p>
          < div style = "font-size: 8px; margin-top: 5px; text-align: left;" >
            ${settings.warrantyPolicy ? `<p><strong>Garantía:</strong> ${settings.warrantyPolicy}</p>` : ''}
            ${settings.returnPolicy ? `<p><strong>Devoluciones:</strong> ${settings.returnPolicy}</p>` : ''}
      </div>
        < hr />
        <p>${isFiscal ? 'ORIGINAL: CLIENTE / COPIA: EMISOR' : 'ESTE NO ES UN DOCUMENTO FISCAL'} </p>
          </div>
          </body>
          </html>
            `;
  }

  async generateCreditContractHTML(sale: Sale, customer: Customer, settings: CompanySettings): Promise<string> {
    const today = new Date().toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' });
    const amount = sale.total - (sale.paymentDetails?.credit || 0);

    return `
          < html >
          <head>
          <style>
          body { font - family: 'Arial', sans - serif; line - height: 1.5; padding: 40px; color: #333; font - size: 12px; }
              .header { text - align: center; margin - bottom: 30px; }
              .logo { max - width: 100px; margin - bottom: 10px; }
              h1 { text - size: 18px; margin - bottom: 5px; }
              .section { margin - top: 20px; }
              .bold { font - weight: bold; }
              .signature - box { margin - top: 60px; display: flex; justify - content: space - between; }
              .signature { border - top: 1px solid #000; width: 200px; text - align: center; padding - top: 5px; }
      @page { size: letter; margin: 20mm; }
      </style>
        </head>
        < body >
        <div class="header" >
          ${settings.logo ? `<img src="${settings.logo}" class="logo" />` : ''}
      <h1>CONTRATO DE VENTA AL CRÉDITO </h1>
        < p > ${settings.name} / RTN: ${settings.rtn}</p >
          </div>

          < p > En la ciudad de ${settings.legalCity || '________'}, a los ${today}, entre < strong > ${settings.legalOwnerName || settings.name} </strong>, en adelante designado como EL VENDEDOR, y el Sr(a). <strong>${customer.name}</strong >, identificado con Identidad / RTN < strong > ${customer.dni || customer.rtn || '________'} </strong>, en adelante designado como EL COMPRADOR, se conviene lo siguiente:</p >

            <div class="section" >
              <p class="bold text-lg" > CLÁUSULAS: </p>
                < p > <strong>PRIMERA(Objeto): </strong> EL VENDEDOR vende a EL COMPRADOR los productos detallados en la factura/ticket No. < strong > ${sale.folio} </strong> por un valor total de <strong>L ${sale.total.toFixed(2)}</strong >.</p>

                  < p > <strong>SEGUNDA(Condiciones de Pago): </strong> EL COMPRADOR se obliga a pagar el monto financiado de <strong>L ${(sale.total - (sale.deposit || 0)).toFixed(2)}</strong > en ${sale.paymentDetails?.credit ? 'cuotas mensuales' : 'el plazo estipulado'} según el plan de pagos adjunto.</p>

                    < p > <strong>TERCERA(Intereses): </strong> EL COMPRADOR acepta una tasa de interés mensual del <strong>${settings.defaultCreditRate}%</strong > sobre saldos pendientes.</p>

                      < p > <strong>CUARTA(Incumplimiento): </strong> El atraso en el pago de una o más cuotas dará derecho a EL VENDEDOR a dar por vencido el plazo y exigir el pago total, además de aplicar los recargos por mora correspondientes.</p >

                        <p><strong>QUINTA(Dominio): </strong> EL VENDEDOR se reserva el dominio de los artículos vendidos hasta que el pago total de la deuda sea cancelado.</p >
                          </div>

                          < div class="signature-box" >
                            <div class="signature" >
                              <p class="bold" > EL VENDEDOR </p>
                                < p > ${settings.name} </p>
                                  </div>
                                  < div class="signature" >
                                    <p class="bold" > EL COMPRADOR </p>
                                      < p > ${customer.name} </p>
                                        </div>
                                        </div>

                                        < div style = "margin-top: 40px; font-size: 10px; color: #666; text-align: center;" >
                                          Documento generado el ${new Date().toLocaleString()} por Creativos Gift POS.
          </div>
                                            </body>
                                            </html>
                                              `;
  }

  async generateCreditPagareHTML(sale: Sale, customer: Customer, settings: CompanySettings): Promise<string> {
    const today = new Date().toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' });
    const amountFinanced = sale.total - (sale.deposit || 0);

    return `
                                            < html >
                                            <head>
                                            <style>
                                            body { font - family: 'Times New Roman', serif; line - height: 1.6; padding: 60px; color: #000; font - size: 14px; }
              .container { border: 2px solid #000; padding: 40px; position: relative; }
              h1 { text - align: center; text - decoration: underline; margin - bottom: 30px; font - size: 24px; }
              .amount - box { position: absolute; top: 20px; right: 20px; font - weight: bold; border: 1px solid #000; padding: 5px 15px; }
              .text { text - align: justify; }
              .footer { margin - top: 100px; display: flex; flex - direction: column; align - items: center; }
              .line { border - top: 1px solid #000; width: 300px; margin - bottom: 5px; }
      @page { size: letter; margin: 30mm; }
      </style>
        </head>
        < body >
        <div class="container" >
          <div class="amount-box" > POR L ${amountFinanced.toFixed(2)} </div>
            < h1 > PAGARÉ </h1>

            < div class="text" >
              <p>Yo, <strong>${customer.name} </strong>, mayor de edad, con número de Identidad/RTN < strong > ${customer.dni || customer.rtn || '________'} </strong>, por medio del presente documento, me obligo a pagar de forma incondicional a la orden de <strong>${settings.legalOwnerName || settings.name}</strong >, la suma de < strong > ${amountFinanced.toFixed(2)} LEMPIRAS(L ${amountFinanced.toFixed(2)}) < /strong>.</p >

                <p>Dicho pago se realizará en la ciudad de ${settings.legalCity || '________'}, según el plan de amortización estipulado en la Factura No. < strong > ${sale.folio} </strong>. El incumplimiento de cualquier pago facultará al acreedor a exigir el total de la deuda restante.</p >

                  <p>Acepto que cualquier saldo en mora devengará un interés adicional del < strong > ${settings.defaultCreditRate}% </strong> mensual. En caso de acción judicial, renuncio expresamente a mi domicilio y me someto a los tribunales competentes que el acreedor elija.</p >
                    </div>

                    < div class="footer" >
                      <p>En fe de lo cual, firmo el presente en ${settings.legalCity || '________'}, a los ${today}.</p>
                        < div style = "margin-top: 60px;" >
                          <div class="line" > </div>
                            < p > <strong>HUELLA Y FIRMA DEL DEUDOR < /strong></p >
                              <p>${customer.name} </p>
                                </div>
                                </div>
                                </div>
                                </body>
                                </html>
                                  `;
  }

  async generatePaymentPlanHTML(sale: Sale): Promise<string> {
    if (!sale.isOrder && sale.paymentMethod !== 'Crédito') return "Este documento solo aplica para ventas al crédito.";

    const installments = [];
    const principal = sale.total - (sale.deposit || 0);
    const months = (sale as any).creditData?.term || 1;
    const monthlyAmt = (sale as any).creditData?.monthlyPayment || (principal / months);

    for (let i = 1; i <= months; i++) {
      const dueDate = new Date(sale.date);
      dueDate.setMonth(dueDate.getMonth() + i);
      installments.push({
        num: i,
        date: dueDate.toLocaleDateString(),
        amount: monthlyAmt
      });
    }

    return `
                                < html >
                                <head>
                                <style>
                                body { font - family: sans - serif; padding: 30px; }
              table { width: 100 %; border - collapse: collapse; margin - top: 20px; }
      th, td { border: 1px solid #ddd; padding: 12px; text - align: center; }
              th { background - color: #f2f2f2; }
              .header { text - align: center; margin - bottom: 20px; }
              .folio { font - weight: bold; color: #4F46E5; }
      @page { size: portrait; }
      </style>
        </head>
        < body >
        <div class="header" >
          <h1>Plan de Pagos </h1>
            < p > Referencia Venta: <span class="folio" > ${sale.folio} </span></p >
              <p>Fecha de Venta: ${new Date(sale.date).toLocaleDateString()} </p>
                </div>

                < table >
                <thead>
                <tr>
                <th>Cuota # </th>
                  < th > Fecha de Vencimiento </th>
                    < th > Monto a Pagar </th>
                      < th > Estado </th>
                      </tr>
                      </thead>
                      <tbody>
                  ${installments.map(ins => `
                      <tr>
                          <td>${ins.num}</td>
                          <td>${ins.date}</td>
                          <td>L ${ins.amount.toFixed(2)}</td>
                          <td>Pendiente</td>
                      </tr>
                  `).join('')
      }
      </tbody>
        </table>

        < div style = "margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 10px; font-size: 12px;" >
          <p><strong>Nota: </strong> Los pagos deben realizarse en la fecha estipulada para evitar cargos por mora.</p >
            </div>
            </body>
            </html>
              `;
  }

  /**
   * RECONCILE STOCK FROM SALES HISTORY
   * Recalculates the correct stock for all products based on:
   * 1. The current stock in cloud (as initial baseline)
   * 2. All local inventory movements (sales, purchases, adjustments)
   * 
   * Use this to fix stock discrepancies after sync issues.
   */
  async reconcileStockFromMovements(): Promise<{ fixed: number; details: string[] }> {
    const details: string[] = [];
    let fixed = 0;

    try {
      // Get all products
      const products = await db_engine.products.toArray();

      // Get all inventory movements
      const allMovements = await db_engine.inventoryHistory.toArray();

      // Group movements by product
      const movementsByProduct = new Map<string, any[]>();
      for (const movement of allMovements) {
        const existing = movementsByProduct.get(movement.productId) || [];
        existing.push(movement);
        movementsByProduct.set(movement.productId, existing);
      }

      for (const product of products) {
        const movements = movementsByProduct.get(product.id) || [];

        if (movements.length === 0) continue;

        // Sort movements by date
        movements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // The newest movement should have the correct newStock
        const latestMovement = movements[movements.length - 1];
        const expectedStock = latestMovement.newStock;

        if (product.stock !== expectedStock) {
          const oldStock = product.stock;
          product.stock = expectedStock;
          product.updatedAt = this.getLocalNowISO();
          await db_engine.products.put(product);

          details.push(`${product.name}: ${oldStock} → ${expectedStock} `);
          fixed++;
        }
      }

      // Trigger sync after reconciliation
      const settings = await this.getSettings();
      // Note: Full sync can be triggered manually from settings if needed

      logger.log(`✅ Reconciliación completada: ${fixed} productos corregidos`);
      return { fixed, details };
    } catch (e: any) {
      console.error('❌ Error en reconciliación:', e);
      throw e;
    }
  }

  /**
   * FORCE PUSH: Upload all local products to cloud with current stock
   * Use this to make the cloud match your local data (phone wins)
   */
  async forcePushProductsToCloud(): Promise<{ success: boolean; count: number }> {
    try {
      const products = await db_engine.products.toArray();

      // Mark all products with current timestamp
      for (const p of products) {
        p.updatedAt = this.getLocalNowISO();
        await db_engine.products.put(p);
      }

      // Force sync
      const { SupabaseService } = await import('./supabaseService');
      await SupabaseService.syncAll();

      logger.log(`☁️ Force push: ${products.length} productos subidos a la nube`);
      return { success: true, count: products.length };
    } catch (e: any) {
      console.error('❌ Error en force push:', e);
      return { success: false, count: 0 };
    }
  }

  /**
   * GENERATE BARCODE LABELS
   * Creates a printable HTML sheet of product labels with barcodes.
   */
  async generateBarcodeLabels(productIds: string[], labelsPerProduct: number = 1): Promise<string> {
    const settings = await this.getSettings();
    const products = await Promise.all(productIds.map(id => db_engine.products.get(id)));
    const validProducts = products.filter(Boolean) as Product[];

    const labels: string[] = [];
    for (const p of validProducts) {
      for (let i = 0; i < labelsPerProduct; i++) {
        labels.push(`
        < div class="label" >
          ${settings.showLogoOnBarcode && settings.logo ? `<img src="${settings.logo}" class="logo" alt="logo">` : ''}
      <p class="name" > ${p.name} </p>
        < svg class="barcode" > </svg>
          < p class="code" > ${p.code} </p>
            < p class="price" > L ${p.price.toFixed(2)} </p>
              </div>
                `);
      }
    }

    const bw = settings.barcodeWidth || 50;
    const bh = settings.barcodeHeight || 25;
    const logoSize = settings.barcodeLogoSize || 10;

    return `
              < !DOCTYPE html >
                <html>
                <head>
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3/dist/JsBarcode.all.min.js" > </script>
                  <style>
      @page { size: letter; margin: 10mm; }
          body { font - family: sans - serif; display: flex; flex - wrap: wrap; gap: 5mm; justify - content: center; }
          .label { width: ${bw} mm; height: ${bh} mm; border: 1px solid #ccc; padding: 2mm; box - sizing: border - box; text - align: center; display: flex; flex - direction: column; justify - content: center; align - items: center; page -break-inside: avoid; overflow: hidden; }
          .label.logo { height: ${logoSize} mm; object - fit: contain; margin - bottom: 1mm; }
          .label.name { font - size: 8px; font - weight: bold; margin: 0; white - space: nowrap; overflow: hidden; text - overflow: ellipsis; max - width: 100 %; }
          .label.barcode { width: 100 %; max - height: ${bh * 0.4} mm; }
          .label.code { font - size: 7px; margin: 0; color: #555; }
          .label.price { font - size: 10px; font - weight: bold; margin: 0; color: #000; }
      </style>
        </head>
        <body>
        ${labels.join('')}
      <script>
        document.querySelectorAll('.label').forEach(lbl => {
          const code = lbl.querySelector('.code')?.textContent || 'N/A';
          const svg = lbl.querySelector('.barcode');
          if (svg && code) {
            JsBarcode(svg, code, { format: "CODE128", height: 30, displayValue: false, margin: 0 });
          }
        });
      // Add print toolbar for preview
      window.onload = () => {
        const toolbar = document.createElement('div');
        toolbar.id = 'print-toolbar';
        toolbar.innerHTML = '<style>#print-toolbar{position:fixed;top:0;left:0;right:0;background:linear-gradient(135deg,#667eea,#764ba2);padding:12px 20px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 2px 10px rgba(0,0,0,0.2);z-index:9999}@media print{#print-toolbar{display:none!important}}body{padding-top:60px!important}</style><span style="color:white;font-weight:bold;font-size:14px">📋 Previsualización - Etiquetas</span><div style="display:flex;gap:10px"><button onclick="document.getElementById(\\'print - toolbar\\').style.display=\\'none\\';window.print();document.getElementById(\\'print - toolbar\\').style.display=\\'flex\\';" style="background:white;color:#667eea;border:none;padding:8px 20px;border-radius:6px;font-weight:bold;cursor:pointer">🖨️ Imprimir</button><button onclick="window.close();" style="background:rgba(255,255,255,0.2);color:white;border:1px solid rgba(255,255,255,0.3);padding:8px 16px;border-radius:6px;cursor:pointer">✕ Cerrar</button></div>';
        document.body.insertBefore(toolbar, document.body.firstChild);
      };
      </script>
        </body>
        </html>
          `;
  }

  /**
   * GENERATE WHATSAPP CATALOG
   * Creates a shareable HTML page or blob for WhatsApp sharing.
   */
  async generateCatalogHTML(categoryId?: string): Promise<string> {
    const settings = await this.getSettings();
    let productsToShow = await this.getProducts();

    if (categoryId && categoryId !== 'all') {
      productsToShow = productsToShow.filter(p => p.categoryId === categoryId);
    }

    const categories = await this.getCategories();

    const productCards = productsToShow.map(p => {
      const cat = categories.find(c => c.id === p.categoryId);
      return `
        < div class="product-card" >
          ${p.image ? `<img src="${p.image}" alt="${p.name}" class="product-img">` : `<div class="product-img placeholder"><i class="fas fa-box"></i></div>`}
      <h3>${p.name} </h3>
        < p class="cat" > ${cat?.name || 'General'} </p>
          < p class="price" > L ${p.price.toFixed(2)} </p>
          ${p.stock <= p.minStock ? '<span class="low-stock">¡Pocas unidades!</span>' : ''}
      </div>
        `;
    }).join('');

    return `
        < !DOCTYPE html >
          <html lang="es" >
            <head>
            <meta charset="UTF-8" >
              <meta name="viewport" content = "width=device-width, initial-scale=1.0" >
                <title>Catálogo - ${settings.name} </title>
                  < link rel = "stylesheet" href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" >
                    <style>
          * { box- sizing: border - box; margin: 0; padding: 0;
    }
          body { font - family: 'Segoe UI', sans - serif; background: linear - gradient(135deg, #f5f7fa 0 %, #c3cfe2 100 %); min - height: 100vh; padding: 20px; }
          .header { text - align: center; padding: 20px; margin - bottom: 20px; }
          .header img { max - height: 80px; margin - bottom: 10px; }
          .header h1 { font - size: 24px; color: #333; }
          .header p { color: #666; font - size: 14px; }
          .grid { display: grid; grid - template - columns: repeat(auto - fill, minmax(160px, 1fr)); gap: 15px; max - width: 1200px; margin: 0 auto; }
          .product - card { background: white; border - radius: 12px; overflow: hidden; box - shadow: 0 4px 15px rgba(0, 0, 0, 0.1); transition: transform 0.2s; }
          .product - card:hover { transform: translateY(-5px); }
          .product - img { width: 100 %; height: 120px; object - fit: cover; background: #f0f0f0; display: flex; align - items: center; justify - content: center; color: #ccc; font - size: 30px; }
          .product - img.placeholder { background: linear - gradient(135deg, #e0e0e0, #f5f5f5); }
          .product - card h3 { font - size: 13px; padding: 10px 10px 0; color: #333; white - space: nowrap; overflow: hidden; text - overflow: ellipsis; }
          .product - card.cat { font - size: 10px; color: #888; padding: 0 10px; }
          .product - card.price { font - size: 16px; font - weight: bold; color: #4F46E5; padding: 5px 10px 10px; }
          .product - card.low - stock { display: block; background: #fee2e2; color: #ef4444; font - size: 9px; text - align: center; padding: 3px; font - weight: bold; }
          .footer { text - align: center; margin - top: 30px; color: #888; font - size: 12px; }
          .footer a { color: #25D366; text - decoration: none; font - weight: bold; }
    </style>
      </head>
      < body >
      <div class="header" >
        ${settings.logo ? `<img src="${settings.logo}" alt="Logo">` : ''}
    <h1>${settings.name} </h1>
      <p>📍 ${settings.address} | 📞 ${settings.phone} </p>
        </div>
        < div class="grid" >
          ${productCards}
    </div>
      < div class="footer" >
        <p>¿Interesado ? <a href="https://wa.me/${settings.whatsappNumber?.replace(/\D/g, '')}" > <i class="fab fa-whatsapp" > </i> Escríbenos por WhatsApp</a > </p>
          < p style = "margin-top: 10px;" > Catálogo generado por ${settings.name} </p>
            </div>
            </body>
            </html>
              `;
  }
  /**
   * PROFITABILITY REPORT
   * Calculates real profit by subtracting COGS, consumables, and expenses from revenue.
   */
  async getProfitabilityReport(startDate: string, endDate: string): Promise<{
    revenue: number;
    cogs: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
    margin: number;
    breakdown: { category: string; amount: number }[];
  }> {
    const sales = await db_engine.sales.toArray();
    const expenses = await db_engine.expenses.toArray();

    // Filter sales by date range and status
    const filteredSales = sales.filter(s => {
      if (s.status !== 'active') return false;
      const saleDate = s.date.split('T')[0];
      return saleDate >= startDate && saleDate <= endDate;
    });

    // Calculate Revenue and COGS
    let revenue = 0;
    let cogs = 0;
    for (const sale of filteredSales) {
      for (const item of sale.items) {
        revenue += item.price * item.quantity;
        cogs += (item.cost || 0) * item.quantity;
      }
    }

    const grossProfit = revenue - cogs;

    // Filter expenses by date range
    const filteredExpenses = expenses.filter(e => {
      const expDate = e.date.split('T')[0];
      return expDate >= startDate && expDate <= endDate;
    });

    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Breakdown by expense category
    const breakdown: { category: string; amount: number }[] = [];
    const expenseByCategory: Record<string, number> = {};
    expenseByCategory['Costo de Productos'] = cogs;
    for (const e of filteredExpenses) {
      expenseByCategory[e.categoryId] = (expenseByCategory[e.categoryId] || 0) + e.amount;
    }
    for (const [cat, amt] of Object.entries(expenseByCategory)) {
      breakdown.push({ category: cat, amount: amt });
    }
    breakdown.sort((a, b) => b.amount - a.amount);

    const netProfit = grossProfit - totalExpenses;
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
      revenue,
      cogs,
      grossProfit,
      expenses: totalExpenses,
      netProfit,
      margin,
      breakdown
    };
  }
}

export const db = new StorageService();
