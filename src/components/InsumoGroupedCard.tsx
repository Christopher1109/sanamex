import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Calendar, Package } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface LoteInfo {
  id: string;
  lote: string;
  cantidad_actual: number;
  fecha_caducidad: string | null;
  ubicacion: string;
}

interface InsumoGroupedCardProps {
  nombre: string;
  clave: string | null;
  tipo: string;
  stockTotal: number;
  lotes: LoteInfo[];
  onSelectLote?: (lote: LoteInfo) => void;
}

export function InsumoGroupedCard({ 
  nombre, 
  clave, 
  tipo, 
  stockTotal, 
  lotes,
  onSelectLote 
}: InsumoGroupedCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getStockStatus = (cantidad: number) => {
    if (cantidad === 0) return { variant: 'destructive' as const, label: 'Agotado' };
    if (cantidad <= 5) return { variant: 'destructive' as const, label: 'Crítico' };
    if (cantidad <= 10) return { variant: 'default' as const, label: 'Bajo' };
    return { variant: 'default' as const, label: 'Normal' };
  };

  const status = getStockStatus(stockTotal);
  const proximosVencer = lotes.filter(l => {
    if (!l.fecha_caducidad) return false;
    const diff = new Date(l.fecha_caducidad).getTime() - new Date().getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    return days <= 60 && days >= 0;
  });

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        {/* Vista compacta */}
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex-1 min-w-0 mr-3">
            <h3 className="font-medium text-sm leading-tight line-clamp-2">
              {nombre}
            </h3>
            {clave && (
              <p className="text-xs text-muted-foreground mt-0.5">{clave}</p>
            )}
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <p className="text-xl font-bold">{stockTotal}</p>
              <p className="text-xs text-muted-foreground">unidades</p>
            </div>
            <Badge variant={status.variant} className="text-xs">
              {status.label}
            </Badge>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Vista expandida */}
        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Tipo: <Badge variant="outline" className="ml-1">{tipo || 'insumo'}</Badge></span>
              <span>{lotes.length} lote{lotes.length !== 1 ? 's' : ''}</span>
            </div>

            {proximosVencer.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-destructive">
                <Calendar className="h-3 w-3" />
                <span>{proximosVencer.length} lote{proximosVencer.length !== 1 ? 's' : ''} próximo{proximosVencer.length !== 1 ? 's' : ''} a vencer</span>
              </div>
            )}

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {lotes.map((lote) => {
                const isProximoVencer = lote.fecha_caducidad && 
                  (new Date(lote.fecha_caducidad).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24) <= 60;
                
                return (
                  <div 
                    key={lote.id}
                    className={`p-2 rounded-md border text-xs ${
                      isProximoVencer ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-muted/30'
                    } ${onSelectLote ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectLote?.(lote);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{lote.lote || 'Sin lote'}</span>
                      </div>
                      <span className="font-bold">{lote.cantidad_actual} uds</span>
                    </div>
                    {lote.fecha_caducidad && (
                      <div className="flex items-center gap-1 mt-1 text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>Vence: {format(new Date(lote.fecha_caducidad), 'dd/MM/yyyy', { locale: es })}</span>
                        {isProximoVencer && (
                          <Badge variant="destructive" className="text-[10px] h-4 ml-1">Próximo</Badge>
                        )}
                      </div>
                    )}
                    {lote.ubicacion && (
                      <p className="text-muted-foreground mt-1">📍 {lote.ubicacion}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}