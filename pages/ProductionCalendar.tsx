
import React, { useState, useMemo } from 'react';
import { Sale, FulfillmentStatus } from '../types';
import { Card, Button, Badge, Modal } from '../components/UIComponents';

interface ProductionCalendarProps {
    sales: Sale[];
    onNavigate?: (page: string, params?: any) => void;
}

export const ProductionCalendar: React.FC<ProductionCalendarProps> = ({ sales, onNavigate }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    // Filter sales that are active and have a delivery date (orders)
    const activeOrders = useMemo(() => {
        return sales.filter(s => s.status === 'active' && s.fulfillmentStatus !== 'delivered' && s.deliveryDate);
    }, [sales]);

    // Calendar logic
    const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthNames = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const goToToday = () => setCurrentDate(new Date());

    // Selected Day Modal
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const getOrdersForDay = (day: number) => {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return activeOrders.filter(s => s.deliveryDate === dateStr);
    };

    const getStatusColor = (status: FulfillmentStatus) => {
        switch (status) {
            case 'pending': return 'bg-yellow-400';
            case 'design': return 'bg-pink-400';
            case 'printing': return 'bg-purple-500';
            case 'production': return 'bg-blue-500';
            case 'qc': return 'bg-indigo-500';
            case 'ready': return 'bg-green-500';
            default: return 'bg-gray-400';
        }
    };

    const renderCalendar = () => {
        const totalDays = daysInMonth(year, month);
        const startDay = firstDayOfMonth(year, month);
        const prevMonthDays = daysInMonth(year, month - 1);
        const cells = [];

        // Previous month empty days
        for (let i = startDay - 1; i >= 0; i--) {
            cells.push(
                <div key={`prev-${i}`} className="h-32 bg-gray-50/50 border border-gray-100 p-2 opacity-30 select-none">
                    <span className="text-xs font-bold text-gray-400">{prevMonthDays - i}</span>
                </div>
            );
        }

        // Current month days
        for (let day = 1; day <= totalDays; day++) {
            const dayOrders = getOrdersForDay(day);
            const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();

            cells.push(
                <div
                    key={day}
                    className={`h-32 border border-gray-100 p-2 transition-all cursor-pointer hover:bg-gray-50 group flex flex-col ${isToday ? 'bg-primary/5 border-primary/20 ring-1 ring-inset ring-primary/20' : 'bg-white'}`}
                    onClick={() => {
                        if (dayOrders.length > 0) {
                            setSelectedDay(day);
                            setIsModalOpen(true);
                        }
                    }}
                >
                    <div className="flex justify-between items-start mb-1">
                        <span className={`text-sm font-black w-6 h-6 flex items-center justify-center rounded-lg ${isToday ? 'bg-primary text-white shadow-md shadow-primary/30' : 'text-gray-400 group-hover:text-primary'}`}>
                            {day}
                        </span>
                        {dayOrders.length > 0 && (
                            <span className="text-[10px] font-black bg-gray-100 px-1.5 py-0.5 rounded-md text-gray-600">
                                {dayOrders.length} {dayOrders.length === 1 ? 'ped.' : 'peds.'}
                            </span>
                        )}
                    </div>

                    <div className="flex-1 overflow-hidden space-y-1">
                        {dayOrders.slice(0, 3).map(order => (
                            <div key={order.id} className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-gray-50 border border-gray-100 truncate">
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(order.fulfillmentStatus)} animate-pulse`}></div>
                                <span className="text-[9px] font-bold text-gray-700 truncate">{order.customerName || 'C. Final'}</span>
                            </div>
                        ))}
                        {dayOrders.length > 3 && (
                            <div className="text-[9px] font-black text-primary px-1 underline">+ {dayOrders.length - 3} más...</div>
                        )}
                    </div>
                </div>
            );
        }

        // Next month empty days to fill the week
        const remainingCells = (7 - (cells.length % 7)) % 7;
        for (let i = 1; i <= remainingCells; i++) {
            cells.push(
                <div key={`next-${i}`} className="h-32 bg-gray-50/50 border border-gray-100 p-2 opacity-30 select-none">
                    <span className="text-xs font-bold text-gray-400">{i}</span>
                </div>
            );
        }

        return cells;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
                        <i className="fas fa-calendar-alt text-xl"></i>
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">{monthNames[month]} {year}</h1>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Agenda de Producción</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-2xl">
                    <Button variant="secondary" size="sm" className="bg-white border-none shadow-sm hover:bg-gray-50 h-10 w-10 !p-0" onClick={prevMonth}>
                        <i className="fas fa-chevron-left"></i>
                    </Button>
                    <Button variant="secondary" size="sm" className="bg-white border-none shadow-sm font-black px-4 h-10" onClick={goToToday}>
                        Hoy
                    </Button>
                    <Button variant="secondary" size="sm" className="bg-white border-none shadow-sm hover:bg-gray-50 h-10 w-10 !p-0" onClick={nextMonth}>
                        <i className="fas fa-chevron-right"></i>
                    </Button>
                </div>
            </div>

            <Card className="p-0 overflow-hidden border-none shadow-xl shadow-gray-200/50">
                <div className="grid grid-cols-7 bg-gray-100 border-b border-gray-200">
                    {['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map(d => (
                        <div key={d} className="p-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">{d}</div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {renderCalendar()}
                </div>
            </Card>

            <div className="flex flex-wrap gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2">Leyenda de Estados:</span>
                {[
                    { status: 'pending', label: 'Pendiente' },
                    { status: 'design', label: 'Diseño' },
                    { status: 'printing', label: 'Impresión' },
                    { status: 'production', label: 'En Taller' },
                    { status: 'qc', label: 'Control Calidad' },
                    { status: 'ready', label: 'Listo' }
                ].map(item => (
                    <div key={item.status} className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(item.status as any)}`}></div>
                        <span className="text-xs font-bold text-gray-600">{item.label}</span>
                    </div>
                ))}
            </div>

            {/* Modal para ver pedidos del día */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={`Pedidos para el ${selectedDay} de ${monthNames[month]}`}
                size="lg"
            >
                <div className="space-y-4">
                    {selectedDay && getOrdersForDay(selectedDay).map(order => (
                        <div
                            key={order.id}
                            className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex justify-between items-center group cursor-pointer hover:border-primary/30 transition-all"
                            onClick={() => onNavigate && onNavigate('orders', { folio: order.folio })}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg ${getStatusColor(order.fulfillmentStatus)}`}>
                                    <i className="fas fa-box-open text-lg"></i>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-black text-gray-900">{order.folio}</span>
                                        <Badge variant="info" className="text-[10px] uppercase">{order.fulfillmentStatus}</Badge>
                                    </div>
                                    <p className="text-sm font-bold text-gray-500">{order.customerName || 'Consumidor Final'}</p>
                                    <div className="mt-1 flex gap-1 flex-wrap">
                                        {(order.items || []).slice(0, 2).map((item, idx) => (
                                            <span key={idx} className="text-[9px] bg-white border px-1.5 py-0.5 rounded text-gray-400 font-bold">{item.quantity}x {item.name}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <Button variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <i className="fas fa-arrow-right text-primary"></i>
                            </Button>
                        </div>
                    ))}
                    <div className="pt-4 border-t flex justify-end">
                        <Button onClick={() => setIsModalOpen(false)} variant="secondary">Cerrar</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
