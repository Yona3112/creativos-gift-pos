-- ================================================
-- FIX TIMEZONE DRIFT (HONDURAS UTC-6)
-- Execute this in your Supabase SQL Editor
-- ================================================

-- This script ensures that the Cloud doesn't overwrite 
-- timestamps with real UTC, respecting the POS local time.

-- 1. Sales
ALTER TABLE public.sales ALTER COLUMN date DROP DEFAULT;
ALTER TABLE public.sales ALTER COLUMN "updatedAt" DROP DEFAULT;

-- 2. Products
ALTER TABLE public.products ALTER COLUMN "updatedAt" DROP DEFAULT;

-- 3. Inventory History
ALTER TABLE public.inventory_history ALTER COLUMN date DROP DEFAULT;
ALTER TABLE public.inventory_history ALTER COLUMN "updatedAt" DROP DEFAULT;

-- 4. Credit Notes
ALTER TABLE public.credit_notes ALTER COLUMN date DROP DEFAULT;
ALTER TABLE public.credit_notes ALTER COLUMN "updatedAt" DROP DEFAULT;

-- 5. Order Tracking
ALTER TABLE public.order_tracking ALTER COLUMN created_at DROP DEFAULT;
ALTER TABLE public.order_tracking ALTER COLUMN "updatedAt" DROP DEFAULT;

-- 6. Expenses
ALTER TABLE public.expenses ALTER COLUMN "updatedAt" DROP DEFAULT;

-- NOTE: By dropping these defaults, we force the Application to be the Source of Truth.
-- This is critical for Offline-First apps where the local clock matters more than the server clock.
