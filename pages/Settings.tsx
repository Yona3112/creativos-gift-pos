
import React, { useState, useRef, useEffect } from 'react';
import { db } from '../services/storageService';
import { CompanySettings, LoyaltyLevel, Product, Sale, User, UserRole } from '../types';
import { Button, Input, Card, Alert, Modal, Badge } from '../components/UIComponents';
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

  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'danger' | 'info', message: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // User Management State
  const [users, setUsers] = useState<User[]>([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userFormData, setUserFormData] = useState<Partial<User>>({ role: UserRole.VENDEDOR, active: true });

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
        alert("Error al procesar el logo.");
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
        if (confirm(`¿Restaurar datos? Se reemplazarán los actuales.`)) {
          await db.restoreData(data);
          window.location.reload();
        }
      } catch (err) { alert('Archivo inválido.'); }
    };
    reader.readAsText(file);
  };

  // User Management Handlers
  const handleSaveUser = async () => {
    if (!userFormData.name || !userFormData.email || !userFormData.password) {
      alert("Complete todos los campos obligatorios");
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
    if (confirm("¿Desactivar este usuario?")) {
      await db.deleteUser(id);
      setUsers((await db.getUsers()).filter(u => u.active !== false));
    }
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
                La <strong>Tasa de Interés</strong> configurada aquí se aplicará automáticamente a todas las nuevas ventas al crédito.
              </Alert>
            </div>
            <Input
              label="Tasa de Interés Crédito (%)"
              type="number"
              value={settings.defaultCreditRate}
              onChange={(e) => handleNumChange('defaultCreditRate', e.target.value)}
              className="font-bold text-lg"
            />
            <div className="flex items-center gap-4">
              <label className="text-sm font-bold text-gray-700">Tamaño Impresora:</label>
              <select name="printerSize" value={settings.printerSize} onChange={handleChange} className="p-2 border rounded-lg">
                <option value="58mm">58mm</option>
                <option value="80mm">80mm</option>
              </select>
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

            <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-xl">
              <input
                type="checkbox"
                id="autoSync"
                checked={!!settings.autoSync}
                onChange={(e) => setSettings(s => s ? ({ ...s, autoSync: e.target.checked }) : null)}
                className="w-5 h-5 accent-primary"
              />
              <label htmlFor="autoSync" className="text-sm font-bold text-gray-700 cursor-pointer">
                Sincronización Automática (Respaldo en la nube después de cada cambio)
              </label>
            </div>

            {(settings.supabaseUrl && settings.supabaseKey) && (
              <div className="flex flex-col gap-3 pt-4 border-t">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    className="flex-1"
                    onClick={async () => {
                      setIsSyncing(true);
                      setSyncStatus({ type: 'info', message: 'Subiendo datos a la nube...' });
                      try {
                        await SupabaseService.syncAll();
                        setSyncStatus({ type: 'success', message: '¡Datos subidos con éxito!' });
                      } catch (err: any) {
                        setSyncStatus({ type: 'danger', message: `Error al subir: ${err.message}` });
                      } finally {
                        setIsSyncing(false);
                      }
                    }}
                    disabled={isSyncing}
                    icon={isSyncing ? 'spinner fa-spin' : 'cloud-upload-alt'}
                  >
                    Subir a la Nube (Backup)
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={async () => {
                      if (confirm('Esto sobreescribirá los datos locales con los de la nube. ¿Continuar?')) {
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
                      }
                    }}
                    disabled={isSyncing}
                    icon={isSyncing ? 'spinner fa-spin' : 'cloud-download-alt'}
                  >
                    Descargar de la Nube
                  </Button>
                </div>
                {syncStatus && (
                  <Alert variant={syncStatus.type}>{syncStatus.message}</Alert>
                )}
              </div>
            )}
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

    </div>
  );
};
