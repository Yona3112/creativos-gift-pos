-- SCRIPT DE EMERGENCIA: LIMPIEZA DE IMÁGENES PESADAS EN LA NUBE
-- Ejecute este script para resolver el error "Statement Timeout" de raíz.

-- 1. Limpiar imágenes de la tabla de VENTAS (esto reduce el peso en un 95%)
UPDATE sales
SET items = (
  SELECT jsonb_agg(
    CASE 
      WHEN (item ? 'image') THEN (item - 'image')
      ELSE item
    END
  )
  FROM jsonb_array_elements(items) AS item
)
WHERE items::text LIKE '%"image":%';

-- 2. Limpiar imágenes de la tabla de COTIZACIONES (opcional pero recomendado)
UPDATE quotes
SET items = (
  SELECT jsonb_agg(
    CASE 
      WHEN (item ? 'image') THEN (item - 'image')
      ELSE item
    END
  )
  FROM jsonb_array_elements(items) AS item
)
WHERE items::text LIKE '%"image":%';

-- 3. Asegurar índices para que las consultas sean instantáneas
CREATE INDEX IF NOT EXISTS idx_sales_updated_at_final ON sales("updatedAt");
CREATE INDEX IF NOT EXISTS idx_products_updated_at_final ON products("updatedAt");

-- Mensaje de éxito sugerido: "Filas afectadas: X"
