import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import QuickClienteDialog, { ClienteMinimo } from './QuickClienteDialog';

/**
 * Selector de cliente para el punto de venta.
 *
 * Junta SANAMEX 15-ago-2026: cliente obligatorio antes de cobrar (Isaac: "sí o
 * sí necesitas ingresar un cliente... ese debería ser el candado"), con
 * búsqueda por RFC para evitar altas duplicadas entre sucursales, y alta
 * inmediata desde la misma pantalla si el cliente no existe todavía.
 *
 * A diferencia del selector anterior, aquí NO existe la opción "Público en
 * general": toda venta requiere un cliente real del catálogo.
 */

interface ClienteSelectorProps {
  clientes: ClienteMinimo[];
  clienteId: string;
  onSelect: (clienteId: string) => void;
  onClienteCreated: (cliente: ClienteMinimo) => void;
  disabled?: boolean;
}

export default function ClienteSelector({ clientes, clienteId, onSelect, onClienteCreated, disabled }: ClienteSelectorProps) {
  const [open, setOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(() => clientes.find((c) => c.id === clienteId) || null, [clientes, clienteId]);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground')}
          >
            {selected ? `${selected.nombre}${selected.rfc ? ` — ${selected.rfc}` : ''}` : 'Buscar cliente por nombre o RFC…'}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={true}>
            <CommandInput placeholder="Nombre o RFC…" value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>
                <div className="px-2 py-3 text-sm text-muted-foreground space-y-2">
                  <p>No se encontró ningún cliente.</p>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => { setOpen(false); setQuickAddOpen(true); }}
                  >
                    <UserPlus className="h-4 w-4 mr-1" /> Crear cliente nuevo
                  </Button>
                </div>
              </CommandEmpty>
              <CommandGroup>
                {clientes.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.nombre} ${c.rfc || ''}`}
                    onSelect={() => { onSelect(c.id); setOpen(false); }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', clienteId === c.id ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex flex-col">
                      <span>{c.nombre}</span>
                      {c.rfc && <span className="text-xs text-muted-foreground">{c.rfc}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-primary"
                onClick={() => { setOpen(false); setQuickAddOpen(true); }}
              >
                <UserPlus className="h-4 w-4 mr-2" /> Nuevo cliente…
              </Button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      <QuickClienteDialog
        open={quickAddOpen}
        onOpenChange={setQuickAddOpen}
        initialQuery={query}
        onCreated={(cliente) => {
          onClienteCreated(cliente);
          onSelect(cliente.id);
        }}
      />
    </>
  );
}
