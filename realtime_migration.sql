-- ================================================
-- SUPABASE REALTIME MIGRATION
-- Execute this in your Supabase SQL Editor
-- ================================================

-- 1. Enable Realtime for sales table (instant sync between devices)
ALTER PUBLICATION supabase_realtime ADD TABLE sales;

-- 2. Create index for better performance on status queries
CREATE INDEX IF NOT EXISTS idx_sales_fulfillmentStatus ON sales("fulfillmentStatus");

-- 3. PostgreSQL Function for atomic order status updates
-- This prevents race conditions when multiple devices update simultaneously
CREATE OR REPLACE FUNCTION update_order_status(
    p_sale_id TEXT,
    p_new_status TEXT,
    p_shipping_details JSONB DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, message TEXT, updated_sale JSONB) AS $$
DECLARE
    v_current_status TEXT;
    v_result JSONB;
BEGIN
    -- Lock the row to prevent concurrent updates
    SELECT "fulfillmentStatus" INTO v_current_status
    FROM sales WHERE id = p_sale_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Pedido no encontrado'::TEXT, NULL::JSONB;
        RETURN;
    END IF;
    
    -- Update the sale atomically
    UPDATE sales SET
        "fulfillmentStatus" = p_new_status,
        "shippingDetails" = COALESCE(p_shipping_details, "shippingDetails"),
        "updatedAt" = NOW()
    WHERE id = p_sale_id
    RETURNING to_jsonb(sales.*) INTO v_result;
    
    RETURN QUERY SELECT true, 'Estado actualizado'::TEXT, v_result;
END;
$$ LANGUAGE plpgsql;

-- 4. Grant execute permission to authenticated and anon roles
GRANT EXECUTE ON FUNCTION update_order_status TO authenticated;
GRANT EXECUTE ON FUNCTION update_order_status TO anon;

-- ================================================
-- VERIFICATION: Test the function
-- ================================================
-- To test, run:
-- SELECT * FROM update_order_status('your-sale-id-here', 'delivered');
