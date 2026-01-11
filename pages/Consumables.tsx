
import React, { useState, useEffect } from 'react';
import { Consumable } from '../types';
import { Card, Button, Input, Badge, Modal } from '../components/UIComponents';
import { db } from '../services/storageService';

interface ConsumablesProps {
    onUpdate?: () => void;
}

export const Consumables: React.FC<ConsumablesProps> = ({ onUpdate }) => {
    const [items, setItems] = useState<Consumable[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState<Partial<Consumable>>({});

    useEffect(() => {
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
                                <td className="p-3 text-right"><Button size="sm" variant="ghost" onClick={() => { setFormData(i); setIsModalOpen(true); }} icon="edit"></Button></td>
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
                    <Input label="Nombre" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} required />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                        <select className="w-full px-3 py-2 border rounded-lg" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as any})}>
                            {['Papel', 'Cintas', 'Tintas', 'Adhesivos', 'Empaques', 'Etiquetas', 'Herramientas', 'Limpieza'].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Stock Actual" type="number" value={formData.stock || 0} onChange={e => setFormData({...formData, stock: parseFloat(e.target.value)})} required />
                        <Input label="Stock Mínimo" type="number" value={formData.minStock || 0} onChange={e => setFormData({...formData, minStock: parseFloat(e.target.value)})} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Costo" type="number" value={formData.cost || 0} onChange={e => setFormData({...formData, cost: parseFloat(e.target.value)})} required />
                        <Input label="Unidad (ej: Rollo, Caja)" value={formData.unit || ''} onChange={e => setFormData({...formData, unit: e.target.value})} required />
                    </div>
                    <Button type="submit" className="w-full">Guardar</Button>
                </form>
            </Modal>
        </div>
    );
};
