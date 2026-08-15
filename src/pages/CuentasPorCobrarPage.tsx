import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HandCoins, Loader2, RefreshCw, Paperclip, ChevronDown, ChevronRight, Upload } from 'lucide-react';
import { toast } from 'sonner';

// Cobranza: el saldo se lleva POR CLIENTE (suma de sus ventas a crédito menos
// sus abonos). Los abonos son manuales, siempre con comprobante, y la RPC
// impide abonar más que el saldo pendiente.
type ResumenCxC = {
  cliente_id: string;
  cliente_nombre: string;
  rfc: string | null;
  dias_credito: number | null;
  limite_credito: number | null;
  num_ventas: number;
  total_credito: number;
  abonado: number;
  saldo: number;
  venta_mas_antigua: string | null;
  dias_antiguedad: number | null;
  vencido: boolean;
};

const money = (n: number) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CuentasPorCobrarPage = () => {
  const [rows, setRows] = useState<ResumenCxC[]>([]);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState<'pendientes' | 'vencidos' | 'todos'>('pendientes');
  const [busqueda, setBusqueda] = useState('');
  const [expandido, setExpandido] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Record<string, { ventas: any[]; abonos: any[] }>>({});
  const [abonar, setAbonar] = useState<ResumenCxC | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    monto: '',
    fecha: new Date().toISOString().slice(0, 10),
    metodo_pago: 'transferencia',
    referencia: '',
    notas: '',
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('cxc_resumen');
    if (error) toast.error(error.message);
    setRows((data || []) as ResumenCxC[]);
    setLoading(false);
  }

  async function toggleDetalle(clienteId: string) {
    if (expandido === clienteId) { setExpandido(null); return; }
    setExpandido(clienteId);
    if (detalle[clienteId]) return;
    const [{ data: ventas }, { data: abonos }] = await Promise.all([
      (supabase as any).from('ventas')
        .select('id, numero_venta, fecha, total, estado')
        .eq('cliente_id', clienteId).eq('tipo_venta', 'credito').neq('estado', 'cancelada')
        .order('fecha', { ascending: false }).limit(200),
      (supabase as any).from('cxc_abonos')
        .select('id, fecha, monto, metodo_pago, referencia, comprobante_url, notas')
        .eq('cliente_id', clienteId).order('fecha', { ascending: false }),
    ]);
    setDetalle(prev => ({ ...prev, [clienteId]: { ventas: ventas || [], abonos: abonos || [] } }));
  }

  async function verComprobante(path: string) {
    const { data, error } = await supabase.storage.from('comprobantes-pago').createSignedUrl(path, 60);
    if (error || !data?.signedUrl) { toast.error('No se pudo abrir el comprobante'); return; }
    window.open(data.signedUrl, '_blank');
  }

  function abrirAbono(r: ResumenCxC) {
    setAbonar(r);
    setArchivo(null);
    setForm({
      monto: String(r.saldo.toFixed(2)),
      fecha: new Date().toISOString().slice(0, 10),
      metodo_pago: 'transferencia',
      referencia: '',
      notas: '',
    });
  }

  async function registrarAbono() {
    if (!abonar) return;
    const monto = parseFloat(form.monto || '0');
    if (!monto || monto <= 0) { toast.error('Captura un monto mayor a cero'); return; }
    if (monto > abonar.saldo + 0.001) { toast.error('El abono no puede ser mayor al saldo pendiente'); return; }
    if (!archivo) { toast.error('Adjunta el comprobante del abono'); return; }
    setGuardando(true);

    const ext = archivo.name.split('.').pop() || 'pdf';
    const path = `cxc/${abonar.cliente_id}/abono_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('comprobantes-pago').upload(path, archivo);
    if (upErr) { setGuardando(false); toast.error(`Error subiendo comprobante: ${upErr.message}`); return; }

    const { error } = await (supabase as any).rpc('cxc_registrar_abono', {
      p_cliente_id: abonar.cliente_id,
      p_monto: monto,
      p_fecha: form.fecha,
      p_metodo_pago: form.metodo_pago,
      p_referencia: form.referencia || null,
      p_comprobante_url: path,
      p_notas: form.notas || null,
    });
    setGuardando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Abono de ${money(monto)} registrado a ${abonar.cliente_nombre}`);
    setDetalle(prev => { const c = { ...prev }; delete c[abonar.cliente_id]; return c; });
    setAbonar(null);
    load();
  }

  const filtradas = rows.filter(r => {
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      if (!`${r.cliente_nombre} ${r.rfc || ''}`.toLowerCase().includes(q)) return false;
    }
    if (estado === 'pendientes') return r.saldo > 0.009;
    if (estado === 'vencidos') return r.vencido;
    return true;
  });

  const conSaldo = rows.filter(r => r.saldo > 0.009);
  const vencidos = rows.filter(r => r.vencido);
  const totalSaldo = useMemo(() => conSaldo.reduce((s, r) => s + r.saldo, 0), [rows]);
  const totalVencido = useMemo(() => vencidos.reduce((s, r) => s + r.saldo, 0), [rows]);
  const totalCobrado = useMemo(() => rows.reduce((s, r) => s + r.abonado, 0), [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HandCoins className="h-6 w-6" /> Cuentas por Cobrar
        </h1>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" /> Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Saldo por cobrar</p>
          <p className="text-2xl font-bold mt-1">{money(totalSaldo)}</p>
          <p className="text-xs text-muted-foreground">{conSaldo.length} clientes</p>
        </CardContent></Card>
        <Card className="border-destructive/50"><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Vencido</p>
          <p className="text-2xl font-bold mt-1 text-destructive">{money(totalVencido)}</p>
          <p className="text-xs text-muted-foreground">{vencidos.length} clientes fuera de plazo</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Cobrado (abonos)</p>
          <p className="text-2xl font-bold mt-1 text-green-600">{money(totalCobrado)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Ventas a crédito</p>
          <p className="text-2xl font-bold mt-1">{rows.reduce((s, r) => s + Number(r.num_ventas || 0), 0)}</p>
        </CardContent></Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={estado} onValueChange={(v) => setEstado(v as any)}>
          <TabsList>
            <TabsTrigger value="pendientes">Con saldo</TabsTrigger>
            <TabsTrigger value="vencidos">Vencidos</TabsTrigger>
            <TabsTrigger value="todos">Todos</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input placeholder="Buscar cliente o RFC…" value={busqueda}
          onChange={e => setBusqueda(e.target.value)} className="max-w-xs" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filtradas.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Sin cuentas por cobrar con esos filtros.</p>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-center">Ventas</TableHead>
                  <TableHead className="text-right">Crédito</TableHead>
                  <TableHead className="text-right">Abonado</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Antigüedad</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map(r => (
                  <>
                    <TableRow key={r.cliente_id} className="cursor-pointer" onClick={() => toggleDetalle(r.cliente_id)}>
                      <TableCell>{expandido === r.cliente_id
                        ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                      <TableCell>
                        <p className="font-medium">{r.cliente_nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.rfc || 'Sin RFC'} · {r.dias_credito ?? 30} días de crédito
                        </p>
                      </TableCell>
                      <TableCell className="text-center">{r.num_ventas}</TableCell>
                      <TableCell className="text-right">{money(r.total_credito)}</TableCell>
                      <TableCell className="text-right text-green-600">{money(r.abonado)}</TableCell>
                      <TableCell className="text-right font-bold">{money(r.saldo)}</TableCell>
                      <TableCell>
                        {r.saldo <= 0.009
                          ? <Badge className="bg-green-100 text-green-700">Saldado</Badge>
                          : r.vencido
                            ? <Badge variant="destructive">Vencido {r.dias_antiguedad}d</Badge>
                            : <Badge variant="secondary">{r.dias_antiguedad ?? 0}d</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.saldo > 0.009 && (
                          <Button size="sm" variant="outline"
                            onClick={(e) => { e.stopPropagation(); abrirAbono(r); }}>
                            Registrar abono
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {expandido === r.cliente_id && (
                      <TableRow key={`${r.cliente_id}-det`}>
                        <TableCell colSpan={8} className="bg-muted/40">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-2">
                            <div>
                              <p className="text-sm font-semibold mb-2">Ventas a crédito</p>
                              {(detalle[r.cliente_id]?.ventas || []).length === 0 ? (
                                <p className="text-xs text-muted-foreground">Sin ventas a crédito.</p>
                              ) : (
                                <div className="space-y-1">
                                  {detalle[r.cliente_id].ventas.map((v: any) => (
                                    <div key={v.id} className="flex justify-between text-xs">
                                      <span>{v.numero_venta} · {String(v.fecha).slice(0, 10)}</span>
                                      <span className="font-medium">{money(v.total)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-semibold mb-2">Historial de abonos</p>
                              {(detalle[r.cliente_id]?.abonos || []).length === 0 ? (
                                <p className="text-xs text-muted-foreground">Sin abonos registrados.</p>
                              ) : (
                                <div className="space-y-1">
                                  {detalle[r.cliente_id].abonos.map((a: any) => (
                                    <div key={a.id} className="flex justify-between items-center text-xs gap-2">
                                      <span>
                                        {String(a.fecha).slice(0, 10)} · {a.metodo_pago || '—'}
                                        {a.referencia ? ` · ${a.referencia}` : ''}
                                      </span>
                                      <span className="flex items-center gap-2">
                                        <span className="font-medium text-green-600">{money(a.monto)}</span>
                                        {a.comprobante_url && (
                                          <Button size="sm" variant="ghost" className="h-6 px-1"
                                            onClick={() => verComprobante(a.comprobante_url)}>
                                            <Paperclip className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!abonar} onOpenChange={(o) => !o && setAbonar(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar abono</DialogTitle></DialogHeader>
          {abonar && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">{abonar.cliente_nombre}</p>
                <p className="text-muted-foreground text-xs">Saldo actual: {money(abonar.saldo)}</p>
              </div>
              <div>
                <Label>Monto del abono *</Label>
                <Input type="number" min={0} step="0.01" value={form.monto}
                  onChange={e => setForm({ ...form, monto: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fecha *</Label>
                  <Input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} />
                </div>
                <div>
                  <Label>Método *</Label>
                  <Select value={form.metodo_pago} onValueChange={v => setForm({ ...form, metodo_pago: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="tarjeta">Tarjeta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Referencia</Label>
                <Input value={form.referencia} onChange={e => setForm({ ...form, referencia: e.target.value })}
                  placeholder="Folio, autorización o número de operación" />
              </div>
              <div>
                <Label>Comprobante (PDF o imagen) *</Label>
                <Input type="file" accept="application/pdf,image/*"
                  onChange={e => setArchivo(e.target.files?.[0] || null)} />
                {archivo && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Upload className="h-3 w-3" /> {archivo.name}
                  </p>
                )}
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea rows={2} value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbonar(null)} disabled={guardando}>Cancelar</Button>
            <Button onClick={registrarAbono} disabled={guardando}>
              {guardando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Registrar abono
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CuentasPorCobrarPage;
