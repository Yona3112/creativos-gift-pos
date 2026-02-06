import React from 'react';
import { Sale, Category, Customer, FulfillmentStatus } from '../../types';
import { Badge, ImagePreviewModal } from '../UIComponents';

interface OrderCardProps {
    order: Sale;
    categories: Category[];
    customers: Customer[];
    onEdit: (order: Sale) => void;
    lastCloudPush?: string | null;
    isProcessing?: boolean;
}

export const OrderCard: React.FC<OrderCardProps> = ({
    order,
    categories,
    customers,
    onEdit,
    lastCloudPush,
    isProcessing
}) => {
    const [previewImage, setPreviewImage] = React.useState<string | null>(null);

    const customer = customers.find(c => c.id === order.customerId);
    const customerName = order.customerName || customer?.name || 'Consumidor Final';

    // Get unique categories for this order items
    const orderCatIds = [...new Set((order.items || []).map(item => item.categoryId))];
    const orderCategories = orderCatIds
        .map(id => categories.find(c => c.id === id))
        .filter((c): c is Category => !!c);

    const timeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d`;
        if (hours > 0) return `${hours}h`;
        return `${minutes}m`;
    };

    const getStatusBadge = (status?: FulfillmentStatus) => {
        switch (status) {
            case 'pending': return <Badge variant="warning">Pendiente</Badge>;
            case 'design': return <Badge variant="info">Diseño</Badge>;
            case 'printing': return <Badge variant="info">Impresión</Badge>;
            case 'qc': return <Badge variant="warning">QC</Badge>;
            case 'production': return <Badge variant="info">Ensamble</Badge>;
            case 'ready': return <Badge variant="success">Listo</Badge>;
            case 'shipped': return <Badge variant="info">Enviado</Badge>;
            case 'delivered': return <Badge variant="default">Entregado</Badge>;
            default: return <Badge>N/A</Badge>;
        }
    };

    const getCardStyles = (status?: FulfillmentStatus) => {
        switch (status) {
            case 'pending': return 'bg-yellow-50/50 border-yellow-200';
            case 'design': return 'bg-pink-50/50 border-pink-200';
            case 'printing': return 'bg-cyan-50/50 border-cyan-200';
            case 'qc': return 'bg-orange-50/50 border-orange-200';
            case 'production': return 'bg-blue-50/50 border-blue-200';
            case 'ready': return 'bg-green-50/50 border-green-200';
            case 'shipped': return 'bg-purple-50/50 border-purple-200';
            case 'delivered': return 'bg-gray-50 border-gray-200 opacity-75';
            default: return 'bg-white border-gray-200';
        }
    };

    // Check sync status
    const isSynced = !order.updatedAt || !lastCloudPush || new Date(order.updatedAt).getTime() <= new Date(lastCloudPush).getTime();

    return (
        <div
            onClick={() => onEdit(order)}
            className={`p-3 rounded-2xl border shadow-sm hover:shadow-md transition-all cursor-pointer relative group flex flex-col h-fit animate-scale-in ${getCardStyles(order.fulfillmentStatus)} ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
        >
            {/* Sync Indicator */}
            <div className="absolute top-2 right-2 flex items-center gap-1.5">
                {!isSynced && (
                    <div className="flex items-center gap-1 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[8px] font-black uppercase ring-1 ring-amber-200">
                        <i className="fas fa-cloud-upload-alt animate-pulse"></i>
                        Local
                    </div>
                )}
                {isSynced && order.updatedAt && (
                    <div className="text-green-500 text-[10px]" title="Sincronizado con la nube">
                        <i className="fas fa-check-circle"></i>
                    </div>
                )}
            </div>

            {/* Categories */}
            <div className="flex gap-1 mb-2 flex-wrap pr-16">
                {orderCategories.map(cat => (
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

            <div className="flex justify-between items-start mb-1.5">
                <span className="font-mono font-black text-xs text-gray-400 bg-white/60 px-1.5 py-0.5 rounded-lg">{order.folio}</span>
                <div className="flex items-center gap-1.5 text-gray-500 mr-6">
                    {order.shippingDetails?.isLocalDelivery && <span className="bg-green-100 text-green-700 text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full" title="Entrega Local">L</span>}
                    {order.shippingDetails?.guideFile && <i className="fas fa-file-alt text-sky-500 text-xs" title="Tiene Guía"></i>}
                    <div className="text-[10px] font-bold">
                        <i className="far fa-clock mr-1"></i>{timeAgo(order.date)}
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center mb-1">
                <h4 className="font-black text-xs text-gray-800 uppercase leading-none truncate flex-1">{customerName}</h4>
                {customer?.phone && (
                    <span className="text-[10px] font-bold text-gray-500 flex items-center gap-1">
                        <i className="fab fa-whatsapp text-green-500"></i>
                        {customer.phone}
                    </span>
                )}
            </div>

            <div className="mb-3 space-y-0.5">
                {(order.items || []).slice(0, 3).map((item, idx) => (
                    <div key={idx} className="text-[10px] text-gray-600 line-clamp-1 flex items-center gap-1">
                        <span className="font-black text-gray-300">{(item?.quantity || 0)}x</span> {item?.name}
                    </div>
                ))}
                {(order.items || []).length > 3 && <p className="text-[9px] text-gray-400 font-bold italic">+{(order.items || []).length - 3} más...</p>}
            </div>

            {/* Production Images */}
            {order.shippingDetails?.productionImages && order.shippingDetails.productionImages.length > 0 && (
                <div className="mb-2">
                    <div className="flex gap-1 flex-wrap">
                        {order.shippingDetails.productionImages.map((img, idx) => (
                            <img
                                key={idx}
                                src={img}
                                className="w-8 h-8 object-cover rounded-md border border-gray-200 shadow-xs hover:scale-110 transition-transform cursor-zoom-in"
                                alt="Producción"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewImage(img);
                                }}
                            />
                        ))}
                    </div>
                </div>
            )}

            <ImagePreviewModal
                isOpen={!!previewImage}
                onClose={() => setPreviewImage(null)}
                src={previewImage || ''}
                title={`Producción - ${order.folio}`}
            />

            <div className="flex justify-between items-center bg-white/40 p-2 rounded-xl mt-auto">
                <div>
                    <p className="text-[9px] text-gray-400 font-black uppercase leading-none">Saldo</p>
                    <p className={`text-sm font-black ${(order.balance || 0) > 0 ? 'text-red-500' : 'text-green-600'}`}>
                        L {(order.balance || 0).toFixed(2)}
                    </p>
                </div>
                <div className="flex flex-col items-end">
                    {getStatusBadge(order.fulfillmentStatus)}
                </div>
            </div>
        </div>
    );
};
