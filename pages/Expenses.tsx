
import React, { useState, useEffect } from 'react';
import { Expense, User, UserRole, CompanySettings } from '../types';
import { Card, Button, Input, Modal, Badge, PasswordConfirmDialog, showToast } from '../components/UIComponents';
import { db } from '../services/storageService';

interface ExpensesProps {
    user: User | null;
    onUpdate: () => void;
    settings?: CompanySettings;
}

export const Expenses: React.FC<ExpensesProps> = ({ user, onUpdate, settings }) => {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Use Honduras Time from storageService
    const getLocalTodayISO = () => db.getLocalTodayISO();

    const [formData, setFormData] = useState<Partial<Expense>>({
        categoryId: 'Otros',
        paymentMethod: 'Efectivo',
        amount: 0,
        description: '',
        date: getLocalTodayISO()
    });

    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

    useEffect(() => { load(); }, []);

    const load = async () => {
        const expData = await db.getExpenses();
        setExpenses(expData.sort((a, b) => b.date.localeCompare(a.date)));
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

    const handleDelete = async (id: string) => {
        setDeleteConfirm({ open: true, id });
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-black text-gray-800">Gastos y Egresos</h1>
                <Button onClick={() => {
                    setFormData({ categoryId: 'Otros', paymentMethod: 'Efectivo', amount: 0, description: '', date: getLocalTodayISO() });
                    setIsModalOpen(true);
                }} icon="plus">
                    Nuevo Gasto
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-red-50 border-red-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-red-600 uppercase">Total Gastos (Mes Actual)</p>
                            <p className="text-3xl font-black text-red-800">L {expenses.filter(e => e.date.startsWith(getLocalTodayISO().substring(0, 7))).reduce((a, b) => a + b.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                    </div>
                </Card>
            </div>

            <Card noPadding title={<div className="p-4 flex items-center gap-2"><i className="fas fa-history text-gray-400"></i> <span className="text-sm font-bold text-gray-700 uppercase tracking-wider">Historial de Gastos</span></div>}>
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
                                        <button onClick={() => handleDelete(exp.id)} className="text-red-400 hover:text-red-600"><i className="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                            ))}
                            {expenses.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-gray-400">No hay gastos registrados</td></tr>}
                        </tbody>
                    </table>
                </div>
            </Card>

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

            <PasswordConfirmDialog
                isOpen={deleteConfirm.open}
                title="Eliminar Gasto"
                message="¿Estás seguro de eliminar este registro de gasto? Esta acción no se puede deshacer."
                confirmText="Eliminar"
                cancelText="Cancelar"
                variant="danger"
                masterPassword={settings?.masterPassword || ''}
                isAdmin={user?.role === UserRole.ADMIN}
                onConfirm={async () => {
                    await db.deleteExpense(deleteConfirm.id);
                    setDeleteConfirm({ open: false, id: '' });
                    await load();
                    onUpdate();
                    showToast("Registro eliminado correctamente.", "success");
                }}
                onCancel={() => setDeleteConfirm({ open: false, id: '' })}
            />
        </div>
    );
};
