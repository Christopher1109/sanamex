import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Receipt, Download, Ban, FlaskConical, CreditCard, FileMinus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const FN_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`;

export default function FiscalPage() {
  const { availableSucursales } = useSucursal();
  const [config, setConfig] = useState<any>(null);
  const [cfdis, setCfdis] = useState<any[]>([]);
  const [ventas, setVentas] = useState<any[]>([]);
  const [form, setForm] = useState({ rfc: '', razon_social: '', regimen_fiscal: '601', cp_emisor: '', pac_proveedor: 'Facturapi', serie_default: 'A' });
  const [timbrando, setTimbrando] = useState<string | null>(null);
  const [dialogVenta, setDialogVenta] = useState<any>(null);
  const [verDemo, setVerDemo] = useState(false);
  const [dialogPago, setDialogPago] = useState<any>(null);
  const [dialogNota, setDialogNota] = useState<any>(null);
  const [pagoForm, setPagoForm] = useState({ monto: '', fecha: new Date().toISOString().slice(0,10), forma_pago: '03', num_parcialidad: 1 });
  const [notaForm, setNotaForm] = useState({ monto: '', motivo: 'Devolución / descuento', forma_pago: '01' });
  const [procesando, setProcesando] = useState(false);
  const [receptor, setReceptor] = useState({
    rfc: 'XAXX010101000', nombre: 'PUBLICO EN GENERAL', regimen_fiscal: '616', cp: '', email: '',
    forma_pago: '01', metodo_pago: 'PUE' as 'PUE' | 'PPD', uso_cfdi: 'S01', lineas_con_iva: false,
  });

  const sucursalIds = availableSucursales.map(s => s.id);
  const sucursalMap = Object.fromEntries(availableSucursales.map(s => [s.id, s.codigo || s.nombre]));

  useEffect(() => { loadConfig(); loadCfdis(); loadVentas(); /* eslint-disable-next-line */ }, [availableSucursales.length, verDemo]);

  async function loadConfig() {
    // Configuración fiscal GLOBAL (compartida por todas las distribuidoras)
    const { data } = await supabase.from('configuracion_fiscal').select('*').is('sucursal_id', null).maybeSingle();
    if (data) { setConfig(data); setForm({ rfc: data.rfc || '', razon_social: data.razon_social || '', regimen_fiscal: data.regimen_fiscal || '601', cp_emisor: data.cp_emisor || '', pac_proveedor: data.pac_proveedor || 'Facturapi', serie_default: data.serie_default || 'A' }); } else setConfig(null);
  }
  async function loadCfdis() {
    if (sucursalIds.length === 0) { setCfdis([]); return; }
    let q = supabase.from('cfdi_emitidos').select('*').in('sucursal_id', sucursalIds).order('created_at', { ascending: false }).limit(100);
    if (!verDemo) q = q.eq('es_demo', false);
    const { data } = await q;
    setCfdis(data || []);
  }
  async function loadVentas() {
    if (sucursalIds.length === 0) { setVentas([]); return; }

    // Ventas POS completadas
    const { data: ventasData } = await supabase
      .from('ventas')
      .select('id, numero_venta, total, fecha, estado, sucursal_id, cliente_id, clientes(nombre, rfc)')
      .in('sucursal_id', sucursalIds)
      .eq('estado', 'completada')
      .order('fecha', { ascending: false })
      .limit(50);

    // Pedidos entregados (mayoreo)
    const { data: pedidosData } = await supabase
      .from('pedidos')
      .select('id, numero_pedido, created_at, estado, sucursal_id, cliente_id, clientes(nombre, rfc), pedido_lineas(subtotal)')
      .in('sucursal_id', sucursalIds)
      .eq('estado', 'entregado')
      .order('created_at', { ascending: false })
      .limit(50);

    // Excluir los que ya están timbrados
    const { data: cfdiOk } = await supabase
      .from('cfdi_emitidos')
      .select('venta_id, pedido_id')
      .eq('estado', 'timbrado');
    const ventasTimbradas = new Set((cfdiOk || []).map((c: any) => c.venta_id).filter(Boolean));
    const pedidosTimbrados = new Set((cfdiOk || []).map((c: any) => c.pedido_id).filter(Boolean));

    const ventasNorm = (ventasData || [])
      .filter((v: any) => !ventasTimbradas.has(v.id))
      .map((v: any) => ({ ...v, origen: 'venta' as const, numero: v.numero_venta, fecha_ord: v.fecha }));

    const pedidosNorm = (pedidosData || [])
      .filter((p: any) => !pedidosTimbrados.has(p.id))
      .map((p: any) => ({
        id: p.id,
        origen: 'pedido' as const,
        numero: p.numero_pedido,
        fecha: p.created_at,
        fecha_ord: p.created_at,
        sucursal_id: p.sucursal_id,
        cliente_id: p.cliente_id,
        clientes: p.clientes,
        total: (p.pedido_lineas || []).reduce((s: number, l: any) => s + Number(l.subtotal || 0), 0),
      }));

    const merged = [...ventasNorm, ...pedidosNorm].sort((a, b) =>
      new Date(b.fecha_ord).getTime() - new Date(a.fecha_ord).getTime()
    );
    setVentas(merged);
  }

  async function save() {
    const payload = { ...form, sucursal_id: null, updated_at: new Date().toISOString() };
    const { error } = config
      ? await supabase.from('configuracion_fiscal').update(payload).eq('id', config.id)
      : await supabase.from('configuracion_fiscal').insert(payload);
    if (error) toast.error(error.message); else { toast.success('Configuración fiscal global guardada'); loadConfig(); }
  }

  function openTimbrar(v: any) {
    const tieneRfc = v.clientes?.rfc;
    setReceptor({
      rfc: tieneRfc || 'XAXX010101000',
      nombre: tieneRfc ? v.clientes.nombre : 'PUBLICO EN GENERAL',
      regimen_fiscal: tieneRfc ? '612' : '616',
      cp: config?.cp_emisor || '',
      email: '',
      forma_pago: '01',
      metodo_pago: 'PUE',
      uso_cfdi: tieneRfc ? 'G03' : 'S01',
      lineas_con_iva: false,
    });
    setDialogVenta(v);
  }

  async function confirmarTimbrar() {
    if (!dialogVenta) return;
    setTimbrando(dialogVenta.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${FN_BASE}/facturapi-timbrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          venta_id: dialogVenta.origen === 'venta' ? dialogVenta.id : undefined,
          pedido_id: dialogVenta.origen === 'pedido' ? dialogVenta.id : undefined,
          uso_cfdi: receptor.uso_cfdi,
          forma_pago: receptor.forma_pago,
          metodo_pago: receptor.metodo_pago,
          lineas_con_iva: receptor.lineas_con_iva,
          receptor: {
            rfc: receptor.rfc.toUpperCase(),
            nombre: receptor.nombre.toUpperCase(),
            regimen_fiscal: receptor.regimen_fiscal,
            cp: receptor.cp,
            email: receptor.email || undefined,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body?.error || 'Error al timbrar', { description: body?.detalle?.message });
      } else {
        toast.success(`CFDI timbrado · UUID ${body.cfdi.uuid_sat}`);
        setDialogVenta(null);
        loadCfdis();
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTimbrando(null);
    }
  }

  async function descargar(cfdi: any, formato: 'pdf' | 'xml') {
    const facturapiId = (cfdi.pac_response as any)?.id;
    if (!facturapiId) return toast.error('Este CFDI no tiene id Facturapi');
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${FN_BASE}/facturapi-descargar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ facturapi_id: facturapiId, formato }),
    });
    if (!res.ok) { toast.error('Error al descargar'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `cfdi-${cfdi.serie}${cfdi.folio}.${formato}`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function cancelar(cfdi: any) {
    if (!confirm('¿Cancelar este CFDI?')) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${FN_BASE}/facturapi-cancelar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ cfdi_id: cfdi.id, motivo: '02' }),
    });
    const body = await res.json();
    if (!res.ok) toast.error(body?.error || 'Error al cancelar');
    else { toast.success('CFDI cancelado'); loadCfdis(); }
  }

  async function emitirREP() {
    if (!dialogPago) return;
    const monto = Number(pagoForm.monto);
    if (!monto || monto <= 0) return toast.error('Monto inválido');
    setProcesando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${FN_BASE}/facturapi-complemento-pago`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          factura_id: dialogPago.id, monto, fecha_pago: pagoForm.fecha,
          forma_pago: pagoForm.forma_pago, num_parcialidad: pagoForm.num_parcialidad,
        }),
      });
      const body = await res.json();
      if (!res.ok) toast.error(body?.error || 'Error emitiendo REP', { description: body?.detalle?.message });
      else { toast.success(`REP emitido · UUID ${body.rep?.uuid_sat}`); setDialogPago(null); loadCfdis(); }
    } catch (e: any) { toast.error(e.message); }
    finally { setProcesando(false); }
  }

  async function emitirNotaCredito() {
    if (!dialogNota) return;
    const monto = Number(notaForm.monto);
    if (!monto || monto <= 0) return toast.error('Monto inválido');
    setProcesando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${FN_BASE}/facturapi-nota-credito`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          factura_id: dialogNota.id, monto, motivo: notaForm.motivo, forma_pago: notaForm.forma_pago,
        }),
      });
      const body = await res.json();
      if (!res.ok) toast.error(body?.error || 'Error emitiendo NC', { description: body?.detalle?.message });
      else { toast.success(`Nota de crédito emitida · UUID ${body.nota_credito?.uuid_sat}`); setDialogNota(null); loadCfdis(); }
    } catch (e: any) { toast.error(e.message); }
    finally { setProcesando(false); }
  }


  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Receipt className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Facturación CFDI 4.0</h1>
          <p className="text-sm text-muted-foreground">Integración con Facturapi (modo prueba).</p>
        </div>
        <Badge variant="outline" className="ml-auto gap-1"><FlaskConical className="h-3 w-3" /> Ambiente: prueba</Badge>
      </div>

      <Card className="p-4 border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20 text-sm">
        Estás en modo de prueba (sk_test_). Los CFDI generados tienen UUID y XML/PDF válidos para revisión, pero <strong>no tienen efectos fiscales</strong>. Para producción reemplaza la API key por una `sk_live_` y carga el CSD real en Facturapi.
      </Card>

      <Tabs defaultValue="ventas">
        <TabsList>
          <TabsTrigger value="ventas">Ventas por timbrar</TabsTrigger>
          <TabsTrigger value="cfdis">CFDI emitidos</TabsTrigger>
          <TabsTrigger value="config">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="ventas">
          <Card>
            <div className="p-4 border-b"><h2 className="font-semibold">Ventas y pedidos por timbrar</h2></div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Folio</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>RFC</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventas.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No hay ventas ni pedidos pendientes de timbrar.</TableCell></TableRow>}
                {ventas.map(v => (
                  <TableRow key={`${v.origen}-${v.id}`}>
                    <TableCell className="font-mono text-xs">{v.numero}</TableCell>
                    <TableCell><Badge variant={v.origen === 'pedido' ? 'secondary' : 'outline'}>{v.origen === 'pedido' ? 'Pedido' : 'POS'}</Badge></TableCell>
                    <TableCell className="text-xs">{sucursalMap[v.sucursal_id] || '—'}</TableCell>
                    <TableCell>{new Date(v.fecha).toLocaleDateString()}</TableCell>
                    <TableCell>{v.clientes?.nombre || 'Público general'}</TableCell>
                    <TableCell className="font-mono text-xs">{v.clientes?.rfc || '—'}</TableCell>
                    <TableCell className="text-right">${Number(v.total).toFixed(2)}</TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => openTimbrar(v)} disabled={!config}>Timbrar</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!config && <p className="p-4 text-sm text-amber-600">Captura primero la configuración fiscal de la sucursal.</p>}
          </Card>
        </TabsContent>

        <TabsContent value="cfdis">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Folio</TableHead>
                  <TableHead>UUID SAT</TableHead>
                  <TableHead>RFC Receptor</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cfdis.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Aún no hay comprobantes.</TableCell></TableRow>}
                {cfdis.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>{c.serie}-{c.folio}</TableCell>
                    <TableCell className="font-mono text-xs">{c.uuid_sat || '—'}</TableCell>
                    <TableCell>{c.rfc_receptor}</TableCell>
                    <TableCell className="text-right">${Number(c.total).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={c.estado === 'timbrado' ? 'default' : c.estado === 'cancelado' ? 'destructive' : 'outline'}>{c.estado}</Badge>
                    </TableCell>
                    <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="flex gap-1">
                      {c.estado === 'timbrado' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => descargar(c, 'pdf')}><Download className="h-3 w-3" /> PDF</Button>
                          <Button size="sm" variant="outline" onClick={() => descargar(c, 'xml')}><Download className="h-3 w-3" /> XML</Button>
                          <Button size="sm" variant="ghost" onClick={() => cancelar(c)}><Ban className="h-3 w-3" /></Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="config">
          <Card className="p-5">
            <h2 className="font-semibold mb-1">Configuración fiscal global</h2>
            <p className="text-xs text-muted-foreground mb-4">Este RFC y razón social se usan para todas las distribuidoras Sanamex.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>RFC emisor</Label><Input value={form.rfc} onChange={e => setForm({ ...form, rfc: e.target.value.toUpperCase() })} /></div>
              <div><Label>Razón social</Label><Input value={form.razon_social} onChange={e => setForm({ ...form, razon_social: e.target.value })} /></div>
              <div><Label>Régimen fiscal</Label><Input placeholder="601" value={form.regimen_fiscal} onChange={e => setForm({ ...form, regimen_fiscal: e.target.value })} /></div>
              <div><Label>CP del emisor</Label><Input value={form.cp_emisor} onChange={e => setForm({ ...form, cp_emisor: e.target.value })} /></div>
              <div><Label>PAC</Label><Input value={form.pac_proveedor} onChange={e => setForm({ ...form, pac_proveedor: e.target.value })} /></div>
              <div><Label>Serie default</Label><Input value={form.serie_default} onChange={e => setForm({ ...form, serie_default: e.target.value })} /></div>
            </div>
            <Button className="mt-4" onClick={save}>Guardar configuración</Button>
            <p className="text-xs text-muted-foreground mt-3">La API key de Facturapi se guarda como secreto del backend, no aquí.</p>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!dialogVenta} onOpenChange={(o) => !o && setDialogVenta(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Timbrar venta {dialogVenta?.numero_venta}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nombre / Razón social</Label><Input value={receptor.nombre} onChange={e => setReceptor({ ...receptor, nombre: e.target.value })} /></div>
              <div><Label>RFC</Label><Input value={receptor.rfc} onChange={e => setReceptor({ ...receptor, rfc: e.target.value.toUpperCase() })} /></div>
              <div><Label>Régimen</Label><Input value={receptor.regimen_fiscal} onChange={e => setReceptor({ ...receptor, regimen_fiscal: e.target.value })} /></div>
              <div><Label>CP receptor</Label><Input value={receptor.cp} onChange={e => setReceptor({ ...receptor, cp: e.target.value })} /></div>
              <div><Label>Email (opcional)</Label><Input value={receptor.email} onChange={e => setReceptor({ ...receptor, email: e.target.value })} /></div>
              <div>
                <Label>Uso CFDI</Label>
                <Select value={receptor.uso_cfdi} onValueChange={v => setReceptor({ ...receptor, uso_cfdi: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="S01">S01 · Sin efectos fiscales</SelectItem>
                    <SelectItem value="G01">G01 · Adquisición de mercancías</SelectItem>
                    <SelectItem value="G03">G03 · Gastos en general</SelectItem>
                    <SelectItem value="P01">P01 · Por definir</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Forma de pago</Label>
                <Select value={receptor.forma_pago} onValueChange={v => setReceptor({ ...receptor, forma_pago: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="01">01 · Efectivo</SelectItem>
                    <SelectItem value="03">03 · Transferencia</SelectItem>
                    <SelectItem value="04">04 · Tarjeta de crédito</SelectItem>
                    <SelectItem value="28">28 · Tarjeta de débito</SelectItem>
                    <SelectItem value="99">99 · Por definir</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Método de pago</Label>
                <Select value={receptor.metodo_pago} onValueChange={v => setReceptor({ ...receptor, metodo_pago: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PUE">PUE · Pago en una exhibición</SelectItem>
                    <SelectItem value="PPD">PPD · Pago en parcialidades</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t">
              <Switch checked={receptor.lineas_con_iva} onCheckedChange={c => setReceptor({ ...receptor, lineas_con_iva: c })} />
              <Label className="cursor-pointer">Aplicar IVA 16% a todas las líneas (si la compra original lo llevaba)</Label>
            </div>
            <p className="text-xs text-muted-foreground">Medicamentos están normalmente exentos de IVA. Activa el switch solo cuando la compra que originó esta venta sí incluyó IVA.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogVenta(null)}>Cancelar</Button>
            <Button onClick={confirmarTimbrar} disabled={!!timbrando}>{timbrando ? 'Timbrando…' : 'Timbrar CFDI'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
