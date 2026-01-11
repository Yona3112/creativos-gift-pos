
import React, { useState, useMemo } from 'react';
import { Sale, Customer, User, CreditNote, UserRole, CompanySettings } from '../types';
import { Card, Button, Input, Badge, Modal, Pagination, useDebounce, ConfirmDialog, showToast } from '../components/UIComponents';
import { db } from '../services/storageService';

// Import sub-modules
import { Quotes } from './Quotes';
import { Credits } from './Credits';

interface SalesHistoryProps {
    sales: Sale[];
    customers: Customer[];
    users: User[];
    onUpdate: () => void;
    user?: User | null;
    branchId?: string;
    onLoadQuote?: (quote: any) => void;
    settings: CompanySettings;
}

const ITEMS_PER_PAGE = 15;

export const SalesHistory: React.FC<SalesHistoryProps> = ({ sales, customers, users, onUpdate, user, branchId, onLoadQuote, settings }) => {
    const [activeTab, setActiveTab] = useState<'history' | 'quotes' | 'credits' | 'creditNotes'>('history');

    // --- History State ---
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 300);
    const [dateFilter, setDateFilter] = useState('');
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    // Credit Notes State
    const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);

    // Modal state for cancellation
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [confirmWord, setConfirmWord] = useState('');
    const [passwordError, setPasswordError] = useState('');

    // Refund confirm state
    const [refundConfirm, setRefundConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

    React.useEffect(() => {
        const loadCN = async () => {
            const cn = await db.getCreditNotes();
            setCreditNotes(cn);
        };
        loadCN();
    }, [sales]);

    // Robust Sorting and Filtering for History
    const filteredSales = useMemo(() => {
        const safeSales = Array.isArray(sales) ? sales : [];
        const lowerSearch = debouncedSearch.toLowerCase();

        return safeSales.filter(s => {
            if (!s || !s.items) return false;

            if (user?.role === UserRole.VENDEDOR && s.userId !== user.id) {
                return false;
            }

            const client = customers.find(c => c.id === s.customerId);
            const clientName = client?.name || 'Consumidor Final';
            const clientRTN = client?.rtn || '';

            const matchFolio = (s.folio || '').toLowerCase().includes(lowerSearch);
            const matchCustomer = clientName.toLowerCase().includes(lowerSearch) || clientRTN.includes(lowerSearch);
            const matchProduct = s.items.some(item =>
                (item.name && item.name.toLowerCase().includes(lowerSearch)) ||
                (item.code && item.code.toLowerCase().includes(lowerSearch))
            );

            const matchesSearch = matchFolio || matchCustomer || matchProduct;
            const matchesDate = dateFilter ? s.date.startsWith(dateFilter) : true;

            return matchesSearch && matchesDate;
        }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }, [sales, debouncedSearch, dateFilter, customers, user]);

    const totalPages = Math.ceil(filteredSales.length / ITEMS_PER_PAGE);
    const paginatedSales = filteredSales.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const openCancelModal = () => {
        setAdminPassword('');
        setConfirmWord('');
        setPasswordError('');
        setCancelModalOpen(true);
    };

    const handleConfirmCancel = async () => {
        const correctPassword = settings.masterPassword || "admin123";

        if (adminPassword !== correctPassword) {
            setPasswordError("Contraseña incorrecta");
            return;
        }

        if (confirmWord.toUpperCase() !== 'ANULAR') {
            showToast("Debe escribir la palabra 'ANULAR' para continuar.", "error");
            return;
        }

        if (selectedSale) {
            await db.cancelSale(selectedSale.id, user?.id || 'system');
            showToast("Venta anulada. Se ha generado una Nota de Crédito.", "success");
            onUpdate();
            const cn = await db.getCreditNotes();
            setCreditNotes(cn);
            setCancelModalOpen(false);
            setDetailsOpen(false);
        }
    };

    const handleRefundCreditNote = async (id: string) => {
        setRefundConfirm({ open: true, id });
    };

    const reprintTicket = async (sale: Sale) => {
        const customer = customers.find(c => c.id === sale.customerId);
        const html = await db.generateTicketHTML(sale, customer);
        const win = window.open('', '', 'width=400,height=600');

        if (win) {
            win.document.write(html);
            win.document.close();
            win.focus();
            setTimeout(() => { win.print(); win.close(); }, 500);
        }
    };

    const printCreditNote = (note: CreditNote) => {
        const customer = customers.find(c => c.id === note.customerId);
        const win = window.open('', '', 'width=400,height=600');
        if (win) {
            win.document.write(`
                <html>
                <body style="font-family: monospace; padding: 20px;">
                    <h2 style="text-align:center;">NOTA DE CRÉDITO</h2>
                    <p><b>FOLIO:</b> ${note.folio}</p>
                    <p><b>FECHA:</b> ${new Date(note.date).toLocaleString()}</p>
                    <p><b>CLIENTE:</b> ${customer?.name || 'General'}</p>
                    <hr/>
                    <p>VALOR ORIGINAL: L ${note.originalTotal.toFixed(2)}</p>
                    <p>SALDO ACTUAL: L ${note.remainingAmount.toFixed(2)}</p>
                    <p>MOTIVO: ${note.reason}</p>
                    <hr/>
                    <p style="text-align:center;">VÁLIDO POR 30 DÍAS</p>
                </body>
                </html>
             `);
            win.document.close();
            win.focus();
            setTimeout(() => { win.print(); win.close(); }, 500);
        }
    };

    const isAnularDisabled = adminPassword === '' || confirmWord.toUpperCase() !== 'ANULAR';

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-800">Gestión de Ventas</h1>
                <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm overflow-x-auto max-w-full">
                    {[
                        { id: 'history', label: 'Historial', icon: 'history' },
                        { id: 'creditNotes', label: 'Notas de Crédito', icon: 'file-invoice' },
                        { id: 'quotes', label: 'Cotizaciones', icon: 'file-alt' },
                        { id: 'credits', label: 'Cuentas x Cobrar', icon: 'hand-holding-usd' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === tab.id ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            <i className={`fas fa-${tab.icon}`}></i> {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {activeTab === 'history' && (
                <div className="animate-fade-in">
                    <Card noPadding>
                        <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row gap-4">
                            <Input
                                placeholder="Buscar por folio, cliente, RTN o producto..."
                                value={searchTerm}
                                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                className="flex-1"
                                icon="search"
                            />
                            <Input
                                type="date"
                                value={dateFilter}
                                onChange={e => { setDateFilter(e.target.value); setCurrentPage(1); }}
                                className="w-full sm:w-auto"
                            />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-white text-gray-500 font-semibold border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4">Fecha</th>
                                        <th className="px-6 py-4">Folio</th>
                                        <th className="px-6 py-4">Cliente / RTN</th>
                                        <th className="px-6 py-4">Productos</th>
                                        <th className="px-6 py-4">Total</th>
                                        <th className="px-6 py-4">Estado</th>
                                        <th className="px-6 py-4 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {paginatedSales.map(s => {
                                        const client = customers.find(c => c.id === s.customerId);
                                        const clientName = client?.name || 'Consumidor Final';
                                        const clientRTN = client?.rtn;
                                        const isInvoice = s.documentType === 'FACTURA';

                                        return (
                                            <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4 text-gray-600">
                                                    {new Date(s.date).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-mono text-gray-600">{s.folio}</div>
                                                    <Badge variant={isInvoice ? 'info' : 'default'}>{isInvoice ? 'Factura' : 'Ticket'}</Badge>
                                                </td>
                                                <td className="px-6 py-4 font-medium text-gray-800">
                                                    <div>{clientName}</div>
                                                    {clientRTN && <div className="text-xs text-gray-500">RTN: {clientRTN}</div>}
                                                </td>
                                                <td className="px-6 py-4 text-xs text-gray-500 max-w-[200px] truncate">
                                                    {s.items?.map(i => i.name).join(', ')}
                                                </td>
                                                <td className="px-6 py-4 font-bold text-gray-800">L {s.total.toFixed(2)}</td>
                                                <td className="px-6 py-4"><Badge variant={s.status === 'active' ? 'success' : 'danger'}>{s.status === 'active' ? 'Válida' : 'Anulada'}</Badge></td>
                                                <td className="px-6 py-4 text-right">
                                                    <Button size="sm" variant="secondary" onClick={() => { setSelectedSale(s); setDetailsOpen(true); }} icon="eye">Ver Detalle</Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {paginatedSales.length === 0 && (
                                        <tr><td colSpan={7} className="text-center py-8 text-gray-400">No se encontraron ventas</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 border-t border-gray-100">
                            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                        </div>
                    </Card>
                </div>
            )}

            {activeTab === 'creditNotes' && (
                <div className="animate-fade-in">
                    <Card title="Módulo de Notas de Crédito" noPadding>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="p-4">Folio NC</th>
                                        <th className="p-4">Fecha</th>
                                        <th className="p-4">Cliente</th>
                                        <th className="p-4">Monto Original</th>
                                        <th className="p-4">Saldo Disponible</th>
                                        <th className="p-4">Estado</th>
                                        <th className="p-4 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {creditNotes.map(nc => {
                                        const clientName = customers.find(c => c.id === nc.customerId)?.name || 'Consumidor Final';
                                        return (
                                            <tr key={nc.id}>
                                                <td className="p-4 font-mono font-bold">{nc.folio}</td>
                                                <td className="p-4">{new Date(nc.date).toLocaleDateString()}</td>
                                                <td className="p-4">{clientName}</td>
                                                <td className="p-4">L {nc.originalTotal.toFixed(2)}</td>
                                                <td className="p-4 font-bold text-green-600">L {nc.remainingAmount.toFixed(2)}</td>
                                                <td className="p-4"><Badge variant={nc.status === 'active' ? 'success' : 'default'}>{nc.status}</Badge></td>
                                                <td className="p-4 text-right flex justify-end gap-2">
                                                    <Button size="sm" variant="secondary" onClick={() => printCreditNote(nc)} title="Imprimir"><i className="fas fa-print"></i></Button>
                                                    {nc.status === 'active' && nc.remainingAmount > 0 && (
                                                        <Button size="sm" variant="danger" onClick={() => handleRefundCreditNote(nc.id)} title="Reembolsar Efectivo"><i className="fas fa-money-bill-wave"></i></Button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {creditNotes.length === 0 && <tr><td colSpan={7} className="text-center p-6 text-gray-400">No hay notas de crédito registradas.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {activeTab === 'quotes' && (
                <div className="animate-fade-in">
                    <Quotes products={sales.flatMap(s => s.items)} customers={customers} user={user} branchId={branchId} onLoadQuote={onLoadQuote} settings={settings} />
                </div>
            )}

            {activeTab === 'credits' && (
                <div className="animate-fade-in">
                    <Credits settings={settings} />
                </div>
            )}

            <Modal isOpen={detailsOpen} onClose={() => setDetailsOpen(false)} title="Detalle de Venta">
                {selectedSale && (
                    <div className="space-y-6">
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-gray-500 text-xs uppercase tracking-wider font-bold mb-1">Folio</p>
                                <p className="font-bold text-lg">{selectedSale.folio}</p>
                            </div>
                            <div>
                                <p className="text-gray-500 text-xs uppercase tracking-wider font-bold mb-1">Fecha</p>
                                <p>{new Date(selectedSale.date).toLocaleString()}</p>
                            </div>
                            <div>
                                <p className="text-gray-500 text-xs uppercase tracking-wider font-bold mb-1">Método</p>
                                <Badge variant="info">{selectedSale.paymentMethod}</Badge>
                            </div>
                            <div>
                                <p className="text-gray-500 text-xs uppercase tracking-wider font-bold mb-1">Cliente</p>
                                <p className="font-bold">{customers.find(c => c.id === selectedSale.customerId)?.name || 'Consumidor Final'}</p>
                            </div>
                        </div>

                        <div className="border rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-gray-500">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-medium">Producto</th>
                                        <th className="px-4 py-2 text-right font-medium">Cant</th>
                                        <th className="px-4 py-2 text-right font-medium">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {selectedSale.items?.map((i, idx) => (
                                        <tr key={idx}>
                                            <td className="px-4 py-2 text-gray-800">{i.name}</td>
                                            <td className="px-4 py-2 text-right text-gray-600">{i.quantity}</td>
                                            <td className="px-4 py-2 text-right font-medium">L {(i.price * i.quantity).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end font-bold text-lg">
                            <span>Total: L {selectedSale.total.toFixed(2)}</span>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                            <Button variant="secondary" onClick={() => reprintTicket(selectedSale)} icon="print">Reimprimir</Button>
                            {selectedSale.status === 'active' && (
                                <Button variant="danger" onClick={openCancelModal} icon="ban">Anular Venta</Button>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            <Modal isOpen={cancelModalOpen} onClose={() => setCancelModalOpen(false)} title="Confirmación Crítica de Seguridad" size="sm">
                <div className="space-y-5">
                    <div className="bg-red-50 border-2 border-red-500 p-4 rounded-xl flex items-start gap-3 animate-pulse">
                        <i className="fas fa-exclamation-triangle text-red-600 text-2xl mt-1"></i>
                        <div className="text-sm text-red-900 font-bold">
                            <p>¡ESTA ACCIÓN NO SE PUEDE DESHACER!</p>
                            <p className="font-normal mt-1">Se anulará la factura {selectedSale?.folio}. El stock regresará al inventario y se generará una nota de crédito por L {selectedSale?.total.toFixed(2)}.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Input
                            type="password"
                            label="1. Contraseña de Administrador"
                            value={adminPassword}
                            onChange={e => { setAdminPassword(e.target.value); setPasswordError(''); }}
                            error={passwordError}
                            placeholder="Ingrese su clave maestra"
                            autoFocus
                        />

                        <div className="space-y-1">
                            <label className="block text-sm font-bold text-gray-700 ml-1">2. Escriba la palabra de confirmación</label>
                            <p className="text-[10px] text-gray-500 ml-1 mb-2 uppercase tracking-tighter">Escriba <span className="font-black text-red-600">ANULAR</span> para desbloquear</p>
                            <Input
                                value={confirmWord}
                                onChange={e => setConfirmWord(e.target.value)}
                                placeholder="Escriba ANULAR"
                                className={confirmWord.toUpperCase() === 'ANULAR' ? 'border-green-500 bg-green-50' : 'border-red-300'}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 mt-4">
                        <Button
                            variant="danger"
                            onClick={handleConfirmCancel}
                            disabled={isAnularDisabled}
                            className="w-full py-4 text-lg"
                        >
                            CONFIRMAR ANULACIÓN
                        </Button>
                        <Button variant="secondary" onClick={() => setCancelModalOpen(false)} className="w-full">
                            Regresar (Cancelar)
                        </Button>
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={refundConfirm.open}
                title="Reembolsar Nota de Crédito"
                message="¿Está seguro de reembolsar esta Nota de Crédito en Efectivo? Esta acción invalidará la nota."
                confirmText="Reembolsar"
                cancelText="Cancelar"
                variant="warning"
                onConfirm={async () => {
                    await db.refundCreditNote(refundConfirm.id);
                    const cn = await db.getCreditNotes();
                    setCreditNotes(cn);
                    setRefundConfirm({ open: false, id: '' });
                    showToast("Reembolso registrado.", "success");
                }}
                onCancel={() => setRefundConfirm({ open: false, id: '' })}
            />
        </div>
    );
};
