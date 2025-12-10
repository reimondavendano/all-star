import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type TableName =
    | 'prospects'
    | 'subscriptions'
    | 'invoices'
    | 'payments'
    | 'expenses'
    | 'mikrotik_ppp_secrets'
    | 'business_units'
    | 'plans'
    | 'customers';

type EventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface UseRealtimeOptions {
    table: TableName;
    event?: EventType;
    filter?: string; // e.g., 'business_unit_id=eq.uuid-here'
    onInsert?: (payload: any) => void;
    onUpdate?: (payload: any) => void;
    onDelete?: (payload: any) => void;
    onAny?: (payload: RealtimePostgresChangesPayload<any>) => void;
}

/**
 * Hook to subscribe to real-time changes on a Supabase table
 * 
 * Usage:
 * ```tsx
 * useRealtimeSubscription({
 *   table: 'invoices',
 *   onAny: () => fetchData() // Refetch data on any change
 * });
 * ```
 */
export function useRealtimeSubscription(options: UseRealtimeOptions) {
    const { table, event = '*', filter, onInsert, onUpdate, onDelete, onAny } = options;
    const channelRef = useRef<RealtimeChannel | null>(null);

    useEffect(() => {
        // Create a unique channel name
        const channelName = `realtime-${table}-${Date.now()}`;

        // Build the subscription config
        const subscriptionConfig: any = {
            event,
            schema: 'public',
            table,
        };

        if (filter) {
            subscriptionConfig.filter = filter;
        }

        // Create channel and subscribe
        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                subscriptionConfig,
                (payload: RealtimePostgresChangesPayload<any>) => {
                    console.log(`[Realtime] ${table} - ${payload.eventType}:`, payload);

                    // Call specific handlers
                    if (payload.eventType === 'INSERT' && onInsert) {
                        onInsert(payload.new);
                    } else if (payload.eventType === 'UPDATE' && onUpdate) {
                        onUpdate(payload.new);
                    } else if (payload.eventType === 'DELETE' && onDelete) {
                        onDelete(payload.old);
                    }

                    // Call the general handler
                    if (onAny) {
                        onAny(payload);
                    }
                }
            )
            .subscribe((status) => {
                console.log(`[Realtime] ${table} subscription status:`, status);
            });

        channelRef.current = channel;

        // Cleanup on unmount
        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [table, event, filter]); // Re-subscribe if these change

    return channelRef.current;
}

/**
 * Hook to subscribe to multiple tables at once
 */
export function useMultipleRealtimeSubscriptions(
    tables: TableName[],
    onAnyChange: (table: TableName, payload: RealtimePostgresChangesPayload<any>) => void
) {
    const channelsRef = useRef<RealtimeChannel[]>([]);

    useEffect(() => {
        // Create subscriptions for each table
        const channels = tables.map((table) => {
            const channelName = `realtime-multi-${table}-${Date.now()}`;

            return supabase
                .channel(channelName)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table },
                    (payload: RealtimePostgresChangesPayload<any>) => {
                        console.log(`[Realtime Multi] ${table} - ${payload.eventType}`);
                        onAnyChange(table, payload);
                    }
                )
                .subscribe();
        });

        channelsRef.current = channels;

        // Cleanup
        return () => {
            channelsRef.current.forEach((channel) => {
                supabase.removeChannel(channel);
            });
            channelsRef.current = [];
        };
    }, [tables.join(',')]); // Re-subscribe if tables change

    return channelsRef.current;
}
