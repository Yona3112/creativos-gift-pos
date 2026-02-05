
import React, { useState, useEffect } from 'react';
import { db } from '../services/storageService';
import { CashCut as ICashCut, Sale, CompanySettings } from '../types';
import { Button, Input, Card, ConfirmDialog, Modal, Badge, showToast } from '../components/UIComponents';

// Extended CashCut type for detailed printing
interface CashCutPrintData extends ICashCut {
  cardTotal?: number;
  transferTotal?: number;
  creditTotal?: number;
  creditPayments?: number;
  orderPayments?: number;
  cashExpenses?: number;
  cashRefunds?: number;
}

export const CashCut: React.FC = () => {
  const [todaySales, setTodaySales] = useState<Sale[]>([]);
  const [totals, setTotals] = useState({
    cash: 0, card: 0, transfer: 0, credit: 0, total: 0,
    creditPayments: 0, orderPayments: 0, cashExpenses: 0, cashRefunds: 0
  });

  const [denominations, setDenominations] = useState({
    bill500: 0, bill200: 0, bill100: 0, bill50: 0, bill20: 0, bill10: 0, bill5: 0, bill2: 0, bill1: 0, coins: 0
  });
  const [cashCutConfirm, setCashCutConfirm] = useState(false);

  // Reversal State
  const [history, setHistory] = useState<ICashCut[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [todayCutExists, setTodayCutExists] = useState(false);
  const [todayCutData, setTodayCutData] = useState<ICashCut | null>(null);
  const [revertModalOpen, setRevertModalOpen] = useState(false);
  const [revertCutId, setRevertCutId] = useState<string | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Multiple Cut State
  const [forceNewCut, setForceNewCut] = useState(false);
  const [lastCutDate, setLastCutDate] = useState<string | null>(null);

  const loadData = async () => {
    const uncutData = await db.getUncutData();
    const { sales, creditPayments, cashExpenses, cashRefunds, lastCutDate: lastDate } = uncutData;

    setTodaySales(sales);
    setLastCutDate(lastDate);

    // Calculate totals from uncut sales
    const t = sales.reduce((acc, s) => {
      // 1. Initial sale/deposit - count if the sale was created in this period
      if (new Date(s.date).getTime() > uncutData.lastCutTime) {
        if (s.paymentMethod === 'Efectivo') acc.cash += s.isOrder ? (s.deposit || 0) : s.total;
        else if (s.paymentMethod === 'Tarjeta') acc.card += s.isOrder ? (s.deposit || 0) : s.total;
        else if (s.paymentMethod === 'Transferencia') acc.transfer += s.isOrder ? (s.deposit || 0) : s.total;
        else if (s.paymentMethod === 'Crédito') acc.credit += s.total;
        else if (s.paymentMethod === 'Mixto' && s.paymentDetails) {
          acc.cash += s.paymentDetails.cash || 0;
          acc.card += s.paymentDetails.card || 0;
          acc.transfer += s.paymentDetails.transfer || 0;
        }
        acc.total += s.isOrder ? (s.deposit || 0) : s.total;
      }

      // 2. Balance payment - count if the balance was paid in this period
      if (s.balancePaymentDate && new Date(s.balancePaymentDate).getTime() > uncutData.lastCutTime) {
        const amount = s.balancePaid || 0;
        const method = s.balancePaymentMethod || 'Efectivo';
        if (method === 'Efectivo') acc.cash += amount;
        else if (method === 'Tarjeta') acc.card += amount;
        else if (method === 'Transferencia') acc.transfer += amount;
        acc.orderPayments += amount;
        acc.total += amount;
      }

      return acc;
    }, { cash: 0, card: 0, transfer: 0, credit: 0, total: 0, creditPayments: 0, orderPayments: 0, cashExpenses: 0, cashRefunds: 0 });

    // Add credit payments (abonos a créditos)
    t.cash += creditPayments.cash;
    t.card += creditPayments.card;
    t.transfer += creditPayments.transfer;
    t.creditPayments = creditPayments.cash + creditPayments.card + creditPayments.transfer;
    t.cashExpenses = cashExpenses;
    t.cashRefunds = cashRefunds;

    setTotals(t);

    // Load History and Settings
    const cuts = await db.getCashCuts();
    setHistory(cuts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    const s = await db.getSettings();
    setSettings(s);

    // Check if there's already a cut for "today" (for display purposes, but logic is now timestamp based)
    const today = db.getLocalTodayISO();
    const cutToday = cuts.find(c => c.date.startsWith(today));
    setTodayCutExists(!!cutToday);
    setTodayCutData(cutToday || null);
  };

  useEffect(() => {
    loadData();
  }, []);

  const calculateCounted = () => {
    return (denominations.bill500 * 500) + (denominations.bill200 * 200) +
      (denominations.bill100 * 100) + (denominations.bill50 * 50) +
      (denominations.bill20 * 20) + (denominations.bill10 * 10) +
      (denominations.bill5 * 5) + (denominations.bill2 * 2) +
      (denominations.bill1 * 1) + denominations.coins;
  };

  const countedTotal = calculateCounted();
  const netCashExpected = totals.cash - totals.cashExpenses - totals.cashRefunds;
  const difference = countedTotal - netCashExpected;

  const handleSave = async () => {
    setCashCutConfirm(true);
  };

  const confirmCashCut = async () => {
    const cut: ICashCut = {
      id: `cut-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      date: new Date().toISOString(),
      userId: 'current',
      branchId: 'current',
      totalSales: totals.total,
      cashExpected: netCashExpected, // Net expected in drawer
      cashCounted: countedTotal,
      difference,
      details: denominations,
      // Payment method breakdown
      cardTotal: totals.card,
      transferTotal: totals.transfer,
      creditTotal: totals.credit,
      creditPayments: totals.creditPayments,
      orderPayments: totals.orderPayments,
      cashExpenses: totals.cashExpenses,
      cashRefunds: totals.cashRefunds
    };
    await db.saveCashCut(cut);
    showToast('Corte de caja guardado exitosamente', 'success');
    setDenominations({ bill500: 0, bill200: 0, bill100: 0, bill50: 0, bill20: 0, bill10: 0, bill5: 0, bill2: 0, bill1: 0, coins: 0 });
    setCashCutConfirm(false);
    setForceNewCut(false);
    loadData(); // Reload to show in history
  };

  const handleRevertClick = (id: string) => {
    setRevertCutId(id);
    setAdminPassword('');
    setPasswordError('');
    setRevertModalOpen(true);
  };

  const confirmReversal = async () => {
    const correctPassword = settings?.masterPassword || 'admin123';
    if (adminPassword !== correctPassword) {
      setPasswordError('Contraseña incorrecta');
      return;
    }

    if (revertCutId) {
      await db.deleteCashCut(revertCutId);
      showToast('Corte de caja revertido exitosamente', 'success');
      setRevertModalOpen(false);
      loadData();
    }
  };

  // Print Cash Cut Receipt
  const printCashCut = (cut: ICashCut) => {
    const s = settings;
    if (!s) return;

    const d = cut.details;
    const dateFormatted = new Date(cut.date).toLocaleString('es-HN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Calculate denominations total for verification
    const denomTotal = (d.bill500 * 500) + (d.bill200 * 200) + (d.bill100 * 100) + (d.bill50 * 50) +
      (d.bill20 * 20) + (d.bill10 * 10) + (d.bill5 * 5) + (d.bill2 * 2) + (d.bill1 * 1) + d.coins;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          @page { margin: 5mm; }
          body { 
            font-family: 'Courier New', monospace; 
            font-size: 11px; 
            width: ${s.printerSize === '58mm' ? '48mm' : '72mm'}; 
            margin: 0 auto; 
            padding: 5px; 
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .hr { border-top: 1px dashed #333; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; margin: 2px 0; }
          .section { margin: 8px 0; }
          .section-title { font-weight: bold; background: #f0f0f0; padding: 3px 5px; margin-bottom: 5px; }
          .big { font-size: 14px; font-weight: bold; }
          .diff-ok { color: green; }
          .diff-over { color: blue; }
          .diff-short { color: red; }
        </style>
      </head>
      <body>
        <div class="center">
          ${s.logo ? `<img src="${s.logo}" style="max-height: 40px; margin-bottom: 5px;">` : ''}
          <div class="bold" style="font-size: 13px;">${s.name}</div>
          <div style="font-size: 10px;">RTN: ${s.rtn}</div>
          <div style="font-size: 10px;">${s.address}</div>
        </div>

        <div class="hr"></div>
        <div class="center bold big">CORTE DE CAJA</div>
        <div class="center" style="font-size: 10px;">${dateFormatted}</div>
        <div class="hr"></div>

        <div class="section">
          <div class="section-title">📊 RESUMEN DE VENTAS</div>
          <div class="row"><span>Total Ventas:</span><span class="bold">L ${cut.totalSales.toFixed(2)}</span></div>
        </div>

        <div class="section">
          <div class="section-title">💳 DESGLOSE POR MÉTODO</div>
          <div class="row"><span>💵 Efectivo:</span><span>L ${cut.cashExpected.toFixed(2)}</span></div>
          ${cut.cardTotal ? `<div class="row"><span>💳 Tarjetas:</span><span>L ${cut.cardTotal.toFixed(2)}</span></div>` : ''}
          ${cut.transferTotal ? `<div class="row"><span>📲 Transferencias:</span><span>L ${cut.transferTotal.toFixed(2)}</span></div>` : ''}
          ${cut.creditTotal ? `<div class="row"><span>📋 Créditos (CxC):</span><span>L ${cut.creditTotal.toFixed(2)}</span></div>` : ''}
          ${cut.creditPayments ? `<div class="row"><span>💰 Abonos Créditos:</span><span>L ${cut.creditPayments.toFixed(2)}</span></div>` : ''}
          ${cut.orderPayments ? `<div class="row"><span>📦 Pagos Pedidos:</span><span>L ${cut.orderPayments.toFixed(2)}</span></div>` : ''}
          ${cut.cashExpenses ? `<div class="row" style="color: #c00;"><span>📤 Gastos Efectivo:</span><span>-L ${cut.cashExpenses.toFixed(2)}</span></div>` : ''}
          ${cut.cashRefunds ? `<div class="row" style="color: #c00;"><span>↩️ Reembolsos:</span><span>-L ${cut.cashRefunds.toFixed(2)}</span></div>` : ''}
        </div>

        <div class="section">
          <div class="section-title">💵 EFECTIVO EN CAJA</div>
          <div class="row"><span>Esperado (Sistema):</span><span>L ${cut.cashExpected.toFixed(2)}</span></div>
          <div class="row"><span>Contado (Físico):</span><span>L ${cut.cashCounted.toFixed(2)}</span></div>
          <div class="hr"></div>
          <div class="row big ${Math.abs(cut.difference) < 1 ? 'diff-ok' : cut.difference > 0 ? 'diff-over' : 'diff-short'}">
            <span>DIFERENCIA:</span>
            <span>${cut.difference > 0 ? '+' : ''}L ${cut.difference.toFixed(2)}</span>
          </div>
        </div>

        <div class="section">
          <div class="section-title">🧾 DENOMINACIONES CONTADAS</div>
          ${d.bill500 > 0 ? `<div class="row"><span>L 500 x ${d.bill500}</span><span>L ${(d.bill500 * 500).toFixed(2)}</span></div>` : ''}
          ${d.bill200 > 0 ? `<div class="row"><span>L 200 x ${d.bill200}</span><span>L ${(d.bill200 * 200).toFixed(2)}</span></div>` : ''}
          ${d.bill100 > 0 ? `<div class="row"><span>L 100 x ${d.bill100}</span><span>L ${(d.bill100 * 100).toFixed(2)}</span></div>` : ''}
          ${d.bill50 > 0 ? `<div class="row"><span>L 50 x ${d.bill50}</span><span>L ${(d.bill50 * 50).toFixed(2)}</span></div>` : ''}
          ${d.bill20 > 0 ? `<div class="row"><span>L 20 x ${d.bill20}</span><span>L ${(d.bill20 * 20).toFixed(2)}</span></div>` : ''}
          ${d.bill10 > 0 ? `<div class="row"><span>L 10 x ${d.bill10}</span><span>L ${(d.bill10 * 10).toFixed(2)}</span></div>` : ''}
          ${d.bill5 > 0 ? `<div class="row"><span>L 5 x ${d.bill5}</span><span>L ${(d.bill5 * 5).toFixed(2)}</span></div>` : ''}
          ${d.bill2 > 0 ? `<div class="row"><span>L 2 x ${d.bill2}</span><span>L ${(d.bill2 * 2).toFixed(2)}</span></div>` : ''}
          ${d.bill1 > 0 ? `<div class="row"><span>L 1 x ${d.bill1}</span><span>L ${(d.bill1 * 1).toFixed(2)}</span></div>` : ''}
          ${d.coins > 0 ? `<div class="row"><span>Monedas</span><span>L ${d.coins.toFixed(2)}</span></div>` : ''}
          <div class="hr"></div>
          <div class="row bold"><span>TOTAL CONTADO:</span><span>L ${denomTotal.toFixed(2)}</span></div>
        </div>

        <div class="hr"></div>
        <div class="center" style="font-size: 9px; margin-top: 10px;">
          <p>Documento generado automáticamente</p>
          <p>${new Date().toLocaleString('es-HN')}</p>
        </div>
      </body>
      </html>
    `;

    const win = window.open('', '_blank', 'width=400,height=600');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => { win.print(); win.close(); }, 500);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Corte de Caja</h1>
        <div className="text-right">
          <p className="text-xs text-gray-500 font-bold uppercase">Período del Corte</p>
          <p className="text-[10px] text-primary font-bold">
            {lastCutDate ? new Date(lastCutDate).toLocaleString() : 'Inicio'} → Ahora
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Totals */}
        <div className="space-y-6">
          <Card title="Flujo de Caja Diario" className="shadow-md">
            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 border border-blue-100 flex justify-between">
                <span><i className="fas fa-info-circle mr-2"></i> Incluye Ventas y Abonos a Créditos</span>
              </div>

              <div className="flex justify-between items-center p-3 bg-green-50 rounded-xl border border-green-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-green-200 flex items-center justify-center text-green-700 text-xs"><i className="fas fa-money-bill-wave"></i></div>
                  <div>
                    <span className="text-green-900 font-bold text-xs block uppercase">Efectivo Esperado</span>
                  </div>
                </div>
                <span className="text-lg font-black text-green-700">L {totals.cash.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-xl border border-blue-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center text-blue-700 text-xs"><i className="fas fa-credit-card"></i></div>
                  <span className="text-blue-900 font-bold text-xs uppercase">Tarjetas</span>
                </div>
                <span className="text-lg font-black text-blue-700">L {totals.card.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center p-3 bg-purple-50 rounded-xl border border-purple-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center text-purple-700 text-xs"><i className="fas fa-wifi"></i></div>
                  <span className="text-purple-900 font-bold text-xs uppercase">Transferencias</span>
                </div>
                <span className="text-lg font-black text-purple-700">L {totals.transfer.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center p-3 bg-orange-50 rounded-xl border border-orange-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-orange-200 flex items-center justify-center text-orange-700 text-xs"><i className="fas fa-hand-holding-usd"></i></div>
                  <span className="text-orange-900 font-bold text-xs uppercase">Créditos (CxC)</span>
                </div>
                <span className="text-lg font-black text-orange-700">L {totals.credit.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center p-3 bg-red-50 rounded-xl border border-red-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-red-200 flex items-center justify-center text-red-700 text-xs"><i className="fas fa-arrow-down"></i></div>
                  <span className="text-red-900 font-bold text-xs uppercase">Gastos en Efectivo</span>
                </div>
                <span className="text-lg font-black text-red-700">-L {totals.cashExpenses.toFixed(2)}</span>
              </div>

              {totals.cashRefunds > 0 && (
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-xl border border-red-100 mt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-red-200 flex items-center justify-center text-red-700 text-xs"><i className="fas fa-undo"></i></div>
                    <span className="text-red-900 font-bold text-xs uppercase">Reembolsos Efectivo</span>
                  </div>
                  <span className="text-lg font-black text-red-700">-L {totals.cashRefunds.toFixed(2)}</span>
                </div>
              )}

              <div className="border-t border-dashed border-gray-300 pt-4 mt-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-gray-500 text-xs uppercase font-bold">Resumen de Caja</span>
                </div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-gray-500 text-xs">Abonos a Créditos</span>
                  <span className="font-bold text-gray-700 text-xs">L {totals.creditPayments.toFixed(2)}</span>
                </div>
                {totals.orderPayments > 0 && (
                  <div className="flex justify-between items-center mb-1 text-xs">
                    <span className="text-gray-500 flex items-center gap-1">
                      <i className="fas fa-box text-pink-500"></i>
                      Pagos de Pedidos
                    </span>
                    <span className="font-bold text-pink-600">L {totals.orderPayments.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center mt-2 pt-2 border-t">
                  <span className="text-green-900 font-black text-base uppercase tracking-wider">Efectivo en Caja</span>
                  <span className="text-2xl font-black text-green-700 tracking-tight">L {netCashExpected.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-gray-600 font-bold text-sm uppercase">Total Otros Medios</span>
                  <span className="text-lg font-bold text-slate-700">L {(totals.card + totals.transfer).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Money Counting or Cut Summary */}
        <Card title={(todayCutExists && !forceNewCut) ? "Resumen del Corte de Hoy" : "Arqueo de Efectivo"} className="shadow-md h-fit">
          {todayCutExists && todayCutData && !forceNewCut ? (
            <div className="space-y-4">
              <div className="bg-green-50 p-4 rounded-xl border border-green-200 text-center">
                <i className="fas fa-check-circle text-green-600 text-3xl mb-2"></i>
                <p className="text-green-800 font-bold text-lg">Corte de caja realizado</p>
                <p className="text-green-600 text-sm">{new Date(todayCutData.date).toLocaleString()}</p>
              </div>

              <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 space-y-3">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Ventas Totales:</span>
                  <span className="font-mono font-bold">L {todayCutData.totalSales.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Efectivo Sistema:</span>
                  <span className="font-mono font-bold">L {todayCutData.cashExpected.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Efectivo Contado:</span>
                  <span className="font-mono font-bold">L {todayCutData.cashCounted.toFixed(2)}</span>
                </div>
                <div className="h-px bg-gray-200 my-1"></div>
                <div className={`flex justify-between text-xl font-bold ${todayCutData.difference < -0.99 ? 'text-red-500' : todayCutData.difference > 0.99 ? 'text-blue-500' : 'text-green-600'}`}>
                  <span>Diferencia:</span>
                  <span>{todayCutData.difference > 0 ? '+' : ''}L {todayCutData.difference.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <Button variant="secondary" className="w-full" onClick={() => setForceNewCut(true)} icon="plus">
                  Realizar otro corte hoy
                </Button>
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 flex items-start gap-2 text-sm">
                  <i className="fas fa-info-circle text-amber-600 mt-0.5"></i>
                  <p className="text-amber-800">
                    Si el corte anterior fue de un turno previo (ej. medianoche), puedes iniciar uno nuevo sin revertir el anterior.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {forceNewCut && (
                <div className="mb-4 flex justify-between items-center bg-blue-50 p-3 rounded-xl border border-blue-100">
                  <span className="text-sm font-bold text-blue-800">Corte Adicional</span>
                  <button onClick={() => setForceNewCut(false)} className="text-blue-500 hover:text-blue-700 text-xs font-bold underline">Cancelar</button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 mb-4">
                <Input label="L 500" type="number" min="0" value={denominations.bill500} onChange={e => setDenominations({ ...denominations, bill500: parseInt(e.target.value) || 0 })} className="!py-1 text-xs" />
                <Input label="L 200" type="number" min="0" value={denominations.bill200} onChange={e => setDenominations({ ...denominations, bill200: parseInt(e.target.value) || 0 })} className="!py-1 text-xs" />
                <Input label="L 100" type="number" min="0" value={denominations.bill100} onChange={e => setDenominations({ ...denominations, bill100: parseInt(e.target.value) || 0 })} className="!py-1 text-xs" />
                <Input label="L 50" type="number" min="0" value={denominations.bill50} onChange={e => setDenominations({ ...denominations, bill50: parseInt(e.target.value) || 0 })} className="!py-1 text-xs" />
                <Input label="L 20" type="number" min="0" value={denominations.bill20} onChange={e => setDenominations({ ...denominations, bill20: parseInt(e.target.value) || 0 })} className="!py-1 text-xs" />
                <Input label="L 10" type="number" min="0" value={denominations.bill10} onChange={e => setDenominations({ ...denominations, bill10: parseInt(e.target.value) || 0 })} className="!py-1 text-xs" />
                <Input label="L 5" type="number" min="0" value={denominations.bill5} onChange={e => setDenominations({ ...denominations, bill5: parseInt(e.target.value) || 0 })} className="!py-1 text-xs" />
                <Input label="L 2" type="number" min="0" value={denominations.bill2} onChange={e => setDenominations({ ...denominations, bill2: parseInt(e.target.value) || 0 })} className="!py-1 text-xs" />
                <Input label="L 1" type="number" min="0" value={denominations.bill1} onChange={e => setDenominations({ ...denominations, bill1: parseInt(e.target.value) || 0 })} className="!py-1 text-xs" />
                <Input label="Monedas" type="number" min="0" step="0.01" value={denominations.coins} onChange={e => setDenominations({ ...denominations, coins: parseFloat(e.target.value) || 0 })} className="!py-1 text-xs" />
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                <div className="flex justify-between text-xs text-gray-500 font-bold uppercase">
                  <span>Efectivo Contado</span>
                  <span className="font-mono">L {countedTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500 font-bold uppercase">
                  <span>Efectivo Sistema (NETO)</span>
                  <span className="font-mono">L {netCashExpected.toFixed(2)}</span>
                </div>
                <div className="h-px bg-gray-200 my-0.5"></div>
                <div className={`flex justify-between text-lg font-black ${difference < -0.99 ? 'text-red-500' : difference > 0.99 ? 'text-blue-500' : 'text-green-600'}`}>
                  <span>DIFERENCIA</span>
                  <span>{difference > 0 ? '+' : ''}L {difference.toFixed(2)}</span>
                </div>
              </div>

              <Button
                className="w-full mt-6 py-3 shadow-lg shadow-primary/20"
                onClick={handleSave}
                disabled={countedTotal === 0 && totals.cash > 0}
                icon="lock"
              >
                Finalizar Turno y Cerrar Caja
              </Button>
            </>
          )}
        </Card>
      </div>

      <Card title="Historial de Cortes Recientes" className="shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 font-semibold border-b">
              <tr>
                <th className="px-4 py-3">Fecha / Hora</th>
                <th className="px-4 py-3">Ventas Totales</th>
                <th className="px-4 py-3">Efectivo Sistema</th>
                <th className="px-4 py-3">Efectivo Contado</th>
                <th className="px-4 py-3">Diferencia</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {history.slice(0, 10).map(cut => (
                <tr key={cut.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(cut.date).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium">L {cut.totalSales.toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-600">L {cut.cashExpected.toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-600">L {cut.cashCounted.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={Math.abs(cut.difference) < 1 ? 'success' : 'danger'}>
                      L {cut.difference.toFixed(2)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right flex gap-2 justify-end">
                    <Button size="sm" variant="secondary" onClick={() => printCashCut(cut)} icon="print" title="Imprimir Corte">
                      Imprimir
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => handleRevertClick(cut.id)} icon="undo" title="Revertir Corte">
                      Revertir
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        isOpen={cashCutConfirm}
        title="Cerrar Caja"
        message="¿Estás seguro de cerrar la caja? Esta acción no se puede deshacer."
        confirmText="Cerrar Caja"
        cancelText="Cancelar"
        variant="warning"
        onConfirm={confirmCashCut}
        onCancel={() => setCashCutConfirm(false)}
      />

      <Modal isOpen={revertModalOpen} onClose={() => setRevertModalOpen(false)} title="Revertir Corte de Caja" size="sm">
        <div className="space-y-4">
          <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-start gap-3">
            <i className="fas fa-exclamation-triangle text-red-500 mt-1"></i>
            <p className="text-sm text-red-800">
              Esta acción eliminará el registro del corte. Requiere permiso administrativo.
            </p>
          </div>
          <Input
            type="password"
            label="Contraseña Administrativa"
            value={adminPassword}
            onChange={e => { setAdminPassword(e.target.value); setPasswordError(''); }}
            error={passwordError}
            autoFocus
          />
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setRevertModalOpen(false)}>Cancelar</Button>
            <Button variant="danger" className="flex-1" onClick={confirmReversal} disabled={!adminPassword}>Confirmar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
