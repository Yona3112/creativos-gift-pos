
-- SCHEMA FOR CREATIVOS GIFT POS
-- Execute this in your Supabase SQL Editor

-- Enable RLS (Optional, for now we assume public or service role for simplicity)
-- ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  "defaultMinStock" NUMERIC
);

-- Branches
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  active BOOLEAN DEFAULT true
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  code TEXT,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  cost NUMERIC,
  stock NUMERIC DEFAULT 0,
  "minStock" NUMERIC DEFAULT 0,
  "categoryId" TEXT REFERENCES categories(id),
  image TEXT,
  active BOOLEAN DEFAULT true,
  "isTaxable" BOOLEAN DEFAULT true
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  rtn TEXT,
  email TEXT,
  address TEXT,
  points NUMERIC DEFAULT 0,
  "totalSpent" NUMERIC DEFAULT 0,
  level TEXT,
  active BOOLEAN DEFAULT true,
  type TEXT
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT,
  "branchId" TEXT REFERENCES branches(id),
  active BOOLEAN DEFAULT true
);

-- Sales
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  folio TEXT UNIQUE NOT NULL,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  items JSONB NOT NULL,
  subtotal NUMERIC NOT NULL,
  "taxAmount" NUMERIC NOT NULL,
  discount NUMERIC DEFAULT 0,
  total NUMERIC NOT NULL,
  "paymentMethod" TEXT,
  "paymentDetails" JSONB,
  "customerId" TEXT REFERENCES customers(id),
  "userId" TEXT REFERENCES users(id),
  "branchId" TEXT REFERENCES branches(id),
  status TEXT,
  cai TEXT,
  "documentType" TEXT,
  "pointsUsed" NUMERIC,
  "pointsMonetaryValue" NUMERIC,
  "fulfillmentStatus" TEXT,
  "shippingDetails" JSONB
);

-- Credits
CREATE TABLE IF NOT EXISTS credits (
  id TEXT PRIMARY KEY,
  "customerId" TEXT REFERENCES customers(id),
  "saleId" TEXT,
  principal NUMERIC NOT NULL,
  "totalAmount" NUMERIC NOT NULL,
  "paidAmount" NUMERIC DEFAULT 0,
  status TEXT,
  "dueDate" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  payments JSONB,
  "interestRate" NUMERIC,
  "termMonths" INTEGER,
  "monthlyPayment" NUMERIC
);

-- Promotions
CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  "discountPercent" NUMERIC,
  "startDate" TIMESTAMP WITH TIME ZONE,
  "endDate" TIMESTAMP WITH TIME ZONE,
  active BOOLEAN DEFAULT true,
  "categoryId" TEXT REFERENCES categories(id)
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT
);

-- Consumables
CREATE TABLE IF NOT EXISTS consumables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  stock NUMERIC,
  "minStock" NUMERIC
);

-- Quotes
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  folio TEXT NOT NULL,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  items JSONB NOT NULL,
  subtotal NUMERIC,
  total NUMERIC,
  "customerId" TEXT,
  status TEXT
);

-- Cash Cuts
CREATE TABLE IF NOT EXISTS cash_cuts (
  id TEXT PRIMARY KEY,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "userId" TEXT,
  "branchId" TEXT,
  "initialCash" NUMERIC,
  "salesCash" NUMERIC,
  "salesCard" NUMERIC,
  "salesTransfer" NUMERIC,
  "totalCollected" NUMERIC,
  "totalExpected" NUMERIC,
  difference NUMERIC,
  notes TEXT
);

-- Credit Notes
CREATE TABLE IF NOT EXISTS credit_notes (
  id TEXT PRIMARY KEY,
  folio TEXT UNIQUE NOT NULL,
  "saleId" TEXT REFERENCES sales(id),
  "customerId" TEXT REFERENCES customers(id),
  "originalTotal" NUMERIC,
  "remainingAmount" NUMERIC,
  reason TEXT,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  description TEXT,
  amount NUMERIC NOT NULL,
  "categoryId" TEXT,
  "userId" TEXT,
  "branchId" TEXT
);

-- Inventory History
CREATE TABLE IF NOT EXISTS inventory_history (
  id TEXT PRIMARY KEY,
  "productId" TEXT REFERENCES products(id),
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  type TEXT,
  quantity NUMERIC,
  "previousStock" NUMERIC,
  "newStock" NUMERIC,
  reason TEXT,
  "userId" TEXT,
  "referenceId" TEXT
);

-- Price History
CREATE TABLE IF NOT EXISTS price_history (
  id TEXT PRIMARY KEY,
  "productId" TEXT REFERENCES products(id),
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "oldPrice" NUMERIC,
  "newPrice" NUMERIC,
  "oldCost" NUMERIC,
  "newCost" NUMERIC,
  "userId" TEXT
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  name TEXT,
  rtn TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  cai TEXT,
  "billingRangeStart" TEXT,
  "billingRangeEnd" TEXT,
  "billingDeadline" TEXT,
  "currentInvoiceNumber" INTEGER,
  "currentTicketNumber" INTEGER,
  "printerSize" TEXT,
  "moneyPerPoint" NUMERIC,
  "pointValue" NUMERIC,
  "defaultCreditRate" NUMERIC,
  "defaultCreditTerm" INTEGER,
  "showFloatingWhatsapp" BOOLEAN,
  "whatsappTemplate" TEXT,
  "logo" TEXT,
  "themeColor" TEXT,
  "whatsappNumber" TEXT,
  "masterPassword" TEXT,
  "supabaseUrl" TEXT,
  "supabaseKey" TEXT
);
