
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Product, Category, User } from '../types';
import { Button, Input, Card, Modal, useDebounce, Pagination, ConfirmDialog } from '../components/UIComponents';
import { db } from '../services/storageService';
import { GoogleGenAI } from "@google/genai";

import { Categories } from './Categories';
import { Consumables } from './Consumables';
import { Suppliers } from './Suppliers';
import { InventoryHistory } from './InventoryHistory';
import { PriceHistory } from './PriceHistory';

interface ProductsProps {
    products: Product[];
    categories: Category[];
    users: User[];
    onUpdate: () => void;
    initialFilter?: string;
    initialTab?: string;
    settings?: { name?: string; branchName?: string };
}

const ITEMS_PER_PAGE = 8;

export const Products: React.FC<ProductsProps> = ({ products, categories, users, onUpdate, initialFilter, initialTab, settings }) => {
    const [activeTab, setActiveTab] = useState<'products' | 'categories' | 'consumables' | 'suppliers' | 'kardex' | 'prices'>('products');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState<Partial<Product>>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const debouncedSearch = useDebounce(searchTerm, 300);
    const [currentPage, setCurrentPage] = useState(1);
    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' });

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (initialFilter === 'lowStock') setFilterCategory('lowStock');
        if (initialTab === 'consumables') setActiveTab('consumables');
    }, [initialFilter, initialTab]);

    const openModal = (product?: Product) => {
        setEditingProduct(product || null);
        const defaultCat = categories[0];
        // Generar código automático para productos nuevos
        const autoCode = `PROD${Date.now().toString().slice(-5)}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
        setFormData(product ? { ...product } : {
            name: '', code: autoCode, price: 0, cost: 0, stock: 0,
            minStock: defaultCat?.defaultMinStock || 5,
            categoryId: defaultCat?.id || '',
            isTaxable: true,
            active: true
        });
        setIsModalOpen(true);
    };

    // NOTA: El precio siempre se guarda CON ISV incluido
    // Esto es consistente con la legislación hondureña donde el precio al público incluye el ISV
    const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setFormData(prev => ({ ...prev, price: val }));
    };

    const getDisplayPrice = () => {
        if (!formData.price && formData.price !== 0) return '';
        return formData.price;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const userStr = localStorage.getItem('creativos_gift_currentUser');
        const user = userStr ? JSON.parse(userStr) : { id: 'admin' };

        await db.saveProduct({ ...formData, id: editingProduct?.id || '' } as Product, user.id);
        setIsModalOpen(false);
        onUpdate();
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const compressed = await db.compressImage(file);
            setFormData(prev => ({ ...prev, image: compressed }));
        }
    };

    const filteredProducts = useMemo(() => {
        const lower = debouncedSearch.toLowerCase();
        return products.filter(p => {
            if (p.active === false) return false;
            const matchesSearch = p.name.toLowerCase().includes(lower) || p.code.toLowerCase().includes(lower);
            const matchesCategory = filterCategory === 'all' ? true : (filterCategory === 'lowStock' ? p.stock <= p.minStock : p.categoryId === filterCategory);
            return matchesSearch && matchesCategory;
        });
    }, [products, debouncedSearch, filterCategory]);

    const [isScanModalOpen, setIsScanModalOpen] = useState(false);
    const [scanCode, setScanCode] = useState('');
    const [scanProduct, setScanProduct] = useState<Product | null>(null);
    const [scanQty, setScanQty] = useState(1);
    const scanInputRef = useRef<HTMLInputElement>(null);
    const qtyInputRef = useRef<HTMLInputElement>(null);

    const handleScan = (e: React.FormEvent) => {
        e.preventDefault();
        const product = products.find(p => p.code.toLowerCase() === scanCode.toLowerCase());
        if (product) {
            setScanProduct(product);
            setScanQty(1);
            setTimeout(() => qtyInputRef.current?.focus(), 100);
        } else {
            alert('Producto no encontrado');
            setScanCode('');
            scanInputRef.current?.focus();
        }
    };

    const confirmQuickStock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!scanProduct) return;

        await db.saveProduct({ ...scanProduct, stock: scanProduct.stock + scanQty } as Product, users[0]?.id || 'admin');

        setScanProduct(null);
        setScanCode('');
        setScanQty(1);
        onUpdate();
        setTimeout(() => scanInputRef.current?.focus(), 100);
    };

    const printBarcode = (product: Product) => {
        const storeName = settings?.name || 'Mi Tienda';
        const win = window.open('', '', 'width=300,height=200');
        if (win) {
            win.document.write(`
                <html>
                <head>
                    <title>Print</title>
                    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
                    <style>
                        @page { size: 50mm 25mm; margin: 0; }
                        body { 
                            width: 50mm; 
                            height: 25mm; 
                            margin: 0; 
                            padding: 2px;
                            display: flex; 
                            flex-direction: column; 
                            align-items: center; 
                            justify-content: center; 
                            font-family: sans-serif;
                            overflow: hidden;
                        }
                        .ticket { width: 100%; text-align: center; }
                        .store-name { font-size: 7px; font-weight: bold; margin: 0; text-transform: uppercase; letter-spacing: 1px; color: #333; }
                        h2 { font-size: 9px; margin: 1px 0; text-overflow: ellipsis; white-space: nowrap; overflow: hidden; width: 100%; }
                        #barcode { width: 90% !important; height: 10mm !important; }
                        .price { font-size: 10px; font-weight: bold; margin-top: 1px; }
                        
                        /* Screen Preview Style */
                        @media screen {
                            body { background: #f0f0f0; padding: 20px; width: auto; height: auto; }
                            .ticket { background: white; width: 50mm; height: 25mm; padding: 2px; margin: 0 auto; display: flex; flex-direction: column; justify-content: center; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
                        }
                    </style>
                </head>
                <body>
                    <div class="ticket">
                        <p class="store-name">${storeName}</p>
                        <h2>${product.name}</h2>
                        <svg id="barcode"></svg>
                        <div class="price">L ${product.price.toFixed(2)}</div>
                    </div>
                    <script>
                        try {
                            JsBarcode("#barcode", "${product.code}", {
                                format: "CODE128",
                                width: 1.5,
                                height: 25,
                                displayValue: true,
                                fontSize: 8,
                                margin: 0
                            });
                            window.print();
                        } catch(e) {
                            document.body.innerHTML = "Error generating barcode: " + e.message;
                        }
                    </script>
                </body>
                </html>
            `);
            win.document.close();
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-black text-gray-800 tracking-tight">Inventario Maestro</h1>
                <div className="flex bg-white p-1 rounded-xl border shadow-sm overflow-x-auto max-w-full">
                    {[
                        { id: 'products', label: 'Productos', icon: 'box' },
                        { id: 'kardex', label: 'Kardex', icon: 'history' },
                        { id: 'prices', label: 'Precios', icon: 'dollar-sign' },
                        { id: 'categories', label: 'Categorías', icon: 'tags' },
                        { id: 'consumables', label: 'Insumos', icon: 'tools' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === tab.id ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                            <i className={`fas fa-${tab.icon}`}></i> {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {activeTab === 'products' && (
                <div className="space-y-4 animate-fade-in">
                    <div className="flex flex-wrap justify-between gap-4">
                        <div className="flex flex-1 gap-2 min-w-[300px]">
                            <Input placeholder="Escanear o buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} icon="search" className="flex-1 bg-white" />
                            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-4 py-3 rounded-xl border bg-white font-bold text-gray-600 outline-none">
                                <option value="all">Todo</option>
                                <option value="lowStock" className="text-red-500">Stock Bajo</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={() => setIsScanModalOpen(true)} variant="secondary" icon="barcode">Stock Rápido</Button>
                            <Button onClick={() => openModal()} icon="plus">Nuevo Producto</Button>
                        </div>
                    </div>

                    <Card noPadding>
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-400 font-bold uppercase text-[10px] tracking-widest border-b">
                                <tr>
                                    <th className="px-6 py-4">Producto</th>
                                    <th className="px-6 py-4">Precio</th>
                                    <th className="px-6 py-4 text-center">Stock</th>
                                    <th className="px-6 py-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredProducts.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map(p => (
                                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden border">
                                                {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><i className="fas fa-image"></i></div>}
                                            </div>
                                            <div><p className="font-bold text-gray-800">{p.name}</p><p className="text-xs text-gray-400 font-mono">{p.code}</p></div>
                                        </td>
                                        <td className="px-6 py-4 font-black">L {p.price.toFixed(2)}</td>
                                        <td className={`px-6 py-4 text-center font-black ${p.stock <= p.minStock ? 'text-red-600' : 'text-green-600'}`}>{p.stock}</td>
                                        <td className="px-6 py-4 text-right">
                                            <Button size="sm" variant="ghost" onClick={() => printBarcode(p)} icon="print" className="mr-2" title="Imprimir Código"></Button>
                                            <Button size="sm" variant="ghost" onClick={() => openModal(p)} icon="edit"></Button>
                                            <Button size="sm" variant="ghost" onClick={() => {
                                                setDeleteConfirm({ open: true, id: p.id, name: p.name });
                                            }} icon="trash" className="text-red-400 hover:text-red-600"></Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="p-4 border-t"><Pagination currentPage={currentPage} totalPages={Math.ceil(filteredProducts.length / ITEMS_PER_PAGE)} onPageChange={setCurrentPage} /></div>
                    </Card>
                </div>
            )}

            {activeTab === 'kardex' && <InventoryHistory products={products} users={users} />}
            {activeTab === 'prices' && <PriceHistory products={products} users={users} />}
            {activeTab === 'categories' && <Categories categories={categories} onUpdate={onUpdate} settings={{} as any} />}
            {activeTab === 'consumables' && <Consumables onUpdate={onUpdate} />}
            {activeTab === 'suppliers' && <Suppliers />}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={formData.id ? "Editar Producto" : "Nuevo Producto"} size="lg">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex gap-4 items-start">
                        <div className="relative w-32 h-32 bg-gray-50 rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                            {formData.image ? <img src={formData.image} className="w-full h-full object-cover" /> : <i className="fas fa-camera text-2xl text-gray-300"></i>}
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                        </div>
                        <div className="flex-1 space-y-4">
                            <Input label="Nombre" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                            <div className="flex gap-2">
                                <Input label="Código" value={formData.code || ''} onChange={e => setFormData({ ...formData, code: e.target.value })} required className="flex-1" />
                                <div className="w-48">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Categoría</label>
                                    <select className="w-full p-3 border rounded-xl bg-white" value={formData.categoryId} onChange={e => setFormData({ ...formData, categoryId: e.target.value })}>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Precio Venta (con ISV incluido)</label>
                            <input type="number" step="0.01" value={getDisplayPrice()} onChange={handlePriceChange} className="w-full p-3 rounded-xl border font-black text-xl" required />
                            <p className="text-[10px] text-gray-500 mt-1">El precio al público siempre incluye ISV del 15%</p>
                        </div>
                        <Input label="Costo" type="number" step="0.01" value={formData.cost || 0} onChange={e => setFormData({ ...formData, cost: parseFloat(e.target.value) })} required />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Stock" type="number" value={formData.stock || 0} onChange={e => setFormData({ ...formData, stock: parseFloat(e.target.value) })} required />
                        <Input label="Mínimo" type="number" value={formData.minStock || 0} onChange={e => setFormData({ ...formData, minStock: parseFloat(e.target.value) })} required />
                    </div>

                    <div className="flex justify-between gap-2 pt-4 border-t">
                        {formData.id && (
                            <Button type="button" variant="danger" onClick={() => {
                                setDeleteConfirm({ open: true, id: formData.id!, name: formData.name || '' });
                                setIsModalOpen(false);
                            }} icon="trash">Eliminar</Button>
                        )}
                        <div className="flex gap-2 ml-auto">
                            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                            <Button type="submit">Guardar Producto</Button>
                        </div>
                    </div>
                </form>
            </Modal>

            {/* SCAN MODAL */}
            <Modal isOpen={isScanModalOpen} onClose={() => { setIsScanModalOpen(false); setScanProduct(null); setScanCode(''); }} title="Entrada Rápida por Escáner">
                <div className="space-y-6">
                    {!scanProduct ? (
                        <form onSubmit={handleScan} className="space-y-4">
                            <div className="text-center py-8">
                                <i className="fas fa-barcode text-6xl text-gray-200 mb-4"></i>
                                <p className="text-gray-500">Escanee el código de barras del producto</p>
                            </div>
                            <Input
                                label="Código Escaneado"
                                ref={scanInputRef}
                                value={scanCode}
                                onChange={e => setScanCode(e.target.value)}
                                autoFocus
                                placeholder="Esperando escáner..."
                                className="text-center font-mono text-lg font-bold"
                            />
                            <Button type="submit" className="w-full">Buscar Producto</Button>
                        </form>
                    ) : (
                        <form onSubmit={confirmQuickStock} className="space-y-4">
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-4 items-center">
                                <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center">
                                    {scanProduct.image ? <img src={scanProduct.image} className="w-full h-full object-cover rounded-lg" /> : <i className="fas fa-box text-blue-300 text-2xl"></i>}
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-800">{scanProduct.name}</h3>
                                    <p className="text-sm text-gray-500">Stock Actual: <span className="font-bold text-gray-800">{scanProduct.stock}</span></p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Input label="Cantidad a Agregar" type="number" value={scanQty} onChange={e => setScanQty(parseFloat(e.target.value))} ref={qtyInputRef} autoFocus className="font-bold text-xl text-center" />
                                <div className="flex items-end">
                                    <div className="w-full p-3 bg-gray-100 rounded-xl text-center">
                                        <p className="text-xs text-gray-500 uppercase font-bold">Nuevo Stock</p>
                                        <p className="text-xl font-black text-primary">{scanProduct.stock + scanQty}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button type="button" variant="secondary" onClick={() => { setScanProduct(null); setScanCode(''); setTimeout(() => scanInputRef.current?.focus(), 100); }} className="flex-1">Cancelar / Escanear Otro</Button>
                                <Button type="submit" className="flex-1" icon="save">Confirmar Entrada</Button>
                            </div>
                        </form>
                    )}
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={deleteConfirm.open}
                title="Eliminar Producto"
                message={`¿Estás seguro de eliminar "${deleteConfirm.name}"? Esta acción no se puede deshacer.`}
                confirmText="Eliminar"
                cancelText="Cancelar"
                variant="danger"
                onConfirm={async () => {
                    await db.deleteProduct(deleteConfirm.id);
                    setDeleteConfirm({ open: false, id: '', name: '' });
                    onUpdate();
                }}
                onCancel={() => setDeleteConfirm({ open: false, id: '', name: '' })}
            />
        </div>
    );
};
