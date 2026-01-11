
import React, { useState, useEffect } from 'react';
import { User, UserRole, Branch } from '../types';
import { Card, Button, Input, Modal, Badge } from '../components/UIComponents';
import { db } from '../services/storageService';

export const Users: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState<Partial<User>>({});

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [uData, bData] = await Promise.all([
            db.getUsers(),
            db.getBranches()
        ]);
        setUsers(uData || []);
        setBranches(bData || []);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await db.saveUser({ ...formData, active: formData.active ?? true } as User);
        await loadData();
        setIsModalOpen(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Gestión de Usuarios</h1>
                <Button onClick={() => { setFormData({ role: UserRole.VENDEDOR, active: true, branchId: branches[0]?.id }); setIsModalOpen(true); }} icon="plus">Nuevo Usuario</Button>
            </div>
            
            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="p-3">Nombre</th>
                                <th className="p-3">Email</th>
                                <th className="p-3">Rol</th>
                                <th className="p-3">Sucursal</th>
                                <th className="p-3">Estado</th>
                                <th className="p-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {Array.isArray(users) && users.map(u => (
                                <tr key={u.id}>
                                    <td className="p-3 font-medium">{u.name}</td>
                                    <td className="p-3 text-gray-500">{u.email}</td>
                                    <td className="p-3 capitalize"><Badge variant="info">{u.role}</Badge></td>
                                    <td className="p-3">{branches.find(b => b.id === u.branchId)?.name || 'N/A'}</td>
                                    <td className="p-3"><Badge variant={u.active ? 'success' : 'danger'}>{u.active ? 'Activo' : 'Inactivo'}</Badge></td>
                                    <td className="p-3 text-right">
                                        <Button size="sm" variant="secondary" onClick={() => { setFormData(u); setIsModalOpen(true); }}>Editar</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={formData.id ? "Editar Usuario" : "Nuevo Usuario"}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input label="Nombre Completo" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} required />
                    <Input label="Email" type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} required />
                    
                    <Input 
                        label="Contraseña" 
                        type="password" 
                        value={formData.password || ''} 
                        onChange={e => setFormData({...formData, password: e.target.value})} 
                        placeholder={formData.id ? "Dejar en blanco para no cambiar" : "Ingresa contraseña"}
                        required={!formData.id} 
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                            <select className="w-full px-3 py-2 border rounded-lg text-gray-900" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as UserRole})}>
                                <option value={UserRole.ADMIN}>Administrador</option>
                                <option value={UserRole.VENDEDOR}>Vendedor</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Sucursal Asignada</label>
                            <select className="w-full px-3 py-2 border rounded-lg text-gray-900" value={formData.branchId} onChange={e => setFormData({...formData, branchId: e.target.value})}>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                        <input type="checkbox" checked={formData.active} onChange={e => setFormData({...formData, active: e.target.checked})} className="w-4 h-4" />
                        <span className="text-sm text-gray-700">Usuario Activo</span>
                    </div>

                    <Button type="submit" className="w-full">Guardar Usuario</Button>
                </form>
            </Modal>
        </div>
    );
};
