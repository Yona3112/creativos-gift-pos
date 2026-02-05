-- SCRIPT DE REPARACIÓN FINAL (VERSIÓN SIMPLE)
-- Ejecute esto para solucionar de una vez por todas los errores de esquema y lentitud.

-- 1. Asegurar TODAS las columnas críticas
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "lastCloudPush" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "lastCloudSync" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "deviceId" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "currentSeason" TEXT;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS "balancePaymentDate" TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS "balancePaymentMethod" TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS "balancePaid" NUMERIC DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Forzar la recarga del caché de esquema
COMMENT ON TABLE settings IS 'Esquema actualizado v3';
COMMENT ON TABLE sales IS 'Esquema optimizado v3';

-- 3. Reconstrucción de Índices (Esto quita la lentitud/Timeout)
REINDEX TABLE sales;
REINDEX TABLE products;
ANALYZE sales;
ANALYZE products;

-- 4. Garantía de Permisos Universales
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
