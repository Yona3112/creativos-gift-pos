
import React, { useState } from 'react';
import { User, UserRole, Branch, CompanySettings } from '../types';
import { WhatsAppButton } from './UIComponents';

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  currentBranch: Branch | null;
  branches: Branch[];
  settings: CompanySettings;
  onLogout: () => void;
  onChangeBranch: (id: string) => void;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const MENU_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'chart-pie' },
  { id: 'pos', label: 'Vender (F1)', icon: 'cash-register' },
  { id: 'orders', label: 'Pedidos / Taller', icon: 'tasks' },
  { id: 'expenses', label: 'Gastos / Egresos', icon: 'money-bill-wave' },
  { id: 'products', label: 'Inventario / Kardex', icon: 'boxes' },
  { id: 'salesHistory', label: 'Facturación / Caja', icon: 'file-invoice-dollar' },
  { id: 'customers', label: 'Clientes / Puntos', icon: 'users' },
  { id: 'reports', label: 'Inteligencia Negocio', icon: 'chart-bar' },
  { id: 'sarBooks', label: 'Libros SAR', icon: 'book' },
  { id: 'settings', label: 'Configuración', icon: 'cog' },
];

export const Layout: React.FC<LayoutProps> = ({
  children, user, currentBranch, branches, settings, onLogout, onChangeBranch, currentPage, onNavigate
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filteredMenu = MENU_ITEMS.filter(item => {
    const restrictedForVendor = ['settings', 'reports', 'branches', 'users'];
    // FIX: Added optional chaining to prevent crash if user is null
    if (user?.role === UserRole.VENDEDOR && restrictedForVendor.includes(item.id)) return false;
    return true;
  });

  return (
    <div className="h-screen flex bg-surface font-sans overflow-hidden">
      {sidebarOpen && <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transition-transform duration-300 transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 flex flex-col shrink-0`}>
        <div className="h-20 flex items-center px-6 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white mr-3 shadow-md">
            {settings?.logo ? <img src={settings.logo} className="w-full h-full object-cover rounded-xl" /> : <i className="fas fa-store"></i>}
          </div>
          <span className="text-lg font-black text-gray-800 truncate">{settings?.name || 'Creativos Gift'}</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {filteredMenu.map(item => (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${currentPage === item.id ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              <i className={`fas fa-${item.icon} w-5`}></i> {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50"><i className="fas fa-sign-out-alt"></i> Salir</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        <header className="lg:hidden h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="w-10 h-10 flex items-center justify-center bg-gray-50 rounded-xl"><i className="fas fa-bars"></i></button>
          <span className="font-black text-primary">{settings?.name || 'Creativos Gift'}</span>
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold text-xs">{user?.name?.charAt(0) || '?'}</div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 relative">{children}</div>
        {settings?.showFloatingWhatsapp && <WhatsAppButton phoneNumber={settings.whatsappNumber} />}
      </main>
    </div>
  );
};
