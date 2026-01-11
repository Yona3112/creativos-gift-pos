
import React, { useState } from 'react';
import { Category, ICONS, CompanySettings } from '../types';
import { Card, Button, Input, Modal } from '../components/UIComponents';
import { db } from '../services/storageService';

interface CategoriesProps {
  categories: Category[];
  onUpdate: () => void;
  settings: CompanySettings; // Added settings prop
}

export const Categories: React.FC<CategoriesProps> = ({ categories, onUpdate, settings }) => {
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  
  // Data States
  const [formData, setFormData] = useState<Partial<Category>>({});
  const [selectedCategoryForShare, setSelectedCategoryForShare] = useState<Category | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await db.saveCategory(formData as Category);
    setIsModalOpen(false);
    onUpdate();
  };

  const applyStockToProducts = async () => {
      if (!formData.id || !formData.defaultMinStock) return;
      if(confirm(`¿Estás seguro de actualizar el stock mínimo a ${formData.defaultMinStock} para TODOS los productos de esta categoría?`)) {
          await db.updateCategoryStockThreshold(formData.id, formData.defaultMinStock);
          alert('Productos actualizados correctamente.');
      }
  };

  const handleShareClick = (category: Category) => {
      setSelectedCategoryForShare(category);
      setIsShareModalOpen(true);
  };

  const shareTextList = async () => {
      if (!selectedCategoryForShare) return;
      const allProducts = await db.getProducts();
      const products = allProducts.filter(p => p.categoryId === selectedCategoryForShare.id);
      
      if (products.length === 0) {
          alert("No hay productos en esta categoría.");
          return;
      }

      // Generate Item List
      let itemList = "";
      products.forEach(p => {
          itemList += `▪ ${p.name} - L ${p.price.toFixed(2)}\n`;
      });

      // Use Template
      let template = settings.whatsappTemplate || "👋 Hola *{CLIENT_NAME}*, catálogo *{CATALOG_NAME}*:\n\n{ITEMS_LIST}";
      
      // Replace Placeholders
      const text = template
          .replace('{CLIENT_NAME}', settings.name)
          .replace('{CATALOG_NAME}', selectedCategoryForShare.name.toUpperCase())
          .replace('{ITEMS_LIST}', itemList)
          .replace('{TOTAL}', '') 
          .replace(/\n\n\n/g, '\n\n'); 

      // Share Logic
      if (navigator.share) {
          try {
              await navigator.share({
                  title: `Catálogo ${selectedCategoryForShare.name}`,
                  text: text
              });
              setIsShareModalOpen(false);
          } catch (err) {
              console.log('Share canceled', err);
          }
      } else {
          navigator.clipboard.writeText(text).then(() => {
              alert("Texto copiado. Abriendo WhatsApp...");
              window.open(`https://wa.me/?text=${encodeURIComponent(text.substring(0, 2000))}`, '_blank');
              setIsShareModalOpen(false);
          });
      }
  };

  const shareCatalogHTML = async () => {
    if (!selectedCategoryForShare) return;
    
    const category = selectedCategoryForShare;
    const allProducts = await db.getProducts();
    const products = allProducts.filter(p => p.categoryId === category.id);
    
    if (products.length === 0) {
      alert('No hay productos en esta categoría para generar el catálogo.');
      return;
    }

    const targetPhone = settings.whatsappNumber || settings.phone;
    const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
    
    const catalogConfig = {
        phoneNumber: cleanPhone,
        clientName: settings.name,
        catalogName: category.name,
        messageTemplate: settings.whatsappTemplate || "👋 Hola *{CLIENT_NAME}*, pedido de *{CATALOG_NAME}*:\n\n{ITEMS_LIST}\n\n💰 *TOTAL: {TOTAL}*"
    };

    const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Catálogo - ${category.name}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap" rel="stylesheet">
    <style>
      body { font-family: 'Inter', sans-serif; background-color: #F8FAFC; -webkit-tap-highlight-color: transparent; }
      .scrollbar-hide::-webkit-scrollbar { display: none; }
      .card-shadow { box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05); }
      .glass-nav { background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(0,0,0,0.05); }
      .product-image-container { aspect-ratio: 1/1; overflow: hidden; background: #f1f5f9; position: relative; }
      .product-image { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease; }
      .check-overlay { background: ${category.color}; opacity: 0; transition: opacity 0.2s; }
      .selected .check-overlay { opacity: 0.9; }
      .selected .product-image { transform: scale(1.05); }
      .product-card { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
      .product-card:hover { transform: translateY(-8px); box-shadow: 0 15px 30px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); z-index: 10; border-color: ${category.color}40; }
      .float-btn { animation: float 3s ease-in-out infinite; }
      @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-5px); } 100% { transform: translateY(0px); } }
    </style>
