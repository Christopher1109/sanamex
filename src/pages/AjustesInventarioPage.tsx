import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClipboardEdit, Search, Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';

// Ajustes de inventario manuales (pedido Alejandro, minuto 41 de la sesión
// 20-jul-2026): "cuando hacemos un inventario, a veces hay piezas de más,
// piezas de menos... esas las ajusta el auditor". Solo auditoría/admin.
const ROLES_PERMITIDOS = ['auditoria', 'auditor', 'admin', 'super_admin'];

interface LoteOpcion {
  lote_id: string;
  numero_lote: string;
  fecha_caducidad: string | null;
  cantidad_actual: number;
  producto_id: string;
  producto_nombre: string;
  producto_sku: string;
}

const AjustesInventarioPage = () => {
  const { selectedSucursal } = useSucursal();
  const { userRole } = useAuth();
  const puedeAjustar = !!userRole && ROLES_PERMITIDOS.includes(userRole);

  const [almacenId, setAlmacenId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [resultados, setResultados] = useState<LoteOpcion[]>([]);
  const [seleccionado, setSeleccionado] = useState<LoteOpcion | null>(null);
  const [cantidadAjuste, setCantidadAjuste] = useState('');
  const [motivos, setMotivos] = useState<{ id: string; nombre: string }[]>([]);
  const [motivoId, setMotivoId] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [historial, setHistorial] = useState<any[]>([]);

  useEffect(() => { if (selectedSucursal) { loadAlmacen(); loadMotivos(); loadHistorial(); } }, [selectedSucursal]);

  const loadAlmacen = async () => {
    if (!selectedSucursal) return;
    const { data } = await supabase.from('almacenes').select('id').eq('sucursal_id', selectedSucursal.id).eq('activo', true).limit(1);
    setAlmacenId(data?.[0]?.id || null);
  };

  const loadMotivos = async () => {
    const { data } = await supabase.from('motivos_ajuste').select('id, nombre').eq('tipo', 'ajuste').eq('activo', true);
    setMotivos(data || []);
    if (data?.[0]) setMotivoId(data[0].id);
  };

  const loadHistorial = async () => {
    if (!selectedSucursal) return;
    const { data } = await supabase
      .from('movimientos_inventario')
      .select('*, lotes(numero_lote, productos(nombre, sku)), motivos_ajuste(nombre)')
      .eq('tipo', 'ajuste')
      .eq('sucursal_id', selectedSucursal.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setHistorial(data || []);
  };

  const buscar = async () => {
    if (!almacenId || !search.trim()) { setResultados([]); return; }
    const { data } = await supabase
      .from('inventario')
      .select('cantidad, lote_id, lotes(numero_lote, fecha_caducidad, producto_id, productos(nombre, sku))')
      .eq('almacen_id', almacenId)
      .or(`lotes.productos.nombre.ilike.%${search}%,lotes.productos.sku.ilike.%${search}%,lotes.numero_lote.ilike.%${search}%`);
    const opciones: LoteOpcion[] = (data || [])
      .filter((r: any) => r.lotes?.productos)
      .map((r: any) => ({
        lote_id: r.lote_id,
        numero_lote: r.lotes.numero_lote,
        fecha_caducidad: r.lotes.fecha_caducidad,
        cantidad_actual: r.cantidad,
        producto_id: r.lotes.producto_id,
        producto_nombre: r.lotes.productos.nombre,
        producto_sku: r.lotes.productos.sku,
      }));
    setResultados(opciones);
  };

  const guardarAjuste = async () => {
    if (!almacenId || !seleccionado || !motivoId) { toast.error('Completa producto/lote y motivo'); return; }
    const cant = parseInt(cantidadAjuste);
    if (!cant || cant === 0) { toast.error('Captura una cantidad distinta de cero'); return; }
    setGuardando(true);
    const { data, error } = await (supabase as any).rpc('registrar_ajuste_inventario', {
      p_almacen_id: almacenId,
      p_lote_id: seleccionado.lote_id,
      p_cantidad_ajuste: cant,
      p_motivo_id: motivoId,
      p_notas: notas || null,
    });
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success(`Ajuste registrado. Nueva cantidad en ese lote: ${data?.nueva_cantidad}`);
    setSeleccionado(null); setCantidadAjuste(''); setNotas(''); setSearch(''); setResultados([]);
    loadHistorial();
  };

  if (!puedeAjustar) {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        Solo auditoría o administración pueden registrar ajustes de inventario.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardEdit className="h-6 w-6" /> Ajustes de Inventario</h1>
        <p className="text-muted-foreground">
          {selectedSucursal?.nombre} — Corrige piezas de más o de menos detectadas en conteo físico. Cada ajuste queda registrado y visible en el Kardex (filtro "Ajustes").
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Nuevo ajuste</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar producto, SKU o lote…" value={search}
              onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()} />
          </div>
          <Button size="sm" variant="outline" onClick={buscar}>Buscar</Button>

          {resultados.length > 0 && !seleccionado && (
            <div className="border rounded-lg max-h-64 overflow-y-auto divide-y">
              {resultados.map(r => (
                <button key={r.lote_id} onClick={() => setSeleccionado(r)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex justify-between items-center">
                  <div>
                    <p className="font-medium">{r.producto_nombre}</p>
                    <p className="text-xs text-muted-foreground">{r.producto_sku} · Lote {r.numero_lote} · cad {r.fecha_caducidad || '—'}</p>
                  </div>
                  <span className="font-mono text-sm">stock: {r.cantidad_actual}</span>
                </button>
              ))}
            </div>
          )}

          {seleccionado && (
            <div className="border rounded-lg p-4 space-y-3 bg-accent/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{seleccionado.producto_nombre}</p>
                  <p className="text-xs text-muted-foreground">{seleccionado.producto_sku} · Lote {seleccionado.numero_lote} · Stock actual: {seleccionado.cantidad_actual}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSeleccionado(null)}>Cambiar</Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Cantidad a ajustar</Label>
                  <Input type="number" placeholder="Ej. 5 o -3" value={cantidadAjuste} onChange={e => setCantidadAjuste(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                    {cantidadAjuste && parseInt(cantidadAjuste) > 0 && <><Plus className="h-3 w-3 text-green-600" /> Sobrante — sube el stock</>}
                    {cantidadAjuste && parseInt(cantidadAjuste) < 0 && <><Minus className="h-3 w-3 text-rose-600" /> Faltante — baja el stock</>}
                    {!cantidadAjuste && 'Positivo = sobrante encontrado. Negativo = faltante encontrado.'}
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Motivo</Label>
                  <Select value={motivoId} onValueChange={setMotivoId}>
                    <SelectTrigger><SelectValue placeholder="Selecciona motivo" /></SelectTrigger>
                    <SelectContent>
                      {motivos.map(m => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Notas (opcional)</Label>
                <Textarea rows={2} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej. Conteo físico mensual, área de refrigerados…" />
              </div>
              <div className="flex justify-end">
                <Button onClick={guardarAjuste} disabled={guardando}>Registrar ajuste</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Historial reciente</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead><TableHead>Producto</TableHead><TableHead>Lote</TableHead>
                <TableHead>Motivo</TableHead><TableHead className="text-right">Ajuste</TableHead><TableHead>Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historial.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin ajustes registrados todavía</TableCell></TableRow>
              ) : historial.map(h => (
                <TableRow key={h.id}>
                  <TableCell className="text-xs">{new Date(h.created_at).toLocaleDateString('es-MX')}</TableCell>
                  <TableCell className="font-medium">{h.lotes?.productos?.nombre}</TableCell>
                  <TableCell className="font-mono text-xs">{h.lotes?.numero_lote}</TableCell>
                  <TableCell className="text-xs">{h.motivos_ajuste?.nombre || '—'}</TableCell>
                  <TableCell className="text-right">
                    <Badge className={h.cantidad > 0 ? 'bg-green-600' : 'bg-rose-600'}>{h.cantidad > 0 ? '+' : ''}{h.cantidad}</Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{h.notas || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AjustesInventarioPage;
