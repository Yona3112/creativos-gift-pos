
import React, { useState, useEffect } from 'react';
import { Consumable, UserRole } from '../types';
import { Card, Button, Input, Badge, Modal, PasswordConfirmDialog } from '../components/UIComponents';
import { db } from '../services/storageService';

interface ConsumablesProps {
    onUpdate?: () => void;
}

export const Consumables: React.FC<ConsumablesProps> = ({ onUpdate }) => {
    const [items, setItems] = useState<Consumable[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState<Partial<Consumable>>({});
    const [isAdmin, setIsAdmin] = useState(false);
    const [masterPassword, setMasterPassword] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' });

    useEffect(() => {
        const checkRole = async () => {
            const stored = localStorage.getItem('active_user') || localStorage.getItem('creativos_gift_currentUser');
            if (stored) {
                const u = JSON.parse(stored);
                if (u.role === 'admin' || u.role === 'ADMIN' || u.email === 'admin@creativosgift.com') {
                    setIsAdmin(true);
                }
            }
            // Load master password from settings
            const settings = await db.getSettings();
            setMasterPassword(settings?.masterPassword || '');
        };
        checkRole();
        loadData();
    }, []);

    const loadData = async () => {
        const data = await db.getConsumables();
        setItems(data || []);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await db.saveConsumable(formData as Consumable);
        await loadData();
        setIsModalOpen(false);
        if (onUpdate) onUpdate();
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <Button onClick={() => { setFormData({ category: 'Papel' }); setIsModalOpen(true); }} icon="plus">Nuevo Insumo</Button>
            </div>

            <Card>
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="p-3">Nombre</th>
                            <th className="p-3">Categoría</th>
                            <th className="p-3">Stock</th>
                            <th className="p-3">Unidad</th>
                            <th className="p-3">Costo</th>
                            <th className="p-3 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {Array.isArray(items) && items.map(i => (
                            <tr key={i.id}>
                                <td className="p-3 font-medium">{i.name}</td>
                                <td className="p-3"><Badge>{i.category}</Badge></td>
                                <td className={`p-3 font-bold ${i.stock <= i.minStock ? 'text-red-500' : 'text-gray-800'}`}>
                                    {i.stock}
                                </td>
                                <td className="p-3 text-gray-500">{i.unit}</td>
                                <td className="p-3">L {i.cost.toFixed(2)}</td>
                                <td className="p-3 text-right space-x-2">
                                    <Button size="sm" variant="ghost" onClick={() => { setFormData(i); setIsModalOpen(true); }} icon="edit"></Button>
                                    {isAdmin && (
                                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => {
                                            setDeleteConfirm({ open: true, id: i.id, name: i.name });
                                        }} icon="trash"></Button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {(!items || items.length === 0) && (
                            <tr><td colSpan={6} className="text-center p-4 text-gray-400">No hay insumos registrados.</td></tr>
                        )}
                    </tbody>
                </table>
            </Card>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Gestionar Insumo">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input label="Nombre" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                        <Input
                            label="Categoría"
                            value={formData.category || ''}
                            onChange={e => setFormData({ ...formData, category: e.target.value as any })}
                            list="categories-list"
                            placeholder="Escribe o selecciona..."
                        />
                        <datalist id="categories-list">
                            {['Papel', 'Cintas', 'Tintas', 'Adhesivos', 'Empaques', 'Etiquetas', 'Herramientas', 'Limpieza'].map(c => <option key={c} value={c} />)}
                        </datalist>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Stock Actual" type="number" value={formData.stock || 0} onChange={e => setFormData({ ...formData, stock: parseFloat(e.target.value) })} required />
                        <Input label="Stock Mínimo" type="number" value={formData.minStock || 0} onChange={e => setFormData({ ...formData, minStock: parseFloat(e.target.value) })} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Costo" type="number" value={formData.cost || 0} onChange={e => setFormData({ ...formData, cost: parseFloat(e.target.value) })} required />
                        <Input label="Unidad (ej: Rollo, Caja)" value={formData.unit || ''} onChange={e => setFormData({ ...formData, unit: e.target.value })} required />
                    </div>
                    <Button type="submit" className="w-full">Guardar</Button>
                </form>
            </Modal>

            <PasswordConfirmDialog
                isOpen={deleteConfirm.open}
                title="Eliminar Insumo"
                message={`¿Estás seguro de eliminar "${deleteConfirm.name}"? Esta acción no se puede deshacer.`}
                confirmText="Eliminar"
                cancelText="Cancelar"
                variant="danger"
                masterPassword={masterPassword}
                isAdmin={isAdmin}
                onConfirm={async () => {
                    await db.deleteConsumable(deleteConfirm.id);
                    setDeleteConfirm({ open: false, id: '', name: '' });
                    loadData();
                    if (onUpdate) onUpdate();
                }}
                onCancel={() => setDeleteConfirm({ open: false, id: '', name: '' })}
            />
        </div>
    );
};
