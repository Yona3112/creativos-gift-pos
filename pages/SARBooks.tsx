
import React, { useState, useEffect, useMemo } from 'react';
import { Sale, Expense } from '../types';
import { Card, Button, Input, Badge, Modal } from '../components/UIComponents';
import { db } from '../services/storageService';

type TabType = 'ingresos' | 'gastos' | 'impuestos';

export const SARBooks: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabType>('ingresos');
    const [sales, setSales] = useState<Sale[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date();
        d.setDate(1); // First day of month
        return d.toISOString().split('T')[0];
    });
    const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

    useEffect(() => {
        const load = async () => {
            const s = await db.getSales();
            const e = await db.getExpenses();
            setSales(s.filter(sale => sale.status === 'active'));
            setExpenses(e);
        };
        load();
    }, []);

    // Helper para fechas locales (evita fallos de zona horaria)
    const getLocalDate = (dateStr: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().split('T')[0];
    };

    // Filter by date range
    const filteredSales = useMemo(() => {
        return sales.filter(s => {
            const saleDate = getLocalDate(s.date);
            return saleDate >= dateFrom && saleDate <= dateTo;
        }).sort((a, b) => a.date.localeCompare(b.date));
    }, [sales, dateFrom, dateTo]);

    const filteredExpenses = useMemo(() => {
        return expenses.filter(e => {
            return e.date >= dateFrom && e.date <= dateTo;
        }).sort((a, b) => a.date.localeCompare(b.date));
    }, [expenses, dateFrom, dateTo]);

    // Calculate totals
    const totals = useMemo(() => {
        const totalVentas = filteredSales.reduce((acc, s) => acc + (s.total || 0), 0);
        const totalISV = filteredSales.reduce((acc, s) => acc + (s.taxAmount || 0), 0);
        const totalGastos = filteredExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);

        const ventasNetas = Number((totalVentas - totalISV).toFixed(2));
        const utilidadBruta = Number((ventasNetas - totalGastos).toFixed(2));

        return {
            totalVentas: Number(totalVentas.toFixed(2)),
            totalISV: Number(totalISV.toFixed(2)),
            totalGastos: Number(totalGastos.toFixed(2)),
            ventasNetas,
            utilidadBruta
        };
    }, [filteredSales, filteredExpenses]);

    const exportToCSV = async (type: 'ingresos' | 'gastos') => {
        const settings = await db.getSettings();
        let csv = '';
        let filename = '';

        // Add company header for SAR compliance
        csv += `"EMPRESA:","${settings.name || 'Mi Empresa'}"\n`;
        csv += `"RTN:","${settings.rtn || ''}"\n`;
        csv += `"DIRECCIÓN:","${settings.address || ''}"\n`;
        csv += `"PERÍODO:","${dateFrom} al ${dateTo}"\n`;
        csv += `"GENERADO:","${new Date().toLocaleString()}"\n`;
        csv += '\n';

        if (type === 'ingresos') {
            csv += '"LIBRO DIARIO DE INGRESOS - FORMATO SAR"\n\n';
            csv += '"Fecha","N° Factura","CAI","Cliente","Subtotal (sin ISV)","ISV 15%","Total"\n';

            filteredSales.forEach(s => {
                const subtotal = s.subtotal || (s.total / 1.15);
                const isv = s.taxAmount || (s.total - subtotal);
                csv += `"${getLocalDate(s.date)}","${s.folio || s.invoiceNumber || s.id.slice(-8)}","${s.cai || settings.cai || ''}","${s.customerName || 'Consumidor Final'}","${subtotal.toFixed(2)}","${isv.toFixed(2)}","${(s.total || 0).toFixed(2)}"\n`;
            });

            // Add totals row
            csv += '\n';
            csv += `"","","","TOTALES:","${totals.ventasNetas.toFixed(2)}","${totals.totalISV.toFixed(2)}","${totals.totalVentas.toFixed(2)}"\n`;
            csv += '\n';
            csv += `"Total Transacciones:","${filteredSales.length}"\n`;

            filename = `Libro_Ingresos_SAR_${dateFrom}_${dateTo}.csv`;
        } else {
            csv += '"LIBRO DIARIO DE GASTOS Y EGRESOS"\n\n';
            csv += '"Fecha","Categoría","Descripción","Método de Pago","Monto"\n';

            filteredExpenses.forEach(e => {
                csv += `"${e.date}","${e.categoryId}","${e.description}","${e.paymentMethod}","${e.amount.toFixed(2)}"\n`;
            });

            csv += '\n';
            csv += `"","","","TOTAL GASTOS:","${totals.totalGastos.toFixed(2)}"\n`;
            csv += `"Total Registros:","${filteredExpenses.length}"\n`;

            filename = `Libro_Gastos_SAR_${dateFrom}_${dateTo}.csv`;
        }

        // Add BOM for Excel to recognize UTF-8
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                        <i className="fas fa-book text-primary"></i>
                        Libros Contables SAR
                    </h1>
                    <p className="text-sm text-gray-500">Registros de ingresos, gastos e impuestos para la SAR</p>
                </div>
                <div className="flex gap-2 items-end">
                    <Input label="Desde" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
                    <Input label="Hasta" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
                </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-white p-1 rounded-xl border shadow-sm">
                {[
                    { id: 'ingresos', label: 'Libro de Ingresos', icon: 'arrow-up', color: 'text-green-600' },
                    { id: 'gastos', label: 'Libro de Gastos', icon: 'arrow-down', color: 'text-red-600' },
                    { id: 'impuestos', label: 'Resumen ISV', icon: 'percentage', color: 'text-blue-600' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabType)}
                        className={`flex-1 px-4 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${activeTab === tab.id ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <i className={`fas fa-${tab.icon}`}></i> {tab.label}
                    </button>
                ))}
            </div>

            {/* Libro de Ingresos */}
            {activeTab === 'ingresos' && (
                <Card noPadding>
                    <div className="p-4 border-b flex justify-between items-center bg-green-50">
                        <div>
                            <h2 className="font-bold text-green-800">Libro Diario de Ingresos</h2>
                            <p className="text-xs text-green-600">Registro de ventas con desglose de ISV 15%</p>
                        </div>
                        <Button onClick={() => exportToCSV('ingresos')} variant="secondary" icon="download">Exportar CSV</Button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                                <tr>
                                    <th className="p-3 text-left">Fecha</th>
                                    <th className="p-3 text-left">N° Factura</th>
                                    <th className="p-3 text-left">Cliente</th>
                                    <th className="p-3 text-right">Subtotal</th>
                                    <th className="p-3 text-right">ISV 15%</th>
                                    <th className="p-3 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredSales.map(s => (
                                    <tr key={s.id} className="hover:bg-gray-50">
                                        <td className="p-3 font-mono text-xs">{getLocalDate(s.date)}</td>
                                        <td className="p-3 font-bold">{s.invoiceNumber || s.id.slice(-6)}</td>
                                        <td className="p-3">{s.customerName || 'Consumidor Final'}</td>
                                        <td className="p-3 text-right">L {(s.subtotal || 0).toFixed(2)}</td>
                                        <td className="p-3 text-right text-blue-600">L {(s.taxAmount || 0).toFixed(2)}</td>
                                        <td className="p-3 text-right font-bold">L {(s.total || 0).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-green-100 font-bold">
                                <tr>
                                    <td colSpan={3} className="p-3">TOTALES</td>
                                    <td className="p-3 text-right">L {totals.ventasNetas.toFixed(2)}</td>
                                    <td className="p-3 text-right text-blue-600">L {totals.totalISV.toFixed(2)}</td>
                                    <td className="p-3 text-right">L {totals.totalVentas.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Card>
            )}

            {/* Libro de Gastos */}
            {activeTab === 'gastos' && (
                <Card noPadding>
                    <div className="p-4 border-b flex justify-between items-center bg-red-50">
                        <div>
                            <h2 className="font-bold text-red-800">Libro Diario de Gastos</h2>
                            <p className="text-xs text-red-600">Registro de egresos y gastos operativos</p>
                        </div>
                        <Button onClick={() => exportToCSV('gastos')} variant="secondary" icon="download">Exportar CSV</Button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                                <tr>
                                    <th className="p-3 text-left">Fecha</th>
                                    <th className="p-3 text-left">Categoría</th>
                                    <th className="p-3 text-left">Descripción</th>
                                    <th className="p-3 text-left">Método Pago</th>
                                    <th className="p-3 text-right">Monto</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredExpenses.map(e => (
                                    <tr key={e.id} className="hover:bg-gray-50">
                                        <td className="p-3 font-mono text-xs">{e.date}</td>
                                        <td className="p-3"><Badge>{e.categoryId}</Badge></td>
                                        <td className="p-3">{e.description}</td>
                                        <td className="p-3 text-xs">{e.paymentMethod}</td>
                                        <td className="p-3 text-right font-bold text-red-600">L {e.amount.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-red-100 font-bold">
                                <tr>
                                    <td colSpan={4} className="p-3">TOTAL GASTOS</td>
                                    <td className="p-3 text-right text-red-700">L {totals.totalGastos.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Card>
            )}

            {/* Resumen ISV */}
            {activeTab === 'impuestos' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="bg-green-50 border-green-200">
                            <p className="text-xs font-bold text-green-600 uppercase">Ventas Brutas</p>
                            <p className="text-3xl font-black text-green-800">L {totals.totalVentas.toLocaleString()}</p>
                            <p className="text-xs text-green-600 mt-1">{filteredSales.length} transacciones</p>
                        </Card>
                        <Card className="bg-blue-50 border-blue-200">
                            <p className="text-xs font-bold text-blue-600 uppercase">ISV Cobrado (15%)</p>
                            <p className="text-3xl font-black text-blue-800">L {totals.totalISV.toLocaleString()}</p>
                            <p className="text-xs text-blue-600 mt-1">A declarar a la SAR</p>
                        </Card>
                        <Card className="bg-red-50 border-red-200">
                            <p className="text-xs font-bold text-red-600 uppercase">Total Gastos</p>
                            <p className="text-3xl font-black text-red-800">L {totals.totalGastos.toLocaleString()}</p>
                            <p className="text-xs text-red-600 mt-1">{filteredExpenses.length} registros</p>
                        </Card>
                    </div>

                    <Card className="bg-gradient-to-r from-primary to-accent text-white">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-sm opacity-80">Utilidad Bruta (Ingresos - ISV - Gastos)</p>
                                <p className="text-4xl font-black">L {totals.utilidadBruta.toLocaleString()}</p>
                            </div>
                            <i className="fas fa-chart-line text-6xl opacity-20"></i>
                        </div>
                    </Card>

                    <Card>
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <i className="fas fa-info-circle text-blue-500"></i>
                            Información SAR Honduras
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                            <div className="p-3 bg-gray-50 rounded-lg">
                                <p className="font-bold text-gray-800">Declaración ISV</p>
                                <p>Dentro de los primeros 10 días del mes siguiente</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg">
                                <p className="font-bold text-gray-800">Conservación</p>
                                <p>Mantener registros por 5 años mínimo</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg">
                                <p className="font-bold text-gray-800">Tasa ISV</p>
                                <p>15% general, 18% para licores/cigarrillos</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg">
                                <p className="font-bold text-gray-800">Facturación</p>
                                <p>Entregar factura con desglose ISV al cliente</p>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {filteredSales.length === 0 && activeTab === 'ingresos' && (
                <div className="text-center py-12 bg-white rounded-2xl border border-dashed">
                    <i className="fas fa-inbox text-4xl text-gray-200 mb-3"></i>
                    <p className="text-gray-400">No hay ventas en el período seleccionado</p>
                </div>
            )}

            {filteredExpenses.length === 0 && activeTab === 'gastos' && (
                <div className="text-center py-12 bg-white rounded-2xl border border-dashed">
                    <i className="fas fa-inbox text-4xl text-gray-200 mb-3"></i>
                    <p className="text-gray-400">No hay gastos en el período seleccionado</p>
                </div>
            )}
        </div>
    );
};
