
import { db } from './storageService';
import { Product, CreditAccount, CompanySettings } from '../types';

export interface SystemNotification {
    id: string;
    type: 'warning' | 'danger' | 'info' | 'success';
    category: 'billing' | 'stock' | 'credit' | 'system';
    title: string;
    message: string;
    icon: string;
    action?: {
        label: string;
        page: string;
    };
    createdAt: string;
}

export class NotificationService {

    /**
     * Get all system notifications based on current data state
     */
    static async getAllNotifications(): Promise<SystemNotification[]> {
        const notifications: SystemNotification[] = [];
        const settings = await db.getSettings();
        const products = await db.getProducts();
        const credits = await db.getCredits();

        // 1. Billing Range Warnings
        const billingNotifs = this.checkBillingRange(settings);
        notifications.push(...billingNotifs);

        // 2. Low Stock Alerts
        const stockNotifs = this.checkLowStock(products);
        notifications.push(...stockNotifs);

        // 3. Overdue Credit Alerts
        const creditNotifs = this.checkOverdueCredits(credits, settings);
        notifications.push(...creditNotifs);

        return notifications.sort((a, b) => {
            // Sort by severity: danger > warning > info > success
            const severityOrder = { danger: 0, warning: 1, info: 2, success: 3 };
            return severityOrder[a.type] - severityOrder[b.type];
        });
    }

    /**
     * Check billing range expiry and invoice limits
     */
    static checkBillingRange(settings: CompanySettings): SystemNotification[] {
        const notifications: SystemNotification[] = [];

        if (!settings.billingDeadline || !settings.billingRangeEnd) return notifications;

        const today = db.getSystemNow();
        const deadline = new Date(settings.billingDeadline + 'T23:59:59');
        const daysToDeadline = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        // Check expiry date
        if (daysToDeadline <= 0) {
            notifications.push({
                id: 'billing-expired',
                type: 'danger',
                category: 'billing',
                title: 'Rango de Facturación Vencido',
                message: `El CAI expiró el ${settings.billingDeadline}. No puede emitir facturas.`,
                icon: 'exclamation-triangle',
                action: { label: 'Ir a Configuración', page: 'settings' },
                createdAt: new Date().toISOString()
            });
        } else if (daysToDeadline <= 30) {
            notifications.push({
                id: 'billing-expiring',
                type: 'warning',
                category: 'billing',
                title: 'Rango de Facturación por Vencer',
                message: `El CAI vence en ${daysToDeadline} días (${settings.billingDeadline}).`,
                icon: 'calendar-exclamation',
                action: { label: 'Ir a Configuración', page: 'settings' },
                createdAt: new Date().toISOString()
            });
        }

        // Check invoice numbers
        if (settings.billingRangeEnd && settings.currentInvoiceNumber) {
            const endParts = settings.billingRangeEnd.split('-');
            const maxNum = parseInt(endParts[3]);
            const remaining = maxNum - settings.currentInvoiceNumber;

            if (remaining <= 0) {
                notifications.push({
                    id: 'invoices-depleted',
                    type: 'danger',
                    category: 'billing',
                    title: 'Rango de Facturas Agotado',
                    message: 'No tiene más números de factura disponibles.',
                    icon: 'file-invoice',
                    action: { label: 'Ir a Configuración', page: 'settings' },
                    createdAt: new Date().toISOString()
                });
            } else if (remaining <= 100) {
                notifications.push({
                    id: 'invoices-low',
                    type: 'warning',
                    category: 'billing',
                    title: 'Facturas por Agotarse',
                    message: `Quedan solo ${remaining} números de factura disponibles.`,
                    icon: 'file-invoice',
                    action: { label: 'Ir a Configuración', page: 'settings' },
                    createdAt: new Date().toISOString()
                });
            }
        }

        return notifications;
    }

