-- Create a separate table for heavy file attachments to prevent high egress on the main sales table
-- This table will NOT be subscribed to via Realtime by default, saving bandwidth.

create table if not exists public.sale_attachments (
    id text primary key,
    sale_id text not null references public.sales(id) on delete cascade,
    file_type text not null, -- 'image' or 'pdf'
    file_name text,
    file_data text not null, -- Base64 data (heavy)
    "category" text DEFAULT 'general', -- 'guide' | 'production' | 'general'
    created_at timestamptz default now()
);

-- Enable RLS
alter table public.sale_attachments enable row level security;

-- Policies (Relaxed for now as per user preference, but better than nothing)
create policy "Enable read access for all users" on public.sale_attachments for select using (true);
create policy "Enable insert access for all users" on public.sale_attachments for insert with check (true);
create policy "Enable update access for all users" on public.sale_attachments for update using (true);
create policy "Enable delete access for all users" on public.sale_attachments for delete using (true);

-- Index for faster lookups by sale
create index if not exists idx_sale_attachments_sale_id on public.sale_attachments(sale_id);
