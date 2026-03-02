import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface FolioDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folio: any;
  tiposAnestesiaLabels: Record<string, string>;
  insumos: any[];
}

const FolioDetailDialog = ({ open, onOpenChange, folio, tiposAnestesiaLabels, insumos }: FolioDetailDialogProps) => {
  if (!folio) return null;

  const tipoCirugiaLabels: Record<string, string> = {
    abierta: 'Abierta',
    minima_invasion: 'Mínima Invasión',
  };

  const tipoEventoLabels: Record<string, string> = {
    programado: 'Programado',
    urgencia: 'Urgencia',
  };

  const generoLabels: Record<string, string> = {
    M: 'Masculino',
    F: 'Femenino',
    Otro: 'Otro',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Detalle del Folio {folio.numero_folio}
            <Badge variant={folio.estado === 'activo' ? 'default' : 'destructive'}>
              {folio.estado === 'activo' ? 'Activo' : 'Cancelado'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Información General */}
          <div>
            <h3 className="font-semibold mb-3 text-primary">Información General</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Folio:</span>
                <span className="font-medium">{folio.numero_folio}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Unidad:</span>
                <span>{folio.unidad}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Fecha:</span>
                <span>{new Date(folio.created_at).toLocaleDateString('es-MX')}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">No. Quirófano:</span>
                <span>{folio.numero_quirofano}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Horarios */}
          <div>
            <h3 className="font-semibold mb-3 text-primary">Horarios</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Inicio Procedimiento:</span>
                <span>{folio.hora_inicio_procedimiento}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Fin Procedimiento:</span>
                <span>{folio.hora_fin_procedimiento}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Inicio Anestesia:</span>
                <span>{folio.hora_inicio_anestesia}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Fin Anestesia:</span>
                <span>{folio.hora_fin_anestesia}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Datos del Paciente */}
          <div>
            <h3 className="font-semibold mb-3 text-primary">Datos del Paciente</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Apellido Paterno:</span>
                <span className="font-medium">{folio.paciente_apellido_paterno}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Apellido Materno:</span>
                <span className="font-medium">{folio.paciente_apellido_materno}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Nombre(s):</span>
                <span className="font-medium">{folio.paciente_nombre?.split(' ').slice(0, -2).join(' ')}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">NSS:</span>
                <span>{folio.paciente_nss}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Edad:</span>
                <span>{folio.paciente_edad} años</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Género:</span>
                <span>{generoLabels[folio.paciente_genero] || folio.paciente_genero}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Información del Procedimiento */}
          <div>
            <h3 className="font-semibold mb-3 text-primary">Información del Procedimiento</h3>
            <div className="grid gap-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Procedimiento Quirúrgico:</span>
                <span className="col-span-2 font-medium">{folio.cirugia}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Especialidad Quirúrgica:</span>
                <span className="col-span-2">{folio.especialidad_quirurgica}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Tipo de Cirugía:</span>
                <span className="col-span-2">{tipoCirugiaLabels[folio.tipo_cirugia] || folio.tipo_cirugia}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Tipo de Evento:</span>
                <span className="col-span-2">{tipoEventoLabels[folio.tipo_evento] || folio.tipo_evento}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Tipo de Anestesia:</span>
                <span className="col-span-2">{tiposAnestesiaLabels[folio.tipo_anestesia] || folio.tipo_anestesia}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Personal Médico */}
          <div>
            <h3 className="font-semibold mb-3 text-primary">Personal Médico</h3>
            <div className="grid gap-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Cirujano:</span>
                <span className="col-span-2 font-medium">{folio.cirujano_nombre || 'No especificado'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Anestesiólogo:</span>
                <span className="col-span-2 font-medium">{folio.anestesiologo_nombre || 'No especificado'}</span>
              </div>
            </div>
          </div>

          {insumos && insumos.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-3 text-primary">Bienes de Consumo y Medicamentos</h3>
                <div className="space-y-2">
                  {insumos.map((item: any, idx: number) => (
                    <div key={idx} className="rounded-lg border bg-muted/50 p-3 text-sm">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <span className="font-medium">{item.insumos?.nombre || 'Sin nombre'}</span>
                          {item.insumos?.clave && (
                            <span className="ml-2 text-xs text-muted-foreground">({item.insumos.clave})</span>
                          )}
                          {item.insumos?.descripcion && (
                            <div className="text-muted-foreground text-xs mt-1">{item.insumos.descripcion}</div>
                          )}
                          <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                            {item.insumos?.presentacion && (
                              <span>Presentación: {item.insumos.presentacion}</span>
                            )}
                            {item.insumos?.tipo && (
                              <span>Tipo: {item.insumos.tipo}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-primary font-semibold whitespace-nowrap ml-4">
                          Cantidad: {item.cantidad}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FolioDetailDialog;