    /**
     * Check for products with low stock
     */
    static checkLowStock(products: Product[]): SystemNotification[] {
        const notifications: SystemNotification[] = [];

        const lowStockProducts = products.filter(p =>
            p.active !== false &&
            p.enableLowStockAlert !== false &&
            p.stock <= p.minStock
        );

        if (lowStockProducts.length > 0) {
            const criticalStock = lowStockProducts.filter(p => p.stock === 0);
            const warningStock = lowStockProducts.filter(p => p.stock > 0);

            if (criticalStock.length > 0) {
                notifications.push({
                    id: 'stock-critical',
                    type: 'danger',
                    category: 'stock',
                    title: 'Productos Agotados',
                    message: `${criticalStock.length} producto(s) sin stock: ${criticalStock.slice(0, 3).map(p => p.name).join(', ')}${criticalStock.length > 3 ? '...' : ''}`,
                    icon: 'box-open',
                    action: { label: 'Ver Productos', page: 'products' },
                    createdAt: new Date().toISOString()
                });
            }

            if (warningStock.length > 0) {
                notifications.push({
                    id: 'stock-low',
                    type: 'warning',
                    category: 'stock',
                    title: 'Stock Bajo',
                    message: `${warningStock.length} producto(s) con stock bajo: ${warningStock.slice(0, 3).map(p => p.name).join(', ')}${warningStock.length > 3 ? '...' : ''}`,
                    icon: 'warehouse',
                    action: { label: 'Ver Productos', page: 'products' },
                    createdAt: new Date().toISOString()
                });
            }
        }

        return notifications;
    }

