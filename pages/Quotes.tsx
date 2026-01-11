
import React, { useState, useEffect } from 'react';
import { Product, Customer, Quote, User, CompanySettings } from '../types';
import { Card, Button, Badge, ConfirmDialog } from '../components/UIComponents';
import { db } from '../services/storageService';

interface QuotesProps {
    products: Product[];
    customers: Customer[];
    user?: User | null;
    branchId?: string;
    onLoadQuote?: (quote: Quote) => void;
    settings: CompanySettings; // Added settings prop
}

export const Quotes: React.FC<QuotesProps> = ({ products, customers, user, branchId, onLoadQuote, settings }) => {
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; folio: string }>({ open: false, id: '', folio: '' });

    const loadQuotes = async () => {
        const list = await db.getQuotes();
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setQuotes(list);
    };

    useEffect(() => {
        loadQuotes();
    }, []);

    const handleDeleteQuote = async (id: string, folio: string) => {
        setDeleteConfirm({ open: true, id, folio });
    };

    const handleSendToPOS = (quote: Quote) => {
        if (quote.status === 'accepted') {
            alert("Esta cotización ya fue procesada anteriormente.");
            return;
        }
        if (onLoadQuote) {
            onLoadQuote(quote);
        }
    };

    const handlePrint = (quoteToPrint: Quote) => {
        const itemsToPrint = quoteToPrint.items;
        const totalToPrint = quoteToPrint.total;
        const customerToPrint = customers.find(c => c.id === quoteToPrint.customerId);
        const expDate = quoteToPrint.expirationDate;

        const win = window.open('', '', 'width=850,height=800');
        if (win) {
            const date = new Date().toLocaleDateString('es-HN', { year: 'numeric', month: 'long', day: 'numeric' });
            const [y, m, d] = expDate.split('-').map(Number);
            const validUntilDate = new Date(y, m - 1, d);
            const validUntil = validUntilDate.toLocaleDateString('es-HN', { year: 'numeric', month: 'long', day: 'numeric' });

            win.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Cotización - ${settings.name}</title>
                    <style>
                        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
                        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
                        .company-info h1 { margin: 0 0 5px 0; color: #2c3e50; font-size: 24px; }
                        .company-info p { margin: 2px 0; font-size: 12px; color: #666; }
                        .invoice-title { text-align: right; }
                        .invoice-title h2 { margin: 0; color: #3498db; font-size: 32px; text-transform: uppercase; }
                        .invoice-title p { margin: 5px 0 0 0; color: #7f8c8d; }
                        .client-section { background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 30px; display: flex; justify-content: space-between; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                        th { background: #3498db; color: white; text-align: left; padding: 12px; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
                        td { padding: 12px; border-bottom: 1px solid #eee; font-size: 14px; }
                        .text-right { text-align: right; }
                        .total-section { display: flex; justify-content: flex-end; }
                        .total-box { width: 300px; }
                        .total-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
                        .total-final { border-top: 2px solid #333; border-bottom: double 4px #333; font-weight: bold; font-size: 18px; color: #2c3e50; margin-top: 10px; padding: 10px 0; }
                        .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #eee; font-size: 10px; text-align: center; color: #999; }
                        .notes { margin-top: 40px; font-size: 12px; color: #777; font-style: italic; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="company-info">
                            <h1>${settings.name}</h1>
                            <p>${settings.address}</p>
                            <p>RTN: ${settings.rtn} | Tel: ${settings.phone}</p>
                            <p>${settings.email}</p>
                        </div>
                        <div class="invoice-title">
                            <h2>Cotización</h2>
                            <p>Fecha: ${date}</p>
                            <p style="font-size: 12px; margin-top: 5px;">Válida hasta: ${validUntil}</p>
                            <p style="font-size: 14px; font-weight: bold;">${quoteToPrint.folio}</p>
                        </div>
                    </div>

                    <div class="client-section">
                        <div>
                            <strong style="display:block; margin-bottom: 5px; color: #95a5a6; text-transform: uppercase; font-size: 10px;">Cliente</strong>
                            <div style="font-size: 16px; font-weight: bold;">${customerToPrint ? customerToPrint.name : 'Consumidor General'}</div>
                            ${customerToPrint?.rtn ? `<div>RTN: ${customerToPrint.rtn}</div>` : ''}
                            ${customerToPrint?.phone ? `<div>Tel: ${customerToPrint.phone}</div>` : ''}
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style="width: 50%;">Descripción</th>
                                <th class="text-right">Cantidad</th>
                                <th class="text-right">Precio Unitario</th>
                                <th class="text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsToPrint.map(i => `
                                <tr>
                                    <td>
                                        <strong>${i.name}</strong>
                                        <div style="font-size: 10px; color: #888;">${i.code}</div>
                                    </td>
                                    <td class="text-right">${i.quantity}</td>
                                    <td class="text-right">L ${i.price.toFixed(2)}</td>
                                    <td class="text-right">L ${(i.price * i.quantity).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <div class="total-section">
                        <div class="total-box">
                            <div class="total-row">
                                <span>Subtotal:</span>
                                <span>L ${(totalToPrint / 1.15).toFixed(2)}</span>
                            </div>
                            <div class="total-row">
                                <span>ISV (15%):</span>
                                <span>L ${(totalToPrint - (totalToPrint / 1.15)).toFixed(2)}</span>
                            </div>
                            <div class="total-row total-final">
                                <span>TOTAL:</span>
                                <span>L ${totalToPrint.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <div class="notes">
                        <strong>Términos y Condiciones:</strong>
                        <p>1. Esta cotización es válida hasta la fecha indicada (${validUntil}).<br>
                        2. Los precios incluyen ISV.<br>
                        3. El tiempo de entrega está sujeto a disponibilidad de stock.</p>
                    </div>

                    <div class="footer">
                        Generado por Sistema POS - ${settings.name}
                    </div>
                </body>
                </html>
            `);
            win.document.close();
            win.focus();
            setTimeout(() => { win.print(); win.close(); }, 500);
        }
    };

    return (
        <>
            <Card title="Historial de Cotizaciones" className="flex-1 overflow-hidden" noPadding>
                <div className="overflow-auto h-full max-h-[600px]">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 border-b sticky top-0">
                            <tr>
                                <th className="p-4">Folio</th>
                                <th className="p-4">Fecha</th>
                                <th className="p-4">Cliente</th>
                                <th className="p-4">Estado</th>
                                <th className="p-4 text-right">Total</th>
                                <th className="p-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {quotes.map(q => (
                                <tr key={q.id} className="hover:bg-gray-50">
                                    <td className="p-4 font-mono font-bold">{q.folio}</td>
                                    <td className="p-4">{new Date(q.date).toLocaleDateString()}</td>
                                    <td className="p-4">{customers.find(c => c.id === q.customerId)?.name || 'General'}</td>
                                    <td className="p-4"><Badge variant={q.status === 'accepted' ? 'success' : q.status === 'expired' ? 'danger' : 'warning'}>{q.status}</Badge></td>
                                    <td className="p-4 text-right font-bold">L {q.total.toFixed(2)}</td>
                                    <td className="p-4 text-right flex justify-end gap-2">
                                        {q.status === 'pending' && (
                                            <Button size="sm" variant="success" onClick={() => handleSendToPOS(q)} title="Cargar en Caja (Cobrar)"><i className="fas fa-cash-register"></i> Cargar en POS</Button>
                                        )}
                                        <Button size="sm" variant="secondary" onClick={() => handlePrint(q)} title="Imprimir"><i className="fas fa-print"></i></Button>
                                        <Button size="sm" variant="danger" onClick={() => handleDeleteQuote(q.id, q.folio)} title="Eliminar"><i className="fas fa-trash"></i></Button>
                                    </td>
                                </tr>
                            ))}
                            {quotes.length === 0 && <tr><td colSpan={6} className="text-center p-8 text-gray-400">No hay cotizaciones guardadas.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </Card>

            <ConfirmDialog
                isOpen={deleteConfirm.open}
                title="Eliminar Cotización"
                message={`¿Estás seguro de eliminar la cotización ${deleteConfirm.folio}?`}
                confirmText="Eliminar"
                cancelText="Cancelar"
                variant="danger"
                onConfirm={async () => {
                    await db.deleteQuote(deleteConfirm.id);
                    setDeleteConfirm({ open: false, id: '', folio: '' });
                    loadQuotes();
                }}
                onCancel={() => setDeleteConfirm({ open: false, id: '', folio: '' })}
            />
        </>
    );
};
