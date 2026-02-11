
import React, { useState, useRef, useEffect } from 'react';
import { db } from '../services/storageService';
import { CompanySettings, LoyaltyLevel, Product, Sale, User, UserRole, SEASONS } from '../types';
import { Button, Input, Card, Alert, Modal, Badge, ConfirmDialog, showToast } from '../components/UIComponents';
import { createClient } from '@supabase/supabase-js';
import { SupabaseService } from '../services/supabaseService';

interface SettingsProps {
  onUpdate?: () => void;
}

// Internal Error Boundary for Settings
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class SettingsErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(_error: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("❌ Stats Settings Crash:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <h2 className="text-xl font-bold text-red-600 mb-2">Error en Configuración</h2>
          <p className="text-gray-600 mb-4">Ocurrió un error al mostrar la configuración. No es necesario reiniciar todo el sistema.</p>
          <button
            type="button"
            className="px-4 py-2 bg-primary text-white rounded-lg"
            // @ts-expect-error - TS config issue with class component inheritance
            onClick={() => this.setState({ hasError: false })}
          >
            Reintentar
          </button>
        </div>
      );
    }
    // @ts-expect-error - TS config issue with class component inheritance
    return this.props.children;
  }
}

const SettingsContent: React.FC<SettingsProps> = ({ onUpdate }) => {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageUsage, setStorageUsage] = useState({ used: 0, total: 1, percent: 0 });

  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'danger' | 'info', message: string, results?: any } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // User Management State
  const [users, setUsers] = useState<User[]>([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userFormData, setUserFormData] = useState<Partial<User>>({ role: UserRole.VENDEDOR, active: true });

  // ConfirmDialog states
  const [restoreConfirm, setRestoreConfirm] = useState<{ open: boolean; data: any }>({ open: false, data: null });
  const [deleteUserConfirm, setDeleteUserConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
  const [downloadConfirm, setDownloadConfirm] = useState(false);

  const [purgeYears, setPurgeYears] = useState(1);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);




  const fileInputRef = useRef<HTMLInputElement>(null);

  const INVOICE_FORMAT_REGEX = /^\d{3}-\d{3}-\d{2}-\d{8}$/;

  useEffect(() => {
    const load = async () => {
      const s = await db.getSettings();
      setSettings(s);
      const u = await db.getUsers();
      setUsers(u.filter(user => user.active !== false));
      const estimate = await db.getStorageEstimate();
      setStorageUsage(estimate);
    };
    load();
  }, [saved]);

  if (!settings) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setSettings(prev => prev ? ({ ...prev, [name]: value }) : null);
    if (error) setError(null);
  };

  const handleNumChange = (name: keyof CompanySettings, val: string) => {
    const num = val === '' ? 0 : parseFloat(val);
    setSettings(prev => prev ? ({ ...prev, [name]: num }) : null);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedLogo = await db.compressImage(file);
        // Add versioning to bust cache if it's a URL or just refresh the state
        const versionedLogo = compressedLogo.startsWith('data:')
          ? compressedLogo
          : `${compressedLogo}${compressedLogo.includes('?') ? '&' : '?'}v=${Date.now()}`;

        setSettings(prev => prev ? ({ ...prev, logo: versionedLogo }) : null);
      } catch (err) {
        showToast("Error al procesar el logo.", "error");
      }
    }
  };

  const validateSAR = (): boolean => {
    if (!INVOICE_FORMAT_REGEX.test(settings.billingRangeStart)) {
      setError('Rango Inicial inválido.');
      return false;
    }
    if (!INVOICE_FORMAT_REGEX.test(settings.billingRangeEnd)) {
      setError('Rango Final inválido.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateSAR()) return;
    await db.saveSettings(settings);
    setSaved(true);
    setError(null);
    showToast("Configuración guardada exitosamente.", "success"); // Push notification
    setTimeout(() => setSaved(false), 3000);
    if (onUpdate) onUpdate();
  };

  const handleBackup = async () => {
    const data = await db.getAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_pos_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const handleRestoreClick = () => { fileInputRef.current?.click(); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        setRestoreConfirm({ open: true, data });
      } catch (err) { showToast('Archivo inválido.', 'error'); }
    };
    reader.readAsText(file);
  };

  // User Management Handlers
  const handleSaveUser = async () => {
    // Password only required for new users (no id means new user)
    const isNewUser = !userFormData.id;
    if (!userFormData.name || !userFormData.email || (isNewUser && !userFormData.password)) {
      showToast("Complete todos los campos obligatorios", "warning");
      return;
    }
    const newUser: User = {
      id: userFormData.id || Date.now().toString(),
      name: userFormData.name,
      email: userFormData.email,
      password: userFormData.password,
      role: userFormData.role || UserRole.VENDEDOR,
      branchId: 'main-branch', // Default branch
      active: true
    };
    await db.saveUser(newUser);
    setUsers(await db.getUsers());
    setIsUserModalOpen(false);
  };

  const handleDeleteUser = async (id: string) => {
    setDeleteUserConfirm({ open: true, id });
  };

  const handleCloudSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      await db.saveSettings(settings);
      const pushResults = await SupabaseService.syncAll();
      const pulledChanges = await SupabaseService.pullDelta();
      setSyncStatus({
        type: 'success',
        message: 'Sincronización completada con éxito',
        results: { push: pushResults, pulling: pulledChanges }
      });
      showToast("Sincronización completada", "success");
      const updatedSettings = await db.getSettings();
      setSettings(updatedSettings);
      if (onUpdate) onUpdate();
    } catch (e: any) {
      console.error("Sync Error:", e);
      setSyncStatus({ type: 'danger', message: `Fallo al sincronizar: ${e.message}` });
      showToast("Error al sincronizar", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleForceFullSync = async () => {
    if (isSyncing) return;
    const confirm = window.confirm("¿Forzar sincronización total? Esto subirá TODOS los datos locales a la nube (útil si faltan datos de ayer/antier).");
    if (!confirm) return;

    setIsSyncing(true);
    setSyncStatus(null);
    try {
      await db.saveSettings(settings);
      showToast("Iniciando subida total...", "info");
      const pushResults = await SupabaseService.syncAll(true);
      const pulledChanges = await SupabaseService.pullDelta();
      setSyncStatus({
        type: 'success',
        message: 'Sincronización TOTAL completada',
        results: { push: pushResults, pulling: pulledChanges }
      });
      showToast("Sincronización total completa", "success");
      if (onUpdate) onUpdate();
    } catch (e: any) {
      console.error("Full Sync Error:", e);
      showToast("Error en sincronización total", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const openUserModal = (user?: User) => {
    setUserFormData(user || { role: UserRole.VENDEDOR, active: true });
    setIsUserModalOpen(true);
  };

  return (
    <div className="max-w-6xl mx-auto pb-24 px-4 sm:px-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Configuración del Sistema</h1>
          <p className="text-gray-500 mt-1">Administra las preferencias, usuarios y datos de tu negocio.</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg animate-fade-in">
              <i className="fas fa-check-circle"></i>
              <span className="font-bold text-sm">Cambios Guardados</span>
            </div>
          )}
          <Button onClick={(e) => handleSubmit(e as any)} size="lg" icon="save" className="shadow-lg shadow-indigo-200">
            Guardar Todo
          </Button>
        </div>
      </div>

      {error && <div className="mb-6"><Alert variant="danger">{error}</Alert></div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar Navigation for Settings could go here for larger screens if needed, strictly sticking to current flow but better grid */}

        <div className="lg:col-span-8 space-y-8">
          {/* Sección 1: Identidad Corporativa */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center"><i className="fas fa-id-card"></i></div>
              <h2 className="font-bold text-lg text-gray-800">Identidad Corporativa</h2>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex flex-col sm:flex-row gap-6">
                <div className="flex-shrink-0">
                  <label className="block text-sm font-bold text-gray-700 mb-2">Logotipo</label>
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden transition-all group-hover:border-indigo-400">
                      {settings.logo ? (
                        <img src={settings.logo} className={`w-full h-full object-${settings.logoObjectFit || 'contain'}`} />
                      ) : (
                        <i className="fas fa-image text-4xl text-gray-300 group-hover:text-indigo-300 transition-colors"></i>
                      )}
                    </div>
                    <button
                      onClick={() => document.getElementById('logo-upload')?.click()}
                      className="absolute bottom-2 right-2 w-8 h-8 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-indigo-700 transition-all transform hover:scale-110"
                      title="Subir Logo"
                    >
                      <i className="fas fa-camera text-xs"></i>
                    </button>
                    <input id="logo-upload" type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    <label className="text-xs flex items-center gap-2 text-gray-600 cursor-pointer">
                      <input type="radio" name="fit" checked={settings.logoObjectFit === 'cover'} onChange={() => setSettings(s => s ? ({ ...s, logoObjectFit: 'cover' }) : null)} />
                      <span>Rellenar (Cover)</span>
                    </label>
                    <label className="text-xs flex items-center gap-2 text-gray-600 cursor-pointer">
                      <input type="radio" name="fit" checked={settings.logoObjectFit !== 'cover'} onChange={() => setSettings(s => s ? ({ ...s, logoObjectFit: 'contain' }) : null)} />
                      <span>Ajustar (Contain)</span>
                    </label>
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Input label="Nombre del Negocio" name="name" value={settings.name} onChange={handleChange} required placeholder="Ej: Mi Tienda S. de R.L." />
                  </div>
                  <Input label="RTN" name="rtn" value={settings.rtn} onChange={handleChange} required />
                  <Input label="Teléfono" name="phone" value={settings.phone} onChange={handleChange} required />
                  <div className="sm:col-span-2">
                    <Input label="Dirección Física" name="address" value={settings.address} onChange={handleChange} required />
                  </div>
                  <Input label="Email" name="email" value={settings.email} onChange={handleChange} required />
                  <Input label="WhatsApp" name="whatsappNumber" value={settings.whatsappNumber || ''} onChange={handleChange} />
                </div>
              </div>

              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100 flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-indigo-900 mb-1">Color de Marca</label>
                  <p className="text-xs text-indigo-700">Personaliza el color principal de la aplicación.</p>
                </div>
                <div className="flex items-center gap-3 bg-white px-3 py-2 rounded-lg border border-indigo-200">
                  <input type="color" name="themeColor" value={settings.themeColor || '#6366F1'} onChange={handleChange} className="w-8 h-8 rounded-full border-0 p-0 cursor-pointer" />
                  <span className="font-mono text-sm text-gray-600 uppercase">{settings.themeColor || '#6366F1'}</span>
                </div>
              </div>

              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-white mb-1">
                    <i className="fas fa-moon mr-2 text-yellow-400"></i>Modo Oscuro
                  </label>
                  <p className="text-xs text-gray-400">Reduce la fatiga visual en ambientes con poca luz.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={settings.darkMode || false}
                    onChange={e => {
                      const newDarkMode = e.target.checked;
                      setSettings(s => s ? ({ ...s, darkMode: newDarkMode }) : null);
                      // Apply immediately
                      document.documentElement.classList.toggle('dark', newDarkMode);
                    }}
                  />
                  <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
                </label>
              </div>

              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 flex items-center gap-4 mt-3">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-blue-900 mb-1">
                    <i className="fas fa-volume-up mr-2 text-blue-500"></i>Sonidos de Confirmación
                  </label>
                  <p className="text-xs text-blue-700">Emitir un "beep" al escanear productos o completar ventas.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enableBeep || false}
                    onChange={(e) => setSettings({ ...settings, enableBeep: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100">
                <label className="block text-sm font-bold text-gray-700 mb-2">Temporada / Temática del Negocio</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {SEASONS.map(season => (
                    <button
                      key={season.id}
                      type="button"
                      onClick={() => {
                        setSettings(prev => prev ? ({ ...prev, currentSeason: season.id, themeColor: season.color }) : null);
                        showToast(`Temporada cambiada a ${season.name}`, "info");
                      }}
                      className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${settings.currentSeason === season.id ? 'border-primary bg-primary text-white' : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200'}`}
                    >
                      <div className="w-4 h-4 rounded-full border border-white" style={{ backgroundColor: season.color }}></div>
                      <span className="text-xs font-bold leading-tight text-center">{season.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Sección 2: Configuración Fiscal */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center"><i className="fas fa-file-invoice-dollar"></i></div>
              <h2 className="font-bold text-lg text-gray-800">Datos Fiscales (SAR)</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <Input label="CAI (Clave de Autorización)" name="cai" value={settings.cai} onChange={handleChange} required className="font-mono text-sm" placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX" />
                </div>
                <Input label="Rango Inicial" name="billingRangeStart" value={settings.billingRangeStart} onChange={handleChange} required className="font-mono" />
                <Input label="Rango Final" name="billingRangeEnd" value={settings.billingRangeEnd} onChange={handleChange} required className="font-mono" />
                <Input label="Fecha Límite Emisión" type="date" name="billingDeadline" value={settings.billingDeadline} onChange={handleChange} required />
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Próx. Factura</label>
                      <input type="number" className="w-full p-2 border rounded-lg font-mono font-bold text-emerald-600" value={settings.currentInvoiceNumber} onChange={(e) => handleNumChange('currentInvoiceNumber', e.target.value)} />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Próx. Ticket</label>
                      <input type="number" className="w-full p-2 border rounded-lg font-mono font-bold text-gray-600" value={settings.currentTicketNumber || 1} onChange={(e) => handleNumChange('currentTicketNumber', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Sección 3: Mensajes y Políticas */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center"><i className="fas fa-comment-dots"></i></div>
              <h2 className="font-bold text-lg text-gray-800">Mensajes y Políticas</h2>
            </div>
            <div className="p-6 space-y-4">
              <Input label="Mensaje de Agradecimiento (Ticket)" name="thanksMessage" value={settings.thanksMessage || ''} onChange={handleChange} placeholder="¡Gracias por su compra!" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Garantía</label>
                  <textarea name="warrantyPolicy" className="w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-amber-200 outline-none transition-shadow" rows={3} value={settings.warrantyPolicy || ''} onChange={handleChange} placeholder="Términos de garantía..."></textarea>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Devoluciones</label>
                  <textarea name="returnPolicy" className="w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-amber-200 outline-none transition-shadow" rows={3} value={settings.returnPolicy || ''} onChange={handleChange} placeholder="Política de cambios..."></textarea>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-4 space-y-8">
          {/* Sección 4: Configuración Rápida (Crédito/Puntos) */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center"><i className="fas fa-sliders-h"></i></div>
              <h2 className="font-bold text-lg text-gray-800">Parámetros</h2>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Créditos</h3>
                <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                  <label className="block text-sm font-bold text-purple-900 mb-1">Interés Mensual (%)</label>
                  <div className="flex items-center gap-2">
                    <input type="number" step="0.1" value={settings.defaultCreditRate} onChange={(e) => handleNumChange('defaultCreditRate', e.target.value)} className="w-full p-2 rounded-lg border-purple-200 font-bold text-lg text-center" />
                    <span className="text-purple-600 font-bold">%</span>
                  </div>
                  <p className="text-[10px] text-purple-700 mt-2 text-center">Anual: {(settings.defaultCreditRate * 12).toFixed(1)}%</p>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Programa Lealtad</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Lempiras para ganar 1 Pto</label>
                    <input type="number" value={settings.moneyPerPoint} onChange={(e) => handleNumChange('moneyPerPoint', e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Valor de 1 Pto (L)</label>
                    <input type="number" step="0.01" value={settings.pointValue} onChange={(e) => handleNumChange('pointValue', e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Hardware</h3>
                <label className="block text-sm font-bold text-gray-700 mb-1">Ancho Ticket</label>
                <select name="printerSize" value={settings.printerSize} onChange={handleChange} className="w-full p-2 border rounded-lg bg-gray-50">
                  <option value="58mm">58mm (Estándar)</option>
                  <option value="80mm">80mm (Ancho)</option>
                </select>
              </div>
            </div>
          </section>

          {/* Sección 5: Usuarios */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center"><i className="fas fa-users"></i></div>
                <h2 className="font-bold text-lg text-gray-800">Usuarios</h2>
              </div>
              <Button size="sm" onClick={() => openUserModal()} icon="plus" variant="ghost"></Button>
            </div>
            <div className="p-0">
              <div className="max-h-[300px] overflow-y-auto">
                {users.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${u.role === UserRole.ADMIN ? 'bg-indigo-500' : 'bg-green-500'}`}>
                        {u.name.substring(0, 1)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-800">{u.name}</p>
                        <p className="text-[10px] text-gray-500 uppercase">{u.role}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => openUserModal(u)} className="w-8 h-8 rounded-full hover:bg-blue-50 text-blue-500 flex items-center justify-center transition-colors"><i className="fas fa-pen text-xs"></i></button>
                      <button type="button" onClick={() => handleDeleteUser(u.id)} className="w-8 h-8 rounded-full hover:bg-red-50 text-red-500 flex items-center justify-center transition-colors"><i className="fas fa-trash text-xs"></i></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Sección 6: Cloud & Backup */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center"><i className="fas fa-cloud"></i></div>
              <h2 className="font-bold text-lg text-gray-800">Nube</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between p-3 bg-sky-50 rounded-xl border border-sky-100">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-sm font-bold text-sky-900">Cloud Realtime Sync Activo</span>
                </div>
                <Badge variant="success" className="text-[10px]">SIEMPRE ACTIVO</Badge>
              </div>

              <Input label="Supabase URL" name="supabaseUrl" value={settings.supabaseUrl || ''} onChange={handleChange} className="text-xs" />
              <Input label="Supabase Key" type="password" name="supabaseKey" value={settings.supabaseKey || ''} onChange={handleChange} className="text-xs" />

              {/* BOXFUL INTEGRATION SECTION */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                  <i className="fas fa-truck mr-2"></i>Integración Boxful
                </h3>
                <Input label="Boxful API Key" name="boxfulApiKey" value={settings.boxfulApiKey || ''} onChange={handleChange} className="text-xs" placeholder="Ingresa tu API Key de Boxful" />
                <div className="flex items-center justify-between mt-2 px-2 py-1 bg-amber-50 rounded-lg">
                  <span className="text-[10px] font-bold text-amber-700">Modo Sandbox (Pruebas)</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={settings.boxfulSandbox || false} onChange={e => setSettings(s => s ? ({ ...s, boxfulSandbox: e.target.checked }) : null)} />
                    <div className="w-7 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <Button size="sm" variant="secondary" onClick={handleBackup} icon="download" className="w-full">Respaldo Local (JSON)</Button>
                {/* 
                  Botones de sincronización manual ocultos por solicitud del usuario (Feb 2026).
                  El sistema ahora usa Realtime y sincronización automática en segundo plano.
                */}
              </div>

              {/* INVENTORY REPAIR SECTION */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                  <i className="fas fa-tools mr-2"></i>Reparación de Inventario
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Si el inventario no coincide después de usar múltiples dispositivos, usa estas herramientas:
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-xs"
                    onClick={async () => {
                      if (window.confirm("¿Reconciliar stock con movimientos? Esto recalculará el stock basado en el historial.")) {
                        setSyncStatus({ type: 'info', message: 'Reconciliando...' });
                        const { db } = await import('../services/storageService');
                        const result = await db.reconcileStockFromMovements();
                        if (result.fixed > 0) {
                          showToast(`✅ ${result.fixed} productos corregidos`, "success");
                        } else {
                          showToast("Stock sincronizado correctamente.", "success");
                        }
                        setSyncStatus({ type: 'success', message: 'Stock reconciliado exitosamente.' });
                      }
                    }}
                  >
                    Reconciliar Stock
                  </Button>
                  {/* Botón de Forzar Subida eliminado para evitar conflictos con Realtime */}
                </div>
                <p className="text-[10px] text-gray-400 mt-2 text-center">
                  💡 Usa "Reconciliar" si el stock no coincide entre dispositivos
                </p>
              </div>

              <button onClick={() => setShowPurgeConfirm(true)} className="w-full text-center text-xs text-red-500 hover:text-red-700 hover:underline mt-4">
                Herramientas de Mantenimiento Avanzado
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* Modals & Dialogs (Keep existing structure but simplify styles if needed) */}
      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title={userFormData.id ? "Editar Usuario" : "Nuevo Usuario"}>
        <div className="space-y-4">
          <Input label="Nombre Completo" value={userFormData.name || ''} onChange={e => setUserFormData({ ...userFormData, name: e.target.value })} />
          <Input label="Correo / Usuario" type="email" value={userFormData.email || ''} onChange={e => setUserFormData({ ...userFormData, email: e.target.value })} />
          <Input label="Contraseña" type="password" value={userFormData.password || ''} onChange={e => setUserFormData({ ...userFormData, password: e.target.value })} />
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Rol de Acceso</label>
            <select
              className="w-full p-3 rounded-xl border border-gray-200 outline-none focus:border-primary bg-white"
              value={userFormData.role}
              onChange={e => setUserFormData({ ...userFormData, role: e.target.value as UserRole })}
            >
              <option value={UserRole.VENDEDOR}>Vendedor (Caja y Ventas)</option>
              <option value={UserRole.ADMIN}>Administrador (Acceso Total)</option>
            </select>
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsUserModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveUser}>Guardar Usuario</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={restoreConfirm.open} title="Restaurar Datos" message="¿Restaurar datos? Se reemplazarán todos los datos actuales con el respaldo." confirmText="Restaurar" cancelText="Cancelar" variant="warning" onConfirm={async () => { await db.restoreData(restoreConfirm.data); setRestoreConfirm({ open: false, data: null }); window.location.reload(); }} onCancel={() => setRestoreConfirm({ open: false, data: null })} />
      <ConfirmDialog isOpen={deleteUserConfirm.open} title="Desactivar Usuario" message="¿Desactivar este usuario? Ya no podrá iniciar sesión." confirmText="Desactivar" cancelText="Cancelar" variant="danger" onConfirm={async () => { await db.deleteUser(deleteUserConfirm.id); setUsers((await db.getUsers()).filter(u => u.active !== false)); setDeleteUserConfirm({ open: false, id: '' }); }} onCancel={() => setDeleteUserConfirm({ open: false, id: '' })} />
      <ConfirmDialog isOpen={showPurgeConfirm} title="Confirmar Purga de Datos" message={`¿Está seguro? Se eliminarán permanentemente datos antiguos.`} confirmText="Purgar Ahora" cancelText="Cancelar" variant="danger" onConfirm={async () => { const results = await db.purgeOldData(purgeYears); showToast(`Purga completada.`, "success"); setShowPurgeConfirm(false); if (onUpdate) onUpdate(); }} onCancel={() => setShowPurgeConfirm(false)} />
    </div>
  );
};

export const Settings = (props: SettingsProps) => {
  return (
    <SettingsErrorBoundary>
      <SettingsContent {...props} />
    </SettingsErrorBoundary>
  );
};
