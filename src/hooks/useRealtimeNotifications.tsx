import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UseRealtimeNotificationsProps {
  userRole: string;
  onDocumentoSegmentado?: () => void;
  onDocumentoAgrupado?: () => void;
  onPedidoActualizado?: () => void;
  onTransferenciaCreada?: () => void;
  onAlertaTransferencia?: () => void;
}

export const useRealtimeNotifications = ({
  userRole,
  onDocumentoSegmentado,
  onDocumentoAgrupado,
  onPedidoActualizado,
  onTransferenciaCreada,
  onAlertaTransferencia,
}: UseRealtimeNotificationsProps) => {
  useEffect(() => {
    const channels: ReturnType<typeof supabase.channel>[] = [];

    // Cadena de Suministros - recibe documentos segmentados
    if (userRole === 'cadena_suministros') {
      const segmentadoChannel = supabase
        .channel('documentos-segmentado-changes')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'documentos_necesidades_segmentado',
          },
          (payload) => {
            if (payload.new.enviado_a_cadena_suministros && !payload.old.enviado_a_cadena_suministros) {
              toast.info('📦 Nuevo documento de necesidades recibido', {
                description: 'El Gerente de Operaciones ha enviado un documento segmentado.',
                duration: 5000,
              });
              onDocumentoSegmentado?.();
            }
          }
        )
        .subscribe();
      channels.push(segmentadoChannel);

      // También escuchar pedidos pagados que se envían a cadena
      const pedidosCadenaChannel = supabase
        .channel('pedidos-cadena-changes')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'pedidos_compra',
          },
          (payload) => {
            if (payload.new.estado === 'pagado_enviado_cadena' && payload.old.estado !== 'pagado_enviado_cadena') {
              toast.success('💰 Orden de compra pagada recibida', {
                description: `Pedido ${payload.new.numero_pedido} listo para recibir insumos.`,
                duration: 5000,
              });
              onPedidoActualizado?.();
            }
          }
        )
        .subscribe();
      channels.push(pedidosCadenaChannel);
    }

    // Gerente de Almacén - recibe documentos agrupados
    if (userRole === 'gerente_almacen') {
      const agrupadoChannel = supabase
        .channel('documentos-agrupado-changes')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'documentos_necesidades_agrupado',
          },
          (payload) => {
            if (payload.new.enviado_a_gerente_almacen && !payload.old.enviado_a_gerente_almacen) {
              toast.info('📋 Nuevo documento consolidado recibido', {
                description: 'El Gerente de Operaciones ha enviado un documento agrupado.',
                duration: 5000,
              });
              onDocumentoAgrupado?.();
            }
          }
        )
        .subscribe();
      channels.push(agrupadoChannel);

      // Escuchar cuando finanzas confirma pago
      const pedidosPagadosChannel = supabase
        .channel('pedidos-pagados-changes')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'pedidos_compra',
          },
          (payload) => {
            if (payload.new.estado === 'pagado_espera_confirmacion' && payload.old.estado !== 'pagado_espera_confirmacion') {
              toast.success('✅ Pago confirmado por Finanzas', {
                description: `Pedido ${payload.new.numero_pedido} pagado y enviado a Cadena de Suministros.`,
                duration: 5000,
              });
              onPedidoActualizado?.();
            }
          }
        )
        .subscribe();
      channels.push(pedidosPagadosChannel);
    }

    // Finanzas - recibe pedidos para aprobar
    if (userRole === 'finanzas') {
      const pedidosFinanzasChannel = supabase
        .channel('pedidos-finanzas-changes')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'pedidos_compra',
          },
          (payload) => {
            if (payload.new.estado === 'enviado_a_finanzas' && payload.old.estado !== 'enviado_a_finanzas') {
              toast.info('💳 Nueva orden de compra pendiente de pago', {
                description: `Pedido ${payload.new.numero_pedido} requiere aprobación.`,
                duration: 5000,
              });
              onPedidoActualizado?.();
            }
          }
        )
        .subscribe();
      channels.push(pedidosFinanzasChannel);
    }

    // Gerente de Operaciones y Gerente de Almacén - reciben actualizaciones de estado
    if (userRole === 'gerente_operaciones' || userRole === 'gerente_almacen') {
      const estadosChannel = supabase
        .channel('estados-operaciones-changes')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'pedidos_compra',
          },
          (payload) => {
            const estados: Record<string, string> = {
              'pagado_espera_confirmacion': '💰 Pago confirmado',
              'pagado_enviado_cadena': '📦 Enviado a Cadena de Suministros',
              'recibido': '✅ Insumos recibidos en almacén central',
            };
            const mensaje = estados[payload.new.estado];
            if (mensaje && payload.new.estado !== payload.old.estado) {
              toast.success(mensaje, {
                description: `Pedido ${payload.new.numero_pedido}`,
                duration: 5000,
              });
              onPedidoActualizado?.();
            }
          }
        )
        .subscribe();
      channels.push(estadosChannel);
    }

    // Almacenistas y Gerente de Almacén - reciben alertas de transferencia
    if (userRole === 'almacenista' || userRole === 'lider' || userRole === 'gerente_almacen') {
      const alertasChannel = supabase
        .channel('alertas-transferencia-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'alertas_transferencia',
          },
          (payload) => {
            toast.info('📦 Nuevo envío desde Almacén Central', {
              description: 'Tienes insumos pendientes de recibir.',
              duration: 5000,
            });
            onAlertaTransferencia?.();
          }
        )
        .subscribe();
      channels.push(alertasChannel);
    }

    return () => {
      channels.forEach(channel => {
        supabase.removeChannel(channel);
      });
    };
  }, [userRole, onDocumentoSegmentado, onDocumentoAgrupado, onPedidoActualizado, onTransferenciaCreada, onAlertaTransferencia]);
};
