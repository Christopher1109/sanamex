import { Check, Clock, Send, DollarSign, Package, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimelineStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  completed: boolean;
  current: boolean;
}

interface StatusTimelineProps {
  currentStatus: string;
  tipo: 'segmentado' | 'agrupado' | 'pedido';
}

export const StatusTimeline = ({ currentStatus, tipo }: StatusTimelineProps) => {
  const getSteps = (): TimelineStep[] => {
    if (tipo === 'segmentado') {
      const statuses = ['generado', 'enviado', 'procesado'];
      const currentIndex = statuses.indexOf(currentStatus);
      
      return [
        {
          id: 'generado',
          label: 'Generado',
          icon: <Clock className="h-3 w-3" />,
          completed: currentIndex > 0,
          current: currentIndex === 0,
        },
        {
          id: 'enviado',
          label: 'Enviado a Cadena',
          icon: <Send className="h-3 w-3" />,
          completed: currentIndex > 1,
          current: currentIndex === 1,
        },
        {
          id: 'procesado',
          label: 'Procesado',
          icon: <Check className="h-3 w-3" />,
          completed: currentIndex >= 2,
          current: currentIndex === 2,
        },
      ];
    }

    if (tipo === 'agrupado') {
      const statuses = ['generado', 'enviado', 'procesado'];
      const currentIndex = statuses.indexOf(currentStatus);
      
      return [
        {
          id: 'generado',
          label: 'Generado',
          icon: <Clock className="h-3 w-3" />,
          completed: currentIndex > 0,
          current: currentIndex === 0,
        },
        {
          id: 'enviado',
          label: 'Enviado a Almacén',
          icon: <Send className="h-3 w-3" />,
          completed: currentIndex > 1,
          current: currentIndex === 1,
        },
        {
          id: 'procesado',
          label: 'Procesado',
          icon: <Check className="h-3 w-3" />,
          completed: currentIndex >= 2,
          current: currentIndex === 2,
        },
      ];
    }

    // Pedido de compra
    const statusMap: Record<string, number> = {
      'pendiente': 0,
      'enviado_a_finanzas': 1,
      'pagado_espera_confirmacion': 2,
      'pagado_enviado_cadena': 3,
      'recibido': 4,
      'completado': 5,
    };
    const currentIndex = statusMap[currentStatus] ?? 0;

    return [
      {
        id: 'pendiente',
        label: 'Pendiente',
        icon: <Clock className="h-3 w-3" />,
        completed: currentIndex > 0,
        current: currentIndex === 0,
      },
      {
        id: 'finanzas',
        label: 'En Finanzas',
        icon: <DollarSign className="h-3 w-3" />,
        completed: currentIndex > 1,
        current: currentIndex === 1,
      },
      {
        id: 'pagado',
        label: 'Pagado',
        icon: <Check className="h-3 w-3" />,
        completed: currentIndex > 2,
        current: currentIndex === 2,
      },
      {
        id: 'cadena',
        label: 'En Cadena',
        icon: <Truck className="h-3 w-3" />,
        completed: currentIndex > 3,
        current: currentIndex === 3,
      },
      {
        id: 'recibido',
        label: 'Recibido',
        icon: <Package className="h-3 w-3" />,
        completed: currentIndex >= 4,
        current: currentIndex === 4,
      },
    ];
  };

  const steps = getSteps();

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div
            className={cn(
              'flex items-center justify-center w-5 h-5 rounded-full text-xs transition-colors',
              step.completed && 'bg-green-500 text-white',
              step.current && 'bg-primary text-primary-foreground ring-2 ring-primary/30',
              !step.completed && !step.current && 'bg-muted text-muted-foreground'
            )}
            title={step.label}
          >
            {step.icon}
          </div>
          {index < steps.length - 1 && (
            <div
              className={cn(
                'w-4 h-0.5 mx-0.5',
                step.completed ? 'bg-green-500' : 'bg-muted'
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export const StatusBadge = ({ status, enviado }: { status: string; enviado?: boolean }) => {
  const getStatusConfig = () => {
    if (enviado) {
      return {
        label: 'Enviado',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      };
    }

    const configs: Record<string, { label: string; className: string }> = {
      'generado': {
        label: 'Generado',
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
      },
      'enviado': {
        label: 'Enviado',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      },
      'pendiente': {
        label: 'Pendiente',
        className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      },
      'enviado_a_finanzas': {
        label: 'En Finanzas',
        className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      },
      'pagado_espera_confirmacion': {
        label: 'Pagado - Esperando',
        className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      },
      'pagado_enviado_cadena': {
        label: 'Pagado - En Cadena',
        className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
      },
      'recibido': {
        label: 'Recibido',
        className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
      },
      'procesado': {
        label: 'Procesado',
        className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      },
      'completado': {
        label: 'Completado',
        className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      },
    };

    return configs[status] || {
      label: status,
      className: 'bg-gray-100 text-gray-800',
    };
  };

  const config = getStatusConfig();

  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', config.className)}>
      {config.label}
    </span>
  );
};
