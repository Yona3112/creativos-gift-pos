
import React, { useState, useEffect, useMemo } from 'react';
import { Sale, Customer, FulfillmentStatus, ShippingDetails } from '../types';
import { Card, Button, Input, Badge, Modal } from '../components/UIComponents';
import { db } from '../services/storageService';

interface OrdersProps {
    onUpdate?: () => void;
}

export const Orders: React.FC<OrdersProps> = ({ onUpdate }) => {
    const [sales, setSales] = useState<Sale[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
    const [statusFilter, setStatusFilter] = useState<FulfillmentStatus | 'all'>('all');
    
    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState<Sale | null>(null);
    const [editForm, setEditForm] = useState<{
        status: FulfillmentStatus;
        shippingCompany: string;
        tracking: string;
        notes: string;
    }>({ status: 'pending', shippingCompany: '', tracking: '', notes: '' });

    useEffect(() => {
        refresh();
    }, []);

    const refresh = async () => {
        const allSales = await db.getSales();
        setSales(allSales.filter(s => s.status === 'active'));
        setCustomers(await db.getCustomers());
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
            await db.updateSaleStatus(order.id, newStatus);
            refresh();
            if (onUpdate) onUpdate();
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
        
        const isShipping = !!(editForm.shippingCompany || editForm.tracking);

        await db.updateSaleStatus(selectedOrder.id, editForm.status, {
            company: editForm.shippingCompany,
            trackingNumber: editForm.tracking,
            notes: editForm.notes,
            method: isShipping ? 'shipping' : (selectedOrder.shippingDetails?.method || 'pickup')
        });

        setIsEditModalOpen(false);
        refresh();
        if (onUpdate) onUpdate();
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
            if (viewMode === 'board' && !searchTerm && s.fulfillmentStatus === 'delivered') return false;

            const matchStatus = statusFilter === 'all' ? true : s.fulfillmentStatus === statusFilter;
            
            const customerName = getCustomerName(s.customerId);
            const matchSearch = 
                s.folio.toLowerCase().includes(searchTerm.toLowerCase()) ||
                customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (s.shippingDetails?.trackingNumber || '').toLowerCase().includes(searchTerm.toLowerCase());

            return matchStatus && matchSearch;
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); 
    }, [sales, searchTerm, statusFilter, customers, viewMode]);

    const columns: { id: FulfillmentStatus, label: string, color: string, icon: string }[] = [
        { id: 'pending', label: 'Pendientes', color: 'border-yellow-400 bg-yellow-50', icon: 'clock' },
        { id: 'production', label: 'En Producción', color: 'border-blue-400 bg-blue-50', icon: 'tools' },
        { id: 'ready', label: 'Listos / Empaquetado', color: 'border-green-400 bg-green-50', icon: 'box-open' },
        { id: 'shipped', label: 'En Ruta / Enviado', color: 'border-purple-400 bg-purple-50', icon: 'shipping-fast' },
    ];

    const getStatusBadge = (status?: FulfillmentStatus) => {
        switch(status) {
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
                                <div key={col.id} className="flex-1 flex flex-col min-w-[280px] h-full">
                                    <div className={`p-3 rounded-t-xl border-t-4 ${col.color} flex justify-between items-center shadow-sm mb-2 shrink-0`}>
                                        <div className="font-bold text-gray-700 flex items-center gap-2">
                                            <i className={`fas fa-${col.icon}`}></i> {col.label}
                                        </div>
                                        <span className="bg-white/50 px-2 py-0.5 rounded text-xs font-black">{colOrders.length}</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto space-y-3 p-1 pb-10 scrollbar-thin">
                                        {colOrders.map(order => (
                                            <div key={order.id} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all group relative">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="font-mono text-xs font-bold text-gray-500 bg-gray-100 px-1.5 rounded">{order.folio}</span>
                                                    <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
                                                        <i className="far fa-clock"></i> {timeAgo(order.date)}
                                                    </span>
                                                </div>
                                                <h4 className="font-bold text-gray-800 text-sm mb-1">{getCustomerName(order.customerId)}</h4>
                                                <p className="text-xs text-gray-500 line-clamp-2 mb-3 bg-gray-50 p-1.5 rounded">
                                                    {order.items.map(i => `${i.quantity} ${i.name}`).join(', ')}
                                                </p>
                                                
                                                {order.shippingDetails?.notes && (
                                                    <div className="mb-3 text-[10px] bg-yellow-50 text-yellow-800 p-1.5 rounded border border-yellow-100 flex gap-1">
                                                        <i className="fas fa-sticky-note mt-0.5"></i>
                                                        <span className="line-clamp-2">{order.shippingDetails.notes}</span>
                                                    </div>
                                                )}

                                                <div className="flex items-center justify-between border-t pt-2 gap-2">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleQuickStatusUpdate(order, 'prev'); }}
                                                        disabled={col.id === 'pending'}
                                                        className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-30 flex items-center justify-center transition-colors"
                                                    >
                                                        <i className="fas fa-chevron-left text-xs"></i>
                                                    </button>
                                                    
                                                    <button 
                                                        onClick={() => openEditModal(order)}
                                                        className="flex-1 text-xs font-bold text-primary hover:bg-indigo-50 py-1.5 rounded transition-colors"
                                                    >
                                                        Ver / Editar
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

                                    <div className="flex gap-2 w-full md:w-auto mt-2 md:mt-0">
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
                                onChange={(e) => setEditForm({...editForm, status: e.target.value as any})}
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
                            <Input label="Empresa de Envío" placeholder="Ej: Cargo Expreso" value={editForm.shippingCompany} onChange={e => setEditForm({...editForm, shippingCompany: e.target.value})} style={{background: 'white'}} />
                            <Input label="No. de Guía / Tracking" placeholder="Ej: 12345678" value={editForm.tracking} onChange={e => setEditForm({...editForm, tracking: e.target.value})} style={{background: 'white'}} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Notas Internas / Producción</label>
                        <textarea 
                            className="w-full p-3 rounded-xl border border-gray-300 bg-white h-24 text-sm outline-none focus:border-primary font-medium"
                            placeholder="Ej: Cliente solicitó envoltorio azul, entregar después de las 5pm..."
                            value={editForm.notes}
                            onChange={e => setEditForm({...editForm, notes: e.target.value})}
                        ></textarea>
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button onClick={handleSaveUpdate} variant="primary" size="lg" icon="save" className="w-full sm:w-auto">Guardar Cambios</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
