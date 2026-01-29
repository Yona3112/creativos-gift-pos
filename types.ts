
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
  updatedAt?: string;  // Timestamp for sync tracking (updated on stock changes)
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

// FixedExpense removed - feature was not used and caused sync issues

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
  guideFile?: string;           // Base64 del archivo de guía (PDF o imagen)
  guideFileType?: 'pdf' | 'image'; // Tipo de archivo de la guía
  guideFileName?: string;       // Nombre original del archivo
  productionImages?: string[];  // Hasta 3 imágenes para contexto de producción
  isLocalDelivery?: boolean;    // Entrega local (no requiere guía)
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
  customerName?: string;  // Persist customer name to avoid lookup issues
  userId: string;
  branchId: string;
  status: 'active' | 'cancelled';
  pointsUsed?: number;
  pointsMonetaryValue?: number;
  documentType?: 'FACTURA' | 'TICKET';
  originalQuoteId?: string;
  fulfillmentStatus?: FulfillmentStatus;
  shippingDetails?: ShippingDetails;
  isOrder?: boolean;
  deposit?: number;
  balance?: number;
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
  logoObjectFit?: 'cover' | 'contain';
  thanksMessage?: string;
  warrantyPolicy?: string;
  returnPolicy?: string;
  barcodeWidth?: number;
  barcodeHeight?: number;
  showLogoOnBarcode?: boolean;
  barcodeLogoSize?: number;
  legalOwnerName?: string;
  legalCity?: string;
  darkMode?: boolean;
  enableBeep?: boolean;
  currentSeason?: string;
}

export const SEASONS = [
  { id: 'default', name: 'Original', color: '#6366F1' },
  { id: 'valentine', name: 'Día del Amor', color: '#e62e8a' },
  { id: 'mother', name: 'Día de la Madre', color: '#ff69b4' },
  { id: 'father', name: 'Día del Padre', color: '#3b82f6' },
  { id: 'independence', name: 'Independencia', color: '#0ea5e9' },
  { id: 'yellow_flowers', name: 'Flores Amarillas', color: '#facc15' },
  { id: 'christmas', name: 'Navidad', color: '#dc2626' },
  { id: 'halloween', name: 'Temporada Spooky', color: '#ea580c' }
];

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

// Iconos organizados por categoría para fácil selección
export const ICONS = [
  // Básicos y Comercio
  'tag', 'tags', 'box', 'boxes', 'gift', 'gifts', 'star', 'heart', 'shopping-cart', 'shopping-bag', 'store', 'warehouse',
  // Ropa y Accesorios
  'tshirt', 'hat-cowboy', 'socks', 'glasses', 'ring', 'gem', 'crown',
  // Educación y Oficina
  'graduation-cap', 'book', 'book-open', 'pen-fancy', 'pencil-alt', 'ruler', 'sticky-note',
  // Tecnología e Impresión (3D, DTF, Láser)
  'print', 'cube', 'cubes', 'layer-group', 'vector-square', 'bezier-curve', 'palette', 'paint-brush', 'brush', 'magic', 'wand-magic-sparkles', 'fire-flame-curved',
  // Comida y Bebidas
  'mug-hot', 'coffee', 'birthday-cake', 'cake-candles', 'ice-cream', 'cookie', 'wine-glass', 'champagne-glasses',
  // Naturaleza, Flores y Arreglos Florales
  'seedling', 'leaf', 'spa', 'tree', 'sun', 'moon', 'snowflake', 'clover', 'fan', 'feather', 'holly-berry', 'pepper-hot',
  // Juguetes y Peluches
  'hippo', 'dog', 'cat', 'dove', 'dragon', 'fish', 'horse', 'paw', 'puzzle-piece', 'gamepad', 'dice', 'robot', 'ghost',
  // Eventos y Celebraciones
  'balloon', 'medal', 'trophy', 'award', 'certificate',
  // Herramientas y DIY
  'cut', 'scissors', 'tools', 'wrench', 'screwdriver', 'fire', 'bolt', 'lightbulb',
  // Fotografía y Media
  'camera', 'camera-retro', 'video', 'music', 'microphone', 'film', 'image', 'images',
  // Hogar y Decoración
  'home', 'couch', 'bed', 'lamp', 'fan', 'chair', 'door-open',
  // Transporte
  'car', 'motorcycle', 'bicycle', 'plane', 'ship', 'truck',
  // Otros útiles
  'hand-holding-heart', 'handshake', 'user', 'users', 'baby', 'child', 'person', 'people-group'
];
