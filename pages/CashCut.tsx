
import React, { useState, useEffect } from 'react';
import { db } from '../services/storageService';
import { CashCut as ICashCut, Sale, CompanySettings } from '../types';
import { Button, Input, Card, ConfirmDialog, Modal, Badge, showToast } from '../components/UIComponents';

export const CashCut: React.FC = () => {
  const [todaySales, setTodaySales] = useState<Sale[]>([]);
  const [totals, setTotals] = useState({ cash: 0, card: 0, transfer: 0, credit: 0, total: 0, creditPayments: 0, orderPayments: 0 });

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

  // Helper for Local Date using global db helper
  const getLocalDate = () => db.getLocalTodayISO();

  // Format date from ISO string to local display format
  const formatDateForDisplay = (dateStr: string) => {
    const d = new Date(dateStr);
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  };

  const loadData = async () => {
    const today = getLocalDate();
    const allSales = await db.getSales();
    const sales = allSales.filter(s => {
      const saleLocal = formatDateForDisplay(s.date);
      return saleLocal === today && s.status === 'active';
    });

    setTodaySales(sales);
    const creditPayments = await db.getTodaysCreditPayments(today);

    // Load History and Settings
    const cuts = await db.getCashCuts();
    setHistory(cuts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    const s = await db.getSettings();
    setSettings(s);

    // Check if there's already a cut for today
    const cutToday = cuts.find(c => formatDateForDisplay(c.date) === today);
    setTodayCutExists(!!cutToday);
    setTodayCutData(cutToday || null);

    // Calculate today's cash flow from sales made today
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
    }, { cash: 0, card: 0, transfer: 0, credit: 0, total: 0, creditPayments: 0, orderPayments: 0 });

    // Add credit payments (abonos a créditos)
    t.cash += creditPayments.cash;
    t.card += creditPayments.card;
    t.transfer += creditPayments.transfer;
    t.creditPayments = creditPayments.cash + creditPayments.card + creditPayments.transfer;

    // NEW: Add order balance payments made today (pagos de saldo de pedidos)
    // These are orders from PREVIOUS days where the remaining balance was paid TODAY
    const orderPaymentsToday = allSales.filter(s => {
      if (s.status !== 'active') return false;
      // Skip if sale was made today (it's already counted in today's sales)
      const saleDateLocal = formatDateForDisplay(s.date);
      if (saleDateLocal === today) return false;
      // Include if balance was paid today (using balancePaymentDate)
      if (s.balancePaymentDate) {
        return formatDateForDisplay(s.balancePaymentDate) === today;
      }
      return false;
    });

    let orderPaymentTotal = 0;
    for (const order of orderPaymentsToday) {
      // Use balancePaid field if available (new orders), fallback to paymentDetails for legacy
      const balancePaid = order.balancePaid || order.paymentDetails?.cash || order.paymentDetails?.card || order.paymentDetails?.transfer || 0;
      const method = order.balancePaymentMethod || 'Efectivo';

      if (method === 'Efectivo') {
        t.cash += balancePaid;
      } else if (method === 'Tarjeta') {
        t.card += balancePaid;
      } else if (method === 'Transferencia') {
        t.transfer += balancePaid;
      }

      orderPaymentTotal += balancePaid;
    }
    t.orderPayments = orderPaymentTotal;

    setTotals(t);
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
  const difference = countedTotal - totals.cash;

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
      cashExpected: totals.cash,
      cashCounted: countedTotal,
      difference,
      details: denominations
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

              <div className="border-t border-dashed border-gray-300 pt-4 mt-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-500 text-sm">Abonos a Créditos Hoy</span>
                  <span className="font-bold text-gray-700">L {totals.creditPayments.toFixed(2)}</span>
                </div>
                {totals.orderPayments > 0 && (
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-500 text-sm flex items-center gap-1">
                      <i className="fas fa-box text-pink-500"></i>
                      Pagos de Pedidos Hoy
                    </span>
                    <span className="font-bold text-pink-600">L {totals.orderPayments.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 font-black text-base uppercase tracking-wider">Total Hoy</span>
                  <span className="text-2xl font-black text-slate-800 tracking-tight">L {(totals.cash + totals.card + totals.transfer).toFixed(2)}</span>
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
                  <span>Efectivo Sistema</span>
                  <span className="font-mono">L {totals.cash.toFixed(2)}</span>
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
                  <td className="px-4 py-3 text-right">
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
