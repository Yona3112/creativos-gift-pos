
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
}

export const POS: React.FC<POSProps> = ({
    products, customers, categories, user, branchId, onSaleComplete, loadedQuote, onQuoteProcessed, onRefreshData, settings
}) => {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

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
            subtotal: subtotalWithoutTax,
            taxAmount: totalTax
        };
    }, [cart]);

    // Total con ISV incluido (suma de precios de venta)
    const totalWithTax = useMemo(() =>
        cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        [cart]);

    const totalDiscount = (parseFloat(globalDiscount) || 0) + pointsDiscount;
    const total = Math.max(0, totalWithTax - totalDiscount);
    const change = paymentMethod === 'Efectivo' ? Math.max(0, (parseFloat(receivedAmount) || 0) - total) : 0;
    const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

    useEffect(() => {
        if (loadedQuote) {
            setCart(loadedQuote.items);
            const cust = customers.find(c => c.id === loadedQuote.customerId);
            if (cust) setSelectedCustomer(cust);
            setGlobalDiscount(loadedQuote.discount?.toString() || '');
            if (onQuoteProcessed) onQuoteProcessed();
        }
    }, [loadedQuote]);

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            if (p.active === false) return false;
            const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.code.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCategory = selectedCategory === 'all' || p.categoryId === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    }, [products, searchTerm, selectedCategory]);

    const addToCart = (product: Product) => {
        const existing = cart.find(item => item.id === product.id);

        // Verificación de stock para productos registrados (no manuales)
        if (!product.id.startsWith('manual-')) {
            const currentQty = existing ? existing.quantity : 0;
            if (currentQty >= product.stock) {
                showToast(`Stock insuficiente para "${product.name}". Disponible: ${product.stock}`, "warning");
                return;
            }
        }

        if (existing) setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
        else setCart([...cart, { ...product, quantity: 1 }]);
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

        // Validación crítica: ventas a crédito requieren cliente
        if (paymentMethod === 'Crédito' && !selectedCustomer) {
            showToast('Debe seleccionar un cliente para ventas a crédito.', 'warning');
            return;
        }

        setIsProcessing(true);
        try {
            const saleData = {
                items: cart,
                subtotal,
                taxAmount,
                discount: totalDiscount,
                paymentMethod,
                paymentDetails: paymentMethod === 'Efectivo' ? { cash: total } :
                    paymentMethod === 'Tarjeta' ? { card: total, cardRef: paymentDetails.cardRef } :
                        paymentMethod === 'Transferencia' ? { transfer: total, transferRef: paymentDetails.transferRef, bank: paymentDetails.bank } :
                            paymentDetails, // For Mixed and Credit
                customerId: selectedCustomer?.id,
                userId: user?.id || 'admin',
                branchId: branchId,
                documentType,
                fulfillmentStatus: (isImmediateDelivery ? 'delivered' : 'pending') as FulfillmentStatus,
                pointsUsed: pointsUsed > 0 ? pointsUsed : undefined,
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
            setGlobalDiscount('');
            setReceivedAmount('');
            setIsPaymentModalOpen(false);
            // Reset credit note state
            setCreditNoteFolio('');
            setCreditNoteAmount(0);
            setCreditNoteValid(false);
            setCreditNoteMax(0);
            onSaleComplete();
        } catch (e: any) {
            showToast(e.message || "Error al procesar venta", "error");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSaveCustomer = async () => {
        const newCust = {
            ...newCustomerData,
            id: Date.now().toString(),
            points: 0,
            totalSpent: 0,
            level: LoyaltyLevel.BRONZE,
            active: true
        } as Customer;
        await db.saveCustomer(newCust);
        setSelectedCustomer(newCust);
        setIsNewCustomerModalOpen(false);
        if (onRefreshData) onRefreshData();
    };

    const handleSaveQuote = async () => {
        if (cart.length === 0) return;

        // Get sequential folio number
        const folio = await db.getNextQuoteNumber();

        const quote: Quote = {
            id: Date.now().toString(),
            folio,
            date: new Date().toISOString(),
            customerId: selectedCustomer?.id,
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

        // Clear cart and close modal
        setCart([]);
        setSelectedCustomer(null);
        setGlobalDiscount('');
        setIsQuoteModalOpen(false);

        // Mostrar modal de éxito estilizado
        setSavedQuoteFolio(quote.folio);
        setIsQuoteSuccessModalOpen(true);
        if (onRefreshData) onRefreshData();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const lowerTerm = searchTerm.trim().toLowerCase();
            if (!lowerTerm) return;

            // 1. Intentar buscar por coincidencia EXACTA de código (prioridad escáner)
            const exactCodeMatch = products.find(p => p.code.toLowerCase() === lowerTerm && p.active !== false);

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
            {/* SECCIÓN IZQUIERDA: PRODUCTOS */}
            <div className="flex-1 flex flex-col gap-4 min-h-0 pb-20 lg:pb-0">
                <div className="flex gap-2 shrink-0">
                    <Input
                        ref={searchInputRef}
                        placeholder="Buscar por nombre o código..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        onKeyDown={handleKeyDown}
                        icon="search"
                        className="flex-1 bg-white"
                    />
                    <Button variant="secondary" onClick={() => setIsManualModalOpen(true)} title="Agregar Item Manual"><i className="fas fa-plus"></i></Button>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 shrink-0 no-scrollbar">
                    <button onClick={() => setSelectedCategory('all')} className={`px-4 py-2 rounded-xl whitespace-nowrap font-bold text-sm ${selectedCategory === 'all' ? 'bg-primary text-white' : 'bg-white text-gray-500'}`}>Todo</button>
                    {categories.map(c => (
                        <button key={c.id} onClick={() => setSelectedCategory(c.id)} className={`px-4 py-2 rounded-xl whitespace-nowrap font-bold text-sm flex items-center gap-2 ${selectedCategory === c.id ? 'bg-primary text-white' : 'bg-white text-gray-500'}`}><i className={`fas fa-${c.icon}`}></i> {c.name}</button>
                    ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto pr-1">
                    {filteredProducts.map(p => (
                        <div key={p.id} onClick={() => addToCart(p)} className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm cursor-pointer hover:border-primary transition-all active:scale-95 flex flex-col h-full group">
                            <div className="aspect-square bg-gray-50 rounded-xl mb-2 overflow-hidden relative">
                                {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><i className="fas fa-box text-2xl"></i></div>}
                                <div className={`absolute top-1 right-1 px-1.5 py-0.5 rounded-lg text-[10px] font-black ${p.stock <= p.minStock ? 'bg-red-500 text-white' : 'bg-white/80'}`}>{p.stock}</div>
                            </div>
                            <h3 className="font-bold text-gray-800 text-xs line-clamp-2 mb-1 flex-1">{p.name}</h3>
                            <div className="flex justify-between items-center mt-auto">
                                <p className="font-black text-primary text-sm">L {p.price.toFixed(2)}</p>
                                <i className="fas fa-plus-circle text-primary opacity-0 group-hover:opacity-100 transition-opacity"></i>
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
                        <select className="flex-1 p-3 rounded-xl bg-gray-100 text-sm font-bold border-none outline-none" value={selectedCustomer?.id || ''} onChange={e => setSelectedCustomer(customers.find(c => c.id === e.target.value) || null)}>
                            <option value="">Consumidor Final</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <Button variant="secondary" onClick={() => setIsNewCustomerModalOpen(true)}><i className="fas fa-user-plus"></i></Button>
                    </div>
                    {selectedCustomer && (
                        <div className="flex flex-col gap-2 p-2 bg-primary/5 rounded-xl border border-primary/10">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-primary">Puntos: {selectedCustomer.points}</span>
                                <Badge variant="info" className="text-[10px]">{selectedCustomer.level}</Badge>
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

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {cart.map(item => {
                        const originalProduct = products.find(p => p.id === item.id);
                        const isStockLimitReached = originalProduct && item.quantity >= originalProduct.stock;

                        return (
                            <div key={item.id} className="flex gap-3 items-center group">
                                <div className="flex-1">
                                    <h4 className="text-sm font-bold text-gray-800 leading-tight">{item.name}</h4>
                                    <p className="text-xs text-gray-400 font-mono">L {item.price.toFixed(2)} x {item.quantity}</p>
                                </div>
                                <div className="flex items-center bg-gray-100 rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => setCart(cart.map(i => i.id === item.id ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i).filter(i => i.quantity > 0))}
                                        className="px-2 py-1 hover:bg-gray-200 transition-colors"
                                    >
                                        -
                                    </button>
                                    <span className="px-2 text-xs font-bold w-6 text-center">{item.quantity}</span>
                                    <button
                                        onClick={() => addToCart(item)}
                                        disabled={isStockLimitReached}
                                        className={`px-2 py-1 transition-colors ${isStockLimitReached ? 'text-gray-300' : 'hover:bg-gray-200'}`}
                                    >
                                        +
                                    </button>
                                </div>
                                <span className="font-black text-sm min-w-[70px] text-right">L {(item.price * item.quantity).toFixed(2)}</span>
                                <button
                                    onClick={() => removeFromCart(item.id)}
                                    className="text-red-300 hover:text-red-500 transition-colors p-1"
                                    title="Eliminar ítem"
                                >
                                    <i className="fas fa-trash-alt text-xs"></i>
                                </button>
                            </div>
                        );
                    })}
                    {cart.length === 0 && <div className="text-center py-20 text-gray-300"><i className="fas fa-shopping-basket text-4xl mb-2 opacity-20"></i><p>Carrito Vacío</p></div>}
                </div>

                <div className="p-4 bg-gray-50 border-t space-y-3">
                    <div className="text-sm space-y-1">
                        <div className="flex justify-between text-gray-500"><span>Subtotal (sin ISV)</span><span>L {subtotal.toFixed(2)}</span></div>
                        <div className="flex justify-between text-gray-500"><span>ISV (15%)</span><span>L {taxAmount.toFixed(2)}</span></div>
                        <div className="flex justify-between text-gray-900 font-black text-xl pt-2 border-t border-dashed border-gray-300"><span>TOTAL</span><span>L {total.toFixed(2)}</span></div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" className="flex-1" disabled={cart.length === 0} onClick={() => setIsQuoteModalOpen(true)}>
                            <i className="fas fa-file-alt mr-2"></i>Cotizar
                        </Button>
                        <Button className="flex-1 py-4" disabled={cart.length === 0} onClick={() => setIsPaymentModalOpen(true)}>
                            <i className="fas fa-cash-register mr-2"></i>Cobrar
                        </Button>
                    </div>
                </div>
            </div>

            {/* BARRA FLOTANTE MÓVIL */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t p-3 flex items-center justify-between shadow-[0_-5px_15px_rgba(0,0,0,0.1)] z-[55]">
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
                <Button onClick={() => setIsPaymentModalOpen(true)} disabled={cart.length === 0} className="px-8">Cobrar</Button>
            </div>

            {/* MODAL DE COBRO */}
            <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title="Finalizar Venta" size="lg">
                <div className="space-y-6">
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
                                    const found = cn.find(n => n.folio.toLowerCase() === creditNoteFolio.toLowerCase() && n.status === 'active');
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
                                        <p className="text-[10px] text-gray-400 font-bold uppercase">Tasa: {settings.defaultCreditRate}%</p>
                                        <p className="text-md font-bold">L {((Math.max(0, total - (parseFloat(creditDownPayment) || 0))) * (settings.defaultCreditRate / 100) * parseInt(creditTerm || '1')).toFixed(2)}</p>
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
                            <p className="text-xs font-bold opacity-70 uppercase tracking-widest">Monto Total a Pagar</p>
                            <h3 className="text-4xl font-black">L {total.toFixed(2)}</h3>
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
                                // Generate ticket HTML for both copies
                                const htmlOriginal = await db.generateTicketHTML(lastSale, selectedCustomer || undefined);

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
