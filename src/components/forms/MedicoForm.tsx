import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useHospital } from '@/contexts/HospitalContext';

// Define the schema for a médico.  Adjust fields as needed.  The
// `unidad` field will store the hospital name and will be updated
// automatically from the hospital context.
const medicoSchema = z.object({
  nombre: z.string().nonempty('El nombre es obligatorio'),
  especialidad: z.string().nonempty('La especialidad es obligatoria'),
  cedula: z.string().nonempty('La cédula es obligatoria'),
  unidad: z.string().nonempty('Debes seleccionar un hospital'),
});

type MedicoFormValues = z.infer<typeof medicoSchema>;

interface MedicoFormProps {
  onClose: () => void;
  onSubmit: (values: any) => void;
  defaultValues?: Partial<MedicoFormValues>;
}

/**
 * Updated medico form that uses HospitalContext for hospital selection.
 */
export default function MedicoForm({ onClose, onSubmit, defaultValues }: MedicoFormProps) {
  const { selectedHospital, availableHospitals, canSelectHospital, setSelectedHospital } = useHospital();
  const form = useForm<MedicoFormValues>({
    resolver: zodResolver(medicoSchema),
    defaultValues: {
      nombre: '',
      especialidad: '',
      cedula: '',
      unidad: selectedHospital?.display_name || '',
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (selectedHospital) {
      form.setValue('unidad', selectedHospital.display_name);
    }
  }, [selectedHospital, form]);

  const handleSubmit = (values: MedicoFormValues) => {
    const hospital = selectedHospital;
    onSubmit({
      ...values,
      state_name: hospital?.state_name,
      hospital_budget_code: hospital?.budget_code,
      hospital_display_name: hospital?.display_name,
    });
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      {/* Nombre del médico */}
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="nombre">Nombre</label>
        <input
          id="nombre"
          type="text"
          {...form.register('nombre')}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
        {form.formState.errors.nombre && (
          <p className="text-sm text-red-500">{form.formState.errors.nombre.message}</p>
        )}
      </div>

      {/* Especialidad */}
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="especialidad">Especialidad</label>
        <input
          id="especialidad"
          type="text"
          {...form.register('especialidad')}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
        {form.formState.errors.especialidad && (
          <p className="text-sm text-red-500">{form.formState.errors.especialidad.message}</p>
        )}
      </div>

      {/* Cédula profesional */}
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="cedula">Cédula</label>
        <input
          id="cedula"
          type="text"
          {...form.register('cedula')}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
        {form.formState.errors.cedula && (
          <p className="text-sm text-red-500">{form.formState.errors.cedula.message}</p>
        )}
      </div>

      {/* Hospital selector / display */}
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="unidad">Hospital</label>
        {canSelectHospital ? (
          <select
            id="unidad"
            {...form.register('unidad')}
            value={form.watch('unidad')}
            onChange={(e) => {
              const value = e.target.value;
              form.setValue('unidad', value);
              const hospital = availableHospitals.find((h) => h.display_name === value);
              if (hospital) setSelectedHospital(hospital);
            }}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="" disabled>Selecciona hospital</option>
            {availableHospitals.map((h) => (
              <option key={h.budget_code} value={h.display_name}>{h.display_name}</option>
            ))}
          </select>
        ) : (
          <input
            id="unidad"
            readOnly
            value={selectedHospital?.display_name || ''}
            className="w-full rounded-md border px-3 py-2 text-sm bg-gray-100"
          />
        )}
        {form.formState.errors.unidad && (
          <p className="text-sm text-red-500">{form.formState.errors.unidad.message}</p>
        )}
      </div>

      {/* Botones */}
      <div className="flex justify-end space-x-2 pt-4">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border">
          Cancelar
        </button>
        <button type="submit" className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white">
          Guardar
        </button>
      </div>
    </form>
  );
}