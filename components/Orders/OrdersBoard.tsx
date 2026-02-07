import React from 'react';
import { Sale, Category, Customer, FulfillmentStatus } from '../../types';
import { OrderCard } from './OrderCard';

interface OrdersBoardProps {
    orders: Sale[];
    categories: Category[];
    customers: Customer[];
    onEditOrder: (order: Sale) => void;

    processingOrderIds: string[];
}

export const OrdersBoard: React.FC<OrdersBoardProps> = ({
    orders,
    categories,
    customers,
    onEditOrder,

    processingOrderIds
}) => {
    const columns: { id: FulfillmentStatus; label: string; color: string; icon: string }[] = [
        { id: 'pending', label: 'Pendientes', color: 'border-yellow-400 bg-yellow-50', icon: 'clock' },
        { id: 'design', label: 'Diseño', color: 'border-pink-400 bg-pink-50', icon: 'palette' },
        { id: 'printing', label: 'Impresión/Corte', color: 'border-cyan-400 bg-cyan-50', icon: 'print' },
        { id: 'qc', label: 'Control Calidad', color: 'border-orange-400 bg-orange-50', icon: 'check-double' },
        { id: 'production', label: 'Ensamble', color: 'border-blue-400 bg-blue-50', icon: 'tools' },
        { id: 'ready', label: 'Listos / Empaquetado', color: 'border-green-400 bg-green-50', icon: 'box-open' },
        { id: 'shipped', label: 'En Ruta / Enviado', color: 'border-purple-400 bg-purple-50', icon: 'shipping-fast' },
        { id: 'delivered', label: 'Entregados', color: 'border-gray-400 bg-gray-50', icon: 'check-circle' },
    ];

    return (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-4 h-full min-w-[1200px] p-1">
                {columns.map(col => {
                    const colOrders = orders
                        .filter(o => (o.fulfillmentStatus || 'pending') === col.id)
                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                    return (
                        <div key={col.id} className="flex-1 flex flex-col min-w-[280px] h-full bg-gray-50/30 rounded-2xl border border-gray-100/50">
                            {/* Header */}
                            <div className={`p-3 rounded-t-2xl border-b border-gray-100 flex justify-between items-center shadow-sm mb-2 shrink-0 bg-white`}>
                                <div className="font-black text-gray-700 flex items-center gap-2 text-sm uppercase tracking-tight">
                                    <div className={`w-2 h-2 rounded-full ${col.id === 'pending' ? 'bg-yellow-400' :
                                        col.id === 'design' ? 'bg-pink-400' :
                                            col.id === 'printing' ? 'bg-cyan-400' :
                                                col.id === 'qc' ? 'bg-orange-400' :
                                                    col.id === 'production' ? 'bg-blue-400' :
                                                        col.id === 'ready' ? 'bg-green-400' :
                                                            col.id === 'shipped' ? 'bg-purple-400' : 'bg-gray-400'}`}></div>
                                    <i className={`fas fa-${col.icon} opacity-50`}></i>
                                    {col.label}
                                </div>
                                <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-lg text-[10px] font-black">{colOrders.length}</span>
                            </div>

                            {/* Scrollable Area */}
                            <div className="flex-1 overflow-y-auto space-y-2.5 p-2 pb-10 scrollbar-thin hover:scrollbar-thumb-gray-300">
                                {colOrders.length === 0 ? (
                                    <div className="h-24 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl opacity-40">
                                        <i className={`fas fa-${col.icon} text-lg mb-1`}></i>
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Vacío</span>
                                    </div>
                                ) : (
                                    colOrders.map(order => (
                                        <OrderCard
                                            key={order.id}
                                            order={order}
                                            categories={categories}
                                            customers={customers}
                                            onEdit={onEditOrder}

                                            isProcessing={processingOrderIds.includes(order.id)}
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
