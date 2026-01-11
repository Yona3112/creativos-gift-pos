
import React, { useState, useEffect } from 'react';
import { db } from '../services/storageService';
import { CashCut as ICashCut, Sale } from '../types';
import { Button, Input, Card, ConfirmDialog, showToast } from '../components/UIComponents';

export const CashCut: React.FC = () => {
  const [todaySales, setTodaySales] = useState<Sale[]>([]);
  const [totals, setTotals] = useState({ cash: 0, card: 0, transfer: 0, credit: 0, total: 0, creditPayments: 0 });

  const [denominations, setDenominations] = useState({
    bill500: 0, bill200: 0, bill100: 0, bill50: 0, bill20: 0, bill10: 0, bill5: 0, bill2: 0, bill1: 0, coins: 0
  });
  const [cashCutConfirm, setCashCutConfirm] = useState(false);

  // Helper for Local Date (Fix UTC Bug in Cash Cut)
  const getLocalDate = (d: Date = new Date()) => {
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  };

  useEffect(() => {
    const loadData = async () => {
      const today = getLocalDate();
      const allSales = await db.getSales();
      const sales = allSales.filter(s => {
        const saleLocal = getLocalDate(new Date(s.date));
        return saleLocal === today && s.status === 'active';
      });

      setTodaySales(sales);
      const creditPayments = await db.getTodaysCreditPayments(today);

      const t = sales.reduce((acc, s) => {
        if (s.paymentMethod === 'Efectivo') acc.cash += s.total;
        else if (s.paymentMethod === 'Tarjeta') acc.card += s.total;
        else if (s.paymentMethod === 'Transferencia') acc.transfer += s.total;
        else if (s.paymentMethod === 'Crédito') acc.credit += s.total;

        if (s.paymentMethod === 'Mixto' && s.paymentDetails) {
          acc.cash += s.paymentDetails.cash || 0;
          acc.card += s.paymentDetails.card || 0;
          acc.transfer += s.paymentDetails.transfer || 0;
        }

        acc.total += s.total;
        return acc;
      }, { cash: 0, card: 0, transfer: 0, credit: 0, total: 0, creditPayments: 0 });

      t.cash += creditPayments.cash;
      t.card += creditPayments.card;
      t.transfer += creditPayments.transfer;
      t.creditPayments = creditPayments.cash + creditPayments.card + creditPayments.transfer;

      setTotals(t);
    };
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
  const difference = countedTotal - totals.cash;

  const handleSave = async () => {
    setCashCutConfirm(true);
  };

  const confirmCashCut = async () => {
    const cut: ICashCut = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      userId: 'current',
      branchId: 'current',
      totalSales: totals.total,
      cashExpected: totals.cash,
      cashCounted: countedTotal,
      difference,
      details: denominations
    };
    await db.saveCashCut(cut);
    showToast('Corte de caja guardado exitosamente', 'success');
    setDenominations({ bill500: 0, bill200: 0, bill100: 0, bill50: 0, bill20: 0, bill10: 0, bill5: 0, bill2: 0, bill1: 0, coins: 0 });
    setCashCutConfirm(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Corte de Caja</h1>
        <div className="text-right">
          <p className="text-sm text-gray-500">Fecha</p>
          <p className="font-bold text-gray-900">{new Date().toLocaleDateString()}</p>
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

              <div className="flex justify-between items-center p-4 bg-green-50 rounded-xl border border-green-100 transition-transform hover:scale-[1.01]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-200 flex items-center justify-center text-green-700"><i className="fas fa-money-bill-wave"></i></div>
                  <div>
                    <span className="text-green-900 font-medium block">Efectivo Esperado</span>
                    <span className="text-xs text-green-600">En Caja Física</span>
                  </div>
                </div>
                <span className="text-xl font-bold text-green-700">L {totals.cash.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center p-4 bg-blue-50 rounded-xl border border-blue-100 transition-transform hover:scale-[1.01]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center text-blue-700"><i className="fas fa-credit-card"></i></div>
                  <span className="text-blue-900 font-medium">Tarjetas</span>
                </div>
                <span className="text-xl font-bold text-blue-700">L {totals.card.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center p-4 bg-purple-50 rounded-xl border border-purple-100 transition-transform hover:scale-[1.01]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-200 flex items-center justify-center text-purple-700"><i className="fas fa-wifi"></i></div>
                  <span className="text-purple-900 font-medium">Transferencias</span>
                </div>
                <span className="text-xl font-bold text-purple-700">L {totals.transfer.toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center p-4 bg-orange-50 rounded-xl border border-orange-100 transition-transform hover:scale-[1.01]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-200 flex items-center justify-center text-orange-700"><i className="fas fa-hand-holding-usd"></i></div>
                  <span className="text-orange-900 font-medium">Créditos Nuevos (CxC)</span>
                </div>
                <span className="text-xl font-bold text-orange-700">L {totals.credit.toFixed(2)}</span>
              </div>

              <div className="border-t border-dashed border-gray-300 pt-4 mt-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-500 text-sm">Abonos Recibidos Hoy</span>
                  <span className="font-bold text-gray-700">L {totals.creditPayments.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 font-bold text-lg uppercase tracking-wide">Total Movimientos</span>
                  <span className="text-3xl font-bold text-slate-800">L {(totals.cash + totals.card + totals.transfer).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Money Counting */}
        <Card title="Arqueo de Efectivo" className="shadow-md h-fit">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-6">
            <Input label="L 500" type="number" min="0" value={denominations.bill500} onChange={e => setDenominations({ ...denominations, bill500: parseInt(e.target.value) || 0 })} />
            <Input label="L 200" type="number" min="0" value={denominations.bill200} onChange={e => setDenominations({ ...denominations, bill200: parseInt(e.target.value) || 0 })} />
            <Input label="L 100" type="number" min="0" value={denominations.bill100} onChange={e => setDenominations({ ...denominations, bill100: parseInt(e.target.value) || 0 })} />
            <Input label="L 50" type="number" min="0" value={denominations.bill50} onChange={e => setDenominations({ ...denominations, bill50: parseInt(e.target.value) || 0 })} />
            <Input label="L 20" type="number" min="0" value={denominations.bill20} onChange={e => setDenominations({ ...denominations, bill20: parseInt(e.target.value) || 0 })} />
            <Input label="L 10" type="number" min="0" value={denominations.bill10} onChange={e => setDenominations({ ...denominations, bill10: parseInt(e.target.value) || 0 })} />
            <Input label="L 5" type="number" min="0" value={denominations.bill5} onChange={e => setDenominations({ ...denominations, bill5: parseInt(e.target.value) || 0 })} />
            <Input label="L 2" type="number" min="0" value={denominations.bill2} onChange={e => setDenominations({ ...denominations, bill2: parseInt(e.target.value) || 0 })} />
            <Input label="L 1" type="number" min="0" value={denominations.bill1} onChange={e => setDenominations({ ...denominations, bill1: parseInt(e.target.value) || 0 })} />
            <Input label="Monedas (Total)" type="number" min="0" step="0.01" value={denominations.coins} onChange={e => setDenominations({ ...denominations, coins: parseFloat(e.target.value) || 0 })} />
          </div>

          <div className="bg-slate-50 p-5 rounded-xl border border-slate-100 space-y-3">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Efectivo Contado:</span>
              <span className="font-mono font-bold">L {countedTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Efectivo Sistema:</span>
              <span className="font-mono font-bold">L {totals.cash.toFixed(2)}</span>
            </div>
            <div className="h-px bg-gray-200 my-1"></div>
            <div className={`flex justify-between text-xl font-bold ${difference < -0.99 ? 'text-red-500' : difference > 0.99 ? 'text-blue-500' : 'text-green-600'}`}>
              <span>Diferencia:</span>
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
        </Card>
      </div>

      <ConfirmDialog
        isOpen={cashCutConfirm}
        title="Cerrar Caja"
        message="¿Estás seguro de cerrar la caja? Esta acción no se puede deshacer y quedará registrada en el sistema."
        confirmText="Cerrar Caja"
        cancelText="Cancelar"
        variant="warning"
        onConfirm={confirmCashCut}
        onCancel={() => setCashCutConfirm(false)}
      />
    </div>
  );
};
