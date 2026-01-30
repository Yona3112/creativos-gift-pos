
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Sale, Customer, FulfillmentStatus, ShippingDetails, CompanySettings, PaymentDetails } from '../types';
import { Card, Button, Input, Badge, Modal, showToast } from '../components/UIComponents';
import { db } from '../services/storageService';

interface OrdersProps {
    onUpdate?: () => void;
}

export const Orders: React.FC<OrdersProps> = ({ onUpdate }) => {
    const [sales, setSales] = useState<Sale[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [settings, setSettings] = useState<CompanySettings | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
    const [statusFilter, setStatusFilter] = useState<FulfillmentStatus | 'all'>('all');
    const [dateFilter, setDateFilter] = useState('');
    const [lastSync, setLastSync] = useState<string>('');
    const [isSyncing, setIsSyncing] = useState(false);

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
    }>({ status: 'pending', shippingCompany: '', tracking: '', notes: '', guideFile: '', guideFileType: '', guideFileName: '', productionImages: [], isLocalDelivery: false });

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
    const [generateInvoice, setGenerateInvoice] = useState(false); // Default to Ticket (non-fiscal)
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);

    // Polling ref to track if component is mounted
    const isMounted = useRef(true);

    useEffect(() => {
        refresh();
        return () => { isMounted.current = false; };
    }, []);

    // Polling: Auto-refresh orders every 30 seconds from Supabase
    // IMPORTANT: This polling ONLY adds NEW orders, it does NOT overwrite local status changes
    useEffect(() => {
        let pollInterval: any = null;

        const pollFromCloud = async () => {
            // GUARD: Don't poll while user is editing an order - prevents losing unsaved changes
            if (isEditModalOpen || isAdminModalOpen || isPayModalOpen) {
                console.log("⏸️ Polling pausado - modal abierto");
                return;
            }

            // OPTIMIZATION: Don't poll if the tab is not visible (minimized or in background)
            if (document.visibilityState !== 'visible') {
                return;
            }

            try {
                const currentSettings = await db.getSettings();
                // Only need Supabase configured, no autoSync flag required
                if (!currentSettings?.supabaseUrl || !currentSettings?.supabaseKey) {
                    return; // Skip polling if Supabase not configured
                }

                const { SupabaseService } = await import('../services/supabaseService');
                const client = await SupabaseService.getClient();
                if (!client) return;

                // REDUCED SCOPE: Only 7 days to minimize query time
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - 7);
                const cutoffStr = cutoff.toISOString();

                // SIMPLIFIED QUERY: Just fetch recent sales to avoid Supabase timeout
                // The .or() query was causing 500 errors on free tier
                const { data: cloudSales, error } = await client
                    .from('sales')
                    .select('*')
                    .gte('date', cutoffStr)
                    .order('date', { ascending: false })
                    .limit(50);
                if (error) {
                    console.warn("⚠️ Polling error:", error.message);
                    return;
                }

                if (cloudSales && isMounted.current) {
                    let hasChanges = false;

                    // Get fresh local sales
                    const localSales = await db.getSales();
                    console.log(`🔍 Polling: ${cloudSales.length} ventas en nube, ${localSales.length} locales`);

                    for (const cloudSale of cloudSales) {
                        const localSale = localSales.find(s => s.id === cloudSale.id);

                        if (!localSale) {
                            // NEW ORDER from cloud - insert it locally
                            await db.insertSaleFromCloud(cloudSale);
                            hasChanges = true;
                            console.log("📥 Nuevo pedido descargado:", cloudSale.folio);
                        } else {
                            // AGGRESSIVE SYNC: Update if:
                            // 1. Cloud has updatedAt and it's newer than local
                            // 2. OR Cloud has updatedAt but local doesn't (cloud was updated after column was added)
                            // 3. OR fulfillmentStatus is different (status changed on another device)
                            const cloudTime = cloudSale.updatedAt ? new Date(cloudSale.updatedAt).getTime() : 0;
                            const localTime = localSale.updatedAt ? new Date(localSale.updatedAt).getTime() : 0;
                            const statusDifferent = cloudSale.fulfillmentStatus !== localSale.fulfillmentStatus;

                            const shouldUpdate =
                                (cloudTime > localTime) ||  // Cloud is newer
                                (cloudTime > 0 && localTime === 0) ||  // Cloud has timestamp, local doesn't
                                (statusDifferent && cloudTime >= localTime);  // Status different and cloud is same age or newer

                            if (shouldUpdate) {
                                await db.insertSaleFromCloud(cloudSale);
                                hasChanges = true;
                                console.log(`☁️ Actualizado automáticamente: ${cloudSale.folio} (${localSale.fulfillmentStatus || 'pending'} → ${cloudSale.fulfillmentStatus || 'pending'})`);
                            }
                        }
                    }

                    // Refresh UI if there were changes
                    if (hasChanges && isMounted.current) {
                        await refresh();
                        console.log("🔄 UI actualizada con cambios de la nube");
                    }
                    setLastSync(new Date().toLocaleTimeString());
                }
            } catch (e) {
                console.warn("⚠️ Polling exception:", e);
            }
        };

        // Start polling immediately and then every 30 seconds (reduced from 10s)
        pollFromCloud();
        pollInterval = setInterval(pollFromCloud, 30000);

        return () => {
            if (pollInterval) clearInterval(pollInterval);
        };

    }, []); // Empty dependency array: run once on mount

    const handleManualSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            console.log("🔄 Iniciando sincronización manual...");
            const { SupabaseService } = await import('../services/supabaseService');
            const sett = await db.getSettings();
            if (sett.supabaseUrl && sett.supabaseKey) {
                // STEP 1: Push local changes to cloud
                await SupabaseService.syncAll();
                console.log("☁️ Datos locales subidos");

                // STEP 2: Pull ALL sales from cloud and merge with local
                const client = await SupabaseService.getClient();
                if (client) {
                    const cutoff = new Date();
                    cutoff.setDate(cutoff.getDate() - 30); // Wider window for manual sync
                    const cutoffStr = cutoff.toISOString();

                    // SIMPLIFIED QUERY: Avoid complex .or() that causes timeouts
                    const { data: cloudSales, error } = await client
                        .from('sales')
                        .select('*')
                        .gte('date', cutoffStr)
                        .order('date', { ascending: false })
                        .limit(300);

                    if (!error && cloudSales) {
                        const localSales = await db.getSales();
                        let syncedCount = 0;

                        for (const cloudSale of cloudSales) {
                            const localSale = localSales.find(s => s.id === cloudSale.id);

                            if (!localSale) {
                                await db.insertSaleFromCloud(cloudSale);
                                syncedCount++;
                                console.log(`📥 Nuevo: ${cloudSale.folio}`);
                            } else {
                                const cloudTime = cloudSale.updatedAt ? new Date(cloudSale.updatedAt).getTime() : 0;
                                const localTime = localSale.updatedAt ? new Date(localSale.updatedAt).getTime() : 0;

                                if (cloudTime > localTime) {
                                    await db.insertSaleFromCloud(cloudSale);
                                    syncedCount++;
                                    console.log(`☁️ Actualizado: ${cloudSale.folio}`);
                                }
                            }
                        }
                        console.log(`📊 Total sincronizados: ${syncedCount} pedidos`);
                    }
                }

                await refresh();
                showToast("Sincronización completada", "success");
            } else {
                showToast("Supabase no configurado", "warning");
            }
        } catch (e) {
            console.error("❌ Error en sync manual:", e);
            showToast("Fallo al sincronizar", "error");
        } finally {
            setIsSyncing(false);
        }
    };

    // Force sync on module mount
    useEffect(() => {
        handleManualSync();
    }, []);

    const refresh = async () => {
        const allSales = await db.getSales();
        setSales([...allSales.filter(s => s.status === 'active')]); // Create new array to force re-render
        setCustomers(await db.getCustomers());
        setSettings(await db.getSettings());
    };

    // Optimistic UI update - update local state immediately without waiting for DB
    const updateOrderInState = (orderId: string, newStatus: FulfillmentStatus, newShippingDetails?: ShippingDetails) => {
        setSales(prevSales =>
            prevSales.map(sale =>
                sale.id === orderId
                    ? {
                        ...sale,
                        fulfillmentStatus: newStatus,
                        shippingDetails: newShippingDetails || sale.shippingDetails
                    }
                    : sale
            )
        );
    };

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
                    openEditModal(order);
                    return;
                }
            }

            try {
                console.log(`📤 Cambio rápido: ${order.folio} ${order.fulfillmentStatus} → ${newStatus}`);

                // OPTIMISTIC UI UPDATE: Show change immediately
                updateOrderInState(order.id, newStatus);

                await db.updateSaleStatus(order.id, newStatus);

                // BACKGROUND SYNC: Push to cloud (don't await - let it happen in background)
                (async () => {
                    try {
                        const settings = await db.getSettings();
                        if (settings.supabaseUrl && settings.supabaseKey) {
                            const { SupabaseService } = await import('../services/supabaseService');
                            await SupabaseService.syncAll();
                            console.log('☁️ Sincronizado con nube');
                        }
                    } catch (syncErr) {
                        console.warn('⚠️ Sync pendiente:', syncErr);
                    }
                })();

                showToast(`${order.folio}: ${newStatus}`, 'success');
                if (onUpdate) onUpdate();
            } catch (e: any) {
                // Revert optimistic update on error
                refresh();
                showToast(e.message || 'Error al actualizar estado', 'error');
            }
        }
    };

    const confirmRollback = async () => {
        if (!pendingRollback || !settings) return;

        if (adminPassword === settings.masterPassword) {
            // OPTIMISTIC UI UPDATE
            updateOrderInState(pendingRollback.order.id, pendingRollback.newStatus, pendingRollback.details);

            await db.updateSaleStatus(pendingRollback.order.id, pendingRollback.newStatus, pendingRollback.details);
            setIsAdminModalOpen(false);
            setPendingRollback(null);
            setAdminPassword('');
            showToast('Estado actualizado correctamente', 'success');
            if (onUpdate) onUpdate();
        } else {
            showToast('Contraseña incorrecta', 'error');
        }
    };

    const openEditModal = (order: Sale) => {
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
            isLocalDelivery: order.shippingDetails?.isLocalDelivery || false
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

            // OPTIMISTIC UI UPDATE: Show change immediately
            updateOrderInState(selectedOrder.id, editForm.status, details);
            setIsEditModalOpen(false);

            await db.updateSaleStatus(selectedOrder.id, editForm.status, details);

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

            showToast(`Pedido actualizado: ${selectedOrder.fulfillmentStatus} → ${editForm.status}`, 'success');
            if (onUpdate) onUpdate();
        } catch (e: any) {
            console.error('❌ Error guardando pedido:', e);
            refresh(); // Revert on error
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
            refresh();
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

    const filteredOrders = useMemo(() => {
        return sales.filter(s => {

            const matchStatus = statusFilter === 'all' ? true : s.fulfillmentStatus === statusFilter;
            const matchDate = dateFilter ? s.date.startsWith(dateFilter) : true;

            const customerName = getCustomerName(s);
            const matchSearch =
                (s.folio || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (s.shippingDetails?.trackingNumber || '').toLowerCase().includes(searchTerm.toLowerCase());

            return matchStatus && matchSearch && matchDate;
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [sales, searchTerm, statusFilter, customers, viewMode]);

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
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-gray-800">Gestión de Pedidos</h1>
                    {lastSync && (
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-1 rounded-full flex items-center gap-1">
                            <i className="fas fa-sync-alt text-green-500"></i> {lastSync}
                        </span>
                    )}
                    <div className="bg-gray-100 p-1 rounded-lg flex">
                        <button
                            onClick={() => setViewMode('board')}
                            className={`p-2 rounded-md text-sm font-bold transition-all ${viewMode === 'board' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
                            title="Vista Tablero"
                        >
                            <i className="fas fa-columns"></i>
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-md text-sm font-bold transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
                            title="Vista Lista"
                        >
                            <i className="fas fa-list"></i>
                        </button>
                        <button
                            onClick={handleManualSync}
                            disabled={isSyncing}
                            className={`ml-2 p-2 rounded-md text-sm font-bold transition-all ${isSyncing ? 'bg-primary/10 text-primary animate-spin-slow' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                            title="Sincronizar ahora"
                        >
                            <i className={`fas fa-${isSyncing ? 'sync-alt' : 'cloud-download-alt'}`}></i>
                        </button>
                    </div>
                </div>

                <div className="flex gap-2 w-full sm:w-auto">
                    <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="w-auto" />
                    <Input icon="search" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full sm:w-64" />
                </div>
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
                                        {colOrders.map(order => (
                                            <div key={order.id} className={`p-1.5 rounded border shadow-sm hover:shadow transition-all ${getCardColor(order.fulfillmentStatus)}`}>
                                                <div className="flex justify-between items-center text-[8px]">
                                                    <span className="font-mono font-bold text-gray-600 bg-white/50 px-0.5 rounded">{order.folio}</span>
                                                    <div className="flex items-center gap-0.5 text-gray-500">
                                                        {order.shippingDetails?.isLocalDelivery && <span className="font-bold bg-green-200 text-green-700 px-0.5 rounded">L</span>}
                                                        {order.shippingDetails?.guideFile && <i className="fas fa-file-alt text-sky-500"></i>}
                                                        <i className="far fa-clock"></i>{timeAgo(order.date)}
                                                    </div>
                                                </div>
                                                <h4 className="font-bold text-gray-800 text-[10px] leading-tight truncate">{getCustomerName(order)}</h4>
                                                <p className="text-[8px] text-gray-600 truncate">{order.items.map(i => `${i.quantity} ${i.name}`).join(', ')}</p>
                                                {order.balance && order.balance > 0 && <p className="text-[8px] font-bold text-red-600">Debe: L {order.balance.toFixed(2)}</p>}
                                                <div className="flex items-center justify-between mt-1 gap-0.5">
                                                    <button onClick={(e) => { e.stopPropagation(); handleQuickStatusUpdate(order, 'prev'); }} disabled={col.id === 'pending'} className="w-4 h-4 rounded-full bg-white/60 text-gray-500 disabled:opacity-30 flex items-center justify-center text-[7px]"><i className="fas fa-chevron-left"></i></button>
                                                    <button onClick={() => openEditModal(order)} className="flex-1 text-[8px] font-bold text-primary hover:bg-white/50 py-0.5 rounded">Gestionar</button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleQuickStatusUpdate(order, 'next'); }} disabled={col.id === 'delivered'} className="w-4 h-4 rounded-full bg-primary text-white disabled:opacity-30 flex items-center justify-center text-[7px]"><i className="fas fa-chevron-right"></i></button>
                                                </div>
                                            </div>
                                        ))}
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
                        {filteredOrders.map(order => (
                            <Card key={order.id} className="hover:shadow-md transition-shadow" noPadding>
                                <div className="p-4 flex flex-col md:flex-row items-start md:items-center gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="font-mono font-bold text-gray-700">{order.folio}</span>
                                            {getStatusBadge(order.fulfillmentStatus)}
                                            <span className="text-xs text-gray-400">{new Date(order.date).toLocaleString()}</span>
                                        </div>
                                        <div className="font-bold text-lg text-gray-900">{getCustomerName(order)}</div>
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
                                                        refresh();
                                                        if (onUpdate) onUpdate();
                                                    } catch (e: any) {
                                                        showToast(e.message || 'Error al actualizar estado', 'error');
                                                    }
                                                }}
                                                className="w-4 h-4 accent-green-600"
                                            />
                                            <span className="text-xs font-bold">Entregado</span>
                                        </label>
                                        <Button size="sm" variant="secondary" className="flex-1 md:flex-none" onClick={() => openEditModal(order)}>Gestionar</Button>
                                    </div>
                                </div>
                            </Card>
                        ))}
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
                    <div className="bg-gray-50 p-4 rounded-xl text-sm border border-gray-100">
                        <p className="text-gray-500 mb-1">Items del Pedido:</p>
                        <ul className="list-disc pl-4 font-medium text-gray-800 space-y-1">
                            {selectedOrder?.items.map((item, idx) => (
                                <li key={idx}>{item.quantity} x {item.name} {item.notes && <span className="text-gray-500 italic">({item.notes})</span>}</li>
                            ))}
                        </ul>
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
