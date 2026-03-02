import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const usePendingOrdersCount = (enabled: boolean) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const fetchCount = async () => {
      const { count: orderCount, error } = await supabase
        .from('pedidos_compra')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'enviado_a_finanzas');

      if (!error && orderCount !== null) {
        setCount(orderCount);
      }
    };

    fetchCount();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('pending-orders-count')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pedidos_compra'
        },
        () => {
          fetchCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  return count;
};
