
import React, { useState, useEffect } from 'react';
import { Supplier } from '../types';
import { Card, Button, Input, Modal } from '../components/UIComponents';
import { db } from '../services/storageService';

export const Suppliers: React.FC = () => {
    const [items, setItems] = useState<Supplier[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState<Partial<Supplier>>({});

    useEffect(() => setItems(db.getSuppliers()), []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        db.saveSupplier(formData as Supplier);
        setItems(db.getSuppliers());
        setIsModalOpen(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Proveedores</h1>
                <Button onClick={() => { setFormData({}); setIsModalOpen(true); }} icon="plus">Nuevo Proveedor</Button>
            </div>
            
            <Card noPadding>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 border-b font-semibold text-gray-600">
                            <tr>
                                <th className="p-4">Empresa</th>
                                <th className="p-4">Contacto</th>
                                <th className="p-4">RTN</th>
                                <th className="p-4">Teléfono</th>
                                <th className="p-4">Email</th>
                                <th className="p-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.map(s => (
                                <tr key={s.id} className="hover:bg-gray-50/50">
                                    <td className="p-4">
                                        <div className="font-bold text-gray-800">{s.companyName}</div>
                                        {s.address && <div className="text-xs text-gray-400 mt-1"><i className="fas fa-map-marker-alt mr-1"></i>{s.address}</div>}
                                    </td>
                                    <td className="p-4 font-medium text-gray-600">{s.contactName}</td>
                                    <td className="p-4 font-mono text-xs font-bold text-gray-700">{s.rtn || '-'}</td>
                                    <td className="p-4">{s.phone}</td>
                                    <td className="p-4 text-gray-500">{s.email}</td>
                                    <td className="p-4 text-right">
                                        <Button size="sm" variant="secondary" onClick={() => { setFormData(s); setIsModalOpen(true); }} icon="edit">Editar</Button>
                                    </td>
                                </tr>
                            ))}
                            {items.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center p-8 text-gray-400">No hay proveedores registrados.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Gestionar Proveedor">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input label="Nombre Empresa" value={formData.companyName || ''} onChange={e => setFormData({...formData, companyName: e.target.value})} required />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Responsable de Contacto" value={formData.contactName || ''} onChange={e => setFormData({...formData, contactName: e.target.value})} required />
                        <Input label="RTN" value={formData.rtn || ''} onChange={e => setFormData({...formData, rtn: e.target.value})} placeholder="Ej: 08011999123456" />
                    </div>

                    <Input label="Dirección Física" value={formData.address || ''} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="Colonia, Calle, Local..." />

                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Teléfono" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} required />
                        <Input label="Email" type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} required />
                    </div>
                    <Button type="submit" className="w-full">Guardar</Button>
                </form>
            </Modal>
        </div>
    );
};
