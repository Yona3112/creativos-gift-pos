
import React, { useState, useEffect, useMemo } from 'react';
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

    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Sale | null>(null);
    const [editForm, setEditForm] = useState<{
        status: FulfillmentStatus;
        shippingCompany: string;
        tracking: string;
        notes: string;
    }>({ status: 'pending', shippingCompany: '', tracking: '', notes: '' });

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
    const [generateInvoice, setGenerateInvoice] = useState(true); // Default to Invoice when completing
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);

    useEffect(() => {
        refresh();
    }, []);

    const refresh = async () => {
        const allSales = await db.getSales();
        setSales(allSales.filter(s => s.status === 'active'));
        setCustomers(await db.getCustomers());
        setSettings(await db.getSettings());
    };

    const getCustomerName = (id?: string) => customers.find(c => c.id === id)?.name || 'Consumidor Final';

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

            try {
                await db.updateSaleStatus(order.id, newStatus);
                refresh();
                if (onUpdate) onUpdate();
            } catch (e: any) {
                showToast(e.message || 'Error al actualizar estado', 'error');
            }
        }
    };

    const confirmRollback = async () => {
        if (!pendingRollback || !settings) return;

        if (adminPassword === settings.masterPassword) {
            await db.updateSaleStatus(pendingRollback.order.id, pendingRollback.newStatus, pendingRollback.details);
            setIsAdminModalOpen(false);
            setPendingRollback(null);
            setAdminPassword('');
            showToast('Estado actualizado correctamente', 'success');
            refresh();
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
            notes: order.shippingDetails?.notes || ''
        });
        setIsEditModalOpen(true);
    };

    const handleSaveUpdate = async () => {
        if (!selectedOrder) return;

        try {
            const isShipping = !!(editForm.shippingCompany || editForm.tracking);
            const details: ShippingDetails = {
                company: editForm.shippingCompany,
                trackingNumber: editForm.tracking,
                notes: editForm.notes,
                method: isShipping ? 'shipping' : (selectedOrder.shippingDetails?.method || 'pickup')
            };

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

            await db.updateSaleStatus(selectedOrder.id, editForm.status, details);

            setIsEditModalOpen(false);
            showToast('Pedido actualizado correctamente', 'success');
            refresh();
            if (onUpdate) onUpdate();
        } catch (e: any) {
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

            const customerName = getCustomerName(s.customerId);
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

    return (
        <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-gray-800">Gestión de Pedidos</h1>
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
                                    <div className="flex-1 overflow-y-auto space-y-2 p-1 pb-10 scrollbar-thin">
                                        {colOrders.map(order => (
                                            <div key={order.id} className="bg-white p-2.5 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all group relative">
                                                <div className="flex justify-between items-start mb-1.5">
                                                    <span className="font-mono text-[10px] font-bold text-gray-500 bg-gray-100 px-1 rounded">{order.folio}</span>
                                                    <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
                                                        <i className="far fa-clock"></i> {timeAgo(order.date)}
                                                    </span>
                                                </div>
                                                <h4 className="font-bold text-gray-800 text-[13px] mb-0.5 leading-tight">{getCustomerName(order.customerId)}</h4>
                                                <p className="text-[11px] text-gray-500 line-clamp-2 mb-2 bg-gray-50 p-1.5 rounded-md">
                                                    {order.items.map(i => `${i.quantity} ${i.name}`).join(', ')}
                                                </p>
                                                {order.balance && order.balance > 0 ? (
                                                    <div className="mb-2 text-[10px] font-bold text-red-500 bg-red-50/50 px-1.5 py-0.5 rounded border border-red-100 flex justify-between">
                                                        <span>Debe:</span>
                                                        <span>L {order.balance.toFixed(2)}</span>
                                                    </div>
                                                ) : null}

                                                {order.shippingDetails?.notes ? (
                                                    <div className="mb-2 text-[10px] bg-amber-50 text-amber-800 p-1 rounded border border-amber-100 flex gap-1">
                                                        <i className="fas fa-sticky-note mt-0.5 scale-90"></i>
                                                        <span className="line-clamp-2 leading-tight">{order.shippingDetails.notes}</span>
                                                    </div>
                                                ) : null}

                                                {/* Warning: payment required before shipping */}
                                                {(order.balance || 0) > 0 && (col.id === 'ready' || col.id === 'production') ? (
                                                    <div className="mb-2 text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-1 rounded border border-amber-300 flex items-center gap-1">
                                                        <i className="fas fa-exclamation-triangle"></i>
                                                        <span>Pago requerido para enviar</span>
                                                    </div>
                                                ) : null}

                                                <div className="flex items-center justify-between border-t pt-1.5 mt-auto gap-2">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleQuickStatusUpdate(order, 'prev'); }}
                                                        disabled={col.id === 'pending'}
                                                        className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-30 flex items-center justify-center transition-colors shadow-sm"
                                                    >
                                                        <i className="fas fa-chevron-left text-[10px]"></i>
                                                    </button>
                                                    <button
                                                        onClick={() => openEditModal(order)}
                                                        className="flex-1 text-[11px] font-bold text-primary hover:bg-indigo-50 py-1 rounded transition-colors"
                                                    >
                                                        Gestionar
                                                    </button>

                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleQuickStatusUpdate(order, 'next'); }}
                                                        className="w-7 h-7 rounded-full bg-primary text-white hover:bg-indigo-700 shadow-md flex items-center justify-center transition-colors"
                                                    >
                                                        <i className={`fas fa-${col.id === 'shipped' ? 'check' : 'chevron-right'} text-xs`}></i>
                                                    </button>
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
                                        <div className="font-bold text-lg text-gray-900">{getCustomerName(order.customerId)}</div>
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
                            <Input label="Empresa de Envío" placeholder="Ej: Cargo Expreso" value={editForm.shippingCompany} onChange={e => setEditForm({ ...editForm, shippingCompany: e.target.value })} style={{ background: 'white' }} />
                            <Input label="No. de Guía / Tracking" placeholder="Ej: 12345678" value={editForm.tracking} onChange={e => setEditForm({ ...editForm, tracking: e.target.value })} style={{ background: 'white' }} />
                        </div>
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
