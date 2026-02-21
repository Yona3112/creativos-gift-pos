
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from './services/storageService';
import { SyncQueueService } from './services/syncQueueService';
import { logger } from './services/logger';
import { User, Product, Category, Customer, Sale, Branch, CreditAccount, Promotion, CompanySettings, Quote, Consumable, Expense } from './types';
import { Layout } from './components/Layout';
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })));
const POS = React.lazy(() => import('./pages/POS').then(module => ({ default: module.POS })));
const Products = React.lazy(() => import('./pages/Products').then(module => ({ default: module.Products })));
const Customers = React.lazy(() => import('./pages/Customers').then(module => ({ default: module.Customers })));
const Settings = React.lazy(() => import('./pages/Settings').then(module => ({ default: module.Settings })));
const CashCut = React.lazy(() => import('./pages/CashCut').then(module => ({ default: module.CashCut })));
const SalesHistory = React.lazy(() => import('./pages/SalesHistory').then(module => ({ default: module.SalesHistory })));
const Promotions = React.lazy(() => import('./pages/Promotions').then(module => ({ default: module.Promotions })));
const Reports = React.lazy(() => import('./pages/Reports').then(module => ({ default: module.Reports })));
const Users = React.lazy(() => import('./pages/Users').then(module => ({ default: module.Users })));
const Branches = React.lazy(() => import('./pages/Branches').then(module => ({ default: module.Branches })));
const Orders = React.lazy(() => import('./pages/Orders').then(module => ({ default: module.Orders })));
const Expenses = React.lazy(() => import('./pages/Expenses').then(module => ({ default: module.Expenses })));
const InventoryHistory = React.lazy(() => import('./pages/InventoryHistory').then(module => ({ default: module.InventoryHistory })));
const Credits = React.lazy(() => import('./pages/Credits').then(module => ({ default: module.Credits })));
const SARBooks = React.lazy(() => import('./pages/SARBooks').then(module => ({ default: module.SARBooks })));
const ProductionCalendar = React.lazy(() => import('./pages/ProductionCalendar').then(module => ({ default: module.ProductionCalendar })));
// Fix: Added Card to the imported components from UIComponents
import { Button, Input, Card, useNotifications, ToastContainer, showToast } from './components/UIComponents';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState('dashboard');
  const [pageParams, setPageParams] = useState<any>(null);

  const [loginEmail, setLoginEmail] = useState('admin@creativosgift.com');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [credits, setCredits] = useState<CreditAccount[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [consumables, setConsumables] = useState<Consumable[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  const [quoteToLoad, setQuoteToLoad] = useState<Quote | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const { sendNotification } = useNotifications();

  // Ref to prevent multiple pullAll() calls during session - fixes duplicate data bug
  const hasPulledFromCloud = useRef(false);

  // Global Navigation Shortcuts
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if (e.altKey && user) {
        if (e.key === '1') setPage('pos');
        if (e.key === '2') setPage('orders');
        if (e.key === '3') setPage('history');
        if (e.key === '4') setPage('inventory');
        if (e.key === '5') setPage('dashboard');
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [user]);


  const refreshData = async (shouldPushToCloud = false, isManual = false, forceFull = false, skipNetwork = false) => {
    try {
      const sett = await db.getSettings();
      const hasCloudConfig = sett.supabaseUrl && sett.supabaseKey;

      // ALWAYS try to pull from cloud if configured (not just when pushing)
      if (!skipNetwork && hasCloudConfig && (sett.autoSync || isManual || !shouldPushToCloud)) {
        try {
          const { SupabaseService } = await import('./services/supabaseService');

          // Always pull on startup or manual sync
          logger.log("🔄 Sincronizando: Descargando cambios de la nube...");
          await SupabaseService.pullDelta();

          // Only push if requested
          if (shouldPushToCloud) {
            setIsSyncing(true);
            logger.log(`🔄 Sincronizando: Subiendo cambios (${forceFull ? 'FULL' : 'DELTA'})...`);
            await SupabaseService.syncAll(forceFull);
            logger.log("✅ Sincronización completa (Pull + Push).");

            // Update last backup date
            const now = new Date().toISOString();
            await db.saveSettings({ ...sett, lastBackupDate: now });
          }
        } catch (syncErr) {
          console.warn("⚠️ Error en sincronización:", syncErr);
          if (isManual) showToast("Error al sincronizar con la nube", "error");
        } finally {
          if (shouldPushToCloud) setIsSyncing(false);
        }
      }
    } catch (e) {
      console.error("Error en refreshData:", e);
    }

    const [p, c, cust, s, b, u, cr, pr, con, sett, exp] = await Promise.all([
      db.getProducts(), db.getCategories(), db.getCustomers(),
      db.getSales(), db.getBranches(), db.getUsers(),
      db.getCredits(), db.getPromotions(), db.getConsumables(),
      db.getSettings(), db.getExpenses()
    ]);

    // Check Sync Health
    if (!skipNetwork && sett.supabaseUrl && sett.supabaseKey) {
      try {
        const { SupabaseService } = await import('./services/supabaseService');
        const health = await SupabaseService.checkSyncHealth();
        if (health.status === 'critical') {
          showToast(`⚠️ Sincronización atrasada (${health.minutesAgo} min). Intente sincronizar manualmente.`, "warning");
        }
      } catch (e) {
        console.warn("Failed to check sync health", e);
      }
    }

    // Pull settings from cloud to ensure multi-device consistency
    const cloudSettings = !skipNetwork ? await db.pullSettingsFromCloud() : null;
    const finalSettings = cloudSettings || sett;
    setProducts(p);
    setCategories(c);
    setCustomers(cust);
    setSales(s);
    setBranches(b);
    setUsers(u);
    setCredits(cr);
    setPromotions(pr);
    setConsumables(con);
    setSettings(finalSettings);
    setExpenses(exp);
  };

  // Centralized Background Sync (Outbox Processor)
  useEffect(() => {
    if (!user) return;

    // 1. Process queue and audit on startup
    const startupSync = async () => {
      await SyncQueueService.auditAndEnqueueUnsynced();
      await SyncQueueService.processQueue();
    };
    startupSync();

    // 2. Process queue whenever network comes back online or app becomes visible
    const handleSyncTrigger = () => {
      logger.log("🌐 [App] Disparador de sincronización (Online/Focus), procesando cola...");
      SyncQueueService.auditAndEnqueueUnsynced();
      SyncQueueService.processQueue();
    };

    window.addEventListener('online', handleSyncTrigger);
    window.addEventListener('visibilitychange', handleSyncTrigger);

    // 3. Initialize Realtime Subscription
    const initRealtime = async () => {
      const { subscribeToRealtime } = await import('./services/realtimeService');
      await subscribeToRealtime();
    };
    initRealtime();

    return () => {
      window.removeEventListener('online', handleSyncTrigger);
      window.removeEventListener('visibilitychange', handleSyncTrigger);

      // Cleanup Realtime
      import('./services/realtimeService').then(({ unsubscribeFromRealtime }) => {
        unsubscribeFromRealtime();
      });
    };
  }, [user?.id]);

  useEffect(() => {
    const initApp = async () => {
      try {
        logger.log("🛠️ App: Iniciando base de datos...");
        await db.init();
        logger.log("🛠️ App: Cargando datos locales...");
        await refreshData(false, false, false, true); // skipNetwork=true for instant startup

        const storedUser = localStorage.getItem('creativos_gift_currentUser');
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            const dbUser = await db.login(parsedUser.email, parsedUser.password);
            if (dbUser) {
              setUser(dbUser);
              localStorage.setItem('active_user', JSON.stringify(dbUser));
              const bList = await db.getBranches();
              setCurrentBranch(bList.find(b => b.id === dbUser.branchId) || bList[0]);
            }
          } catch (e) {
            localStorage.removeItem('creativos_gift_currentUser');
            localStorage.removeItem('active_user');
          }
        }
      } catch (e) {
        console.error("❌ Error inicializando app:", e);
      } finally {
        logger.log("🛠️ App: Inicialización finalizada (loading -> false)");
        setLoading(false);
      }
    };

    initApp();
    return () => {
      // Background sync is handled by the dedicated useEffect pulse
    };
  }, []);

  // Dynamic Favicon Update
  useEffect(() => {
    if (settings?.logo) {
      const link: any = document.getElementById('favicon');
      if (link) link.href = settings.logo;
    }
  }, [settings?.logo]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const dbUser = await db.login(loginEmail, loginPassword);
    if (dbUser) {
      setUser(dbUser);
      localStorage.setItem('creativos_gift_currentUser', JSON.stringify({ email: loginEmail, password: loginPassword }));
      localStorage.setItem('active_user', JSON.stringify(dbUser)); // Sync for RBAC

      // Estrategia: Carga Inmediata + Sync Fondo
      await refreshData(false);
      refreshData(true, false, true); // Traer datos de la nube sin bloquear UI + ATOMIC FULL PUSH ON LOGIN
      const b = await db.getBranches();
      setCurrentBranch(b.find(br => br.id === dbUser.branchId) || b[0]);
      setPage('dashboard');
    } else {
      setLoginError('Credenciales incorrectas.');
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('creativos_gift_currentUser');
    localStorage.removeItem('active_user');
    setPage('dashboard');
  };

  // Sync on Entry: FULL PULL al ingresar para garantizar datos frescos
  // ESTRATEGIA MULTI-DISPOSITIVO: Siempre priorizar datos de la nube sobre los locales
  useEffect(() => {
    const initSync = async () => {
      if (user) {
        // Guard: Only pull once per session to prevent duplicate data
        if (hasPulledFromCloud.current) {
          logger.log("⚡ Pull ya realizado esta sesión, omitiendo...");
          return;
        }

        logger.log("🚀 Usuario ingresó al sistema. Descargando TODOS los datos de la nube...");
        const sett = await db.getSettings();

        // Solo sincronizar si Supabase está configurado
        if (sett.supabaseUrl && sett.supabaseKey) {
          try {
            // Mark as pulled BEFORE the actual pull to prevent race conditions
            hasPulledFromCloud.current = true;

            const { SupabaseService } = await import('./services/supabaseService');

            // 1. Pull changes from cloud
            logger.log("⬇️ Descargando cambios desde la nube (pullDelta)...");
            const changed = await SupabaseService.pullDelta();

            // 2. [SYNC ON STARTUP] Verify integrity (Optimized)
            logger.log("🔍 [StartupSync] Verificando integridad local vs remota de manera optimizada...");
            const remoteCounts = await SupabaseService.getRemoteCounts();
            const { db_engine } = await import('./services/storageService');

            const tablesToVerify = [
              { name: 'sales', remote: remoteCounts.sales || 0, local: await db_engine.sales.count() },
              { name: 'products', remote: remoteCounts.products || 0, local: await db_engine.products.count() },
              { name: 'customers', remote: remoteCounts.customers || 0, local: await db_engine.customers.count() },
              { name: 'cash_cuts', remote: remoteCounts.cash_cuts || 0, local: await db_engine.cashCuts.count() }
            ];

            let needsPush = false;
            for (const table of tablesToVerify) {
              if (table.local > table.remote) {
                console.warn(`⚠️ [StartupSync] Desajuste en ${table.name}: Local(${table.local}) > Remote(${table.remote})`);
                needsPush = true;
              }
            }

            // Also check for any unsynced records via timestamp
            const unsyncedCount = await db.getUnsyncedCount();
            if (unsyncedCount > 0) {
              logger.log(`⚠️ [StartupSync] Se detectaron ${unsyncedCount} registros sin sincronizar.`);
              needsPush = true;
            }

            if (needsPush) {
              logger.log("📤 [StartupSync] Realizando carga masiva de recuperación (FORCED FULL SYNC)...");
              await SupabaseService.syncAll(true);
              logger.log("✅ [StartupSync] Recuperación completada.");
            } else {
              logger.log("✅ [StartupSync] Integridad verificada. Local y Nube coinciden.");
            }

            // Update lastBackupDate on successful sync
            const freshNow = new Date().toISOString();
            await db.saveSettings({ ...sett, lastBackupDate: freshNow });

            // Fix folios and reload
            await db.fixDuplicateFolios();
            await refreshData(false);
          } catch (pullErr) {
            console.warn("⚠️ Error en Startup Sync:", pullErr);
            await refreshData(false);
          }
        } else {
          // Sin Supabase configurado, solo cargar datos locales
          await refreshData(false);
        }
      }
    };
    initSync();
  }, [user?.id]);



  // =========== SUPABASE REALTIME SUBSCRIPTION ===========
  // This provides instant updates for both sales, settings, products, and customers
  // Supabase is the Single Source of Truth
  useEffect(() => {
    let cleanupFunctions: (() => void)[] = [];

    const setupRealtime = async () => {
      if (!user) return;

      try {
        const sett = await db.getSettings();
        if (!sett?.supabaseUrl || !sett?.supabaseKey) {
          logger.log('📡 [Realtime] Supabase no configurado');
          return;
        }

        const { subscribeToRealtime, onRealtimeChange } = await import('./services/realtimeService');

        // 1. Initialize Connection (Multiplexed Channel)
        await subscribeToRealtime();

        // 2. Register Listeners

        // --- SALES ---
        cleanupFunctions.push(onRealtimeChange('sales', (payload) => {
          const { action, data } = payload;
          logger.log(`📡 [Realtime:Sales] Action: ${action}`, data?.folio);

          setSales(prevSales => {
            if (action === 'DELETE') {
              return prevSales.filter(s => s.id !== payload.id);
            }
            if (!data) return prevSales;

            const existingIndex = prevSales.findIndex(s => s.id === data.id);
            if (existingIndex >= 0) {
              const updated = [...prevSales];
              updated[existingIndex] = data;
              return updated;
            } else {
              return [...prevSales, data];
            }
          });

          if (data && action !== 'DELETE') showToast(`Pedido actualizado: ${data.folio || 'N/A'}`, 'info');
        }));

        // --- PRODUCTS ---
        cleanupFunctions.push(onRealtimeChange('products', (payload) => {
          const { action, data } = payload;
          logger.log(`📡 [Realtime:Products] Action: ${action}`, data?.name);

          setProducts(prev => {
            if (action === 'DELETE') return prev.filter(p => p.id !== payload.id);
            if (!data) return prev;

            const idx = prev.findIndex(p => p.id === data.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = data;
              return updated;
            }
            return [...prev, data];
          });
        }));

        // --- CUSTOMERS ---
        cleanupFunctions.push(onRealtimeChange('customers', (payload) => {
          const { action, data } = payload;
          setCustomers(prev => {
            if (action === 'DELETE') return prev.filter(c => c.id !== payload.id);
            if (!data) return prev;

            const idx = prev.findIndex(c => c.id === data.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = data;
              return updated;
            }
            return [...prev, data];
          });
        }));

        // --- CREDITS ---
        cleanupFunctions.push(onRealtimeChange('credits', (payload) => {
          const { action, data } = payload;
          setCredits(prev => {
            if (action === 'DELETE') return prev.filter(c => c.id !== payload.id);
            if (!data) return prev;
            const idx = prev.findIndex(c => c.id === data.id);
            return idx >= 0 ? prev.map((item, i) => i === idx ? data : item) : [...prev, data];
          });
        }));

        // --- EXPENSES ---
        cleanupFunctions.push(onRealtimeChange('expenses', (payload) => {
          const { action, data } = payload;
          setExpenses(prev => {
            if (action === 'DELETE') return prev.filter(c => c.id !== payload.id);
            if (!data) return prev;
            const idx = prev.findIndex(c => c.id === data.id);
            return idx >= 0 ? prev.map((item, i) => i === idx ? data : item) : [...prev, data];
          });
        }));

        // --- QUOTES ---
        cleanupFunctions.push(onRealtimeChange('quotes', (payload) => {
          // Quotes are not currently kept in a global state in App.tsx (except maybe for reporting/loading?)
          // But if we add a state for quotes later, this would go here.
          // For now, we just log it or Toast it.
          if (payload.action === 'INSERT') showToast(`Nueva cotización recibida`, 'info');
        }));

        // --- SETTINGS ---
        cleanupFunctions.push(onRealtimeChange('settings', (newSettings) => {
          logger.log('📡 [Realtime:Settings] Global Update');
          setSettings(newSettings);
        }));

        logger.log('📡 [Realtime] Suscripción global iniciada (Sales, Products, Customers, Settings)');
      } catch (error) {
        console.warn('⚠️ [Realtime] Error al configurar:', error);
      }
    };

    setupRealtime();

    return () => {
      cleanupFunctions.forEach(fn => fn());
      import('./services/realtimeService').then(({ unsubscribeFromRealtime }) => {
        unsubscribeFromRealtime();
        logger.log('📡 [Realtime] Suscripción terminada');
      });
    };
  }, [user?.id]);

  const handleManualUpload = async () => {
    await refreshData(true, true);
  };

  const handleManualDownload = async () => {
    try {
      showToast("Descargando datos de la nube...", "info");
      const { SupabaseService } = await import('./services/supabaseService');
      const data = await SupabaseService.pullAll();
      if (data) {
        showToast("Datos descargados y restaurados", "success");
        // Forzar recarga de todos los estados locales
        await refreshData(false);
      } else {
        showToast("No se encontró información en la nube", "warning");
      }
    } catch (e: any) {
      showToast(`Error al descargar: ${e.message}`, "error");
    }
  };

  const navigateTo = (p: string, params?: any) => {
    setPage(p);
    setPageParams(params);
    // Soft refresh: sync with cloud when changing modules
    refreshData(true);
  };

  // Calculate Badges
  const todayStr = new Date().toISOString().split('T')[0];
  const badges = {
    credits: (credits || []).filter(c => {
      if (c.status === 'paid' || c.status === 'cancelled') return false;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return new Date(c.dueDate) < today;
    }).length,
    calendar: sales.filter(s => s.status === 'active' && s.isOrder && s.deliveryDate === todayStr && s.fulfillmentStatus !== 'delivered').length,
    products: products.filter(p => p.active !== false && p.stock <= (p.minStock || 0)).length
  };

  // Calculate Alerts for Notification Bell
  const alerts: { type: string; message: string; link?: string }[] = [];

  // Low Stock Alerts
  const lowStockProducts = products.filter(p => p.enableLowStockAlert !== false && p.stock <= p.minStock);
  if (lowStockProducts.length > 0) {
    alerts.push({ type: 'stock', message: `⚠️ ${lowStockProducts.length} producto(s) con stock bajo`, link: 'products' });
  }

  // Overdue Credit Alerts
  const overdueCredits = (credits || []).filter(c => {
    if (c.status === 'paid' || c.status === 'cancelled') return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(c.dueDate) < today;
  });
  if (overdueCredits.length > 0) {
    alerts.push({ type: 'credit', message: `🔴 ${overdueCredits.length} crédito(s) vencido(s)`, link: 'credits' });
  }

  // Pending Orders (Replacing Badge)
  const pendingOrders = sales.filter(s => (s.fulfillmentStatus === 'pending' || s.fulfillmentStatus === 'production') && s.status === 'active');
  if (pendingOrders.length > 0) {
    // We already have tomorrow orders, just general pending count
    alerts.push({ type: 'order', message: `📦 ${pendingOrders.length} pedido(s) en proceso`, link: 'orders' });
  }

  // Pending Orders Due Tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const ordersDueTomorrow = sales.filter(s => s.isOrder && s.status === 'active' && s.fulfillmentStatus !== 'delivered' && s.shippingDetails?.shippingDate?.startsWith(tomorrowStr));
  if (ordersDueTomorrow.length > 0) {
    alerts.push({ type: 'order', message: `⏱️ ${ordersDueTomorrow.length} pedido(s) para entregar MAÑANA`, link: 'orders' });
  }

  // SMART ALERT 1: Orders stuck in Design for more than 24 hours
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // Since we don't track status changes precisely without a history log, we can check if it's 'design' and was created > 24h ago, 
  // OR look at the status history array if it exists. Fall back to createdAt for simplicity if status array doesn't exist.
  const stuckOrders = sales.filter(s => {
    if (s.isOrder && s.status === 'active' && s.fulfillmentStatus === 'design') {
      const historyDesign = s.statusHistory?.find(h => h.status === 'design');
      const timeInDesign = historyDesign ? historyDesign.timestamp : s.createdAt;
      return timeInDesign < twentyFourHoursAgo;
    }
    return false;
  });
  if (stuckOrders.length > 0) {
    alerts.push({ type: 'warning', message: `⏳ ${stuckOrders.length} pedido(s) estancado(s) en Diseño (>24h)`, link: 'orders' });
  }

  // SMART ALERT 2: Birthdays and Upcoming Customer Events
  // Look for customers whose birthday is in the next 7 days
  const upcomingBirthdays = customers.filter(c => {
    if (!c.birthday) return false;
    const bday = new Date(c.birthday);
    const today = new Date();
    // Normalize year to compare just month/day
    bday.setFullYear(today.getFullYear());
    // If birthday passed this year, check next year
    if (bday < today) bday.setFullYear(today.getFullYear() + 1);

    const diffTime = Math.abs(bday.getTime() - today.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7;
  });

  if (upcomingBirthdays.length > 0) {
    alerts.push({ type: 'customer', message: `🎁 Oportunidad: ${upcomingBirthdays.length} cliente(s) cumplen años pronto`, link: 'customers' });
  }

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-surface text-primary">
        <i className="fas fa-circle-notch fa-spin text-4xl mb-4"></i>
        <p className="font-bold">Cargando Creativos Gift POS...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10 p-4">
        <style>
          {`
            :root {
              --primary-color: ${settings?.themeColor || '#4F46E5'};
            }
          `}
        </style>
        <Card className="w-full max-w-md animate-pop-in bg-white/80 backdrop-blur-xl border-none shadow-2xl relative overflow-hidden group">
          {/* Decorative brand background element */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all duration-700"></div>
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-accent/10 rounded-full blur-3xl group-hover:bg-accent/20 transition-all duration-700"></div>

          <div className="text-center mb-8 relative z-10">
            <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center p-3 mx-auto mb-6 shadow-2xl shadow-primary/20 scale-100 hover:scale-110 transition-transform duration-500 border border-gray-50">
              {settings?.logo ? (
                <img src={settings.logo} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <i className="fas fa-store text-4xl text-primary"></i>
              )}
            </div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight leading-none mb-2">
              {settings?.name || 'Creativos Gift'}
            </h1>
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="h-1 w-8 bg-primary rounded-full"></span>
              <p className="text-gray-500 font-bold uppercase tracking-[0.2em] text-[10px]">Punto de Venta</p>
              <span className="h-1 w-8 bg-primary rounded-full"></span>
            </div>
            <p className="text-gray-400 text-xs font-semibold">Bienvenido al control profesional de tu negocio</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5 relative z-10">
            <div className="space-y-4">
              <Input
                label="Usuario"
                type="email"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                required
                icon="user"
                className="bg-gray-50/50 border-gray-200/50 focus:bg-white"
              />
              <Input
                label="Contraseña"
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                required
                icon="lock"
                className="bg-gray-50/50 border-gray-200/50 focus:bg-white"
              />
            </div>

            {loginError && (
              <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 animate-shake">
                <i className="fas fa-exclamation-circle"></i>
                {loginError}
              </div>
            )}

            <Button type="submit" className="w-full py-4 text-sm font-black shadow-xl shadow-primary/30 active:scale-95 transition-all">
              ENTRAR AL PANEL
            </Button>

            <p className="text-center text-[10px] text-gray-400 font-medium">
              &copy; {new Date().getFullYear()} Creativos Gift Shop • Versión 2.0
            </p>
          </form>
        </Card>
      </div>
    );
  }

  const renderPage = () => {
    const safeSettings = settings || ({} as CompanySettings);

    switch (page) {
      case 'dashboard': return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><Dashboard products={products} sales={sales} credits={credits} customers={customers} consumables={consumables} expenses={expenses} onNavigate={navigateTo} /></React.Suspense>;
      case 'calendar': return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><ProductionCalendar sales={sales} onNavigate={navigateTo} /></React.Suspense>;
      case 'pos': return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><POS products={products} customers={customers} categories={categories} user={user} branchId={currentBranch?.id || ''} onSaleComplete={() => refreshData(true)} loadedQuote={quoteToLoad} onQuoteProcessed={() => setQuoteToLoad(null)} onRefreshData={() => refreshData(true)} settings={safeSettings} onNavigate={navigateTo} /></React.Suspense>;
      case 'expenses': return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><Expenses user={user} onUpdate={() => refreshData(true)} settings={safeSettings} /></React.Suspense>;
      case 'inventoryHistory': return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><InventoryHistory products={products} users={users} /></React.Suspense>;
      case 'products': return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><Products products={products} sales={sales} categories={categories} users={users} onUpdate={() => refreshData(true)} initialFilter={pageParams?.filter} initialTab={pageParams?.tab} settings={safeSettings} user={user} /></React.Suspense>;
      case 'salesHistory': return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><SalesHistory sales={sales} customers={customers} users={users} onUpdate={() => refreshData(true)} user={user} branchId={currentBranch?.id} onLoadQuote={(quote) => { setQuoteToLoad(quote); setPage('pos'); }} settings={safeSettings} /></React.Suspense>;
      case 'customers': return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><Customers customers={customers} onUpdate={() => refreshData(true)} user={user} settings={safeSettings} /></React.Suspense>;
      case 'credits': return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><Credits settings={safeSettings} onUpdate={() => refreshData(true)} /></React.Suspense>;
      case 'reports': return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><Reports sales={sales} products={products} customers={customers} categories={categories} onRefresh={() => refreshData(true)} /></React.Suspense>;
      case 'sarBooks': return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><SARBooks /></React.Suspense>;
      case 'settings': return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><Settings onUpdate={() => refreshData(true)} /></React.Suspense>;
      case 'cashCut': return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><CashCut onUpdate={() => refreshData(true)} /></React.Suspense>;
      case 'orders': return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><Orders sales={sales} customers={customers} categories={categories} settings={safeSettings} onUpdate={(push, manual) => refreshData(push, manual)} /></React.Suspense>;
      case 'promotions': return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><Promotions onUpdate={() => refreshData(true)} /></React.Suspense>;
      case 'users': return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><Users onUpdate={() => refreshData(true)} /></React.Suspense>;
      case 'branches': return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><Branches onUpdate={() => refreshData(true)} /></React.Suspense>;
      default: return <React.Suspense fallback={<div className="flex h-full items-center justify-center text-primary"><i className="fas fa-spinner fa-spin text-3xl"></i></div>}><Dashboard products={products} sales={sales} credits={credits} customers={customers} consumables={consumables} expenses={expenses} onNavigate={navigateTo} /></React.Suspense>;
    }
  };

  return (
    <div className="h-full w-full">
      <style>
        {`
          :root {
            --primary-color: ${settings?.themeColor || '#4F46E5'};
          }
        `}
      </style>
      <Layout
        user={user}
        activePage={page}
        onNavigate={navigateTo}
        onLogout={() => setUser(null)}
        settings={settings}
        onManualUpload={handleManualUpload}
        onManualDownload={handleManualDownload}
        badges={badges}
        alerts={alerts}
        isSyncing={isSyncing}
      >
        {renderPage()}
      </Layout>
      <ToastContainer />
      {isSyncing && (
        <div className="fixed top-2 right-2 z-[9999] pointer-events-none">
          <div className="bg-primary/20 p-2 rounded-full animate-pulse transition-all">
            <div className="bg-primary w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(79,70,229,0.5)]"></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
