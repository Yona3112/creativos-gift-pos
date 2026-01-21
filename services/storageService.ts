
import { Dexie, Table } from 'dexie';
import {
  Product, Category, User, Sale, Customer, CompanySettings,
  Branch, CreditAccount, Promotion, Supplier, Consumable,
  CashCut, Quote, CreditNote, CreditPayment,
  Expense, FixedExpense, InventoryMovement, MovementType, FulfillmentStatus, ShippingDetails, UserRole,
  PriceHistoryEntry, PaymentDetails
} from '../types';

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
  fixedExpenses!: Table<FixedExpense>;
  inventoryHistory!: Table<InventoryMovement>;
  priceHistory!: Table<PriceHistoryEntry>;

  constructor() {
    super('CreativosGiftDB');
    (this as any).version(2).stores({
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
      fixedExpenses: 'id, active',
      inventoryHistory: '++id, productId, date, type',
      priceHistory: '++id, productId, date'
    });
  }
}

const db_engine = new AppDatabase();

class StorageService {
  getLocalTodayISO() {
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Tegucigalpa" }));
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // --- INITIALIZATION & MIGRATION ---
  async init() {
    const isMigrated = localStorage.getItem('dexie_migrated');
    if (!isMigrated) {
      console.log("Iniciando migración de LocalStorage a IndexedDB...");
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

    // NOTA: La limpieza de duplicados ahora se ejecuta en restoreData()
    // después de que los datos de la nube se han fusionado
  }

  async cleanupDuplicateExpenses() {
    console.log("🔍 Iniciando limpieza de gastos duplicados...");
    try {
      const allExpenses = await db_engine.expenses.toArray();
      const seen = new Set<string>();
      const toDelete: string[] = [];

      for (const exp of allExpenses) {
        // Normalizar fecha (YYYY-MM-DD)
        const normalizedDate = exp.date.substring(0, 10);
        // Crear una clave única basada en el contenido
        const key = `${normalizedDate}|${exp.amount}|${exp.categoryId}|${exp.description}`;

        if (seen.has(key)) {
          toDelete.push(exp.id);
        } else {
          seen.add(key);
        }
      }

      if (toDelete.length > 0) {
        console.log(`🗑️ Eliminando ${toDelete.length} gastos duplicados...`);
        await db_engine.expenses.bulkDelete(toDelete);
      }
    } catch (err) {
      console.warn("⚠️ Error durante la limpieza de gastos:", err);
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
      logo: 'https://i.imgur.com/K6mXQ0j.png' // New brand logo
    };
    return saved ? { ...defaults, ...saved } : defaults;
  }

  async saveSettings(settings: CompanySettings) {
    await db_engine.settings.put({ id: 'main', ...settings });
    if (settings.autoSync) this.triggerAutoSync();
  }

  // --- AUTO SYNC HELPER ---
  private syncTimeout: any = null;
  triggerAutoSync() {
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(async () => {
      const s = await this.getSettings();
      if (s.autoSync && s.supabaseUrl && s.supabaseKey) {
        try {
          const { SupabaseService } = await import('./supabaseService');
          await SupabaseService.syncAll();
          // Update last backup date
          s.lastBackupDate = new Date().toISOString();
          await this.saveSettings(s);
          console.log("🔄 Auto-sync completado con éxito");
        } catch (e) {
          console.error("❌ Error en auto-sync:", e);
        }
      }
    }, 5000); // Wait 5s after last change before syncing
  }

  async checkAndAutoSync() {
    const s = await this.getSettings();
    if (!s.autoSync || !s.supabaseUrl || !s.supabaseKey) return;

    const lastSync = s.lastBackupDate ? new Date(s.lastBackupDate).getTime() : 0;
    const now = new Date().getTime();
    const threeHours = 3 * 60 * 60 * 1000;

    if (now - lastSync > threeHours) {
      console.log("🕒 Han pasado más de 3 horas. Iniciando backup automático...");
      try {
        const { SupabaseService } = await import('./supabaseService');
        await SupabaseService.syncAll();
        s.lastBackupDate = new Date().toISOString();
        await this.saveSettings(s);
      } catch (e) {
        console.error("❌ Error en backup automático programado:", e);
      }
    }
  }

  // --- SEQUENTIAL CODE GENERATORS ---
  async getNextProductCodeSequential(): Promise<string> {
    const settings = await this.getSettings();
    const nextNum = (settings.currentProductCode || 1);
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
        date: new Date().toISOString(),
        userId
      });
    }

