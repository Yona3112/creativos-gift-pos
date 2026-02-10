
import React, { useState, useEffect, useMemo } from 'react';
import { CreditAccount, Customer, CreditPayment, CompanySettings } from '../types';
import { Card, Button, Input, Badge, Modal, Alert, showToast } from '../components/UIComponents';
import { db } from '../services/storageService';
import { NotificationService } from '../services/NotificationService';

interface CreditsProps {
    settings: CompanySettings; // Added settings prop
}

export const Credits: React.FC<CreditsProps> = ({ settings }) => {
    const [credits, setCredits] = useState<CreditAccount[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [selectedCredit, setSelectedCredit] = useState<CreditAccount | null>(null);

    const [payModalOpen, setPayModalOpen] = useState(false);
    const [payAmount, setPayAmount] = useState('');
    const [payMethod, setPayMethod] = useState<'Efectivo' | 'Tarjeta' | 'Transferencia'>('Efectivo');
    const [payRef, setPayRef] = useState('');

    const [isSaving, setIsSaving] = useState(false);

    // Liquidation State
    const [liquidationModalOpen, setLiquidationModalOpen] = useState(false);
    const [liquidationDetails, setLiquidationDetails] = useState<any>(null);

    // History Filters
    const [historySearchTerm, setHistorySearchTerm] = useState('');
    const [historyDateFilter, setHistoryDateFilter] = useState('');

    useEffect(() => {
        refresh();
    }, []);

    const refresh = async () => {
        const c = await db.getCredits();
        const cust = await db.getCustomers();
        setCredits(c);
        setCustomers(cust);
    };

    const allPayments = useMemo(() => {
        const flatList: (CreditPayment & { customerName: string, creditRef: string, creditId: string })[] = [];
        credits.forEach(credit => {
            const customer = customers.find(c => c.id === credit.customerId);
            (credit.payments || []).forEach(payment => {
                flatList.push({
                    ...payment,
                    customerName: customer?.name || 'Desconocido',
                    creditRef: credit.saleId,
                    creditId: credit.id
                });
            });
        });
        return flatList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [credits, customers]);

    const filteredPayments = useMemo(() => {
        return allPayments.filter(p => {
            const matchesSearch = (p.customerName || '').toLowerCase().includes(historySearchTerm.toLowerCase()) ||
                (p.creditRef || '').toLowerCase().includes(historySearchTerm.toLowerCase());
            // Safe date comparison
            const matchesDate = historyDateFilter ? p.date.startsWith(historyDateFilter) : true;
            return matchesSearch && matchesDate;
        });
    }, [allPayments, historySearchTerm, historyDateFilter]);

    // Helper for consistent date display
    const getLocalDate = (dateStr: string) => {
        if (!dateStr) return '';
        const date = db.getSystemDate(dateStr);
        return date.toLocaleDateString('es-HN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    };

    const getLocalTime = (dateStr: string) => {
        if (!dateStr) return '';
        const date = db.getSystemDate(dateStr);
        return date.toLocaleTimeString('es-HN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const printPaymentReceipt = (credit: CreditAccount, payment: CreditPayment, customerName: string) => {
        const remaining = credit.totalAmount - credit.paidAmount;
        const html = `
            <html>
            <head>
                <title>Recibo de Abono</title>
                <style>
                    body { font-family: "Courier New", monospace; font-size: 11px; margin: 0; padding: 10px; width: ${settings.printerSize}; }
                    .text-center { text-align: center; }
                    .bold { font-weight: bold; }
                    .line { border-bottom: 1px dashed #000; margin: 5px 0; }
                </style>
            </head>
            <body>
                <div class="text-center">
                    <h3 class="bold">${settings.name}</h3>
                    <p>RECIBO DE ABONO</p>
                    <p>${getLocalDate(payment.date)} ${getLocalTime(payment.date)}</p>
                </div>
                <div class="line"></div>
                <p><strong>Cliente:</strong> ${customerName}</p>
                <p><strong>Ref. Crédito:</strong> ${credit.saleId}</p>
                <div class="line"></div>
                <p>Deuda Total: L ${credit.totalAmount.toFixed(2)}</p>
                <p>Abonado Antes: L ${(credit.paidAmount - payment.amount).toFixed(2)}</p>
                <br/>
                <p style="font-size:14px;" class="bold">ABONO ACTUAL: L ${payment.amount.toFixed(2)}</p>
                <br/>
                <p class="bold">SALDO RESTANTE: L ${remaining.toFixed(2)}</p>
                <div class="line"></div>
                <p class="text-center">Firma Cliente</p>
                <br/><br/>
                <div style="border-top:1px solid #000; width:80%; margin:0 auto;"></div>
            </body>
            </html>
        `;
        // Use PrinterService (dynamically imported or available globally if added to window)
        // Since we are in a component, we can assume we'll use a local helper or import
        // For now, let's just implement the iframe logic directly here until verified, OR stick to window.open if user preferred standard popup.
        // But user complained about stability, so iframe is better.
        // Re-using the iframe logic inline for simplicity as the Service file might not be imported yet in this update block
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow?.document;
        if (doc) {
            doc.open();
            doc.write(html);
            doc.close();
            iframe.onload = () => {
                iframe.contentWindow?.print();
                setTimeout(() => document.body.removeChild(iframe), 1000);
            };
        }
    };

    const printAccountStatement = (credit: CreditAccount) => {
        const customer = customers.find(c => c.id === credit.customerId);
        const paymentsRows = (credit.payments || []).map(p => `
            <tr>
                <td>${getLocalDate(p.date)}</td>
                <td>${p.method}</td>
                <td>Abono</td>
                <td style="text-align:right;">L ${p.amount.toFixed(2)}</td>
            </tr>
        `).join('');

        const html = `
            <html>
            <head>
                <title>Estado de Cuenta</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
                    h1 { color: #2c3e50; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { padding: 10px; border-bottom: 1px solid #ddd; text-align: left; }
                    th { background-color: #f9f9f9; }
                </style>
            </head>
            <body>
                <h1>ESTADO DE CUENTA</h1>
                <h3>${settings.name}</h3>
                <p><strong>Cliente:</strong> ${customer?.name}</p>
                <p><strong>Fecha Vencimiento:</strong> ${getLocalDate(credit.dueDate)}</p>
                
                <table>
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Detalle</th>
                            <th>Tipo</th>
                            <th style="text-align:right;">Monto</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${getLocalDate(credit.createdAt)}</td>
                            <td>Apertura Crédito</td>
                            <td>Cargo Inicial</td>
                            <td style="text-align:right;">L ${credit.totalAmount.toFixed(2)}</td>
                        </tr>
                        ${paymentsRows}
                        <tr>
                            <td colspan="3" style="text-align:right; font-weight:bold;">Total Pagado:</td>
                            <td style="text-align:right; font-weight:bold;">L ${credit.paidAmount.toFixed(2)}</td>
                        </tr>
                            <tr>
                            <td colspan="3" style="text-align:right; font-weight:bold; font-size: 18px;">SALDO PENDIENTE:</td>
                            <td style="text-align:right; font-weight:bold; font-size: 18px; color: red;">L ${(credit.totalAmount - credit.paidAmount).toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </body>
            </html>
        `;
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow?.document;
        if (doc) {
            doc.open();
            doc.write(html);
            doc.close();
            iframe.onload = () => {
                iframe.contentWindow?.print();
                setTimeout(() => document.body.removeChild(iframe), 1000);
            };
        }
    };

    const printSettlement = (credit: CreditAccount) => {
        const customer = customers.find(c => c.id === credit.customerId);
        const html = `
            <html>
            <head>
                <title>Finiquito de Deuda</title>
                <style>
                    body { font-family: 'Times New Roman', serif; padding: 60px; line-height: 1.6; }
                    .header { text-align: center; margin-bottom: 50px; }
                    .title { font-size: 24px; font-weight: bold; text-decoration: underline; margin-bottom: 40px; text-align: center; }
                    .content { font-size: 16px; text-align: justify; }
                    .signatures { margin-top: 100px; display: flex; justify-content: space-between; }
                    .sig-box { width: 40%; border-top: 1px solid #000; text-align: center; padding-top: 10px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>${settings.name}</h2>
                    <p>${settings.address}</p>
                </div>
                
                <div class="title">CARTA DE FINIQUITO Y LIBERACIÓN DE DEUDA</div>

                <div class="content">
                    <p>Por medio de la presente, <strong>${settings.name}</strong> hace constar que el cliente <strong>${customer?.name}</strong>, con ID de sistema ${customer?.id}, ha cancelado en su totalidad la deuda correspondiente al crédito con referencia <strong>${credit.saleId}</strong>.</p>
                    
                    <p>A la fecha de hoy, ${getLocalDate(new Date().toISOString())}, el saldo de dicha cuenta es <strong>L 0.00</strong>, por lo que se extiende el presente finiquito, liberando al cliente de cualquier obligación de pago relacionada con esta transacción específica.</p>

                    <p>Se extiende la presente a petición del interesado para los fines que estime convenientes.</p>
                </div>

                <div class="signatures">
                        <div class="sig-box">
                        Firma Autorizada<br/>
                        ${settings.name}
                        </div>
                        <div class="sig-box">
                        Recibido Conforme<br/>
                        ${customer?.name}
                        </div>
                </div>
            </body>
            </html>
        `;
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow?.document;
        if (doc) {
            doc.open();
            doc.write(html);
            doc.close();
            iframe.onload = () => {
                iframe.contentWindow?.print();
                setTimeout(() => document.body.removeChild(iframe), 1000);
            };
        }
    };

    const printContract = async (credit: CreditAccount) => {
        try {
            const sale = await db.getSale(credit.saleId); // Need full sale for items
            const customer = customers.find(c => c.id === credit.customerId);

            if (sale && customer) {
                const htmlContrato = await db.generateCreditContractHTML(sale, customer, settings);
                const htmlPagare = await db.generateCreditPagareHTML(sale, customer, settings);

                const html = `
                    <html><body>
                    ${htmlContrato}
                    <div style="page-break-after: always;"></div>
                    ${htmlPagare}
                    </body></html>
                `;

                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                document.body.appendChild(iframe);
                const doc = iframe.contentWindow?.document;
                if (doc) {
                    doc.open();
                    doc.write(html);
                    doc.close();
                    iframe.onload = () => {
                        iframe.contentWindow?.print();
                        setTimeout(() => document.body.removeChild(iframe), 1000);
                    };
                }
            } else {
                showToast("No se encontró la venta original o el cliente.", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Error al generar contrato.", "error");
        }
    };

    const printPaymentPlan = async (credit: CreditAccount) => {
        try {
            const sale = await db.getSale(credit.saleId);
            if (sale) {
                const html = await db.generatePaymentPlanHTML(sale);
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                document.body.appendChild(iframe);
                const doc = iframe.contentWindow?.document;
                if (doc) {
                    doc.open();
                    doc.write(html);
                    doc.close();
                    iframe.onload = () => {
                        iframe.contentWindow?.print();
                        setTimeout(() => document.body.removeChild(iframe), 1000);
                    };
                }
            }
        } catch (e) {
            console.error(e);
            showToast("Error al generar plan de pago.", "error");
        }
    };

    const handlePayment = async () => {
        if (!selectedCredit || isSaving) return;
        setIsSaving(true);
        const amount = parseFloat(payAmount);
        const remaining = selectedCredit.totalAmount - selectedCredit.paidAmount;

        // Use a small epsilon for floating point comparison validation
        if (isNaN(amount) || amount <= 0 || amount > (remaining + 0.01)) {
            showToast(`Monto inválido. Saldo pendiente: L ${remaining.toFixed(2)}`, "error");
            return;
        }

        const paymentData: Omit<CreditPayment, 'id'> = {
            date: new Date().toISOString(),
            amount: amount,
            method: payMethod,
            note: payRef ? `Ref: ${payRef}` : 'Abono en caja'
        };

        await db.addCreditPayment(selectedCredit.id, paymentData);

        const updatedCredits = await db.getCredits();
        setCredits(updatedCredits);

        const customer = customers.find(c => c.id === selectedCredit.customerId);
        printPaymentReceipt(updatedCredits.find(c => c.id === selectedCredit.id)!, { ...paymentData, id: 'temp' }, customer?.name || 'Cliente');

        setPayModalOpen(false);
        setPayAmount('');
        setPayRef('');
        setPayMethod('Efectivo');
        setIsSaving(false);
        showToast("Pago registrado y recibo generado.", "success");
    };

    const openLiquidationModal = (credit: CreditAccount) => {
        const details = db.calculateEarlyPayoff(credit);
        if (details) {
            setSelectedCredit(credit);
            setLiquidationDetails(details);
            setLiquidationModalOpen(true);
        } else {
            showToast("No se puede liquidar este crédito (ya pagado o sin tasa configurada).", "warning");
        }
    };

    const confirmLiquidation = async () => {
        if (selectedCredit && liquidationDetails && !isSaving) {
            setIsSaving(true);
            await db.liquidateCredit(selectedCredit.id, {
                finalAmount: liquidationDetails.remainingToPay,
                savings: liquidationDetails.savings
            });
            setLiquidationModalOpen(false);
            refresh();
            setIsSaving(false);
            showToast("Crédito liquidado exitosamente.", "success");
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-800">Cuentas por Cobrar</h1>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-blue-50 border-blue-200">
                    <div className="text-blue-800">
                        <p className="text-sm font-medium">Total CxC</p>
                        <p className="text-2xl font-bold">L {credits.filter(c => c.status !== 'paid').reduce((a, c) => a + (c.totalAmount - c.paidAmount), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                </Card>
                <Card className="bg-red-50 border-red-200">
                    <div className="text-red-800">
                        <p className="text-sm font-medium">Créditos Vencidos</p>
                        <p className="text-2xl font-bold">
                            {credits.filter(c => {
                                if (c.status === 'paid') return false;
                                const dueDate = new Date(c.dueDate);
                                dueDate.setHours(0, 0, 0, 0);
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                return dueDate < today;
                            }).length} créditos
                        </p>
                    </div>
                </Card>
                <Card className="bg-orange-50 border-orange-200">
                    <div className="text-orange-800">
                        <p className="text-sm font-medium">Total Mora Acumulada</p>
                        <p className="text-2xl font-bold">
                            L {credits.filter(c => c.status !== 'paid').reduce((sum, c) => {
                                const mora = NotificationService.calculateMora(c, settings?.defaultCreditRate || 2);
                                return sum + mora.moraAmount;
                            }, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                    </div>
                </Card>
                <Card className="bg-green-50 border-green-200">
                    <div className="text-green-800">
                        <p className="text-sm font-medium">Créditos Liquidados</p>
                        <p className="text-2xl font-bold">{credits.filter(c => c.status === 'paid').length}</p>
                    </div>
                </Card>
            </div>

            <Card title="Créditos Activos">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="p-3">Cliente</th>
                                <th className="p-3">Vencimiento</th>
                                <th className="p-3">Días Vencido</th>
                                <th className="p-3">Total</th>
                                <th className="p-3">Pagado</th>
                                <th className="p-3">Saldo</th>
                                <th className="p-3">Mora</th>
                                <th className="p-3">Estado</th>
                                <th className="p-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {credits.map(c => {
                                const cust = customers.find(cust => cust.id === c.customerId);
                                const balance = c.totalAmount - c.paidAmount;
                                const mora = NotificationService.calculateMora(c, settings?.defaultCreditRate || 2);
                                const isOverdue = mora.daysOverdue > 0;
                                return (
                                    <tr key={c.id} className={isOverdue ? 'bg-red-50/50' : ''}>
                                        <td className="p-3 font-medium">{cust?.name}</td>
                                        <td className="p-3">{getLocalDate(c.dueDate)}</td>
                                        <td className="p-3">
                                            {isOverdue ? (
                                                <span className="text-red-600 font-bold">{mora.daysOverdue} días</span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="p-3">L {c.totalAmount.toFixed(2)}</td>
                                        <td className="p-3 text-green-600">L {c.paidAmount.toFixed(2)}</td>
                                        <td className="p-3 font-bold text-red-600">L {balance.toFixed(2)}</td>
                                        <td className="p-3">
                                            {mora.moraAmount > 0 ? (
                                                <span className="text-orange-600 font-bold">L {mora.moraAmount.toFixed(2)}</span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="p-3"><Badge variant={c.status === 'paid' ? 'success' : isOverdue ? 'danger' : 'warning'}>{isOverdue ? 'overdue' : c.status}</Badge></td>
                                        <td className="p-3 text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button size="sm" variant="ghost" onClick={() => printAccountStatement(c)} title="Estado de Cuenta"><i className="fas fa-file-alt"></i></Button>
                                                {c.status === 'paid' ? (
                                                    <Button size="sm" variant="success" onClick={() => printSettlement(c)} title="Imprimir Finiquito"><i className="fas fa-certificate"></i></Button>
                                                ) : (
                                                    <>
                                                        <Button size="sm" onClick={() => { setSelectedCredit(c); setPayModalOpen(true); }} icon="hand-holding-usd">Abonar</Button>
                                                        <Button size="sm" variant="accent" onClick={() => openLiquidationModal(c)} title="Pagar Todo Anticipado">Liquidar</Button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Card title="Historial de Abonos Recibidos" noPadding>
                <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col md:flex-row gap-4">
                    <Input
                        placeholder="Buscar por cliente..."
                        value={historySearchTerm}
                        onChange={e => setHistorySearchTerm(e.target.value)}
                        icon="search"
                        className="flex-1"
                    />
                    <Input
                        type="date"
                        value={historyDateFilter}
                        onChange={e => setHistoryDateFilter(e.target.value)}
                        className="md:w-48"
                    />
                </div>
                <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white text-gray-500 font-semibold border-b sticky top-0 z-10">
                            <tr>
                                <th className="p-4">Fecha</th>
                                <th className="p-4">Cliente</th>
                                <th className="p-4">Ref. Crédito</th>
                                <th className="p-4">Nota / Detalle</th>
                                <th className="p-4">Método</th>
                                <th className="p-4 text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredPayments.map((p, idx) => (
                                <tr key={p.id || idx} className="hover:bg-gray-50">
                                    <td className="p-4 text-gray-600">
                                        {getLocalDate(p.date)}
                                        <span className="text-xs text-gray-400 block">{getLocalTime(p.date)}</span>
                                    </td>
                                    <td className="p-4 font-bold text-gray-800">{p.customerName}</td>
                                    <td className="p-4 font-mono text-xs">{p.creditRef}</td>
                                    <td className="p-4 text-gray-600 max-w-[200px] truncate" title={p.note}>{p.note || '-'}</td>
                                    <td className="p-4"><Badge variant="default">{p.method}</Badge></td>
                                    <td className="p-4 text-right font-bold text-green-600">+ L {p.amount.toFixed(2)}</td>
                                </tr>
                            ))}
                            {filteredPayments.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-8 text-gray-400">No hay abonos registrados con estos filtros.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Modal isOpen={payModalOpen} onClose={() => setPayModalOpen(false)} title="Registrar Abono">
                <div className="space-y-4">
                    <div className="p-4 bg-gray-50 rounded-lg text-center">
                        <p className="text-sm text-gray-500">Saldo Pendiente</p>
                        <p className="text-2xl font-bold text-gray-800">L {(selectedCredit ? selectedCredit.totalAmount - selectedCredit.paidAmount : 0).toFixed(2)}</p>
                    </div>

                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
                        <i className="fas fa-info-circle text-blue-500 mt-0.5"></i>
                        <p className="text-xs text-blue-700">
                            <strong>Nota:</strong> Todos los abonos reducen el saldo general. Para cancelar la deuda total ahorrando los intereses futuros no devengados, utilice la opción <strong>"Liquidar"</strong> en la pantalla principal.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Monto a Abonar" type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus />
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase">Método</label>
                            <select
                                className="w-full p-3 border rounded-xl appearance-none bg-gray-100 font-bold text-sm"
                                value={payMethod}
                                onChange={e => setPayMethod(e.target.value as any)}
                            >
                                <option value="Efectivo">Efectivo</option>
                                <option value="Tarjeta">Tarjeta</option>
                                <option value="Transferencia">Transferencia</option>
                            </select>
                        </div>
                    </div>

                    {(payMethod === 'Tarjeta' || payMethod === 'Transferencia') && (
                        <Input label="Referencia / No Comprobante" value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="Opcional" />
                    )}

                    <div className="flex justify-end">
                        <button
                            type="button"
                            className="text-xs text-primary font-bold hover:underline"
                            onClick={() => selectedCredit && setPayAmount((selectedCredit.totalAmount - selectedCredit.paidAmount).toFixed(2))}
                        >
                            Pagar Totalidad (L {(selectedCredit ? selectedCredit.totalAmount - selectedCredit.paidAmount : 0).toFixed(2)})
                        </button>
                    </div>

                    <Button className="w-full" onClick={handlePayment} disabled={isSaving}>{isSaving ? <><i className="fas fa-spinner fa-spin mr-2"></i>Procesando...</> : 'Confirmar Pago e Imprimir'}</Button>
                </div>
            </Modal>

            <Modal isOpen={liquidationModalOpen} onClose={() => setLiquidationModalOpen(false)} title="Liquidación Anticipada">
                {liquidationDetails && (
                    <div className="space-y-5">
                        <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 text-purple-900 text-sm">
                            <div className="flex items-start gap-3">
                                <i className="fas fa-piggy-bank text-2xl text-purple-600 mt-1"></i>
                                <div>
                                    <p className="font-bold text-lg">Ahorro Estimado: L {liquidationDetails.savings.toFixed(2)}</p>
                                    <p className="opacity-80">Al cancelar la deuda hoy, pagas solo los intereses generados hasta la fecha.</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 text-sm text-gray-700">
                            <div className="flex justify-between">
                                <span>Días Transcurridos:</span>
                                <span className="font-bold">{liquidationDetails.daysElapsed} días</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Interés Generado (al día de hoy):</span>
                                <span className="font-bold">L {liquidationDetails.interestAccrued.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between border-t pt-2 mt-2">
                                <span>Deuda Total Ajustada:</span>
                                <span className="font-bold">L {liquidationDetails.totalDebtToday.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-green-600">
                                <span>(-) Pagos Realizados:</span>
                                <span className="font-bold">L {selectedCredit?.paidAmount.toFixed(2)}</span>
                            </div>
                        </div>

                        <div className="bg-gray-900 text-white p-5 rounded-xl text-center">
                            <p className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-1">Monto a Pagar para Liquidar</p>
                            <p className="text-3xl font-extrabold">L {liquidationDetails.remainingToPay.toFixed(2)}</p>
                        </div>

                        <div className="flex gap-3">
                            <Button variant="secondary" className="flex-1" onClick={() => setLiquidationModalOpen(false)}>Cancelar</Button>
                            <Button variant="success" className="flex-1" onClick={confirmLiquidation} icon={isSaving ? undefined : "check-double"} disabled={isSaving}>{isSaving ? <><i className="fas fa-spinner fa-spin mr-2"></i>Procesando...</> : 'Confirmar Liquidación'}</Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Credits;
