import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, Receipt, FileStack } from 'lucide-react';
import { toast } from 'sonner';
import FacturarRapidoDialog from '@/components/FacturarRapidoDialog';

const VentasHistorial = () => {
  const { selectedSucursal } = useSucursal();
  const [ventas, setVentas] = useState<any[]>([]);
  const [ventasAgrupadasIds, setVentasAgrupadasIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fechaCorte, setFechaCorte] = useState<string | null>(null);
  const [timbrarState, setTimbrarState] = useState<{ open: boolean; venta?: any; venta_ids?: string[]; referencia?: string }>({ open: false });
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());

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
    setSeleccionadas(new Set());

    // Ventas que quedaron cubiertas por una factura agrupada (no aparecen
    // directo en cfdi_emitidos.venta_id, hay que consultarlas aparte).
    const ids = (data || []).map(v => v.id);
    if (ids.length) {
      const { data: agrupadas } = await (supabase as any)
        .from('cfdi_ventas_agrupadas')
        .select('venta_id, cfdi_emitidos!inner(estado)')
        .in('venta_id', ids);
      const activas = (agrupadas || []).filter((r: any) => r.cfdi_emitidos?.estado === 'timbrado').map((r: any) => r.venta_id);
      setVentasAgrupadasIds(new Set(activas));
    } else {
      setVentasAgrupadasIds(new Set());
    }
    setLoading(false);
  };

  const filtered = ventas.filter(v => v.numero_venta.toLowerCase().includes(search.toLowerCase()));

  const cfdiActivo = (v: any) => {
    const cfdis = (v.cfdi_emitidos || []) as any[];
    return cfdis.find(c => c.estado !== 'cancelado');
  };

  const yaFacturada = (v: any) => !!cfdiActivo(v) || ventasAgrupadasIds.has(v.id);

  const puedeTimbrar = (v: any) => {
    if (v.estado !== 'completada') return false;
    if (!fechaCorte || !v.fecha) return false;
    const f = new Date(v.fecha).toISOString().slice(0, 10);
    if (f < fechaCorte) return false;
    return !yaFacturada(v);
  };

  const toggleSeleccion = (id: string) => {
    setSeleccionadas(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const seleccionables = filtered.filter(puedeTimbrar);
  const todasSeleccionadas = seleccionables.length > 0 && seleccionables.every(v => seleccionadas.has(v.id));

  const toggleTodas = () => {
    if (todasSeleccionadas) { setSeleccionadas(new Set()); return; }
    setSeleccionadas(new Set(seleccionables.map(v => v.id)));
  };

  const abrirFacturacionAgrupada = () => {
    if (seleccionadas.size === 0) { toast.error('Selecciona al menos un ticket'); return; }
    setTimbrarState({
      open: true,
      venta_ids: Array.from(seleccionadas),
      referencia: `${seleccionadas.size} ticket${seleccionadas.size === 1 ? '' : 's'} seleccionado${seleccionadas.size === 1 ? '' : 's'}`,
    });
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
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por folio..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" />
            </div>
            {seleccionadas.size > 0 && (
              <Button size="sm" onClick={abrirFacturacionAgrupada} className="gap-2">
                <FileStack className="h-4 w-4" /> Facturar {seleccionadas.size} seleccionado{seleccionadas.size === 1 ? '' : 's'} en una sola factura
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Selecciona varios tickets sin factura (ej. ventas a público en general) para timbrarlos juntos en un solo CFDI.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={todasSeleccionadas} onCheckedChange={toggleTodas} disabled={seleccionables.length === 0} />
                </TableHead>
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
                <TableRow><TableCell colSpan={10} className="text-center py-8">Cargando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Sin ventas</TableCell></TableRow>
              ) : filtered.map(v => {
                const activo = cfdiActivo(v);
                const facturada = yaFacturada(v);
                const puede = puedeTimbrar(v);
                return (
                  <TableRow key={v.id}>
                    <TableCell>
                      {puede && <Checkbox checked={seleccionadas.has(v.id)} onCheckedChange={() => toggleSeleccion(v.id)} />}
                    </TableCell>
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
                      ) : facturada ? (
                        <Badge variant="secondary" className="text-[10px]">En factura agrupada</Badge>
                      ) : puede ? (
                        <Button size="sm" variant="outline" onClick={() => setTimbrarState({ open: true, venta: v, venta_ids: [v.id], referencia: v.numero_venta })}>
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
        venta_ids={timbrarState.venta_ids}
        cliente_id={(timbrarState.venta_ids?.length ?? 0) > 1 ? null : timbrarState.venta?.cliente_id}
        referencia={timbrarState.referencia}
        onSuccess={() => { setTimbrarState({ open: false }); load(); }}
      />
    </div>
  );
};

export default VentasHistorial;
