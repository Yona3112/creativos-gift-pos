
import { CompanySettings } from '../types';

export class GeminiService {
    private static API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

    static async generateDedication(occasion: string, recipient: string, sender: string, tone: 'emotional' | 'funny' | 'formal' | 'short', settings: CompanySettings): Promise<string> {
        const apiKey = settings.geminiApiKey;
        if (!apiKey) {
            throw new Error('API Key de Gemini no configurada');
        }

        const prompt = `Actúa como un redactor experto en tarjetas de regalo para la tienda "Creativos Gift". 
    Genera una dedicatoria para una tarjeta de regalo con las siguientes características:
    - Ocasión: ${occasion}
    - Para: ${recipient}
    - De: ${sender}
    - Tono: ${tone === 'emotional' ? 'Muy emotivo y profundo' : tone === 'funny' ? 'Divertido y ocurrente' : tone === 'formal' ? 'Respetuoso y elegante' : 'Corto y directo'}
    - Idioma: Español
    - Restricciones: Máximo 300 caracteres. No incluyas hashtags. Solo el texto de la dedicatoria.
    `;

        try {
            const response = await fetch(`${this.API_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }]
                })
            });

            const data = await response.json();
            if (data.error) {
                throw new Error(data.error.message || 'Error en la API de Gemini');
            }

            return data.candidates[0].content.parts[0].text.trim();
        } catch (error: any) {
            console.error('Error generating dedication:', error);
            throw error;
        }
    }

    static async analyzeBusiness(salesData: any[], settings: CompanySettings): Promise<string> {
        const apiKey = settings.geminiApiKey;
        if (!apiKey) return "API Key no configurada";

        const prompt = `Analiza los siguientes datos de ventas de mi negocio "Creativos Gift" y brinda 3 consejos estratégicos para aumentar las ventas o mejorar la eficiencia. 
    Sé breve y directo. 
    Datos: ${JSON.stringify(salesData.slice(0, 50))}
    `;

        try {
            const response = await fetch(`${this.API_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }]
                })
            });

            const data = await response.json();
            return data.candidates[0].content.parts[0].text.trim();
        } catch (error) {
            return "Error al analizar datos";
        }
    }

    static async generateCampaignMessage(type: 'promo' | 'loyalty' | 'recovery', settings: CompanySettings): Promise<string> {
        const apiKey = settings.geminiApiKey;
        if (!apiKey) throw new Error("API Key de Gemini no configurada");

        const prompt = `Actúa como un experto en Marketing para "Creativos Gift" (tienda de detalles y personalizados).
      Genera un mensaje corto para WhatsApp para una campaña de tipo: ${type === 'promo' ? 'Promoción de Temporada' : type === 'loyalty' ? 'Agradecimiento a Clientes VIP' : 'Recuperación de clientes inactivos'}.
      El mensaje debe ser cercano, profesional y usar emojis. Máximo 400 caracteres. No incluyas nombres específicos, usa un marcador [Nombre].
      El tono debe ser amigable y persuasivo.`;

        try {
            const response = await fetch(`${this.API_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            return data.candidates[0].content.parts[0].text.trim();
        } catch (error: any) {
            console.error('Error generating campaign:', error);
            throw error;
        }
    }
}
