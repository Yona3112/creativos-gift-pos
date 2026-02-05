-- SCRIPT DE EMERGENCIA: REINICIO DE CACHÉ DE SUPABASE
-- Ejecuta esto si ves errores 503 o PGRST002 "Could not query schema cache"

-- 1. Forzar recarga via señal interna de PostgREST
NOTIFY pgrst, 'reload schema';

-- 2. Forzar recarga via cambio de metadatos del esquema publico
-- (Esto es el equivalente a un "reinicio físico" del servicio de API)
COMMENT ON SCHEMA public IS 'Cache refreshed at ' || NOW();

-- 3. Asegurar que el rol de API tiene acceso a las tablas (por si acaso)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
