
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Sale, Customer, FulfillmentStatus, ShippingDetails, CompanySettings, PaymentDetails, Category } from '../types';
import { Card, Button, Input, Badge, Modal, showToast, ImagePreviewModal } from '../components/UIComponents';
import { db } from '../services/storageService';
import { logger } from '../services/logger';
import { BoxfulService } from '../services/boxfulService';
import { OrderCard } from '../components/Orders/OrderCard';
import { OrdersBoard } from '../components/Orders/OrdersBoard';
import { OrderFilters } from '../components/Orders/OrderFilters';

interface OrdersProps {
    sales: Sale[];
    customers: Customer[];
    categories: Category[];
    settings: CompanySettings | null;
    onUpdate?: () => void;
}

export const Orders: React.FC<OrdersProps> = ({ sales: allSales, customers, categories, settings, onUpdate }) => {
    // Load initial state from localStorage or default
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'board' | 'list'>(() =>
        (localStorage.getItem('order_viewMode') as 'board' | 'list') || 'board'
    );
    const [statusFilter, setStatusFilter] = useState<FulfillmentStatus | 'all'>(() =>
        (localStorage.getItem('order_statusFilter') as FulfillmentStatus | 'all') || 'all'
    );
    const [datePreset, setDatePreset] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month'>(() =>
        (localStorage.getItem('order_datePreset') as 'all' | 'today' | 'yesterday' | 'week' | 'month') || 'all'
    );
    const [dateFilter, setDateFilter] = useState<string>('');
    const [filterByDeliveryDate, setFilterByDeliveryDate] = useState<boolean>(() =>
        localStorage.getItem('order_filterByDeliveryDate') === 'true'
    );
    // const [isSyncing, setIsSyncing] = useState(false); // Removed
    const [categoryFilter, setCategoryFilter] = useState<string>(() =>
        localStorage.getItem('order_categoryFilter') || 'all'
    );
    const [showDelivered, setShowDelivered] = useState(() =>
        localStorage.getItem('order_showDelivered') === 'true'
    );

    // Persist settings to localStorage
    useEffect(() => { localStorage.setItem('order_viewMode', viewMode); }, [viewMode]);
    useEffect(() => { localStorage.setItem('order_statusFilter', statusFilter); }, [statusFilter]);
    useEffect(() => { localStorage.setItem('order_datePreset', datePreset); }, [datePreset]);
    useEffect(() => { localStorage.setItem('order_categoryFilter', categoryFilter); }, [categoryFilter]);
    useEffect(() => { localStorage.setItem('order_categoryFilter', categoryFilter); }, [categoryFilter]);
    useEffect(() => { localStorage.setItem('order_filterByDeliveryDate', filterByDeliveryDate.toString()); }, [filterByDeliveryDate]);

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Sale | null>(null);
    const [processingOrderIds, setProcessingOrderIds] = useState<string[]>([]);
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
        address: string;
    }>({ status: 'pending', shippingCompany: '', tracking: '', notes: '', guideFile: '', guideFileType: '', guideFileName: '', productionImages: [], isLocalDelivery: false, sharePhone: '', address: '' });

    // Admin Password Modal State
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
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
    const [isGeneratingBoxful, setIsGeneratingBoxful] = useState(false);

    // Removal of redundant sync on mount to favor App.tsx unification
    /* 
    useEffect(() => {
        handleManualSync();
    }, []);
    */

    // Manual Sync Logic Removed (Realtime is fully active)

    // Simplified Order List Filter
    // Include sales that are: (1) not cancelled, AND (2) are orders, have balance, or are in workflow
    const orderSales = useMemo(() => {
        return allSales.filter(s => {
            // Exclude cancelled/returned sales
            if (s.status === 'cancelled' || s.status === 'returned') return false;

            // ALWAYS include delivered orders (they go to "Entregados" column)
            if (s.fulfillmentStatus === 'delivered') return true;

            // Include if explicitly marked as order (Pending work or Pending collection)
            if (s.isOrder === true) return true;

            // Include if has pending balance (even if delivered, we need to collect)
            if (s.balance && s.balance > 0) return true;

            // Include if workflow in progress (not delivered)
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
        const workflow: FulfillmentStatus[] = ['pending', 'design', 'printing', 'qc', 'production', 'ready', 'shipped', 'delivered'];
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
                logger.log(`📤 Cambio rápido: ${order.folio} ${order.fulfillmentStatus} → ${newStatus}`);

                // OPTIMISTIC UI REMOVED: Now relying on database -> onUpdate -> Re-render cycle
                // updateOrderInState(order.id, newStatus);

                setProcessingOrderIds(prev => [...prev, order.id]);
                await db.updateSaleStatus(order.id, newStatus);

                // FORCE UI REFRESH
                if (onUpdate) onUpdate();

                showToast(`${order.folio}: ${newStatus}`, 'success');
            } finally {
                setProcessingOrderIds(prev => prev.filter(id => id !== order.id));
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

    const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);

    const handleEditOrder = (order: Sale) => {
        setSelectedOrder(order);

        // Set form immediately with whatever data we have (no blocking await)
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
            sharePhone: customers.find(c => c.id === order.customerId)?.phone || '',
            address: order.shippingDetails?.address || customers.find(c => c.id === order.customerId)?.address || ''
        });

        // Open modal IMMEDIATELY - no waiting
        setIsEditModalOpen(true);
    };

    // Load attachments lazily AFTER modal opens
    useEffect(() => {
        if (!isEditModalOpen || !selectedOrder) return;

        const guideFile = selectedOrder.shippingDetails?.guideFile || '';
        const productionImages = selectedOrder.shippingDetails?.productionImages || [];

        // Only fetch if we don't already have the data locally
        if (guideFile && !guideFile.startsWith('[') && productionImages.length > 0) return;

        let cancelled = false;
        const loadAttachments = async () => {
            setIsLoadingAttachments(true);
            try {
                const attachments = await db.getAttachments(selectedOrder.id);
                if (cancelled || !attachments || attachments.length === 0) return;

                const guide = attachments.find((a: any) => a.category === 'guide' || a.category === 'general');
                const prodImgs = attachments.filter((a: any) => a.category === 'production');

                setEditForm(prev => ({
                    ...prev,
                    guideFile: (!prev.guideFile || prev.guideFile === '[ATTACHMENT]') && guide ? guide.file_data : prev.guideFile,
                    guideFileType: (!prev.guideFileType) && guide ? guide.file_type : prev.guideFileType,
                    guideFileName: (!prev.guideFileName) && guide ? guide.file_name : prev.guideFileName,
                    productionImages: prev.productionImages.length === 0 && prodImgs.length > 0
                        ? prodImgs.map((a: any) => a.file_data)
                        : prev.productionImages
                }));
            } catch (e) {
                console.error("Error loading attachments:", e);
            } finally {
                if (!cancelled) setIsLoadingAttachments(false);
            }
        };

        loadAttachments();
        return () => { cancelled = true; };
    }, [isEditModalOpen, selectedOrder?.id]);

    // Handler para subir guía (PDF o imagen)
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
            // Upload immediately to separate table
            if (selectedOrder) {
                showToast("Subiendo archivo...", "info");

                let fileData = '';
                if (isPdf) {
                    fileData = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = (ev) => resolve(ev.target?.result as string);
                        reader.readAsDataURL(file);
                    });
                } else {
                    fileData = await db.compressImage(file);
                }

                // Save to cloud attachment table
                await db.saveAttachment(selectedOrder.id, fileData, isPdf ? 'pdf' : 'image', file.name, 'guide');

                setEditForm(prev => ({
                    ...prev,
                    guideFile: fileData, // Keep for local preview
                    guideFileType: isPdf ? 'pdf' : 'image',
                    guideFileName: file.name
                }));
                showToast('Guía subida y guardada correctamente', 'success');
            } else {
                // New Order (fallback)
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
            }
        } catch (err) {
            console.error("Upload error:", err);
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

        showToast(`Procesando ${toProcess.length} imagen(es)...`, 'info');

        for (const file of toProcess) {
            if (!file.type.startsWith('image/')) continue;
            try {
                const compressed = await db.compressImage(file);
                newImages.push(compressed);

                // Upload immediately if order exists
                if (selectedOrder) {
                    await db.saveAttachment(selectedOrder.id, compressed, 'image', `prod-${Date.now()}.jpg`, 'production');
                }
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
        setProcessingOrderIds(prev => [...prev, selectedOrder.id]);

        try {
            const isShipping = !!(editForm.shippingCompany || editForm.tracking) && !editForm.isLocalDelivery;

            // OPTIMIZATION: Do NOT save heavy base64 to 'sales' table.
            // If it's a data URI, we replace it with a placeholder because it's already in sale_attachments.
            const cleanGuideFile = (editForm.guideFile && editForm.guideFile.startsWith('data:'))
                ? '[ATTACHMENT]'
                : editForm.guideFile;

            const cleanProductionImages = editForm.productionImages.map(img =>
                (img && img.startsWith('data:')) ? '[ATTACHMENT]' : img
            );

            const details: ShippingDetails = {
                company: editForm.shippingCompany,
                trackingNumber: editForm.tracking,
                notes: editForm.notes,
                method: isShipping ? 'shipping' : 'pickup',
                guideFile: cleanGuideFile || undefined,
                guideFileType: editForm.guideFileType || undefined,
                guideFileName: editForm.guideFileName || undefined,
                productionImages: cleanProductionImages.length > 0 ? cleanProductionImages : undefined,
                isLocalDelivery: editForm.isLocalDelivery,
                address: editForm.address
            };

            // Validación: requiere guía para avanzar a shipped/delivered (a menos que sea entrega local)
            if (['shipped', 'delivered'].includes(editForm.status)) {
                if (!editForm.guideFile && !editForm.isLocalDelivery) {
                    showToast('Debes subir una guía de envío o activar "Entrega Local"', 'warning');
                    return;
                }
            }

            // Check for rollback (from delivered or any previous state)
            const workflow: FulfillmentStatus[] = ['pending', 'design', 'printing', 'qc', 'production', 'ready', 'shipped', 'delivered'];
            const oldIndex = workflow.indexOf(selectedOrder.fulfillmentStatus || 'pending');
            const newIndex = workflow.indexOf(editForm.status);

            if (newIndex < oldIndex) {
                setPendingRollback({ order: selectedOrder, newStatus: editForm.status, details });
                setAdminPassword('');
                setIsAdminModalOpen(true);
                setIsEditModalOpen(false);
                return;
            }

            logger.log(`📤 Guardando pedido ${selectedOrder.folio}: ${selectedOrder.fulfillmentStatus} → ${editForm.status}`);
            logger.log(`📦 Guía: ${editForm.guideFile ? 'SÍ' : 'NO'}, Local: ${editForm.isLocalDelivery ? 'SÍ' : 'NO'}`);

            // Close modal optimistically
            setIsEditModalOpen(false);

            // Perform update (this will automatically enqueue for cloud sync)
            // IF guideFile is huge (base64), we should strip it here?
            // Ideally we modify db.updateSaleStatus to handle it.
            // For now, let's keep it simple and focus on the High Egress fix in storageService

            await db.updateSaleStatus(selectedOrder.id, editForm.status, details);
            showToast(`Pedido actualizado: ${editForm.status}`, 'success');

            if (onUpdate) onUpdate(); // Refresh global state

        } catch (e: any) {
            console.error('❌ Error guardando pedido:', e);
            if (onUpdate) onUpdate(); // Forced revert to global state
            showToast(e.message || 'Error al actualizar pedido', 'error');
        } finally {
            setProcessingOrderIds(prev => prev.filter(id => id !== selectedOrder?.id));
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

            const updatedSale = await db.completeOrder(selectedOrder.id, payment, generateInvoice ? 'FACTURA' : 'TICKET');

            showToast('Pago completado y documento generado', 'success');
            setIsPayModalOpen(false);
            setIsEditModalOpen(false);

            // PRINT RECEIPT IMMEDIATELY
            try {
                // Generate HTML for the receipt
                const html = await db.generateTicketHTML(updatedSale, updatedSale.customerId ? customers.find(c => c.id === updatedSale.customerId) : undefined);

                // Use PrinterService
                const { PrinterService } = await import('../services/printerService');
                PrinterService.printHTML(html);

            } catch (printErr) {
                console.warn("Error printing receipt automatically:", printErr);
                showToast("Pago registrado, pero hubo error al imprimir", "warning");
            }

            if (onUpdate) onUpdate();
        } catch (e: any) {
            showToast(e.message || 'Error al completar pago', 'error');
        } finally {
            setIsProcessingPayment(false);
        }
    };

    const handleGenerateBoxful = async () => {
        if (!selectedOrder) return;
        setIsGeneratingBoxful(true);
        try {
            const result = await BoxfulService.createShipment(selectedOrder, editForm.sharePhone);
            setEditForm(prev => ({
                ...prev,
                tracking: result.trackingNumber,
                shippingCompany: 'Boxful',
                guideFile: result.guideUrl,
                guideFileType: 'pdf',
                guideFileName: `guia-${selectedOrder.folio}.pdf`
            }));
            showToast("Guía de Boxful generada con éxito", "success");
        } catch (e: any) {
            showToast(e.message || "Error al generar guía con Boxful", "error");
        } finally {
            setIsGeneratingBoxful(false);
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
        try {
            let result = [...orderSales];

            // Apply filters directly to orderSales which is derived from props
            return result.filter(s => {
                const matchStatus = statusFilter === 'all' ? true : s.fulfillmentStatus === statusFilter;

                let matchDate = true;
                const range = getDateRange(datePreset);
                const targetDate = filterByDeliveryDate ? (s.deliveryDate || s.date) : s.date;

                if (range) {
                    const orderDate = (targetDate || '').split('T')[0];
                    matchDate = orderDate >= range.from && orderDate <= range.to;
                } else if (dateFilter) {
                    matchDate = (targetDate || '').startsWith(dateFilter);
                }

                const matchCategory = categoryFilter === 'all'
                    ? true
                    : (s.items || []).some(item => item.categoryId === categoryFilter);

                const customerName = getCustomerName(s);
                const matchSearch =
                    (s.folio || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (s.shippingDetails?.trackingNumber || '').toLowerCase().includes(searchTerm.toLowerCase());

                return matchStatus && matchSearch && matchDate && matchCategory;
            }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        } catch (error) {
            console.error("❌ Error en filtrado de pedidos:", error);
            return [];
        }
    }, [orderSales, searchTerm, statusFilter, customers, categoryFilter, dateFilter, datePreset]);

    const orderCountPerCategory = useMemo(() => {
        const counts: Record<string, number> = {};
        categories.forEach(cat => {
            counts[cat.id] = orderSales.filter(s => (s.items || []).some(item => item.categoryId === cat.id)).length;
        });
        return counts;
    }, [orderSales, categories]);

    return (
        <div className="space-y-4 h-[calc(100vh-140px)] flex flex-col p-1">
            <OrderFilters
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                dateFilter={dateFilter}
                onDateFilterChange={(val) => { setDateFilter(val); setDatePreset('all'); }}
                categoryFilter={categoryFilter}
                onCategoryFilterChange={setCategoryFilter}
                categories={categories}
                datePreset={datePreset}
                onDatePresetChange={(preset) => { setDatePreset(preset); setDateFilter(''); }}
                orderCountPerCategory={orderCountPerCategory}
            />

            <div className="flex items-center gap-2 px-1">
                <Button
                    size="sm"
                    variant={filterByDeliveryDate ? 'primary' : 'outline'}
                    onClick={() => setFilterByDeliveryDate(!filterByDeliveryDate)}
                    className="text-[10px] font-black uppercase tracking-wider"
                >
                    <i className={`fas fa-${filterByDeliveryDate ? 'calendar-check' : 'calendar-alt'} mr-2`}></i>
                    Filtrar por: {filterByDeliveryDate ? 'Fecha de Entrega' : 'Fecha de Registro'}
                </Button>
            </div>

            <OrdersBoard
                orders={filteredOrders}
                categories={categories}
                customers={customers}
                onEditOrder={handleEditOrder}
                processingOrderIds={processingOrderIds}
            />

            {/* Modals are kept below */}


            {/* Modals begin here */}

            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title={selectedOrder ? `Pedido ${selectedOrder.folio} - ${getCustomerName(selectedOrder)}` : 'Gestionar Pedido'}
            >
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
                                {(selectedOrder?.items || []).map((item, idx) => (
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

                            {selectedOrder?.deliveryDate && (
                                <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-100">
                                    <p className="text-[10px] font-black text-blue-400 uppercase mb-1">PROGRAMADO PARA:</p>
                                    <p className="text-sm font-black text-blue-700 flex items-center gap-2">
                                        <i className="fas fa-calendar-check"></i>
                                        {new Date(selectedOrder.deliveryDate).toLocaleDateString('es-HN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                    </p>
                                </div>
                            )}
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
                                <option value="design">🎨 Diseño / Personalización</option>
                                <option value="printing">🖨️ Impresión / DTF</option>
                                <option value="qc">🔍 Control de Calidad</option>
                                <option value="production">🛠️ En Producción / Taller</option>
                                <option value="ready">📦 Listo / Empaquetado</option>
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
                        <div className="flex justify-between items-center mb-1">
                            <h4 className="font-bold text-purple-900 text-sm uppercase flex items-center gap-2">
                                <i className="fas fa-truck"></i> Datos de Envío
                            </h4>
                            {settings?.boxfulApiKey && (
                                <button
                                    onClick={handleGenerateBoxful}
                                    disabled={isGeneratingBoxful || editForm.isLocalDelivery}
                                    className="text-[10px] font-black bg-purple-600 text-white px-2 py-1 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-all flex items-center gap-1 shadow-sm"
                                >
                                    <i className={`fas fa-${isGeneratingBoxful ? 'spinner fa-spin' : 'magic'}`}></i>
                                    Generar Boxful
                                </button>
                            )}
                        </div>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <Input label="Empresa de Envío" placeholder="Ej: Cargo Expreso" value={editForm.shippingCompany} onChange={e => setEditForm({ ...editForm, shippingCompany: e.target.value })} style={{ background: 'white' }} disabled={editForm.isLocalDelivery} />
                                <Input label="No. de Guía / Tracking" placeholder="Ej: 12345678" value={editForm.tracking} onChange={e => setEditForm({ ...editForm, tracking: e.target.value })} style={{ background: 'white' }} disabled={editForm.isLocalDelivery} selectOnFocus={true} />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-purple-400 uppercase">Dirección de Entrega</label>
                                <textarea
                                    className="w-full p-2 text-xs rounded-xl border border-gray-200 bg-white outline-none focus:border-purple-300 min-h-[60px]"
                                    placeholder="Ingrese la dirección completa..."
                                    value={editForm.address}
                                    onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                                    disabled={editForm.isLocalDelivery}
                                ></textarea>
                            </div>
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

                            {/* WhatsApp Share Action - shows when there's a guide file OR tracking number */}
                            {(editForm.guideFile || editForm.tracking) && (
                                <div className="flex flex-col gap-2 bg-white p-3 rounded-xl border border-sky-200 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <p className="text-[10px] font-bold text-sky-600 uppercase">Compartir con Cliente</p>
                                            <p className="text-xs text-gray-500">Enviar guía por WhatsApp</p>
                                        </div>
                                        <Input
                                            placeholder="Teléfono"
                                            value={editForm.sharePhone}
                                            className="!py-1 !text-xs w-28"
                                            onChange={(e) => setEditForm({ ...editForm, sharePhone: e.target.value })}
                                            selectOnFocus={true}
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="success"
                                            icon="whatsapp"
                                            className="flex-1"
                                            onClick={() => {
                                                let cleanPhone = editForm.sharePhone.replace(/\D/g, '');
                                                if (cleanPhone.length === 8) cleanPhone = '504' + cleanPhone;

                                                // Build message with thank you and order info
                                                let message = `👋 Hola *${selectedOrder?.customerName}*,\n\n`;
                                                message += `¡Tu pedido *${selectedOrder?.folio}* está listo!\n\n`;

                                                if (editForm.shippingCompany || editForm.tracking) {
                                                    message += `📦 *Datos de Envío:*\n`;
                                                    if (editForm.shippingCompany) message += `• Empresa: ${editForm.shippingCompany}\n`;
                                                    if (editForm.tracking) message += `• Guía/Tracking: ${editForm.tracking}\n`;
                                                    if (editForm.address) message += `• Dirección: ${editForm.address}\n`;
                                                    message += `\n`;
                                                }

                                                if (editForm.guideFile && editForm.guideFile.startsWith('http')) {
                                                    message += `🔗 *Ver Guía:* ${editForm.guideFile}\n\n`;
                                                }

                                                message += `_¡Gracias por tu compra! Es un placer atenderte. Si tienes alguna duda, no dudes en escribirnos._\n\n`;
                                                message += `✨ *${settings?.name || 'Tu tienda favorita'}*`;

                                                window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
                                            }}
                                        >
                                            Enviar Texto
                                        </Button>

                                        {editForm.guideFile && (
                                            <Button
                                                size="sm"
                                                variant="primary"
                                                icon="share-alt"
                                                className="flex-1"
                                                onClick={async () => {
                                                    try {
                                                        // Copy customer name to clipboard for WhatsApp search
                                                        if (selectedOrder?.customerName) {
                                                            await navigator.clipboard.writeText(selectedOrder.customerName);
                                                            showToast(`Nombre '${selectedOrder.customerName}' copiado. Pégalo en el buscador de WhatsApp.`, "info");
                                                        }

                                                        const response = await fetch(editForm.guideFile);
                                                        const blob = await response.blob();
                                                        const extension = editForm.guideFileType === 'pdf' ? 'pdf' : 'jpg';

                                                        // Create message for file sharing
                                                        const fileMessage = `📦 Guía de envío - Pedido ${selectedOrder?.folio}\n\n¡Hola ${selectedOrder?.customerName}! Aquí está tu guía de envío.\n\n¡Gracias por tu compra! ✨ ${settings?.name || ''}`;

                                                        const file = new File([blob], `guia-${selectedOrder?.folio}.${extension}`, { type: blob.type });

                                                        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                                                            await navigator.share({
                                                                files: [file],
                                                                title: `Guía de envío - ${selectedOrder?.folio}`,
                                                                text: fileMessage
                                                            });
                                                            showToast("Menú de compartir abierto", "success");
                                                        } else {
                                                            // Fallback: Download
                                                            const link = document.createElement('a');
                                                            link.href = editForm.guideFile;
                                                            link.download = `guia-${selectedOrder?.folio}.${extension}`;
                                                            link.click();
                                                            showToast("El navegador no soporta compartir archivos. Se ha descargado el archivo.", "warning");
                                                        }
                                                    } catch (err) {
                                                        console.error("Error sharing file:", err);
                                                        showToast("Error al intentar compartir el archivo", "error");
                                                    }
                                                }}
                                            >
                                                Compartir Archivo
                                            </Button>
                                        )}
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
                                        <img
                                            src={editForm.guideFile}
                                            alt="Guía"
                                            className="w-full max-h-48 object-contain rounded-lg border border-sky-200 cursor-zoom-in hover:opacity-90 transition-opacity"
                                            onClick={() => setPreviewImage(editForm.guideFile)}
                                        />
                                    )}
                                </div>
                            ) : isLoadingAttachments ? (
                                <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-sky-200 rounded-xl bg-sky-50/50">
                                    <i className="fas fa-spinner fa-spin text-2xl text-sky-400 mb-2"></i>
                                    <span className="text-sm text-sky-600 font-medium">Cargando guía...</span>
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
                                    <img
                                        src={img}
                                        alt={`Producción ${idx + 1}`}
                                        className="w-full h-20 object-contain bg-gray-50 rounded-lg border border-amber-200 cursor-zoom-in hover:brightness-110 shadow-sm"
                                        onClick={() => setPreviewImage(img)}
                                    />
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeProductionImage(idx); }}
                                        className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-md z-10"
                                    >
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>
                            ))}

                            {isLoadingAttachments && editForm.productionImages.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-amber-200 rounded-lg bg-amber-50/50">
                                    <i className="fas fa-spinner fa-spin text-amber-400"></i>
                                    <span className="text-[9px] text-amber-500 mt-1">Cargando...</span>
                                </div>
                            )}
                            {editForm.productionImages.length < 3 && !isLoadingAttachments && (
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

            {/* Global Image Preview */}
            <ImagePreviewModal
                isOpen={!!previewImage}
                onClose={() => setPreviewImage(null)}
                src={previewImage || ''}
                title={selectedOrder ? `Previsualización - ${selectedOrder.folio}` : 'Previsualización'}
            />
        </div >
    );
};
