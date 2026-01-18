
import React, { useState } from 'react';
import { User, UserRole, Branch, CompanySettings } from '../types';
import { WhatsAppButton, Modal } from './UIComponents';

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  currentBranch: Branch | null;
  branches: Branch[];
  settings: CompanySettings | null;
  onLogout: () => void;
  onChangeBranch: (id: string) => void;
  activePage: string;
  onNavigate: (page: string) => void;
  onManualUpload: () => void;
  onManualDownload: () => void;
}

const MENU_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'chart-pie' },
  { id: 'pos', label: 'Vender (F1)', icon: 'cash-register' },
  { id: 'orders', label: 'Pedidos / Taller', icon: 'tasks' },
  { id: 'cashCut', label: 'Corte de Caja', icon: 'calculator' },
  { id: 'expenses', label: 'Gastos / Egresos', icon: 'money-bill-wave' },
  { id: 'products', label: 'Inventario / Kardex', icon: 'boxes' },
  { id: 'salesHistory', label: 'Facturación / Caja', icon: 'file-invoice-dollar' },
  { id: 'customers', label: 'Clientes / Puntos', icon: 'users' },
  { id: 'credits', label: 'Créditos / Abonos', icon: 'hand-holding-usd' },
  { id: 'reports', label: 'Inteligencia Negocio', icon: 'chart-bar' },
  { id: 'sarBooks', label: 'Libros SAR', icon: 'book' },
  { id: 'settings', label: 'Configuración', icon: 'cog' },
];

