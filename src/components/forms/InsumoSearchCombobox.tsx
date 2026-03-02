import { useState, useMemo } from 'react';
import { Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Insumo {
  id: string;
  nombre: string;
  lote: string;
  clave?: string; // Código BCB
  categoria?: string;
  cantidadMinima?: number;
  cantidadMaxima?: number;
  cantidadDefault?: number;
}

interface InsumoSearchComboboxProps {
  value?: string;
  onSelect: (insumo: Insumo | null) => void;
  insumosDisponibles: Insumo[];
  placeholder?: string;
}

export function InsumoSearchCombobox({ 
  value, 
  onSelect, 
  insumosDisponibles,
  placeholder = "Buscar insumo..." 
}: InsumoSearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Ordenar insumos alfabéticamente y por categoría
  const sortedInsumos = useMemo(() => {
    return [...insumosDisponibles].sort((a, b) => {
      // Primero por categoría si existe
      if (a.categoria && b.categoria) {
        const catCompare = a.categoria.localeCompare(b.categoria);
        if (catCompare !== 0) return catCompare;
      }
      // Luego alfabéticamente por nombre
      return a.nombre.localeCompare(b.nombre);
    });
  }, [insumosDisponibles]);

  // Filtrar insumos basado en búsqueda inteligente (nombre o código BCB)
  const filteredInsumos = useMemo(() => {
    if (!searchQuery.trim()) return sortedInsumos;
    
    const query = searchQuery.toLowerCase().trim();
    // Para códigos BCB, permitir buscar con o sin puntos
    const queryNormalized = query.replace(/\./g, '');
    const words = query.split(/\s+/);
    
    return sortedInsumos.filter((insumo) => {
      const nombreLower = insumo.nombre.toLowerCase();
      const claveLower = (insumo.clave || '').toLowerCase();
      const claveNormalized = claveLower.replace(/\./g, '');
      
      // Buscar por código BCB exacto o parcial
      if (claveLower.includes(query) || claveNormalized.includes(queryNormalized)) {
        return true;
      }
      
      // Buscar por nombre - todos los términos deben estar presentes
      return words.every(word => nombreLower.includes(word));
    }).sort((a, b) => {
      const aLower = a.nombre.toLowerCase();
      const bLower = b.nombre.toLowerCase();
      const aClave = (a.clave || '').toLowerCase();
      const bClave = (b.clave || '').toLowerCase();
      
      // Priorizar coincidencias exactas de código BCB
      const aClaveMatch = aClave.includes(query) || aClave.replace(/\./g, '').includes(queryNormalized);
      const bClaveMatch = bClave.includes(query) || bClave.replace(/\./g, '').includes(queryNormalized);
      if (aClaveMatch && !bClaveMatch) return -1;
      if (!aClaveMatch && bClaveMatch) return 1;
      
      // Priorizar coincidencias que empiezan con el término
      const aStartsWith = aLower.startsWith(query);
      const bStartsWith = bLower.startsWith(query);
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      
      // Luego por posición de la primera coincidencia
      const aIndex = aLower.indexOf(query);
      const bIndex = bLower.indexOf(query);
      if (aIndex !== bIndex) return aIndex - bIndex;
      
      // Finalmente alfabético
      return aLower.localeCompare(bLower);
    });
  }, [sortedInsumos, searchQuery]);

  // Agrupar por categoría para mejor organización visual
  const groupedInsumos = useMemo(() => {
    const groups: Record<string, Insumo[]> = {};
    filteredInsumos.forEach((insumo) => {
      const cat = insumo.categoria || 'General';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(insumo);
    });
    return groups;
  }, [filteredInsumos]);

  const selectedInsumo = insumosDisponibles.find((insumo) => insumo.id === value);

  const handleSelect = (insumoId: string) => {
    const insumo = insumosDisponibles.find(i => i.id === insumoId);
    if (insumo) {
      onSelect(insumo.id === value ? null : insumo);
      setOpen(false);
      setSearchQuery("");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-start text-left font-normal h-auto min-h-10 py-2 overflow-hidden"
        >
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate block max-w-[calc(100%-2rem)]">
            {selectedInsumo ? selectedInsumo.nombre : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[500px] p-0 bg-popover border shadow-lg z-50" 
        align="start"
        sideOffset={4}
      >
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Buscar por nombre o código BCB..." 
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="h-10"
          />
          <CommandList>
            <CommandEmpty className="py-6 text-center text-sm">
              {insumosDisponibles.length === 0 
                ? "No hay insumos disponibles para agregar"
                : "No se encontraron resultados para tu búsqueda"
              }
            </CommandEmpty>
            <ScrollArea className="h-[300px]">
              {Object.entries(groupedInsumos).map(([categoria, insumos]) => (
                <CommandGroup key={categoria} heading={categoria} className="px-2">
                  {insumos.map((insumo) => (
                    <CommandItem
                      key={insumo.id}
                      value={insumo.id}
                      onSelect={() => handleSelect(insumo.id)}
                      className="flex items-start gap-2 py-3 px-2 cursor-pointer aria-selected:bg-accent"
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 mt-0.5 shrink-0",
                          value === insumo.id ? "opacity-100 text-primary" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-medium text-sm leading-tight">
                          {highlightMatch(insumo.nombre, searchQuery)}
                        </span>
                        <span className="text-xs text-muted-foreground mt-0.5">
                          {insumo.clave && <span className="font-mono text-primary/80">{insumo.clave}</span>}
                          {insumo.clave && ' • '}
                          Lote: {insumo.lote || 'N/A'}
                          {insumo.cantidadMinima != null && ` • Mín: ${insumo.cantidadMinima}`}
                          {insumo.cantidadMaxima != null && ` • Máx: ${insumo.cantidadMaxima}`}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Función para resaltar las coincidencias en el texto
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  
  const words = query.toLowerCase().trim().split(/\s+/);
  let result = text;
  
  // Crear un patrón para encontrar todas las palabras
  const pattern = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`(${pattern})`, 'gi');
  
  const parts = result.split(regex);
  
  return (
    <>
      {parts.map((part, i) => {
        const isMatch = words.some(w => part.toLowerCase() === w);
        return isMatch ? (
          <mark key={i} className="bg-primary/20 text-foreground rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}