    /**
     * Check for overdue credits and calculate mora
     */
    static checkOverdueCredits(credits: CreditAccount[], settings: CompanySettings): SystemNotification[] {
        const notifications: SystemNotification[] = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const pendingCredits = credits.filter(c => c.status === 'pending' || c.status === 'overdue');

        const overdueCredits = pendingCredits.filter(c => {
            const dueDate = new Date(c.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            return dueDate < today;
        });

        const alertDays = settings.creditDueDateAlertDays || 7;
        const upcomingCredits = pendingCredits.filter(c => {
            const dueDate = new Date(c.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            return diffDays > 0 && diffDays <= alertDays;
        });

        if (overdueCredits.length > 0) {
            const totalOverdue = overdueCredits.reduce((sum, c) => sum + (c.totalAmount - c.paidAmount), 0);
            notifications.push({
                id: 'credits-overdue',
                type: 'danger',
                category: 'credit',
                title: 'Créditos Vencidos',
                message: `${overdueCredits.length} crédito(s) vencido(s) por un total de L ${totalOverdue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                icon: 'user-clock',
                action: { label: 'Ver Créditos', page: 'credits' },
                createdAt: new Date().toISOString()
            });
        }

        if (upcomingCredits.length > 0) {
            notifications.push({
                id: 'credits-upcoming',
                type: 'info',
                category: 'credit',
                title: 'Créditos por Vencer',
                message: `${upcomingCredits.length} crédito(s) vencen en los próximos ${alertDays} días.`,
                icon: 'bell',
                action: { label: 'Ver Créditos', page: 'credits' },
                createdAt: new Date().toISOString()
            });
        }

        return notifications;
    }

    /**
     * Calculate mora (late fee) for an overdue credit
     * @param credit The credit account
     * @param moraRate Monthly mora rate (default 2%)
     * @returns Object with days overdue and mora amount
     */
    static calculateMora(credit: CreditAccount, moraRate: number = 2): { daysOverdue: number; moraAmount: number } {
        const today = db.getSystemNow();
        today.setHours(0, 0, 0, 0);
        const dueDate = db.getSystemDate(credit.dueDate);
        dueDate.setHours(0, 0, 0, 0);

        if (dueDate >= today || credit.status === 'paid') {
            return { daysOverdue: 0, moraAmount: 0 };
        }

        const daysOverdue = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const pendingAmount = credit.totalAmount - credit.paidAmount;

        // Calculate mora: (pending * moraRate% * daysOverdue / 30)
        const dailyRate = moraRate / 100 / 30;
        const moraAmount = pendingAmount * dailyRate * daysOverdue;

        return { daysOverdue, moraAmount };
    }

    /**
     * Get summary of accounts receivable
     */
    static async getAccountsReceivableSummary(): Promise<{
        totalPending: number;
        totalOverdue: number;
        overdueCount: number;
        customers: { customerId: string; pendingAmount: number; overdueAmount: number; moraAmount: number }[];
    }> {
        const credits = await db.getCredits();
        const pendingCredits = credits.filter(c => c.status === 'pending' || c.status === 'overdue');

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let totalPending = 0;
        let totalOverdue = 0;
        let overdueCount = 0;
        const customerMap = new Map<string, { pendingAmount: number; overdueAmount: number; moraAmount: number }>();

        for (const credit of pendingCredits) {
            const pending = credit.totalAmount - credit.paidAmount;
            totalPending += pending;

            const dueDate = new Date(credit.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            const isOverdue = dueDate < today;

            if (isOverdue) {
                overdueCount++;
                totalOverdue += pending;
            }

            const mora = this.calculateMora(credit);

            const existing = customerMap.get(credit.customerId) || { pendingAmount: 0, overdueAmount: 0, moraAmount: 0 };
            existing.pendingAmount += pending;
            if (isOverdue) existing.overdueAmount += pending;
            existing.moraAmount += mora.moraAmount;
            customerMap.set(credit.customerId, existing);
        }

        const customers = Array.from(customerMap.entries()).map(([customerId, data]) => ({
            customerId,
            ...data
        }));

        return { totalPending, totalOverdue, overdueCount, customers };
    }

    /**
     * Get reorder suggestions based on stock levels and sales velocity
     */
    static async getReorderSuggestions(): Promise<{
        productId: string;
        productName: string;
        code: string;
        currentStock: number;
        minStock: number;
        suggestedQty: number;
        urgency: 'critical' | 'low' | 'normal';
        avgDailySales: number;
        daysOfStock: number;
    }[]> {
        const products = await db.getProducts();
        const sales = await db.getSales();

        // Calculate sales velocity for last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentSales = sales.filter(s =>
            s.status === 'active' &&
            new Date(s.date) >= thirtyDaysAgo
        );

        // Calculate items sold per product
        const salesMap = new Map<string, number>();
        recentSales.forEach(sale => {
            (sale.items || []).forEach(item => {
                const current = salesMap.get(item.id) || 0;
                salesMap.set(item.id, current + item.quantity);
            });
        });

        const suggestions = products
            .filter(p => p.active !== false && p.stock <= p.minStock)
            .map(p => {
                const totalSold = salesMap.get(p.id) || 0;
                const avgDailySales = totalSold / 30;
                const daysOfStock = avgDailySales > 0 ? p.stock / avgDailySales : p.stock > 0 ? 999 : 0;

                // Suggest enough to cover 30 days + buffer to reach 2x minStock
                const targetStock = Math.max(p.minStock * 2, Math.ceil(avgDailySales * 30));
                const suggestedQty = Math.max(p.minStock - p.stock, targetStock - p.stock);

                let urgency: 'critical' | 'low' | 'normal' = 'normal';
                if (p.stock === 0) urgency = 'critical';
                else if (daysOfStock <= 7) urgency = 'low';

                return {
                    productId: p.id,
                    productName: p.name,
                    code: p.code,
                    currentStock: p.stock,
                    minStock: p.minStock,
                    suggestedQty,
                    urgency,
                    avgDailySales: Number(avgDailySales.toFixed(2)),
                    daysOfStock: Number(daysOfStock.toFixed(1))
                };
            })
            .sort((a, b) => {
                // Sort by urgency then by days of stock
                const urgencyOrder = { critical: 0, low: 1, normal: 2 };
                if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
                    return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
                }
                return a.daysOfStock - b.daysOfStock;
            });

        return suggestions;
    }
}
