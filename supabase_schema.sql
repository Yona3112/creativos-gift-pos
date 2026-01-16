
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
  "defaultMinStock" NUMERIC,
  active BOOLEAN DEFAULT true
);

-- Branches
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  manager TEXT,
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
  "enableLowStockAlert" BOOLEAN DEFAULT true,
  "categoryId" TEXT REFERENCES categories(id),
  "providerId" TEXT,
  image TEXT,
  active BOOLEAN DEFAULT true,
  "isTaxable" BOOLEAN DEFAULT true
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  type TEXT,
  name TEXT NOT NULL,
  "legalRepresentative" TEXT,
  phone TEXT,
  rtn TEXT,
  dni TEXT,
  email TEXT,
  address TEXT,
  "birthDate" TEXT,
  points NUMERIC DEFAULT 0,
  "totalSpent" NUMERIC DEFAULT 0,
  level TEXT,
  active BOOLEAN DEFAULT true
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
  "shippingDetails" JSONB,
  "originalQuoteId" TEXT,
  "isOrder" BOOLEAN DEFAULT false,
  "deposit" NUMERIC DEFAULT 0,
  "balance" NUMERIC DEFAULT 0
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
  type TEXT,
  value NUMERIC,
  "startDate" TIMESTAMP WITH TIME ZONE,
  "endDate" TIMESTAMP WITH TIME ZONE,
  active BOOLEAN DEFAULT true,
  "productIds" JSONB,
  "categoryIds" JSONB
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  "companyName" TEXT,
  "contactName" TEXT,
  email TEXT,
  phone TEXT,
  rtn TEXT,
  address TEXT,
  active BOOLEAN DEFAULT true
);

-- Consumables
CREATE TABLE IF NOT EXISTS consumables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  stock NUMERIC,
  "minStock" NUMERIC,
  category TEXT,
  cost NUMERIC,
  unit TEXT,
  active BOOLEAN DEFAULT true
);

-- Quotes
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  folio TEXT NOT NULL,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  items JSONB NOT NULL,
  subtotal NUMERIC,
  "taxAmount" NUMERIC,
  discount NUMERIC DEFAULT 0,
  total NUMERIC,
  "customerId" TEXT,
  "userId" TEXT,
  "branchId" TEXT,
  "expirationDate" TIMESTAMP WITH TIME ZONE,
  status TEXT
);

-- Cash Cuts
CREATE TABLE IF NOT EXISTS cash_cuts (
  id TEXT PRIMARY KEY,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "userId" TEXT,
  "branchId" TEXT,
  "totalSales" NUMERIC,
  "cashExpected" NUMERIC,
  "cashCounted" NUMERIC,
  difference NUMERIC,
  details JSONB
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
  "paymentMethod" TEXT,
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
  "currentInvoiceNumber" INTEGER DEFAULT 1,
  "currentTicketNumber" INTEGER DEFAULT 1,
  "currentProductCode" INTEGER DEFAULT 1,
  "currentQuoteNumber" INTEGER DEFAULT 1,
  "printerSize" TEXT,
  "moneyPerPoint" NUMERIC,
  "pointValue" NUMERIC,
  "defaultCreditRate" NUMERIC,
  "defaultCreditTerm" INTEGER,
  "creditDueDateAlertDays" INTEGER,
  "enableCreditAlerts" BOOLEAN,
  "showFloatingWhatsapp" BOOLEAN,
  "whatsappTemplate" TEXT,
  "logo" TEXT,
  "themeColor" TEXT,
  "whatsappNumber" TEXT,
  "masterPassword" TEXT,
  "supabaseUrl" TEXT,
  "supabaseKey" TEXT,
  "autoSync" BOOLEAN DEFAULT false,
  "lastBackupDate" TEXT,
  "logoObjectFit" TEXT,
  -- NEW COLUMNS FOR FULL SYNC SUPPORT
  "thanksMessage" TEXT,
  "warrantyPolicy" TEXT,
  "returnPolicy" TEXT,
  "barcodeWidth" INTEGER DEFAULT 50,
  "barcodeHeight" INTEGER DEFAULT 25,
  "showLogoOnBarcode" BOOLEAN DEFAULT false,
  "barcodeLogoSize" INTEGER DEFAULT 10,
  "legalOwnerName" TEXT,
  "legalCity" TEXT
);

-- ================================================
-- RUN THESE IF YOUR TABLES ALREADY EXIST:
-- (To add the new columns to existing settings table)
-- ================================================
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "currentProductCode" INTEGER DEFAULT 1;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "currentQuoteNumber" INTEGER DEFAULT 1;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "lastBackupDate" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "logoObjectFit" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "thanksMessage" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "warrantyPolicy" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "returnPolicy" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "barcodeWidth" INTEGER DEFAULT 50;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "barcodeHeight" INTEGER DEFAULT 25;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "showLogoOnBarcode" BOOLEAN DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "barcodeLogoSize" INTEGER DEFAULT 10;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "legalOwnerName" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "legalCity" TEXT;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS "isOrder" BOOLEAN DEFAULT false;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS "deposit" NUMERIC DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS "balance" NUMERIC DEFAULT 0;

