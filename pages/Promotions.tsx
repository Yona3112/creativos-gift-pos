
import React, { useState, useEffect } from 'react';
import { Promotion, Category, Product } from '../types';
import { Card, Button, Input, Badge, Modal } from '../components/UIComponents';
import { db } from '../services/storageService';

export const Promotions: React.FC = () => {
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState<Partial<Promotion>>({});
    
    const [scopeType, setScopeType] = useState<'all' | 'category' | 'product'>('all');
    const [selectedItems, setSelectedItems] = useState<string[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [promos, cats, prods] = await Promise.all([
            db.getPromotions(),
            db.getCategories(),
            db.getProducts()
        ]);
        setPromotions(promos || []);
        setCategories(cats || []);
        setProducts(prods || []);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const updatedPromo: Partial<Promotion> = {
            ...formData,
            active: formData.active !== undefined ? formData.active : true,
            productIds: scopeType === 'product' ? selectedItems : undefined,
            categoryIds: scopeType === 'category' ? selectedItems : undefined
        };

        await db.savePromotion(updatedPromo as Promotion);
        await loadData();
        setIsModalOpen(false);
    };

    const handleEdit = (promo: Promotion) => {
        setFormData(promo);
        if (promo.categoryIds && promo.categoryIds.length > 0) {
            setScopeType('category');
            setSelectedItems(promo.categoryIds);
        } else if (promo.productIds && promo.productIds.length > 0) {
            setScopeType('product');
            setSelectedItems(promo.productIds);
        } else {
            setScopeType('all');
            setSelectedItems([]);
        }
        setIsModalOpen(true);
    };

    const toggleActive = async (promo: Promotion) => {
        const updated = { ...promo, active: !promo.active };
        await db.savePromotion(updated);
        await loadData();
    };

    const handleItemSelection = (id: string) => {
        setSelectedItems(prev => {
            if (prev.includes(id)) return prev.filter(x => x !== id);
            return [...prev, id];
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Promociones</h1>
                <Button onClick={() => { 
                    setFormData({ type: 'percent', active: true }); 
                    setScopeType('all'); 
                    setSelectedItems([]); 
                    setIsModalOpen(true); 
                }} icon="plus">Nueva Promo</Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.isArray(promotions) && promotions.map(p => (
                    <Card key={p.id} className={`border-l-4 ${p.active ? 'border-accent' : 'border-gray-300 opacity-75'}`}>
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-lg">{p.name}</h3>
                            <div onClick={() => toggleActive(p)} className={`cursor-pointer px-2 py-1 rounded-full text-xs font-bold border ${p.active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                {p.active ? 'Activa' : 'Inactiva'}
                            </div>
                        </div>
                        <p className="text-sm text-gray-500 mb-2">
                            {p.type === 'percent' ? `${(p.value * 100).toFixed(0)}% Descuento` : 
                             p.type === 'amount' ? `L ${p.value} Descuento` : 
                             p.type === '2x1' ? '2x1' : p.type}
                        </p>
                        
                        <div className="mb-4">
                            {p.categoryIds && p.categoryIds.length > 0 ? (
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-bold">
                                    <i className="fas fa-tags mr-1"></i> Categorías Seleccionadas
                                </span>
                            ) : p.productIds && p.productIds.length > 0 ? (
                                <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded font-bold">
                                    <i className="fas fa-box mr-1"></i> Productos Seleccionados
                                </span>
                            ) : (
                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-bold">
                                    Todo el Inventario
                                </span>
                            )}
                        </div>

                        <div className="text-xs text-gray-400 flex justify-between border-t pt-2 mt-2">
                            <span>Inicio: {p.startDate}</span>
                            <span>Fin: {p.endDate}</span>
                        </div>
                        <div className="mt-3 flex justify-end">
                            <Button size="sm" variant="ghost" onClick={() => handleEdit(p)} icon="edit">Editar</Button>
                        </div>
                    </Card>
                ))}
                
                {(!promotions || promotions.length === 0) && (
                    <div className="col-span-3 text-center py-10 text-gray-400">
                        No hay promociones registradas.
                    </div>
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={formData.id ? "Editar Promoción" : "Crear Promoción"} size="lg">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input label="Nombre Promoción" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} required placeholder="Ej: Verano 2024" />
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Oferta</label>
                            <select className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as any})}>
                                <option value="percent">Porcentaje (%)</option>
                                <option value="amount">Monto Fijo (L)</option>
                                <option value="2x1">2x1</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {formData.type === 'percent' ? 'Porcentaje (Ej: 0.15 = 15%)' : 'Monto de Descuento'}
                            </label>
                            <Input type="number" step="0.01" value={formData.value || 0} onChange={e => setFormData({...formData, value: parseFloat(e.target.value)})} required />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Fecha Inicio" type="date" value={formData.startDate || ''} onChange={e => setFormData({...formData, startDate: e.target.value})} required />
                        <Input label="Fecha Fin" type="date" value={formData.endDate || ''} onChange={e => setFormData({...formData, endDate: e.target.value})} required />
                    </div>
                    
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mt-4">
                        <h4 className="font-bold text-gray-800 mb-2">Alcance de la Promoción</h4>
                        <div className="flex gap-2 mb-4">
                            <button type="button" onClick={() => { setScopeType('all'); setSelectedItems([]); }} className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${scopeType === 'all' ? 'bg-gray-800 text-white' : 'bg-white'}`}>Todo</button>
                            <button type="button" onClick={() => { setScopeType('category'); setSelectedItems([]); }} className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${scopeType === 'category' ? 'bg-gray-800 text-white' : 'bg-white'}`}>Por Categoría</button>
                            <button type="button" onClick={() => { setScopeType('product'); setSelectedItems([]); }} className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${scopeType === 'product' ? 'bg-gray-800 text-white' : 'bg-white'}`}>Por Producto</button>
                        </div>

                        {scopeType === 'category' && (
                            <div className="max-h-40 overflow-y-auto border rounded p-2 bg-white grid grid-cols-2 gap-2">
                                {categories.map(c => (
                                    <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedItems.includes(c.id)} 
                                            onChange={() => handleItemSelection(c.id)}
                                            className="w-4 h-4 accent-primary"
                                        />
                                        <span>{c.name}</span>
                                    </label>
                                ))}
                            </div>
                        )}

                        {scopeType === 'product' && (
                            <div>
                                <div className="max-h-48 overflow-y-auto border rounded p-2 bg-white space-y-1">
                                    {products.map(p => (
                                        <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded border-b border-gray-50 last:border-0">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedItems.includes(p.id)} 
                                                onChange={() => handleItemSelection(p.id)}
                                                className="w-4 h-4 accent-primary"
                                            />
                                            <div className="flex-1">
                                                <span className="font-bold">{p.name}</span>
                                                <span className="text-gray-400 text-xs ml-2">{p.code}</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                        <p className="text-xs text-gray-500 mt-2">
                            {selectedItems.length > 0 
                                ? `${selectedItems.length} items seleccionados.` 
                                : scopeType === 'all' ? 'Se aplicará a todos los productos.' : 'Seleccione al menos un item.'}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                        <input type="checkbox" checked={formData.active ?? true} onChange={e => setFormData({...formData, active: e.target.checked})} className="w-4 h-4 accent-primary" />
                        <span className="text-sm text-gray-700">Promoción Activa Inmediatamente</span>
                    </div>

                    <Button type="submit" className="w-full">Guardar Promoción</Button>
                </form>
            </Modal>
        </div>
    );
};
