
import React, { useState, useEffect, useRef } from 'react';
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
// Fix: Added Card to the imported components from UIComponents
import { Button, Input, Card, useNotifications } from './components/UIComponents';

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
  const { sendNotification } = useNotifications();

  const refreshData = async (shouldPullFromCloud = false) => {
    try {
      if (shouldPullFromCloud) {
        const sett = await db.getSettings();
        // Sincronizar automáticamente si las credenciales están presentes
        if (sett.supabaseUrl && sett.supabaseKey) {
          const { SupabaseService } = await import('./services/supabaseService');
          try {
            const result = await SupabaseService.pullAll();
            if (result) {
              console.log("☁️ Sincronización con la nube exitosa.");
            }
          } catch (pullErr) {
            console.warn("⚠️ No se pudo descargar de la nube, usando datos locales:", pullErr);
          }
        }
      }
    } catch (e) {
      console.error("Error en sincronización inicial:", e);
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

    const initApp = async () => {
      try {
        await db.init();
        // Carga rápida desde IndexedDB
        await refreshData(false);
        // Sync en background
        refreshData(true);

        intervalId = setInterval(() => {
          refreshData(true);
        }, 60000);

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

  const navigateTo = (p: string, params?: any) => {
    setPage(p);
    setPageParams(params);
  };

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
        <Card className="w-full max-w-md animate-pop-in">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-primary rounded-2xl flex items-center justify-center text-white text-4xl mx-auto mb-4 shadow-xl shadow-primary/30 overflow-hidden">
              {settings?.logo ? (
                <img src={settings.logo} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <i className="fas fa-store"></i>
              )}
            </div>
            <h1 className="text-2xl font-black text-gray-800">{settings?.name || 'Creativos Gift'}</h1>
            <p className="text-gray-500 font-medium">Control de Inventario y Ventas</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <Input label="Correo Electrónico" type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required icon="envelope" />
            <Input label="Contraseña" type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required icon="lock" />
            {loginError && <p className="text-red-500 text-sm font-bold animate-shake">{loginError}</p>}
            <Button type="submit" className="w-full py-4 text-lg">Iniciar Sesión</Button>
          </form>
        </Card>
      </div>
    );
  }

  const renderPage = () => {
    const safeSettings = settings || ({} as CompanySettings);

    switch (page) {
      case 'dashboard': return <Dashboard products={products} sales={sales} credits={credits} customers={customers} consumables={consumables} onNavigate={navigateTo} />;
      case 'pos': return <POS products={products} customers={customers} categories={categories} user={user} branchId={currentBranch?.id || ''} onSaleComplete={refreshData} loadedQuote={quoteToLoad} onQuoteProcessed={() => setQuoteToLoad(null)} onRefreshData={refreshData} settings={safeSettings} />;
      case 'expenses': return <Expenses user={user} onUpdate={refreshData} />;
      case 'inventoryHistory': return <InventoryHistory products={products} users={users} />;
      case 'products': return <Products products={products} categories={categories} users={users} onUpdate={refreshData} initialFilter={pageParams?.filter} initialTab={pageParams?.tab} />;
      case 'salesHistory': return <SalesHistory sales={sales} customers={customers} users={users} onUpdate={refreshData} user={user} branchId={currentBranch?.id} onLoadQuote={setQuoteToLoad} settings={safeSettings} />;
      case 'customers': return <Customers customers={customers} onUpdate={refreshData} />;
      case 'credits': return <Credits settings={safeSettings} />;
      case 'reports': return <Reports sales={sales} products={products} customers={customers} categories={categories} />;
      case 'settings': return <Settings onUpdate={refreshData} />;
      case 'cashCut': return <CashCut />;
      case 'orders': return <Orders onUpdate={refreshData} />;
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
        currentBranch={currentBranch}
        branches={branches}
        settings={settings || ({} as CompanySettings)}
        onLogout={handleLogout}
        onChangeBranch={(id) => setCurrentBranch(branches.find(b => b.id === id) || null)}
        currentPage={page}
        onNavigate={setPage}
      >
        {renderPage()}
      </Layout>
    </div>
  );
}

export default App;
