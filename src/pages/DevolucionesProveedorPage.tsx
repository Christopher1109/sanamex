import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, X, Loader2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

interface LoteRow {
  lote_id: string; cantidad: number; producto_id: string; producto_nombre: string; sku: string;
  numero_lote: string; fecha_caducidad: string | null; costo_unitario: number;
}
interface Linea extends LoteRow { cantidad_devuelta: number }

const MOTIVOS = ['Caducidad', 'Daño físico', 'Producto incorrecto', 'Defecto de fábrica', 'Recall del proveedor', 'Otro'];

const DevolucionesProveedorPage = () => {
  const { selectedSucursal } = useSucursal();
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [almacenId, setAlmacenId] = useState<string | null>(null);
  const [devoluciones, setDevoluciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [proveedorId, setProveedorId] = useState('');
  const [lotes, setLotes] = useState<LoteRow[]>([]);
  const [search, setSearch] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [motivo, setMotivo] = useState('');
  const [motivoOtro, setMotivoOtro] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('proveedores').select('id, nombre, rfc').eq('activo', true).order('nombre').then(({ data }) => setProveedores(data || []));
  }, []);
  useEffect(() => { if (selectedSucursal) { resolverAlmacen(); loadHistorial(); } }, [selectedSucursal]);

  const resolverAlmacen = async () => {
    if (!selectedSucursal) return;
    const { data } = await supabase.from('almacenes').select('id, activo')
      .eq('sucursal_id', selectedSucursal.id).order('activo', { ascending: false }).limit(1);
    setAlmacenId(data?.[0]?.id || null);
  };

  const loadHistorial = async () => {
    if (!selectedSucursal) return;
    setLoading(true);
    const { data } = await supabase.from('devoluciones_proveedor')
      .select('*, proveedores(nombre)')
      .eq('sucursal_id', selectedSucursal.id)
      .order('created_at', { ascending: false }).limit(50);
    setDevoluciones(data || []);
    setLoading(false);
  };

  const cargarLotesProveedor = async (provId: string) => {
    setProveedorId(provId); setLineas([]); setSearch('');
    if (!almacenId || !provId) { setLotes([]); return; }
    const { data } = await supabase.from('inventario')
      .select('lote_id, cantidad, lotes!inner(id, numero_lote, fecha_caducidad, costo_unitario, proveedor_id, producto_id, productos!inner(nombre, sku))')
      .eq('almacen_id', almacenId).gt('cantidad', 0).eq('lotes.proveedor_id', provId).limit(2000);
    setLotes((data || []).map((r: any) => ({
      lote_id: r.lote_id, cantidad: r.cantidad,
      producto_id: r.lotes.producto_id, producto_nombre: r.lotes.productos.nombre, sku: r.lotes.productos.sku || '',
      numero_lote: r.lotes.numero_lote, fecha_caducidad: r.lotes.fecha_caducidad,
      costo_unitario: Number(r.lotes.costo_unitario) || 0,
    })));
  };

  const filtrados = useMemo(() => {
    const s = search.toLowerCase().trim();
    return lotes.filter(l =>
      !lineas.some(x => x.lote_id === l.lote_id) && (
        !s || l.producto_nombre.toLowerCase().includes(s) || l.sku.toLowerCase().includes(s) || l.numero_lote.toLowerCase().includes(s)
      )
    );
  }, [lotes, lineas, search]);

  const addLinea = (l: LoteRow) => setLineas(prev => [...prev, { ...l, cantidad_devuelta: 1 }]);
  const setCant = (idx: number, n: number) => setLineas(prev => prev.map((l, i) => i === idx ? { ...l, cantidad_devuelta: Math.max(1, Math.min(n, l.cantidad)) } : l));
  const rm = (idx: number) => setLineas(prev => prev.filter((_, i) => i !== idx));
  const total = useMemo(() => lineas.reduce((s, l) => s + l.cantidad_devuelta * l.costo_unitario, 0), [lineas]);

  const abrir = () => {
    if (!almacenId) { toast.error(`Sin almacén en "${selectedSucursal?.nombre}"`); return; }
    setProveedorId(''); setLotes([]); setLineas([]); setMotivo(''); setMotivoOtro(''); setNotas(''); setSearch('');
    setOpen(true);
  };

  const guardar = async () => {
    if (!proveedorId) return toast.error('Selecciona proveedor');
    if (lineas.length === 0) return toast.error('Agrega al menos un lote');
    const motivoFinal = motivo === 'Otro' ? motivoOtro.trim() : motivo;
    if (!motivoFinal) return toast.error('Indica un motivo');
    setSaving(true);
    const { data, error } = await supabase.rpc('registrar_devolucion_proveedor', {
      p_proveedor_id: proveedorId,
      p_sucursal_id: selectedSucursal!.id,
      p_almacen_id: almacenId!,
      p_motivo: motivoFinal,
      p_lineas: lineas.map(l => ({ lote_id: l.lote_id, cantidad: l.cantidad_devuelta })),
      p_notas: notas.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Devolución ${(data as any).numero} registrada — Total $${Number((data as any).total).toFixed(2)}`);
    setOpen(false); loadHistorial();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Undo2 className="h-6 w-6" /> Devoluciones a Proveedor</h1>
          <p className="text-muted-foreground text-sm">Sucursal: {selectedSucursal?.nombre || '—'}</p>
        </div>
        <Button onClick={abrir}><Plus className="h-4 w-4 mr-2" /> Nueva Devolución</Button>
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Folio</TableHead><TableHead>Fecha</TableHead><TableHead>Proveedor</TableHead>
            <TableHead>Motivo</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Estado</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} className="text-center py-6">Cargando…</TableCell></TableRow>
              : devoluciones.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Sin devoluciones registradas</TableCell></TableRow>
              : devoluciones.map(d => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.numero_devolucion}</TableCell>
                  <TableCell className="text-xs">{new Date(d.fecha).toLocaleDateString('es-MX')}</TableCell>
                  <TableCell>{(d.proveedores as any)?.nombre}</TableCell>
                  <TableCell className="text-xs">{d.motivo}</TableCell>
                  <TableCell className="text-right font-mono">${Number(d.total).toFixed(2)}</TableCell>
                  <TableCell><Badge variant="secondary">{d.estado}</Badge></TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva Devolución a Proveedor</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Proveedor *</Label>
                <Select value={proveedorId} onValueChange={cargarLotesProveedor}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre} {p.rfc ? `(${p.rfc})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Motivo *</Label>
                <Select value={motivo} onValueChange={setMotivo}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>{MOTIVOS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
                {motivo === 'Otro' && (
                  <Input className="mt-2" placeholder="Especifica…" value={motivoOtro} onChange={e => setMotivoOtro(e.target.value)} maxLength={100} />
                )}
              </div>
            </div>

            {proveedorId && (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Buscar producto, SKU o lote…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="border rounded-lg">
                    <div className="px-3 py-2 border-b bg-muted text-xs font-semibold">
                      Lotes en stock de este proveedor
                    </div>
                    <div className="max-h-[280px] overflow-y-auto">
                      {filtrados.slice(0, 200).map(l => (
                        <button key={l.lote_id} onClick={() => addLinea(l)}
                          className="w-full text-left px-3 py-2 text-sm border-b last:border-b-0 hover:bg-accent">
                          <div className="font-medium truncate">{l.producto_nombre}</div>
                          <div className="text-xs text-muted-foreground flex justify-between">
                            <span>Lote {l.numero_lote} · cad {l.fecha_caducidad || '—'} · ${l.costo_unitario.toFixed(2)}</span>
                            <span className="font-mono">x{l.cantidad}</span>
                          </div>
                        </button>
                      ))}
                      {filtrados.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">Sin lotes disponibles</p>}
                    </div>
                  </div>
                  <div className="border rounded-lg">
                    <div className="px-3 py-2 border-b bg-muted text-xs font-semibold flex justify-between">
                      <span>A devolver ({lineas.length})</span>
                      <span className="font-mono">Total ${total.toFixed(2)}</span>
                    </div>
                    <div className="max-h-[280px] overflow-y-auto divide-y">
                      {lineas.map((l, idx) => (
                        <div key={l.lote_id} className="px-3 py-2 text-sm flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{l.producto_nombre}</div>
                            <div className="text-xs text-muted-foreground">Lote {l.numero_lote} · ${l.costo_unitario.toFixed(2)} c/u</div>
                          </div>
                          <Input type="number" min={1} max={l.cantidad} value={l.cantidad_devuelta}
                            onChange={e => setCant(idx, parseInt(e.target.value) || 1)} className="w-20" />
                          <Button size="icon" variant="ghost" onClick={() => rm(idx)}><X className="h-4 w-4" /></Button>
                        </div>
                      ))}
                      {lineas.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">Agrega lotes desde la izquierda</p>}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div>
              <Label>Notas adicionales</Label>
              <Textarea rows={2} value={notas} onChange={e => setNotas(e.target.value)} maxLength={500} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Registrar devolución
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DevolucionesProveedorPage;
