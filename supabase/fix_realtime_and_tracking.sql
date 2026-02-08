-- ================================================
-- SUPABASE REALTIME & TRACKING FIX
-- Execute this in your Supabase SQL Editor
-- ================================================

-- 1. Create order_tracking table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.order_tracking (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    user_id TEXT REFERENCES public.users(id),
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for order_tracking
ALTER TABLE public.order_tracking ENABLE ROW LEVEL SECURITY;

-- Basic policies for order_tracking
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_tracking' AND policyname = 'Enable all for anon/authenticated') THEN
        CREATE POLICY "Enable all for anon/authenticated" ON public.order_tracking FOR ALL USING (true);
    END IF;
END $$;

-- 2. Configure Realtime Publication
-- This assures all required tables are in the supabase_realtime publication
BEGIN;
  -- If you get an error that the publication already exists, that's fine.
  -- The following commands safely add tables if they are not already there.
  
  -- Create publication if it doesn't exist (unlikely in Supabase but for safety)
  -- CREATE PUBLICATION supabase_realtime; 
  -- EXCEPTION WHEN duplicate_object THEN NULL;

  -- Add tables to the publication
  ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.sales;
  ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.products;
  ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.customers;
  ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.inventory_history;
  ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.settings;
  ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.credits;
  ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.expenses;
  ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.quotes;
  ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.cash_cuts;
  ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.order_tracking;
  ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.credit_notes;
COMMIT;

-- 3. Set Replica Identity for all synchronized tables
-- This ensures update/delete events contain all data fields
ALTER TABLE public.sales REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.customers REPLICA IDENTITY FULL;
ALTER TABLE public.inventory_history REPLICA IDENTITY FULL;
ALTER TABLE public.settings REPLICA IDENTITY FULL;
ALTER TABLE public.credits REPLICA IDENTITY FULL;
ALTER TABLE public.expenses REPLICA IDENTITY FULL;
ALTER TABLE public.quotes REPLICA IDENTITY FULL;
ALTER TABLE public.cash_cuts REPLICA IDENTITY FULL;
ALTER TABLE public.order_tracking REPLICA IDENTITY FULL;
ALTER TABLE public.credit_notes REPLICA IDENTITY FULL;

-- 4. Create index for faster sync tracking
CREATE INDEX IF NOT EXISTS idx_order_tracking_sale_id ON public.order_tracking(sale_id);
CREATE INDEX IF NOT EXISTS idx_order_tracking_updatedAt ON public.order_tracking("updatedAt");
CREATE INDEX IF NOT EXISTS idx_credit_notes_updatedAt ON public.credit_notes("updatedAt");

-- 5. Final Permission Check
GRANT ALL ON TABLE public.order_tracking TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.credit_notes TO anon, authenticated, service_role;
