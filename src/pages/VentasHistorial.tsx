import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Receipt } from 'lucide-react';
import FacturarRapidoDialog from '@/components/FacturarRapidoDialog';

const VentasHistorial = () => {
  const { selectedSucursal } = useSucursal();
  const [ventas, setVentas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fechaCorte, setFechaCorte] = useState<string | null>(null);
  const [timbrarState, setTimbrarState] = useState<{ open: boolean; venta?: any }>({ open: false });

  useEffect(() => {
    supabase.from('contabilidad_parametros').select('fecha_corte_automatico').eq('id', 1).maybeSingle()
      .then(({ data }) => setFechaCorte((data as any)?.fecha_corte_automatico || null));
  }, []);

  useEffect(() => { if (selectedSucursal) load(); }, [selectedSucursal]);

  const load = async () => {
    if (!selectedSucursal) return;
    setLoading(true);
    const { data } = await supabase
      .from('ventas')
      .select('*, profiles:cajero_id(nombre), clientes(nombre), cfdi_emitidos(id, uuid_sat, estado)')
      .eq('sucursal_id', selectedSucursal.id)
      .order('fecha', { ascending: false })
      .limit(100);
    setVentas(data || []);
    setLoading(false);
  };

  const filtered = ventas.filter(v => v.numero_venta.toLowerCase().includes(search.toLowerCase()));

  const puedeTimbrar = (v: any) => {
    if (v.estado !== 'completada') return false;
    if (!fechaCorte || !v.fecha) return false;
    const f = new Date(v.fecha).toISOString().slice(0, 10);
    if (f < fechaCorte) return false;
    const cfdis = (v.cfdi_emitidos || []) as any[];
    const activo = cfdis.find(c => c.estado !== 'cancelado');
    return !activo;
  };

  const cfdiActivo = (v: any) => {
    const cfdis = (v.cfdi_emitidos || []) as any[];
    return cfdis.find(c => c.estado !== 'cancelado');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Historial de Ventas</h1>
        <p className="text-muted-foreground">{selectedSucursal?.nombre}</p>
        {fechaCorte && (
          <p className="text-xs text-muted-foreground mt-1">
            Timbrado disponible para ventas con fecha ≥ {fechaCorte} (fecha de corte contable).
          </p>
        )}
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por folio..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cajero</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Impuestos</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>CFDI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8">Cargando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Sin ventas</TableCell></TableRow>
              ) : filtered.map(v => {
                const activo = cfdiActivo(v);
                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs font-bold">{v.numero_venta}</TableCell>
                    <TableCell className="text-xs">{v.fecha ? new Date(v.fecha).toLocaleString('es-MX') : '—'}</TableCell>
                    <TableCell>{(v.profiles as any)?.nombre || '—'}</TableCell>
                    <TableCell>{(v.clientes as any)?.nombre || 'Público general'}</TableCell>
                    <TableCell className="text-right">${Number(v.subtotal).toFixed(2)}</TableCell>
                    <TableCell className="text-right">${Number(v.impuestos).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-bold">${Number(v.total).toFixed(2)}</TableCell>
                    <TableCell><Badge variant={v.estado === 'completada' ? 'default' : 'destructive'}>{v.estado}</Badge></TableCell>
                    <TableCell>
                      {activo ? (
                        <Badge variant="secondary" className="font-mono text-[10px]" title={activo.uuid_sat}>
                          {activo.uuid_sat ? activo.uuid_sat.slice(0, 8) + '…' : 'Timbrado'}
                        </Badge>
                      ) : puedeTimbrar(v) ? (
                        <Button size="sm" variant="outline" onClick={() => setTimbrarState({ open: true, venta: v })}>
                          <Receipt className="h-3.5 w-3.5 mr-1" /> Timbrar
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <FacturarRapidoDialog
        open={timbrarState.open}
        onOpenChange={(o) => setTimbrarState(s => ({ ...s, open: o }))}
        venta_id={timbrarState.venta?.id}
        cliente_id={timbrarState.venta?.cliente_id}
        referencia={timbrarState.venta?.numero_venta}
        onSuccess={() => { setTimbrarState({ open: false }); load(); }}
      />
    </div>
  );
};

export default VentasHistorial;
