
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Product, Customer, Category, CartItem, Sale, User, PaymentDetails, Quote, LoyaltyLevel, FulfillmentStatus, CompanySettings } from '../types';
import { Button, Input, Modal, Badge, Alert, showToast } from '../components/UIComponents';
import { db } from '../services/storageService';

interface POSProps {
    products: Product[];
    customers: Customer[];
    categories: Category[];
    user: User | null;
    branchId: string;
    onSaleComplete: () => void;
    loadedQuote?: Quote | null;
    onQuoteProcessed?: () => void;
    onRefreshData?: () => void;
    settings: CompanySettings;
    onNavigate?: (page: string) => void;
}

export const POS: React.FC<POSProps> = ({
    products, customers, categories, user, branchId, onSaleComplete, loadedQuote, onQuoteProcessed, onRefreshData, settings, onNavigate
}) => {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [isConsumidorFinal, setIsConsumidorFinal] = useState(false);
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

    // Cash Cut Blocking State
    const [cashCutBlocked, setCashCutBlocked] = useState(false);
    const [pendingCutInfo, setPendingCutInfo] = useState<{ lastCutDate: string | null; salesCount: number }>({ lastCutDate: null, salesCount: 0 });

    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Mixto' | 'Crédito'>('Efectivo');
    const [documentType, setDocumentType] = useState<'FACTURA' | 'TICKET'>('TICKET');
    const [isImmediateDelivery, setIsImmediateDelivery] = useState(true);
    const [paymentDetails, setPaymentDetails] = useState<any>({ cash: 0, card: 0, transfer: 0, credit: 0 });
    const [receivedAmount, setReceivedAmount] = useState<string>('');
    const [globalDiscount, setGlobalDiscount] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [pointsUsed, setPointsUsed] = useState<number>(0);
    const [pointsDiscount, setPointsDiscount] = useState<number>(0);
    const [creditTerm, setCreditTerm] = useState<string>('1');
    const [creditDownPayment, setCreditDownPayment] = useState<string>('0');

    // Credit Note Usage State
    const [creditNoteFolio, setCreditNoteFolio] = useState<string>('');
    const [creditNoteAmount, setCreditNoteAmount] = useState<number>(0);
    const [creditNoteValid, setCreditNoteValid] = useState<boolean>(false);
    const [creditNoteMax, setCreditNoteMax] = useState<number>(0);
    const [depositAmount, setDepositAmount] = useState<string>('');

    const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
    const [newCustomerData, setNewCustomerData] = useState<Partial<Customer>>({ name: '', phone: '', rtn: '', type: 'Natural' });
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);
    const [manualItem, setManualItem] = useState({ name: '', price: '', cost: '', quantity: 1, isTaxable: true });
    const [manualError, setManualError] = useState('');

    const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
    const [lastSale, setLastSale] = useState<Sale | null>(null);

    // Quote creation state
    const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
    const [isQuoteSuccessModalOpen, setIsQuoteSuccessModalOpen] = useState(false);
    const [savedQuoteFolio, setSavedQuoteFolio] = useState('');
    const [quoteExpiration, setQuoteExpiration] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 15); // 15 days default
        return d.toISOString().split('T')[0];
    });

    const searchInputRef = useRef<HTMLInputElement>(null);

    // Totales - CORRECCIÓN: El ISV está INCLUIDO en el precio, no se suma después
    // Calcular subtotal SIN ISV y monto de ISV por separado
    const { subtotal, taxAmount } = useMemo(() => {
        let subtotalWithoutTax = 0;
        let totalTax = 0;

        cart.forEach(item => {
            const itemTotal = item.price * item.quantity;
            if (item.isTaxable) {
                // El precio YA incluye el ISV del 15%
                // Para obtener el precio sin ISV: Precio con ISV ÷ 1.15
                const itemSubtotal = itemTotal / 1.15;
                const itemTax = itemTotal - itemSubtotal;
                subtotalWithoutTax += itemSubtotal;
                totalTax += itemTax;
            } else {
                // Productos exentos de ISV
                subtotalWithoutTax += itemTotal;
            }
        });

        return {
            subtotal: Number(subtotalWithoutTax.toFixed(2)),
            taxAmount: Number(totalTax.toFixed(2))
        };
    }, [cart]);

    // Total con ISV incluido (suma de precios de venta)
    const totalWithTax = useMemo(() =>
        Number(cart.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)),
        [cart]);

    const totalDiscount = Number(((parseFloat(globalDiscount) || 0) + pointsDiscount).toFixed(2));
    const total = Math.max(0, Number((totalWithTax - totalDiscount).toFixed(2)));

    // Customer search and filter function
    const getFilteredCustomers = () => {
        const term = customerSearch.toLowerCase().trim();
        if (term) {
            // Search by name, RTN, DNI, or phone
            return customers
                .filter(c =>
                    c.name?.toLowerCase().includes(term) ||
                    c.rtn?.toLowerCase().includes(term) ||
                    c.dni?.toLowerCase().includes(term) ||
                    c.phone?.includes(term)
                )
                .slice(0, 5); // Max 5 results when searching
        }
        // No search term: show top 5 buyers by totalSpent
        return [...customers]
            .sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0))
            .slice(0, 5);
    };

    // Calculate profit margin and detect negative margins
    const marginAnalysis = useMemo(() => {
        let totalCost = 0;
        let totalRevenue = 0;
        const itemsBelowCost: { name: string; price: number; cost: number }[] = [];

        cart.forEach(item => {
            const revenue = item.price * item.quantity;
            const cost = (item.cost || 0) * item.quantity;
            totalRevenue += revenue;
            totalCost += cost;

            if (item.cost && item.price < item.cost) {
                itemsBelowCost.push({ name: item.name, price: item.price, cost: item.cost });
            }
        });

        const profit = totalRevenue - totalCost - totalDiscount;
        const marginPercent = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

        return {
            totalCost,
            profit,
            marginPercent,
            hasNegativeMargin: profit < 0,
            itemsBelowCost
        };
    }, [cart, totalDiscount]);

    // Lo que el cliente debe entregar en efectivo/tarjeta/etc hoy
    const cashRequiredToday = useMemo(() => {
        let amt = total;
        if (!isImmediateDelivery && depositAmount) {
            amt = parseFloat(depositAmount) || 0;
        }
        // Las notas de crédito reducen el monto a pagar en otros medios
        return Math.max(0, Number((amt - creditNoteAmount).toFixed(2)));
    }, [total, isImmediateDelivery, depositAmount, creditNoteAmount]);

    const change = paymentMethod === 'Efectivo' ? Math.max(0, (parseFloat(receivedAmount) || 0) - cashRequiredToday) : 0;
    const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

    // Removal of auto-manual sync on mount to rely on App.tsx unified fast sync
    /* 
    useEffect(() => {
        handleManualSync();
    }, []);
    */
    useEffect(() => {
        if (loadedQuote) {
            setCart(loadedQuote.items);
            const cust = customers.find(c => c.id === loadedQuote.customerId);
            if (cust) {
                setSelectedCustomer(cust);
                setIsConsumidorFinal(false);
            } else if (loadedQuote.customerName === 'Consumidor Final') {
                setIsConsumidorFinal(true);
                setSelectedCustomer(null);
            }
            setGlobalDiscount(loadedQuote.discount?.toString() || '');
            if (onQuoteProcessed) onQuoteProcessed();
        }
    }, [loadedQuote]);

    // Check for pending cash cut on mount
    useEffect(() => {
        const checkCashCut = async () => {
            const result = await db.hasPendingCashCut();
            if (result.pending) {
                setCashCutBlocked(true);
                setPendingCutInfo({ lastCutDate: result.lastCutDate, salesCount: result.salesWithoutCut });
            }
        };
        checkCashCut();
    }, []);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeys = (e: KeyboardEvent) => {
            if (e.key === 'F1') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
            if (e.key === 'F2') {
                e.preventDefault();
                setIsNewCustomerModalOpen(true);
            }
            if (e.key === 'F4') {
                e.preventDefault();
                if (cart.length > 0) setIsPaymentModalOpen(true);
            }
            if (e.key === 'F9') {
                e.preventDefault();
                setIsManualModalOpen(true);
            }
            if (e.key === 'Escape') {
                setIsCartOpen(false);
                setIsPaymentModalOpen(false);
                setIsManualModalOpen(false);
                setIsNewCustomerModalOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeys);
        return () => window.removeEventListener('keydown', handleKeys);
    }, [cart.length]);

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            if (p.active === false) return false;
            const matchesSearch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (p.code || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCategory = selectedCategory === 'all' || p.categoryId === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    }, [products, searchTerm, selectedCategory]);

    // Beep sound utility using Web Audio API
    const playBeep = (type: 'scan' | 'success' | 'error' = 'scan') => {
        if (!settings.enableBeep) return;
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            if (type === 'scan') {
                oscillator.frequency.value = 1200;
                oscillator.type = 'sine';
                gainNode.gain.value = 0.1;
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.08);
            } else if (type === 'success') {
                oscillator.frequency.value = 800;
                oscillator.type = 'sine';
                gainNode.gain.value = 0.1;
                oscillator.start();
                setTimeout(() => { oscillator.frequency.value = 1000; }, 100);
                oscillator.stop(audioContext.currentTime + 0.25);
            } else {
                oscillator.frequency.value = 300;
                oscillator.type = 'square';
                gainNode.gain.value = 0.08;
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.2);
            }
        } catch (e) { console.log('Audio not supported'); }
    };

    const addToCart = (product: Product) => {
        const existing = cart.find(item => item.id === product.id);

        // Verificación de stock para productos registrados (no manuales)
        if (!product.id.startsWith('manual-')) {
            const currentQty = existing ? existing.quantity : 0;
            if (currentQty >= product.stock) {
                playBeep('error');
                showToast(`Stock insuficiente para "${product.name}". Disponible: ${product.stock}`, "warning");
                return;
            }
        }

        playBeep('scan');
        if (existing) setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
        else setCart([...cart, { ...product, quantity: 1 }]);
    };

    const shareProductWhatsApp = (e: React.MouseEvent, product: Product) => {
        e.stopPropagation(); // Don't add to cart when sharing
        const storeName = settings?.name || 'Mi Tienda';
        const message = `🛍️ *¡Hola! Me interesa este producto:*\n\n📦 *${product.name}*\n${product.description ? `📝 _${product.description}_\n` : ''}💰 Precio: *L ${product.price.toFixed(2)}*\n🔢 Código: \`${product.code}\`\n\n_¿Tienen disponibilidad en ${storeName}?_`;
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://api.whatsapp.com/send?text=${encodedMessage}`, '_blank');
    };

    const removeFromCart = (id: string) => {
        setCart(cart.filter(item => item.id !== id));
    };

    const addManualItem = () => {
        setManualError('');
        if (!manualItem.name.trim()) {
            setManualError('El nombre del producto es obligatorio.');
            return;
        }
        const price = parseFloat(manualItem.price);
        if (isNaN(price) || price <= 0) {
            setManualError('El precio debe ser un valor positivo.');
            return;
        }

        const cost = parseFloat(manualItem.cost);
        if (isNaN(cost) || cost < 0) {
            setManualError('El costo debe ser un valor numérico (puede ser 0).');
            return;
        }

        const newItem: CartItem = {
            id: 'manual-' + Date.now(),
            code: 'SERV',
            name: manualItem.name,
            price: price,
            cost: cost,
            quantity: manualItem.quantity,
            isTaxable: manualItem.isTaxable,
            categoryId: 'general',
            stock: 9999,
            minStock: 0
        };
        setCart([...cart, newItem]);
        setIsManualModalOpen(false);
        setManualItem({ name: '', price: '', cost: '', quantity: 1, isTaxable: true });
    };

    const handleCheckout = async () => {
        if (cart.length === 0 || isProcessing) return;

        // Validación crítica: Debe seleccionar un cliente o Consumidor Final
        if (!selectedCustomer && !isConsumidorFinal) {
            showToast('Debe seleccionar un cliente o Consumidor Final para continuar.', 'warning');
            return;
        }

        // Validación crítica: ventas a crédito requieren cliente real
        if (paymentMethod === 'Crédito' && !selectedCustomer) {
            showToast('Debe seleccionar un cliente para ventas a crédito.', 'warning');
            return;
        }

        setIsProcessing(true);
        try {
            const isOrder = !isImmediateDelivery;
            // El abono bruto hoy es el depósito manual si es un pedido.
            // Si es entrega inmediata:
            // - En crédito, solo la prima (downPayment).
            // - En mixto, el total menos la parte de crédito.
            // - En el resto, el total completo.
            let grossPayToday = 0;
            if (isOrder) {
                grossPayToday = parseFloat(depositAmount) || 0;
            } else if (paymentMethod === 'Crédito') {
                grossPayToday = parseFloat(creditDownPayment) || 0;
            } else if (paymentMethod === 'Mixto') {
                grossPayToday = Math.max(0, total - (paymentDetails.credit || 0));
            } else {
                grossPayToday = total;
            }

            const balance = Math.max(0, total - grossPayToday);

            const saleData = {
                items: cart,
                subtotal,
                taxAmount,
                discount: totalDiscount,
                paymentMethod,
                paymentDetails: paymentMethod === 'Efectivo' ? { cash: grossPayToday - (creditNoteValid ? creditNoteAmount : 0), creditNote: creditNoteValid ? creditNoteAmount : 0, creditNoteReference: creditNoteFolio } :
                    paymentMethod === 'Tarjeta' ? { card: grossPayToday - (creditNoteValid ? creditNoteAmount : 0), cardRef: paymentDetails.cardRef, creditNote: creditNoteValid ? creditNoteAmount : 0, creditNoteReference: creditNoteFolio } :
                        paymentMethod === 'Transferencia' ? { transfer: grossPayToday - (creditNoteValid ? creditNoteAmount : 0), transferRef: paymentDetails.transferRef, bank: paymentDetails.bank, creditNote: creditNoteValid ? creditNoteAmount : 0, creditNoteReference: creditNoteFolio } :
                            paymentDetails, // For Mixed and Credit
                customerId: selectedCustomer?.id,
                customerName: selectedCustomer?.name || (isConsumidorFinal ? 'Consumidor Final' : undefined),
                userId: user?.id || 'admin',
                branchId: branchId,
                documentType,
                fulfillmentStatus: (isImmediateDelivery ? 'delivered' : 'pending') as FulfillmentStatus,
                total,
                pointsMonetaryValue: pointsDiscount > 0 ? pointsDiscount : undefined,
                pointsUsed: pointsUsed > 0 ? pointsUsed : undefined,
                isOrder,
                deposit: grossPayToday,
                balance,
                creditData: paymentMethod === 'Crédito' ? {
                    principal: total - (parseFloat(creditDownPayment) || 0),
                    downPayment: parseFloat(creditDownPayment) || 0,
                    rate: settings.defaultCreditRate,
                    term: parseInt(creditTerm),
                    totalWithInterest: (total - (parseFloat(creditDownPayment) || 0)) * (1 + (settings.defaultCreditRate / 100) * parseInt(creditTerm)),
                    monthlyPayment: ((total - (parseFloat(creditDownPayment) || 0)) * (1 + (settings.defaultCreditRate / 100) * parseInt(creditTerm))) / parseInt(creditTerm)
                } : undefined
            };

            const finalSale = await db.createSale(saleData);

            // Process credit note usage if applicable
            if (creditNoteValid && creditNoteAmount > 0) {
                await db.processCreditNoteUsage(creditNoteFolio, creditNoteAmount);
            }

            setLastSale(finalSale);
            setIsSuccessModalOpen(true);

            setCart([]);
            setSelectedCustomer(null);
            setIsConsumidorFinal(false);
            setGlobalDiscount('');
            setReceivedAmount('');
            setDepositAmount('');
            setIsPaymentModalOpen(false);
            setIsCartOpen(false);  // Close cart overlay after sale
            // Reset credit note state
            setCreditNoteFolio('');
            setCreditNoteAmount(0);
            setCreditNoteValid(false);
            setCreditNoteMax(0);
            playBeep('success');
            onSaleComplete();

            // Refocus search for next sale
            setTimeout(() => { searchInputRef.current?.focus(); }, 100);
        } catch (e: any) {
            showToast(e.message || "Error al procesar venta", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSaveCustomer = async () => {
        const newCust = {
            ...newCustomerData,
            id: `cust-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            points: 0,
            totalSpent: 0,
            level: LoyaltyLevel.BRONZE,
            active: true
        } as Customer;
        await db.saveCustomer(newCust);
        setSelectedCustomer(newCust);
        setIsConsumidorFinal(false);
        setIsNewCustomerModalOpen(false);
        if (onRefreshData) onRefreshData();
    };

    const handleSaveQuote = async () => {
        if (cart.length === 0) return;

        // Get sequential folio number
        const folio = await db.getNextQuoteNumber();

        const quote: Quote = {
            id: `quote-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            folio,
            date: new Date().toISOString(),
            customerId: selectedCustomer?.id,
            customerName: selectedCustomer?.name || (isConsumidorFinal ? 'Consumidor Final' : undefined),
            items: cart,
            subtotal,
            taxAmount,
            discount: parseFloat(globalDiscount) || 0,
            total,
            expirationDate: quoteExpiration,
            status: 'pending',
            userId: user?.id || 'admin',
            branchId
        };

        await db.saveQuote(quote);
        setCart([]);
        setSelectedCustomer(null);
        setIsConsumidorFinal(false);
        setGlobalDiscount('');
        setIsQuoteModalOpen(false);

        // Mostrar modal de éxito estilizado
        setSavedQuoteFolio(quote.folio);
        setIsQuoteSuccessModalOpen(true);
        showToast("Cotización guardada exitosamente.", "success");
        if (onRefreshData) onRefreshData();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const lowerTerm = searchTerm.trim().toLowerCase();
            if (!lowerTerm) return;

            // 1. Intentar buscar por coincidencia EXACTA de código (prioridad escáner)
            const exactCodeMatch = products.find(p => (p.code || '').toLowerCase() === lowerTerm && p.active !== false);

            if (exactCodeMatch) {
                addToCart(exactCodeMatch);
                setSearchTerm(''); // Limpiar para el siguiente escaneo
                return;
            }

            // 2. Si no es exacto, ver si hay un solo resultado en el filtro visual actual
            if (filteredProducts.length === 1) {
                addToCart(filteredProducts[0]);
                setSearchTerm('');
            }
        }
    };

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col lg:flex-row gap-4 relative overflow-hidden">
            {/* MODAL DE BLOQUEO POR CORTE DE CAJA PENDIENTE */}
            {cashCutBlocked && (
                <div className="fixed inset-0 z-[100] bg-gray-900/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl animate-scale-in">
                        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <i className="fas fa-exclamation-triangle text-4xl text-red-500"></i>
                        </div>
                        <h2 className="text-2xl font-black text-gray-800 mb-3">Corte de Caja Pendiente</h2>
                        <p className="text-gray-600 mb-2">
                            No puedes realizar ventas hasta completar el corte de caja del turno anterior.
                        </p>
                        <div className="bg-red-50 p-4 rounded-xl mb-6 text-sm">
                            <p className="text-red-700 font-bold">
                                <i className="fas fa-info-circle mr-2"></i>
                                {pendingCutInfo.salesCount} venta(s) sin cierre de caja
                            </p>
                            {pendingCutInfo.lastCutDate && (
                                <p className="text-red-600 text-xs mt-1">
                                    Último corte: {pendingCutInfo.lastCutDate}
                                </p>
                            )}
                        </div>
                        <Button
                            className="w-full py-4"
                            onClick={() => onNavigate && onNavigate('cashCut')}
                            icon="calculator"
                        >
                            Ir a Corte de Caja
                        </Button>
                    </div>
                </div>
            )}

            {/* SECCIÓN IZQUIERDA: PRODUCTOS */}
            <div className="flex-1 flex flex-col gap-4 min-h-0 pb-20 lg:pb-0 min-w-0">
                <div className="flex gap-2 shrink-0">
                    <Input
                        ref={searchInputRef}
                        placeholder="Escanear o buscar por nombre..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        onKeyDown={handleKeyDown}
                        icon="search"
                        className="flex-1 bg-white"
                    />
                    <Button variant="secondary" onClick={() => setIsManualModalOpen(true)} title="Agregar Item Manual"><i className="fas fa-plus"></i></Button>
                </div>

                <div className="flex gap-1.5 overflow-x-auto pb-1.5 shrink-0 no-scrollbar">
                    <button onClick={() => setSelectedCategory('all')} className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-bold text-xs transition-all ${selectedCategory === 'all' ? 'bg-primary text-white shadow-sm' : 'bg-white text-gray-500 border border-transparent hover:border-gray-200'}`}>Todo</button>
                    {categories.map(c => (
                        <button key={c.id} onClick={() => setSelectedCategory(c.id)} className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-bold text-xs flex items-center gap-1.5 transition-all ${selectedCategory === c.id ? 'bg-primary text-white shadow-sm' : 'bg-white text-gray-500 border border-transparent hover:border-gray-200'}`}><i className={`fas fa-${c.icon} text-[10px]`}></i> {c.name}</button>
                    ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto pr-1">
                    {filteredProducts.map(p => (
                        <div key={p.id} onClick={() => addToCart(p)} className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm cursor-pointer hover:border-primary transition-all active:scale-95 flex flex-col h-full group">
                            <div className="aspect-square bg-gray-50 rounded-xl mb-2 overflow-hidden relative">
                                {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><i className="fas fa-box text-2xl"></i></div>}
                                {(() => {
                                    const inCart = cart.find(item => item.id === p.id)?.quantity || 0;
                                    const effectiveStock = p.stock - inCart;
                                    return (
                                        <div className={`absolute top-1 right-1 px-1.5 py-0.5 rounded-lg text-[10px] font-black ${effectiveStock <= p.minStock ? 'bg-red-500 text-white' : 'bg-white/80'}`}>
                                            {effectiveStock}
                                        </div>
                                    );
                                })()}
                            </div>
                            <h3 className="font-bold text-gray-800 text-[10px] line-clamp-2 leading-tight mb-1 flex-1">{p.name}</h3>
                            <div className="flex justify-between items-center mt-auto">
                                <p className="font-black text-primary text-xs tracking-tighter">L {p.price.toFixed(2)}</p>
                                <div className="flex gap-0.5">
                                    <button
                                        onClick={(e) => shareProductWhatsApp(e, p)}
                                        className="w-6 h-6 flex items-center justify-center rounded-lg bg-green-50 text-green-500 hover:bg-green-500 hover:text-white transition-all transform active:scale-90"
                                        title="Compartir por WhatsApp"
                                    >
                                        <i className="fab fa-whatsapp text-[10px]"></i>
                                    </button>
                                    <i className="fas fa-plus-circle text-primary opacity-0 group-hover:opacity-100 transition-opacity ml-1"></i>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* SECCIÓN DERECHA: CARRITO */}
            <div className={`fixed inset-y-0 right-0 z-[60] w-full lg:w-96 bg-white shadow-2xl lg:shadow-none lg:static lg:inset-auto transform transition-transform duration-300 ${isCartOpen ? 'translate-x-0' : 'translate-x-full'} lg:translate-x-0 flex flex-col border-l border-gray-100`}>
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h2 className="font-black text-gray-800">Orden Actual</h2>
                    <button className="lg:hidden p-2 text-gray-400" onClick={() => setIsCartOpen(false)}><i className="fas fa-times text-xl"></i></button>
                </div>

                <div className="p-4 border-b space-y-2">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Input
                                icon="search"
                                placeholder={isConsumidorFinal ? "Consumidor Final" : (selectedCustomer ? selectedCustomer.name : "Seleccionar cliente...")}
                                value={customerSearch}
                                onChange={e => setCustomerSearch(e.target.value)}
                                onFocus={() => setShowCustomerDropdown(true)}
                                className="!py-2"
                            />
                            {(selectedCustomer || isConsumidorFinal) && (
                                <button
                                    onClick={() => { setSelectedCustomer(null); setIsConsumidorFinal(false); setCustomerSearch(''); }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
                                >
                                    <i className="fas fa-times"></i>
                                </button>
                            )}
                            {showCustomerDropdown && (
                                <div className="absolute top-full left-0 right-0 bg-white rounded-xl shadow-lg border mt-1 z-50 max-h-48 overflow-y-auto">
                                    <button
                                        onClick={() => { setSelectedCustomer(null); setIsConsumidorFinal(true); setShowCustomerDropdown(false); setCustomerSearch(''); }}
                                        className="w-full p-3 text-left text-sm hover:bg-primary/5 border-b font-bold text-primary flex items-center justify-between"
                                    >
                                        <span><i className="fas fa-user-check mr-2"></i>Consumidor Final</span>
                                        <Badge variant="primary" className="text-[10px]">Opción Rápida</Badge>
                                    </button>
                                    {getFilteredCustomers().map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => { setSelectedCustomer(c); setIsConsumidorFinal(false); setShowCustomerDropdown(false); setCustomerSearch(''); }}
                                            className="w-full p-3 text-left text-sm hover:bg-primary/5 flex justify-between items-center"
                                        >
                                            <div>
                                                <span className="font-bold text-gray-800">{c.name}</span>
                                                {c.phone && <span className="text-[10px] text-gray-400 ml-2">{c.phone}</span>}
                                            </div>
                                            <span className="text-[10px] text-primary font-bold">L {(c.totalSpent || 0).toFixed(0)}</span>
                                        </button>
                                    ))}
                                    {getFilteredCustomers().length === 0 && customerSearch && (
                                        <div className="p-3 text-center text-gray-400 text-sm">No encontrado</div>
                                    )}
                                </div>
                            )}
                        </div>
                        <Button variant="secondary" onClick={() => setIsNewCustomerModalOpen(true)}><i className="fas fa-user-plus"></i></Button>
                    </div>
                    {selectedCustomer && (
                        <div className="flex flex-col gap-2 p-2 bg-primary/5 rounded-xl border border-primary/10">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-primary">
                                    {selectedCustomer ? `Puntos: ${selectedCustomer.points}` : 'Cliente Seleccionado'}
                                </span>
                                <Badge variant="info" className="text-[10px]">{selectedCustomer?.level || 'General'}</Badge>
                            </div>
                            {selectedCustomer.points > 0 && (
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        placeholder="Usar puntos"
                                        className="!py-1 !px-2 text-xs"
                                        value={pointsUsed || ''}
                                        onChange={e => {
                                            const val = Math.min(selectedCustomer.points, parseInt(e.target.value) || 0);
                                            setPointsUsed(val);
                                            setPointsDiscount(val * (settings.pointValue || 0.1));
                                        }}
                                    />
                                    <span className="text-[10px] font-bold text-gray-500 min-w-fit">-L {pointsDiscount.toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {cart.map(item => {
                        const originalProduct = products.find(p => p.id === item.id);
                        const isStockLimitReached = originalProduct && item.quantity >= originalProduct.stock;

                        return (
                            <div key={item.id} className="flex gap-2 items-center group bg-white p-2 rounded-xl border border-transparent hover:border-gray-100 hover:shadow-sm transition-all">
                                <div className="flex-1">
                                    <h4 className="text-[11px] font-black text-gray-800 leading-tight uppercase line-clamp-1">{item.name}</h4>
                                    <p className="text-[9px] text-gray-400 font-bold uppercase">L {item.price.toFixed(2)} x {item.quantity}</p>
                                </div>
                                <div className="flex items-center bg-gray-50 rounded-lg overflow-hidden border">
                                    <button
                                        onClick={() => setCart(cart.map(i => i.id === item.id ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i).filter(i => i.quantity > 0))}
                                        className="px-1.5 py-0.5 hover:bg-gray-200 transition-colors text-xs font-bold"
                                    >
                                        -
                                    </button>
                                    <span className="px-1.5 text-[10px] font-black w-6 text-center text-primary">{item.quantity}</span>
                                    <button
                                        onClick={() => addToCart(item)}
                                        disabled={isStockLimitReached}
                                        className={`px-1.5 py-0.5 transition-colors text-xs font-bold ${isStockLimitReached ? 'text-gray-300' : 'hover:bg-gray-200'}`}
                                    >
                                        +
                                    </button>
                                </div>
                                <span className="font-black text-xs min-w-[65px] text-right text-gray-800">L {(item.price * item.quantity).toFixed(2)}</span>
                                <button
                                    onClick={() => removeFromCart(item.id)}
                                    className="text-red-200 hover:text-red-500 transition-colors p-1"
                                    title="Eliminar ítem"
                                >
                                    <i className="fas fa-times-circle text-xs"></i>
                                </button>
                            </div>
                        );
                    })}
                    {cart.length === 0 && <div className="text-center py-10 text-gray-300"><i className="fas fa-shopping-basket text-4xl mb-2 opacity-10"></i><p className="text-xs font-bold uppercase tracking-widest">Carrito Vacío</p></div>}
                </div>

                <div className="p-3 bg-gray-50 border-t space-y-2">
                    <div className="text-[10px] space-y-0.5">
                        <div className="flex justify-between text-gray-400 font-bold uppercase"><span>Subtotal (sin ISV)</span><span>L {subtotal.toFixed(2)}</span></div>
                        <div className="flex justify-between text-gray-400 font-bold uppercase"><span>ISV (15%)</span><span>L {taxAmount.toFixed(2)}</span></div>
                        <div className="flex justify-between text-gray-900 font-black text-lg pt-1.5 border-t border-dashed border-gray-300"><span>TOTAL</span><span>L {total.toFixed(2)}</span></div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" className="flex-1" disabled={cart.length === 0} onClick={() => setIsQuoteModalOpen(true)}>
                            <i className="fas fa-file-alt mr-2"></i>Cotizar
                        </Button>
                        <Button className="flex-1 py-4" disabled={cart.length === 0 || (!selectedCustomer && !isConsumidorFinal)} onClick={() => setIsPaymentModalOpen(true)}>
                            <i className="fas fa-cash-register mr-2"></i>{(!selectedCustomer && !isConsumidorFinal) ? 'Elija Cliente' : 'Cobrar'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* BARRA FLOTANTE MÓVIL */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t p-2 shadow-[0_-5px_15px_rgba(0,0,0,0.1)] z-[55]">
                {/* Customer Selection Button - Mobile */}
                <button
                    onClick={() => setIsCartOpen(true)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 mb-2 bg-gray-100 rounded-xl text-sm font-bold text-gray-700"
                >
                    <i className="fas fa-user text-primary"></i>
                    <span className={`truncate ${(!selectedCustomer && !isConsumidorFinal) ? 'text-red-500' : ''}`}>
                        {selectedCustomer?.name || (isConsumidorFinal ? 'Consumidor Final' : 'Seleccionar Cliente')}
                    </span>
                    <i className="fas fa-chevron-right text-gray-400 text-xs ml-auto"></i>
                </button>
                <div className="flex items-center justify-between">
                    <div onClick={() => setIsCartOpen(true)} className="flex items-center gap-3 cursor-pointer">
                        <div className="relative">
                            <i className="fas fa-shopping-cart text-2xl text-primary"></i>
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{totalItems}</span>
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-400 font-black uppercase leading-none">Total</p>
                            <p className="text-lg font-black text-gray-800 leading-none">L {total.toFixed(2)}</p>
                        </div>
                    </div>
                    <Button onClick={() => setIsPaymentModalOpen(true)} disabled={cart.length === 0 || (!selectedCustomer && !isConsumidorFinal)} className="px-8">
                        {(!selectedCustomer && !isConsumidorFinal) ? 'Falta Cliente' : 'Cobrar'}
                    </Button>
                </div>
            </div>

            {/* MODAL DE COBRO */}
            <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title="Finalizar Venta" size="lg">
                <div className="space-y-6">
                    {/* ALERTA DE MARGEN NEGATIVO */}
                    {(marginAnalysis.hasNegativeMargin || marginAnalysis.itemsBelowCost.length > 0) && (
                        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl animate-pulse">
                            <div className="flex items-start gap-3">
                                <div className="bg-red-100 p-2 rounded-full text-red-600">
                                    <i className="fas fa-exclamation-triangle"></i>
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-red-800">⚠️ Alerta de Margen</h3>
                                    {marginAnalysis.hasNegativeMargin && (
                                        <p className="text-sm text-red-700 font-medium">
                                            Esta venta tiene <strong>margen negativo</strong>: L {marginAnalysis.profit.toFixed(2)} ({marginAnalysis.marginPercent.toFixed(1)}%)
                                        </p>
                                    )}
                                    {marginAnalysis.itemsBelowCost.length > 0 && (
                                        <div className="mt-2">
                                            <p className="text-xs text-red-600 font-bold">Productos vendidos bajo costo:</p>
                                            <ul className="text-xs text-red-700 mt-1">
                                                {marginAnalysis.itemsBelowCost.slice(0, 3).map((item, idx) => (
                                                    <li key={idx}>• {item.name}: Venta L{item.price.toFixed(2)} vs Costo L{item.cost.toFixed(2)}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Documento</label>
                            <div className="flex p-1 bg-gray-100 rounded-xl">
                                <button onClick={() => setDocumentType('TICKET')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${documentType === 'TICKET' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>Ticket</button>
                                <button onClick={() => setDocumentType('FACTURA')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${documentType === 'FACTURA' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>Factura</button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Entrega</label>
                            <div className="flex p-1 bg-gray-100 rounded-xl">
                                <button onClick={() => setIsImmediateDelivery(true)} className={`flex-1 py-2 rounded-lg text-xs font-bold ${isImmediateDelivery ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>Inmediata</button>
                                <button onClick={() => setIsImmediateDelivery(false)} className={`flex-1 py-2 rounded-lg text-xs font-bold ${!isImmediateDelivery ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>Pedido</button>
                            </div>
                        </div>
                        {!isImmediateDelivery && paymentMethod !== 'Crédito' && (
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Monto Anticipo (Opcional)</label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        placeholder={`Total: ${total.toFixed(2)}`}
                                        value={depositAmount}
                                        onChange={e => {
                                            const val = Math.min(total, parseFloat(e.target.value) || 0);
                                            setDepositAmount(val > 0 ? val.toString() : '');
                                        }}
                                        className="flex-1"
                                    />
                                    <div className="bg-gray-100 p-2 rounded-lg text-xs">
                                        <p className="font-bold text-gray-500">Pendiente</p>
                                        <p className="font-bold text-red-500">L {(total - (parseFloat(depositAmount) || 0)).toFixed(2)}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Método de Pago</label>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                            {[
                                { id: 'Efectivo', icon: 'money-bill-wave' },
                                { id: 'Tarjeta', icon: 'credit-card' },
                                { id: 'Transferencia', icon: 'mobile-alt' },
                                { id: 'Mixto', icon: 'layer-group' },
                                { id: 'Crédito', icon: 'hand-holding-usd' }
                            ].map(m => (
                                <button key={m.id} onClick={() => setPaymentMethod(m.id as any)} className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${paymentMethod === m.id ? 'border-primary bg-primary/5 text-primary scale-105' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}>
                                    <i className={`fas fa-${m.icon} text-lg mb-1`}></i>
                                    <span className="text-[10px] font-bold">{m.id}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Credit Note Usage Section */}
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                        <div className="flex items-center gap-2 mb-3">
                            <i className="fas fa-file-invoice text-blue-600"></i>
                            <span className="font-bold text-blue-800 text-sm">¿Aplicar Nota de Crédito?</span>
                        </div>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Folio: NC-xxx o DEV-xxx"
                                value={creditNoteFolio}
                                onChange={e => {
                                    setCreditNoteFolio(e.target.value);
                                    setCreditNoteValid(false);
                                    setCreditNoteAmount(0);
                                }}
                                className="flex-1"
                            />
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={async () => {
                                    if (!creditNoteFolio) return;
                                    const cn = await db.getCreditNotes();
                                    const found = cn.find(n => (n.folio || '').toLowerCase() === creditNoteFolio.toLowerCase() && n.status === 'active');
                                    if (found && found.remainingAmount > 0) {
                                        setCreditNoteMax(found.remainingAmount);
                                        setCreditNoteAmount(Math.min(found.remainingAmount, total));
                                        setCreditNoteValid(true);
                                        showToast(`Nota válida: L ${found.remainingAmount.toFixed(2)} disponible`, 'success');
                                    } else {
                                        setCreditNoteValid(false);
                                        setCreditNoteAmount(0);
                                        showToast('Nota de crédito no válida o ya usada', 'error');
                                    }
                                }}
                            >
                                Verificar
                            </Button>
                        </div>
                        {creditNoteValid && (
                            <div className="mt-3 p-3 bg-green-100 rounded-lg border border-green-300">
                                <div className="flex justify-between items-center">
                                    <span className="text-green-800 font-bold text-sm">
                                        <i className="fas fa-check-circle mr-2"></i>
                                        Nota Válida
                                    </span>
                                    <span className="text-green-800 font-bold">-L {creditNoteAmount.toFixed(2)}</span>
                                </div>
                                <p className="text-xs text-green-700 mt-1">
                                    Disponible: L {creditNoteMax.toFixed(2)} | Aplicando: L {Math.min(creditNoteMax, total).toFixed(2)}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="bg-gray-50 p-4 rounded-2xl space-y-4">
                        {paymentMethod === 'Efectivo' && (
                            <div className="grid grid-cols-2 gap-4">
                                <Input label="Efectivo Recibido" type="number" value={receivedAmount} onChange={e => setReceivedAmount(e.target.value)} placeholder="0.00" autoFocus />
                                <div className="flex flex-col justify-center">
                                    <p className="text-xs font-bold text-gray-400 uppercase">Cambio</p>
                                    <p className={`text-2xl font-black ${change < 0 ? 'text-red-500' : 'text-green-600'}`}>L {change.toFixed(2)}</p>
                                </div>
                            </div>
                        )}

                        {paymentMethod === 'Tarjeta' && (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <Input
                                        label="Banco Emisor"
                                        placeholder="Ej: BAC, Ficohsa, Atlántida..."
                                        value={paymentDetails.cardBank || ''}
                                        onChange={e => setPaymentDetails({ ...paymentDetails, cardBank: e.target.value })}
                                    />
                                    <Input
                                        label="Nombre en la Tarjeta"
                                        placeholder="Nombre del titular"
                                        value={paymentDetails.cardHolder || ''}
                                        onChange={e => setPaymentDetails({ ...paymentDetails, cardHolder: e.target.value })}
                                    />
                                </div>
                                <Input
                                    label="Referencia de Transacción"
                                    placeholder="Últimos 4 dígitos o No. Autorización"
                                    value={paymentDetails.cardRef || ''}
                                    onChange={e => setPaymentDetails({ ...paymentDetails, cardRef: e.target.value })}
                                />
                            </div>
                        )}

                        {paymentMethod === 'Transferencia' && (
                            <div className="space-y-3">
                                <Input label="Banco Origen" placeholder="Ej: BAC, Banpaís, Atlántida..." value={paymentDetails.bank || ''} onChange={e => setPaymentDetails({ ...paymentDetails, bank: e.target.value })} />
                                <Input label="No. Referencia / Comprobante" placeholder="Número de transferencia" value={paymentDetails.transferRef || ''} onChange={e => setPaymentDetails({ ...paymentDetails, transferRef: e.target.value })} />
                            </div>
                        )}

                        {paymentMethod === 'Mixto' && (
                            <div className="space-y-4">
                                <p className="text-xs text-gray-500 font-bold">Ingrese el monto por cada método utilizado:</p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="space-y-2">
                                        <Input label="Efectivo (L)" type="number" step="0.01" value={paymentDetails.cash || ''} onChange={e => setPaymentDetails({ ...paymentDetails, cash: parseFloat(e.target.value) || 0 })} placeholder="0.00" />
                                    </div>
                                    <div className="space-y-2">
                                        <Input label="Tarjeta (L)" type="number" step="0.01" value={paymentDetails.card || ''} onChange={e => setPaymentDetails({ ...paymentDetails, card: parseFloat(e.target.value) || 0 })} placeholder="0.00" />
                                        {(paymentDetails.card > 0) && <Input placeholder="Ref. tarjeta" value={paymentDetails.cardRef || ''} onChange={e => setPaymentDetails({ ...paymentDetails, cardRef: e.target.value })} className="!py-1 text-xs" />}
                                    </div>
                                    <div className="space-y-2">
                                        <Input label="Transferencia (L)" type="number" step="0.01" value={paymentDetails.transfer || ''} onChange={e => setPaymentDetails({ ...paymentDetails, transfer: parseFloat(e.target.value) || 0 })} placeholder="0.00" />
                                        {(paymentDetails.transfer > 0) && <Input placeholder="Ref. transfer" value={paymentDetails.transferRef || ''} onChange={e => setPaymentDetails({ ...paymentDetails, transferRef: e.target.value })} className="!py-1 text-xs" />}
                                    </div>
                                </div>
                                <div className={`p-3 rounded-xl text-sm font-bold ${((paymentDetails.cash || 0) + (paymentDetails.card || 0) + (paymentDetails.transfer || 0)) >= total ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                    Suma: L {((paymentDetails.cash || 0) + (paymentDetails.card || 0) + (paymentDetails.transfer || 0)).toFixed(2)} / Total: L {total.toFixed(2)}
                                </div>
                            </div>
                        )}

                        {paymentMethod === 'Crédito' && (
                            <div className="space-y-4">
                                {!selectedCustomer && (
                                    <Alert variant="warning"><i className="fas fa-exclamation-triangle mr-2"></i>Debe seleccionar un cliente para ventas a crédito</Alert>
                                )}
                                <div className="grid grid-cols-2 gap-4">
                                    <Input label="Prima / Enganche (L)" type="number" step="0.01" min="0" value={creditDownPayment} onChange={e => setCreditDownPayment(e.target.value)} placeholder="0.00" />
                                    <Input label="Plazo (Meses)" type="number" min="1" value={creditTerm} onChange={e => setCreditTerm(e.target.value)} />
                                </div>
                                <div className="grid grid-cols-3 gap-3 bg-white p-4 rounded-xl border border-gray-100">
                                    <div>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase">Monto a Financiar</p>
                                        <p className="text-md font-bold">L {Math.max(0, total - (parseFloat(creditDownPayment) || 0)).toFixed(2)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase">Tasa Mensual: {settings.defaultCreditRate}%</p>
                                        <p className="text-[9px] text-primary font-bold">Anual: {(settings.defaultCreditRate * 12).toFixed(2)}%</p>
                                        <p className="text-md font-bold text-gray-800">L {((Math.max(0, total - (parseFloat(creditDownPayment) || 0))) * (settings.defaultCreditRate / 100) * parseInt(creditTerm || '1')).toFixed(2)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase">Cuota Mensual</p>
                                        <p className="text-lg font-black text-primary">L {(((Math.max(0, total - (parseFloat(creditDownPayment) || 0))) * (1 + (settings.defaultCreditRate / 100) * parseInt(creditTerm || '1'))) / (parseInt(creditTerm) || 1)).toFixed(2)}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-primary text-white p-6 rounded-2xl flex justify-between items-center shadow-lg shadow-primary/20">
                        <div>
                            <p className="text-xs font-bold opacity-70 uppercase tracking-widest">{!isImmediateDelivery && depositAmount ? 'A Pagar Hoy' : 'Monto Total a Pagar'}</p>
                            <h3 className="text-4xl font-black">L {cashRequiredToday.toFixed(2)}</h3>
                        </div>
                        <Button variant="secondary" className="bg-white text-primary border-none hover:bg-gray-100 h-14 px-8" onClick={handleCheckout} disabled={isProcessing}>
                            {isProcessing ? <i className="fas fa-spinner fa-spin"></i> : 'Confirmar Pago'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* MODAL ÍTEM MANUAL */}
            <Modal isOpen={isManualModalOpen} onClose={() => setIsManualModalOpen(false)} title="Producto / Servicio Manual">
                <div className="space-y-4">
                    {manualError && <Alert variant="danger">{manualError}</Alert>}
                    <Input
                        label="Nombre del Ítem"
                        value={manualItem.name}
                        onChange={e => setManualItem({ ...manualItem, name: e.target.value })}
                        required
                        placeholder="Ej: Personalización extra de taza"
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Precio Venta (con ISV incluido)"
                            type="number"
                            step="0.01"
                            value={manualItem.price}
                            onChange={e => setManualItem({ ...manualItem, price: e.target.value })}
                            required
                            placeholder="0.00"
                        />
                        <Input
                            label="Costo (L)"
                            type="number"
                            step="0.01"
                            value={manualItem.cost}
                            onChange={e => setManualItem({ ...manualItem, cost: e.target.value })}
                            required
                            placeholder="0.00"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4 items-center">
                        <Input
                            label="Cantidad"
                            type="number"
                            min="1"
                            value={manualItem.quantity}
                            onChange={e => setManualItem({ ...manualItem, quantity: parseInt(e.target.value) || 1 })}
                            required
                        />
                        <div className="flex items-center gap-2 pt-6">
                            <input type="checkbox" checked={manualItem.isTaxable} onChange={e => setManualItem({ ...manualItem, isTaxable: e.target.checked })} className="w-5 h-5 accent-primary" />
                            <span className="text-sm font-bold text-gray-700">Aplica ISV (15%)</span>
                        </div>
                    </div>
                    <div className="pt-2">
                        <Button className="w-full h-12" onClick={addManualItem}>
                            <i className="fas fa-cart-plus mr-2"></i> Agregar al Carrito
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* MODAL NUEVO CLIENTE */}
            <Modal isOpen={isNewCustomerModalOpen} onClose={() => setIsNewCustomerModalOpen(false)} title="Nuevo Cliente">
                <div className="space-y-4">
                    <Input label="Nombre Completo" value={newCustomerData.name} onChange={e => setNewCustomerData({ ...newCustomerData, name: e.target.value })} required />
                    <Input label="Teléfono" value={newCustomerData.phone} onChange={e => setNewCustomerData({ ...newCustomerData, phone: e.target.value })} required />
                    <Input label="RTN (Opcional)" value={newCustomerData.rtn} onChange={e => setNewCustomerData({ ...newCustomerData, rtn: e.target.value })} />
                    <Button className="w-full" onClick={handleSaveCustomer}>Registrar y Seleccionar</Button>
                </div>
            </Modal>

            {/* MODAL DE ÉXITO Y RECOLECCIÓN/IMPRESIÓN */}
            <Modal isOpen={isSuccessModalOpen} onClose={() => setIsSuccessModalOpen(false)} title="¡Venta Exitosa!" size="sm">
                <div className="text-center space-y-6 py-4">
                    <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-4 animate-bounce">
                        <i className="fas fa-check"></i>
                    </div>

                    <div>
                        <h3 className="text-xl font-black text-gray-800">Transacción Completa</h3>
                        <p className="text-gray-500">Folio: <span className="font-mono font-bold">{lastSale?.folio}</span></p>
                        <p className="text-2xl font-black text-primary mt-2">L {lastSale?.total.toFixed(2)}</p>
                    </div>

                    <div className="flex flex-col gap-3">
                        <Button className="w-full py-4 text-lg" icon="print" onClick={async () => {
                            if (lastSale) {
                                // Use customer name stored in sale record (not selectedCustomer which is null)
                                const customer = lastSale.customerName ? { name: lastSale.customerName } as Customer : undefined;
                                const htmlOriginal = await db.generateTicketHTML(lastSale, customer);

                                // Print Customer Copy (ORIGINAL)
                                const winCliente = window.open('', '', 'width=400,height=600');
                                if (winCliente) {
                                    const clienteHtml = htmlOriginal.replace('</style>', `
                                        .copy-type { text-align: center; font-weight: bold; font-size: 10px; margin-bottom: 5px; padding: 3px; background: #f0f0f0; }
                                        </style>`).replace('<body>', '<body><div class="copy-type">ORIGINAL: CLIENTE</div>');
                                    winCliente.document.write(clienteHtml);
                                    winCliente.document.close();
                                    winCliente.focus();
                                    winCliente.print();
                                }

                                // Print SAR Copy (COPIA FISCAL) after a short delay
                                setTimeout(async () => {
                                    const winSAR = window.open('', '', 'width=400,height=600');
                                    if (winSAR) {
                                        const sarHtml = htmlOriginal.replace('</style>', `
                                            .copy-type { text-align: center; font-weight: bold; font-size: 10px; margin-bottom: 5px; padding: 3px; background: #e0e0e0; border: 1px dashed #666; }
                                            </style>`).replace('<body>', '<body><div class="copy-type">COPIA: EMISOR</div>');
                                        winSAR.document.write(sarHtml);
                                        winSAR.document.close();
                                        winSAR.focus();
                                        winSAR.print();
                                    }
                                }, 1000);
                            }
                        }}>Imprimir (2 Copias)</Button>

                        {lastSale?.paymentMethod === 'Crédito' && (
                            <div className="pt-2 border-t mt-2 space-y-2">
                                <p className="text-[10px] font-bold text-gray-400 uppercase text-left ml-1">Documentación de Crédito</p>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" className="flex-1 text-[10px] py-2" icon="file-contract" onClick={async () => {
                                        if (lastSale && selectedCustomer && settings) {
                                            const htmlContrato = await db.generateCreditContractHTML(lastSale, selectedCustomer, settings);
                                            const htmlPagare = await db.generateCreditPagareHTML(lastSale, selectedCustomer, settings);
                                            const win = window.open('', '', 'width=800,height=600');
                                            if (win) {
                                                win.document.write(htmlContrato);
                                                win.document.write('<div style="page-break-after: always;"></div>');
                                                win.document.write(htmlPagare);
                                                win.document.close();
                                                setTimeout(() => win.print(), 500);
                                            }
                                        }
                                    }}>Contrato y Pagaré</Button>
                                    <Button variant="outline" size="sm" className="flex-1 text-[10px] py-2" icon="list-ol" onClick={async () => {
                                        if (lastSale) {
                                            const html = await db.generatePaymentPlanHTML(lastSale);
                                            const win = window.open('', '', 'width=600,height=800');
                                            if (win) { win.document.write(html); win.document.close(); win.print(); }
                                        }
                                    }}>Plan de Pago</Button>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <Button variant="secondary" className="flex-1" onClick={() => setIsSuccessModalOpen(false)}>Nueva Venta</Button>
                            {lastSale?.documentType === 'FACTURA' && (
                                <Button variant="outline" className="flex-1" icon="share-alt" title="Compartir">Enviar</Button>
                            )}
                        </div>
                    </div>
                </div>
            </Modal>

            {/* MODAL CREAR COTIZACIÓN */}
            <Modal isOpen={isQuoteModalOpen} onClose={() => setIsQuoteModalOpen(false)} title="Guardar Cotización" size="sm">
                <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <p className="text-xs text-blue-600 font-bold uppercase mb-1">Resumen</p>
                        <p className="text-lg font-black text-blue-800">{cart.length} productos - L {total.toFixed(2)}</p>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Cliente</label>
                        <select
                            className="w-full p-3 rounded-xl bg-gray-100 text-sm font-bold border-none outline-none"
                            value={selectedCustomer?.id || ''}
                            onChange={e => setSelectedCustomer(customers.find(c => c.id === e.target.value) || null)}
                        >
                            <option value="">Consumidor Final</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>

                    <Input
                        label="Válida hasta"
                        type="date"
                        value={quoteExpiration}
                        onChange={e => setQuoteExpiration(e.target.value)}
                    />

                    <div className="flex gap-2 pt-4 border-t">
                        <Button variant="secondary" className="flex-1" onClick={() => setIsQuoteModalOpen(false)}>Cancelar</Button>
                        <Button className="flex-1" onClick={handleSaveQuote} icon="save">Guardar Cotización</Button>
                    </div>
                </div>
            </Modal>

            {/* Modal de Éxito de Cotización */}
            <Modal isOpen={isQuoteSuccessModalOpen} onClose={() => setIsQuoteSuccessModalOpen(false)} title="Cotización Guardada" size="sm">
                <div className="text-center py-6">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                        <i className="fas fa-check text-4xl text-green-500"></i>
                    </div>
                    <h3 className="text-xl font-black text-gray-800 mb-2">¡Cotización Guardada!</h3>
                    <p className="text-gray-500 mb-2">Folio:</p>
                    <p className="text-2xl font-mono font-black text-primary mb-6">{savedQuoteFolio}</p>
                    <Button onClick={() => setIsQuoteSuccessModalOpen(false)} className="w-full" icon="check">Entendido</Button>
                </div>
            </Modal>
        </div>
    );
};
