
import React, { useState, useEffect } from 'react';
import { Expense, User, UserRole, CompanySettings } from '../types';
import { Card, Button, Input, Modal, Badge, PasswordConfirmDialog, showToast } from '../components/UIComponents';
import { db } from '../services/storageService';
import { FixedExpense } from '../types';

interface ExpensesProps {
    user: User | null;
    onUpdate: () => void;
    settings?: CompanySettings;
}

export const Expenses: React.FC<ExpensesProps> = ({ user, onUpdate, settings }) => {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
    const [activeTab, setActiveTab] = useState<'history' | 'fixed'>('history');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isFixedModalOpen, setIsFixedModalOpen] = useState(false);

    // Helper for Honduras Time
    const getLocalTodayISO = () => {
        const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Tegucigalpa" }));
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [formData, setFormData] = useState<Partial<Expense>>({
        categoryId: 'Otros',
        paymentMethod: 'Efectivo',
        amount: 0,
        description: '',
        date: getLocalTodayISO()
    });

    const [fixedFormData, setFixedFormData] = useState<Partial<FixedExpense>>({
        categoryId: 'Otros',
        paymentMethod: 'Efectivo',
        amount: 0,
        description: '',
        active: true
    });

    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; type: 'expense' | 'fixed' }>({ open: false, id: '', type: 'expense' });

    useEffect(() => { load(); }, []);

    const load = async () => {
        const [expData, fixedData] = await Promise.all([
            db.getExpenses(),
            db.getFixedExpenses()
        ]);
        setExpenses(expData.sort((a, b) => b.date.localeCompare(a.date)));
        setFixedExpenses(fixedData);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            showToast("Sesión no válida. Por favor, reingrese.", "error");
            return;
        }
        await db.saveExpense({ ...formData, userId: user.id } as Expense);
        await load();
        onUpdate();
        setIsModalOpen(false);
        setFormData({ categoryId: 'Otros', paymentMethod: 'Efectivo', amount: 0, description: '', date: getLocalTodayISO() });
        showToast("Gasto registrado exitosamente.", "success");
    };

    const handleFixedSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await db.saveFixedExpense({ ...fixedFormData } as FixedExpense);
        await load();
        await load();
        setIsFixedModalOpen(false);
        showToast(fixedFormData.id ? "Plantilla actualizada." : "Plantilla guardada exitosamente.", "success");
    };

    const handleDelete = async (id: string, type: 'expense' | 'fixed') => {
        setDeleteConfirm({ open: true, id, type });
    };

    const handleApplyFixed = async () => {
        if (!user) return;
        const activeFixed = fixedExpenses.filter(f => f.active);
        if (activeFixed.length === 0) {
            showToast("No hay gastos fijos activos para aplicar.", "warning");
            return;
        }

        // Use local time for checks
        const todayStr = getLocalTodayISO();
        const monthYear = todayStr.substring(0, 7); // e.g., "2026-01"

        // Verificar si ya se aplicaron este mes (búsqueda simple por descripción y mes)
        const currentMonthExpenses = expenses.filter(e => e.date.startsWith(monthYear));

        let count = 0;
        for (const fixed of activeFixed) {
            const alreadyExists = currentMonthExpenses.some(e =>
                e.description === fixed.description &&
                Math.abs(e.amount - fixed.amount) < 0.01
            );

            if (!alreadyExists) {
                await db.saveExpense({
                    id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
                    date: todayStr,
                    description: fixed.description,
                    amount: fixed.amount,
                    categoryId: fixed.categoryId,
                    paymentMethod: fixed.paymentMethod,
                    userId: user.id
                });
                count++;
            }
        }

        if (count > 0) {
            showToast(`Se generaron ${count} gastos fijos para este mes.`, "success");
            await load();
            onUpdate();
        } else {
            showToast("Los gastos fijos de este mes ya han sido registrados.", "info");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-black text-gray-800">Gastos y Egresos</h1>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setActiveTab('fixed')} icon="cog" className={activeTab === 'fixed' ? 'bg-primary text-white border-primary' : ''}>
                        Configurar Fijos
                    </Button>
                    <Button onClick={() => {
                        if (activeTab === 'fixed') {
                            setFixedFormData({ categoryId: 'Otros', paymentMethod: 'Efectivo', amount: 0, description: '', active: true });
                            setIsFixedModalOpen(true);
                        } else {
                            setFormData({ categoryId: 'Otros', paymentMethod: 'Efectivo', amount: 0, description: '', date: getLocalTodayISO() });
                            setIsModalOpen(true);
                        }
                    }} icon="plus">
                        {activeTab === 'fixed' ? 'Nueva Plantilla' : 'Nuevo Gasto'}
                    </Button>
                </div>
            </div>

            <div className="flex border-b border-gray-200">
                <button onClick={() => setActiveTab('history')} className={`px-6 py-3 text-sm font-bold transition-colors border-b-2 ${activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    Historial de Gastos
                </button>
                <button onClick={() => setActiveTab('fixed')} className={`px-6 py-3 text-sm font-bold transition-colors border-b-2 ${activeTab === 'fixed' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    Plantillas (Gastos Fijos)
                </button>
            </div>

            {activeTab === 'history' ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-red-50 border-red-100">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs font-bold text-red-600 uppercase">Total Gastos (Mes Actual)</p>
                                    <p className="text-3xl font-black text-red-800">L {expenses.filter(e => e.date.startsWith(getLocalTodayISO().substring(0, 7))).reduce((a, b) => a + b.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                                <Button size="sm" variant="success" icon="magic" onClick={handleApplyFixed}>Aplicar Fijos</Button>
                            </div>
                        </Card>
                    </div>

                    <Card noPadding>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="p-4">Fecha</th>
                                        <th className="p-4">Categoría</th>
                                        <th className="p-4">Descripción</th>
                                        <th className="p-4">Pago</th>
                                        <th className="p-4 text-right">Monto</th>
                                        <th className="p-4 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {expenses.map(exp => (
                                        <tr key={exp.id} className="hover:bg-gray-50">
                                            <td className="p-4 font-medium">{exp.date}</td>
                                            <td className="p-4"><Badge variant="default">{exp.categoryId}</Badge></td>
                                            <td className="p-4 text-gray-600">{exp.description}</td>
                                            <td className="p-4 text-xs font-bold">{exp.paymentMethod}</td>
                                            <td className="p-4 text-right font-black text-red-600">L {exp.amount.toFixed(2)}</td>
                                            <td className="p-4 text-right space-x-3">
                                                <button onClick={() => {
                                                    setFormData(exp);
                                                    setIsModalOpen(true);
                                                }} className="text-blue-500 hover:text-blue-700"><i className="fas fa-edit"></i></button>
                                                <button onClick={() => handleDelete(exp.id, 'expense')} className="text-red-400 hover:text-red-600"><i className="fas fa-trash"></i></button>
                                            </td>
                                        </tr>
                                    ))}
                                    {expenses.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-gray-400">No hay gastos registrados</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </>
            ) : (
                <Card noPadding>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="p-4">Descripción (Plantilla)</th>
                                    <th className="p-4">Categoría</th>
                                    <th className="p-4">Pago Predeterminado</th>
                                    <th className="p-4">Estado</th>
                                    <th className="p-4 text-right">Monto</th>
                                    <th className="p-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {fixedExpenses.map(fixed => (
                                    <tr key={fixed.id} className="hover:bg-gray-50">
                                        <td className="p-4 font-bold text-gray-800">{fixed.description}</td>
                                        <td className="p-4"><Badge>{fixed.categoryId}</Badge></td>
                                        <td className="p-4 text-xs">{fixed.paymentMethod}</td>
                                        <td className="p-4">
                                            <Badge variant={fixed.active ? 'success' : 'default'}>{fixed.active ? 'Activo' : 'Inactivo'}</Badge>
                                        </td>
                                        <td className="p-4 text-right font-black">L {fixed.amount.toFixed(2)}</td>
                                        <td className="p-4 text-right space-x-3">
                                            <button onClick={() => {
                                                setFixedFormData(fixed);
                                                setIsFixedModalOpen(true);
                                            }} className="text-blue-500 hover:text-blue-700"><i className="fas fa-edit"></i></button>
                                            <button onClick={() => handleDelete(fixed.id, 'fixed')} className="text-red-400 hover:text-red-600"><i className="fas fa-trash"></i></button>
                                        </td>
                                    </tr>
                                ))}
                                {fixedExpenses.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-10 text-center text-gray-400">
                                            <p className="font-bold">No tienes gastos fijos configurados.</p>
                                            <p className="text-xs">Usa gastos fijos para rentas, sueldos, servicios, etc.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setFormData({ categoryId: 'Otros', paymentMethod: 'Efectivo', amount: 0, description: '', date: getLocalTodayISO() }); }} title={formData.id ? "Editar Gasto" : "Registrar Egreso"}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input label="Fecha" type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} required />
                    <Input label="Descripción del Gasto" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} required placeholder="Ej: Pago de Luz local 2" />
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Categoría</label>
                            <select className="w-full p-3 border rounded-xl bg-white" value={formData.categoryId} onChange={e => setFormData({ ...formData, categoryId: e.target.value as any })}>
                                {['Alquiler', 'Servicios', 'Sueldos', 'Publicidad', 'Insumos', 'Transporte', 'Otros'].map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <Input label="Monto (L)" type="number" step="0.01" value={formData.amount} onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) })} required />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Método de Pago</label>
                        <select className="w-full p-3 border rounded-xl bg-white" value={formData.paymentMethod} onChange={e => setFormData({ ...formData, paymentMethod: e.target.value as any })}>
                            {['Efectivo', 'Tarjeta', 'Transferencia'].map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <Button type="submit" className="w-full">Guardar Gasto</Button>
                </form>
            </Modal>

            <Modal isOpen={isFixedModalOpen} onClose={() => setIsFixedModalOpen(false)} title={fixedFormData.id ? "Editar Gasto Fijo" : "Configurar Gasto Fijo"}>
                <form onSubmit={handleFixedSubmit} className="space-y-4">
                    <Input label="Descripción de la Plantilla" value={fixedFormData.description} onChange={e => setFixedFormData({ ...fixedFormData, description: e.target.value })} required placeholder="Ej: Renta de Local" />
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Categoría</label>
                            <select className="w-full p-3 border rounded-xl bg-white" value={fixedFormData.categoryId} onChange={e => setFixedFormData({ ...fixedFormData, categoryId: e.target.value as any })}>
                                {['Alquiler', 'Servicios', 'Sueldos', 'Publicidad', 'Insumos', 'Transporte', 'Otros'].map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <Input label="Monto Predeterminado (L)" type="number" step="0.01" value={fixedFormData.amount} onChange={e => setFixedFormData({ ...fixedFormData, amount: parseFloat(e.target.value) })} required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Método de Pago</label>
                            <select className="w-full p-3 border rounded-xl bg-white" value={fixedFormData.paymentMethod} onChange={e => setFixedFormData({ ...fixedFormData, paymentMethod: e.target.value as any })}>
                                {['Efectivo', 'Tarjeta', 'Transferencia'].map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center gap-2 pt-8">
                            <input type="checkbox" checked={fixedFormData.active} onChange={e => setFixedFormData({ ...fixedFormData, active: e.target.checked })} className="w-5 h-5 accent-primary" />
                            <span className="text-sm font-bold">Plantilla Activa</span>
                        </div>
                    </div>
                    <Button type="submit" className="w-full">{fixedFormData.id ? 'Actualizar Plantilla' : 'Guardar Plantilla'}</Button>
                </form>
            </Modal>

            <PasswordConfirmDialog
                isOpen={deleteConfirm.open}
                title={deleteConfirm.type === 'expense' ? "Eliminar Gasto" : "Eliminar Plantilla"}
                message={deleteConfirm.type === 'expense'
                    ? "¿Estás seguro de eliminar este registro de gasto? Esta acción no se puede deshacer."
                    : "¿Estás seguro de eliminar esta plantilla de gasto fijo? No afectará a los gastos ya registrados."
                }
                confirmText="Eliminar"
                cancelText="Cancelar"
                variant="danger"
                masterPassword={settings?.masterPassword || ''}
                isAdmin={user?.role === UserRole.ADMIN}
                onConfirm={async () => {
                    if (deleteConfirm.type === 'expense') {
                        await db.deleteExpense(deleteConfirm.id);
                    } else {
                        await db.deleteFixedExpense(deleteConfirm.id);
                    }
                    setDeleteConfirm({ ...deleteConfirm, open: false });
                    await load();
                    onUpdate();
                    showToast("Registro eliminado correctamente.", "success");
                }}
                onCancel={() => setDeleteConfirm({ ...deleteConfirm, open: false })}
            />
        </div>
    );
};
