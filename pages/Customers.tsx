import React, { useState, useMemo, useEffect } from 'react';
import { Customer, LoyaltyLevel, User, UserRole, CompanySettings, Sale, CreditAccount } from '../types';
import { Button, Input, Modal, Badge, Pagination, useDebounce, Alert, PasswordConfirmDialog, showToast } from '../components/UIComponents';
import { db } from '../services/storageService';

interface CustomersProps {
  customers: Customer[];
  onUpdate: () => void;
  user?: User;
  settings?: CompanySettings;
}

const ITEMS_PER_PAGE = 20; // Increased for table view

export const Customers: React.FC<CustomersProps> = ({ customers, onUpdate, user, settings }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Customer>>({ type: 'Natural' });
  const [error, setError] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' });

  // 360 View State
  const [is360Open, setIs360Open] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSales, setCustomerSales] = useState<Sale[]>([]);
  const [customerCredits, setCustomerCredits] = useState<CreditAccount[]>([]);
  const [activeTab, setActiveTab] = useState<'profile' | 'sales' | 'credits'>('profile');

  // Search & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [currentPage, setCurrentPage] = useState(1);

  const validateForm = async (data: Partial<Customer>): Promise<string | null> => {
    if (!data.name || data.name.trim().length < 3) return "El nombre del cliente es obligatorio y debe tener al menos 3 caracteres.";

    const cleanPhone = (data.phone || '').replace(/\D/g, '');
    const phoneRegex = /^[2389]\d{7}$/;
    if (!phoneRegex.test(cleanPhone)) return "El teléfono debe tener 8 dígitos válidos (Ej: 99999999).";

    if (data.rtn && data.rtn.trim() !== '') {
      const cleanRTN = data.rtn.replace(/\D/g, '');
      if (!/^\d{14}$/.test(cleanRTN)) return "El RTN debe contener exactamente 14 dígitos numéricos.";

      if (!data.id) {
        const customers = await db.getCustomers();
        const exists = customers.find(c => c.rtn === data.rtn && c.active !== false);
        if (exists) return "Ya existe un cliente con este RTN.";
      }
    }

    if (data.type === 'Natural' && data.dni && data.dni.trim() !== '') {
      const cleanDNI = data.dni.replace(/\D/g, '');
      if (cleanDNI.length !== 13) return "El DNI debe tener 13 dígitos numéricos.";
      if (!data.id) {
        const customers = await db.getCustomers();
        const exists = customers.find(c => c.dni === data.dni && c.active !== false);
        if (exists) return "Ya existe un cliente con este DNI.";
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = await validateForm(formData);
    if (validationError) {
      setError(validationError);
      return;
    }

    const safeCustomer: Partial<Customer> = {
      ...formData,
      points: formData.points || 0,
      totalSpent: formData.totalSpent || 0,
      level: formData.level || LoyaltyLevel.BRONZE,
      active: true
    };
    await db.saveCustomer(safeCustomer as Customer);
    setIsModalOpen(false);
    setError(null);
    onUpdate();
    showToast("Cliente guardado exitosamente.", "success");

    // Refresh 360 view if open
    if (is360Open && selectedCustomer?.id === safeCustomer.id) {
      setSelectedCustomer({ ...selectedCustomer, ...safeCustomer } as Customer);
    }
  };

  const handleArchive = (customer?: Customer) => {
    const target = customer?.id ? customer : formData;
    if (target.id) {
      setArchiveConfirm({ open: true, id: target.id, name: target.name || '' });
      setIsModalOpen(false);
      setIs360Open(false);
    }
  };

  const openNewModal = () => {
    setFormData({ type: 'Natural', level: LoyaltyLevel.BRONZE });
    setError(null);
    setIsModalOpen(true);
  };

  const open360View = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData(customer); // Pre-fill form for editing tab
    setActiveTab('profile');
    setIs360Open(true);

    // Load data
    const sales = await db.getSalesByCustomer(customer.id);
    setCustomerSales(sales);
    const credits = await db.getCreditsByCustomer(customer.id);
    setCustomerCredits(credits);
  };

  const openWhatsApp = (phone: string, name: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const message = `Hola ${name}, le saludamos de ${settings?.name || 'Creativos Gift'}.`;
    window.open(`https://wa.me/504${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      if (c.active === false) return false;
      const lowerSearch = debouncedSearch.toLowerCase();
      return (
        (c.name || '').toLowerCase().includes(lowerSearch) ||
        (c.code || '').toLowerCase().includes(lowerSearch) || // Search by BP Code
        (c.phone || '').includes(lowerSearch) ||
        (c.rtn && c.rtn.includes(debouncedSearch)) ||
        (c.dni && c.dni.includes(debouncedSearch))
      );
    });
  }, [customers, debouncedSearch]);

  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE);
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Cartera de Clientes</h1>
          <p className="text-sm text-gray-500">{customers.length} clientes registrados</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Input
            placeholder="Buscar por nombre, código, RTN..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full sm:w-72"
            icon="search"
          />
          <Button onClick={openNewModal} icon="plus">Nuevo</Button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wider border-b">
              <tr>
                <th className="p-4">Cliente / Código</th>
                <th className="p-4">Contacto</th>
                <th className="p-4">Identificación</th>
                <th className="p-4 text-right">Puntos / Nivel</th>
                <th className="p-4 text-right">Gastado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginatedCustomers.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm
                                        ${c.level === LoyaltyLevel.PLATINUM ? 'bg-purple-500' :
                          c.level === LoyaltyLevel.GOLD ? 'bg-yellow-500' :
                            c.level === LoyaltyLevel.SILVER ? 'bg-gray-400' : 'bg-orange-700'}`}>
                        {c.name.substring(0, 1)}
                      </div>
                      <div>
                        <div className="font-bold text-gray-800">{c.name}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{c.code || 'S/C'}</span>
                          <Badge variant={c.type === 'Juridico' ? 'warning' : 'default'} className="!text-[9px] !py-0">{c.type}</Badge>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm font-medium text-gray-700">{c.phone}</div>
                    {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                  </td>
                  <td className="p-4">
                    <div className="text-xs text-gray-500">
                      {c.rtn && <div>RTN: {c.rtn}</div>}
                      {c.dni && <div>DNI: {c.dni}</div>}
                      {!c.rtn && !c.dni && <span className="italic opacity-50">Sin datos</span>}
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="font-bold text-primary">{c.points} pts</div>
                    <div className="text-[10px] text-gray-400 uppercase font-bold">{c.level}</div>
                  </td>
                  <td className="p-4 text-right">
                    <span className="font-mono font-bold text-gray-800">L {(c.totalSpent || 0).toFixed(2)}</span>
                  </td>
                  <td className="p-4">
                    <div className="flex justify-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="success" className="w-8 h-8 !p-0 flex items-center justify-center rounded-full" onClick={() => openWhatsApp(c.phone, c.name)} title="Chat WhatsApp">
                        <i className="fab fa-whatsapp"></i>
                      </Button>
                      <Button size="sm" variant="secondary" className="w-8 h-8 !p-0 flex items-center justify-center rounded-full" onClick={() => open360View(c)} title="Ver Detalle 360">
                        <i className="fas fa-eye"></i>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    <i className="fas fa-search text-2xl mb-2 opacity-20"></i>
                    <p>No se encontraron clientes</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />

      {/* NEW & SIMPLE EDIT MODAL (Only when creating) */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Registrar Nuevo Cliente">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}

          <div className="flex gap-4 p-1 bg-gray-100 rounded-xl mb-4">
            {['Natural', 'Juridico'].map(type => (
              <button
                key={type}
                type="button"
                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${formData.type === type ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}
                onClick={() => setFormData({ ...formData, type: type as any })}
              >
                {type === 'Natural' ? 'Persona Natural' : 'Empresa / Jurídico'}
              </button>
            ))}
          </div>

          <Input label="Nombre / Razón Social" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />

          <div className="grid grid-cols-2 gap-4">
            <Input label="Teléfono" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} required maxLength={8} />
            <Input label="RTN" value={formData.rtn || ''} onChange={e => setFormData({ ...formData, rtn: e.target.value })} maxLength={14} />
          </div>

          {formData.type === 'Natural' && (
            <Input label="DNI" value={formData.dni || ''} onChange={e => setFormData({ ...formData, dni: e.target.value })} maxLength={13} />
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="correo@ejemplo.com" />
            <Input label="Dirección" value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="Colonia, Calle..." />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button type="submit">Guardar</Button>
          </div>
        </form>
      </Modal>

      {/* CUSTOMER 360 MODAL (EDIT & VIEW) */}
      <Modal isOpen={is360Open} onClose={() => setIs360Open(false)} title="Vista 360° Cliente" size="lg">
        {selectedCustomer && (
          <div className="flex flex-col h-[500px]">
            {/* Header Profile Summary */}
            <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl mb-4 border border-gray-100">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold
                            ${selectedCustomer.level === LoyaltyLevel.PLATINUM ? 'bg-purple-500' :
                  selectedCustomer.level === LoyaltyLevel.GOLD ? 'bg-yellow-500' :
                    selectedCustomer.level === LoyaltyLevel.SILVER ? 'bg-gray-400' : 'bg-orange-700'}`}>
                {selectedCustomer.name.substring(0, 1)}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">{selectedCustomer.name}</h2>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span className="font-mono bg-white border px-1 rounded">{selectedCustomer.code || 'S/C'}</span>
                      <span>|</span>
                      <i className="fas fa-phone mr-1"></i> {selectedCustomer.phone}
                    </div>
                  </div>
                  <Button size="sm" variant="success" onClick={() => openWhatsApp(selectedCustomer.phone, selectedCustomer.name)}>
                    <i className="fab fa-whatsapp mr-2"></i> Mensaje
                  </Button>
                </div>
              </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex border-b mb-4">
              {['profile', 'sales', 'credits'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors
                             ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                  {tab === 'profile' && 'Perfil y Datos'}
                  {tab === 'sales' && 'Historial Compras'}
                  {tab === 'credits' && 'Créditos'}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto pr-1">
              {activeTab === 'profile' && (
                <form onSubmit={handleSubmit} className="space-y-4 p-1">
                  {error && <Alert variant="danger">{error}</Alert>}
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Nombre" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                    <Input label="Teléfono" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} required maxLength={8} />
                    <Input label="RTN" value={formData.rtn || ''} onChange={e => setFormData({ ...formData, rtn: e.target.value })} />
                    <Input label="DNI" value={formData.dni || ''} onChange={e => setFormData({ ...formData, dni: e.target.value })} />
                    <Input label="Email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                    <Input label="Dirección" value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                  </div>
                  <div className="pt-4 flex justify-between">
                    <Button type="button" variant="danger" onClick={() => handleArchive(selectedCustomer)} icon="archive">Archivar</Button>
                    <Button type="submit" icon="save">Guardar Cambios</Button>
                  </div>
                </form>
              )}

              {activeTab === 'sales' && (
                <div className="space-y-2">
                  {customerSales.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">Sin historial de compras.</div>
                  ) : (
                    customerSales.map(sale => (
                      <div key={sale.id} className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                        <div>
                          <div className="font-bold text-gray-800">Folio: {sale.folio || sale.id.substring(0, 8)}</div>
                          <div className="text-xs text-gray-500">{new Date(sale.date).toLocaleDateString()}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-primary">L {sale.total.toFixed(2)}</div>
                          <Badge className="text-[9px]" variant={sale.status === 'active' ? 'success' : 'danger'}>{sale.status}</Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'credits' && (
                <div className="space-y-2">
                  {customerCredits.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">Este cliente no tiene créditos.</div>
                  ) : (
                    customerCredits.map(credit => (
                      <div key={credit.id} className="p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                        <div className="flex justify-between mb-2">
                          <span className="font-bold text-gray-700">Crédito de Venta</span>
                          <Badge variant={credit.status === 'paid' ? 'success' : credit.status === 'overdue' ? 'danger' : 'warning'}>
                            {credit.status === 'paid' ? 'PAGADO' : 'PENDIENTE'}
                          </Badge>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Total: L {credit.totalAmount.toFixed(2)}</span>
                          <span className="font-bold text-red-500">Saldo: L {(credit.totalAmount - credit.paidAmount).toFixed(2)}</span>
                        </div>
                        <div className="mt-2 w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                          <div className="bg-green-500 h-full" style={{ width: `${(credit.paidAmount / credit.totalAmount) * 100}%` }}></div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <PasswordConfirmDialog
        isOpen={archiveConfirm.open}
        title="Archivar Cliente"
        message={`¿Estás seguro de archivar al cliente "${archiveConfirm.name}"?`}
        confirmText="Archivar"
        cancelText="Cancelar"
        variant="warning"
        masterPassword={settings?.masterPassword || ''}
        isAdmin={user?.role === UserRole.ADMIN}
        onConfirm={async () => {
          await db.deleteCustomer(archiveConfirm.id);
          setArchiveConfirm({ open: false, id: '', name: '' });
          onUpdate();
          showToast("Cliente archivado exitosamente.", "success");
        }}
        onCancel={() => setArchiveConfirm({ open: false, id: '', name: '' })}
      />
    </div>
  );
};
