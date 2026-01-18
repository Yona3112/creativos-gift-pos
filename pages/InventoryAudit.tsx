
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Product, Category, InventoryMovement, User } from '../types';
import { Card, Button, Input, Modal, showToast } from '../components/UIComponents';
import { db } from '../services/storageService';

interface InventoryAuditProps {
    products: Product[];
    categories: Category[];
    users: User[];
    onUpdate: () => void;
}

interface AuditItem {
    product: Product;
    physicalCount: number | null;
    difference: number;
    counted: boolean;
}

type AuditMode = 'manual' | 'scanner';

export const InventoryAudit: React.FC<InventoryAuditProps> = ({ products, categories, users, onUpdate }) => {
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [showSummaryModal, setShowSummaryModal] = useState(false);

    // Modo de auditoría: manual o escáner
    const [auditMode, setAuditMode] = useState<AuditMode>('manual');

    // Estados para modo escáner
    const [scannerCode, setScannerCode] = useState('');
    const [lastScannedProduct, setLastScannedProduct] = useState<Product | null>(null);
    const [scanQty, setScanQty] = useState(1);
    const scanInputRef = useRef<HTMLInputElement>(null);
    const qtyInputRef = useRef<HTMLInputElement>(null);

    // Filtrar productos activos según categoría seleccionada
    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            if (p.active === false) return false;
            if (selectedCategory === 'all') return true;
            return p.categoryId === selectedCategory;
        });
    }, [products, selectedCategory]);

    // Iniciar auditoría
    const startAudit = (mode: AuditMode) => {
        const items: AuditItem[] = filteredProducts.map(p => ({
            product: p,
            physicalCount: null,
            difference: 0,
            counted: false
        }));
        setAuditItems(items);
        setAuditMode(mode);
        setIsAuditing(true);

        // En modo escáner, enfocar el campo de escaneo
        if (mode === 'scanner') {
            setTimeout(() => scanInputRef.current?.focus(), 100);
        }
    };

    // Cancelar auditoría
    const cancelAudit = () => {
        setIsAuditing(false);
        setAuditItems([]);
        setSearchTerm('');
        setScannerCode('');
        setLastScannedProduct(null);
        setScanQty(1);
    };

    // Actualizar conteo físico (modo manual)
    const updatePhysicalCount = (productId: string, count: number | null) => {
        setAuditItems(prev => prev.map(item => {
            if (item.product.id === productId) {
                const physicalCount = count;
                const difference = physicalCount !== null ? physicalCount - item.product.stock : 0;
                return {
                    ...item,
                    physicalCount,
                    difference,
                    counted: physicalCount !== null
                };
            }
            return item;
        }));
    };

    // Manejar escaneo de código de barras
    const handleScan = (e: React.FormEvent) => {
        e.preventDefault();
        const code = scannerCode.trim().toLowerCase();

        if (!code) return;

        // Buscar producto por código
        const foundItem = auditItems.find(item =>
            item.product.code.toLowerCase() === code
        );

        if (foundItem) {
            setLastScannedProduct(foundItem.product);
            setScanQty(1);
            setTimeout(() => qtyInputRef.current?.focus(), 100);
        } else {
            showToast('Producto no encontrado en esta auditoría', 'warning');
            setScannerCode('');
            scanInputRef.current?.focus();
        }
    };

    // Confirmar cantidad escaneada
    const confirmScannedQty = (e: React.FormEvent) => {
        e.preventDefault();

        if (!lastScannedProduct) return;

        // Actualizar el conteo para este producto
        setAuditItems(prev => prev.map(item => {
            if (item.product.id === lastScannedProduct.id) {
                const physicalCount = scanQty;
                const difference = physicalCount - item.product.stock;
                return {
                    ...item,
                    physicalCount,
                    difference,
                    counted: true
                };
            }
            return item;
        }));

        showToast(`✓ ${lastScannedProduct.name}: ${scanQty} unidades registradas`, 'success');

        // Limpiar y preparar para el siguiente escaneo
        setLastScannedProduct(null);
        setScannerCode('');
        setScanQty(1);
        setTimeout(() => scanInputRef.current?.focus(), 100);
    };

    // Incrementar cantidad del producto actualmente escaneado (para escaneos múltiples del mismo producto)
    const handleQuickScan = (e: React.FormEvent) => {
        e.preventDefault();
        const code = scannerCode.trim().toLowerCase();

        if (!code) return;

        // Buscar producto por código
        const foundItem = auditItems.find(item =>
            item.product.code.toLowerCase() === code
        );

        if (foundItem) {
            // Si ya está contado, incrementar, si no, establecer en 1
            const currentCount = auditItems.find(i => i.product.id === foundItem.product.id)?.physicalCount || 0;
            const newCount = currentCount + 1;

            setAuditItems(prev => prev.map(item => {
                if (item.product.id === foundItem.product.id) {
                    const difference = newCount - item.product.stock;
                    return {
                        ...item,
                        physicalCount: newCount,
                        difference,
                        counted: true
                    };
                }
                return item;
            }));

            setLastScannedProduct(foundItem.product);
            showToast(`✓ ${foundItem.product.name}: ${newCount} unidades`, 'success');
        } else {
            showToast('Producto no encontrado', 'warning');
        }

        setScannerCode('');
        scanInputRef.current?.focus();
    };

    // Filtrar items de auditoría por búsqueda
    const filteredAuditItems = useMemo(() => {
        if (!searchTerm) return auditItems;
        const lower = searchTerm.toLowerCase();
        return auditItems.filter(item =>
            item.product.name.toLowerCase().includes(lower) ||
            item.product.code.toLowerCase().includes(lower)
        );
    }, [auditItems, searchTerm]);

    // Resumen de auditoría
    const auditSummary = useMemo(() => {
        const counted = auditItems.filter(i => i.counted);
        const totalProducts = auditItems.length;
        const countedProducts = counted.length;
        const itemsWithDifference = counted.filter(i => i.difference !== 0);
        const surplus = counted.filter(i => i.difference > 0).reduce((sum, i) => sum + i.difference, 0);
        const shortage = counted.filter(i => i.difference < 0).reduce((sum, i) => sum + Math.abs(i.difference), 0);

        return {
            totalProducts,
            countedProducts,
            pendingProducts: totalProducts - countedProducts,
            itemsWithDifference: itemsWithDifference.length,
            surplus,
            shortage
        };
    }, [auditItems]);

    // Guardar ajustes de inventario
    const saveAuditAdjustments = async () => {
        const itemsWithDifference = auditItems.filter(i => i.counted && i.difference !== 0);

        if (itemsWithDifference.length === 0) {
            showToast('No hay diferencias que ajustar.', 'info');
            return;
        }

        setIsSaving(true);

        try {
            const currentUser = users[0] || { id: 'admin' };

            for (const item of itemsWithDifference) {
                // Actualizar stock del producto
                const updatedProduct = {
                    ...item.product,
                    stock: item.physicalCount!
                };

                await db.saveProduct(updatedProduct, currentUser.id);

                // Registrar movimiento en el Kardex
                const movement: InventoryMovement = {
                    id: `audit_${Date.now()}_${item.product.id}`,
                    productId: item.product.id,
                    date: new Date().toISOString(),
                    type: 'ADJUSTMENT',
                    quantity: item.difference,
                    previousStock: item.product.stock,
                    newStock: item.physicalCount!,
                    reason: `Ajuste por auditoría de inventario. Diferencia: ${item.difference > 0 ? '+' : ''}${item.difference}`,
                    userId: currentUser.id
                };

                await db.saveInventoryMovement(movement);
            }

            showToast(`Se ajustaron ${itemsWithDifference.length} productos correctamente.`, 'success');
            setShowSummaryModal(false);
            cancelAudit();
            onUpdate();
        } catch (error) {
            console.error('Error saving audit adjustments:', error);
            showToast('Error al guardar los ajustes.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // Obtener nombre de categoría
    const getCategoryName = (categoryId: string) => {
        const cat = categories.find(c => c.id === categoryId);
        return cat?.name || 'Sin categoría';
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-800">Auditoría de Inventario</h1>
                    <p className="text-sm text-gray-500">Compara el stock físico vs. el sistema y registra ajustes</p>
                </div>
            </div>

            {!isAuditing ? (
                // Panel de inicio de auditoría
                <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-100">
                    <div className="text-center py-8 space-y-6">
                        <div className="w-20 h-20 mx-auto bg-indigo-100 rounded-full flex items-center justify-center">
                            <i className="fas fa-clipboard-check text-4xl text-indigo-600"></i>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-800 mb-2">Iniciar Nueva Auditoría</h2>
                            <p className="text-gray-600 max-w-md mx-auto">
                                Selecciona una categoría y el método de conteo preferido.
                            </p>
                        </div>

                        <div className="max-w-md mx-auto space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Categoría a Auditar</label>
                                <select
                                    value={selectedCategory}
                                    onChange={e => setSelectedCategory(e.target.value)}
                                    className="w-full p-3 border rounded-xl bg-white font-medium text-gray-700 outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="all">📦 Todas las categorías ({products.filter(p => p.active !== false).length} productos)</option>
                                    {categories.map(c => {
                                        const count = products.filter(p => p.categoryId === c.id && p.active !== false).length;
                                        return (
                                            <option key={c.id} value={c.id}>
                                                {c.name} ({count} productos)
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4">
                                <button
                                    onClick={() => startAudit('manual')}
                                    disabled={filteredProducts.length === 0}
                                    className="p-6 bg-white border-2 border-gray-200 rounded-2xl hover:border-indigo-500 hover:shadow-lg transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className="w-14 h-14 mx-auto bg-indigo-100 rounded-full flex items-center justify-center mb-3 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                                        <i className="fas fa-edit text-2xl text-indigo-600 group-hover:text-white"></i>
                                    </div>
                                    <h3 className="font-bold text-gray-800">Conteo Manual</h3>
                                    <p className="text-xs text-gray-500 mt-1">Ingresa cantidades directamente en la tabla</p>
                                </button>

                                <button
                                    onClick={() => startAudit('scanner')}
                                    disabled={filteredProducts.length === 0}
                                    className="p-6 bg-white border-2 border-gray-200 rounded-2xl hover:border-green-500 hover:shadow-lg transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className="w-14 h-14 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-3 group-hover:bg-green-500 transition-colors">
                                        <i className="fas fa-barcode text-2xl text-green-600 group-hover:text-white"></i>
                                    </div>
                                    <h3 className="font-bold text-gray-800">Con Escáner</h3>
                                    <p className="text-xs text-gray-500 mt-1">Escanea códigos de barras para contar</p>
                                </button>
                            </div>

                            <p className="text-xs text-gray-400 pt-2">
                                {filteredProducts.length} productos a auditar
                            </p>
                        </div>
                    </div>
                </Card>
            ) : (
                // Panel de auditoría activa
                <div className="space-y-4">
                    {/* Barra de resumen */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <Card className="bg-blue-50 border-blue-100">
                            <div className="text-center">
                                <p className="text-xs uppercase font-bold text-blue-600 mb-1">Total</p>
                                <p className="text-2xl font-black text-blue-800">{auditSummary.totalProducts}</p>
                            </div>
                        </Card>
                        <Card className="bg-green-50 border-green-100">
                            <div className="text-center">
                                <p className="text-xs uppercase font-bold text-green-600 mb-1">Contados</p>
                                <p className="text-2xl font-black text-green-800">{auditSummary.countedProducts}</p>
                            </div>
                        </Card>
                        <Card className="bg-yellow-50 border-yellow-100">
                            <div className="text-center">
                                <p className="text-xs uppercase font-bold text-yellow-600 mb-1">Pendientes</p>
                                <p className="text-2xl font-black text-yellow-800">{auditSummary.pendingProducts}</p>
                            </div>
                        </Card>
                        <Card className="bg-red-50 border-red-100">
                            <div className="text-center">
                                <p className="text-xs uppercase font-bold text-red-600 mb-1">Con Diferencia</p>
                                <p className="text-2xl font-black text-red-800">{auditSummary.itemsWithDifference}</p>
                            </div>
                        </Card>
                    </div>

                    {/* Panel de escáner (solo en modo scanner) */}
                    {auditMode === 'scanner' && (
                        <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
                            <div className="flex flex-col md:flex-row gap-6">
                                {/* Campo de escaneo */}
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                                            <i className="fas fa-barcode text-white"></i>
                                        </div>
                                        <h3 className="font-bold text-gray-800">Escáner de Código</h3>
                                    </div>
                                    <form onSubmit={handleQuickScan} className="flex gap-2">
                                        <input
                                            ref={scanInputRef}
                                            type="text"
                                            value={scannerCode}
                                            onChange={e => setScannerCode(e.target.value)}
                                            placeholder="Escanea o escribe el código..."
                                            className="flex-1 p-4 text-lg font-mono border-2 border-green-300 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none bg-white"
                                            autoFocus
                                        />
                                        <Button type="submit" className="px-6 bg-green-600 hover:bg-green-700">
                                            <i className="fas fa-plus"></i>
                                        </Button>
                                    </form>
                                    <p className="text-xs text-green-700 mt-2">
                                        <i className="fas fa-info-circle mr-1"></i>
                                        Cada escaneo suma +1 al conteo del producto
                                    </p>
                                </div>

                                {/* Último producto escaneado */}
                                {lastScannedProduct && (
                                    <div className="md:w-72 bg-white p-4 rounded-xl border border-green-200">
                                        <p className="text-xs text-green-600 font-bold uppercase mb-2">Último Escaneado</p>
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                                {lastScannedProduct.image ? (
                                                    <img src={lastScannedProduct.image} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                        <i className="fas fa-box"></i>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-gray-800 truncate">{lastScannedProduct.name}</p>
                                                <p className="text-xs text-gray-500 font-mono">{lastScannedProduct.code}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-2xl font-black text-green-600">
                                                    {auditItems.find(i => i.product.id === lastScannedProduct.id)?.physicalCount || 0}
                                                </p>
                                                <p className="text-xs text-gray-500">contados</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Card>
                    )}

                    {/* Controles */}
                    <div className="flex flex-wrap gap-4 items-center justify-between">
                        <div className="flex-1 min-w-[250px]">
                            <Input
                                placeholder="Buscar producto..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                icon="search"
                            />
                        </div>
                        <div className="flex gap-2 items-center">
                            <span className={`text-xs font-bold px-3 py-1 rounded-full ${auditMode === 'scanner' ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                <i className={`fas fa-${auditMode === 'scanner' ? 'barcode' : 'edit'} mr-1`}></i>
                                Modo {auditMode === 'scanner' ? 'Escáner' : 'Manual'}
                            </span>
                            <Button variant="secondary" onClick={cancelAudit} icon="times">
                                Cancelar
                            </Button>
                            <Button
                                onClick={() => setShowSummaryModal(true)}
                                icon="save"
                                disabled={auditSummary.countedProducts === 0}
                            >
                                Ver Resumen y Guardar
                            </Button>
                        </div>
                    </div>

                    {/* Tabla de auditoría */}
                    <Card noPadding>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold border-b">
                                    <tr>
                                        <th className="p-4 text-left">Producto</th>
                                        <th className="p-4 text-center">Categoría</th>
                                        <th className="p-4 text-center">Stock Sistema</th>
                                        <th className="p-4 text-center">Stock Físico</th>
                                        <th className="p-4 text-center">Diferencia</th>
                                        <th className="p-4 text-center">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredAuditItems.map(item => (
                                        <tr
                                            key={item.product.id}
                                            className={`hover:bg-gray-50 transition-colors ${item.counted
                                                    ? (item.difference !== 0 ? 'bg-yellow-50' : 'bg-green-50')
                                                    : ''
                                                } ${lastScannedProduct?.id === item.product.id
                                                    ? 'ring-2 ring-green-500 ring-inset'
                                                    : ''
                                                }`}
                                        >
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                                                        {item.product.image ? (
                                                            <img src={item.product.image} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                                <i className="fas fa-box"></i>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-800">{item.product.name}</p>
                                                        <p className="text-xs text-gray-400 font-mono">{item.product.code}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded">
                                                    {getCategoryName(item.product.categoryId)}
                                                </span>
                                            </td>
                                            <td className="p-4 text-center font-bold text-gray-800">
                                                {item.product.stock}
                                            </td>
                                            <td className="p-4 text-center">
                                                {auditMode === 'manual' ? (
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={item.physicalCount ?? ''}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            updatePhysicalCount(
                                                                item.product.id,
                                                                val === '' ? null : parseInt(val)
                                                            );
                                                        }}
                                                        className="w-20 p-2 text-center border rounded-lg font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                                                        placeholder="—"
                                                    />
                                                ) : (
                                                    <span className={`font-black text-lg ${item.counted ? 'text-green-600' : 'text-gray-300'}`}>
                                                        {item.physicalCount ?? '—'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-center">
                                                {item.counted && (
                                                    <span className={`font-black text-lg ${item.difference > 0 ? 'text-green-600' :
                                                            item.difference < 0 ? 'text-red-600' :
                                                                'text-gray-400'
                                                        }`}>
                                                        {item.difference > 0 ? '+' : ''}{item.difference}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-center">
                                                {item.counted ? (
                                                    item.difference === 0 ? (
                                                        <span className="inline-flex items-center gap-1 text-green-600 text-xs font-bold">
                                                            <i className="fas fa-check-circle"></i> OK
                                                        </span>
                                                    ) : item.difference > 0 ? (
                                                        <span className="inline-flex items-center gap-1 text-blue-600 text-xs font-bold">
                                                            <i className="fas fa-arrow-up"></i> Sobrante
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-red-600 text-xs font-bold">
                                                            <i className="fas fa-arrow-down"></i> Faltante
                                                        </span>
                                                    )
                                                ) : (
                                                    <span className="text-gray-400 text-xs">
                                                        <i className="fas fa-clock"></i> Pendiente
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {/* Modal de resumen */}
            <Modal
                isOpen={showSummaryModal}
                onClose={() => setShowSummaryModal(false)}
                title="Resumen de Auditoría"
                size="md"
            >
                <div className="space-y-6">
                    {/* Estadísticas */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-blue-50 p-4 rounded-xl text-center">
                            <p className="text-xs uppercase font-bold text-blue-600">Productos Contados</p>
                            <p className="text-3xl font-black text-blue-800">{auditSummary.countedProducts}</p>
                            <p className="text-xs text-blue-600">de {auditSummary.totalProducts}</p>
                        </div>
                        <div className="bg-yellow-50 p-4 rounded-xl text-center">
                            <p className="text-xs uppercase font-bold text-yellow-600">Con Diferencias</p>
                            <p className="text-3xl font-black text-yellow-800">{auditSummary.itemsWithDifference}</p>
                            <p className="text-xs text-yellow-600">productos a ajustar</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-green-50 p-4 rounded-xl">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-green-200 rounded-full flex items-center justify-center">
                                    <i className="fas fa-arrow-up text-green-700"></i>
                                </div>
                                <div>
                                    <p className="text-xs uppercase font-bold text-green-600">Sobrantes</p>
                                    <p className="text-xl font-black text-green-800">+{auditSummary.surplus} unidades</p>
                                </div>
                            </div>
                        </div>
                        <div className="bg-red-50 p-4 rounded-xl">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-red-200 rounded-full flex items-center justify-center">
                                    <i className="fas fa-arrow-down text-red-700"></i>
                                </div>
                                <div>
                                    <p className="text-xs uppercase font-bold text-red-600">Faltantes</p>
                                    <p className="text-xl font-black text-red-800">-{auditSummary.shortage} unidades</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Lista de productos con diferencia */}
                    {auditSummary.itemsWithDifference > 0 && (
                        <div className="border rounded-xl overflow-hidden">
                            <div className="bg-gray-50 p-3 border-b">
                                <p className="font-bold text-gray-700 text-sm">Productos a Ajustar</p>
                            </div>
                            <div className="max-h-48 overflow-y-auto divide-y">
                                {auditItems.filter(i => i.counted && i.difference !== 0).map(item => (
                                    <div key={item.product.id} className="p-3 flex justify-between items-center">
                                        <div>
                                            <p className="font-medium text-gray-800">{item.product.name}</p>
                                            <p className="text-xs text-gray-500">
                                                Sistema: {item.product.stock} → Físico: {item.physicalCount}
                                            </p>
                                        </div>
                                        <span className={`font-black ${item.difference > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {item.difference > 0 ? '+' : ''}{item.difference}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Botones */}
                    <div className="flex gap-3 pt-4 border-t">
                        <Button
                            variant="secondary"
                            onClick={() => setShowSummaryModal(false)}
                            className="flex-1"
                        >
                            Seguir Editando
                        </Button>
                        <Button
                            onClick={saveAuditAdjustments}
                            className="flex-1"
                            icon="save"
                            disabled={isSaving || auditSummary.itemsWithDifference === 0}
                        >
                            {isSaving ? 'Guardando...' : 'Aplicar Ajustes'}
                        </Button>
                    </div>

                    {auditSummary.itemsWithDifference === 0 && (
                        <div className="bg-green-50 p-4 rounded-xl text-center border border-green-200">
                            <i className="fas fa-check-circle text-3xl text-green-500 mb-2"></i>
                            <p className="font-bold text-green-800">¡Perfecto!</p>
                            <p className="text-sm text-green-600">No hay diferencias que ajustar.</p>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
};
