
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from './services/storageService';
import { User, Product, Category, Customer, Sale, Branch, CreditAccount, Promotion, CompanySettings, Quote, Consumable, Expense } from './types';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { POS } from './pages/POS';
import { Products } from './pages/Products';
import { Customers } from './pages/Customers';
import { Settings } from './pages/Settings';
import { CashCut } from './pages/CashCut';
import { SalesHistory } from './pages/SalesHistory';
import { Promotions } from './pages/Promotions';
import { Reports } from './pages/Reports';
import { Users } from './pages/Users';
import { Branches } from './pages/Branches';
import { Orders } from './pages/Orders';
import { Expenses } from './pages/Expenses';
import { InventoryHistory } from './pages/InventoryHistory';
import { Credits } from './pages/Credits';
import { SARBooks } from './pages/SARBooks';
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


  const refreshData = async (shouldPushToCloud = false, isManual = false) => {
    try {
      if (shouldPushToCloud) {
        const sett = await db.getSettings();
        if (sett.supabaseUrl && sett.supabaseKey && (sett.autoSync || isManual)) {
          try {
            setIsSyncing(true);
            const { SupabaseService } = await import('./services/supabaseService');
            // CRITICAL: Pull before Push to avoid regressions
            await SupabaseService.pullDelta();
            await SupabaseService.syncAll();
            console.log("☁️ Sincronización completa (Pull + Push).");

            // Actualizar fecha de último backup
            const now = new Date().toISOString();
            await db.saveSettings({ ...sett, lastBackupDate: now });
          } catch (pushErr) {
            console.warn("⚠️ No se pudo subir a la nube:", pushErr);
            if (isManual) showToast("Error al sincronizar con la nube", "error");
          } finally {
            setIsSyncing(false);
          }
        }
      }
    } catch (e) {
      console.error("Error en sincronización:", e);
    }

    const [p, c, cust, s, b, u, cr, pr, con, sett, exp] = await Promise.all([
      db.getProducts(), db.getCategories(), db.getCustomers(),
      db.getSales(), db.getBranches(), db.getUsers(),
      db.getCredits(), db.getPromotions(), db.getConsumables(),
      db.getSettings(), db.getExpenses()
    ]);
    setProducts(p);
    setCategories(c);
    setCustomers(cust);
    setSales(s);
    setBranches(b);
    setUsers(u);
    setCredits(cr);
    setPromotions(pr);
    setConsumables(con);
    setSettings(sett);
    setExpenses(exp);
  };

  useEffect(() => {
    let intervalId: any;
    let backupIntervalId: any;

    const initApp = async () => {
      try {
        await db.init();
        // Carga rápida desde IndexedDB - NO hacer pull/push aquí
        // El pull se maneja en initSync cuando user cambia
        await refreshData(false);

        // Setup background check for 3-hour backup
        backupIntervalId = setInterval(() => {
          db.checkAndAutoSync();
        }, 15 * 60 * 1000); // Check every 15 minutes

        // Auto-sync DESACTIVADO: El push automático cada 30s puede subir datos viejos
        // El push ahora solo ocurre cuando el usuario hace un cambio real (guardar producto, venta, etc.)
        // Esto se maneja en storageService.triggerAutoSync() que se llama después de cada operación
        /*
        intervalId = setInterval(async () => {
         const fastSync = async () => {
        const sett = await db.getSettings();
        if (sett.supabaseUrl && sett.supabaseKey && sett.autoSync) {
          try {
            setIsSyncing(true);
            const { SupabaseService } = await import('./services/supabaseService');
            await SupabaseService.syncAll();
            console.log("🔄 Autocompletado FastSync");
          } catch (e) {
            console.warn("FastSync failed, will retry next interval");
          } finally {
            setIsSyncing(false);
          }
        }
      };
        */

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
        console.error("Error inicializando app:", e);
      } finally {
        setLoading(false);
      }
    };

    initApp();
    return () => {
      if (intervalId) clearInterval(intervalId);
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
      refreshData(true); // Traer datos de la nube sin bloquear UI
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
          console.log("⚡ Pull ya realizado esta sesión, omitiendo...");
          return;
        }

        console.log("🚀 Usuario ingresó al sistema. Descargando TODOS los datos de la nube...");
        const sett = await db.getSettings();

        // Solo sincronizar si Supabase está configurado
        if (sett.supabaseUrl && sett.supabaseKey) {
          try {
            // Mark as pulled BEFORE the actual pull to prevent race conditions
            hasPulledFromCloud.current = true;

            const { SupabaseService } = await import('./services/supabaseService');

            // CRITICAL FIX: Use pullAll() to get ALL fresh data from cloud
            // This ensures multi-device sync works correctly - cloud is always source of truth
            console.log("⬇️ Descargando TODOS los datos de la nube (pullAll)...");
            const cloudData = await SupabaseService.pullAll();

            if (cloudData) {
              console.log("✅ Datos completos descargados de la nube");

              // Update lastBackupDate on successful pull
              const freshSettings = await db.getSettings();
              const now = new Date().toISOString();
              await db.saveSettings({ ...freshSettings, lastBackupDate: now });

              // Fix any duplicate folios after pulling data from cloud
              const fixResult = await db.fixDuplicateFolios();
              if (fixResult.fixed > 0) {
                console.log(`🔧 Corregidos ${fixResult.fixed} folios duplicados`);
              }
            } else {
              console.log("☁️ No hay datos en la nube o error de conexión");
            }

            // Recargar datos locales después del pull
            await refreshData(false);
          } catch (pullErr) {
            console.warn("⚠️ Error al descargar de la nube (continuando...):", pullErr);
            // Si falla el pull, cargar datos locales
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

  // Global Unified Cloud Polling (Fast Sync) - AGGRESSIVE MODE
  useEffect(() => {
    let pollInterval: any = null;
    let aggressiveInterval: any = null;
    let syncCount = 0;

    const fastSync = async (isInitial = false) => {
      // 1. Guard: Solo si hay usuario logueado
      if (!user) return;

      // 2. Guard: Solo si la pestaña está visible (ahorro de datos/batería)
      if (document.visibilityState !== 'visible') return;

      try {
        const sett = await db.getSettings();
        if (!sett?.supabaseUrl || !sett?.supabaseKey) return;

        const { SupabaseService } = await import('./services/supabaseService');
        // Pull changes
        const changed = await SupabaseService.pullDelta();
        syncCount++;

        // Update icon timestamp regardless of changes (to show we "checked" the cloud)
        const now = new Date().toISOString();
        await db.saveSettings({ ...sett, lastBackupDate: now });

        if (changed && changed > 0) {
          console.log(`🔄 FastSync #${syncCount}: ${changed} cambios aplicados desde la nube`);
          await db.fixDuplicateFolios();
          await refreshData(false);
        } else if (isInitial) {
          console.log(`🔄 FastSync #${syncCount}: Sin cambios (verificación)`);
        }
      } catch (e) {
        console.warn("⚠️ FastSync failure:", e);
      }
    };

    // Visibility change handler - sync immediately when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("👁️ Pestaña visible - sincronizando inmediatamente...");
        fastSync(true);
      }
    };

    // AGGRESSIVE: Run immediately, then every 15 seconds for first 2 minutes
    fastSync(true);
    aggressiveInterval = setInterval(() => fastSync(true), 15000);

    // After 2 minutes, switch to relaxed polling (every 30 seconds)
    setTimeout(() => {
      if (aggressiveInterval) clearInterval(aggressiveInterval);
      console.log("⏱️ Cambiando a polling relajado (cada 30 segundos)");
      pollInterval = setInterval(fastSync, 30000);
    }, 120000);

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (aggressiveInterval) clearInterval(aggressiveInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.id]);

  // =========== SUPABASE REALTIME SUBSCRIPTION ===========
  // This provides instant updates when another device changes an order
  // Falls back to polling if Realtime is unavailable
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const setupRealtime = async () => {
      if (!user) return;

      try {
        const sett = await db.getSettings();
        if (!sett?.supabaseUrl || !sett?.supabaseKey) {
          console.log('📡 [Realtime] Supabase no configurado, usando solo polling');
          return;
        }

        const { subscribeToSales } = await import('./services/realtimeService');

        // Subscribe to real-time sales changes
        unsubscribe = await subscribeToSales((sale, eventType) => {
          console.log(`📡 [Realtime] UI Update: ${sale.folio} (${eventType})`);
          // Update sales state with the new/updated sale
          setSales(prevSales => {
            const existingIndex = prevSales.findIndex(s => s.id === sale.id);
            if (existingIndex >= 0) {
              // Update existing sale
              const updated = [...prevSales];
              updated[existingIndex] = sale;
              return updated;
            } else {
              // Add new sale
              return [...prevSales, sale];
            }
          });
        });

        console.log('📡 [Realtime] Suscripción global iniciada');
      } catch (error) {
        console.warn('⚠️ [Realtime] Error al configurar, usando polling:', error);
      }
    };

    setupRealtime();

    // CRITICAL: Cleanup subscription when user logs out or component unmounts
    return () => {
      if (unsubscribe) {
        unsubscribe();
        console.log('📡 [Realtime] Suscripción limpiada');
      }
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
  const badges = {
    orders: sales.filter(s => (s.fulfillmentStatus === 'pending' || s.fulfillmentStatus === 'production') && s.status === 'active').length,
    credits: (credits || []).filter(c => {
      if (c.status === 'paid' || c.status === 'cancelled') return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return new Date(c.dueDate) < today;
    }).length
  };

  // Calculate Alerts for Notification Bell
  const alerts: { type: string; message: string; link?: string }[] = [];

  // Low Stock Alerts
  const lowStockProducts = products.filter(p => p.enableLowStockAlert !== false && p.stock <= p.minStock);
  if (lowStockProducts.length > 0) {
    alerts.push({ type: 'stock', message: `${lowStockProducts.length} producto(s) con stock bajo`, link: 'products' });
  }

  // Overdue Credit Alerts
  const overdueCredits = (credits || []).filter(c => {
    if (c.status === 'paid' || c.status === 'cancelled') return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(c.dueDate) < today;
  });
  if (overdueCredits.length > 0) {
    alerts.push({ type: 'credit', message: `${overdueCredits.length} crédito(s) vencido(s)`, link: 'credits' });
  }

  // Pending Orders Due Tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const ordersDueTomorrow = sales.filter(s => s.isOrder && s.status === 'active' && s.fulfillmentStatus !== 'delivered' && s.shippingDetails?.shippingDate?.startsWith(tomorrowStr));
  if (ordersDueTomorrow.length > 0) {
    alerts.push({ type: 'order', message: `${ordersDueTomorrow.length} pedido(s) para entregar MAÑANA`, link: 'orders' });
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
      case 'dashboard': return <Dashboard products={products} sales={sales} credits={credits} customers={customers} consumables={consumables} onNavigate={navigateTo} />;
      case 'pos': return <POS products={products} customers={customers} categories={categories} user={user} branchId={currentBranch?.id || ''} onSaleComplete={refreshData} loadedQuote={quoteToLoad} onQuoteProcessed={() => setQuoteToLoad(null)} onRefreshData={refreshData} settings={safeSettings} onNavigate={navigateTo} />;
      case 'expenses': return <Expenses user={user} onUpdate={refreshData} settings={safeSettings} />;
      case 'inventoryHistory': return <InventoryHistory products={products} users={users} />;
      case 'products': return <Products products={products} categories={categories} users={users} onUpdate={refreshData} initialFilter={pageParams?.filter} initialTab={pageParams?.tab} settings={safeSettings} user={user} />;
      case 'salesHistory': return <SalesHistory sales={sales} customers={customers} users={users} onUpdate={refreshData} user={user} branchId={currentBranch?.id} onLoadQuote={(quote) => { setQuoteToLoad(quote); setPage('pos'); }} settings={safeSettings} />;
      case 'customers': return <Customers customers={customers} onUpdate={refreshData} user={user} settings={safeSettings} />;
      case 'credits': return <Credits settings={safeSettings} />;
      case 'reports': return <Reports sales={sales} products={products} customers={customers} categories={categories} />;
      case 'sarBooks': return <SARBooks />;
      case 'settings': return <Settings onUpdate={refreshData} />;
      case 'cashCut': return <CashCut />;
      case 'orders': return <Orders sales={sales} customers={customers} categories={categories} settings={safeSettings} onUpdate={refreshData} />;
      case 'promotions': return <Promotions />;
      case 'users': return <Users />;
      case 'branches': return <Branches />;
      default: return <Dashboard products={products} sales={sales} credits={credits} customers={customers} consumables={consumables} onNavigate={navigateTo} />;
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
