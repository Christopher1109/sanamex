import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { useHospital } from '@/contexts/HospitalContext';
import { InsumoCombobox } from './InsumoCombobox';
import { supabase } from '@/integrations/supabase/client';

const traspasoSchema = z.object({
  hospitalDestino: z.string().min(1, 'El hospital de destino es requerido'),
  stateNameDestino: z.string().min(1),
  hospitalDisplayNameDestino: z.string().min(1),
  insumos: z.array(z.object({
    id: z.string().min(1, 'Debe seleccionar un insumo'),
    nombre: z.string().min(1),
    cantidad: z.number().min(1, 'La cantidad debe ser mayor a 0'),
  })).min(1, 'Debe agregar al menos un insumo'),
});

type TraspasoFormData = z.infer<typeof traspasoSchema>;

interface TraspasoFormProps {
  onClose: () => void;
  onSubmit: (data: TraspasoFormData) => void;
}

const TraspasoForm = ({ onClose, onSubmit }: TraspasoFormProps) => {
  const { selectedHospital, availableHospitals } = useHospital();
  const [insumosDisponibles, setInsumosDisponibles] = useState<any[]>([]);
  
  const form = useForm<TraspasoFormData>({
    resolver: zodResolver(traspasoSchema),
    defaultValues: {
      hospitalDestino: '',
      stateNameDestino: '',
      hospitalDisplayNameDestino: '',
      insumos: [{ id: '', nombre: '', cantidad: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'insumos',
  });

  useEffect(() => {
    const loadInsumos = async () => {
      if (!selectedHospital?.budget_code) return;
      const { data } = await (supabase as any).from('insumos').select('*').eq('hospital_budget_code', selectedHospital.budget_code).gt('cantidad', 0);
      setInsumosDisponibles(data || []);
    };
    loadInsumos();
  }, [selectedHospital]);

  const handleSubmit = (data: TraspasoFormData) => {
    if (!selectedHospital) {
      toast.error('Error', {
        description: 'Debes seleccionar un hospital de origen',
      });
      return;
    }
    
    if (data.hospitalDestino === selectedHospital.budget_code) {
      toast.error('Error', {
        description: 'El hospital de origen y destino no pueden ser los mismos',
      });
      return;
    }
    onSubmit(data);
    toast.success('Traspaso solicitado exitosamente');
    onClose();
  };

  const handleHospitalDestinoChange = (budgetCode: string) => {
    const hospital = availableHospitals.find(h => h.budget_code === budgetCode);
    if (hospital) {
      form.setValue('hospitalDestino', hospital.budget_code);
      form.setValue('stateNameDestino', hospital.state_name);
      form.setValue('hospitalDisplayNameDestino', hospital.display_name);
    }
  };

  if (!selectedHospital) {
    return (
      <div className="space-y-6">
        <DialogHeader>
          <DialogTitle>Solicitar Nuevo Traspaso</DialogTitle>
        </DialogHeader>
        <div className="text-center text-muted-foreground py-8">
          Debes seleccionar un hospital para continuar
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DialogHeader>
        <DialogTitle>Solicitar Nuevo Traspaso</DialogTitle>
      </DialogHeader>

      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="hospitalOrigen">Hospital de Origen</Label>
            <Input
              id="hospitalOrigen"
              value={selectedHospital.display_name}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              {selectedHospital.state_name} - {selectedHospital.budget_code}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hospitalDestino">Hospital de Destino</Label>
            <Select
              onValueChange={handleHospitalDestinoChange}
              defaultValue={form.getValues('hospitalDestino')}
            >
              <SelectTrigger id="hospitalDestino">
                <SelectValue placeholder="Seleccionar hospital" />
              </SelectTrigger>
              <SelectContent>
                {availableHospitals
                  .filter(h => h.budget_code !== selectedHospital.budget_code)
                  .map((hospital) => (
                    <SelectItem key={hospital.budget_code} value={hospital.budget_code}>
                      {hospital.display_name} - {hospital.state_name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {form.formState.errors.hospitalDestino && (
              <p className="text-sm text-destructive">{form.formState.errors.hospitalDestino.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Insumos a Traspasar</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ id: '', nombre: '', cantidad: 1 })}
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar Insumo
            </Button>
          </div>

          {fields.map((field, index) => (
            <div key={field.id} className="flex gap-2 items-start">
              <div className="flex-1 space-y-2">
                <InsumoCombobox
                  value={form.watch(`insumos.${index}.id`)}
                  insumosDisponibles={insumosDisponibles}
                  onSelect={(insumo) => {
                    if (insumo) {
                      form.setValue(`insumos.${index}.id`, insumo.id);
                      form.setValue(`insumos.${index}.nombre`, insumo.nombre);
                    } else {
                      form.setValue(`insumos.${index}.id`, '');
                      form.setValue(`insumos.${index}.nombre`, '');
                    }
                  }}
                  placeholder="Seleccionar insumo"
                />
                {form.formState.errors.insumos?.[index]?.id && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.insumos[index]?.id?.message}
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
            Solicitar Traspaso
          </Button>
        </div>
      </form>
    </div>
  );
};

export default TraspasoForm;
