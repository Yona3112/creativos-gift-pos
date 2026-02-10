
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
    const [isSaving, setIsSaving] = useState(false);
    const [isCompressing, setIsCompressing] = useState(false);

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
        if (isSaving) return;
        setIsSaving(true);
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
        } finally {
            setIsSaving(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setIsCompressing(true);
            try {
                const compressed = await db.compressImage(file);
                setFormData(prev => ({ ...prev, image: compressed }));
            } finally {
                setIsCompressing(false);
            }
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

        const storeName = settings?.name || 'Mi Tienda';
        const phone = settings?.whatsappNumber || '';
        const themeColor = settings?.themeColor || '#e62e8a';
        const logo = settings?.logo || '';

        const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Menú Digital - ${storeName}</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { --primary: ${themeColor}; --bg: #f8fafc; }
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { font-family: 'Outfit', sans-serif; background: var(--bg); color: #1e293b; line-height: 1.5; overflow-x: hidden; }
        
        .glass { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.3); }
        
        header { 
            background: linear-gradient(135deg, var(--primary), #000); 
            color: white; padding: 40px 20px; text-align: center; position: relative;
            border-bottom-left-radius: 40px; border-bottom-right-radius: 40px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1); margin-bottom: 20px;
        }
        .header-logo { width: 90px; height: 90px; border-radius: 50%; object-fit: cover; border: 4px solid rgba(255,255,255,0.2); margin-bottom: 15px; box-shadow: 0 8px 20px rgba(0,0,0,0.2); }
        header h1 { font-size: 2.2rem; font-weight: 800; letter-spacing: -1px; margin-bottom: 5px; }
        header p { opacity: 0.8; font-weight: 300; font-size: 1rem; }

        .search-container { position: sticky; top: 15px; z-index: 100; padding: 0 20px; margin-top: -25px; }
        .search-bar { 
            width: 100%; padding: 16px 25px; border-radius: 20px; border: none; font-family: inherit;
            font-size: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.05); outline: none; transition: 0.3s;
        }
        .search-bar:focus { box-shadow: 0 10px 30px var(--primary)30; transform: scale(1.02); }

        .container { padding: 20px; max-width: 1000px; margin: 0 auto; }
        
        .category-section { margin-bottom: 40px; animation: fadeIn 0.5s ease-out both; }
        .category-title { 
            font-size: 1.4rem; font-weight: 800; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;
            color: var(--primary); text-transform: uppercase; letter-spacing: 1px;
        }
        .category-title::after { content: ''; flex: 1; height: 2px; background: linear-gradient(to right, var(--primary)40, transparent); }

        .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 15px; }
        
        .product-card { 
            background: white; border-radius: 24px; padding: 12px; transition: 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            box-shadow: 0 4px 15px rgba(0,0,0,0.03); display: flex; flex-direction: column; cursor: pointer;
            border: 1px solid #f1f5f9; position: relative; overflow: hidden;
        }
        .product-card:hover { transform: translateY(-8px); box-shadow: 0 20px 40px rgba(0,0,0,0.08); border-color: var(--primary)30; }
        
        .img-container { width: 100%; aspect-ratio: 1; border-radius: 18px; overflow: hidden; background: #f1f5f9; margin-bottom: 12px; position: relative; }
        .product-img { width: 100%; height: 100%; object-fit: cover; transition: 0.6s; }
        .product-card:hover .product-img { transform: scale(1.1); }
        .no-img { display: flex; align-items: center; justify-content: center; height: 100%; color: #cbd5e1; font-size: 2.5rem; }

        .product-info { flex: 1; display: flex; flex-direction: column; }
        .product-name { font-weight: 600; font-size: 0.95rem; color: #334155; margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.2; }
        .product-price { font-weight: 800; font-size: 1.2rem; color: var(--primary); margin-top: auto; }
        
        .order-btn { 
            margin-top: 10px; width: 100%; padding: 8px; border-radius: 12px; border: none;
            background: #25D36615; color: #25D366; font-weight: 700; font-size: 0.75rem;
            text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; transition: 0.3s;
            display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .product-card:hover .order-btn { background: #25D366; color: white; }

        .empty-state { text-align: center; padding: 60px 20px; display: none; }
        .empty-state i { font-size: 4rem; color: #cbd5e1; margin-bottom: 20px; }

        footer { text-align: center; padding: 40px 20px; color: #94a3b8; font-size: 0.8rem; }
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

        /* Floating Contact Button */
        .fab-contact { 
            position: fixed; bottom: 30px; right: 30px; background: #25D366; color: white;
            width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
            font-size: 1.8rem; box-shadow: 0 10px 30px rgba(37,211,102,0.4); text-decoration: none; z-index: 1000;
            transition: 0.3s;
        }
        .fab-contact:hover { transform: scale(1.1) rotate(10deg); }
    </style>
</head>
<body>
    <header>
        ${logo ? `<img src="${logo}" class="header-logo">` : ''}
        <h1>${storeName}</h1>
        <p>Catálogo Digital de Productos</p>
    </header>

    <div class="search-container">
        <input type="text" class="search-bar glass" placeholder="Buscar productos..." id="searchInput">
    </div>

    <div class="container" id="catalogContent">
        ${Array.from(new Set(selectedProducts.map(p => p.categoryId))).map(catId => {
            const cat = categories.find(c => c.id === catId);
            const catProds = selectedProducts.filter(p => p.categoryId === catId);
            return `
                <section class="category-section" data-cat="${cat?.name || 'Otros'}">
                    <h2 class="category-title">
                        <i class="fas fa-tag"></i> ${cat?.name || 'Otros'}
                    </h2>
                    <div class="products-grid">
                        ${catProds.map(p => `
                            <div class="product-card" data-name="${p.name.toLowerCase()}" onclick="orderProduct('${p.name}', '${p.price.toFixed(2)}', '${p.code}')">
                                <div class="img-container">
                                    ${p.image ? `<img src="${p.image}" class="product-img" loading="lazy">` : `<div class="no-img"><i class="fas fa-box"></i></div>`}
                                </div>
                                <div class="product-info">
                                    <h3 class="product-name">${p.name}</h3>
                                    ${p.description ? `<p style="font-size: 0.7rem; color: #64748b; margin-top: -4px; margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.1;">${p.description}</p>` : ''}
                                    <p class="product-price">L ${p.price.toFixed(2)}</p>
                                    <button class="order-btn">
                                        <i class="fab fa-whatsapp"></i> Pedir Ahora
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </section>
            `;
        }).join('')}
    </div>

    <div id="emptyState" class="empty-state">
        <i class="fas fa-search-minus"></i>
        <h3>No encontramos lo que buscas</h3>
        <p>Prueba con otros términos</p>
    </div>

    ${phone ? `<a href="https://api.whatsapp.com/send?phone=${phone.replace(/\D/g, '')}" class="fab-contact" target="_blank"><i class="fab fa-whatsapp"></i></a>` : ''}

    <footer>
        <p>© ${new Date().getFullYear()} ${storeName} • Catálogo Digital Interactivo</p>
    </footer>

    <script>
        const searchInput = document.getElementById('searchInput');
        const cards = document.querySelectorAll('.product-card');
        const sections = document.querySelectorAll('.category-section');
        const emptyState = document.getElementById('emptyState');

        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            let hasResults = false;

            sections.forEach(section => {
                const sectionCards = section.querySelectorAll('.product-card');
                let sectionHasResults = false;

                sectionCards.forEach(card => {
                    const name = card.getAttribute('data-name');
                    if (name.includes(term)) {
                        card.style.display = 'flex';
                        sectionHasResults = true;
                        hasResults = true;
                    } else {
                        card.style.display = 'none';
                    }
                });

                section.style.display = sectionHasResults ? 'block' : 'none';
            });

            emptyState.style.display = hasResults ? 'none' : 'block';
        });

        function orderProduct(name, price, code) {
            const phone = '${phone.replace(/\D/g, '')}';
            const message = encodeURIComponent('¡Hola! 👋 Me interesa este producto del catálogo:\\n\\n📦 *' + name + '*\\n💰 Precio: L ' + price + '\\n🔢 Código: ' + code + '\\n\\n¿Tienen disponibilidad?');
            window.open('https://api.whatsapp.com/send?phone=' + phone + '&text=' + message, '_blank');
        }
    </script>
</body>
</html>`;

        // Create Blob and Open with more robust handling
        try {
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const win = window.open(url, '_blank');

            if (!win) {
                // FALLBACK: Download and Alert
                const a = document.createElement('a');
                a.href = url;
                a.download = `Catalogo_${storeName.replace(/\s+/g, '_')}.html`;
                a.click();
                showToast("Ventanas bloqueadas por el navegador. El catálogo se ha descargado a tu equipo automáticamente.", "info");
            }
        } catch (err) {
            console.error("Error generating catalog:", err);
            showToast("Hubo un error al generar el catálogo.", "error");
        }

        setIsCatalogModalOpen(false);
    };

    const shareProductWhatsApp = (product: Product) => {
        const storeName = settings?.name || 'Mi Tienda';
        const message = `🛍️ *¡Hola! Me interesa este producto:*\n\n📦 *${product.name}*\n${product.description ? `📝 _${product.description}_\n` : ''}💰 Precio: *L ${product.price.toFixed(2)}*\n🔢 Código: \`${product.code}\`\n\n_¿Tienen disponibilidad en ${storeName}?_`;
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://api.whatsapp.com/send?text=${encodedMessage}`, '_blank');
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
                            // Add print toolbar
                            const toolbar = document.createElement('div');
                            toolbar.id = 'print-toolbar';
                            toolbar.innerHTML = '<style>#print-toolbar{position:fixed;top:0;left:0;right:0;background:linear-gradient(135deg,#667eea,#764ba2);padding:12px 20px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 2px 10px rgba(0,0,0,0.2);z-index:9999}@media print{#print-toolbar{display:none!important}}body{padding-top:60px!important}</style><span style="color:white;font-weight:bold;font-size:14px">📋 Previsualización - Etiqueta</span><div style="display:flex;gap:10px"><button onclick="document.getElementById(\'print-toolbar\').style.display=\'none\';window.print();document.getElementById(\'print-toolbar\').style.display=\'flex\';" style="background:white;color:#667eea;border:none;padding:8px 20px;border-radius:6px;font-weight:bold;cursor:pointer">🖨️ Imprimir</button><button onclick="window.close();" style="background:rgba(255,255,255,0.2);color:white;border:1px solid rgba(255,255,255,0.3);padding:8px 16px;border-radius:6px;cursor:pointer">✕ Cerrar</button></div>';
                            document.body.insertBefore(toolbar, document.body.firstChild);
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
                            // Add print toolbar
                            const toolbar = document.createElement('div');
                            toolbar.id = 'print-toolbar';
                            toolbar.innerHTML = '<style>#print-toolbar{position:fixed;top:0;left:0;right:0;background:linear-gradient(135deg,#667eea,#764ba2);padding:12px 20px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 2px 10px rgba(0,0,0,0.2);z-index:9999}@media print{#print-toolbar{display:none!important}}body{padding-top:60px!important}</style><span style="color:white;font-weight:bold;font-size:14px">📋 Previsualización - ${labelCount} Etiquetas</span><div style="display:flex;gap:10px"><button onclick="document.getElementById(\'print-toolbar\').style.display=\'none\';window.print();document.getElementById(\'print-toolbar\').style.display=\'flex\';" style="background:white;color:#667eea;border:none;padding:8px 20px;border-radius:6px;font-weight:bold;cursor:pointer">🖨️ Imprimir</button><button onclick="window.close();" style="background:rgba(255,255,255,0.2);color:white;border:1px solid rgba(255,255,255,0.3);padding:8px 16px;border-radius:6px;cursor:pointer">✕ Cerrar</button></div>';
                            document.body.insertBefore(toolbar, document.body.firstChild);
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
                            <Button onClick={() => { if (selectedCategories.length === 0) setSelectedCategories(categories.map(c => c.id)); setIsCatalogModalOpen(true); }} variant="secondary" className="!bg-green-500 !text-white hover:!bg-green-600">
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
                                            <Button size="sm" variant="ghost" onClick={() => shareProductWhatsApp(p)} icon="share-alt" className="h-7 w-7 p-0 text-green-500 hover:text-green-600" title="Compartir por WhatsApp"></Button>
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
                            {isCompressing ? <div className="text-center"><i className="fas fa-spinner fa-spin text-primary text-lg"></i><p className="text-[8px] text-gray-400 mt-1">Comprimiendo...</p></div> : formData.image ? <img src={formData.image} className="w-full h-full object-cover" /> : <i className="fas fa-camera text-xl text-gray-300"></i>}
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                        </div>
                        <div className="flex-1 space-y-3">
                            <Input label="Nombre" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Descripción del Producto / Arreglo</label>
                                <textarea
                                    className="w-full p-3 rounded-xl border border-gray-200 outline-none focus:border-primary bg-white text-sm"
                                    rows={2}
                                    value={formData.description || ''}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Ej: 12 rosas rojas, tarjeta gratis, etc."
                                />
                            </div>
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
                            <Button type="submit" disabled={isSaving}>{isSaving ? <><i className="fas fa-spinner fa-spin mr-2"></i>Guardando...</> : 'Guardar Producto'}</Button>
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

            {/* Catalog Share Modal - Rediseño Premium */}
            <Modal isOpen={isCatalogModalOpen} onClose={() => setIsCatalogModalOpen(false)} title="Generar Menú Digital" size="md">
                <div className="space-y-6">
                    <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10">
                        <p className="text-xs text-primary font-bold uppercase tracking-wider mb-1">Paso 1: Configuración</p>
                        <p className="text-sm text-gray-600">Selecciona las categorías que tus clientes podrán ver en el catálogo interactivo.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto p-1">
                        <button
                            onClick={() => setSelectedCategories(selectedCategories.length === categories.length ? [] : categories.map(c => c.id))}
                            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all gap-2 ${selectedCategories.length === categories.length ? 'border-primary bg-primary/5 text-primary' : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200'}`}
                        >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedCategories.length === categories.length ? 'bg-primary text-white' : 'bg-gray-200'}`}>
                                <i className={`fas ${selectedCategories.length === categories.length ? 'fa-check-double' : 'fa-list-ul'}`}></i>
                            </div>
                            <span className="font-bold text-xs">Todas</span>
                        </button>

                        {categories.map(cat => {
                            const isSelected = selectedCategories.includes(cat.id);
                            const productCount = products.filter(p => p.categoryId === cat.id && p.stock > 0).length;
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => {
                                        if (isSelected) {
                                            setSelectedCategories(selectedCategories.filter(id => id !== cat.id));
                                        } else {
                                            setSelectedCategories([...selectedCategories, cat.id]);
                                        }
                                    }}
                                    className={`flex flex-col items-start p-4 rounded-2xl border-2 transition-all relative overflow-hidden group ${isSelected ? 'border-primary bg-primary/5' : 'border-gray-100 hover:border-gray-200'}`}
                                >
                                    <div className="flex items-center gap-2 mb-1 z-10">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }}></span>
                                        <span className={`font-bold text-xs ${isSelected ? 'text-primary' : 'text-gray-700'}`}>{cat.name}</span>
                                    </div>
                                    <span className="text-[10px] text-gray-400 z-10">{productCount} productos</span>

                                    {isSelected && (
                                        <div className="absolute top-2 right-2 text-primary">
                                            <i className="fas fa-check-circle"></i>
                                        </div>
                                    )}

                                    <div className="absolute -bottom-2 -right-2 opacity-5 group-hover:opacity-10 transition-opacity text-4xl">
                                        <i className="fas fa-tag"></i>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button
                            variant="ghost"
                            onClick={() => setIsCatalogModalOpen(false)}
                            className="flex-1"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={generateCatalogHTML}
                            disabled={selectedCategories.length === 0}
                            className="flex-[2] !bg-green-500 hover:!bg-green-600 !text-white font-black shadow-lg shadow-green-200 h-12 rounded-2xl"
                        >
                            <i className="fas fa-magic mr-2"></i>
                            Crear Menú Digital ✨
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