// Cloud Upload Reminder Bell Component
const BackupReminderBell: React.FC<{
  settings: CompanySettings;
  onNavigate: (page: string) => void;
  onManualUpload: () => void;
  onManualDownload: () => void;
  userRole?: string;
}> = ({ settings, onNavigate, onManualUpload, onManualDownload, userRole }) => {
  const [showDropdown, setShowDropdown] = useState(false);

  const getBackupStatus = () => {
    if (!settings.lastBackupDate) return { color: 'text-red-600 animate-pulse', bg: 'bg-red-100', status: 'Nunca subido', urgency: '¡URGENTE!', badge: '!', icon: 'fa-cloud-upload-alt' };

    const lastBackup = new Date(settings.lastBackupDate);
    const now = new Date();
    const diffMs = now.getTime() - lastBackup.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 4) {
      return { color: 'text-green-500', bg: 'bg-green-100', status: 'Nube al día', urgency: 'Respaldo Automático OK', badge: null, icon: 'fa-cloud' };
    } else if (diffHours < 24) {
      return { color: 'text-yellow-500', bg: 'bg-yellow-100', status: 'Hace unas horas', urgency: '', badge: 'H', icon: 'fa-cloud' };
    } else if (diffHours < 72) {
      const days = Math.floor(diffHours / 24);
      return { color: 'text-orange-500', bg: 'bg-orange-100', status: `Hace ${days} día${days > 1 ? 's' : ''}`, urgency: 'Se recomienda subir', badge: days.toString(), icon: 'fa-cloud' };
    } else {
      const days = Math.floor(diffHours / 24);
      return { color: 'text-red-600 animate-pulse', bg: 'bg-red-100', status: `Hace ${days} días`, urgency: '¡Subir a Nube ahora!', badge: days.toString(), icon: 'fa-cloud-upload-alt' };
    }
  };

  const statusInfo = getBackupStatus();

  // Only show if supabase is configured
  if (!settings.supabaseUrl || !settings.supabaseKey) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`w-10 h-10 flex items-center justify-center ${statusInfo.bg} rounded-xl relative transition-all hover:scale-105`}
        title="Estado de Nube"
      >
        <i className={`fas ${statusInfo.icon} ${statusInfo.color} text-lg`}></i>
        {statusInfo.badge && (
          <span className={`absolute -top-1 -right-1 w-4 h-4 ${statusInfo.color.includes('red') ? 'bg-red-600' : statusInfo.color.includes('orange') ? 'bg-orange-500' : 'bg-yellow-500'} rounded-full text-white text-[10px] flex items-center justify-center font-bold`}>
            {statusInfo.badge}
          </span>
        )}
      </button>

      {showDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)}></div>
          <div className="absolute right-0 top-12 w-64 bg-white rounded-xl shadow-xl border border-gray-100 z-50 p-4 animate-scale-in origin-top-right">
            <div className="flex items-center gap-3 mb-3">
              <i className={`fas ${statusInfo.icon} text-2xl ${statusInfo.color}`}></i>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-gray-800">Nube / Respaldo</p>
                  {settings.autoSync && (
                    <div className="flex items-center gap-1 bg-green-50 px-1.5 py-0.5 rounded-full border border-green-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                      <span className="text-[8px] text-green-700 font-bold uppercase tracking-tighter">Auto</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500">{statusInfo.status}</p>
              </div>
            </div>
            {statusInfo.urgency && (
              <div className={`${statusInfo.bg} ${statusInfo.color} text-[10px] font-bold p-2 rounded-lg mb-3 text-center uppercase tracking-wider`}>
                {statusInfo.urgency}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                onClick={() => { setShowDropdown(false); onManualUpload(); }}
                className="flex flex-col items-center justify-center p-3 bg-indigo-50 text-indigo-700 rounded-xl hover:bg-indigo-100 transition-colors gap-2 group"
                title="Subir datos a la nube"
              >
                <i className="fas fa-cloud-upload-alt text-xl group-hover:scale-110 transition-transform"></i>
                <span className="text-[10px] font-black uppercase">Subir</span>
              </button>

              <button
                onClick={() => { setShowDropdown(false); onManualDownload(); }}
                className="flex flex-col items-center justify-center p-3 bg-amber-50 text-amber-700 rounded-xl hover:bg-amber-100 transition-colors gap-2 group"
                title="Descargar datos de la nube"
              >
                <i className="fas fa-cloud-download-alt text-xl group-hover:scale-110 transition-transform"></i>
                <span className="text-[10px] font-black uppercase">Bajar</span>
              </button>
            </div>

            {userRole !== 'vendedor' && (
              <button
                onClick={() => { setShowDropdown(false); onNavigate('settings'); }}
                className="w-full py-2 bg-gray-100 text-gray-600 rounded-lg text-[11px] font-bold hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
              >
                <i className="fas fa-cog"></i>
                Ir a Configuración
              </button>
            )}
            {settings.lastBackupDate && (
              <p className="text-xs text-gray-400 mt-2 text-center">
                Última subida: {new Date(settings.lastBackupDate).toLocaleString()}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export const Layout: React.FC<LayoutProps> = ({
  children, user, settings, onLogout, activePage, onNavigate, onManualUpload, onManualDownload
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoModal, setShowLogoModal] = useState(false);

  const filteredMenu = MENU_ITEMS.filter(item => {
    const restrictedForVendor = ['settings', 'reports', 'branches', 'users', 'sarBooks', 'expenses', 'dashboard'];
    // FIX: Added optional chaining to prevent crash if user is null
    if (user?.role === UserRole.VENDEDOR && restrictedForVendor.includes(item.id)) return false;
    return true;
  });

  return (
    <div className="h-screen flex bg-surface font-sans overflow-hidden">
      {sidebarOpen && <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transition-transform duration-300 transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 flex flex-col shrink-0 font-sans`}>
        <div className="h-28 flex flex-col items-center justify-center px-6 border-b border-gray-100 mb-2 shrink-0 bg-gradient-to-b from-primary/5 to-transparent">
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={() => setShowLogoModal(true)}
              className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-xl shadow-primary/10 shrink-0 p-1.5 hover:scale-105 transition-all cursor-zoom-in group relative border border-gray-50"
            >
              {settings?.logo ? (
                <img src={settings.logo} className="w-full h-full object-contain transition-all" alt="Logo" />
              ) : (
                <i className="fas fa-store text-xl text-primary"></i>
              )}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-primary/20 rounded-2xl">
                <i className="fas fa-search-plus text-white drop-shadow-md"></i>
              </div>
            </button>
            <div className="flex flex-col overflow-hidden">
              <span className="text-base font-black text-gray-900 leading-tight tracking-tight uppercase break-words line-clamp-2">
                {settings?.name || 'Creativos Gift'}
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                  Punto de Venta
                </span>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scrollbar">
          {filteredMenu.map(item => (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activePage === item.id ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:bg-gray-50'}`}
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
        <header className="hidden lg:flex h-16 bg-white border-b border-gray-200 items-center justify-between px-8 shrink-0 z-20">
          <div className="font-bold text-gray-500 text-sm flex items-center gap-2">
            <span className="opacity-50">Menú</span>
            <i className="fas fa-chevron-right text-[10px]"></i>
            <span className="text-primary">{MENU_ITEMS.find(i => i.id === activePage)?.label || 'Panel Principal'}</span>
          </div>

          <div className="flex items-center gap-4">
            {settings && (
              <BackupReminderBell
                settings={settings}
                onNavigate={onNavigate}
                onManualUpload={onManualUpload}
                onManualDownload={onManualDownload}
                userRole={user?.role}
              />
            )}

            <div className="h-8 w-px bg-gray-200 mx-2"></div>

            <div className="flex items-center gap-3">
              <div className="text-right hidden xl:block">
                <p className="text-sm font-bold text-gray-800 leading-none">{user?.name}</p>
                <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">{user?.role}</p>
              </div>
              <div className="w-9 h-9 bg-primary/10 text-primary border border-primary/20 rounded-full flex items-center justify-center font-bold shadow-sm">
                {user?.name?.charAt(0) || '?'}
              </div>
            </div>
          </div>
        </header>
        <header className="lg:hidden h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="w-10 h-10 flex items-center justify-center bg-gray-50 rounded-xl"><i className="fas fa-bars"></i></button>
          <span className="font-black text-primary">{settings?.name || 'Creativos Gift'}</span>
          <div className="flex items-center gap-2">
            {settings && (
              <BackupReminderBell
                settings={settings}
                onNavigate={onNavigate}
                onManualUpload={onManualUpload}
                onManualDownload={onManualDownload}
                userRole={user?.role}
              />
            )}
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold text-xs">{user?.name?.charAt(0) || '?'}</div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 relative">{children}</div>
        {settings?.showFloatingWhatsapp && <WhatsAppButton phoneNumber={settings.whatsappNumber} />}

        {/* LOGO MODAL */}
        <Modal isOpen={showLogoModal} onClose={() => setShowLogoModal(false)} title={settings?.name || 'Logo de Tienda'}>
          <div className="flex flex-col items-center justify-center p-4">
            <div className="w-64 h-64 md:w-96 md:h-96 rounded-full overflow-hidden border-4 border-white shadow-2xl bg-gray-100 mb-4">
              {settings?.logo ? (
                <img src={settings.logo} className="w-full h-full object-cover" alt="Logo Full" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <i className="fas fa-store text-6xl"></i>
                </div>
              )}
            </div>
            <p className="text-center text-sm text-gray-500 font-bold uppercase tracking-widest">
              Vista previa de imagen de perfil
            </p>
          </div>
        </Modal>
      </main>
    </div>
  );
};
