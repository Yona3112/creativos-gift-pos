-- =========================================================
-- LIMPIAR SISTEMA DE GASTOS - CREATIVOS GIFT POS
-- Ejecutar este SQL en Supabase SQL Editor
-- =========================================================

-- PASO 1: Eliminar tablas viejas
DROP TABLE IF EXISTS fixed_expenses;
DROP TABLE IF EXISTS expenses;

-- PASO 2: Crear tabla expenses limpia
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  "categoryId" TEXT NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PASO 3: Índice para búsquedas por fecha (mejora rendimiento)
CREATE INDEX idx_expenses_date ON expenses(date);

-- =========================================================
-- INSTRUCCIONES:
-- 1. Copia este SQL completo
-- 2. Ve a Supabase > SQL Editor
-- 3. Pega y ejecuta
-- 4. Esto eliminará TODOS los gastos viejos y creará una tabla limpia
-- =========================================================
