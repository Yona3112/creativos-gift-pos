
import React, { useState, useMemo } from 'react';
import { Customer, LoyaltyLevel, User, UserRole, CompanySettings } from '../types';
import { Button, Input, Card, Modal, Badge, Pagination, useDebounce, Alert, PasswordConfirmDialog } from '../components/UIComponents';
import { db } from '../services/storageService';

interface CustomersProps {
  customers: Customer[];
  onUpdate: () => void;
  user?: User;
  settings?: CompanySettings;
}

const ITEMS_PER_PAGE = 9;

export const Customers: React.FC<CustomersProps> = ({ customers, onUpdate, user, settings }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Customer>>({ type: 'Natural' });
  const [error, setError] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' });

  // Search & Pagination
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [currentPage, setCurrentPage] = useState(1);

  const validateForm = (data: Partial<Customer>): string | null => {
    // 1. Validar Nombre
    if (!data.name || data.name.trim().length < 3) {
      return "El nombre del cliente es obligatorio y debe tener al menos 3 caracteres.";
    }

    // 2. Validar Teléfono (Formato Honduras: 8 dígitos)
    // Eliminamos guiones o espacios para validar solo números
    const cleanPhone = (data.phone || '').replace(/\D/g, '');
    const phoneRegex = /^[2389]\d{7}$/; // Empieza con 2,3,8,9 y tiene 8 dígitos en total
    if (!phoneRegex.test(cleanPhone)) {
      return "El teléfono debe tener 8 dígitos válidos (Ej: 99999999).";
    }

    // 3. Validar RTN (Si se ingresa)
    if (data.rtn && data.rtn.trim() !== '') {
      const cleanRTN = data.rtn.replace(/\D/g, '');
      const rtnRegex = /^\d{14}$/; // Exactamente 14 dígitos
      if (!rtnRegex.test(cleanRTN)) {
        return "El RTN debe contener exactamente 14 dígitos numéricos.";
      }
    }

    // 4. Validar DNI (Si es Natural y se ingresa)
    if (data.type === 'Natural' && data.dni && data.dni.trim() !== '') {
      const cleanDNI = data.dni.replace(/\D/g, '');
      if (cleanDNI.length !== 13) {
        return "El DNI debe tener 13 dígitos numéricos.";
      }
    }

    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validateForm(formData);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Safe creation with defaults to prevent crashes
    const safeCustomer: Partial<Customer> = {
      ...formData,
      points: formData.points || 0,
      totalSpent: formData.totalSpent || 0,
      level: formData.level || LoyaltyLevel.BRONZE,
      active: true
    };
    db.saveCustomer(safeCustomer as Customer);
    setIsModalOpen(false);
    setError(null);
    onUpdate();
  };

  const handleArchive = (customer?: Customer) => {
    const target = customer?.id ? customer : formData;
    if (target.id) {
      setArchiveConfirm({ open: true, id: target.id, name: target.name || '' });
      setIsModalOpen(false);
    }
  };

  const openModal = (customer?: Customer) => {
    setFormData(customer || { type: 'Natural', level: LoyaltyLevel.BRONZE });
    setError(null);
    setIsModalOpen(true);
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      if (c.active === false) return false;

      const lowerSearch = debouncedSearch.toLowerCase();
      return (
        c.name.toLowerCase().includes(lowerSearch) ||
        c.email.toLowerCase().includes(lowerSearch) ||
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
        <h1 className="text-2xl font-bold text-gray-800">Clientes y Lealtad</h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <Input
            placeholder="Buscar por nombre, RTN o DNI..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full sm:w-64"
            icon="search"
          />
          <Button onClick={() => openModal()} icon="plus">Nuevo</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {paginatedCustomers.map(c => {
          // Defensive coding for level to prevent "undefined is not an object" crash
          const level = c.level || LoyaltyLevel.BRONZE;

          let cardColor = 'border-l-4 border-gray-400';
          let badgeVariant: 'info' | 'warning' | 'default' | 'success' = 'default';

          if (level === LoyaltyLevel.SILVER) { cardColor = 'border-l-4 border-blue-400'; badgeVariant = 'info'; }
          if (level === LoyaltyLevel.GOLD) { cardColor = 'border-l-4 border-yellow-400'; badgeVariant = 'warning'; }
          if (level === LoyaltyLevel.PLATINUM) { cardColor = 'border-l-4 border-purple-500'; badgeVariant = 'success'; }

          return (
            <Card key={c.id} className={`${cardColor} relative overflow-visible hover:shadow-lg transition-shadow duration-300`}>
              <div className="absolute -top-3 -right-3 flex gap-2">
                <Badge variant={c.type === 'Juridico' ? 'warning' : 'default'} className="shadow-md">
                  {c.type === 'Juridico' ? 'Jurídico' : 'Natural'}
                </Badge>
                <div className="w-12 h-12 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg animate-fade-in -mt-1">
                  {/* Safe substring access */}
                  {(level).substring(0, 1)}
                </div>
              </div>

              <div className="flex flex-col h-full">
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-gray-800 truncate pr-16">{c.name}</h3>
                  <div className="text-sm text-gray-500 space-y-2 mt-3">
                    {c.type === 'Natural' && (
                      <div className="flex items-center gap-2 text-gray-700 font-medium">
                        <i className="fas fa-id-card w-5 text-center text-gray-400"></i>
                        <span>DNI: {c.dni || 'Sin DNI'}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <i className="fas fa-file-invoice w-5 text-center text-gray-400"></i>
                      <span>RTN: {c.rtn || 'Sin RTN'}</span>
                    </div>

                    {c.type === 'Juridico' && c.legalRepresentative && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <i className="fas fa-user-tie w-5 text-center text-gray-400"></i>
                        <span className="text-xs">Rep: {c.legalRepresentative}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <i className="fas fa-phone w-5 text-center text-gray-400"></i>
                      <span>{c.phone}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <i className="fas fa-map-marker-alt w-5 text-center text-gray-400 mt-0.5"></i>
                      <span className="text-xs leading-tight">{c.address || 'Sin dirección'}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-auto pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Puntos</p>
                    <p className="text-xl font-bold text-primary">{c.points || 0}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-1">Nivel</p>
                    <Badge variant={badgeVariant}>{level}</Badge>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => handleArchive(c)}>
                    <i className="fas fa-trash text-gray-400 hover:text-red-500"></i>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openModal(c)}>Editar</Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {filteredCustomers.length === 0 && (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
          <i className="fas fa-users text-4xl text-gray-200 mb-3"></i>
          <p className="text-gray-400">No se encontraron clientes activos.</p>
        </div>
      )}

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={formData.id ? "Editar Cliente" : "Registrar Cliente"}>
        <form onSubmit={handleSubmit} className="space-y-4">

          {error && <Alert variant="danger">{error}</Alert>}

          {/* Type Selector */}
          <div className="flex gap-4 p-1 bg-gray-100 rounded-xl mb-4">
            <button
              type="button"
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${formData.type === 'Natural' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setFormData({ ...formData, type: 'Natural' })}
            >
              <i className="fas fa-user mr-2"></i> Persona Natural
            </button>
            <button
              type="button"
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${formData.type === 'Juridico' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setFormData({ ...formData, type: 'Juridico' })}
            >
              <i className="fas fa-building mr-2"></i> Persona Jurídica
            </button>
          </div>

          <Input
            label={formData.type === 'Natural' ? "Nombre Completo" : "Razón Social de la Empresa"}
            value={formData.name || ''}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            {formData.type === 'Natural' && (
              <Input
                label="DNI (Identidad)"
                value={formData.dni || ''}
                onChange={e => setFormData({ ...formData, dni: e.target.value })}
                placeholder="0801199900123"
                maxLength={13}
              />
            )}
            <Input
              label="RTN"
              value={formData.rtn || ''}
              onChange={e => setFormData({ ...formData, rtn: e.target.value })}
              placeholder="14 dígitos"
              maxLength={14}
              required={formData.type === 'Juridico'}
            />
          </div>

          {formData.type === 'Juridico' && (
            <Input
              label="Representante Legal"
              value={formData.legalRepresentative || ''}
              onChange={e => setFormData({ ...formData, legalRepresentative: e.target.value })}
              placeholder="Nombre del representante"
              icon="user-tie"
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Teléfono de Contacto"
              value={formData.phone || ''}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
              required
              placeholder="8 dígitos (Ej: 99999999)"
              maxLength={8}
            />
            <Input label="Correo Electrónico" type="email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} />
          </div>

          <Input label="Dirección Completa" value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="Colonia, Calle, #Casa" />

          <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-gray-100">
            {formData.id && (
              <Button type="button" variant="danger" className="mr-auto" onClick={handleArchive} icon="archive">Archivar</Button>
            )}
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button type="submit">Guardar Cliente</Button>
          </div>
        </form>
      </Modal>

      <PasswordConfirmDialog
        isOpen={archiveConfirm.open}
        title="Archivar Cliente"
        message={`¿Estás seguro de archivar al cliente "${archiveConfirm.name}"? El cliente no aparecerá en las listas pero sus datos se conservarán.`}
        confirmText="Archivar"
        cancelText="Cancelar"
        variant="warning"
        masterPassword={settings?.masterPassword || ''}
        isAdmin={user?.role === UserRole.ADMIN}
        onConfirm={async () => {
          await db.deleteCustomer(archiveConfirm.id);
          setArchiveConfirm({ open: false, id: '', name: '' });
          onUpdate();
        }}
        onCancel={() => setArchiveConfirm({ open: false, id: '', name: '' })}
      />
    </div>
  );
};
