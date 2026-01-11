
import React, { useState, useEffect, useMemo } from 'react';
import { PriceHistoryEntry, Product, User } from '../types';
import { Card, Badge, Input } from '../components/UIComponents';
import { db } from '../services/storageService';

interface Props {
    products: Product[];
    users: User[];
}

export const PriceHistory: React.FC<Props> = ({ products, users }) => {
    const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        db.getPriceHistory().then(setHistory);
    }, []);

    const filtered = useMemo(() => {
        return history.filter(h => {
            const p = products.find(prod => prod.id === h.productId);
            const search = searchTerm.toLowerCase();
            return p?.name.toLowerCase().includes(search) || p?.code.toLowerCase().includes(search);
        });
    }, [history, searchTerm, products]);

    const getDiffBadge = (oldVal: number, newVal: number) => {
        const diff = newVal - oldVal;
        if (diff === 0) return <Badge variant="default">Sin cambio</Badge>;
        if (diff > 0) return <Badge variant="danger">↑ L {diff.toFixed(2)}</Badge>;
        return <Badge variant="success">↓ L {Math.abs(diff).toFixed(2)}</Badge>;
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <h1 className="text-2xl font-black text-gray-800">Auditoría de Precios</h1>
            <Card title="Historial de Ajustes Económicos" noPadding>
                <div className="p-4 bg-gray-50 border-b">
                    <Input placeholder="Buscar por producto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} icon="search" />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-white border-b uppercase font-bold text-gray-400">
                            <tr>
                                <th className="p-4">Fecha</th>
                                <th className="p-4">Producto</th>
                                <th className="p-4 text-center">Precio Anterior</th>
                                <th className="p-4 text-center">Nuevo Precio</th>
                                <th className="p-4 text-center">Costo Anterior</th>
                                <th className="p-4 text-center">Nuevo Costo</th>
                                <th className="p-4 text-right">Usuario</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filtered.map(h => {
                                const p = products.find(prod => prod.id === h.productId);
                                const u = users.find(user => user.id === h.userId);
                                return (
                                    <tr key={h.id} className="hover:bg-gray-50">
                                        <td className="p-4 text-gray-500">{new Date(h.date).toLocaleString()}</td>
                                        <td className="p-4">
                                            <p className="font-bold text-gray-800">{p?.name || 'Producto Eliminado'}</p>
                                            <p className="text-[10px] text-gray-400">{p?.code}</p>
                                        </td>
                                        <td className="p-4 text-center text-gray-500">L {h.oldPrice.toFixed(2)}</td>
                                        <td className="p-4 text-center font-bold">
                                            L {h.newPrice.toFixed(2)}
                                            <div className="mt-1">{getDiffBadge(h.oldPrice, h.newPrice)}</div>
                                        </td>
                                        <td className="p-4 text-center text-gray-500">L {h.oldCost.toFixed(2)}</td>
                                        <td className="p-4 text-center font-bold">L {h.newCost.toFixed(2)}</td>
                                        <td className="p-4 text-right font-medium">{u?.name || 'Sistema'}</td>
                                    </tr>
                                );
                            })}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="text-center py-10 text-gray-400">No hay registros de cambios de precio.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};
