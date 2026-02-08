---
name: Supabase Optimization & High Egress Fix
description: Guide to optimizing Supabase usage, specifically reducing data egress by separating heavy attachments (Base64) from main tables.
---

# Supabase Optimization: Handling Heavy Attachments

## Problem: High Data Egress
Storing large Base64 strings (images, PDFs) directly in frequently accessed tables (like `sales` or `orders`) causes massive data transfer (egress) every time the table is synced or queried. This can quickly exhaust Free Tier limits (e.g., 1GB/day).

## Solution: Split Attachments
Move heavy data to a dedicated `attachments` table that is **not** subscribed to via Realtime by default. Fetch this data only when needed (e.g., when opening a specific order).

## 1. Database Schema
Create a separate table for attachments, ensuring it has RLS enabled.

```sql
-- Create separate table
CREATE TABLE IF NOT EXISTS public.sale_attachments (
    id text PRIMARY KEY,
    sale_id text NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    file_type text NOT NULL, -- 'image' | 'pdf'
    file_name text,
    file_data text NOT NULL, -- Base64 data
    category text DEFAULT 'general', -- 'guide' | 'production' | 'general'
    created_at timestamptz DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_sale_attachments_sale_id ON public.sale_attachments(sale_id);

-- Enable RLS
ALTER TABLE public.sale_attachments ENABLE ROW LEVEL SECURITY;

-- Policies (Adjust as needed)
CREATE POLICY "Enable read access" ON public.sale_attachments FOR SELECT USING (true);
CREATE POLICY "Enable insert access" ON public.sale_attachments FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access" ON public.sale_attachments FOR UPDATE USING (true);
CREATE POLICY "Enable delete access" ON public.sale_attachments FOR DELETE USING (true);
```

## 2. Application Logic (React/TypeScript)
Do not save the Base64 string to the main record. Instead, upload it to the attachments table.

### Uploading
```typescript
async saveAttachment(saleId: string, fileData: string, type: 'image' | 'pdf', fileName?: string, category = 'general') {
  const { data, error } = await supabase
    .from('sale_attachments')
    .insert({
      id: Date.now().toString(),
      sale_id: saleId,
      file_type: type,
      file_name: fileName,
      file_data: fileData,
      category: category
    });
}
```

### Fetching (On Demand)
```typescript
async getAttachments(saleId: string) {
  const { data } = await supabase
    .from('sale_attachments')
    .select('*')
    .eq('sale_id', saleId);
  return data || [];
}
```

## 3. executing Migrations via MCP
To apply changes to the database using the Agent:
1. Create a `.sql` file with the schema changes.
2. Use the `mcp_supabase-mcp-server_execute_sql` tool.
3. Pass the content of the SQL file as the `query` argument.

*Example:*
```json
{
  "project_id": "your-project-id",
  "query": "CREATE TABLE..."
}
```
