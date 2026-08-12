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
import { Wallet, Loader2, Receipt, Lock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

// Unidad de pago = FOLIO DE FACTURA. Los estados de cuenta del proveedor
// llegan por factura, no por orden de compra, así que el folio de factura es
// el dato prominente y el folio de la orden queda como referencia secundaria.
export type FacturaCxP = {
  factura_id: string;
  folio_factura: string;
  fecha_factura: string | null;
  fecha_limite_pago: string | null;
  dias_credito: number | null;
  importe: number;
  notas_credito: number;
  importe_neto: number;
  pagado: number;
  saldo: number;
  pagada: boolean;
  dias_para_vencer: number | null;
  orden_id: string;
  orden_folio: string;
  orden_total: number;
  compra_id: string | null;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  sucursal_id: string | null;
  sucursal_codigo: string | null;
};

const money = (n: number) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const bucket = (d: number | null) => {
  if (d === null) return 'sin_fecha';
  if (d >= 0) return 'corriente';
  const v = -d;
  if (v <= 30) return '1_30';
  if (v <= 60) return '31_60';
  if (v <= 90) return '61_90';
  return '90+';
};

const FacturasPorPagar = () => {
  const [rows, setRows] = useState<FacturaCxP[]>([]);
  const [loading, setLoading] = useState(true);
  const [cuentasBan, setCuentasBan] = useState<any[]>([]);
  const [estado, setEstado] = useState<'pendientes' | 'vencidas' | 'pagadas' | 'todas'>('pendientes');
  const [filtroProv, setFiltroProv] = useState('all');
  const [filtroAnt, setFiltroAnt] = useState('all');
  const [busqueda, setBusqueda] = useState('');
  const [pagar, setPagar] = useState<FacturaCxP | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    forma_pago: 'transferencia',
    referencia: '',
    banco_cuenta_id: '',
    notas: '',
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data, error }, { data: ctas }] = await Promise.all([
      (supabase as any).rpc('cxp_facturas_pendientes'),
      supabase.from('cuentas_bancarias').select('id, alias').eq('activo', true).order('alias'),
    ]);
    if (error) toast.error(error.message);
    setRows((data || []) as FacturaCxP[]);
    setCuentasBan(ctas || []);
    setLoading(false);
  }

  const proveedores = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach(r => { if (r.proveedor_id) m.set(r.proveedor_id, r.proveedor_nombre || '—'); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtradas = rows.filter(r => {
    if (filtroProv !== 'all' && r.proveedor_id !== filtroProv) return false;
    if (filtroAnt !== 'all' && bucket(r.dias_para_vencer) !== filtroAnt) return false;
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      if (!`${r.folio_factura} ${r.orden_folio} ${r.proveedor_nombre || ''}`.toLowerCase().includes(q)) return false;
    }
    if (estado === 'todas') return true;
    if (estado === 'pagadas') return r.pagada;
    if (estado === 'pendientes') return !r.pagada;
    if (estado === 'vencidas') return !r.pagada && r.dias_para_vencer !== null && r.dias_para_vencer < 0;
    return true;
  });

  const pendientes = rows.filter(r => !r.pagada);
  const vencidas = pendientes.filter(r => r.dias_para_vencer !== null && r.dias_para_vencer < 0);
  const totalPendiente = pendientes.reduce((s, r) => s + r.saldo, 0);
  const totalVencido = vencidas.reduce((s, r) => s + r.saldo, 0);
  const proximas = pendientes.filter(r => r.dias_para_vencer !== null && r.dias_para_vencer >= 0 && r.dias_para_vencer <= 7);

  function abrirPago(f: FacturaCxP) {
    setPagar(f);
    setForm({
      fecha: new Date().toISOString().slice(0, 10),
      forma_pago: 'transferencia',
      referencia: '',
      banco_cuenta_id: '',
      notas: '',
    });
  }

  async function registrarPago() {
    if (!pagar) return;
    setGuardando(true);
    // El monto NO se envía: la RPC paga siempre el importe neto completo de la
    // factura. Así ningún error de captura puede colar un pago parcial.
    const { data, error } = await (supabase as any).rpc('pagar_factura_oc', {
      p_factura_id: pagar.factura_id,
      p_fecha: form.fecha,
      p_forma_pago: form.forma_pago,
      p_referencia: form.referencia || null,
      p_banco_cuenta_id: form.banco_cuenta_id || null,
      p_notas: form.notas || null,
    });
    setGuardando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Factura ${pagar.folio_factura} pagada por ${money(data?.monto || pagar.importe_neto)}${data?.compra_saldada ? ' — compra saldada' : ''}`);
    setPagar(null);
    load();
  }

  const badgeVenc = (r: FacturaCxP) => {
    if (r.pagada) return <Badge className="bg-green-100 text-green-700">Pagada</Badge>;
    const d = r.dias_para_vencer;
    if (d === null) return <Badge variant="secondary">Sin fecha</Badge>;
    if (d < 0) return <Badge variant="destructive">Vencida {Math.abs(d)}d</Badge>;
    if (d === 0) return <Badge className="bg-amber-500">Vence hoy</Badge>;
    if (d <= 7) return <Badge className="bg-amber-500">En {d}d</Badge>;
    return <Badge variant="secondary">En {d}d</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Saldo por factura</p>
          <p className="text-2xl font-bold mt-1">{money(totalPendiente)}</p>
          <p className="text-xs text-muted-foreground">{pendientes.length} facturas</p>
        </CardContent></Card>
        <Card className="border-destructive/50"><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Vencidas</p>
          <p className="text-2xl font-bold mt-1 text-destructive">{money(totalVencido)}</p>
          <p className="text-xs text-muted-foreground">{vencidas.length} facturas</p>
        </CardContent></Card>
        <Card className="border-amber-500/50"><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Vencen en 7 días</p>
          <p className="text-2xl font-bold mt-1 text-amber-600">{money(proximas.reduce((s, r) => s + r.saldo, 0))}</p>
          <p className="text-xs text-muted-foreground">{proximas.length} facturas</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Pagadas</p>
          <p className="text-2xl font-bold mt-1">{rows.filter(r => r.pagada).length}</p>
          <p className="text-xs text-muted-foreground">histórico</p>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={estado} onValueChange={(v: any) => setEstado(v)}>
          <TabsList>
            <TabsTrigger value="pendientes">Pendientes ({pendientes.length})</TabsTrigger>
            <TabsTrigger value="vencidas">Vencidas ({vencidas.length})</TabsTrigger>
            <TabsTrigger value="pagadas">Pagadas</TabsTrigger>
            <TabsTrigger value="todas">Todas</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="min-w-[220px]">
          <Label className="text-xs">Buscar folio de factura</Label>
          <Input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Ej. A-4521" />
        </div>
        <div className="min-w-[200px]">
          <Label className="text-xs">Proveedor</Label>
          <Select value={filtroProv} onValueChange={setFiltroProv}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {proveedores.map(([id, nombre]) => <SelectItem key={id} value={id}>{nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <Label className="text-xs">Antigüedad</Label>
          <Select value={filtroAnt} onValueChange={setFiltroAnt}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="corriente">Corriente</SelectItem>
              <SelectItem value="1_30">1-30 d</SelectItem>
              <SelectItem value="31_60">31-60 d</SelectItem>
              <SelectItem value="61_90">61-90 d</SelectItem>
              <SelectItem value="90+">90+ d</SelectItem>
              <SelectItem value="sin_fecha">Sin fecha</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={load}>
          <RefreshCw className="h-4 w-4" /> Refrescar
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Factura</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Suc.</TableHead>
                <TableHead>Pago límite</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead className="text-right">Importe</TableHead>
                <TableHead className="text-right">Notas de crédito</TableHead>
                <TableHead className="text-right">A pagar</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8">Cargando...</TableCell></TableRow>
              ) : filtradas.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Sin facturas en este filtro</TableCell></TableRow>
              ) : filtradas.map(r => (
                <TableRow key={r.factura_id}>
                  <TableCell>
                    <div className="font-semibold text-base leading-tight">{r.folio_factura}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.fecha_factura || 'sin fecha'} · OC {r.orden_folio}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{r.proveedor_nombre || '—'}</TableCell>
                  <TableCell><Badge variant="outline">{r.sucursal_codigo || '—'}</Badge></TableCell>
                  <TableCell className="text-xs">
                    {r.fecha_limite_pago || '—'}
                    {r.dias_credito != null && <div className="text-[10px] text-muted-foreground">{r.dias_credito} días crédito</div>}
                  </TableCell>
                  <TableCell className="text-center">{badgeVenc(r)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.importe ? money(r.importe) : <span className="text-xs text-muted-foreground">sin importe</span>}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{r.notas_credito ? `- ${money(r.notas_credito)}` : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums font-bold">{money(r.pagada ? r.pagado : r.saldo)}</TableCell>
                  <TableCell>
                    {!r.pagada && (
                      <Button size="sm" disabled={!r.importe || !r.compra_id} onClick={() => abrirPago(r)}>
                        <Wallet className="h-3 w-3 mr-1" /> Pagar completa
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!pagar} onOpenChange={o => !o && setPagar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" /> Pagar factura {pagar?.folio_factura}
            </DialogTitle>
          </DialogHeader>
          {pagar && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 space-y-1 text-sm">
                <div className="text-xl font-bold leading-tight">{pagar.folio_factura}</div>
                <div className="text-xs text-muted-foreground">
                  {pagar.proveedor_nombre} · OC {pagar.orden_folio} · {pagar.fecha_factura || 'sin fecha'}
                </div>
                <div className="flex justify-between pt-2"><span>Importe factura</span><span className="tabular-nums">{money(pagar.importe)}</span></div>
                {pagar.notas_credito > 0 && (
                  <div className="flex justify-between text-muted-foreground"><span>Notas de crédito</span><span className="tabular-nums">- {money(pagar.notas_credito)}</span></div>
                )}
                <div className="flex justify-between border-t pt-2 font-bold"><span>Monto a pagar</span><span className="tabular-nums">{money(pagar.importe_neto)}</span></div>
              </div>
              <div className="flex items-start gap-2 rounded-md bg-muted/50 border p-2 text-xs text-muted-foreground">
                <Lock className="h-4 w-4 shrink-0 mt-0.5" />
                Los pagos a proveedor son siempre por la factura completa. El monto no es editable: se paga el importe neto de esta factura.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Fecha de pago</Label>
                  <Input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Forma de pago</Label>
                  <Select value={form.forma_pago} onValueChange={v => setForm({ ...form, forma_pago: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="tarjeta">Tarjeta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Cuenta bancaria</Label>
                  <Select value={form.banco_cuenta_id} onValueChange={v => setForm({ ...form, banco_cuenta_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                    <SelectContent>
                      {cuentasBan.map(c => <SelectItem key={c.id} value={c.id}>{c.alias}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Referencia</Label>
                  <Input value={form.referencia} onChange={e => setForm({ ...form, referencia: e.target.value })} placeholder="No. de operación" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notas</Label>
                <Textarea value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagar(null)}>Cancelar</Button>
            <Button onClick={registrarPago} disabled={guardando}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Wallet className="h-4 w-4 mr-1" />}
              Pagar {pagar ? money(pagar.importe_neto) : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FacturasPorPagar;
