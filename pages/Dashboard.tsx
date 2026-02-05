
import React, { useMemo, useState, useEffect } from 'react';
import { Product, Sale, CreditAccount, Customer, Consumable } from '../types';
import { Card, Button, Badge } from '../components/UIComponents';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { NotificationService, SystemNotification } from '../services/NotificationService';

interface DashboardProps {
    products: Product[];
    sales: Sale[];
    credits: CreditAccount[];
    customers: Customer[];
    consumables: Consumable[]; // Prop nueva
    onNavigate?: (page: string, params?: any) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-white p-3 rounded-xl shadow-xl border border-gray-100 text-xs z-50">
                <p className="font-bold text-gray-900 mb-2 pb-1 border-b border-gray-100">{label}</p>
                <div className="space-y-1.5">
                    <div className="flex justify-between items-center gap-6">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                            <span className="text-gray-500">Venta Total</span>
                        </div>
                        <span className="font-bold text-indigo-600">L {data.total.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center gap-6">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                            <span className="text-gray-500">Ingreso Neto</span>
                        </div>
                        <span className="font-bold text-blue-600">L {data.netRevenue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center gap-6">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            <span className="text-gray-500">Utilidad Bruta</span>
                        </div>
                        <span className="font-bold text-green-600">L {data.profit.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        );
    }
    return null;
};

export const Dashboard: React.FC<DashboardProps> = ({ products, sales, credits, customers, consumables, onNavigate }) => {
    // Notification state
    const [notifications, setNotifications] = useState<SystemNotification[]>([]);
    const [reorderSuggestions, setReorderSuggestions] = useState<Awaited<ReturnType<typeof NotificationService.getReorderSuggestions>>>([]);

    // Load notifications and reorder suggestions on mount
    useEffect(() => {
        const loadNotifications = async () => {
            const notifs = await NotificationService.getAllNotifications();
            setNotifications(notifs);
            const reorder = await NotificationService.getReorderSuggestions();
            setReorderSuggestions(reorder);
        };
        loadNotifications();
    }, [products, credits]); // Reload when data changes

    // Helper for Local Date (Fix UTC Bug)
    const getLocalDate = (d: Date = new Date()) => {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    };

    const today = getLocalDate();
    const currentMonthPrefix = today.substring(0, 7);

    const stats = useMemo(() => {
        // --- NEW REVENUE-BASED LOGIC ---
        // 1. Initial deposits from sales created today
        const initialDepositsToday = sales
            .filter(s => getLocalDate(new Date(s.date)) === today && s.status === 'active')
            .reduce((acc, s) => acc + (s.deposit || 0), 0);

        // 2. Balance payments for orders completed today
        const balancePaymentsToday = sales
            .filter(s => s.balancePaymentDate && getLocalDate(new Date(s.balancePaymentDate)) === today && s.status === 'active')
            .reduce((acc, s) => acc + (s.balancePaid || 0), 0);

        // 3. Payments on credit accounts received today
        const creditPaymentsToday = (credits || []).reduce((acc, credit) => {
            const paymentsToday = (credit.payments || [])
                .filter(p => getLocalDate(new Date(p.date)) === today)
                .reduce((pAcc, p) => pAcc + p.amount, 0);
            return acc + paymentsToday;
        }, 0);

        const totalSalesToday = initialDepositsToday + balancePaymentsToday + creditPaymentsToday;

        // Inventory Logic
        const lowStock = products.filter(p => (p.enableLowStockAlert !== false) && (p.stock || 0) <= (p.minStock || 0)).length;
        const inventoryValue = products.reduce((acc, p) => acc + ((p.cost || 0) * (p.stock || 0)), 0);

        // Consumables Logic
        const lowStockConsumables = (consumables || []).filter(c => (c.stock || 0) <= (c.minStock || 0));

        // Orders Logic
        const pendingOrders = sales.filter(s => s.fulfillmentStatus === 'pending' && s.status === 'active').length;
        const designOrders = sales.filter(s => s.fulfillmentStatus === 'design' && s.status === 'active').length;
        const printingOrders = sales.filter(s => s.fulfillmentStatus === 'printing' && s.status === 'active').length;
        const productionOrders = sales.filter(s => s.fulfillmentStatus === 'production' && s.status === 'active').length;
        const readyOrders = sales.filter(s => s.fulfillmentStatus === 'ready' && s.status === 'active').length;

        // Credits Logic
        const totalReceivable = (credits || []).filter(c => c.status !== 'cancelled' && c.status !== 'paid').reduce((acc, c) => acc + ((c.totalAmount || 0) - (c.paidAmount || 0)), 0);

        return {
            totalSalesToday,
            lowStock,
            inventoryValue,
            totalReceivable,
            activeProducts: products.length,
            lowStockConsumables,
            pendingOrders,
            designOrders,
            printingOrders,
            productionOrders,
            readyOrders
        };
    }, [products, sales, credits, consumables, today]);

    // Chart Data: Last 7 Days Sales Trend
    const salesData = useMemo(() => {
        const last7Days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return getLocalDate(d);
        }).reverse();

        return last7Days.map(dateStr => {
            // Revenue breakdown for this specific day
            const initialDeposits = sales
                .filter(s => getLocalDate(new Date(s.date)) === dateStr && s.status === 'active')
                .reduce((acc, s) => acc + (s.deposit || 0), 0);

            const balancePayments = sales
                .filter(s => s.balancePaymentDate && getLocalDate(new Date(s.balancePaymentDate)) === dateStr && s.status === 'active')
                .reduce((acc, s) => acc + (s.balancePaid || 0), 0);

            const creditPayments = (credits || []).reduce((acc, credit) => {
                const dayPayments = (credit.payments || [])
                    .filter(p => getLocalDate(new Date(p.date)) === dateStr)
                    .reduce((pAcc, p) => pAcc + p.amount, 0);
                return acc + dayPayments;
            }, 0);

            const totalRevenue = initialDeposits + balancePayments + creditPayments;

            // --- PROPORTIONAL PROFIT CALCULATION ---
            // To calculate profit accurately on partial payments, we find the "Cost of Goods" 
            // proportional to the amount collected today.

            // 1. Cost from newly created sales today (proportional to deposit/total)
            const salesCreatedToday = sales.filter(s => getLocalDate(new Date(s.date)) === dateStr && s.status === 'active');
            const proportionalCostNewSales = salesCreatedToday.reduce((acc, s) => {
                const totalOrderCost = (s.items || []).reduce((sum, item) => sum + ((item.cost || 0) * item.quantity), 0);
                const paymentRatio = s.total > 0 ? (s.deposit || 0) / s.total : 1;
                return acc + (totalOrderCost * paymentRatio);
            }, 0);

            // 2. Cost from balances paid today
            const salesBalancedToday = sales.filter(s => s.balancePaymentDate && getLocalDate(new Date(s.balancePaymentDate)) === dateStr && s.status === 'active');
            const proportionalCostBalances = salesBalancedToday.reduce((acc, s) => {
                const totalOrderCost = (s.items || []).reduce((sum, item) => sum + ((item.cost || 0) * item.quantity), 0);
                const paymentRatio = s.total > 0 ? (s.balancePaid || 0) / s.total : 0;
                return acc + (totalOrderCost * paymentRatio);
            }, 0);

            // 3. Cost from credit payments (proportional to payment/totalAmount)
            // Note: We need to find the original sale to get the cost
            const creditPaymentsCost = (credits || []).reduce((acc, credit) => {
                const dayAmount = (credit.payments || [])
                    .filter(p => getLocalDate(new Date(p.date)) === dateStr)
                    .reduce((pAcc, p) => pAcc + p.amount, 0);

                if (dayAmount <= 0) return acc;

                // Find the original sale associated with this credit
                const originalSale = sales.find(s => s.id === credit.saleId);
                if (!originalSale) return acc;

                const totalOrderCost = (originalSale.items || []).reduce((sum, item) => sum + ((item.cost || 0) * item.quantity), 0);
                const paymentRatio = originalSale.total > 0 ? dayAmount / originalSale.total : 0;
                return acc + (totalOrderCost * paymentRatio);
            }, 0);

            const totalProportionalCost = proportionalCostNewSales + proportionalCostBalances + creditPaymentsCost;

            // Simple tax estimate for chart (optional, usually we care about cash profit)
            const estimatedTax = salesCreatedToday.reduce((acc, s) => {
                const paymentRatio = s.total > 0 ? (s.deposit || 0) / s.total : 1;
                return acc + (s.taxAmount * paymentRatio);
            }, 0);

            const netRevenue = totalRevenue - estimatedTax;
            const profit = netRevenue - totalProportionalCost;

            const dayName = new Date(dateStr + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });

            return {
                name: dayName,
                total: totalRevenue,
                netRevenue,
                profit
            };
        });
    }, [sales, credits]);

    // Top Products Data (Grouped by ID for consistency)
    const topProducts = useMemo(() => {
        const counts: Record<string, { name: string, qty: number }> = {};
        sales.filter(s => s.status === 'active' && getLocalDate(new Date(s.date)).startsWith(currentMonthPrefix)).forEach(s => {
            s.items.forEach(i => {
                const id = i.id;
                if (counts[id]) {
                    counts[id].qty += i.quantity;
                } else {
                    // Try to find the current live product name to handle renames
                    const liveProduct = products.find(p => p.id === id);
                    counts[id] = { name: liveProduct ? liveProduct.name : i.name, qty: i.quantity };
                }
            });
        });
        return Object.values(counts).sort((a, b) => b.qty - a.qty).slice(0, 5);
    }, [sales, currentMonthPrefix, products]);

    // Recent Activity Feed
    const recentActivity = useMemo(() => {
        return sales.filter(s => s.status === 'active')
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5);
    }, [sales]);

    return (
        <div className="space-y-6 pb-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-gray-800 tracking-tight">Panel de Control</h1>
                    <p className="text-sm text-gray-500">Resumen operativo de hoy, {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}.</p>
                </div>
            </div>

            {/* ALERTAS CRÍTICAS DE INSUMOS */}
            {stats.lowStockConsumables.length > 0 && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl shadow-sm animate-fade-in flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-start gap-3">
                        <div className="bg-red-100 p-2 rounded-full text-red-600 mt-1">
                            <i className="fas fa-exclamation-triangle"></i>
                        </div>
                        <div>
                            <h3 className="font-bold text-red-800">Alerta de Insumos Críticos</h3>
                            <p className="text-sm text-red-700">
                                Hay <strong>{stats.lowStockConsumables.length}</strong> insumos con stock bajo o agotado.
                                <span className="block text-xs mt-1 font-medium bg-red-100/50 p-1 rounded">
                                    {stats.lowStockConsumables.slice(0, 5).map(c => `${c.name} (${c.stock} ${c.unit})`).join(', ')}
                                    {stats.lowStockConsumables.length > 5 && '...'}
                                </span>
                            </p>
                        </div>
                    </div>
                    <Button size="sm" variant="danger" onClick={() => onNavigate && onNavigate('products', { tab: 'consumables' })}>
                        <i className="fas fa-tools mr-2"></i> Gestionar Insumos
                    </Button>
                </div>
            )}

            {/* PANEL DE NOTIFICACIONES DEL SISTEMA */}
            {notifications.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <i className="fas fa-bell text-primary"></i>
                            Alertas del Sistema
                            <Badge variant="danger">{notifications.length}</Badge>
                        </h3>
                    </div>
                    <div className="space-y-2">
                        {notifications.slice(0, 5).map(notif => (
                            <div
                                key={notif.id}
                                className={`flex items-center justify-between p-3 rounded-xl border-l-4 ${notif.type === 'danger' ? 'bg-red-50 border-red-500' :
                                    notif.type === 'warning' ? 'bg-amber-50 border-amber-500' :
                                        notif.type === 'info' ? 'bg-blue-50 border-blue-500' :
                                            'bg-green-50 border-green-500'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${notif.type === 'danger' ? 'bg-red-100 text-red-600' :
                                        notif.type === 'warning' ? 'bg-amber-100 text-amber-600' :
                                            notif.type === 'info' ? 'bg-blue-100 text-blue-600' :
                                                'bg-green-100 text-green-600'
                                        }`}>
                                        <i className={`fas fa-${notif.icon}`}></i>
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm text-gray-800">{notif.title}</p>
                                        <p className="text-xs text-gray-600">{notif.message}</p>
                                    </div>
                                </div>
                                {notif.action && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => onNavigate && onNavigate(notif.action!.page)}
                                    >
                                        {notif.action.label}
                                    </Button>
                                )}
                            </div>
                        ))}
                        {notifications.length > 5 && (
                            <p className="text-xs text-gray-500 text-center mt-2">
                                +{notifications.length - 5} alertas más
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* PANEL DE SUGERENCIAS DE REORDEN */}
            {reorderSuggestions.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <i className="fas fa-truck text-orange-500"></i>
                            Sugerencias de Reorden
                            <Badge variant="warning">{reorderSuggestions.length}</Badge>
                        </h3>
                        <Button size="sm" variant="ghost" onClick={() => onNavigate && onNavigate('products', { filter: 'lowStock' })}>
                            Ver Todos
                        </Button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-gray-50 text-gray-500 uppercase">
                                <tr>
                                    <th className="px-3 py-2 text-left">Producto</th>
                                    <th className="px-3 py-2 text-center">Stock</th>
                                    <th className="px-3 py-2 text-center">Sugerido</th>
                                    <th className="px-3 py-2 text-center">Días Stock</th>
                                    <th className="px-3 py-2 text-center">Urgencia</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {reorderSuggestions.slice(0, 5).map(item => (
                                    <tr key={item.productId} className="hover:bg-gray-50">
                                        <td className="px-3 py-2">
                                            <p className="font-bold text-gray-800">{item.productName}</p>
                                            <p className="text-gray-400 text-[10px]">{item.code}</p>
                                        </td>
                                        <td className="px-3 py-2 text-center font-bold text-red-500">{item.currentStock}</td>
                                        <td className="px-3 py-2 text-center font-bold text-green-600">+{item.suggestedQty}</td>
                                        <td className="px-3 py-2 text-center">
                                            {item.daysOfStock === 999 ? '∞' : `${item.daysOfStock}d`}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <Badge variant={item.urgency === 'critical' ? 'danger' : item.urgency === 'low' ? 'warning' : 'info'}>
                                                {item.urgency === 'critical' ? '🔴 Urgente' : item.urgency === 'low' ? '🟡 Bajo' : '🟢 Normal'}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* BENTO GRID LAYOUT */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">

                {/* 1. Ventas Hoy (Big Card) */}
                <div className="md:col-span-2 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden group">
                    <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-white/20 transition-all"></div>
                    <div className="relative z-10">
                        <p className="text-blue-100 font-medium mb-1">Ventas Totales (Hoy)</p>
                        <h2 className="text-4xl font-black mb-2">L {stats.totalSalesToday.toLocaleString('en-US', { minimumFractionDigits: 2 })}</h2>
                        <div className="flex gap-2 text-xs font-bold bg-white/10 w-fit px-3 py-1 rounded-full">
                            <i className="fas fa-chart-line"></i> Ingresos Diarios
                        </div>
                    </div>
                </div>

                {/* 2. Order Status Summary */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col justify-between cursor-pointer hover:border-primary/30 transition-colors" onClick={() => onNavigate && onNavigate('orders')}>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-gray-700">Pedidos Activos</h3>
                        <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center"><i className="fas fa-tasks"></i></div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <div className="flex justify-between items-center text-[10px]">
                            <span className="flex items-center gap-1.5 text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>Pendiente</span>
                            <span className="font-bold">{stats.pendingOrders}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                            <span className="flex items-center gap-1.5 text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-pink-400"></span>Diseño</span>
                            <span className="font-bold">{stats.designOrders}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                            <span className="flex items-center gap-1.5 text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>Impresión</span>
                            <span className="font-bold">{stats.printingOrders}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                            <span className="flex items-center gap-1.5 text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>Taller</span>
                            <span className="font-bold">{stats.productionOrders}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                            <span className="flex items-center gap-1.5 text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>Listos</span>
                            <span className="font-bold">{stats.readyOrders}</span>
                        </div>
                    </div>
                </div>

                {/* 3. Accounts Receivable (Money on the street) */}
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm cursor-pointer hover:border-red-300 transition-colors" onClick={() => onNavigate && onNavigate('credits')}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-gray-700">Cuentas x Cobrar</h3>
                        <div className="w-8 h-8 bg-red-100 text-red-600 rounded-lg flex items-center justify-center"><i className="fas fa-hand-holding-usd"></i></div>
                    </div>
                    <div>
                        <p className="text-2xl font-black text-gray-800">L {stats.totalReceivable.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                        <p className="text-xs text-gray-400 mt-1">Crédito pendiente de clientes</p>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 overflow-hidden">
                            <div className="bg-red-500 h-full rounded-full" style={{ width: '45%' }}></div>
                        </div>
                    </div>
                </div>

                {/* 4. Chart Section */}
                <div className="md:col-span-2 lg:col-span-3 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm h-[320px]">
                    <h3 className="font-bold text-gray-800 mb-4">Tendencia de Ventas (7 Días)</h3>
                    <div className="w-full h-[240px]" style={{ height: 240, minHeight: 240 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={salesData}>
                                <defs>
                                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="total" stroke="#4F46E5" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 5. Inventory & Activity Column */}
                <div className="lg:col-span-1 space-y-4">
                    {/* Inventory Status - Clickable for Low Stock */}
                    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm transition-all hover:border-orange-300 cursor-pointer" onClick={() => onNavigate && onNavigate('products', { filter: 'lowStock' })}>
                        <h3 className="font-bold text-gray-700 mb-3 text-sm uppercase">Salud de Inventario</h3>
                        <div className="flex items-center gap-4 mb-3">
                            <div className="flex-1">
                                <p className="text-xs text-gray-500">Valor Total (Costo)</p>
                                <p className="font-bold text-gray-800">L {stats.inventoryValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                            </div>
                            <div className="flex-1 text-right">
                                <p className="text-xs text-gray-500">Stock Bajo (Productos)</p>
                                <p className={`font-bold ${stats.lowStock > 0 ? 'text-red-500' : 'text-green-500'}`}>{stats.lowStock} items</p>
                            </div>
                        </div>
                    </div>

                    {/* Recent Activity */}
                    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex-1">
                        <h3 className="font-bold text-gray-700 mb-3 text-sm uppercase">Actividad Reciente</h3>
                        <div className="space-y-3">
                            {recentActivity.map((s) => (
                                <div key={s.id} className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs">
                                        <i className="fas fa-shopping-bag"></i>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-gray-800 truncate">{customers.find(c => c.id === s.customerId)?.name || 'Cliente'}</p>
                                        <p className="text-[10px] text-gray-400">{new Date(s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                    <span className="text-xs font-bold text-green-600">+L{s.total.toFixed(0)}</span>
                                </div>
                            ))}
                            {recentActivity.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Sin actividad hoy</p>}
                        </div>
                    </div>
                </div>

                {/* SECCIÓN: PRÓXIMAS ENTREGAS & WHATSAPP */}
                <div className="md:col-span-3 lg:col-span-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm h-full">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                                        <i className="fas fa-calendar-day"></i>
                                    </div>
                                    <h3 className="font-black text-gray-900 text-lg">Próximas Entregas</h3>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    icon="whatsapp"
                                    className="text-green-600 border-green-200 hover:bg-green-50"
                                    onClick={() => {
                                        const tomorrowArr = new Date();
                                        tomorrowArr.setDate(tomorrowArr.getDate() + 1);
                                        const tomorrowStr = getLocalDate(tomorrowArr);

                                        const todayDeliveries = sales.filter(s => getLocalDate(new Date(s.date)) === today && s.fulfillmentStatus !== 'delivered' && s.status === 'active');
                                        const tomorrowDeliveries = sales.filter(s => getLocalDate(new Date(s.date)) === tomorrowStr && s.fulfillmentStatus !== 'delivered' && s.status === 'active');

                                        let message = `🍱 *RESUMEN DE PRODUCCIÓN - CREATIVOS GIFT*\n\n`;

                                        const formatSection = (title: string, date: string, items: Sale[]) => {
                                            let sec = `📅 *${title} (${date})*\n`;
                                            sec += `━━━━━━━━━━━━━━━━━━━━\n`;
                                            if (items.length === 0) {
                                                sec += `_Sin pedidos programados_\n\n`;
                                                return sec;
                                            }

                                            // Agrupar por estado para mejor visibilidad
                                            const statuses = {
                                                'ready': { emoji: '✅', label: 'PEDIDOS LISTOS' },
                                                'production': { emoji: '🛠️', label: 'EN TALLER' },
                                                'qc': { emoji: '🔍', label: 'CONTROL CALIDAD' },
                                                'printing': { emoji: '🖨️', label: 'IMPRESIÓN' },
                                                'design': { emoji: '🎨', label: 'DISEÑO' },
                                                'pending': { emoji: '⏳', label: 'PENDIENTES' }
                                            };

                                            Object.entries(statuses).forEach(([status, info]) => {
                                                const filtered = items.filter(s => s.fulfillmentStatus === status);
                                                if (filtered.length > 0) {
                                                    sec += `*${info.emoji} ${info.label}*\n`;
                                                    filtered.forEach(s => {
                                                        sec += `• 🆔 *${s.folio}* | 👤 ${s.customerName || 'C. Final'}\n`;
                                                        // Listamos items principales
                                                        const itemsDesc = s.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
                                                        sec += `  📦 _${itemsDesc.length > 40 ? itemsDesc.substring(0, 40) + '...' : itemsDesc}_\n`;
                                                    });
                                                    sec += `\n`;
                                                }
                                            });
                                            return sec;
                                        };

                                        message += formatSection('ENTREGAS HOY', today, todayDeliveries);
                                        message += `\n`;
                                        message += formatSection('PEDIDOS PARA MAÑANA', tomorrowStr, tomorrowDeliveries);

                                        message += `\n🚀 _Generado automáticamente desde Creativos Gift POS_`;

                                        const encoded = encodeURIComponent(message);
                                        window.open(`https://wa.me/?text=${encoded}`, '_blank');
                                    }}
                                >
                                    Enviar Resumen WhatsApp
                                </Button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                        <span className="font-bold text-xs text-gray-500 uppercase">Vencen Hoy</span>
                                    </div>
                                    <div className="space-y-2">
                                        {sales.filter(s => getLocalDate(new Date(s.date)) === today && s.fulfillmentStatus !== 'delivered' && s.status === 'active').slice(0, 5).map(order => (
                                            <div key={order.id} className="flex justify-between items-center text-sm p-2 bg-white rounded-lg border border-gray-50">
                                                <span className="font-bold">{order.folio}</span>
                                                <span className="text-gray-500 truncate max-w-[100px]">{order.customerName}</span>
                                                <Badge variant={order.fulfillmentStatus === 'ready' ? 'success' : 'warning'}>
                                                    {order.fulfillmentStatus}
                                                </Badge>
                                            </div>
                                        ))}
                                        {sales.filter(s => getLocalDate(new Date(s.date)) === today && s.fulfillmentStatus !== 'delivered' && s.status === 'active').length === 0 && (
                                            <p className="text-xs text-gray-400 italic text-center py-2">Todo al día para hoy</p>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                        <span className="font-bold text-xs text-gray-500 uppercase">Para Mañana</span>
                                    </div>
                                    <div className="space-y-2">
                                        {sales.filter(s => {
                                            const tom = new Date();
                                            tom.setDate(tom.getDate() + 1);
                                            return getLocalDate(new Date(s.date)) === getLocalDate(tom) && s.fulfillmentStatus !== 'delivered' && s.status === 'active';
                                        }).slice(0, 5).map(order => (
                                            <div key={order.id} className="flex justify-between items-center text-sm p-2 bg-white rounded-lg border border-gray-50">
                                                <span className="font-bold">{order.folio}</span>
                                                <span className="text-gray-500 truncate max-w-[100px]">{order.customerName}</span>
                                                <Badge variant="info">
                                                    {order.fulfillmentStatus}
                                                </Badge>
                                            </div>
                                        ))}
                                        {sales.filter(s => {
                                            const tom = new Date();
                                            tom.setDate(tom.getDate() + 1);
                                            return getLocalDate(new Date(s.date)) === getLocalDate(tom) && s.fulfillmentStatus !== 'delivered' && s.status === 'active';
                                        }).length === 0 && (
                                                <p className="text-xs text-gray-400 italic text-center py-2">No hay pedidos para mañana</p>
                                            )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="bg-indigo-600 rounded-2xl p-6 text-white h-full shadow-lg shadow-indigo-200">
                            <h3 className="font-black text-lg mb-4 flex items-center gap-2">
                                <i className="fas fa-lightbulb"></i> Tips de Gestión
                            </h3>
                            <div className="space-y-4 text-xs opacity-90">
                                <div className="p-3 bg-white/10 rounded-xl border border-white/10">
                                    <p className="font-bold mb-1">🔥 El tiempo es oro</p>
                                    <p>Revisa tus pedidos "En Producción" cada mañana para evitar retrasos.</p>
                                </div>
                                <div className="p-3 bg-white/10 rounded-xl border border-white/10">
                                    <p className="font-bold mb-1">💬 Fideliza</p>
                                    <p>Usa los estados para informar a tus clientes. Un cliente informado es un cliente feliz.</p>
                                </div>
                                <Button
                                    className="w-full bg-white text-indigo-600 hover:bg-gray-100 font-bold border-none mt-2"
                                    onClick={() => onNavigate && onNavigate('orders')}
                                >
                                    Ver Todos los Pedidos
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="md:col-span-3 lg:col-span-4 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mt-6">
                    <h3 className="font-bold text-gray-800 mb-4">Top Productos del Mes</h3>
                    <p className="text-gray-500 font-bold text-xs uppercase tracking-widest mb-4">Información de Hoy</p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {topProducts.map((p, idx) => (
                            <div key={idx} className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
                                <div className="font-black text-2xl text-gray-200">#{idx + 1}</div>
                                <div>
                                    <p className="font-bold text-sm text-gray-700 line-clamp-1" title={p.name}>{p.name}</p>
                                    <p className="text-xs text-primary font-bold">{p.qty} vendidos</p>
                                </div>
                            </div>
                        ))}
                        {topProducts.length === 0 && <p className="text-gray-400 text-sm col-span-full text-center">No hay datos suficientes este mes.</p>}
                    </div>
                </div>

            </div>
        </div>
    );
};
