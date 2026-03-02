import { useSucursal } from '@/contexts/SucursalContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const SucursalSelector = () => {
  const { selectedSucursal, availableSucursales, setSelectedSucursal, loading } = useSucursal();

  if (loading) return <div className="text-xs text-sidebar-foreground/50">Cargando...</div>;
  if (availableSucursales.length === 0) return null;

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
