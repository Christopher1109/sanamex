import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';

const paqueteSchema = z.object({
  tipo: z.string().min(1, 'El tipo es requerido'),
  descripcion: z.string().min(1, 'La descripción es requerida'),
  insumos: z.array(z.object({
    nombre: z.string().min(1, 'El nombre del insumo es requerido'),
    cantidad: z.number().min(1, 'La cantidad debe ser mayor a 0'),
  })).min(1, 'Debe agregar al menos un insumo'),
});

type PaqueteFormData = z.infer<typeof paqueteSchema>;

interface PaqueteFormProps {
  onClose: () => void;
  onSubmit: (data: PaqueteFormData) => void;
  paquete?: any;
}

const PaqueteForm = ({ onClose, onSubmit, paquete }: PaqueteFormProps) => {
  const form = useForm<PaqueteFormData>({
    resolver: zodResolver(paqueteSchema),
    defaultValues: paquete || {
      tipo: '',
      descripcion: '',
      insumos: [{ nombre: '', cantidad: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'insumos',
  });

  const handleSubmit = (data: PaqueteFormData) => {
    onSubmit(data);
    toast.success(paquete ? 'Paquete actualizado' : 'Paquete creado exitosamente');
    onClose();
  };

  return (
    <div className="space-y-6">
      <DialogHeader>
        <DialogTitle>{paquete ? 'Editar Paquete' : 'Crear Nuevo Paquete'}</DialogTitle>
      </DialogHeader>

      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="tipo">Tipo de Anestesia</Label>
          <Input
            id="tipo"
            placeholder="Anestesia General Balanceada..."
            {...form.register('tipo')}
          />
          {form.formState.errors.tipo && (
            <p className="text-sm text-destructive">{form.formState.errors.tipo.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="descripcion">Descripción</Label>
          <Textarea
            id="descripcion"
            placeholder="Descripción del paquete..."
            {...form.register('descripcion')}
          />
          {form.formState.errors.descripcion && (
            <p className="text-sm text-destructive">{form.formState.errors.descripcion.message}</p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Insumos del Paquete</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ nombre: '', cantidad: 1 })}
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar Insumo
            </Button>
          </div>

          {fields.map((field, index) => (
            <div key={field.id} className="flex gap-2 items-start">
              <div className="flex-1 space-y-2">
                <Input
                  placeholder="Nombre del insumo"
                  {...form.register(`insumos.${index}.nombre`)}
                />
                {form.formState.errors.insumos?.[index]?.nombre && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.insumos[index]?.nombre?.message}
                  </p>
                )}
              </div>
              <div className="w-24 space-y-2">
                <Input
                  type="number"
                  placeholder="Cant"
                  {...form.register(`insumos.${index}.cantidad`, { valueAsNumber: true })}
                />
                {form.formState.errors.insumos?.[index]?.cantidad && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.insumos[index]?.cantidad?.message}
                  </p>
                )}
              </div>
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={() => remove(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {form.formState.errors.insumos && (
            <p className="text-sm text-destructive">{form.formState.errors.insumos.message}</p>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" className="flex-1">
            {paquete ? 'Actualizar' : 'Crear Paquete'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default PaqueteForm;
