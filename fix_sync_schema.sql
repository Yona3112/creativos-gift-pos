-- SCRIPT DE REPARACIÓN DE ESQUEMA PARA SUPABASE
-- Ejecute este script en el SQL Editor de su panel de Supabase

-- 1. Asegurar columnas de sincronización en la tabla de Ajustes (SETTINGS)
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "lastCloudSync" TEXT;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "currentSeason" TEXT;
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "deviceId" TEXT;

-- 2. Añadir columna updatedAt a todas las tablas que no la tengan
-- Esto es CRUCIAL para que el sistema incremental detecte qué registros cambiaron

ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE "credits" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE "consumables" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE "cash_cuts" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE "credit_notes" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE "inventory_history" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE "price_history" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. Crear índices para mejorar el rendimiento de la búsqueda por fecha de actualización
-- Esto evita que las consultas excedan el tiempo límite de Supabase (Timeout)

CREATE INDEX IF NOT EXISTS idx_categories_updatedAt ON categories("updatedAt");
CREATE INDEX IF NOT EXISTS idx_branches_updatedAt ON branches("updatedAt");
CREATE INDEX IF NOT EXISTS idx_customers_updatedAt ON customers("updatedAt");
CREATE INDEX IF NOT EXISTS idx_users_updatedAt ON users("updatedAt");
CREATE INDEX IF NOT EXISTS idx_credits_updatedAt ON credits("updatedAt");
CREATE INDEX IF NOT EXISTS idx_expenses_updatedAt ON expenses("updatedAt");
CREATE INDEX IF NOT EXISTS idx_inventory_history_updatedAt ON inventory_history("updatedAt");
CREATE INDEX IF NOT EXISTS idx_price_history_updatedAt ON price_history("updatedAt");
CREATE INDEX IF NOT EXISTS idx_settings_updatedAt ON settings("updatedAt");

-- 4. Asegurar que 'updatedAt' se actualice automáticamente en cada cambio (Triggers)
-- Opcional pero recomendado para máxima seguridad de datos

-- Función auxiliar para el trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Aplicar a tablas críticas si aún no lo tienen
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_sales_updated_at') THEN
        CREATE TRIGGER tr_sales_updated_at BEFORE UPDATE ON sales FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_products_updated_at') THEN
        CREATE TRIGGER tr_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;
