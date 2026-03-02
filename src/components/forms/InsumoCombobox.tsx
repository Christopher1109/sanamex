import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useHospital } from '@/contexts/HospitalContext';
import { toast } from 'sonner';

interface Insumo {
  id: string;
  nombre: string;
  lote: string;
  cantidad: number;
}

interface InsumoComboboxProps {
  value?: string;
  onSelect: (insumo: Insumo | null) => void;
  insumosDisponibles: Insumo[];
  placeholder?: string;
}

export function InsumoCombobox({ 
  value, 
  onSelect, 
  insumosDisponibles,
  placeholder = "Buscar insumo..." 
}: InsumoComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedInsumo = insumosDisponibles.find((insumo) => insumo.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedInsumo ? selectedInsumo.nombre : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar insumo..." />
          <CommandEmpty>
            {insumosDisponibles.length === 0 
              ? "No hay insumos disponibles para agregar"
              : "No se encontró el insumo"
            }
          </CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            {insumosDisponibles.map((insumo) => (
              <CommandItem
                key={insumo.id}
                value={`${insumo.nombre} ${insumo.lote}`}
                onSelect={() => {
                  onSelect(insumo.id === value ? null : insumo);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === insumo.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex flex-col">
                  <span className="font-medium">{insumo.nombre}</span>
                  <span className="text-sm text-muted-foreground">
                    Lote: {insumo.lote} | Disponible: {insumo.cantidad}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
