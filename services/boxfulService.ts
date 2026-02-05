
import { db } from './storageService';
import { Sale, ShippingDetails } from '../types';

export class BoxfulService {
    private static API_URL = 'https://api.boxful.link/v1'; // Standard endpoint for Boxful Connect
    private static SANDBOX_URL = 'https://sandbox.boxful.link/v1';

    /**
     * Create a shipment in Boxful and return tracking + guide URL
     */
    static async createShipment(order: Sale, customerPhone: string): Promise<{ trackingNumber: string; guideUrl: string }> {
        const settings = await db.getSettings();
        if (!settings.boxfulApiKey) {
            throw new Error("API Key de Boxful no configurada. Ve a Ajustes.");
        }

        const isSandbox = settings.boxfulSandbox;
        const baseUrl = isSandbox ? this.SANDBOX_URL : this.API_URL;

        // Mocking the request structure based on typical logistics APIs
        const payload = {
            order_id: order.folio,
            customer_name: order.customerName || 'Consumidor Final',
            customer_phone: customerPhone,
            customer_address: order.shippingDetails?.address || '',
            items: (order.items || []).map(i => ({
                name: i.name,
                quantity: i.quantity,
                price: i.price
            })),
            total_amount: order.total
        };

        console.log("🚚 Boxful Request:", payload);

        try {
            // PROXIMAMENTE: Implementación real del fetch
            // const response = await fetch(`${baseUrl}/shipments`, {
            //     method: 'POST',
            //     headers: {
            //         'Authorization': `Bearer ${settings.boxfulApiKey}`,
            //         'Content-Type': 'application/json'
            //     },
            //     body: JSON.stringify(payload)
            // });
            // if (!response.ok) throw new Error("Error en API de Boxful");
            // const data = await response.json();
            // return { trackingNumber: data.tracking_number, guideUrl: data.label_url };

            // Por ahora regresamos un Mock para que el usuario vea cómo funciona el flujo
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve({
                        trackingNumber: `BF-${Math.floor(Math.random() * 90000) + 10000}`,
                        guideUrl: `https://boxful.link/guides/example-${order.folio}.pdf`
                    });
                }, 1500);
            });
        } catch (error) {
            console.error("❌ Boxful Error:", error);
            throw error;
        }
    }
}
