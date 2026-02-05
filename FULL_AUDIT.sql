-- AUDITORÍA COMPLETA: VENTAS VS CORTES DE CAJA
-- Ejecuta esto cuando Supabase deje de dar errores 503

-- 1. Ver todas las ventas del 5 de febrero para confirmar el total real
SELECT 
    id, folio, date, total, "paymentMethod", status
FROM sales
WHERE date >= '2026-02-05' AND date < '2026-02-06'
AND status = 'active'
ORDER BY date;

-- 2. Calcular el total real de ventas del día 5
SELECT 
    SUM(total) as total_ventas_dia_5
FROM sales
WHERE date >= '2026-02-05' AND date < '2026-02-06'
AND status = 'active';

-- 3. Ver todos los cortes de caja para comparar
SELECT id, date, "totalSales", "cashExpected"
FROM cash_cuts
ORDER BY date DESC;

-- 4. LIMPIEZA: Eliminar TODOS los cortes de febrero para reconstruirlos
-- (Solo ejecutar si confirmas que los datos están corruptos)
-- DELETE FROM cash_cuts WHERE date >= '2026-02-01';