    await db_engine.products.put(product);
    const settings = await this.getSettings();
    if (settings.autoSync) this.triggerAutoSync();
  }

  async deleteProduct(id: string) {
    const p = await db_engine.products.get(id);
    if (p) {
      p.active = false;
      await db_engine.products.put(p);
      const settings = await this.getSettings();
      if (settings.autoSync) this.triggerAutoSync();
    }
  }

  async updateStock(items: { id: string, quantity: number }[], type: MovementType, userId: string, refId?: string) {
    for (const item of items) {
      const p = await db_engine.products.get(item.id);
      if (p) {
        const prev = p.stock;
        p.stock -= item.quantity;
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
      date: new Date().toISOString()
    });
  }

  // Método público para guardar movimientos de inventario (usado por auditorías)
  async saveInventoryMovement(movement: InventoryMovement) {
    await db_engine.inventoryHistory.add(movement);
    const settings = await this.getSettings();
    if (settings.autoSync) this.triggerAutoSync();
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
    await db_engine.categories.put(cat);
    const settings = await this.getSettings();
    if (settings.autoSync) this.triggerAutoSync();
  }

  async deleteCategory(id: string) {
    const cat = await db_engine.categories.get(id);
    if (cat) {
      cat.active = false;
      await db_engine.categories.put(cat);
      const settings = await this.getSettings();
      if (settings.autoSync) this.triggerAutoSync();
    }
  }

  // --- CUSTOMERS ---
  async getCustomers(): Promise<Customer[]> {
    const customers = await db_engine.customers.toArray();
    return customers.filter(c => c.active !== false);
  }
  async saveCustomer(c: Customer) {
    // Auto-generate ID if not provided (new customer)
    if (!c.id) {
      c.id = Date.now().toString() + Math.random().toString(36).substring(2, 7);
    }
    await db_engine.customers.put(c);
    const settings = await this.getSettings();
    if (settings.autoSync) this.triggerAutoSync();
  }
  async deleteCustomer(id: string) {
    const c = await db_engine.customers.get(id);
    if (c) {
      c.active = false;
      await db_engine.customers.put(c);
      const settings = await this.getSettings();
      if (settings.autoSync) this.triggerAutoSync();
    }
  }

  // --- SALES ---
  async getSales(): Promise<Sale[]> { return await db_engine.sales.toArray(); }

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
        const deadline = new Date(settings.billingDeadline + 'T23:59:59');
        if (new Date() > deadline) {
          throw new Error(`La fecha límite de emisión de facturas ha expirado (${settings.billingDeadline}).`);
        }

        // 3. Validar CAI
        if (!settings.cai || settings.cai === '000-000-000-000') {
          throw new Error('Debe configurar un CAI válido en los ajustes antes de facturar.');
        }

        settings.currentInvoiceNumber++;
        folio = `${startParts[0]}-${startParts[1]}-${startParts[2]}-${nextNum.toString().padStart(8, '0')}`;
      } else {
        const nextNum = settings.currentTicketNumber || 1;
        settings.currentTicketNumber = nextNum + 1;
        folio = `T-${nextNum.toString().padStart(6, '0')}`;
      }
      await this.saveSettings(settings);

      const newSale: Sale = {
        id: `sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        folio,
        date: new Date().toISOString(),
        items: data.items || [],
        subtotal: data.subtotal || 0,
        taxAmount: data.taxAmount || 0,
        discount: data.discount || 0,
        total: data.total || 0,
        paymentMethod: data.paymentMethod || 'Efectivo',
        paymentDetails: data.paymentDetails,
        customerId: data.customerId,
        userId: data.userId || 'admin',
        branchId: data.branchId || 'main',
        status: 'active',
        cai: data.documentType === 'FACTURA' ? settings.cai : undefined,
        documentType: data.documentType,
        pointsUsed: data.pointsUsed,
        pointsMonetaryValue: data.pointsMonetaryValue,
        fulfillmentStatus: data.fulfillmentStatus || 'delivered',
        shippingDetails: data.shippingDetails,
        isOrder: data.isOrder,
        deposit: data.deposit,
        balance: data.balance
      };

      await db_engine.sales.add(newSale);

      // Actualizar Stock y Kardex
      await this.updateStock(
        newSale.items.filter(i => !i.id.startsWith('manual-')),
        'SALE',
        newSale.userId,
        newSale.folio
      );

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
          date: new Date().toISOString(),
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
          dueDate: new Date(Date.now() + (data.creditData.term * 30 * 24 * 60 * 60 * 1000)).toISOString(),
          createdAt: new Date().toISOString(),
          payments: initialPayments as CreditPayment[],
          interestRate: data.creditData.rate,
          termMonths: data.creditData.term,
          monthlyPayment: data.creditData.monthlyPayment
        });
      }

      if (settings.autoSync) this.triggerAutoSync();
      return newSale;
    });
  }

  async cancelSale(saleId: string, userId: string = 'system', refundType: 'cash' | 'creditNote' = 'creditNote') {
    await db_engine.transaction('rw', [db_engine.sales, db_engine.products, db_engine.inventoryHistory, db_engine.customers, db_engine.settings, db_engine.creditNotes], async () => {
      const sale = await db_engine.sales.get(saleId);
      if (sale && sale.status === 'active') {
        const settings = await this.getSettings();
        sale.status = 'cancelled';
        await db_engine.sales.put(sale);

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
        let refundable = sale.total;
        if (sale.paymentMethod === 'Crédito') refundable = 0;

        if (refundable > 0) {
          if (refundType === 'cash') {
            // Devolución en efectivo: registrar como nota de crédito USADA inmediatamente
            await db_engine.creditNotes.add({
              id: Date.now().toString(),
              folio: `DEV-${sale.folio}`,
              saleId: sale.id,
              customerId: sale.customerId || '',
              originalTotal: refundable,
              remainingAmount: 0, // Ya devuelto
              reason: 'Devolución en Efectivo',
              date: new Date().toISOString(),
              status: 'used' // Marcada como usada porque ya se devolvió el dinero
            });
          } else {
            // Nota de Crédito tradicional: disponible para uso futuro
            await db_engine.creditNotes.add({
              id: Date.now().toString(),
              folio: `NC-${sale.folio}`,
              saleId: sale.id,
              customerId: sale.customerId || '',
              originalTotal: refundable,
              remainingAmount: refundable,
              reason: 'Anulación de Venta',
              date: new Date().toISOString(),
              status: 'active'
            });
          }
        }

        if (settings.autoSync) this.triggerAutoSync();
      }
    });
  }

  // --- EXPENSES ---
  async getExpenses(): Promise<Expense[]> { return await db_engine.expenses.toArray(); }
  async saveExpense(e: Expense) {
    if (!e.id) {
      // Create a more unique ID to avoid collisions during sync
      e.id = `exp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    // Normalize date for comparison (YYYY-MM-DD)
    const normalizedDate = e.date.substring(0, 10);

    // Check for potential duplicate before saving (same date, amount, category and description)
    // We search for ANY record starting with the same date part
    const existing = await db_engine.expenses
      .filter(item => {
        const itemDate = item.date.substring(0, 10);
        return itemDate === normalizedDate &&
          item.amount === e.amount &&
          item.categoryId === e.categoryId &&
          item.description === e.description &&
          item.id !== e.id;
      })
      .first();

    if (existing) {
      console.warn("⚠️ Detectado posible gasto duplicado, omitiendo guardado automático.");
      return existing.id;
    }

    await db_engine.expenses.put(e);
    const settings = await this.getSettings();
    if (settings.autoSync) this.triggerAutoSync();
    return e.id;
  }
  async deleteExpense(id: string) {
    await db_engine.expenses.delete(id);
    const settings = await this.getSettings();
    if (settings.autoSync) {
      // Eliminar de la nube también
      import('./supabaseService').then(({ SupabaseService }) => {
        SupabaseService.deleteFromTable('expenses', id);
      });
    }
  }

  // --- GASTOS FIJOS (RECURRENTES) ---
  async getFixedExpenses(): Promise<FixedExpense[]> {
    return db_engine.fixedExpenses.toArray();
  }
  async saveFixedExpense(fe: FixedExpense): Promise<string> {
    if (!fe.id) fe.id = `fe-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    await db_engine.fixedExpenses.put(fe);
    this.triggerAutoSync();
    return fe.id;
  }
  async deleteFixedExpense(id: string): Promise<void> {
    await db_engine.fixedExpenses.delete(id);
    this.triggerAutoSync();
  }

  // --- CREDITS ---
  async getCredits(): Promise<CreditAccount[]> { return await db_engine.credits.toArray(); }
  async addCreditPayment(creditId: string, payment: Omit<CreditPayment, 'id'>) {
    const c = await db_engine.credits.get(creditId);
    if (c) {
      const p = { ...payment, id: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` };
      c.payments.push(p);
      c.paidAmount += payment.amount;
      if (c.paidAmount >= c.totalAmount - 0.1) c.status = 'paid';
      await db_engine.credits.put(c);
      const settings = await this.getSettings();
      if (settings.autoSync) this.triggerAutoSync();
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
          const MAX_WIDTH = 400;
          const scale = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          // Usamos WebP para máxima compresión
          resolve(canvas.toDataURL('image/webp', 0.6));
        };
      };
    });
  }

  // --- LEGACY COMPATIBILITY WRAPPERS (To avoid breaking App.tsx) ---
  async getSuppliers() {
    const items = await db_engine.suppliers.toArray();
    return items.filter(i => i.active !== false);
  }
  async saveSupplier(s: Supplier) {
    if (!s.id) s.id = Date.now().toString();
    if (s.active === undefined) s.active = true;
    await db_engine.suppliers.put(s);
    const settings = await this.getSettings();
    if (settings.autoSync) this.triggerAutoSync();
  }
  async deleteSupplier(id: string) {
    const s = await db_engine.suppliers.get(id);
    if (s) {
      s.active = false;
      await db_engine.suppliers.put(s);
      const settings = await this.getSettings();
      if (settings.autoSync) this.triggerAutoSync();
    }
  }
  async getConsumables() {
    const items = await db_engine.consumables.toArray();
    return items.filter(i => i.active !== false);
  }
  async saveConsumable(c: Consumable) {
    if (!c.id) c.id = Date.now().toString();
    if (c.active === undefined) c.active = true;
    await db_engine.consumables.put(c);
    const settings = await this.getSettings();
    if (settings.autoSync) this.triggerAutoSync();
  }
  async deleteConsumable(id: string) {
    const c = await db_engine.consumables.get(id);
    if (c) {
      c.active = false;
      await db_engine.consumables.put(c);
      const settings = await this.getSettings();
      if (settings.autoSync) this.triggerAutoSync();
    }
  }
  async getPromotions() { return await db_engine.promotions.toArray(); }
  async savePromotion(p: Promotion) {
    if (!p.id) p.id = Date.now().toString();
    await db_engine.promotions.put(p);
    const settings = await this.getSettings();
    if (settings.autoSync) this.triggerAutoSync();
  }
  async deletePromotion(id: string) {
    const p = await db_engine.promotions.get(id);
    if (p) {
      p.active = false;
      await db_engine.promotions.put(p);
      const settings = await this.getSettings();
      if (settings.autoSync) this.triggerAutoSync();
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

    await db_engine.users.put(u);
    const settings = await this.getSettings();
    if (settings.autoSync) this.triggerAutoSync();
  }
  async deleteUser(id: string) {
    const u = await db_engine.users.get(id);
    if (u) {
      u.active = false;
      await db_engine.users.put(u);
      const settings = await this.getSettings();
      if (settings.autoSync) this.triggerAutoSync();
    }
  }
  async getBranches() {
    const branches = await db_engine.branches.toArray();
    return branches.filter(b => b.active !== false);
  }
  async saveBranch(b: Branch) {
    if (!b.id) b.id = Date.now().toString();
    await db_engine.branches.put(b);
    const settings = await this.getSettings();
    if (settings.autoSync) this.triggerAutoSync();
  }
  async getQuotes() {
    const quotes = await db_engine.quotes.toArray();
    // Filtrar cotizaciones eliminadas (soft-delete)
    return quotes.filter(q => q.status !== 'deleted');
  }
  async saveQuote(q: Quote) {
    if (!q.id) q.id = Date.now().toString();
    await db_engine.quotes.put(q);
    const settings = await this.getSettings();
    if (settings.autoSync) this.triggerAutoSync();
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
      fixedExpenses: await db_engine.fixedExpenses.toArray(),
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
      const settings = await this.getSettings();
      if (settings.autoSync) this.triggerAutoSync();
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
              console.log(`⏭️ Omitiendo gasto duplicado por contenido: ${remoteItem.description}`);
              continue;
            }
          }
          await table.put(remoteItem);
        } else {
          // Item exists locally - compare by date if available
          const remoteDate = remoteItem.date || remoteItem.createdAt || remoteItem.updatedAt;
          const localDate = localItem.date || localItem.createdAt || localItem.updatedAt;

          if (remoteDate && localDate) {
            // Keep the most recent version
            if (new Date(remoteDate) > new Date(localDate)) {
              await table.put(remoteItem);
            }
          } else {
            // If no dates available, remote data wins (user chose to restore/download)
            await table.put(remoteItem);
          }
        }
      }
    };

    // Merge each table intelligently instead of replacing
    if (data.products) await mergeTable(db_engine.products, data.products);
    if (data.categories) await mergeTable(db_engine.categories, data.categories);
    if (data.customers) await mergeTable(db_engine.customers, data.customers);
    if (data.sales) await mergeTable(db_engine.sales, data.sales);
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
      // Normalizar fechas de expenses al formato YYYY-MM-DD
      const normalizedExpenses = data.expenses.map((exp: any) => ({
        ...exp,
        date: exp.date.substring(0, 10) // Convertir 2026-01-18T00:00:00+00:00 a 2026-01-18
      }));
      await mergeTable(db_engine.expenses, normalizedExpenses);
      // Limpiar duplicados DESPUÉS de fusionar datos de la nube
      await this.cleanupDuplicateExpenses();
    }
    if (data.fixedExpenses) await mergeTable(db_engine.fixedExpenses, data.fixedExpenses);
    if (data.inventoryHistory) await mergeTable(db_engine.inventoryHistory, data.inventoryHistory);
    if (data.priceHistory) await mergeTable(db_engine.priceHistory, data.priceHistory);

    // Settings: USE REMOTE as primary, only keep local counters and credentials
    if (data.settings) {
      console.log("🔄 [restoreData] Remote settings:", JSON.stringify({
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

      console.log("🔄 [restoreData] Final merged:", JSON.stringify({
        name: merged.name,
        hasLogo: !!merged.logo,
        logoLength: merged.logo?.length || 0,
      }));

      await db_engine.settings.put(merged);
      console.log("✅ [restoreData] Settings saved");
    }
  }

  calculateEarlyPayoff(credit: CreditAccount) {
    if (credit.status === 'paid' || !credit.interestRate) return null;
    const today = new Date();
    const start = new Date(credit.createdAt);
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
      c.payments.push({
        id: Date.now().toString(),
        date: new Date().toISOString(),
        amount: details.finalAmount,
        method: 'Efectivo',
        note: `Liquidación anticipada. Ahorro: L ${details.savings.toFixed(2)}`
      });
      await db_engine.credits.put(c);
      const settings = await this.getSettings();
      if (settings.autoSync) this.triggerAutoSync();
    }
  }

  async getTodaysCreditPayments(date: string) {
    const credits = await db_engine.credits.toArray();
    let cash = 0, card = 0, transfer = 0;
    credits.forEach(c => {
      c.payments.forEach(p => {
        if (p.date.startsWith(date)) {
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
    await db_engine.cashCuts.put(cut);
    const settings = await this.getSettings();
    if (settings.autoSync) this.triggerAutoSync();
  }

  async getCashCuts(): Promise<CashCut[]> {
    return await db_engine.cashCuts.toArray();
  }

  async deleteCashCut(id: string): Promise<void> {
    await db_engine.cashCuts.delete(id);
    const settings = await this.getSettings();
    if (settings.autoSync) this.triggerAutoSync();
  }

  async getLastCashCut(): Promise<CashCut | null> {
    const cuts = await db_engine.cashCuts.toArray();
    if (cuts.length === 0) return null;
    // Sort by date descending and return the most recent
    cuts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return cuts[0];
  }

  // Check if there are sales from previous day(s) without a corresponding cash cut
  async hasPendingCashCut(): Promise<{ pending: boolean; lastCutDate: string | null; salesWithoutCut: number }> {
    const getLocalDate = (d: Date) => {
      const offset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - offset).toISOString().split('T')[0];
    };

    const today = getLocalDate(new Date());
    const yesterday = getLocalDate(new Date(Date.now() - 86400000));

    const lastCut = await this.getLastCashCut();
    const lastCutDate = lastCut ? getLocalDate(new Date(lastCut.date)) : null;

    // If last cut is from today, we're good
    if (lastCutDate === today) {
      return { pending: false, lastCutDate, salesWithoutCut: 0 };
    }

    // Check if there were sales yesterday (or before) that weren't covered by a cash cut
    const allSales = await db_engine.sales.toArray();
    const salesBeforeToday = allSales.filter(s => {
      const saleDate = getLocalDate(new Date(s.date));
      return saleDate < today && saleDate !== lastCutDate && s.status === 'active';
    });

    // If no last cut exists but there are old sales, they need a cut
    if (!lastCutDate && salesBeforeToday.length > 0) {
      return { pending: true, lastCutDate: null, salesWithoutCut: salesBeforeToday.length };
    }

    // If sales exist from after the last cut but before today, cut is required
    const salesAfterLastCut = allSales.filter(s => {
      const saleDate = getLocalDate(new Date(s.date));
      return saleDate < today && (!lastCutDate || saleDate > lastCutDate) && s.status === 'active';
    });

    if (salesAfterLastCut.length > 0) {
      return { pending: true, lastCutDate, salesWithoutCut: salesAfterLastCut.length };
    }

    return { pending: false, lastCutDate, salesWithoutCut: 0 };
  }

  async refundCreditNote(id: string) {
    const nc = await db_engine.creditNotes.get(id);
    if (nc) {
      nc.remainingAmount = 0;
      nc.status = 'used';
      await db_engine.creditNotes.put(nc);
    }
  }

  async updateSaleStatus(id: string, status: FulfillmentStatus, shippingDetails?: Partial<ShippingDetails>) {
    const sale = await db_engine.sales.get(id);
    if (sale) {
      sale.fulfillmentStatus = status;
      if (shippingDetails) sale.shippingDetails = { ...sale.shippingDetails, ...shippingDetails } as ShippingDetails;
      await db_engine.sales.put(sale);
      const settings = await this.getSettings();
      if (settings.autoSync) this.triggerAutoSync();
    }
  }

  async deleteBranch(id: string) {
    const b = await db_engine.branches.get(id);
    if (b) {
      b.active = false;
      await db_engine.branches.put(b);
      const settings = await this.getSettings();
      if (settings.autoSync) this.triggerAutoSync();
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
    sale.deposit = (sale.deposit || 0) + balance;
    sale.balance = 0;
    sale.isOrder = false; // Ya no está pendiente de pago
    sale.folio = newFolio;
    sale.documentType = newDocType;
    sale.cai = newCAI;

    // Actualizar detalles de pago (append note or merge)
    // Simple merge for now
    sale.paymentDetails = { ...sale.paymentDetails, ...paymentDetails };

    await db_engine.sales.put(sale);
    const settings = await this.getSettings();
    if (settings.autoSync) this.triggerAutoSync();

    return sale;
  }

  // --- PRINTING HELPER ---
  async generateTicketHTML(sale: Sale, customer?: Customer): Promise<string> {
    const settings = await this.getSettings();
    const isFiscal = sale.documentType === 'FACTURA';
    const isOrder = sale.isOrder && (sale.balance || 0) > 0;

    const title = isOrder ? 'TICKET DE PEDIDO' : (isFiscal ? 'FACTURA' : 'TICKET DE VENTA');
    const dateStr = new Date(sale.date).toLocaleString('es-HN');

    const itemsHtml = sale.items.map(item => `
      <tr style="border-bottom: 1px dashed #eee;">
        <td style="padding: 5px 0;">${item.quantity} x ${item.name}</td>
        <td style="padding: 5px 0; text-align: right;">L ${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          @page { margin: 0; }
          body { font-family: 'Courier New', Courier, monospace; font-size: 12px; width: ${settings.printerSize === '58mm' ? '180px' : '280px'}; margin: 0 auto; color: #000; padding: 10px; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .hr { border-top: 1px dashed #000; margin: 10px 0; }
          table { width: 100%; border-collapse: collapse; }
          .footer { font-size: 10px; margin-top: 20px; }
          .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        </style>
      </head>
      <body>
        <div class="center">
          ${settings.logo ? `<img src="${settings.logo}" style="max-height: 50px; margin-bottom: 5px;">` : ''}
          <h2 style="margin: 0; font-size: 14px;">${settings.name}</h2>
          <p style="margin: 2px 0;">RTN: ${settings.rtn}</p>
          <p style="margin: 2px 0;">${settings.address}</p>
          <p style="margin: 2px 0;">Tel: ${settings.phone}</p>
          <div class="hr"></div>
          <p class="bold" style="font-size: 14px;">${title}</p>
          <p class="bold">NO. ${sale.folio}</p>
          <p style="font-size: 10px;">${dateStr}</p>
        </div>

        <div class="hr"></div>
        <p><strong>Cliente:</strong> ${customer?.name || 'Consumidor Final'}</p>
        ${customer?.rtn ? `<p><strong>RTN:</strong> ${customer.rtn}</p>` : ''}
        
        <div class="hr"></div>
        <table>
          ${itemsHtml}
        </table>

        <div class="hr"></div>
        <div class="bold">
          <div class="row"><span>Subtotal:</span><span>L ${sale.subtotal.toFixed(2)}</span></div>
          <div class="row"><span>ISV (15%):</span><span>L ${sale.taxAmount.toFixed(2)}</span></div>
          ${sale.discount > 0 ? `<div class="row"><span>Descuento:</span><span>-L ${sale.discount.toFixed(2)}</span></div>` : ''}
          
          <div class="hr" style="border-top-style: solid;"></div>
          <div class="row" style="font-size: 14px;"><span>TOTAL:</span><span>L ${sale.total.toFixed(2)}</span></div>
          
          ${isOrder ? `
            <div class="hr"></div>
            <div class="row"><span>ANTICIPO:</span><span>L ${(sale.deposit || 0).toFixed(2)}</span></div>
            <div class="row" style="font-size: 14px;"><span>PENDIENTE:</span><span>L ${(sale.balance || 0).toFixed(2)}</span></div>
          ` : ''}
        </div>

        <div class="hr"></div>
        <p><strong>Pago:</strong> ${sale.paymentMethod}</p>
        ${!isOrder && sale.paymentDetails?.cash ? `<p>Efectivo: L ${sale.paymentDetails.cash.toFixed(2)}</p>` : ''}
        ${!isOrder && sale.paymentDetails?.cash && sale.paymentDetails.cash >= sale.total ? `<p>Cambio: L ${(sale.paymentDetails.cash - sale.total).toFixed(2)}</p>` : ''}

        ${isFiscal ? `
          <div class="hr"></div>
          <div style="font-size: 10px;">
            <p><strong>CAI:</strong> ${settings.cai}</p>
            <p><strong>Rango Atzr:</strong><br/>${settings.billingRangeStart} al ${settings.billingRangeEnd}</p>
            <p><strong>Fecha Límite:</strong> ${settings.billingDeadline}</p>
          </div>
        ` : ''}

        <div class="footer center">
          <p class="bold">${settings.thanksMessage || '¡Gracias por su compra!'}</p>
          <div style="font-size: 8px; margin-top: 5px; text-align: left;">
            ${settings.warrantyPolicy ? `<p><strong>Garantía:</strong> ${settings.warrantyPolicy}</p>` : ''}
            ${settings.returnPolicy ? `<p><strong>Devoluciones:</strong> ${settings.returnPolicy}</p>` : ''}
          </div>
          <div class="hr"></div>
          <p>${isFiscal ? 'ORIGINAL: CLIENTE / COPIA: EMISOR' : 'ESTE NO ES UN DOCUMENTO FISCAL'}</p>
          <p style="font-size: 8px; margin-top: 5px;">"La factura es beneficio de todos, ¡exíjala!"</p>
          <p style="font-size: 8px;">SAR-HONDURAS VIGENTE 2026</p>
        </div>
      </body>
      </html>
    `;
  }

  async generateCreditContractHTML(sale: Sale, customer: Customer, settings: CompanySettings): Promise<string> {
    const today = new Date().toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' });
    const amount = sale.total - (sale.paymentDetails?.credit || 0);
    const monthlyPayment = sale.paymentDetails?.credit ? (sale.total - (sale.paymentDetails.credit)) : 0; // Simplified for template

    return `
      <html>
      <head>
          <style>
              body { font-family: 'Arial', sans-serif; line-height: 1.5; padding: 40px; color: #333; font-size: 12px; }
              .header { text-align: center; margin-bottom: 30px; }
              .logo { max-width: 100px; margin-bottom: 10px; }
              h1 { text-size: 18px; margin-bottom: 5px; }
              .section { margin-top: 20px; }
              .bold { font-weight: bold; }
              .signature-box { margin-top: 60px; display: flex; justify-content: space-between; }
              .signature { border-top: 1px solid #000; width: 200px; text-align: center; padding-top: 5px; }
              @page { size: letter; margin: 20mm; }
          </style>
      </head>
      <body>
          <div class="header">
              ${settings.logo ? `<img src="${settings.logo}" class="logo" />` : ''}
              <h1>CONTRATO DE VENTA AL CRÉDITO</h1>
              <p>${settings.name} / RTN: ${settings.rtn}</p>
          </div>

          <p>En la ciudad de ${settings.legalCity || '________'}, a los ${today}, entre <strong>${settings.legalOwnerName || settings.name}</strong>, en adelante designado como EL VENDEDOR, y el Sr(a). <strong>${customer.name}</strong>, identificado con Identidad/RTN <strong>${customer.dni || customer.rtn || '________'}</strong>, en adelante designado como EL COMPRADOR, se conviene lo siguiente:</p>

          <div class="section">
              <p class="bold text-lg">CLÁUSULAS:</p>
              <p><strong>PRIMERA (Objeto):</strong> EL VENDEDOR vende a EL COMPRADOR los productos detallados en la factura/ticket No. <strong>${sale.folio}</strong> por un valor total de <strong>L ${sale.total.toFixed(2)}</strong>.</p>
              
              <p><strong>SEGUNDA (Condiciones de Pago):</strong> EL COMPRADOR se obliga a pagar el monto financiado de <strong>L ${(sale.total - (sale.deposit || 0)).toFixed(2)}</strong> en ${sale.paymentDetails?.credit ? 'cuotas mensuales' : 'el plazo estipulado'} según el plan de pagos adjunto.</p>

              <p><strong>TERCERA (Intereses):</strong> EL COMPRADOR acepta una tasa de interés mensual del <strong>${settings.defaultCreditRate}%</strong> sobre saldos pendientes.</p>

              <p><strong>CUARTA (Incumplimiento):</strong> El atraso en el pago de una o más cuotas dará derecho a EL VENDEDOR a dar por vencido el plazo y exigir el pago total, además de aplicar los recargos por mora correspondientes.</p>

              <p><strong>QUINTA (Dominio):</strong> EL VENDEDOR se reserva el dominio de los artículos vendidos hasta que el pago total de la deuda sea cancelado.</p>
          </div>

          <div class="signature-box">
              <div class="signature">
                  <p class="bold">EL VENDEDOR</p>
                  <p>${settings.name}</p>
              </div>
              <div class="signature">
                  <p class="bold">EL COMPRADOR</p>
                  <p>${customer.name}</p>
              </div>
          </div>
          
          <div style="margin-top: 40px; font-size: 10px; color: #666; text-align: center;">
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
      <html>
      <head>
          <style>
              body { font-family: 'Times New Roman', serif; line-height: 1.6; padding: 60px; color: #000; font-size: 14px; }
              .container { border: 2px solid #000; padding: 40px; position: relative; }
              h1 { text-align: center; text-decoration: underline; margin-bottom: 30px; font-size: 24px; }
              .amount-box { position: absolute; top: 20px; right: 20px; font-weight: bold; border: 1px solid #000; padding: 5px 15px; }
              .text { text-align: justify; }
              .footer { margin-top: 100px; display: flex; flex-direction: column; align-items: center; }
              .line { border-top: 1px solid #000; width: 300px; margin-bottom: 5px; }
              @page { size: letter; margin: 30mm; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="amount-box">POR L ${amountFinanced.toFixed(2)}</div>
              <h1>PAGARÉ</h1>
              
              <div class="text">
                  <p>Yo, <strong>${customer.name}</strong>, mayor de edad, con número de Identidad/RTN <strong>${customer.dni || customer.rtn || '________'}</strong>, por medio del presente documento, me obligo a pagar de forma incondicional a la orden de <strong>${settings.legalOwnerName || settings.name}</strong>, la suma de <strong>${amountFinanced.toFixed(2)} LEMPIRAS (L ${amountFinanced.toFixed(2)})</strong>.</p>

                  <p>Dicho pago se realizará en la ciudad de ${settings.legalCity || '________'}, según el plan de amortización estipulado en la Factura No. <strong>${sale.folio}</strong>. El incumplimiento de cualquier pago facultará al acreedor a exigir el total de la deuda restante.</p>

                  <p>Acepto que cualquier saldo en mora devengará un interés adicional del <strong>${settings.defaultCreditRate}%</strong> mensual. En caso de acción judicial, renuncio expresamente a mi domicilio y me someto a los tribunales competentes que el acreedor elija.</p>
              </div>

              <div class="footer">
                  <p>En fe de lo cual, firmo el presente en ${settings.legalCity || '________'}, a los ${today}.</p>
                  <div style="margin-top: 60px;">
                      <div class="line"></div>
                      <p><strong>HUELLA Y FIRMA DEL DEUDOR</strong></p>
                      <p>${customer.name}</p>
                  </div>
              </div>
          </div>
      </body>
      </html>
    `;
  }

  async generatePaymentPlanHTML(sale: Sale): Promise<string> {
    if (!sale.isOrder && sale.paymentMethod !== 'Crédito') return "Este documento solo aplica para ventas al crédito.";

    // Simple logic to calculate installments if they aren't pre-calculated
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
      <html>
      <head>
          <style>
              body { font-family: sans-serif; padding: 30px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 12px; text-align: center; }
              th { background-color: #f2f2f2; }
              .header { text-align: center; margin-bottom: 20px; }
              .folio { font-weight: bold; color: #4F46E5; }
              @page { size: portrait; }
          </style>
      </head>
      <body>
          <div class="header">
              <h1>Plan de Pagos</h1>
              <p>Referencia Venta: <span class="folio">${sale.folio}</span></p>
              <p>Fecha de Venta: ${new Date(sale.date).toLocaleDateString()}</p>
          </div>

          <table>
              <thead>
                  <tr>
                      <th>Cuota #</th>
                      <th>Fecha de Vencimiento</th>
                      <th>Monto a Pagar</th>
                      <th>Estado</th>
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
                  `).join('')}
              </tbody>
          </table>
          
          <div style="margin-top: 30px; border-top: 1px dashed #ccc; padding-top: 10px; font-size: 12px;">
              <p><strong>Nota:</strong> Los pagos deben realizarse en la fecha estipulada para evitar cargos por mora.</p>
          </div>
      </body>
      </html>
    `;
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
      db_engine.fixedExpenses,
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

    // Reset some settings to default if necessary, but keep CAI/Branch info?
    // User asked to clean products/customers/sales/orders.
    // We keep settings and users to avoid lockout.
  }
}

export const db = new StorageService();
