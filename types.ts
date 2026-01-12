
export enum UserRole {
  ADMIN = 'admin',
  VENDEDOR = 'vendedor'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branchId: string;
  password?: string;
  active: boolean;
}

export interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  manager?: string;
  active: boolean;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  description?: string;
  categoryId: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  enableLowStockAlert?: boolean;
  image?: string;
  isTaxable: boolean;
  providerId?: string;
  active?: boolean;
}

export interface PriceHistoryEntry {
  id: string;
  productId: string;
  oldPrice: number;
  newPrice: number;
  oldCost: number;
  newCost: number;
  date: string;
  userId: string;
}

// --- NUEVO: GESTIÓN DE GASTOS ---
export interface Expense {
  id: string;
  date: string;
  description: string;
  amount: number;
  categoryId: 'Alquiler' | 'Servicios' | 'Sueldos' | 'Publicidad' | 'Insumos' | 'Transporte' | 'Otros';
  paymentMethod: 'Efectivo' | 'Tarjeta' | 'Transferencia';
  userId: string;
}

// --- NUEVO: KARDEX (HISTORIAL INVENTARIO) ---
export type MovementType = 'SALE' | 'PURCHASE' | 'ADJUSTMENT' | 'RETURN' | 'CANCELLATION';

export interface InventoryMovement {
  id: string;
  productId: string;
  date: string;
  type: MovementType;
  quantity: number; // Positivo para entrada, negativo para salida
  previousStock: number;
  newStock: number;
  reason: string;
  userId: string;
  referenceId?: string; // Folio de venta o factura de compra
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  defaultMinStock?: number;
  active?: boolean;
}

export enum LoyaltyLevel {
  BRONZE = 'Bronce',
  SILVER = 'Plata',
  GOLD = 'Oro',
  PLATINUM = 'Platino'
}

export interface Customer {
  id: string;
  type: 'Natural' | 'Juridico';
  name: string;
  legalRepresentative?: string;
  email: string;
  phone: string;
  dni?: string;
  rtn?: string;
  address?: string;
  birthDate?: string;
  points: number;
  level: LoyaltyLevel;
  totalSpent: number;
  active?: boolean;
}

export interface CartItem extends Product {
  quantity: number;
  discount?: number;
  notes?: string;
}

export interface PaymentDetails {
  cash?: number;
  card?: number;
  transfer?: number;
  creditNote?: number;
  credit?: number;
  creditNoteReference?: string;
  authCode?: string;
  cardRef?: string;
  transferRef?: string;
  bank?: string;
}

export type FulfillmentStatus = 'pending' | 'production' | 'ready' | 'shipped' | 'delivered';

export interface ShippingDetails {
  method: 'pickup' | 'shipping';
  company?: string;
  trackingNumber?: string;
  shippingDate?: string;
  shippingCost?: number;
  address?: string;
  notes?: string;
}

export interface Sale {
  id: string;
  folio: string;
  cai?: string;
  date: string;
  items: CartItem[];
  subtotal: number;
  taxAmount: number;
  discount: number;
  total: number;
  paymentMethod: 'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Mixto' | 'Crédito';
  paymentDetails?: PaymentDetails;
  customerId?: string;
  userId: string;
  branchId: string;
  status: 'active' | 'cancelled';
  pointsUsed?: number;
  pointsMonetaryValue?: number;
  documentType?: 'FACTURA' | 'TICKET';
  originalQuoteId?: string;
  fulfillmentStatus?: FulfillmentStatus;
  shippingDetails?: ShippingDetails;
}

export interface CreditNote {
  id: string;
  folio: string;
  saleId: string;
  customerId: string;
  originalTotal: number;
  remainingAmount: number;
  reason: string;
  date: string;
  status: 'active' | 'used';
}

export interface Quote extends Omit<Sale, 'id' | 'folio' | 'cai' | 'paymentMethod' | 'status'> {
  id: string;
  folio: string;
  expirationDate: string;
  status: 'pending' | 'accepted' | 'expired' | 'deleted';
}

export interface CompanySettings {
  name: string;
  rtn: string;
  address: string;
  phone: string;
  email: string;
  whatsappNumber?: string;
  showFloatingWhatsapp?: boolean;
  whatsappTemplate?: string;
  masterPassword?: string;
  cai: string;
  billingRangeStart: string;
  billingRangeEnd: string;
  billingDeadline: string;
  currentInvoiceNumber: number;
  currentTicketNumber?: number;
  currentProductCode?: number;  // Sequential code for products
  currentQuoteNumber?: number;  // Sequential code for quotes
  printerSize: '58mm' | '80mm';
  logo?: string;
  moneyPerPoint: number;
  pointValue: number;
  defaultCreditRate: number;
  defaultCreditTerm: number;
  creditDueDateAlertDays?: number;
  enableCreditAlerts?: boolean;
  themeColor?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  autoSync?: boolean;
  lastBackupDate?: string | null;
}

export interface CashCut {
  id: string;
  date: string;
  userId: string;
  branchId: string;
  totalSales: number;
  cashExpected: number;
  cashCounted: number;
  difference: number;
  details: {
    bill500: number; bill200: number; bill100: number; bill50: number;
    bill20: number; bill10: number; bill5: number; bill2: number;
    bill1: number; coins: number;
  };
}

export interface Supplier {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  rtn?: string;
  address?: string;
  active?: boolean;
}

export interface Consumable {
  id: string;
  name: string;
  category: 'Papel' | 'Cintas' | 'Tintas' | 'Adhesivos' | 'Empaques' | 'Etiquetas' | 'Herramientas' | 'Limpieza';
  stock: number;
  minStock: number;
  cost: number;
  unit: string;
  active?: boolean;
}

export interface Promotion {
  id: string;
  name: string;
  type: 'percent' | 'amount' | '2x1' | '3x2' | 'gift' | 'special_price';
  value: number;
  startDate: string;
  endDate: string;
  active: boolean;
  productIds?: string[];
  categoryIds?: string[];
}

export interface CreditAccount {
  id: string;
  customerId: string;
  saleId: string;
  principal: number;
  totalAmount: number;
  paidAmount: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  dueDate: string;
  createdAt: string;
  payments: CreditPayment[];
  interestRate?: number;
  termMonths?: number;
  monthlyPayment?: number;
}

export interface CreditPayment {
  id: string;
  date: string;
  amount: number;
  method: 'Efectivo' | 'Tarjeta' | 'Transferencia';
  note?: string;
}

export const ICONS = [
  'tag', 'tags', 'box', 'gift', 'star', 'heart', 'shopping-cart', 'shopping-bag', 'tshirt', 'graduation-cap', 'mug-hot', 'camera', 'pen-fancy', 'print', 'cut'
];
