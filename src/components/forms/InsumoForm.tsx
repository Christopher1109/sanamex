import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useHospital } from '@/contexts/HospitalContext';
import { supabase } from '@/integrations/supabase/client';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown } from 'lucide-react';

// Define the schema for an insumo (inventory item).  Adjust fields as
// necessary to match your database structure.  The important part is
// `unidad`, which will capture the hospital display name and be
// synchronised automatically with the hospital context.
const insumoSchema = z.object({
  nombre: z.string().nonempty('El nombre es obligatorio'),
  clave: z.string().optional(),
  lote: z.string().nonempty('El lote es obligatorio'),
  cantidad: z.number().min(0, 'La cantidad no puede ser negativa'),
  fecha_entrada: z.string().nonempty('La fecha de entrada es obligatoria'),
  fecha_caducidad: z.string().nonempty('La fecha de caducidad es obligatoria'),
  unidad: z.string().nonempty('Debes seleccionar un hospital'),
});

type InsumoFormValues = z.infer<typeof insumoSchema>;

interface InsumoFormProps {
  onClose: () => void;
  onSubmit: (values: any) => void;
  defaultValues?: Partial<InsumoFormValues>;
}

/**
 * Updated insumo form that uses HospitalContext to choose the hospital
 * instead of a hard coded list of units.  For roles that can select
 * hospitals, this form shows a dropdown; otherwise it displays a
 * read‑only text field.  When a hospital is selected the `unidad`
 * field is updated.
 */
export default function InsumoForm({ onClose, onSubmit, defaultValues }: InsumoFormProps) {
  const { selectedHospital, availableHospitals, canSelectHospital, setSelectedHospital } = useHospital();
  const [catalogoInsumos, setCatalogoInsumos] = useState<Array<{ id: string; nombre: string; clave: string | null }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [open, setOpen] = useState(false);
  
  const form = useForm<InsumoFormValues>({
    resolver: zodResolver(insumoSchema),
    defaultValues: {
      nombre: '',
      clave: '',
      lote: '',
      cantidad: 0,
      fecha_entrada: new Date().toISOString().split('T')[0],
      fecha_caducidad: '',
      unidad: selectedHospital?.display_name || '',
      ...defaultValues,
    },
  });

  // Fetch catálogo de insumos para autocompletado
  useEffect(() => {
    const fetchCatalogo = async () => {
      const { data } = await supabase
        .from('insumos_catalogo')
        .select('id, nombre, clave')
        .eq('activo', true)
        .order('nombre');
      
      if (data) {
        setCatalogoInsumos(data);
      }
    };
    fetchCatalogo();
  }, []);

  // Synchronise the `unidad` value whenever selectedHospital changes
  useEffect(() => {
    if (selectedHospital) {
      form.setValue('unidad', selectedHospital.display_name);
    }
  }, [selectedHospital, form]);

  const handleSubmit = (values: InsumoFormValues) => {
    const hospital = selectedHospital;
    onSubmit({
      ...values,
      state_name: hospital?.state_name,
      hospital_budget_code: hospital?.budget_code,
      hospital_display_name: hospital?.display_name,
    });
  };

  // Filtrar y eliminar duplicados por nombre
  const filteredInsumos = catalogoInsumos
    .filter((insumo) =>
      insumo.nombre.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter((insumo, index, self) =>
      index === self.findIndex((t) => t.nombre === insumo.nombre)
    );

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      className="space-y-4"
    >
      {/* Nombre del insumo con autocompletado */}
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="nombre">Nombre</label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="w-full rounded-md border px-3 py-2 text-sm text-left flex items-center justify-between bg-background hover:bg-accent"
            >
              <span className={form.watch('nombre') ? 'text-foreground' : 'text-muted-foreground'}>
                {form.watch('nombre') || 'Buscar o escribir nombre del insumo...'}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0 bg-background" align="start">
            <Command>
              <CommandInput
                placeholder="Buscar insumo..."
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList>
                <CommandEmpty>
                  {searchQuery ? (
                    <div className="py-2 px-2 text-sm">
                      <p className="text-muted-foreground mb-2">No se encontró en el catálogo.</p>
                      <button
                        type="button"
                        onClick={() => {
                          form.setValue('nombre', searchQuery);
                          setOpen(false);
                          setSearchQuery('');
                        }}
                        className="w-full px-2 py-1.5 text-left rounded-sm hover:bg-accent text-sm"
                      >
                        Usar "{searchQuery}" como nuevo insumo
                      </button>
                    </div>
                  ) : (
                    'Escribe para buscar...'
                  )}
                </CommandEmpty>
                <CommandGroup>
                  {filteredInsumos.map((insumo) => (
                    <CommandItem
                      key={insumo.id}
                      value={insumo.nombre}
                      onSelect={() => {
                        form.setValue('nombre', insumo.nombre);
                        if (insumo.clave) {
                          form.setValue('clave', insumo.clave);
                        }
                        setOpen(false);
                        setSearchQuery('');
                      }}
                    >
                      <Check
                        className={`mr-2 h-4 w-4 ${
                          form.watch('nombre') === insumo.nombre ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm">{insumo.nombre}</span>
                        {insumo.clave && (
                          <span className="text-xs text-muted-foreground">Clave: {insumo.clave}</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {form.formState.errors.nombre && (
          <p className="text-sm text-red-500">{form.formState.errors.nombre.message}</p>
        )}
      </div>

      {/* Clave del insumo */}
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="clave">Clave (opcional)</label>
        <input
          id="clave"
          type="text"
          {...form.register('clave')}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Se autocompletará si está en el catálogo"
        />
        {form.formState.errors.clave && (
          <p className="text-sm text-red-500">{form.formState.errors.clave.message}</p>
        )}
      </div>

      {/* Lote */}
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="lote">Lote</label>
        <input
          id="lote"
          type="text"
          {...form.register('lote')}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
        {form.formState.errors.lote && (
          <p className="text-sm text-red-500">{form.formState.errors.lote.message}</p>
        )}
      </div>

      {/* Cantidad */}
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="cantidad">Cantidad</label>
        <input
          id="cantidad"
          type="number"
          {...form.register('cantidad', { valueAsNumber: true })}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
        {form.formState.errors.cantidad && (
          <p className="text-sm text-red-500">{form.formState.errors.cantidad.message}</p>
        )}
      </div>

      {/* Fecha de Entrada */}
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="fecha_entrada">Fecha de Entrada</label>
        <input
          id="fecha_entrada"
          type="date"
          {...form.register('fecha_entrada')}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
        {form.formState.errors.fecha_entrada && (
          <p className="text-sm text-red-500">{form.formState.errors.fecha_entrada.message}</p>
        )}
      </div>

      {/* Fecha de Caducidad */}
      <div className="grid gap-1">
        <label className="text-sm font-medium" htmlFor="fecha_caducidad">Fecha de Caducidad</label>
        <input
          id="fecha_caducidad"
          type="date"
          {...form.register('fecha_caducidad')}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
        {form.formState.errors.fecha_caducidad && (
          <p className="text-sm text-red-500">{form.formState.errors.fecha_caducidad.message}</p>
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
              if (hospital) {
                setSelectedHospital(hospital);
              }
            }}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="" disabled>Selecciona hospital</option>
            {availableHospitals.map((h) => (
              <option key={h.budget_code} value={h.display_name}>
                {h.display_name}
              </option>
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

      {/* Botones de acción */}
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