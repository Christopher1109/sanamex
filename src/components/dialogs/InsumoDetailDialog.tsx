import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertCircle } from 'lucide-react';

interface InsumoDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  insumo: any;
}

const InsumoDetailDialog = ({ open, onOpenChange, insumo }: InsumoDetailDialogProps) => {
  if (!insumo) return null;

  const stockStatus = (() => {
    if (insumo.cantidad <= insumo.stockMinimo / 2) return { variant: 'destructive' as const, label: 'Crítico' };
    if (insumo.cantidad <= insumo.stockMinimo) return { variant: 'default' as const, label: 'Bajo' };
    return { variant: 'default' as const, label: 'Normal' };
  })();

  const caducidadProxima = (() => {
    const diff = new Date(insumo.fechaCaducidad).getTime() - new Date().getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    return days <= 60;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Detalle del Insumo
            <Badge variant={stockStatus.variant}>{stockStatus.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <h3 className="font-semibold mb-3">{insumo.nombre}</h3>
            <div className="grid gap-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Lote:</span>
                <span className="col-span-2 font-medium">{insumo.lote}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Cantidad Disponible:</span>
                <span className="col-span-2 font-medium">{insumo.cantidad} unidades</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Stock Mínimo:</span>
                <span className="col-span-2">{insumo.stockMinimo} unidades</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Fecha de Caducidad:</span>
                <span className={`col-span-2 ${caducidadProxima ? 'text-destructive font-medium' : ''}`}>
                  {insumo.fechaCaducidad}
                  {caducidadProxima && ' ⚠️'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Origen:</span>
                <span className="col-span-2">
                  <Badge variant={insumo.origen === 'LOAD' ? 'default' : 'secondary'}>
                    {insumo.origen}
                  </Badge>
                </span>
              </div>
            </div>
          </div>

          {caducidadProxima && (
            <>
              <Separator />
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <div>
                  <p className="font-medium">Próximo a caducar</p>
                  <p className="text-sm">Este insumo caducará en los próximos 60 días</p>
                </div>
              </div>
            </>
          )}

          {insumo.cantidad <= insumo.stockMinimo && (
            <>
              <Separator />
              <div className="flex items-center gap-2 rounded-lg bg-warning/10 p-3 text-warning">
                <AlertCircle className="h-5 w-5" />
                <div>
                  <p className="font-medium">Stock bajo</p>
                  <p className="text-sm">Se recomienda reabastecer este insumo pronto</p>
                </div>
              </div>
            </>
          )}

          <Separator />

          <div>
            <h3 className="font-semibold mb-3">Historial de Movimientos (Últimos 5)</h3>
            <div className="space-y-2">
              {[
                { fecha: '2024-11-07', tipo: 'Salida', cantidad: 2, motivo: 'Folio F-2024-001' },
                { fecha: '2024-11-06', tipo: 'Entrada', cantidad: 20, motivo: 'Reabastecimiento LOAD' },
                { fecha: '2024-11-05', tipo: 'Salida', cantidad: 3, motivo: 'Folio F-2024-045' },
                { fecha: '2024-11-04', tipo: 'Salida', cantidad: 1, motivo: 'Folio F-2024-038' },
                { fecha: '2024-11-03', tipo: 'Entrada', cantidad: 15, motivo: 'Traspaso desde Unidad Norte' },
              ].map((movimiento, idx) => (
                <div key={idx} className="rounded-lg border p-3 text-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={movimiento.tipo === 'Entrada' ? 'default' : 'secondary'}>
                          {movimiento.tipo}
                        </Badge>
                        <span className="text-muted-foreground">{movimiento.fecha}</span>
                      </div>
                      <p className="mt-1">{movimiento.motivo}</p>
                    </div>
                    <span className="font-medium">
                      {movimiento.tipo === 'Entrada' ? '+' : '-'}{movimiento.cantidad}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InsumoDetailDialog;
