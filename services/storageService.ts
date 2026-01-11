
import { Dexie, Table } from 'dexie';
import {
  Product, Category, User, Sale, Customer, CompanySettings,
  Branch, CreditAccount, Promotion, Supplier, Consumable,
  CashCut, Quote, CreditNote, CreditPayment,
  Expense, InventoryMovement, MovementType, FulfillmentStatus, ShippingDetails, UserRole,
  PriceHistoryEntry
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
  inventoryHistory!: Table<InventoryMovement>;
  priceHistory!: Table<PriceHistoryEntry>;

  constructor() {
    super('CreativosGiftDB');
    (this as any).version(1).stores({
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
      priceHistory: '++id, productId, date'
    });
  }
}

const db_engine = new AppDatabase();

class StorageService {

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
      name: 'Creativos Gift',
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
      printerSize: '80mm',
      moneyPerPoint: 10,
      pointValue: 0.1,
      defaultCreditRate: 0,
      defaultCreditTerm: 1,
      showFloatingWhatsapp: true,
      whatsappTemplate: "👋 Hola *{CLIENT_NAME}*, me interesa hacer el siguiente pedido personalizado:\n\n{ITEMS_LIST}\n\n💰 *TOTAL: {TOTAL}*\n\n📍 Quedo pendiente de los detalles de personalización.",
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
      supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY || ''
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
      try {
        const { SupabaseService } = await import('./supabaseService');
        await SupabaseService.syncAll();
        console.log("Sincronización automática completada.");
      } catch (e) {
        console.warn("Fallo en sincronización automática:", e);
      }
    }, 5000); // Wait 5 seconds after last change to sync
  }

  // --- PRODUCTS & KARDEX ---
  async getProducts(): Promise<Product[]> {
    const products = await db_engine.products.toArray();
    return products.filter(p => p.active !== false);
  }

  async saveProduct(product: Product, userId: string = 'system') {
    if (!product.id) product.id = Date.now().toString();
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
        id: Date.now().toString(),
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
        shippingDetails: data.shippingDetails
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

  async cancelSale(saleId: string, userId: string = 'system') {
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

        // Generar Nota de Crédito si aplica
        let refundable = sale.total;
        if (sale.paymentMethod === 'Crédito') refundable = 0;
        if (refundable > 0) {
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
    });
  }

  // --- EXPENSES ---
  async getExpenses(): Promise<Expense[]> { return await db_engine.expenses.toArray(); }
  async saveExpense(e: Expense) {
    if (!e.id) e.id = Date.now().toString();
    await db_engine.expenses.put(e);
    const settings = await this.getSettings();
    if (settings.autoSync) this.triggerAutoSync();
  }
  async deleteExpense(id: string) {
    await db_engine.expenses.delete(id);
    const settings = await this.getSettings();
    if (settings.autoSync) this.triggerAutoSync();
  }

  // --- CREDITS ---
  async getCredits(): Promise<CreditAccount[]> { return await db_engine.credits.toArray(); }
  async addCreditPayment(creditId: string, payment: Omit<CreditPayment, 'id'>) {
    const c = await db_engine.credits.get(creditId);
    if (c) {
      const p = { ...payment, id: Date.now().toString() };
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
  async getUsers() {
    const users = await db_engine.users.toArray();
    return users.filter(u => u.active !== false);
  }
  async saveUser(u: User) {
    if (!u.id) u.id = Date.now().toString();
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
  async getQuotes() { return await db_engine.quotes.toArray(); }
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
    await db_engine.quotes.delete(id);
    const settings = await this.getSettings();
    if (settings.autoSync) this.triggerAutoSync();
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

  async restoreData(data: any) {
    if (data.products) await db_engine.products.clear(), await db_engine.products.bulkPut(data.products);
    if (data.categories) await db_engine.categories.clear(), await db_engine.categories.bulkPut(data.categories);
    if (data.customers) await db_engine.customers.clear(), await db_engine.customers.bulkPut(data.customers);
    if (data.sales) await db_engine.sales.clear(), await db_engine.sales.bulkPut(data.sales);
    if (data.users) await db_engine.users.clear(), await db_engine.users.bulkPut(data.users);
    if (data.branches) await db_engine.branches.clear(), await db_engine.branches.bulkPut(data.branches);
    if (data.credits) await db_engine.credits.clear(), await db_engine.credits.bulkPut(data.credits);
    if (data.promotions) await db_engine.promotions.clear(), await db_engine.promotions.bulkPut(data.promotions);
    if (data.suppliers) await db_engine.suppliers.clear(), await db_engine.suppliers.bulkPut(data.suppliers);
    if (data.consumables) await db_engine.consumables.clear(), await db_engine.consumables.bulkPut(data.consumables);
    if (data.quotes) await db_engine.quotes.clear(), await db_engine.quotes.bulkPut(data.quotes);
    if (data.cash_cuts) await db_engine.cashCuts.clear(), await db_engine.cashCuts.bulkPut(data.cash_cuts);
    if (data.credit_notes) await db_engine.creditNotes.clear(), await db_engine.creditNotes.bulkPut(data.credit_notes);
    if (data.expenses) await db_engine.expenses.clear(), await db_engine.expenses.bulkPut(data.expenses);
    if (data.inventoryHistory) await db_engine.inventoryHistory.clear(), await db_engine.inventoryHistory.bulkPut(data.inventoryHistory);
    if (data.priceHistory) await db_engine.priceHistory.clear(), await db_engine.priceHistory.bulkPut(data.priceHistory);
    if (data.settings) await db_engine.settings.put(data.settings);
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
  async generateTicketHTML(sale: Sale, customer?: Customer): Promise<string> {
    const settings = await this.getSettings();
    const isFiscal = sale.documentType === 'FACTURA';
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
        </style>
      </head>
      <body>
        <div class="center">
          <h2 style="margin: 0;">${settings.name}</h2>
          <p style="margin: 5px 0;">RTN: ${settings.rtn}</p>
          <p style="margin: 2px 0;">${settings.address}</p>
          <p style="margin: 2px 0;">Tel: ${settings.phone}</p>
          <p style="margin: 2px 0;">${settings.email}</p>
          <div class="hr"></div>
          <p class="bold">${isFiscal ? 'FACTURA NO.' : 'TICKET NO.'} ${sale.folio}</p>
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
        <table class="bold">
          <tr><td>Subtotal (sin ISV):</td><td style="text-align: right;">L ${sale.subtotal.toFixed(2)}</td></tr>
          <tr><td>ISV (15%):</td><td style="text-align: right;">L ${sale.taxAmount.toFixed(2)}</td></tr>
          ${sale.discount > 0 ? `<tr><td>Descuento:</td><td style="text-align: right;">-L ${sale.discount.toFixed(2)}</td></tr>` : ''}
          <tr style="font-size: 14px;"><td>TOTAL:</td><td style="text-align: right;">L ${sale.total.toFixed(2)}</td></tr>
        </table>

        <div class="hr"></div>
        <p><strong>Pago:</strong> ${sale.paymentMethod}</p>
        ${sale.paymentDetails?.cash ? `<p>Efectivo: L ${sale.paymentDetails.cash.toFixed(2)}</p>` : ''}
        ${sale.paymentDetails?.cash ? `<p>Cambio: L ${(sale.paymentDetails.cash - sale.total).toFixed(2)}</p>` : ''}

        ${isFiscal ? `
          <div class="hr"></div>
          <div style="font-size: 10px;">
            <p><strong>CAI:</strong> ${settings.cai}</p>
            <p><strong>Rango Atzr:</strong><br/>${settings.billingRangeStart} al ${settings.billingRangeEnd}</p>
            <p><strong>Fecha Límite:</strong> ${settings.billingDeadline}</p>
          </div>
        ` : ''}

        <div class="footer center">
          <p>¡Gracias por su compra!</p>
          <p>${isFiscal ? 'ORIGINAL: CLIENTE / COPIA: EMISOR' : 'ESTE NO ES UN DOCUMENTO FISCAL'}</p>
        </div>
      </body>
      </html>
    `;
  }
}

export const db = new StorageService();
