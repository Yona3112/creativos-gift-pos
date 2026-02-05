-- ACTUALIZACIÓN DE ESQUEMA PARA SOPORTE DE PAGOS DE PEDIDOS
-- Ejecute este script en el Editor SQL de Supabase

-- 1. Añadir campos para gestión de saldos en Ventas
ALTER TABLE sales ADD COLUMN IF NOT EXISTS "balancePaymentDate" TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS "balancePaymentMethod" TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS "balancePaid" NUMERIC DEFAULT 0;

-- 2. Asegurar columnas de auditoría en tablas de historial (si faltan)
ALTER TABLE inventory_history ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. Índices adicionales para rendimiento
CREATE INDEX IF NOT EXISTS idx_sales_fulfillmentStatus ON sales("fulfillmentStatus");
CREATE INDEX IF NOT EXISTS idx_credits_status ON credits(status);

-- 4. Actualizar updatedAt para registros existentes que no lo tengan
UPDATE sales SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL;
UPDATE products SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL;
