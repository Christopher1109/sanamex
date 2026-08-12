import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, RefreshCw, Search, Truck, Store, Save } from 'lucide-react';
import { toast } from 'sonner';

// Vista simplificada de reposición para gerentes y almacenistas de sucursal:
// NO muestra precios, proveedores ganadores ni comparativa de postores — solo
// qué hay, qué se vende, qué viene en camino y cuánto propone el sistema, para
// que la sucursal capture su propia cantidad sugerida ("Sug. gerente").
// Esa cantidad es independiente del sugerido del sistema y del que edita el
// área de Compras: solo es una propuesta que Compras puede ver al cotizar.

type Ruta = { proveedor_nombre: string; cantidad: number };
type SugGerente = { cantidad: number; nota: string | null; usuario: string | null; fecha: string | null } | null;
type Row = {
  producto_id: string; sku: string; nombre: string; descripcion: string | null;
  clasificacion: string | null; estatus: string | null;
  existencia: number; ult30: number; necesidad: number; sugerido_sistema: number;
  en_ruta: number; en_ruta_detalle: Ruta[]; sug_gerente: SugGerente;
};

export default function ReposicionSucursal() {
  const { selectedSucursal } = useSucursal();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [soloFaltantes, setSoloFaltantes] = useState(true);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());

  async function cargar() {
    if (!selectedSucursal) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('reposicion_sucursal_vista' as any, {
        p_sucursal_id: selectedSucursal.id,
        p_search: search || null,
        p_solo_faltantes: soloFaltantes,
        p_limit: 800, p_offset: 0,
      });
      if (error) throw error;
      setRows(((data as any) || []) as Row[]);
      setEdits({});
    } catch (e: any) {
      toast.error('No se pudo cargar la reposición: ' + e.message);
    } finally { setLoading(false); }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [selectedSucursal?.id, soloFaltantes]);

  function valor(r: Row) {
    if (edits[r.producto_id] !== undefined) return edits[r.producto_id];
    if (r.sug_gerente) return r.sug_gerente.cantidad;
    return 0;
  }

  async function guardar(r: Row) {
    if (!selectedSucursal) return;
    const val = valor(r);
    setSaving(prev => new Set(prev).add(r.producto_id));
    try {
      const { error } = await supabase.rpc('sugerido_sucursal_upsert' as any, {
        p_producto_id: r.producto_id, p_sucursal_id: selectedSucursal.id,
        p_cantidad: val, p_nota: null,
      });
      if (error) throw error;
      setRows(prev => prev.map(x => x.producto_id === r.producto_id
        ? { ...x, sug_gerente: { cantidad: val, nota: null, usuario: 'tú', fecha: new Date().toISOString() } }
        : x));
      setEdits(prev => { const n = { ...prev }; delete n[r.producto_id]; return n; });
      toast.success('Propuesta enviada a Compras');
    } catch (e: any) { toast.error('No se pudo guardar: ' + e.message); }
    finally { setSaving(prev => { const n = new Set(prev); n.delete(r.producto_id); return n; }); }
  }

  const pendientes = useMemo(() => Object.keys(edits).length, [edits]);

  if (!selectedSucursal) {
    return <p className="text-sm text-muted-foreground">Selecciona una sucursal para ver su reposición.</p>;
  }

  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 min-w-[240px] flex-1">
            <span className="text-xs font-medium text-muted-foreground">Buscar (SKU, nombre o código de barras)</span>
            <div className="flex gap-1">
              <Input className="h-9" value={search} onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && cargar()} placeholder="Buscar…" />
              <Button variant="outline" size="sm" className="h-9" onClick={cargar}><Search className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="flex items-center gap-2 h-9">
            <Checkbox id="faltantes" checked={soloFaltantes} onCheckedChange={v => setSoloFaltantes(!!v)} />
            <Label htmlFor="faltantes" className="text-xs">Solo lo que falta</Label>
          </div>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={cargar} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Actualizar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Store className="h-3.5 w-3.5" /> {selectedSucursal.codigo} — {selectedSucursal.nombre}
          <span>· {rows.length} producto(s)</span>
          {pendientes > 0 && <Badge variant="outline" className="border-amber-500 text-amber-700">{pendientes} sin guardar</Badge>}
        </p>
      </Card>

      <TooltipProvider>
        <Card className="p-0 overflow-auto max-h-[70vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-center">Clasif</TableHead>
                <TableHead className="text-right">Existencia</TableHead>
                <TableHead className="text-right">Venta 30d</TableHead>
                <TableHead className="text-right">Sug. sistema</TableHead>
                <TableHead className="text-right">En ruta</TableHead>
                <TableHead className="text-right bg-amber-50">Sug. gerente</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={9} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>}
              {!loading && !rows.length && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">
                  Sin productos con los filtros actuales.
                </TableCell></TableRow>
              )}
              {rows.map(r => {
                const sav = saving.has(r.producto_id);
                const dirty = edits[r.producto_id] !== undefined;
                return (
                  <TableRow key={r.producto_id}>
                    <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                    <TableCell className="text-xs max-w-[280px]">
                      <span className="line-clamp-2 leading-tight">{r.nombre}</span>
                    </TableCell>
                    <TableCell className="text-center"><Badge variant="outline" className="text-[10px]">{r.clasificacion || '-'}</Badge></TableCell>
                    <TableCell className="text-right text-xs font-medium">{r.existencia}</TableCell>
                    <TableCell className="text-right text-xs">{Number(r.ult30).toFixed(0)}</TableCell>
                    <TableCell className="text-right text-xs">{r.sugerido_sistema}</TableCell>
                    <TableCell className="text-right text-xs">
                      {r.en_ruta > 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 text-blue-700 cursor-default">
                              <Truck className="h-3 w-3" />{r.en_ruta}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs space-y-0.5">
                              <p className="font-medium">Pendiente de recibir</p>
                              {(r.en_ruta_detalle || []).map((d, i) => (
                                <p key={i}>{d.proveedor_nombre}: {d.cantidad} pzas</p>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className={`text-right p-1 ${dirty ? 'bg-amber-100' : 'bg-amber-50'}`}>
                      <Input type="number" min={0} value={valor(r)}
                        onChange={e => setEdits(prev => ({ ...prev, [r.producto_id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                        onBlur={() => { if (dirty) guardar(r); }}
                        className="h-7 w-16 text-right text-xs px-1 ml-auto" />
                    </TableCell>
                    <TableCell className="text-xs">
                      {sav ? <Loader2 className="h-3 w-3 animate-spin" />
                        : dirty ? (
                          <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => guardar(r)}>
                            <Save className="h-3 w-3" />
                          </Button>
                        ) : r.sug_gerente ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-[9px] border-amber-500 text-amber-700">enviada</Badge>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">
                              {r.sug_gerente.usuario || 'sucursal'}
                              {r.sug_gerente.fecha ? ` · ${new Date(r.sug_gerente.fecha).toLocaleDateString('es-MX')}` : ''}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </TooltipProvider>
    </div>
  );
}
