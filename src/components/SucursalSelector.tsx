import { useSucursal } from '@/contexts/SucursalContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Lock } from 'lucide-react';

export const SucursalSelector = () => {
  const { selectedSucursal, availableSucursales, setSelectedSucursal, loading, canSwitchSucursal } = useSucursal();

  if (loading) return <div className="text-xs text-sidebar-foreground/50">Cargando...</div>;
  if (availableSucursales.length === 0) return null;

  // Usuarios locales: vista fija de su sucursal, sin posibilidad de cambio
  if (!canSwitchSucursal) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground">
        <Lock className="h-3 w-3 opacity-60" />
        <span className="truncate">
          {selectedSucursal ? `${selectedSucursal.codigo} — ${selectedSucursal.nombre}` : 'Sin sucursal asignada'}
        </span>
      </div>
    );
  }

  return (
    <Select
      value={selectedSucursal?.id || ''}
      onValueChange={(val) => {
        const s = availableSucursales.find(s => s.id === val);
        if (s) setSelectedSucursal(s);
      }}
    >
      <SelectTrigger className="w-full bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs">
        <SelectValue placeholder="Seleccionar sucursal" />
      </SelectTrigger>
      <SelectContent>
        {availableSucursales.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <span className="text-xs">{s.codigo} — {s.nombre}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
