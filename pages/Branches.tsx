
import React, { useState, useEffect } from 'react';
import { Branch, UserRole } from '../types';
import { Card, Button, Input, Modal, Badge, PasswordConfirmDialog } from '../components/UIComponents';
import { db } from '../services/storageService';

export const Branches: React.FC = () => {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState<Partial<Branch>>({});
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [masterPassword, setMasterPassword] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            setBranches(await db.getBranches());
            // Load master password and check admin
            const settings = await db.getSettings();
            setMasterPassword(settings?.masterPassword || '');
            const stored = localStorage.getItem('active_user');
            if (stored) {
                const u = JSON.parse(stored);
                setIsAdmin(u.role === 'admin' || u.role === 'ADMIN' || u.role === UserRole.ADMIN);
            }
        };
        loadData();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving) return;
        setIsSaving(true);
        try {
            await db.saveBranch({ ...formData, active: formData.active ?? true } as Branch);
            setBranches(await db.getBranches());
            setIsModalOpen(false);
        } catch (error: any) {
            console.error('Error al guardar sucursal:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (formData.id) {
            setDeleteConfirm(true);
        }
    };

    const openNewModal = () => {
        setFormData({ active: true, name: '', address: '', phone: '', manager: '' });
        setIsModalOpen(true);
    };

    const openEditModal = (branch: Branch) => {
        setFormData({ ...branch });
        setIsModalOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Sucursales</h1>
                <Button onClick={openNewModal} icon="plus">Nueva Sucursal</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {branches.map(b => (
                    <Card key={b.id} className="hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-lg text-gray-800">{b.name}</h3>
                            <Badge variant={b.active ? 'success' : 'default'}>{b.active ? 'Activa' : 'Inactiva'}</Badge>
                        </div>
                        <div className="space-y-2 text-sm text-gray-600 mb-4">
                            <p className="flex items-center gap-2"><i className="fas fa-map-marker-alt w-5 text-gray-400"></i> {b.address}</p>
                            <p className="flex items-center gap-2"><i className="fas fa-phone w-5 text-gray-400"></i> {b.phone || 'N/A'}</p>
                            <p className="flex items-center gap-2"><i className="fas fa-user-tie w-5 text-gray-400"></i> {b.manager || 'Sin Gerente'}</p>
                        </div>
                        <div className="mt-auto pt-4 border-t border-gray-100">
                            <Button size="sm" variant="secondary" className="w-full" onClick={() => openEditModal(b)}>
                                <i className="fas fa-edit mr-2"></i> Editar Información
                            </Button>
                        </div>
                    </Card>
                ))}
                {branches.length === 0 && (
                    <div className="col-span-full text-center py-10 text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
                        <i className="fas fa-store-slash text-4xl mb-3 opacity-50"></i>
                        <p>No hay sucursales registradas.</p>
                    </div>
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={formData.id ? "Editar Sucursal" : "Nueva Sucursal"}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input label="Nombre Sucursal" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required placeholder="Ej: Tienda Principal" />
                    <Input label="Dirección" value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} required placeholder="Ubicación física" />
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Teléfono" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="Teléfono de contacto" />
                        <Input label="Gerente / Encargado" value={formData.manager || ''} onChange={e => setFormData({ ...formData, manager: e.target.value })} placeholder="Nombre del encargado" />
                    </div>
                    <div className="flex items-center gap-2 py-2">
                        <input type="checkbox" id="active" checked={formData.active ?? true} onChange={e => setFormData({ ...formData, active: e.target.checked })} className="w-4 h-4 text-purple-600 rounded" />
                        <label htmlFor="active" className="text-sm text-gray-700">Sucursal Activa</label>
                    </div>
                    <div className="flex gap-3 pt-4 border-t">
                        {formData.id && <Button type="button" variant="danger" onClick={handleDelete}><i className="fas fa-trash mr-2"></i>Eliminar</Button>}
                        <Button type="submit" className="flex-1" disabled={isSaving}><i className="fas fa-save mr-2"></i>{isSaving ? 'Guardando...' : formData.id ? 'Guardar Cambios' : 'Crear Sucursal'}</Button>
                    </div>
                </form>
            </Modal>

            <PasswordConfirmDialog
                isOpen={deleteConfirm}
                title="Eliminar Sucursal"
                message={`¿Estás seguro de eliminar la sucursal "${formData.name}"? Esta acción no se puede deshacer.`}
                confirmText="Eliminar"
                cancelText="Cancelar"
                variant="danger"
                masterPassword={masterPassword}
                isAdmin={isAdmin}
                onConfirm={async () => {
                    if (formData.id) {
                        await db.deleteBranch(formData.id);
                        setBranches(await db.getBranches());
                    }
                    setDeleteConfirm(false);
                    setIsModalOpen(false);
                }}
                onCancel={() => setDeleteConfirm(false)}
            />
        </div>
    );
};

export default Branches;