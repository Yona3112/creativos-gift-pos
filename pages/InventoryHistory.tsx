
import React, { useState, useEffect, useMemo } from 'react';
import { InventoryMovement, Product, User } from '../types';
import { Card, Badge, Input } from '../components/UIComponents';
import { db } from '../services/storageService';

interface Props {
    products: Product[];
    users: User[];
}

export const InventoryHistory: React.FC<Props> = ({ products, users }) => {
    const [history, setHistory] = useState<InventoryMovement[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        db.getInventoryHistory().then(setHistory);
    }, []);

    const filtered = useMemo(() => {
        return history.filter(h => {
            const p = products.find(prod => prod.id === h.productId);
            const search = searchTerm.toLowerCase();
            return p?.name.toLowerCase().includes(search) || p?.code.toLowerCase().includes(search) || h.reason.toLowerCase().includes(search);
        });
    }, [history, searchTerm, products]);

    const getMovementBadge = (type: string) => {
        switch(type) {
            case 'SALE': return <Badge variant="danger">Venta</Badge>;
            case 'PURCHASE': return <Badge variant="success">Compra/Entrada</Badge>;
            case 'RETURN': return <Badge variant="info">Devolución</Badge>;
            case 'CANCELLATION': return <Badge variant="warning">Anulación</Badge>;
            default: return <Badge variant="default">Ajuste</Badge>;
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-black text-gray-800">Kardex de Inventario</h1>
            <Card title="Auditoría de Movimientos" noPadding>
                <div className="p-4 bg-gray-50 border-b">
                    <Input placeholder="Buscar por producto o motivo..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} icon="search" />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-white border-b uppercase font-bold text-gray-400">
                            <tr>
                                <th className="p-4">Fecha</th>
                                <th className="p-4">Producto</th>
                                <th className="p-4 text-center">Tipo</th>
                                <th className="p-4 text-center">Cant.</th>
                                <th className="p-4 text-center">Prev.</th>
                                <th className="p-4 text-center">Nuevo</th>
                                <th className="p-4">Motivo</th>
                                <th className="p-4">Usuario</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filtered.map(m => {
                                const p = products.find(prod => prod.id === m.productId);
                                const u = users.find(user => user.id === m.userId);
                                return (
                                    <tr key={m.id} className="hover:bg-gray-50">
                                        <td className="p-4 text-gray-500">{new Date(m.date).toLocaleString()}</td>
                                        <td className="p-4 font-bold">{p?.name || 'Desconocido'}</td>
                                        <td className="p-4 text-center">{getMovementBadge(m.type)}</td>
                                        <td className={`p-4 text-center font-black ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>{m.quantity > 0 ? '+' : ''}{m.quantity}</td>
                                        <td className="p-4 text-center text-gray-400">{m.previousStock}</td>
                                        <td className="p-4 text-center font-bold">{m.newStock}</td>
                                        <td className="p-4 text-gray-600 italic">{m.reason}</td>
                                        <td className="p-4 text-xs">{u?.name || 'Sistema'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
