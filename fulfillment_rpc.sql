-- FUNCIÓN RPC PARA ACTUALIZACIÓN ATÓMICA DE PEDIDOS
-- Esto permite cambiar etapas al instante sin Timeouts.

-- IMPORTANTE: Eliminar si ya existe para evitar errores de tipo de retorno
DROP FUNCTION IF EXISTS update_order_status(TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION update_order_status(
  p_sale_id TEXT,
  p_new_status TEXT,
  p_shipping_details JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_sale JSONB;
BEGIN
  -- Actualizar el registro
  UPDATE sales
  SET 
    "fulfillmentStatus" = p_new_status,
    "shippingDetails" = CASE 
      WHEN p_shipping_details IS NOT NULL THEN (COALESCE("shippingDetails", '{}'::jsonb) || p_shipping_details)
      ELSE "shippingDetails"
    END,
    "updatedAt" = NOW()
  WHERE id = p_sale_id
  RETURNING (
    SELECT to_jsonb(s) FROM (
      SELECT * FROM sales WHERE id = p_sale_id
    ) s
  ) INTO v_updated_sale;

  -- Verificar si se encontró el pedido
  IF v_updated_sale IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'message', 'Pedido no encontrado'
    );
  END IF;

  -- Retornar éxito y el objeto actualizado
  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Estado actualizado correctamente',
    'updated_sale', v_updated_sale
  );
END;
$$;

-- Otorgar permisos para que la app pueda llamar a la función
GRANT EXECUTE ON FUNCTION update_order_status(TEXT, TEXT, JSONB) TO anon, authenticated, service_role;