</head>
<body class="text-gray-800">
    <div class="max-w-md mx-auto min-h-screen flex flex-col bg-white shadow-2xl overflow-hidden relative">
        <header class="glass-nav sticky top-0 z-30 px-5 py-4 flex flex-col gap-3">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg" style="background-color: ${category.color}">
                        <i class="fas fa-${category.icon || 'tag'}"></i>
                    </div>
                    <div>
                        <p class="text-xs font-bold text-gray-400 uppercase tracking-wider leading-none mb-1">${settings.name}</p>
                        <h1 class="text-xl font-extrabold text-gray-900 leading-none">${category.name}</h1>
                    </div>
                </div>
                <a href="https://wa.me/${cleanPhone}" class="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 hover:bg-green-200 transition-colors">
                    <i class="fab fa-whatsapp text-xl"></i>
                </a>
            </div>
            <div class="relative">
                <i class="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input type="text" id="searchInput" onkeyup="filterProducts()" placeholder="Buscar en esta categoría..." 
                    class="w-full bg-gray-100 text-gray-800 text-sm rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-gray-200 font-medium transition-all">
            </div>
        </header>

        <div class="flex-1 overflow-y-auto p-4 pb-32" id="productGrid">
            <div class="grid grid-cols-2 gap-4">
                ${products.map(p => `
                <div class="product-card group relative bg-white rounded-2xl overflow-hidden card-shadow border border-gray-100 cursor-pointer select-none active:scale-95" 
                     onclick="toggleProduct('${p.id}')" id="card-${p.id}"
                     data-name="${p.name.toLowerCase()}">
                    <div class="product-image-container">
                        ${p.image ? `<img src="${p.image}" class="product-image" loading="lazy">` : `<div class="w-full h-full flex items-center justify-center text-gray-300"><i class="fas fa-box-open text-3xl opacity-50"></i></div>`}
                        <div class="check-overlay absolute inset-0 flex items-center justify-center text-white font-bold z-10">
                            <div class="flex flex-col items-center"><i class="fas fa-check-circle text-3xl mb-1 shadow-sm"></i><span class="text-xs">Agregado</span></div>
                        </div>
                        ${p.stock <= p.minStock ? `<div class="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">Pocos</div>` : ''}
                    </div>
                    <div class="p-3">
                        <div class="flex justify-between items-start mb-1"><h3 class="text-sm font-bold text-gray-900 leading-tight line-clamp-2">${p.name}</h3></div>
                        <p class="text-[10px] text-gray-400 mb-2 font-mono">${p.code}</p>
                        <div class="flex items-end justify-between mt-1">
                            <span class="text-base font-black text-gray-800">L ${p.price.toFixed(2)}</span>
                            <div class="hidden items-center gap-2 bg-gray-900 rounded-full px-1 py-0.5" id="controls-${p.id}" onclick="event.stopPropagation()">
                                <button onclick="updateQty('${p.id}', -1)" class="w-6 h-6 flex items-center justify-center text-white hover:text-gray-300 text-xs font-bold">-</button>
                                <span id="qty-${p.id}" class="text-white text-xs font-bold w-4 text-center">1</span>
                                <button onclick="updateQty('${p.id}', 1)" class="w-6 h-6 flex items-center justify-center text-white hover:text-gray-300 text-xs font-bold">+</button>
                            </div>
                            <div class="w-6 h-6 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center group-hover:bg-gray-200 transition-colors" id="add-icon-${p.id}"><i class="fas fa-plus text-xs"></i></div>
                        </div>
                    </div>
                </div>
                `).join('')}
            </div>
            <div id="emptyState" class="hidden flex-col items-center justify-center py-10 text-center text-gray-400">
                <i class="fas fa-search text-4xl mb-3 opacity-30"></i>
                <p class="text-sm font-medium">No encontramos productos<br>con ese nombre.</p>
            </div>
        </div>

        <div id="cartBar" class="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-100 p-4 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] transform translate-y-full transition-transform duration-300 z-40">
            <div class="flex justify-between items-end mb-3">
                <div><p class="text-xs text-gray-400 font-bold uppercase">Total Estimado</p><p class="text-2xl font-black text-gray-900" id="totalAmount">L 0.00</p></div>
                <div class="text-right"><span class="bg-gray-100 text-gray-600 px-2 py-1 rounded-lg text-xs font-bold" id="totalItems">0 items</span></div>
            </div>
            <button onclick="sendOrder()" class="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-4 rounded-xl shadow-lg shadow-green-200 flex items-center justify-center gap-2 transition-all active:scale-95 float-btn">
                <i class="fab fa-whatsapp text-xl"></i> Enviar Pedido por WhatsApp
            </button>
        </div>
    </div>

    <script>
        const CONFIG = ${JSON.stringify(catalogConfig)};
        let cart = {};

        function filterProducts() {
            const query = document.getElementById('searchInput').value.toLowerCase();
            const cards = document.querySelectorAll('.product-card');
            let visibleCount = 0;
            cards.forEach(card => {
                const name = card.getAttribute('data-name');
                if (name.includes(query)) { card.style.display = 'block'; visibleCount++; } else { card.style.display = 'none'; }
            });
            const emptyState = document.getElementById('emptyState');
            if(visibleCount === 0) { emptyState.classList.remove('hidden'); emptyState.classList.add('flex'); } else { emptyState.classList.add('hidden'); emptyState.classList.remove('flex'); }
        }

        function toggleProduct(id) {
            const card = document.getElementById('card-' + id);
            const controls = document.getElementById('controls-' + id);
            const addIcon = document.getElementById('add-icon-' + id);
            
            if (cart[id]) {
                delete cart[id];
                card.classList.remove('selected', 'ring-2', 'ring-indigo-500');
                controls.classList.add('hidden'); controls.classList.remove('flex'); addIcon.classList.remove('hidden');
            } else {
                const price = parseFloat(card.querySelector('span').innerText.replace('L ', ''));
                const name = card.querySelector('h3').innerText;
                cart[id] = { id, name, price, qty: 1 };
                card.classList.add('selected', 'ring-2', 'ring-indigo-500');
                controls.classList.remove('hidden'); controls.classList.add('flex'); addIcon.classList.add('hidden');
                if(navigator.vibrate) navigator.vibrate(50);
            }
            updateCart();
        }

        function updateQty(id, delta) {
            if(!cart[id]) return;
            const newQty = cart[id].qty + delta;
            if (newQty < 1) toggleProduct(id);
            else {
                cart[id].qty = newQty;
                document.getElementById('qty-' + id).innerText = newQty;
                updateCart();
            }
        }

        function updateCart() {
            const items = Object.values(cart);
            const total = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
            const count = items.reduce((sum, item) => sum + item.qty, 0);
            document.getElementById('totalAmount').innerText = 'L ' + total.toFixed(2);
            document.getElementById('totalItems').innerText = count + (count === 1 ? ' item' : ' items');
            const bar = document.getElementById('cartBar');
            const grid = document.getElementById('productGrid');
            if (count > 0) { bar.classList.remove('translate-y-full'); grid.classList.remove('pb-32'); grid.classList.add('pb-48'); }
            else { bar.classList.add('translate-y-full'); grid.classList.add('pb-32'); grid.classList.remove('pb-48'); }
        }

        function sendOrder() {
            const items = Object.values(cart);
            if (items.length === 0) return;

            let itemList = "";
            let total = 0;

            items.forEach(item => {
                const subtotal = item.price * item.qty;
                total += subtotal;
                itemList += \`▪ \${item.name} (x\${item.qty}) = L \${subtotal.toFixed(2)}\\n\`;
            });

            let message = CONFIG.messageTemplate
                .replace('{CLIENT_NAME}', CONFIG.clientName)
                .replace('{CATALOG_NAME}', CONFIG.catalogName)
                .replace('{ITEMS_LIST}', itemList)
                .replace('{TOTAL}', 'L ' + total.toFixed(2));

            const url = \`https://wa.me/\${CONFIG.phoneNumber}?text=\${encodeURIComponent(message)}\`;
            window.open(url, '_blank');
        }
    </script>
</body>
</html>
    `;

    const fileName = `Catalogo_${category.name.replace(/\s+/g, '_')}.html`;
    const file = new File([htmlContent], fileName, { type: 'text/html' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: `Catálogo ${category.name}`,
                text: 'Te comparto nuestro catálogo interactivo. Ábrelo en tu navegador para hacer tu pedido.'
            });
            setIsShareModalOpen(false);
        } catch (error) {
            console.log("Error al compartir", error);
            downloadFile(file, fileName);
        }
    } else {
        downloadFile(file, fileName);
        alert("El archivo se ha descargado. Puedes enviarlo manualmente.");
    }
  };

  const downloadFile = (file: File | Blob, fileName: string) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Categorías</h1>
        <Button onClick={() => { setFormData({ color: '#3B82F6', icon: 'tag', defaultMinStock: 5 }); setIsModalOpen(true); }} icon="plus">Nueva Categoría</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {categories.map(c => (
          <Card key={c.id} className="group hover:shadow-lg transition-all">
            <div className="flex flex-col h-full">
               <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-md" style={{ backgroundColor: c.color }}>
                     <i className={`fas fa-${c.icon} text-xl`}></i>
                  </div>
                  <h3 className="font-bold text-gray-800 text-lg">{c.name}</h3>
               </div>
               
               <div className="mb-2">
                   <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded">Min. Stock: {c.defaultMinStock || 5}</span>
               </div>

               <div className="mt-auto flex gap-2 pt-4 border-t border-gray-100">
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="flex-1 text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200"
                    onClick={() => handleShareClick(c)}
                    title="Enviar por WhatsApp"
                  >
                    <i className="fas fa-share-alt mr-1"></i> Compartir
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setFormData(c); setIsModalOpen(true); }}>
                    <i className="fas fa-edit text-gray-400 hover:text-primary"></i>
                  </Button>
               </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} title="Compartir Catálogo" size="sm">
          <div className="space-y-4">
              <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-4 rounded-xl border border-indigo-100 mb-4">
                  <p className="text-sm text-indigo-900 font-bold text-center">
                      <i className="fas fa-mobile-alt mr-2"></i>
                      Selecciona una opción para enviar <strong>"{selectedCategoryForShare?.name}"</strong>
                  </p>
              </div>

              <button 
                  onClick={shareCatalogHTML}
                  className="w-full p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md hover:border-indigo-500 hover:ring-1 hover:ring-indigo-500 transition-all flex items-center gap-4 group active:scale-[0.98]"
              >
                  <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <i className="fas fa-file-code text-xl"></i>
                  </div>
                  <div className="text-left flex-1">
                      <h4 className="font-bold text-gray-900">Enviar Catálogo App (HTML)</h4>
                      <p className="text-xs text-gray-500">Envía un archivo que tus clientes abren como una App con fotos y carrito.</p>
                  </div>
                  <i className="fas fa-share text-gray-300"></i>
              </button>

              <button 
                  onClick={shareTextList}
                  className="w-full p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md hover:border-green-500 hover:ring-1 hover:ring-green-500 transition-all flex items-center gap-4 group active:scale-[0.98]"
              >
                  <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center group-hover:bg-green-600 group-hover:text-white transition-colors">
                      <i className="fab fa-whatsapp text-2xl"></i>
                  </div>
                  <div className="text-left flex-1">
                      <h4 className="font-bold text-gray-900">Enviar Lista de Texto</h4>
                      <p className="text-xs text-gray-500">Envía un mensaje de WhatsApp simple con la lista de precios.</p>
                  </div>
                   <i className="fas fa-share text-gray-300"></i>
              </button>

              <div className="text-center pt-2">
                  <button onClick={() => setIsShareModalOpen(false)} className="text-gray-400 text-sm font-bold hover:text-gray-600 px-4 py-2">Cancelar</button>
              </div>
          </div>
      </Modal>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={formData.id ? "Editar Categoría" : "Nueva Categoría"}>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input label="Nombre de Categoría" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} required />
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Color Identificativo</label>
            <div className="flex gap-3">
               <input 
                 type="color" 
                 value={formData.color || '#3B82F6'} 
                 onChange={e => setFormData({...formData, color: e.target.value})} 
                 className="w-12 h-12 rounded-xl border-0 p-1 cursor-pointer shadow-sm"
               />
               <div className="flex-1 flex items-center px-4 bg-gray-50 rounded-xl text-sm font-mono text-gray-600 border border-gray-200">
                 {formData.color}
               </div>
            </div>
          </div>

          <Input 
            label="Alerta de Stock Bajo (Cantidad por Defecto)" 
            type="number" 
            min="0" 
            value={formData.defaultMinStock || 0} 
            onChange={e => setFormData({...formData, defaultMinStock: parseInt(e.target.value)})} 
            placeholder="Ej: 5"
            required
          />

          {formData.id && (
              <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-sm text-yellow-800">
                  <p className="mb-2 font-semibold">¿Actualizar productos existentes?</p>
                  <Button type="button" size="sm" variant="secondary" onClick={applyStockToProducts} className="w-full">
                      Aplicar {formData.defaultMinStock} a productos de esta categoría
                  </Button>
              </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Icono</label>
            <div className="grid grid-cols-6 gap-2 max-h-40 overflow-y-auto p-2 border border-gray-100 rounded-xl bg-gray-50">
               {ICONS.map(icon => (
                 <button
                   type="button"
                   key={icon}
                   onClick={() => setFormData({...formData, icon})}
                   className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${formData.icon === icon ? 'bg-primary text-white shadow-md scale-110' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
                 >
                   <i className={`fas fa-${icon}`}></i>
                 </button>
               ))}
            </div>
          </div>

          <Button type="submit" className="w-full">Guardar Categoría</Button>
        </form>
      </Modal>
    </div>
  );
};
