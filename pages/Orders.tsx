
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Sale, Customer, FulfillmentStatus, ShippingDetails, CompanySettings, PaymentDetails, Category } from '../types';
import { Card, Button, Input, Badge, Modal, showToast } from '../components/UIComponents';
import { db } from '../services/storageService';

interface OrdersProps {
    sales: Sale[];
    customers: Customer[];
    categories: Category[];
    settings: CompanySettings | null;
    onUpdate?: () => void;
}

export const Orders: React.FC<OrdersProps> = ({ sales: allSales, customers, categories, settings, onUpdate }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
    const [statusFilter, setStatusFilter] = useState<FulfillmentStatus | 'all'>('all');
    const [dateFilter, setDateFilter] = useState<string>('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    // Filter states
    const [datePreset, setDatePreset] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month'>('all');

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Sale | null>(null);
    const [editForm, setEditForm] = useState<{
        status: FulfillmentStatus;
        shippingCompany: string;
        tracking: string;
        notes: string;
        guideFile: string;
        guideFileType: 'pdf' | 'image' | '';
        guideFileName: string;
        productionImages: string[];
        isLocalDelivery: boolean;
        sharePhone: string;
    }>({ status: 'pending', shippingCompany: '', tracking: '', notes: '', guideFile: '', guideFileType: '', guideFileName: '', productionImages: [], isLocalDelivery: false, sharePhone: '' });

    // Admin Password Modal State
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [pendingRollback, setPendingRollback] = useState<{
        order: Sale,
        newStatus: FulfillmentStatus,
        details?: ShippingDetails
    } | null>(null);

    // Payment Modal State
    const [isPayModalOpen, setIsPayModalOpen] = useState(false);
    const [payMethod, setPayMethod] = useState<'Efectivo' | 'Tarjeta' | 'Transferencia'>('Efectivo');
    const [payDetails, setPayDetails] = useState<any>({});
    const [generateInvoice, setGenerateInvoice] = useState(false);
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);

    // Removal of redundant sync on mount to favor App.tsx unification
    /* 
    useEffect(() => {
        handleManualSync();
    }, []);
    */

    const handleManualSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            const { SupabaseService } = await import('../services/supabaseService');
            const sett = await db.getSettings();
            if (sett.supabaseUrl && sett.supabaseKey) {
                await SupabaseService.syncAll();
                const changed = await SupabaseService.pullDelta();
                if (changed && changed > 0 && onUpdate) {
                    onUpdate();
                }
                showToast("Sincronización completada", "success");
            }
        } catch (e) {
            console.error("❌ Error en sync manual:", e);
            showToast("Fallo al sincronizar", "error");
        } finally {
            setIsSyncing(false);
        }
    };

    // Simplified Order List Filter
    // Include sales that are: (1) not cancelled, AND (2) are orders, have balance, or are in a non-delivered workflow state
    const orderSales = useMemo(() => {
        return allSales.filter(s => {
            // Exclude cancelled/returned sales
            if (s.status === 'cancelled' || s.status === 'returned') return false;

            // Include if explicitly marked as order
            if (s.isOrder === true) return true;

            // Include if has pending balance (partial payment)
            if (s.balance && s.balance > 0) return true;

            // Include if has a fulfillment status that is NOT delivered (workflow in progress)
            if (s.fulfillmentStatus && s.fulfillmentStatus !== 'delivered') return true;

            return false;
        });
    }, [allSales]);

    // Track local changes removed to ensure single source of truth from props
    // const [localOrders, setLocalOrders] = useState<Record<string, Partial<Sale>>>({});

    /*
    const updateOrderInState = (orderId: string, newStatus: FulfillmentStatus, newShippingDetails?: ShippingDetails) => {
        setLocalOrders(prev => ({
            ...prev,
            [orderId]: { fulfillmentStatus: newStatus, shippingDetails: newShippingDetails }
        }));
    };
    */

    const getCustomerName = (order: Sale) => order.customerName || customers.find(c => c.id === order.customerId)?.name || 'Consumidor Final';

    const handleQuickStatusUpdate = async (order: Sale, direction: 'next' | 'prev') => {
        const workflow: FulfillmentStatus[] = ['pending', 'production', 'ready', 'shipped', 'delivered'];
        const currentIndex = workflow.indexOf(order.fulfillmentStatus || 'pending');

        let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

        if (newIndex < 0) newIndex = 0;
        if (newIndex >= workflow.length) newIndex = workflow.length - 1;

        const newStatus = workflow[newIndex];

        if (newStatus !== order.fulfillmentStatus) {
            // Para retroceder, requerir contraseña de administrador
            if (direction === 'prev') {
                setPendingRollback({ order, newStatus });
                setAdminPassword('');
                setIsAdminModalOpen(true);
                return;
            }

            // Validación: requiere guía para avanzar a shipped/delivered (a menos que sea entrega local)
            if (['shipped', 'delivered'].includes(newStatus)) {
                const hasGuide = !!order.shippingDetails?.guideFile;
                const isLocal = !!order.shippingDetails?.isLocalDelivery;

                if (!hasGuide && !isLocal) {
                    showToast('Debes subir una guía de envío o marcar como entrega local', 'warning');
                    handleEditOrder(order);
                    return;
                }
            }

            try {
                console.log(`📤 Cambio rápido: ${order.folio} ${order.fulfillmentStatus} → ${newStatus}`);

                // OPTIMISTIC UI REMOVED: Now relying on database -> onUpdate -> Re-render cycle
                // updateOrderInState(order.id, newStatus);

                await db.updateSaleStatus(order.id, newStatus);

                // BACKGROUND SYNC: Push to cloud (don't await - let it happen in background)
                (async () => {
                    try {
                        if (settings?.supabaseUrl && settings?.supabaseKey) {
                            const { SupabaseService } = await import('../services/supabaseService');
                            await SupabaseService.syncAll();
                            console.log("🔄 Background cloud sync completed");
                        }
                    } catch (err) {
                        console.warn("⚠️ Background sync failed:", err);
                    }
                })();

                showToast(`${order.folio}: ${newStatus}`, 'success');
                if (onUpdate) onUpdate();
            } catch (e: any) {
                // Revert optimistic update on error
                if (onUpdate) onUpdate();
                showToast(e.message || 'Error al actualizar estado', 'error');
            }
        }
    };

    const confirmRollback = async () => {
        if (!pendingRollback || !settings) return;

        if (adminPassword === settings.masterPassword) {
            // OPTIMISTIC UI REMOVED: Now relying on database -> onUpdate -> Re-render cycle
            // updateOrderInState(pendingRollback.order.id, pendingRollback.newStatus, pendingRollback.details);

            await db.updateSaleStatus(pendingRollback.order.id, pendingRollback.newStatus, pendingRollback.details);
            if (onUpdate) onUpdate(); // Re-render UI after status update
            setIsAdminModalOpen(false);
            setPendingRollback(null);
            setAdminPassword('');
            showToast('Estado actualizado correctamente', 'success');
        } else {
            showToast('Contraseña incorrecta', 'error');
        }
    };

    const handleEditOrder = (order: Sale) => {
        setSelectedOrder(order);
        setEditForm({
            status: order.fulfillmentStatus || 'pending',
            shippingCompany: order.shippingDetails?.company || '',
            tracking: order.shippingDetails?.trackingNumber || '',
            notes: order.shippingDetails?.notes || '',
            guideFile: order.shippingDetails?.guideFile || '',
            guideFileType: order.shippingDetails?.guideFileType || '',
            guideFileName: order.shippingDetails?.guideFileName || '',
            productionImages: order.shippingDetails?.productionImages || [],
            isLocalDelivery: order.shippingDetails?.isLocalDelivery || false,
            sharePhone: customers.find(c => c.id === order.customerId)?.phone || ''
        });
        setIsEditModalOpen(true);
    };

    // Handler para subir guía (PDF o imagen)
    const handleGuideUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isPdf = file.type === 'application/pdf';
        const isImage = file.type.startsWith('image/');

        if (!isPdf && !isImage) {
            showToast('Solo se permiten archivos PDF o imágenes (JPG, PNG)', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showToast('El archivo no debe superar 5MB', 'error');
            return;
        }

        try {
            if (isPdf) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    setEditForm(prev => ({
                        ...prev,
                        guideFile: ev.target?.result as string,
                        guideFileType: 'pdf',
                        guideFileName: file.name
                    }));
                };
                reader.readAsDataURL(file);
            } else {
                const compressed = await db.compressImage(file);
                setEditForm(prev => ({
                    ...prev,
                    guideFile: compressed,
                    guideFileType: 'image',
                    guideFileName: file.name
                }));
            }
            showToast('Guía cargada correctamente', 'success');
        } catch (err) {
            showToast('Error al cargar el archivo', 'error');
        }
    };

    // Handler para subir imágenes de producción
    const handleProductionImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const currentCount = editForm.productionImages.length;
        const remaining = 3 - currentCount;

        if (remaining <= 0) {
            showToast('Máximo 3 imágenes de producción', 'warning');
            return;
        }

        const toProcess: File[] = Array.from(files).slice(0, remaining) as File[];
        const newImages: string[] = [];

        for (const file of toProcess) {
            if (!file.type.startsWith('image/')) continue;
            try {
                const compressed = await db.compressImage(file);
                newImages.push(compressed);
            } catch (err) {
                console.error('Error compressing image', err);
            }
        }

        setEditForm(prev => ({
            ...prev,
            productionImages: [...prev.productionImages, ...newImages]
        }));
        showToast(`${newImages.length} imagen(es) agregada(s)`, 'success');
    };

    const removeProductionImage = (index: number) => {
        setEditForm(prev => ({
            ...prev,
            productionImages: prev.productionImages.filter((_, i) => i !== index)
        }));
    };

    const handleSaveUpdate = async () => {
        if (!selectedOrder) return;

        try {
            const isShipping = !!(editForm.shippingCompany || editForm.tracking) && !editForm.isLocalDelivery;
            const details: ShippingDetails = {
                company: editForm.shippingCompany,
                trackingNumber: editForm.tracking,
                notes: editForm.notes,
                method: isShipping ? 'shipping' : 'pickup',
                guideFile: editForm.guideFile || undefined,
                guideFileType: editForm.guideFileType || undefined,
                guideFileName: editForm.guideFileName || undefined,
                productionImages: editForm.productionImages.length > 0 ? editForm.productionImages : undefined,
                isLocalDelivery: editForm.isLocalDelivery
            };

            // Validación: requiere guía para avanzar a shipped/delivered (a menos que sea entrega local)
            if (['shipped', 'delivered'].includes(editForm.status)) {
                if (!editForm.guideFile && !editForm.isLocalDelivery) {
                    showToast('Debes subir una guía de envío o activar "Entrega Local"', 'warning');
                    return;
                }
            }

            // Check for rollback (from delivered or any previous state)
            const workflow: FulfillmentStatus[] = ['pending', 'production', 'ready', 'shipped', 'delivered'];
            const oldIndex = workflow.indexOf(selectedOrder.fulfillmentStatus || 'pending');
            const newIndex = workflow.indexOf(editForm.status);

            if (newIndex < oldIndex) {
                setPendingRollback({ order: selectedOrder, newStatus: editForm.status, details });
                setAdminPassword('');
                setIsAdminModalOpen(true);
                setIsEditModalOpen(false);
                return;
            }

            console.log(`📤 Guardando pedido ${selectedOrder.folio}: ${selectedOrder.fulfillmentStatus} → ${editForm.status}`);
            console.log(`📦 Guía: ${editForm.guideFile ? 'SÍ' : 'NO'}, Local: ${editForm.isLocalDelivery ? 'SÍ' : 'NO'}`);

            // OPTIMISTIC UI REMOVED: Now relying on database -> onUpdate -> Re-render cycle
            // updateOrderInState(selectedOrder.id, editForm.status, details);
            setIsEditModalOpen(false);

            await db.updateSaleStatus(selectedOrder.id, editForm.status, details);
            if (onUpdate) onUpdate(); // Refresh global state

            // BACKGROUND SYNC: Push to cloud (don't await - let it happen in background)
            (async () => {
                try {
                    const settings = await db.getSettings();
                    if (settings.supabaseUrl && settings.supabaseKey) {
                        const { SupabaseService } = await import('../services/supabaseService');
                        await SupabaseService.syncAll();
                        console.log('☁️ Cambio sincronizado con la nube');
                    }
                } catch (syncErr) {
                    console.warn('⚠️ No se pudo sincronizar (se reintentará después):', syncErr);
                }
            })();

            showToast(`Pedido actualizado: ${editForm.status}`, 'success');
        } catch (e: any) {
            console.error('❌ Error guardando pedido:', e);
            if (onUpdate) onUpdate(); // Forced revert to global state
            showToast(e.message || 'Error al actualizar pedido', 'error');
        }
    };

    const handleCompletePayment = async () => {
        if (!selectedOrder) return;
        setIsProcessingPayment(true);
        try {
            const payment: PaymentDetails = {
                cash: payMethod === 'Efectivo' ? selectedOrder.balance : undefined,
                card: payMethod === 'Tarjeta' ? selectedOrder.balance : undefined,
                transfer: payMethod === 'Transferencia' ? selectedOrder.balance : undefined,
                ...payDetails
            };

            await db.completeOrder(selectedOrder.id, payment, generateInvoice ? 'FACTURA' : 'TICKET');

            showToast('Pago completado y documento generado', 'success');
            setIsPayModalOpen(false);
            setIsEditModalOpen(false);
            if (onUpdate) onUpdate();
        } catch (e: any) {
            showToast(e.message || 'Error al completar pago', 'error');
        } finally {
            setIsProcessingPayment(false);
        }
    };

    const timeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d`;
        if (hours > 0) return `${hours}h`;
        return `${minutes}m`;
    };

    // Date preset helper
    const getDateRange = (preset: 'all' | 'today' | 'yesterday' | 'week' | 'month') => {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0];
        const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
        const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];

        switch (preset) {
            case 'today': return { from: today, to: today };
            case 'yesterday': return { from: yesterday, to: yesterday };
            case 'week': return { from: weekAgo, to: today };
            case 'month': return { from: monthAgo, to: today };
            default: return null;
        }
    };

    const filteredOrders = useMemo(() => {
        let result = [...orderSales];

        // Apply filters directly to orderSales which is derived from props
        return result.filter(s => {
            const matchStatus = statusFilter === 'all' ? true : s.fulfillmentStatus === statusFilter;

            let matchDate = true;
            const range = getDateRange(datePreset);
            if (range) {
                const orderDate = s.date.split('T')[0];
                matchDate = orderDate >= range.from && orderDate <= range.to;
            } else if (dateFilter) {
                matchDate = s.date.startsWith(dateFilter);
            }

            const matchCategory = categoryFilter === 'all'
                ? true
                : s.items.some(item => item.categoryId === categoryFilter);

            const customerName = getCustomerName(s);
            const matchSearch =
                (s.folio || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (s.shippingDetails?.trackingNumber || '').toLowerCase().includes(searchTerm.toLowerCase());

            return matchStatus && matchSearch && matchDate && matchCategory;
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [orderSales, searchTerm, statusFilter, customers, categoryFilter, dateFilter, datePreset]);

    const columns: { id: FulfillmentStatus, label: string, color: string, icon: string }[] = [
        { id: 'pending', label: 'Pendientes', color: 'border-yellow-400 bg-yellow-50', icon: 'clock' },
        { id: 'production', label: 'En Producción', color: 'border-blue-400 bg-blue-50', icon: 'tools' },
        { id: 'ready', label: 'Listos / Empaquetado', color: 'border-green-400 bg-green-50', icon: 'box-open' },
        { id: 'shipped', label: 'En Ruta / Enviado', color: 'border-purple-400 bg-purple-50', icon: 'shipping-fast' },
        { id: 'delivered', label: 'Entregados', color: 'border-gray-400 bg-gray-50', icon: 'check-circle' },
    ];

    const getStatusBadge = (status?: FulfillmentStatus) => {
        switch (status) {
            case 'pending': return <Badge variant="warning">Pendiente</Badge>;
            case 'production': return <Badge variant="info">En Producción</Badge>;
            case 'ready': return <Badge variant="success">Listo</Badge>;
            case 'shipped': return <Badge variant="info">Enviado</Badge>;
            case 'delivered': return <Badge variant="default">Entregado</Badge>;
            default: return <Badge>N/A</Badge>;
        }
    };

    const getCardColor = (status?: FulfillmentStatus) => {
        switch (status) {
            case 'pending': return 'bg-yellow-50 border-yellow-200';
            case 'production': return 'bg-blue-50 border-blue-200';
            case 'ready': return 'bg-green-50 border-green-200';
            case 'shipped': return 'bg-purple-50 border-purple-200';
            case 'delivered': return 'bg-gray-100 border-gray-300';
            default: return 'bg-white border-gray-200';
        }
    };

    return (
        <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0 bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <h1 className="text-xl font-black text-gray-800 tracking-tight">Gestión de Pedidos</h1>
                    <div className="bg-gray-100 p-0.5 rounded-lg flex">
                        <button
                            onClick={() => setViewMode('board')}
                            className={`p-1.5 px-2 rounded-md text-xs font-bold transition-all ${viewMode === 'board' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
                            title="Vista Tablero"
                        >
                            <i className="fas fa-columns mr-1"></i> Tablero
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 px-2 rounded-md text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
                            title="Vista Lista"
                        >
                            <i className="fas fa-list mr-1"></i> Lista
                        </button>
                    </div>
                    {isSyncing && (
                        <i className="fas fa-sync-alt text-primary animate-spin-slow text-xs"></i>
                    )}
                </div>

                <div className="flex gap-2 w-full sm:w-auto items-center">
                    <Input icon="search" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="!py-1.5 text-xs w-full sm:w-48" />
                    <Input type="date" value={dateFilter} onChange={e => { setDateFilter(e.target.value); setDatePreset('all'); }} className="!py-1.5 text-xs w-auto" />
                    <button
                        onClick={handleManualSync}
                        disabled={isSyncing}
                        className={`p-2 rounded-lg text-xs font-bold transition-all ${isSyncing ? 'text-primary' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                        title="Sincronizar ahora"
                    >
                        <i className={`fas fa-${isSyncing ? 'sync-alt' : 'cloud-download-alt'}`}></i>
                    </button>
                </div>
            </div>

            {/* === CATEGORY FILTER (COMPACT) === */}
            {categories.length > 0 && (
                <div className="shrink-0 bg-gray-50/50 p-2 rounded-xl border border-gray-100">
                    <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
                        <button
                            onClick={() => setCategoryFilter('all')}
                            className={`shrink-0 px-3 py-1.5 rounded-lg font-bold text-xs transition-all border ${categoryFilter === 'all'
                                ? 'bg-gray-800 text-white border-gray-800 shadow-md'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                                }`}
                        >
                            <i className="fas fa-th-large mr-1.5"></i>Todas
                        </button>
                        {categories.map(cat => {
                            const isSelected = categoryFilter === cat.id;
                            const orderCount = orderSales.filter(s => s.items.some(item => item.categoryId === cat.id)).length;
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => setCategoryFilter(cat.id)}
                                    className={`shrink-0 px-3 py-1.5 rounded-lg font-bold text-xs transition-all border flex items-center gap-1.5 ${isSelected
                                        ? 'text-white shadow-md'
                                        : 'bg-white hover:border-gray-300'
                                        }`}
                                    style={{
                                        backgroundColor: isSelected ? cat.color : undefined,
                                        borderColor: isSelected ? cat.color : '#e5e7eb',
                                        color: isSelected ? 'white' : cat.color
                                    }}
                                >
                                    <i className={`fas fa-${cat.icon || 'tag'}`}></i>
                                    <span>{cat.name}</span>
                                    <span className={`text-[10px] px-1 rounded font-black ${isSelected ? 'bg-white/30' : 'bg-gray-100 text-gray-500'}`}>
                                        {orderCount}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* === DATE QUICK FILTERS (TIGHTER) === */}
            <div className="flex gap-1.5 shrink-0 overflow-x-auto px-1">
                {[
                    { id: 'all' as const, label: 'Todo', icon: 'infinity' },
                    { id: 'today' as const, label: 'Hoy', icon: 'calendar-day' },
                    { id: 'yesterday' as const, label: 'Ayer', icon: 'calendar-minus' },
                    { id: 'week' as const, label: 'Esta Semana', icon: 'calendar-week' },
                    { id: 'month' as const, label: 'Este Mes', icon: 'calendar' },
                ].map(preset => (
                    <button
                        key={preset.id}
                        onClick={() => { setDatePreset(preset.id); setDateFilter(''); }}
                        className={`whitespace-nowrap px-2.5 py-1 rounded-lg font-bold text-[10px] uppercase tracking-tighter transition-all flex items-center gap-1 ${datePreset === preset.id
                            ? 'bg-primary text-white shadow-sm'
                            : 'bg-white text-gray-500 border border-gray-100 hover:border-gray-300'
                            }`}
                    >
                        <i className={`fas fa-${preset.icon} text-[8px]`}></i>
                        {preset.label}
                    </button>
                ))}
            </div>

            {viewMode === 'list' && (
                <div className="flex gap-2 shrink-0 overflow-x-auto pb-2">
                    <button onClick={() => setStatusFilter('all')} className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold text-sm ${statusFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600'}`}>Todos</button>
                    <button onClick={() => setStatusFilter('pending')} className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold text-sm ${statusFilter === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-white text-gray-600'}`}>Pendientes</button>
                    <button onClick={() => setStatusFilter('production')} className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold text-sm ${statusFilter === 'production' ? 'bg-blue-100 text-blue-800' : 'bg-white text-gray-600'}`}>Producción</button>
                    <button onClick={() => setStatusFilter('delivered')} className={`whitespace-nowrap px-4 py-2 rounded-lg font-bold text-sm ${statusFilter === 'delivered' ? 'bg-gray-200 text-gray-800' : 'bg-white text-gray-600'}`}>Entregados</button>
                </div>
            )}

            {viewMode === 'board' && (
                <div className="flex-1 overflow-x-auto overflow-y-hidden">
                    <div className="flex gap-4 h-full min-w-[1000px]">
                        {columns.map(col => {
                            const colOrders = filteredOrders.filter(o => (o.fulfillmentStatus || 'pending') === col.id);
                            return (
                                <div key={col.id} className="flex-1 flex flex-col min-w-[260px] h-full">
                                    <div className={`p-2 rounded-t-lg border-t-2 ${col.color} flex justify-between items-center shadow-sm mb-1.5 shrink-0`}>
                                        <div className="font-bold text-gray-700 flex items-center gap-2">
                                            <i className={`fas fa-${col.icon}`}></i> {col.label}
                                        </div>
                                        <span className="bg-white/50 px-2 py-0.5 rounded text-xs font-black">{colOrders.length}</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto space-y-1 p-0.5 pb-10 scrollbar-thin">
                                        {colOrders.map(order => {
                                            // Get unique categories for this order
                                            const orderCategories = [...new Set(order.items.map(item => item.categoryId))];
                                            const orderCatDetails = orderCategories.map(catId => categories.find(c => c.id === catId)).filter(Boolean);

                                            return (
                                                <div
                                                    key={order.id}
                                                    onClick={() => handleEditOrder(order)}
                                                    className={`p-3 rounded-2xl border shadow-sm hover:shadow-md transition-all cursor-pointer relative group flex flex-col h-fit ${getCardColor(order.fulfillmentStatus)} animate-scale-in`}
                                                >
                                                    {/* Category Indicators at top */}
                                                    {orderCatDetails.length > 0 && (
                                                        <div className="flex gap-1 mb-2 flex-wrap">
                                                            {orderCatDetails.map((cat: any) => (
                                                                <span
                                                                    key={cat.id}
                                                                    className="inline-flex items-center px-1.5 py-0.5 rounded-lg text-[8px] font-black text-white uppercase shadow-sm"
                                                                    style={{ backgroundColor: cat.color }}
                                                                >
                                                                    <i className={`fas fa-${cat.icon || 'tag'} mr-1`}></i>
                                                                    {cat.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <div className="flex justify-between items-start mb-1.5">
                                                        <span className="font-mono font-black text-xs text-gray-400 bg-white/60 px-1.5 py-0.5 rounded-lg">{order.folio}</span>
                                                        <div className="flex items-center gap-1.5 text-gray-500">
                                                            {order.shippingDetails?.isLocalDelivery && <span className="bg-green-100 text-green-700 text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full">L</span>}
                                                            {order.shippingDetails?.guideFile && <i className="fas fa-file-alt text-sky-500 text-xs"></i>}
                                                            <div className="text-[10px] font-bold">
                                                                <i className="far fa-clock mr-1"></i>{timeAgo(order.date)}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-between items-center mb-1">
                                                        <h4 className="font-black text-xs text-gray-800 uppercase leading-none truncate flex-1">{getCustomerName(order)}</h4>
                                                        {customers.find(c => c.id === order.customerId)?.phone && (
                                                            <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1">
                                                                <i className="fab fa-whatsapp text-green-500"></i>
                                                                {customers.find(c => c.id === order.customerId)?.phone}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="mb-3 space-y-0.5">
                                                        {order.items.slice(0, 3).map((item, idx) => (
                                                            <div key={idx} className="text-[10px] text-gray-600 line-clamp-1 flex items-center gap-1">
                                                                <span className="font-black text-gray-300">{item.quantity}x</span> {item.name}
                                                            </div>
                                                        ))}
                                                        {order.items.length > 3 && <p className="text-[9px] text-gray-400 font-bold italic">+{order.items.length - 3} más...</p>}
                                                    </div>

                                                    <div className="flex justify-between items-center bg-white/40 p-2 rounded-xl mt-auto">
                                                        <div>
                                                            <p className="text-[9px] text-gray-400 font-black uppercase leading-none">Saldo</p>
                                                            <p className={`text-sm font-black ${(order.balance || 0) > 0 ? 'text-red-500' : 'text-green-600'}`}>
                                                                L {(order.balance || 0).toFixed(2)}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleQuickStatusUpdate(order, 'prev'); }}
                                                                disabled={col.id === 'pending'}
                                                                className="w-6 h-6 rounded-full bg-white/80 text-gray-400 shadow-sm hover:text-primary disabled:opacity-20 flex items-center justify-center"
                                                            >
                                                                <i className="fas fa-chevron-left text-[10px]"></i>
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleQuickStatusUpdate(order, 'next'); }}
                                                                disabled={col.id === 'delivered'}
                                                                className="w-6 h-6 rounded-full bg-primary text-white shadow-md hover:scale-110 active:scale-95 transition-all disabled:opacity-20 flex items-center justify-center"
                                                            >
                                                                <i className="fas fa-chevron-right text-[10px]"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {colOrders.length === 0 && (
                                            <div className="text-center py-10 text-gray-300 border-2 border-dashed border-gray-100 rounded-xl">
                                                <p className="text-xs">Sin pedidos</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {viewMode === 'list' && (
                <div className="flex-1 overflow-y-auto">
                    <div className="grid grid-cols-1 gap-3">
                        {filteredOrders.map(order => {
                            // Get unique categories for this order
                            const orderCategories = [...new Set(order.items.map(item => item.categoryId))];
                            const orderCatDetails = orderCategories.map(catId => categories.find(c => c.id === catId)).filter(Boolean);

                            return (
                                <Card key={order.id} className="hover:shadow-md transition-shadow" noPadding>
                                    <div className="p-4 flex flex-col md:flex-row items-start md:items-center gap-4">
                                        <div className="flex-1">
                                            {/* Category badges */}
                                            {orderCatDetails.length > 0 && (
                                                <div className="flex gap-1.5 mb-2 flex-wrap">
                                                    {orderCatDetails.map((cat: any) => (
                                                        <span
                                                            key={cat.id}
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold text-white shadow-sm"
                                                            style={{ backgroundColor: cat.color }}
                                                        >
                                                            <i className={`fas fa-${cat.icon || 'tag'}`}></i>
                                                            {cat.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className="font-mono font-bold text-gray-700">{order.folio}</span>
                                                {getStatusBadge(order.fulfillmentStatus)}
                                                <span className="text-xs text-gray-400">{new Date(order.date).toLocaleString()}</span>
                                            </div>
                                            <div className="font-bold text-lg text-gray-900 flex items-center gap-3">
                                                {getCustomerName(order)}
                                                {customers.find(c => c.id === order.customerId)?.phone && (
                                                    <span className="text-xs font-bold text-gray-400 flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-full">
                                                        <i className="fab fa-whatsapp text-green-500"></i>
                                                        {customers.find(c => c.id === order.customerId)?.phone}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-sm text-gray-500 mt-1">{order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}</div>
                                        </div>

                                        {order.shippingDetails?.trackingNumber && (
                                            <div className="text-right px-4 border-l border-gray-100 hidden md:block">
                                                <p className="text-[10px] text-gray-400 uppercase font-bold">Tracking</p>
                                                <p className="font-mono font-bold text-purple-600">{order.shippingDetails.company}</p>
                                                <p className="text-xs bg-gray-100 px-1 rounded">{order.shippingDetails.trackingNumber}</p>
                                            </div>
                                        )}

                                        <div className="flex gap-2 items-center w-full md:w-auto mt-2 md:mt-0">
                                            {/* Quick Deliver Checkbox */}
                                            <label className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all ${order.fulfillmentStatus === 'delivered' ? 'bg-green-100 text-green-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={order.fulfillmentStatus === 'delivered'}
                                                    onChange={async () => {
                                                        const newStatus = order.fulfillmentStatus === 'delivered' ? 'shipped' : 'delivered';

                                                        if (order.fulfillmentStatus === 'delivered') {
                                                            // Require password to un-check delivered
                                                            setPendingRollback({ order, newStatus });
                                                            setAdminPassword('');
                                                            setIsAdminModalOpen(true);
                                                            return;
                                                        }

                                                        try {
                                                            await db.updateSaleStatus(order.id, newStatus);
                                                            if (onUpdate) onUpdate();
                                                        } catch (e: any) {
                                                            showToast(e.message || 'Error al actualizar estado', 'error');
                                                            if (onUpdate) onUpdate();
                                                        }
                                                    }}
                                                    className="w-4 h-4 accent-green-600"
                                                />
                                                <span className="text-xs font-bold">Entregado</span>
                                            </label>
                                            <Button size="sm" variant="secondary" className="flex-1 md:flex-none" onClick={() => handleEditOrder(order)}>Gestionar</Button>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                        {filteredOrders.length === 0 && (
                            <div className="text-center py-12 text-gray-400">
                                <i className="fas fa-box-open text-4xl mb-3 opacity-50"></i>
                                <p>No se encontraron pedidos.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={`Gestionar Pedido ${selectedOrder?.folio}`}>
                <div className="space-y-5">
                    <div className="bg-gray-50 p-4 rounded-xl text-sm border border-gray-100 flex flex-col md:flex-row justify-between gap-4">
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-gray-500 flex items-center gap-1"><i className="fas fa-shopping-basket text-[10px]"></i> Items:</p>
                                {customers.find(c => c.id === selectedOrder?.customerId)?.phone && (
                                    <a
                                        href={`https://wa.me/${(customers.find(c => c.id === selectedOrder?.customerId)?.phone || '').replace(/\D/g, '')}`}
                                        target="_blank"
                                        className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg flex items-center gap-1 hover:bg-green-100 transition-colors"
                                    >
                                        <i className="fab fa-whatsapp"></i>
                                        {customers.find(c => c.id === selectedOrder?.customerId)?.phone}
                                    </a>
                                )}
                            </div>
                            <ul className="list-disc pl-4 font-medium text-gray-800 space-y-1">
                                {selectedOrder?.items.map((item, idx) => (
                                    <li key={idx} className="leading-tight">{item.quantity} x {item.name} {item.notes && <span className="text-gray-500 italic">({item.notes})</span>}</li>
                                ))}
                            </ul>
                        </div>
                        <div className="md:border-l md:pl-4 border-gray-200 min-w-[140px]">
                            <p className="text-gray-500 mb-1 flex items-center gap-1"><i className="far fa-calendar-alt text-[10px]"></i> Creado:</p>
                            <p className="font-bold text-gray-800 leading-tight">
                                {selectedOrder?.createdAt ? new Date(selectedOrder.createdAt).toLocaleString() : new Date(selectedOrder?.date || '').toLocaleString()}
                            </p>
                            <div className="mt-2 inline-block px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] font-black uppercase tracking-wider">
                                {timeAgo(selectedOrder?.date || '')} de antigüedad
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Estado del Proceso</label>
                        <div className="grid grid-cols-1 gap-2">
                            <select
                                className="w-full p-3 rounded-xl border border-gray-300 bg-white font-bold outline-none focus:ring-2 focus:ring-primary/50"
                                value={editForm.status}
                                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                            >
                                <option value="pending">🟡 Pendiente (En Cola)</option>
                                <option value="production">🔵 En Producción / Taller</option>
                                <option value="ready">🟢 Listo / Empaquetado</option>
                                <option value="shipped">🚚 Enviado (En Ruta)</option>
                                <option value="delivered">🏁 Entregado (Finalizado)</option>
                            </select>
                        </div>
                    </div>

                    {/* NUEVO: Historial de Estados */}
                    <div className="px-1">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <i className="fas fa-history"></i> Línea de Tiempo del Pedido
                        </h4>
                        <div className="space-y-2 relative before:content-[''] before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-100">
                            {selectedOrder?.fulfillmentHistory && selectedOrder.fulfillmentHistory.length > 0 ? (
                                selectedOrder.fulfillmentHistory.slice().reverse().map((entry, idx) => (
                                    <div key={idx} className="relative pl-6 flex justify-between items-center group">
                                        <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-sm flex items-center justify-center z-10 transition-colors ${entry.status === 'delivered' ? 'bg-green-500' :
                                            entry.status === 'shipped' ? 'bg-purple-500' :
                                                entry.status === 'ready' ? 'bg-green-400' :
                                                    entry.status === 'production' ? 'bg-blue-500' : 'bg-yellow-500'
                                            }`}>
                                            <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                                        </div>
                                        <div className="flex-1">
                                            <span className="text-xs font-bold text-gray-700 capitalize">{entry.status.replace('_', ' ')}</span>
                                            <span className="text-[9px] text-gray-400 ml-2">{new Date(entry.date).toLocaleString()}</span>
                                        </div>
                                        {idx === 0 && <Badge variant="default" className="text-[8px] py-0 h-4">Actual</Badge>}
                                    </div>
                                ))
                            ) : (
                                <div className="relative pl-6 flex justify-between items-center group">
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-sm flex items-center justify-center z-10 bg-yellow-500">
                                        <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                                    </div>
                                    <div className="flex-1">
                                        <span className="text-xs font-bold text-gray-700 capitalize">Creado (Estado Inicial)</span>
                                        <span className="text-[9px] text-gray-400 ml-2">{new Date(selectedOrder?.date || '').toLocaleString()}</span>
                                    </div>
                                    <Badge variant="default" className="text-[8px] py-0 h-4">Origen</Badge>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 space-y-3">
                        <h4 className="font-bold text-purple-900 text-sm uppercase flex items-center gap-2">
                            <i className="fas fa-truck"></i> Datos de Envío
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                            <Input label="Empresa de Envío" placeholder="Ej: Cargo Expreso" value={editForm.shippingCompany} onChange={e => setEditForm({ ...editForm, shippingCompany: e.target.value })} style={{ background: 'white' }} disabled={editForm.isLocalDelivery} />
                            <Input label="No. de Guía / Tracking" placeholder="Ej: 12345678" value={editForm.tracking} onChange={e => setEditForm({ ...editForm, tracking: e.target.value })} style={{ background: 'white' }} disabled={editForm.isLocalDelivery} />
                        </div>

                        {/* Toggle Entrega Local */}
                        <div className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${editForm.isLocalDelivery ? 'bg-green-100 border-green-400' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-center gap-3">
                                <i className={`fas fa-${editForm.isLocalDelivery ? 'store' : 'shipping-fast'} text-xl ${editForm.isLocalDelivery ? 'text-green-600' : 'text-gray-400'}`}></i>
                                <div>
                                    <p className={`font-bold text-sm ${editForm.isLocalDelivery ? 'text-green-800' : 'text-gray-700'}`}>Entrega Local</p>
                                    <p className="text-[10px] text-gray-500">El cliente recoge en tienda (no requiere guía)</p>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={editForm.isLocalDelivery}
                                    onChange={e => setEditForm({ ...editForm, isLocalDelivery: e.target.checked })}
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                            </label>
                        </div>
                    </div>

                    {/* Sección de Guía de Envío (PDF o Imagen) */}
                    {['ready', 'shipped', 'delivered'].includes(editForm.status) && (
                        <div className="bg-sky-50 p-4 rounded-xl border border-sky-100 space-y-3">
                            <h4 className="font-bold text-sky-900 text-sm uppercase flex items-center gap-2">
                                <i className="fas fa-file-alt"></i> Guía de Envío
                            </h4>

                            {/* WhatsApp Share Action */}
                            {editForm.tracking && (
                                <div className="flex items-center gap-2 bg-white p-3 rounded-xl border border-sky-200 shadow-sm">
                                    <div className="flex-1">
                                        <p className="text-[10px] font-bold text-sky-600 uppercase">Compartir con Cliente</p>
                                        <p className="text-xs text-gray-500">Enviar guía por WhatsApp</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Teléfono"
                                            value={editForm.sharePhone}
                                            className="!py-1 !text-xs w-28"
                                            onChange={(e) => setEditForm({ ...editForm, sharePhone: e.target.value })}
                                        />
                                        <Button
                                            size="sm"
                                            variant="success"
                                            icon="whatsapp"
                                            onClick={() => {
                                                const cleanPhone = editForm.sharePhone.replace(/\D/g, '');
                                                const message = `👋 Hola *${selectedOrder?.customerName}*, te compartimos los datos de tu envío:\n\n` +
                                                    `📦 *Empresa:* ${editForm.shippingCompany}\n` +
                                                    `🆔 *Guía/Tracking:* ${editForm.tracking}\n` +
                                                    `📑 *Pedido:* ${selectedOrder?.folio}\n\n` +
                                                    `_Tu pedido está en camino. ¡Gracias por tu compra!_`;
                                                window.open(`https://wa.me/${cleanPhone.length > 8 ? cleanPhone : '504' + cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
                                            }}
                                        >
                                            Enviar
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {editForm.guideFile ? (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-sky-200">
                                        <div className="flex items-center gap-2">
                                            <i className={`fas fa-${editForm.guideFileType === 'pdf' ? 'file-pdf text-red-500' : 'image text-blue-500'} text-xl`}></i>
                                            <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]">{editForm.guideFileName || 'Guía cargada'}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            {editForm.guideFileType === 'pdf' ? (
                                                <a
                                                    href={editForm.guideFile}
                                                    download={editForm.guideFileName || 'guia.pdf'}
                                                    className="text-xs bg-sky-100 text-sky-700 px-2 py-1 rounded font-bold hover:bg-sky-200 transition-colors"
                                                >
                                                    <i className="fas fa-download mr-1"></i>Descargar
                                                </a>
                                            ) : (
                                                <button
                                                    onClick={() => window.open(editForm.guideFile, '_blank')}
                                                    className="text-xs bg-sky-100 text-sky-700 px-2 py-1 rounded font-bold hover:bg-sky-200 transition-colors"
                                                >
                                                    <i className="fas fa-eye mr-1"></i>Ver
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setEditForm({ ...editForm, guideFile: '', guideFileType: '', guideFileName: '' })}
                                                className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded font-bold hover:bg-red-200 transition-colors"
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                    {editForm.guideFileType === 'image' && (
                                        <img src={editForm.guideFile} alt="Guía" className="w-full max-h-48 object-contain rounded-lg border border-sky-200" />
                                    )}
                                </div>
                            ) : (
                                <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-sky-300 rounded-xl cursor-pointer hover:bg-sky-100 transition-colors">
                                    <i className="fas fa-cloud-upload-alt text-2xl text-sky-400 mb-2"></i>
                                    <span className="text-sm text-sky-700 font-medium">Click para subir guía</span>
                                    <span className="text-[10px] text-sky-500">PDF o Imagen (JPG, PNG) • Máx 5MB</span>
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept=".pdf,image/*"
                                        onChange={handleGuideUpload}
                                    />
                                </label>
                            )}
                        </div>
                    )}

                    {/* Sección de Imágenes de Producción */}
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 space-y-3">
                        <h4 className="font-bold text-amber-900 text-sm uppercase flex items-center gap-2">
                            <i className="fas fa-images"></i> Imágenes de Producción
                            <span className="text-[10px] font-normal text-amber-600 ml-auto">{editForm.productionImages.length}/3</span>
                        </h4>

                        <div className="grid grid-cols-3 gap-2">
                            {editForm.productionImages.map((img, idx) => (
                                <div key={idx} className="relative group">
                                    <img src={img} alt={`Producción ${idx + 1}`} className="w-full h-20 object-cover rounded-lg border border-amber-200" />
                                    <button
                                        onClick={() => removeProductionImage(idx)}
                                        className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                    >
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>
                            ))}

                            {editForm.productionImages.length < 3 && (
                                <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-amber-300 rounded-lg cursor-pointer hover:bg-amber-100 transition-colors">
                                    <i className="fas fa-plus text-amber-400"></i>
                                    <span className="text-[9px] text-amber-600 mt-1">Agregar</span>
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        multiple
                                        onChange={handleProductionImageUpload}
                                    />
                                </label>
                            )}
                        </div>
                        <p className="text-[10px] text-amber-600">Sube imágenes de referencia para producción (bocetos, inspiración, etc.)</p>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Notas Internas / Producción</label>
                        <textarea
                            className="w-full p-3 rounded-xl border border-gray-300 bg-white h-24 text-sm outline-none focus:border-primary font-medium"
                            placeholder="Ej: Cliente solicitó envoltorio azul, entregar después de las 5pm..."
                            value={editForm.notes}
                            onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                        ></textarea>
                    </div>

                    {/* Payment Status Section */}
                    {selectedOrder && (
                        <div className={`p-4 rounded-xl border ${selectedOrder.balance && selectedOrder.balance > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                            <h4 className={`font-bold text-sm mb-3 flex items-center gap-2 ${selectedOrder.balance && selectedOrder.balance > 0 ? 'text-amber-800' : 'text-green-800'}`}>
                                <i className={`fas fa-${selectedOrder.balance && selectedOrder.balance > 0 ? 'exclamation-circle' : 'check-circle'}`}></i>
                                Estado de Cuenta
                            </h4>

                            <div className="grid grid-cols-3 gap-2 mb-4">
                                <div className="bg-white/60 p-2 rounded-lg">
                                    <p className="text-[10px] uppercase font-bold text-gray-500">Total</p>
                                    <p className="font-bold text-gray-800">L {selectedOrder.total.toFixed(2)}</p>
                                </div>
                                <div className="bg-white/60 p-2 rounded-lg">
                                    <p className="text-[10px] uppercase font-bold text-gray-500">Pagado</p>
                                    <p className="font-bold text-gray-800">L {(selectedOrder.deposit || (selectedOrder.total - (selectedOrder.balance || 0))).toFixed(2)}</p>
                                </div>
                                <div className="bg-white/60 p-2 rounded-lg">
                                    <p className="text-[10px] uppercase font-bold text-gray-500">Pendiente</p>
                                    <p className={`font-black ${selectedOrder.balance && selectedOrder.balance > 0 ? 'text-red-500' : 'text-green-600'}`}>
                                        L {(selectedOrder.balance || 0).toFixed(2)}
                                    </p>
                                </div>
                            </div>

                            {selectedOrder.balance && selectedOrder.balance > 0 ? (
                                <Button
                                    className="w-full"
                                    variant="primary"
                                    onClick={() => setIsPayModalOpen(true)}
                                >
                                    <i className="fas fa-cash-register mr-2"></i> Pagar Saldo y Facturar
                                </Button>
                            ) : (
                                selectedOrder.documentType !== 'FACTURA' && (
                                    <div className="text-center text-xs text-green-700 font-bold">
                                        Venta completada (Ticket {selectedOrder.folio})
                                    </div>
                                )
                            )}
                        </div>
                    )}

                    {selectedOrder && selectedOrder.documentType === 'FACTURA' && (
                        <div className="bg-green-50 p-3 rounded-xl border border-green-200 flex items-center gap-2">
                            <i className="fas fa-check-circle text-green-600"></i>
                            <span className="font-bold text-green-800 text-sm">Pedido Facturado - {selectedOrder.folio}</span>
                        </div>
                    )}

                    <div className="flex justify-end pt-2 gap-2">
                        <Button onClick={handleSaveUpdate} variant="primary" size="lg" icon="save" className="w-full sm:w-auto">Guardar Cambios</Button>
                    </div>
                </div>
            </Modal>

            {/* Admin Password Modal for Rollback */}
            <Modal isOpen={isAdminModalOpen} onClose={() => { setIsAdminModalOpen(false); setPendingRollback(null); }} title="Autorización Requerida" size="sm">
                <div className="space-y-4">
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-center">
                        <i className="fas fa-lock text-3xl text-amber-600 mb-2"></i>
                        <p className="text-sm text-amber-800 font-bold">
                            Retroceder el estado del pedido requiere autorización de un administrador.
                        </p>
                    </div>

                    <Input
                        label="Contraseña Maestra"
                        type="password"
                        placeholder="Ingrese contraseña de admin"
                        value={adminPassword}
                        onChange={e => setAdminPassword(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmRollback(); }}
                    />

                    <div className="flex gap-2 pt-2">
                        <Button variant="secondary" onClick={() => { setIsAdminModalOpen(false); setPendingRollback(null); }} className="flex-1">
                            Cancelar
                        </Button>
                        <Button onClick={confirmRollback} className="flex-1" icon="unlock">
                            Autorizar
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* PAYMENT MODAL */}
            <Modal isOpen={isPayModalOpen} onClose={() => setIsPayModalOpen(false)} title="Completar Pago Saldo">
                <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 text-center">
                        <p className="text-sm text-blue-800">Saldo Pendiente a Pagar</p>
                        <p className="text-3xl font-black text-blue-600">L {selectedOrder?.balance?.toFixed(2)}</p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Método de Pago</label>
                        <div className="grid grid-cols-3 gap-2">
                            {['Efectivo', 'Tarjeta', 'Transferencia'].map(m => (
                                <button
                                    key={m}
                                    onClick={() => setPayMethod(m as any)}
                                    className={`py-3 px-2 rounded-xl text-xs font-bold border-2 transition-all ${payMethod === m ? 'border-primary bg-primary/5 text-primary' : 'border-gray-100 text-gray-500'}`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    {payMethod === 'Tarjeta' && (
                        <Input label="Referencia / Voucher" placeholder="Calculado automáticamente" value={payDetails.cardRef || ''} onChange={e => setPayDetails({ ...payDetails, cardRef: e.target.value })} />
                    )}
                    {payMethod === 'Transferencia' && (
                        <div className="grid grid-cols-2 gap-2">
                            <Input label="Banco" value={payDetails.bank || ''} onChange={e => setPayDetails({ ...payDetails, bank: e.target.value })} />
                            <Input label="Referencia" value={payDetails.transferRef || ''} onChange={e => setPayDetails({ ...payDetails, transferRef: e.target.value })} />
                        </div>
                    )}

                    <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <input
                            type="checkbox"
                            checked={generateInvoice}
                            onChange={e => setGenerateInvoice(e.target.checked)}
                            className="w-5 h-5 accent-primary"
                        />
                        <div>
                            <p className="font-bold text-sm text-gray-800">Generar Factura CAI</p>
                            <p className="text-xs text-gray-500">Convierte el documento a Factura válida</p>
                        </div>
                    </div>

                    <Button onClick={handleCompletePayment} className="w-full h-12" disabled={isProcessingPayment}>
                        {isProcessingPayment ? <i className="fas fa-spinner fa-spin"></i> : 'Confirmar Pago y Finalizar'}
                    </Button>
                </div>
            </Modal>
        </div>
    );
};
