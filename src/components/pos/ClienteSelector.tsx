import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, UserPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import QuickClienteDialog, { ClienteMinimo } from './QuickClienteDialog';

/**
 * Selector de cliente para el punto de venta.
 *
 * Junta SANAMEX 15-ago-2026: cliente obligatorio antes de cobrar, con búsqueda
 * por RFC para evitar altas duplicadas entre sucursales.
 *
 * IMPORTANTE: el catálogo de clientes tiene más de 11 mil registros y la API
 * sólo devuelve los primeros 1000, por lo que la búsqueda NO puede hacerse en
 * memoria (así "FARMACIA EL BUEN PRECIO" y su RFC nunca aparecían). La búsqueda
 * se hace contra la base de datos por nombre o RFC.
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
  const [remote, setRemote] = useState<ClienteMinimo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [cache, setCache] = useState<ClienteMinimo[]>([]);

  // Búsqueda server-side por nombre o RFC (debounced).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRemote(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const escaped = q.replace(/[%,()]/g, ' ');
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, rfc')
        .eq('activo', true)
        .or(`nombre.ilike.%${escaped}%,rfc.ilike.%${escaped}%`)
        .order('nombre')
        .limit(50);
      setRemote((data as ClienteMinimo[]) || []);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const opciones = useMemo(() => (remote ?? clientes.slice(0, 50)), [remote, clientes]);

  const selected = useMemo(
    () => [...cache, ...clientes, ...(remote || [])].find((c) => c.id === clienteId) || null,
    [cache, clientes, remote, clienteId],
  );

  // Si el cliente seleccionado no viene en la lista precargada, tráelo por id.
  useEffect(() => {
    if (!clienteId || selected) return;
    supabase.from('clientes').select('id, nombre, rfc').eq('id', clienteId).maybeSingle()
      .then(({ data }) => { if (data) setCache((c) => [...c, data as ClienteMinimo]); });
  }, [clienteId, selected]);

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
          <Command shouldFilter={false}>
            <CommandInput placeholder="Nombre o RFC…" value={query} onValueChange={setQuery} />
            <CommandList>
              {loading ? (
                <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
                </div>
              ) : opciones.length === 0 ? (
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
              ) : (
                <CommandGroup heading={remote ? `${opciones.length} resultado(s)` : 'Clientes'}>
                  {opciones.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={c.id}
                      onSelect={() => { setCache((p) => [...p, c]); onSelect(c.id); setOpen(false); }}
                    >
                      <Check className={cn('mr-2 h-4 w-4', clienteId === c.id ? 'opacity-100' : 'opacity-0')} />
                      <div className="flex flex-col">
                        <span>{c.nombre}</span>
                        {c.rfc && <span className="text-xs text-muted-foreground">{c.rfc}</span>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {!remote && query.trim().length < 2 && (
                <div className="px-3 pb-2 text-xs text-muted-foreground">
                  Escribe al menos 2 caracteres para buscar en todo el catálogo.
                </div>
              )}
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
          setCache((p) => [...p, cliente]);
          onClienteCreated(cliente);
          onSelect(cliente.id);
        }}
      />
    </>
  );
}
