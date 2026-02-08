import { useEffect, useState } from 'react';
import { onRealtimeChange } from '../services/realtimeService';

/**
 * Hook to subscribe to realtime changes in a specific table
 * @param table Table name (sales, products, etc)
 */
export function useRealtime<T>(table: string): T | null {
    const [lastEvent, setLastEvent] = useState<T | null>(null);

    useEffect(() => {
        const unsubscribe = onRealtimeChange(table, (payload) => {
            setLastEvent(payload);
        });
        return () => unsubscribe();
    }, [table]);

    return lastEvent;
}
