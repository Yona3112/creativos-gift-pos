
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Product, Category, User, UserRole, CompanySettings } from '../types';
import { Button, Input, Card, Modal, useDebounce, Pagination, PasswordConfirmDialog, showToast } from '../components/UIComponents';
import { db } from '../services/storageService';
import { GoogleGenAI } from "@google/genai";

import { Categories } from './Categories';
import { Consumables } from './Consumables';
import { Suppliers } from './Suppliers';
import { InventoryHistory } from './InventoryHistory';
import { PriceHistory } from './PriceHistory';
import { InventoryAudit } from './InventoryAudit';

interface ProductsProps {
    products: Product[];
    categories: Category[];
    users: User[];
    onUpdate: () => void;
    initialFilter?: string;
    initialTab?: string;
    settings?: CompanySettings;
    user?: User;
}

const ITEMS_PER_PAGE = 8;

export const Products: React.FC<ProductsProps> = ({ products, categories, users, onUpdate, initialFilter, initialTab, settings, user }) => {
    const isAdmin = user?.role === UserRole.ADMIN;
    const [activeTab, setActiveTab] = useState<'products' | 'categories' | 'consumables' | 'suppliers' | 'kardex' | 'prices' | 'audit'>('products');
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

    const openModal = async (product?: Product) => {
        setEditingProduct(product || null);
        const defaultCat = categories[0];

        if (product) {
            // Editing existing product
            setFormData({ ...product });
        } else {
            // Creating new product - Start with empty code to allow scanning
            setFormData({
                name: '', code: '', price: 0, cost: 0, stock: 0,
                minStock: defaultCat?.defaultMinStock || 5,
                categoryId: defaultCat?.id || '',
                isTaxable: true,
                active: true
            });
        }
        setIsModalOpen(true);
        // Focus code field after a short delay to allow scanner to input directly
        setTimeout(() => {
            const codeInput = document.getElementById('product-code-input');
            if (codeInput) codeInput.focus();
        }, 300);
    };

    const generateSequentialCode = async () => {
        const autoCode = await db.getNextProductCodeSequential();
        setFormData(prev => ({ ...prev, code: autoCode }));
        showToast("Código secuencial generado", "info");
    };

    // NOTA: El precio siempre se guarda CON ISV incluido
    // Esto es consistente con la legislación hondureña donde el precio al público incluye el ISV
    const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === '') {
            setFormData(prev => ({ ...prev, price: 0 }));
            return;
        }
        const num = parseFloat(val);
        if (!isNaN(num)) {
            setFormData(prev => ({ ...prev, price: num }));
        }
    };

    const getDisplayPrice = () => {
        if (!formData.price && formData.price !== 0) return '';
        return formData.price;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const userStr = localStorage.getItem('creativos_gift_currentUser');
        const user = userStr ? JSON.parse(userStr) : { id: 'admin' };

        try {
            await db.saveProduct({ ...formData, id: editingProduct?.id || '' } as Product, user.id);
            setIsModalOpen(false);
            onUpdate();
            showToast("Producto guardado exitosamente.", "success");
        } catch (error: any) {
            if (error.message.startsWith('DuplicateCode:')) {
                const productName = error.message.split(':')[1];
                alert(`Error: El código "${formData.code}" ya está asignado al producto "${productName}". Por favor use un código único.`);
            } else {
                console.error('Error saving product:', error);
                alert('Ocurrió un error al guardar el producto.');
            }
        }
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
            const matchesSearch = (p.name || '').toLowerCase().includes(lower) || (p.code || '').toLowerCase().includes(lower);
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
        const product = products.find(p => (p.code || '').toLowerCase() === scanCode.toLowerCase());
        if (product) {
            setScanProduct(product);
            setScanQty(1);
            setTimeout(() => qtyInputRef.current?.focus(), 100);
        } else {
            showToast('Producto no encontrado', 'warning');
            setScanCode('');
            scanInputRef.current?.focus();
        }
    };

    const confirmQuickStock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!scanProduct) return;

        // Save updated product (including name changes if any)
        await db.saveProduct({ ...scanProduct, stock: scanProduct.stock + scanQty } as Product, user?.id || 'admin');

        setScanProduct(null);
        setScanCode('');
        setScanQty(1);
        onUpdate();
        setTimeout(() => scanInputRef.current?.focus(), 100);
    };

    // Catalog Share Feature
    const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

    const generateCatalogHTML = () => {
        const selectedProducts = products.filter(p =>
            p.active !== false &&
            selectedCategories.includes(p.categoryId) &&
            p.stock > 0
        );

        const groupedProducts: Record<string, Product[]> = {};
        selectedProducts.forEach(p => {
            const cat = categories.find(c => c.id === p.categoryId);
            const catName = cat?.name || 'Otros';
            if (!groupedProducts[catName]) groupedProducts[catName] = [];
            groupedProducts[catName].push(p);
        });

        const storeName = settings?.name || 'Mi Tienda';
        const phone = settings?.whatsappNumber || '';
        const themeColor = settings?.themeColor || '#4F46E5';

        const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Catálogo - ${storeName}</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Plus Jakarta Sans', sans-serif; background: linear-gradient(135deg, ${themeColor}20, white); min-height: 100vh; padding: 20px; }
        .header { text-align: center; padding: 30px 20px; background: ${themeColor}; color: white; border-radius: 20px; margin-bottom: 30px; box-shadow: 0 10px 40px ${themeColor}40; }
        .header h1 { font-size: 2em; font-weight: 800; margin-bottom: 5px; }
        .header p { opacity: 0.9; font-size: 0.9em; }
        .category { margin-bottom: 30px; }
        .category-title { font-size: 1.3em; font-weight: 800; color: ${themeColor}; padding: 10px 15px; background: white; border-radius: 12px; margin-bottom: 15px; display: inline-block; box-shadow: 0 4px 15px rgba(0,0,0,0.08); }
        .products { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 15px; }
        .product { background: white; border-radius: 16px; padding: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); transition: transform 0.3s; }
        .product:hover { transform: translateY(-5px); }
        .product-img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 12px; background: #f3f4f6; margin-bottom: 10px; }
        .product-name { font-weight: 600; font-size: 0.9em; color: #1f2937; margin-bottom: 5px; line-height: 1.3; }
        .product-price { font-weight: 800; font-size: 1.2em; color: ${themeColor}; }
        .whatsapp-btn { display: block; text-align: center; background: #25D366; color: white; padding: 15px 30px; border-radius: 50px; text-decoration: none; font-weight: 700; font-size: 1.1em; margin: 30px auto; max-width: 300px; box-shadow: 0 8px 30px rgba(37,211,102,0.4); }
        .whatsapp-btn:hover { transform: scale(1.05); }
        .footer { text-align: center; color: #6b7280; font-size: 0.85em; padding: 20px; }
        .no-img { display: flex; align-items: center; justify-content: center; color: #d1d5db; font-size: 2em; }
    </style>
</head>
<body>
    <div class="header">
        ${settings?.logo ? `<img src="${settings.logo}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;margin-bottom:10px;border:3px solid white;">` : ''}
        <h1>📦 ${storeName}</h1>
        <p>Catálogo de Productos</p>
    </div>
    
    ${Object.entries(groupedProducts).map(([catName, prods]) => `
        <div class="category">
            <div class="category-title">🏷️ ${catName}</div>
            <div class="products">
                ${prods.map(p => `
                    <div class="product">
                        ${p.image
                ? `<img src="${p.image}" class="product-img" alt="${p.name}">`
                : `<div class="product-img no-img">📦</div>`
            }
                        <div class="product-name">${p.name}</div>
                        <div class="product-price">L ${p.price.toFixed(2)}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('')}
    
    ${phone ? `<a href="https://api.whatsapp.com/send?phone=${phone.replace(/\D/g, '')}" target="_blank" class="whatsapp-btn">💬 Pedir por WhatsApp</a>` : ''}
    
    <div class="footer">
        <p>Generado desde ${storeName} • ${new Date().toLocaleDateString()}</p>
    </div>
</body>
</html>`;

        // Open catalog in new window
        const win = window.open('', '_blank');
        if (win) {
            win.document.write(html);
            win.document.close();
        }

        // Also offer to share via WhatsApp with a text summary
        const productList = Object.entries(groupedProducts).map(([cat, prods]) =>
            `*${cat}*\n${prods.map(p => `• ${p.name}: L${p.price.toFixed(2)}`).join('\n')}`
        ).join('\n\n');

        let message = `🛍️ *Catálogo ${storeName}*\n\n${productList}\n\n📞 Contáctanos para hacer tu pedido!`;

        // Truncate message if it's too long for a URL (safe limit around 1500 chars for wa.me)
        if (message.length > 1500) {
            message = message.substring(0, 1497) + '...';
            console.warn("⚠️ Mensaje de WhatsApp truncado para evitar errores de URL.");
        }

        const encodedMessage = encodeURIComponent(message);

        if (confirm('¿Deseas compartir también un resumen del catálogo por WhatsApp?')) {
            window.open(`https://api.whatsapp.com/send?text=${encodedMessage}`, '_blank');
        }

        setIsCatalogModalOpen(false);
    };

    const printBarcode = (product: Product) => {
        const storeName = settings?.name || 'Mi Tienda';
        const w = settings?.barcodeWidth || 50;
        const h = settings?.barcodeHeight || 25;
        const showLogo = settings?.showLogoOnBarcode || false;
        const logoSize = settings?.barcodeLogoSize || 10;

        const win = window.open('', '', 'width=400,height=300');
        if (win) {
            win.document.write(`
                <html>
                <head>
                    <title>Imprimir Código - ${product.code}</title>
                    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
                    <style>
                        @page { size: ${w}mm ${h}mm; margin: 0; }
                        body { 
                            width: ${w}mm; 
                            height: ${h}mm; 
                            margin: 0; 
                            padding: 2mm;
                            display: flex; 
                            flex-direction: column; 
                            align-items: center; 
                            justify-content: center; 
                            font-family: sans-serif;
                            overflow: hidden;
                            box-sizing: border-box;
                        }
                        .ticket { 
                            width: 100%; 
                            height: 100%;
                            display: flex;
                            flex-direction: column;
                            justify-content: space-between;
                            align-items: center;
                            text-align: center; 
                        }
                        .header-row {
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 2mm;
                            width: 100%;
                        }
                        .store-logo {
                            width: ${logoSize}mm;
                            height: ${logoSize}mm;
                            object-fit: contain;
                        }
                        .store-info {
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                        }
                        .store-name { font-size: 6px; font-weight: bold; margin: 0; text-transform: uppercase; color: #000; }
                        h2 { font-size: 8px; margin: 1px 0; text-overflow: ellipsis; white-space: nowrap; overflow: hidden; width: 100%; font-weight: bold; color: #000; }
                        #barcode { width: 100% !important; height: ${h * 0.4}mm !important; }
                        .price { font-size: 9px; font-weight: bold; margin-top: 1px; color: #000; }
                        
                        @media screen {
                            body { background: #f0f0f0; padding: 20px; width: auto; height: auto; }
                            .ticket { background: white; width: ${w}mm; height: ${h}mm; padding: 2mm; margin: 0 auto; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
                        }
                    </style>
                </head>
                <body>
                    <div class="ticket">
                        <div class="header-row">
                            ${(showLogo && settings?.logo) ? `<img src="${settings.logo}" class="store-logo" />` : ''}
                            <div class="store-info">
                                <p class="store-name">${storeName}</p>
                                <h2>${product.name}</h2>
                            </div>
                        </div>
                        <svg id="barcode"></svg>
                        <div class="price">L ${product.price.toFixed(2)}</div>
                    </div>
                    <script>
                        try {
                            JsBarcode("#barcode", "${product.code}", {
                                format: "CODE128",
                                width: 2,
                                height: 40,
                                displayValue: true,
                                fontSize: 10,
                                margin: 0
                            });
                            setTimeout(() => {
                                window.print();
                                window.close();
                            }, 500);
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

    // Multi-label printing
    const [labelModalOpen, setLabelModalOpen] = useState(false);
    const [labelProduct, setLabelProduct] = useState<Product | null>(null);
    const [labelCount, setLabelCount] = useState(1);

    const openLabelModal = (product: Product) => {
        setLabelProduct(product);
        setLabelCount(1);
        setLabelModalOpen(true);
    };

    const printMultipleLabels = () => {
        if (!labelProduct) return;

        const storeName = settings?.name || 'Mi Tienda';
        const w = settings?.barcodeWidth || 50;
        const h = settings?.barcodeHeight || 25;
        const showLogo = settings?.showLogoOnBarcode || false;
        const logoSize = settings?.barcodeLogoSize || 10;
        const cols = 3; // Labels per row
        const rows = Math.ceil(labelCount / cols);

        const win = window.open('', '', 'width=800,height=600');
        if (win) {
            win.document.write(`
                <html>
                <head>
                    <title>Imprimir ${labelCount} Etiquetas - ${labelProduct.code}</title>
                    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
                    <style>
                        @page { margin: 5mm; }
                        body { font-family: sans-serif; margin: 0; padding: 5mm; }
                        .labels-grid { display: grid; grid-template-columns: repeat(${cols}, ${w}mm); gap: 2mm; }
                        .label { 
                            width: ${w}mm; height: ${h}mm; 
                            border: 1px dashed #ccc;
                            display: flex; flex-direction: column;
                            align-items: center; justify-content: center;
                            text-align: center; padding: 1mm;
                            box-sizing: border-box; page-break-inside: avoid;
                        }
                        .store-name { font-size: 6px; font-weight: bold; margin: 0; text-transform: uppercase; }
                        .product-name { font-size: 8px; font-weight: bold; margin: 1px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
                        svg { max-width: 100% !important; height: ${h * 0.4}mm !important; }
                        .price { font-size: 9px; font-weight: bold; }
                        .store-logo { width: ${logoSize}mm; height: ${logoSize}mm; object-fit: contain; }
                        @media print { .label { border: none; } }
                    </style>
                </head>
                <body>
                    <div class="labels-grid">
                        ${Array(labelCount).fill(0).map((_, i) => `
                            <div class="label">
                                ${(showLogo && settings?.logo) ? `<img src="${settings.logo}" class="store-logo" />` : ''}
                                <p class="store-name">${storeName}</p>
                                <p class="product-name">${labelProduct.name}</p>
                                <svg id="barcode-${i}"></svg>
                                <div class="price">L ${labelProduct.price.toFixed(2)}</div>
                            </div>
                        `).join('')}
                    </div>
                    <script>
                        try {
                            for (let i = 0; i < ${labelCount}; i++) {
                                JsBarcode("#barcode-" + i, "${labelProduct.code}", {
                                    format: "CODE128", width: 1.5, height: 30,
                                    displayValue: true, fontSize: 8, margin: 0
                                });
                            }
                            setTimeout(() => { window.print(); window.close(); }, 500);
                        } catch(e) { document.body.innerHTML = "Error: " + e.message; }
                    </script>
                </body>
                </html>
            `);
            win.document.close();
        }
        setLabelModalOpen(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-black text-gray-800 tracking-tight">Mis Productos</h1>
                <div className="flex bg-white p-1 rounded-xl border shadow-sm overflow-x-auto max-w-full">
                    {[
                        { id: 'products', label: 'Productos', icon: 'box' },
                        { id: 'kardex', label: 'Movimientos', icon: 'history' },
                        { id: 'audit', label: 'Conteo Físico', icon: 'clipboard-check' },
                        { id: 'prices', label: 'Historial Precios', icon: 'dollar-sign' },
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
                            <Button onClick={() => { if (selectedCategories.length === 0) setSelectedCategories(categories.map(c => c.id)); setIsCatalogModalOpen(true); }} variant="ghost" className="text-green-600 hover:bg-green-50">
                                <i className="fab fa-whatsapp mr-1"></i> Compartir Catálogo
                            </Button>
                            {isAdmin && <Button onClick={() => setIsScanModalOpen(true)} variant="secondary" icon="barcode">Stock Rápido</Button>}
                            {isAdmin && <Button onClick={() => openModal()} icon="plus">Nuevo Producto</Button>}
                        </div>
                    </div>

                    <Card noPadding>
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-400 font-bold uppercase text-[10px] tracking-widest border-b">
                                <tr>
                                    <th className="px-3 py-1 text-left">Producto</th>
                                    <th className="px-3 py-1 text-center">Precio</th>
                                    <th className="px-3 py-1 text-center">Stock</th>
                                    <th className="px-3 py-1 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredProducts.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map(p => (
                                    <tr key={p.id} className="hover:bg-gray-50 transition-colors border-b">
                                        <td className="px-2 py-0.5 flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg bg-gray-100 overflow-hidden border flex-shrink-0">
                                                {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><i className="fas fa-image text-[10px]"></i></div>}
                                            </div>
                                            <div className="min-w-0 leading-tight">
                                                <p className="font-bold text-gray-800 truncate text-[13px]">{p.name}</p>
                                                <p className="text-[9px] text-gray-400 font-mono">{p.code}</p>
                                            </div>
                                        </td>
                                        <td className="px-2 py-0.5 text-center font-black text-xs">L {p.price.toFixed(2)}</td>
                                        <td className={`px-2 py-0.5 text-center font-black text-xs ${p.stock <= p.minStock ? 'text-red-600' : 'text-green-600'}`}>{p.stock}</td>
                                        <td className="px-2 py-0.5 text-right flex justify-end gap-0.5">
                                            <Button size="sm" variant="ghost" onClick={() => printBarcode(p)} icon="print" className="h-7 w-7 p-0" title="Imprimir una etiqueta"></Button>
                                            <Button size="sm" variant="ghost" onClick={() => openLabelModal(p)} icon="copy" className="h-7 w-7 p-0 text-blue-500 hover:text-blue-600" title="Imprimir múltiples etiquetas"></Button>
                                            {isAdmin && <Button size="sm" variant="ghost" onClick={() => openModal(p)} icon="edit" className="h-7 w-7 p-0"></Button>}
                                            {isAdmin && <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm({ open: true, id: p.id, name: p.name })} icon="trash" className="h-7 w-7 p-0 text-red-400 hover:text-red-500"></Button>}
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
            {activeTab === 'audit' && <InventoryAudit products={products} categories={categories} users={users} onUpdate={onUpdate} settings={settings} user={user} />}
            {activeTab === 'prices' && <PriceHistory products={products} users={users} />}
            {activeTab === 'categories' && <Categories categories={categories} onUpdate={onUpdate} settings={{} as any} />}
            {activeTab === 'consumables' && <Consumables onUpdate={onUpdate} />}
            {activeTab === 'suppliers' && <Suppliers />}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={formData.id ? "Editar Producto" : "Nuevo Producto"} size="lg">
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="flex gap-4 items-start">
                        <div className="relative w-24 h-24 bg-gray-50 rounded-2xl border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                            {formData.image ? <img src={formData.image} className="w-full h-full object-cover" /> : <i className="fas fa-camera text-xl text-gray-300"></i>}
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                        </div>
                        <div className="flex-1 space-y-3">
                            <Input label="Nombre" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                            <div className="flex gap-2 items-end">
                                <div className="flex-1">
                                    <Input
                                        id="product-code-input"
                                        label="Código (Escanear o Manual)"
                                        value={formData.code || ''}
                                        onChange={e => setFormData({ ...formData, code: e.target.value })}
                                        required
                                        placeholder="Escanee código de fábrica..."
                                    />
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="mb-0.5 px-3 h-11"
                                    onClick={generateSequentialCode}
                                    title="Generar código automático del sistema"
                                >
                                    <i className="fas fa-magic"></i>
                                </Button>
                                <div className="w-40 text-xs">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Categoría</label>
                                    <select className="w-full p-2.5 border rounded-xl bg-white text-sm" value={formData.categoryId} onChange={e => setFormData({ ...formData, categoryId: e.target.value })}>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded-xl">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Precio Venta (con ISV incluido)</label>
                            <input type="number" step="0.01" value={formData.price || ''} onChange={handlePriceChange} className="w-full p-2.5 rounded-xl border font-black text-lg" required />
                            <p className="text-[9px] text-gray-400 mt-1">El precio al público siempre incluye ISV del 15%</p>
                        </div>
                        <Input label="Costo" type="number" step="0.01" value={formData.cost || ''} onChange={e => {
                            const val = parseFloat(e.target.value);
                            setFormData({ ...formData, cost: isNaN(val) ? 0 : val });
                        }} required />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Input label="Stock" type="number" value={formData.stock || ''} onChange={e => {
                                const val = parseFloat(e.target.value);
                                setFormData({ ...formData, stock: isNaN(val) ? 0 : val });
                            }} required disabled={!isAdmin} />
                            {!isAdmin && <p className="text-xs text-red-500 mt-1"><i className="fas fa-lock mr-1"></i>Solo admin puede modificar stock</p>}
                        </div>
                        <div>
                            <Input label="Mínimo" type="number" value={formData.minStock || ''} onChange={e => {
                                const val = parseFloat(e.target.value);
                                setFormData({ ...formData, minStock: isNaN(val) ? 0 : val });
                            }} required disabled={!isAdmin} />
                        </div>
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
                                <div className="flex-1">
                                    <Input
                                        label="Nombre del Producto"
                                        value={scanProduct.name}
                                        onChange={e => setScanProduct({ ...scanProduct, name: e.target.value })}
                                        className="font-bold border-blue-200 focus:border-blue-400 bg-white"
                                    />
                                    <p className="text-[10px] text-gray-500 mt-1">Stock Actual: <span className="font-bold text-gray-800">{scanProduct.stock}</span></p>
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

            <PasswordConfirmDialog
                isOpen={deleteConfirm.open}
                title="Eliminar Producto"
                message={`¿Estás seguro de eliminar "${deleteConfirm.name}"? Esta acción no se puede deshacer.`}
                confirmText="Eliminar"
                cancelText="Cancelar"
                variant="danger"
                masterPassword={settings?.masterPassword || ''}
                isAdmin={user?.role === UserRole.ADMIN}
                onConfirm={async () => {
                    await db.deleteProduct(deleteConfirm.id);
                    setDeleteConfirm({ open: false, id: '', name: '' });
                    onUpdate();
                    showToast("Producto eliminado exitosamente.", "success");
                }}
                onCancel={() => setDeleteConfirm({ open: false, id: '', name: '' })}
            />

            {/* Modal para impresión múltiple de etiquetas */}
            <Modal isOpen={labelModalOpen} onClose={() => setLabelModalOpen(false)} title="Imprimir Múltiples Etiquetas" size="sm">
                <div className="space-y-4">
                    <div className="p-4 bg-blue-50 rounded-xl flex items-center gap-3">
                        <i className="fas fa-print text-blue-500 text-xl"></i>
                        <div>
                            <p className="font-bold text-blue-900 text-sm">{labelProduct?.name}</p>
                            <p className="text-blue-700 text-xs font-mono">{labelProduct?.code}</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-gray-700">Cantidad de etiquetas</label>
                        <Input
                            type="number"
                            value={labelCount}
                            onChange={e => setLabelCount(parseInt(e.target.value) || 1)}
                            min={1}
                            max={100}
                        />
                        <p className="text-[10px] text-gray-500 italic">Máximo 100 por vez para evitar bloqueos del navegador.</p>
                    </div>

                    <div className="flex gap-2 pt-2">
                        <Button variant="secondary" className="flex-1" onClick={() => setLabelModalOpen(false)}>Cancelar</Button>
                        <Button variant="primary" className="flex-1" onClick={printMultipleLabels}>Imprimir</Button>
                    </div>
                </div>
            </Modal>

            {/* Catalog Share Modal */}
            <Modal isOpen={isCatalogModalOpen} onClose={() => setIsCatalogModalOpen(false)} title="Compartir Catálogo por WhatsApp" size="sm">
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">Selecciona las categorías que deseas incluir en el catálogo:</p>

                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        <label className="flex items-center gap-3 p-3 bg-primary/5 rounded-xl cursor-pointer hover:bg-primary/10">
                            <input
                                type="checkbox"
                                checked={selectedCategories.length === categories.length}
                                onChange={(e) => setSelectedCategories(e.target.checked ? categories.map(c => c.id) : [])}
                                className="w-5 h-5 rounded"
                            />
                            <span className="font-bold text-primary">Seleccionar Todas</span>
                        </label>

                        {categories.map(cat => (
                            <label key={cat.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100">
                                <input
                                    type="checkbox"
                                    checked={selectedCategories.includes(cat.id)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedCategories([...selectedCategories, cat.id]);
                                        } else {
                                            setSelectedCategories(selectedCategories.filter(id => id !== cat.id));
                                        }
                                    }}
                                    className="w-5 h-5 rounded"
                                />
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }}></span>
                                <span className="font-medium">{cat.name}</span>
                                <span className="text-xs text-gray-400 ml-auto">
                                    {products.filter(p => p.categoryId === cat.id && p.stock > 0).length} productos
                                </span>
                            </label>
                        ))}
                    </div>

                    <div className="border-t pt-4 flex gap-3">
                        <Button
                            variant="secondary"
                            onClick={() => setIsCatalogModalOpen(false)}
                            className="flex-1"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={generateCatalogHTML}
                            disabled={selectedCategories.length === 0}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                            <i className="fab fa-whatsapp mr-2"></i>
                            Generar y Compartir
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
