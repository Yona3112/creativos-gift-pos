-- SCRIPT DE REPARACIÓN DE ESQUEMA (SETTINGS) Y ÓPTIMIZACIÓN
-- Ejecute esto en el SQL Editor de Supabase para corregir los errores 400 y Timeouts.

-- 1. Reparar tabla SETTINGS (Ajustes)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "lastCloudPush" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "lastCloudSync" TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS "currentSeason" TEXT;

-- 2. Índices de Alto Rendimiento para VENTAS
-- Esto acelera las consultas 'updatedAt >= ...' que disparan el Timeout
CREATE INDEX IF NOT EXISTS idx_sales_updatedAt_final_v2 ON sales("updatedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_sales_folio_search ON sales(folio);

-- 3. Limpieza de Caché de Esquema (Opcional pero recomendado)
-- NOTA: Supabase suele recargar el esquema automáticamente al ejecutar ALTER TABLE.

-- 4. Verificación de permisos (Asegurar que el rol anon tiene acceso)
GRANT ALL ON TABLE settings TO anon;
GRANT ALL ON TABLE settings TO authenticated;
GRANT ALL ON TABLE settings TO service_role;
