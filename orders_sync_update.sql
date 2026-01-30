
-- ACTUALIZACIÓN PARA MÓDULO DE PEDIDOS Y SINCRONIZACIÓN MEJORADA
-- Ejecute esto en el editor SQL de Supabase

-- 1. Soporte para Historial de Estados y Timestamps en Ventas/Pedidos
ALTER TABLE sales ADD COLUMN IF NOT EXISTS "fulfillmentHistory" JSONB DEFAULT '[]';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Asegurar que todas las tablas tengan updatedAt para sincronización incremental (DeltaSync)
DO $$ 
DECLARE 
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('fixed_expenses') -- tablas excluidas si aplica
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()', t);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'No se pudo agregar updatedAt a %: %', t, SQLERRM;
        END;
    END LOOP;
END $$;

-- 3. Índices para mejorar el rendimiento de las consultas de sincronización
CREATE INDEX IF NOT EXISTS idx_categories_updatedAt ON categories("updatedAt");
CREATE INDEX IF NOT EXISTS idx_customers_updatedAt ON customers("updatedAt");
CREATE INDEX IF NOT EXISTS idx_credits_updatedAt ON credits("updatedAt");
CREATE INDEX IF NOT EXISTS idx_expenses_updatedAt ON expenses("updatedAt");
CREATE INDEX IF NOT EXISTS idx_inventory_history_updatedAt ON inventory_history("updatedAt");
CREATE INDEX IF NOT EXISTS idx_quotes_updatedAt ON quotes("updatedAt");
CREATE INDEX IF NOT EXISTS idx_cash_cuts_updatedAt ON cash_cuts("updatedAt");

-- 4. Actualizar updatedAt automáticamente al modificar registros (opcional pero recomendado)
-- Primero creamos la función
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Luego aplicamos el trigger a las tablas principales
DO $$ 
DECLARE 
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('products', 'sales', 'customers', 'inventory_history', 'expenses')
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS tr_update_updated_at ON %I', t);
        EXECUTE format('CREATE TRIGGER tr_update_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t);
    END LOOP;
END $$;
