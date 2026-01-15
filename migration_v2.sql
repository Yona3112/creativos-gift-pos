-- MIGRATION V2: Fix missing columns for full synchronization
-- Run this in your Supabase SQL Editor

-- 1. Create fixed_expenses table (missing in V1)
CREATE TABLE IF NOT EXISTS fixed_expenses (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  "categoryId" TEXT,
  "paymentMethod" TEXT,
  active BOOLEAN DEFAULT true
);

-- 2. Add missing columns to settings table
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "themeColor" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "thanksMessage" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "warrantyPolicy" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "returnPolicy" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "showFloatingWhatsapp" BOOLEAN DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "whatsappNumber" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "whatsappTemplate" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "logoObjectFit" TEXT DEFAULT 'contain';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "barcodeWidth" NUMERIC DEFAULT 2;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "barcodeHeight" NUMERIC DEFAULT 40;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "showLogoOnBarcode" BOOLEAN DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "barcodeLogoSize" NUMERIC DEFAULT 20;

-- 3. Add expenses table (if not exists)
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
