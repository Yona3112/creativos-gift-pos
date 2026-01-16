
import React, { useState, useRef, useEffect } from 'react';
import { db } from '../services/storageService';
import { CompanySettings, LoyaltyLevel, Product, Sale, User, UserRole } from '../types';
import { Button, Input, Card, Alert, Modal, Badge, ConfirmDialog, showToast } from '../components/UIComponents';
import { createClient } from '@supabase/supabase-js';
import { SupabaseService } from '../services/supabaseService';

interface SettingsProps {
  onUpdate?: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ onUpdate }) => {
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
        setSettings(prev => prev ? ({ ...prev, logo: compressedLogo }) : null);
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

  const openUserModal = (user?: User) => {
    setUserFormData(user || { role: UserRole.VENDEDOR, active: true });
    setIsUserModalOpen(true);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Configuración del Sistema</h1>
        {saved && <Badge variant="success">¡Guardado!</Badge>}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card title="Apariencia y Marca">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="space-y-4">
              <label className="text-sm font-bold text-gray-700 block">Logo de la Empresa</label>
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 border-2 border-dashed rounded-xl flex items-center justify-center bg-gray-50 overflow-hidden">
                  {settings.logo ? (
                    <img src={settings.logo} alt="Logo preview" className="w-full h-full object-contain" />
                  ) : (
                    <i className="fas fa-image text-2xl text-gray-300"></i>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-xs text-gray-500">Se recomienda una imagen cuadrada de máx 400x400px (WebP/PNG).</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => document.getElementById('logo-upload')?.click()} icon="upload">
                    Seleccionar Imagen
                  </Button>
                  <input id="logo-upload" type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                  {settings.logo && (
                    <button type="button" className="text-xs text-red-500 font-bold ml-2 hover:underline" onClick={() => setSettings(s => s ? ({ ...s, logo: undefined }) : null)}>
                      Quitar Logo
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-sm font-bold text-gray-700 block">Ajuste de Logo</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer bg-gray-50 p-2 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
                  <input type="radio" name="logoObjectFit" value="cover" checked={settings.logoObjectFit !== 'contain'} onChange={() => setSettings(prev => prev ? ({ ...prev, logoObjectFit: 'cover' }) : null)} className="accent-primary" />
                  <span className="text-sm">Rellenar Círculo</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer bg-gray-50 p-2 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
                  <input type="radio" name="logoObjectFit" value="contain" checked={settings.logoObjectFit === 'contain'} onChange={() => setSettings(prev => prev ? ({ ...prev, logoObjectFit: 'contain' }) : null)} className="accent-primary" />
                  <span className="text-sm">Ajustar al Círculo</span>
                </label>
              </div>
              <p className="text-[10px] text-gray-400">Seleccione "Ajustar" si su logo se corta en los bordes.</p>
            </div>

            <div className="space-y-4">
              <label className="text-sm font-bold text-gray-700 block">Color de Marca</label>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  name="themeColor"
                  value={settings.themeColor || '#6366F1'}
                  onChange={handleChange}
                  className="w-16 h-16 rounded-xl cursor-pointer border-none p-0 bg-transparent"
                />
                <div className="flex-1">
                  <Input
                    label="Código Hex"
                    name="themeColor"
                    value={settings.themeColor || '#6366F1'}
                    onChange={handleChange}
                    placeholder="#000000"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Este color se usará para acentos en tickets y reportes.</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Información de la Empresa">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Nombre del Negocio" name="name" value={settings.name} onChange={handleChange} required />
            <Input label="RTN" name="rtn" value={settings.rtn} onChange={handleChange} required />
            <Input label="Dirección" name="address" value={settings.address} onChange={handleChange} required />
            <Input label="Teléfono" name="phone" value={settings.phone} onChange={handleChange} required />
            <Input label="Correo Electrónico" name="email" value={settings.email} onChange={handleChange} required />
            <Input label="WhatsApp (Opcional)" name="whatsappNumber" value={settings.whatsappNumber || ''} onChange={handleChange} />
            <Input label="Contraseña Maestra" type="password" name="masterPassword" value={settings.masterPassword || ''} onChange={handleChange} placeholder="Clave para anular ventas" />
          </div>
        </Card>

        <Card title="Configuración Fiscal (SAR)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input label="CAI" name="cai" value={settings.cai} onChange={handleChange} required placeholder="000000-000000-000000-000000-000000-00" />
            </div>
            <Input label="Rango Inicial (000-001-01-XXXXXXXX)" name="billingRangeStart" value={settings.billingRangeStart} onChange={handleChange} required />
            <Input label="Rango Final (000-001-01-XXXXXXXX)" name="billingRangeEnd" value={settings.billingRangeEnd} onChange={handleChange} required />
            <Input label="Fecha Límite de Emisión" type="date" name="billingDeadline" value={settings.billingDeadline} onChange={handleChange} required />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Próxima Factura" type="number" value={settings.currentInvoiceNumber} onChange={(e) => handleNumChange('currentInvoiceNumber', e.target.value)} required />
              <Input label="Próximo Ticket" type="number" value={settings.currentTicketNumber || 1} onChange={(e) => handleNumChange('currentTicketNumber', e.target.value)} required />
            </div>
          </div>
        </Card>

        <Card title="Configuración de Puntos y Crédito">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Lempiras por Punto" type="number" value={settings.moneyPerPoint} onChange={(e) => handleNumChange('moneyPerPoint', e.target.value)} />
            <Input label="Valor monetario del Punto (L)" type="number" step="0.01" value={settings.pointValue} onChange={(e) => handleNumChange('pointValue', e.target.value)} />
            <div className="md:col-span-2">
              <Alert variant="info">
                <i className="fas fa-info-circle mr-2"></i>
                La <strong>Tasa de Interés</strong> configurada aquí es <strong>MENSUAL</strong>. Se aplicará automáticamente a todas las nuevas ventas al crédito.
              </Alert>
            </div>
            <div>
              <Input
                label="Tasa de Interés Mensual (%)"
                type="number"
                value={settings.defaultCreditRate}
                onChange={(e) => handleNumChange('defaultCreditRate', e.target.value)}
                className="font-bold text-lg"
              />
              <p className="text-xs text-blue-600 font-bold mt-1">
                Equivalente Anual: {(settings.defaultCreditRate * 12).toFixed(2)}%
              </p>
            </div>
            <div className="flex items-center gap-4">
              <label className="text-sm font-bold text-gray-700">Tamaño Impresora:</label>
              <select name="printerSize" value={settings.printerSize} onChange={handleChange} className="p-2 border rounded-lg">
                <option value="58mm">58mm</option>
                <option value="80mm">80mm</option>
              </select>
            </div>
          </div>
        </Card>

        <Card title="Mensajes en Factura / Tickets">
          <div className="space-y-4">
            <Input
              label="Mensaje de Agradecimiento"
              name="thanksMessage"
              value={settings.thanksMessage || ''}
              onChange={handleChange}
              placeholder="Ej: ¡Gracias por preferir Creativos Gift!"
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-bold text-gray-700">Política de Garantía</label>
                <textarea
                  name="warrantyPolicy"
                  className="w-full p-2 border rounded-lg text-sm h-20"
                  value={settings.warrantyPolicy || ''}
                  onChange={handleChange}
                  placeholder="Describa los términos de garantía..."
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-gray-700">Política de Devoluciones</label>
                <textarea
                  name="returnPolicy"
                  className="w-full p-2 border rounded-lg text-sm h-20"
                  value={settings.returnPolicy || ''}
                  onChange={handleChange}
                  placeholder="Describa los términos de devoluciones..."
                />
              </div>
            </div>
            <p className="text-[10px] text-gray-400">Estos mensajes aparecerán en la parte inferior de sus tickets impresos.</p>
          </div>
        </Card>

        <Card title="Información Legal (Contratos/Pagarés)">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nombre del Propietario / Representante"
                name="legalOwnerName"
                value={settings.legalOwnerName || ''}
                onChange={handleChange}
                placeholder="Persona que firma los contratos"
              />
              <Input
                label="Ciudad para Documentos"
                name="legalCity"
                value={settings.legalCity || ''}
                onChange={handleChange}
                placeholder="Ej: Tegucigalpa, MDC"
              />
            </div>
            <p className="text-[10px] text-gray-400 font-bold uppercase">Esta información se utilizará para generar los contratos y pagarés de ventas al crédito.</p>
          </div>
        </Card>

        <Card title="Configuración de Etiquetas (Códigos de Barra)">
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Ancho (mm)</label>
                <input
                  type="number"
                  className="w-full p-2 border rounded-lg"
                  value={settings.barcodeWidth || 50}
                  onChange={e => handleNumChange('barcodeWidth', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Alto (mm)</label>
                <input
                  type="number"
                  className="w-full p-2 border rounded-lg"
                  value={settings.barcodeHeight || 25}
                  onChange={e => handleNumChange('barcodeHeight', e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="showLogoOnBarcode"
                  className="w-4 h-4 text-primary"
                  checked={settings.showLogoOnBarcode || false}
                  onChange={e => setSettings(s => s ? ({ ...s, showLogoOnBarcode: e.target.checked }) : null)}
                />
                <label htmlFor="showLogoOnBarcode" className="text-sm font-bold text-gray-700">Mostrar Logo</label>
              </div>
              {settings.showLogoOnBarcode && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Tamaño Logo (mm)</label>
                  <input
                    type="number"
                    className="w-full p-2 border rounded-lg"
                    value={settings.barcodeLogoSize || 10}
                    onChange={e => handleNumChange('barcodeLogoSize', e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center gap-3">
              <i className="fas fa-info-circle text-blue-500 text-xl"></i>
              <div className="text-xs text-blue-700">
                Ajuste el tamaño según su rollo de etiquetas. Si activa el logo, asegúrese de tener uno subido en la sección de "Apariencia".
              </div>
            </div>
          </div>
        </Card>

        <Card title="Respaldo y Almacenamiento">
          <div className="flex flex-col gap-4">
            <div className="bg-gray-50 p-4 rounded-xl">
              <div className="flex justify-between mb-2 text-sm font-bold text-gray-600">
                <span>Espacio en Navegador</span>
                <span>{storageUsage.percent.toFixed(2)}% Usado</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className={`h-2.5 rounded-full ${storageUsage.percent > 80 ? 'bg-red-500' : 'bg-primary'}`} style={{ width: `${Math.min(100, storageUsage.percent)}%` }}></div>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                Usado: {(storageUsage.used / (1024 * 1024)).toFixed(2)} MB de {(storageUsage.total / (1024 * 1024)).toFixed(2)} MB disponibles.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button type="button" variant="secondary" onClick={handleBackup} icon="download">Descargar Respaldo</Button>
              <Button type="button" variant="outline" onClick={handleRestoreClick} icon="upload">Restaurar Respaldo</Button>
              <input type="file" ref={fileInputRef} className="hidden" accept=".json,application/json" onChange={handleFileChange} />
            </div>
          </div>
        </Card>

        {/* User Management Section */}
        <Card title="Gestión de Usuarios">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button type="button" size="sm" onClick={() => openUserModal()} icon="user-plus">Nuevo Usuario</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-xs">
                  <tr>
                    <th className="px-4 py-2">Nombre</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Rol (Permisos)</th>
                    <th className="px-4 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map(u => (
                    <tr key={u.id}>
                      <td className="px-4 py-2 font-medium">{u.name}</td>
                      <td className="px-4 py-2 text-gray-500">{u.email}</td>
                      <td className="px-4 py-2"><Badge variant={u.role === UserRole.ADMIN ? 'primary' : 'default'}>{u.role}</Badge></td>
                      <td className="px-4 py-2 text-right space-x-2">
                        <button type="button" onClick={() => openUserModal(u)} className="text-gray-400 hover:text-blue-600"><i className="fas fa-edit"></i></button>
                        <button type="button" onClick={() => handleDeleteUser(u.id)} className="text-gray-400 hover:text-red-500"><i className="fas fa-trash"></i></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        <Card title="Nube y Sincronización (Supabase)">
          <div className="space-y-4">
            <Alert variant="info">
              <i className="fas fa-cloud mr-2"></i>
              Sincronice sus datos locales con Supabase para tener un respaldo en la nube y acceder desde múltiples dispositivos.
            </Alert>
            <div className="grid grid-cols-1 gap-4">
              <Input label="Supabase URL" name="supabaseUrl" value={settings.supabaseUrl || ''} onChange={handleChange} placeholder="https://xyz.supabase.co" />
              <div className="flex gap-2 items-end">
                <Input label="Supabase Anon Key" name="supabaseKey" value={settings.supabaseKey || ''} onChange={handleChange} type="password" placeholder="eyJhb..." className="flex-1" />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mb-1"
                  onClick={async () => {
                    setSyncStatus({ type: 'info', message: 'Probando conexión...' });
                    try {
                      await SupabaseService.testConnection();
                      setSyncStatus({ type: 'success', message: '¡Conexión exitosa!' });
                    } catch (err: any) {
                      setSyncStatus({ type: 'danger', message: `Fallo: ${err.message}` });
                    }
                  }}
                >
                  Probar
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-dashed border-gray-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <i className="fas fa-history"></i>
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-700">Sincronización Automática</div>
                  <div className="text-xs text-gray-500">
                    Último respaldo: {settings.lastBackupDate ? new Date(settings.lastBackupDate).toLocaleString() : 'Nunca'}
                  </div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings.autoSync || false}
                  onChange={e => setSettings(s => s ? ({ ...s, autoSync: e.target.checked }) : null)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {(settings.supabaseUrl && settings.supabaseKey) && (
              <div className="flex flex-col gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="primary"
                  className="w-full"
                  onClick={async () => {
                    setIsSyncing(true);
                    setSyncStatus({ type: 'info', message: 'Subiendo datos a la nube...' });
                    try {
                      const results = await SupabaseService.syncAll();
                      // Save last backup date
                      const now = new Date().toISOString();
                      const updatedSettings = { ...settings, lastBackupDate: now };
                      await db.saveSettings(updatedSettings);
                      setSettings(updatedSettings);
                      setSyncStatus({ type: 'success', message: '¡Datos subidos con éxito!', results });
                      if (onUpdate) onUpdate();
                    } catch (err: any) {
                      setSyncStatus({ type: 'danger', message: `Error al subir: ${err.message}` });
                    } finally {
                      setIsSyncing(false);
                    }
                  }}
                  disabled={isSyncing}
                  icon={isSyncing ? 'spinner fa-spin' : 'cloud-upload-alt'}
                >
                  Subir a la Nube (Backup Manual)
                </Button>
                <p className="text-xs text-gray-500 text-center">
                  <i className="fas fa-info-circle mr-1"></i>
                  La descarga de datos es automática al iniciar sesión
                </p>
                {syncStatus && (
                  <div className={`p-4 rounded-xl border ${syncStatus.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
                    syncStatus.type === 'danger' ? 'bg-red-50 border-red-200 text-red-800' :
                      'bg-blue-50 border-blue-200 text-blue-800'
                    }`}>
                    <div className="flex items-center gap-2 font-bold mb-2">
                      <i className={`fas ${syncStatus.type === 'success' ? 'fa-check-circle' :
                        syncStatus.type === 'danger' ? 'fa-exclamation-circle' :
                          'fa-info-circle'
                        }`}></i>
                      {syncStatus.message}
                    </div>
                    {syncStatus.results && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs mt-2">
                        {Object.entries(syncStatus.results).map(([table, status]: [string, any]) => (
                          <div key={table} className="flex items-center gap-1">
                            <span className={`w-2 h-2 rounded-full ${status === 'Sincronizado' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                            <span className="font-medium">{table}:</span>
                            <span className="opacity-75 truncate">{status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card title="Mantenimiento de Base de Datos" className="border-amber-200 bg-amber-50">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-amber-700">Purga de Datos Históricos</h3>
                <p className="text-xs text-amber-600 font-medium italic">Optimiza la base de datos eliminando registros muy antiguos.</p>
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Eliminar anteriores a:</label>
                  <select
                    className="text-xs p-1 border rounded bg-white font-bold"
                    value={purgeYears}
                    onChange={e => setPurgeYears(parseInt(e.target.value))}
                  >
                    <option value={1}>1 Año</option>
                    <option value={2}>2 Años</option>
                    <option value={3}>3 Años</option>
                  </select>
                </div>
              </div>
              <Button type="button" variant="outline" onClick={() => setShowPurgeConfirm(true)}>Ejecutar Purga</Button>
            </div>
          </div>
        </Card>


        <div className="flex justify-end pb-10">
          <Button type="submit" size="lg" icon="save">Guardar Configuración</Button>
        </div>
      </form>

      {/* User Modal */}
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


      {/* ConfirmDialogs */}
      <ConfirmDialog
        isOpen={restoreConfirm.open}
        title="Restaurar Datos"
        message="¿Restaurar datos? Se reemplazarán todos los datos actuales con el respaldo."
        confirmText="Restaurar"
        cancelText="Cancelar"
        variant="warning"
        onConfirm={async () => {
          await db.restoreData(restoreConfirm.data);
          setRestoreConfirm({ open: false, data: null });
          window.location.reload();
        }}
        onCancel={() => setRestoreConfirm({ open: false, data: null })}
      />

      <ConfirmDialog
        isOpen={deleteUserConfirm.open}
        title="Desactivar Usuario"
        message="¿Desactivar este usuario? Ya no podrá iniciar sesión."
        confirmText="Desactivar"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={async () => {
          await db.deleteUser(deleteUserConfirm.id);
          setUsers((await db.getUsers()).filter(u => u.active !== false));
          setDeleteUserConfirm({ open: false, id: '' });
        }}
        onCancel={() => setDeleteUserConfirm({ open: false, id: '' })}
      />

      <ConfirmDialog
        isOpen={downloadConfirm}
        title="Descargar de la Nube"
        message="Esto sobreescribirá los datos locales con los de la nube. ¿Continuar?"
        confirmText="Descargar"
        cancelText="Cancelar"
        variant="warning"
        onConfirm={async () => {
          setDownloadConfirm(false);
          setIsSyncing(true);
          setSyncStatus({ type: 'info', message: 'Descargando datos de la nube...' });
          try {
            await SupabaseService.pullAll();
            setSyncStatus({ type: 'success', message: '¡Datos descargados con éxito!' });
            setTimeout(() => window.location.reload(), 2000);
          } catch (err: any) {
            setSyncStatus({ type: 'danger', message: `Error al descargar: ${err.message}` });
          } finally {
            setIsSyncing(false);
          }
        }}
        onCancel={() => setDownloadConfirm(false)}
      />

      <ConfirmDialog
        isOpen={showPurgeConfirm}
        title="Confirmar Purga de Datos"
        message={`¿Está seguro? Se eliminarán permanentemente las ventas y movimientos de hace más de ${purgeYears} año(s). Esta acción no se puede deshacer.`}
        confirmText="Purgar Ahora"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={async () => {
          const results = await db.purgeOldData(purgeYears);
          showToast(`Purga completada. Se eliminaron ${results.sales} ventas y ${results.history} movimientos viejos.`, "success");
          setShowPurgeConfirm(false);
          if (onUpdate) onUpdate();
        }}
        onCancel={() => setShowPurgeConfirm(false)}
      />

    </div>
  );
};
