
import React, { useState, useMemo } from 'react';
import { Sale, Product, Customer, Category } from '../types';
import { Card, StatCard, Button, Input, Badge } from '../components/UIComponents';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, LineChart,
    Line, AreaChart, Area, Legend
} from 'recharts';

interface ReportsProps {
    sales: Sale[];
    products: Product[];
    customers: Customer[];
    categories: Category[];
}

export const Reports: React.FC<ReportsProps> = ({ sales: allSales, products: allProducts, customers: allCustomers, categories: allCategories }) => {
    // Helper para fechas locales
    const getLocalDate = (date: Date = new Date()) => {
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().split('T')[0];
    };

    const today = getLocalDate();
    const firstDayMonth = new Date();
    firstDayMonth.setDate(1);
    const [startDate, setStartDate] = useState(getLocalDate(firstDayMonth));
    const [endDate, setEndDate] = useState(today);
    const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'customers'>('overview');

    // 1. FILTRADO DE VENTAS POR RANGO
    const filteredSales = useMemo(() => {
        return allSales.filter(s => {
            const saleDate = getLocalDate(new Date(s.date));
            return saleDate >= startDate && saleDate <= endDate && s.status === 'active';
        });
    }, [allSales, startDate, endDate]);

    // 2. CÁLCULO DE MÉTRICAS (KPIs)
    const stats = useMemo(() => {
        let totalSales = 0;
        let totalCost = 0;
        let totalTax = 0;
        let totalDiscount = 0;

        filteredSales.forEach(s => {
            totalSales += s.total;
            totalTax += s.taxAmount || 0;
            totalDiscount += s.discount || 0;

            s.items.forEach(item => {
                totalCost += (item.cost || 0) * item.quantity;
            });
        });

        const netRevenue = totalSales - totalTax;
        const totalProfit = netRevenue - totalCost;
        const ticketAverage = filteredSales.length > 0 ? totalSales / filteredSales.length : 0;

        return { totalSales, totalProfit, ticketAverage, count: filteredSales.length, totalCost };
    }, [filteredSales]);

    // 3. DATOS PARA GRÁFICO DE TENDENCIA DIARIA
    const dailyTrendData = useMemo(() => {
        const data: Record<string, number> = {};
        const start = new Date(startDate);
        const end = new Date(endDate);

        let curr = new Date(start);
        while (curr <= end) {
            data[getLocalDate(curr)] = 0;
            curr.setDate(curr.getDate() + 1);
        }

        filteredSales.forEach(s => {
            const date = getLocalDate(new Date(s.date));
            if (data[date] !== undefined) data[date] += s.total;
        });

        return Object.keys(data).sort().map(date => ({
            name: date.split('-').slice(1).reverse().join('/'),
            total: data[date]
        }));
    }, [filteredSales, startDate, endDate]);

    // 4. DATOS DE RENTABILIDAD POR PRODUCTO
    const productPerformance = useMemo(() => {
        const map: Record<string, any> = {};

        filteredSales.forEach(sale => {
            sale.items.forEach(item => {
                const id = item.id;
                if (!map[id]) {
                    map[id] = {
                        name: item.name,
                        qty: 0,
                        revenue: 0,
                        cost: 0
                    };
                }
                map[id].qty += item.quantity;
                map[id].revenue += (item.price * item.quantity);
                map[id].cost += (item.cost || 0) * item.quantity;
            });
        });

        return Object.values(map)
            .map((p: any) => ({
                ...p,
                profit: p.revenue - p.cost,
                margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0
            }))
            .sort((a, b) => b.profit - a.profit);
    }, [filteredSales]);

    // 5. VENTAS POR CATEGORÍA (PASTEL)
    const categoryData = useMemo(() => {
        const data: Record<string, number> = {};
        filteredSales.forEach(s => {
            s.items.forEach(i => {
                const prod = allProducts.find(p => p.id === i.id);
                const catName = allCategories.find(c => c.id === prod?.categoryId)?.name || 'Sin Categoría';
                data[catName] = (data[catName] || 0) + (i.price * i.quantity);
            });
        });
        return Object.keys(data).map(name => ({ name, value: data[name] }));
    }, [filteredSales, allProducts, allCategories]);

    // 6. TOP CLIENTES (BARRAS)
    const topCustomersData = useMemo(() => {
        const map: Record<string, number> = {};
        filteredSales.forEach(s => {
            const name = allCustomers.find(c => c.id === s.customerId)?.name || 'Consumidor Final';
            map[name] = (map[name] || 0) + s.total;
        });
        return Object.keys(map)
            .map(name => ({ name, total: map[name] }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 8);
    }, [filteredSales, allCustomers]);

    const COLORS = ['#4F46E5', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4'];

    const downloadCSV = () => {
        const headers = ["Producto", "Ventas (L)", "Costo (L)", "Utilidad (L)", "Margen (%)"];
        const rows = productPerformance.map(p => `"${p.name}",${p.revenue.toFixed(2)},${p.cost.toFixed(2)},${p.profit.toFixed(2)},${p.margin.toFixed(1)}%`);
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Reporte_Rentabilidad_${startDate}_${endDate}.csv`;
        link.click();
    };

    return (
        <div className="space-y-6 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-800 tracking-tight">Reportes Avanzados</h1>
                    <p className="text-gray-500 font-medium">Análisis de rendimiento de "Creativos Gift"</p>
                </div>
                <div className="flex items-center gap-2 bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40 border-0 bg-transparent" />
                    <span className="text-gray-400 font-bold">al</span>
                    <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40 border-0 bg-transparent" />
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Ventas Brutas" value={`L ${stats.totalSales.toLocaleString()}`} icon="chart-line" color="bg-indigo-600" />
                <StatCard title="Utilidad Neta Est." value={`L ${stats.totalProfit.toLocaleString()}`} icon="coins" color="bg-green-600" />
                <StatCard title="Ticket Promedio" value={`L ${stats.ticketAverage.toFixed(2)}`} icon="tag" color="bg-orange-500" />
                <StatCard title="Transacciones" value={stats.count} icon="receipt" color="bg-purple-600" />
            </div>

            {/* TABS NAVEGACIÓN */}
            <div className="flex bg-gray-200 p-1 rounded-2xl w-fit">
                <button onClick={() => setActiveTab('overview')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-white text-indigo-600 shadow-md' : 'text-gray-500 hover:text-gray-700'}`}>
                    <i className="fas fa-th-large mr-2"></i>Vista General
                </button>
                <button onClick={() => setActiveTab('products')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'products' ? 'bg-white text-indigo-600 shadow-md' : 'text-gray-500 hover:text-gray-700'}`}>
                    <i className="fas fa-box mr-2"></i>Rentabilidad
                </button>
                <button onClick={() => setActiveTab('customers')} className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'customers' ? 'bg-white text-indigo-600 shadow-md' : 'text-gray-500 hover:text-gray-700'}`}>
                    <i className="fas fa-users mr-2"></i>Clientes
                </button>
            </div>

            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                    <Card title="Tendencia de Ventas Diarias" className="h-[400px]">
                        <div style={{ width: '100%', height: '100%', minHeight: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={dailyTrendData}>
                                    <defs>
                                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `L${v}`} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                        formatter={(v: any) => [`L ${v.toLocaleString()}`, 'Ventas']}
                                    />
                                    <Area type="monotone" dataKey="total" stroke="#4F46E5" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    <Card title="Ventas por Categoría" className="h-[400px]">
                        <div style={{ width: '100%', height: '100%', minHeight: 300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={categoryData}
                                        cx="50%" cy="50%"
                                        innerRadius={70}
                                        outerRadius={110}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {categoryData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={8} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(v: any) => `L ${v.toLocaleString()}`} />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </div>
            )}

            {activeTab === 'products' && (
                <Card noPadding className="animate-fade-in overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <h3 className="font-bold text-gray-800 text-lg">Análisis de Margen de Ganancia</h3>
                        <Button variant="secondary" size="sm" onClick={downloadCSV} icon="download">Exportar CSV</Button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-white border-b border-gray-100 text-gray-400 font-bold uppercase text-[10px] tracking-widest">
                                <tr>
                                    <th className="px-6 py-4">Producto</th>
                                    <th className="px-6 py-4 text-center">Cant.</th>
                                    <th className="px-6 py-4 text-right">Ingreso Bruto</th>
                                    <th className="px-6 py-4 text-right">Utilidad</th>
                                    <th className="px-6 py-4 text-center">Margen %</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {productPerformance.map((p, idx) => (
                                    <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                                        <td className="px-6 py-4 font-bold text-gray-700">{p.name}</td>
                                        <td className="px-6 py-4 text-center font-medium">{p.qty}</td>
                                        <td className="px-6 py-4 text-right font-bold text-gray-900">L {p.revenue.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-right font-bold text-green-600">L {p.profit.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-1 rounded-lg font-black text-xs ${p.margin > 40 ? 'bg-green-100 text-green-700' : p.margin > 20 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                                {p.margin.toFixed(1)}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {activeTab === 'customers' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                    <Card title="Top 8 Clientes por Compras" className="lg:col-span-2 h-[450px]">
                        <div style={{ width: '100%', height: '100%', minHeight: 350 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={topCustomersData} layout="vertical" margin={{ left: 40, right: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 'bold' }} width={120} />
                                    <Tooltip formatter={(v: any) => `L ${v.toLocaleString()}`} cursor={{ fill: '#f8fafc' }} />
                                    <Bar dataKey="total" fill="#4F46E5" radius={[0, 10, 10, 0]} barSize={25}>
                                        {topCustomersData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    <div className="space-y-4">
                        <Card title="Resumen de Clientes" className="bg-indigo-600 text-white border-0 shadow-xl shadow-indigo-200">
                            <div className="space-y-4">
                                <div>
                                    <p className="text-indigo-200 text-xs font-bold uppercase mb-1">Base Total Clientes</p>
                                    <p className="text-3xl font-black">{allCustomers.length}</p>
                                </div>
                                <div className="pt-4 border-t border-indigo-500/50">
                                    <p className="text-indigo-200 text-xs font-bold uppercase mb-1">Ventas a Clientes Registrados</p>
                                    <p className="text-xl font-bold">L {filteredSales.filter(s => s.customerId).reduce((acc, s) => acc + s.total, 0).toLocaleString()}</p>
                                </div>
                            </div>
                        </Card>
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-4">Información Estratégica</h4>
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center shrink-0">
                                    <i className="fas fa-lightbulb"></i>
                                </div>
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    Identifica a tus 3 mejores clientes y ofréceles una <strong>Promoción Exclusiva</strong> en el módulo de promociones para aumentar su recurrencia.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
