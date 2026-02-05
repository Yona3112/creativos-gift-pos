-- AUDITORÍA: Buscar cortes de caja fantasma o con fechas incorrectas
-- Ejecuta esto en Supabase para ver todos los cortes registrados

SELECT 
    id,
    date,
    "totalSales",
    "cashExpected",
    "cashCounted",
    difference
FROM cash_cuts
ORDER BY date DESC
LIMIT 20;

-- SI VES UN CORTE CON FECHA DE HOY O DE MEDIANOCHE QUE NO RECUERDAS HABER HECHO,
-- Bórralo con este comando (reemplaza 'ID_DEL_CORTE_SOSPECHOSO' con el ID real):
-- DELETE FROM cash_cuts WHERE id = 'ID_DEL_CORTE_SOSPECHOSO';
