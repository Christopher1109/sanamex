import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

export type MultiOption = { value: string; label: string; hint?: string };

interface Props {
  label: string;
  options: MultiOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
}

// Filtro tipo "selector múltiple": se abre un panel con búsqueda y se pueden
// marcar varias opciones a la vez. Vacío = "Todos".
export function MultiSelectFilter({
  label, options, selected, onChange,
  placeholder = 'Todos', searchPlaceholder = 'Buscar…', className,
}: Props) {
  const [open, setOpen] = useState(false);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };

  const resumen = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
      : `${selected.length} seleccionados`;

  return (
    <div className={cn('flex flex-col gap-1 min-w-[180px]', className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'h-9 w-full justify-between font-normal',
              selected.length === 0 && 'text-muted-foreground',
            )}
          >
            <span className="truncate">{resumen}</span>
            <span className="flex items-center gap-1 shrink-0">
              {selected.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{selected.length}</Badge>
              )}
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} className="h-9" />
            <CommandList className="max-h-64">
              <CommandEmpty>Sin resultados.</CommandEmpty>
              <CommandGroup>
                {options.map(o => {
                  const active = selected.includes(o.value);
                  return (
                    <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => toggle(o.value)}>
                      <div className={cn(
                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border',
                        active ? 'bg-primary border-primary text-primary-foreground' : 'border-input',
                      )}>
                        {active && <Check className="h-3 w-3" />}
                      </div>
                      <span className="flex-1 truncate">{o.label}</span>
                      {o.hint && <span className="ml-2 text-[10px] text-muted-foreground">{o.hint}</span>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
          {selected.length > 0 && (
            <div className="border-t p-1">
              <Button variant="ghost" size="sm" className="h-7 w-full justify-start text-xs" onClick={() => onChange([])}>
                <X className="mr-1 h-3 w-3" /> Limpiar selección
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
