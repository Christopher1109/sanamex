import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, AlertTriangle, Clock, Wallet, CheckCircle2, FileUp, History, FileMinus } from 'lucide-react';
import { toast } from 'sonner';
import { registrarPagoCompra } from '@/lib/cxp';

type Compra = {
  id: string; numero_compra: string; proveedor_id: string; total: number;
  estado: string; pagada: boolean;
  fecha_factura: string | null; fecha_pago_limite: string | null; fecha_pago_real: string | null;
  fecha_programada: string | null; prioridad: string | null; cfdi_proveedor_uuid: string | null;
  notas_pago: string | null;
  proveedores?: { nombre: string; plazo_pago_dias: number } | null;
};
type Pago = { id: string; fecha: string; monto: number; forma_pago: string; referencia: string | null; banco_cuenta_id: string | null; notas: string | null };

const diasEntre = (s: string | null) => {
  if (!s) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.floor((new Date(s + 'T00:00:00').getTime() - hoy.getTime()) / 86400000);
};

const bucketAntiguedad = (dias: number | null) => {
  if (dias === null) return 'sin_fecha';
  if (dias >= 0) return 'corriente';
  const v = -dias;
  if (v <= 30) return '1_30';
  if (v <= 60) return '31_60';
  if (v <= 90) return '61_90';
  return '90+';
};

const CuentasPorPagarPage = () => {
  const { selectedSucursal } = useSucursal();
  const [compras, setCompras] = useState<Compra[]>([]);
  const [pagosByCompra, setPagosByCompra] = useState<Record<string, Pago[]>>({});
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [cuentasBan, setCuentasBan] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'pendientes' | 'vencidas' | 'pagadas' | 'todas'>('pendientes');
  const [filtroProv, setFiltroProv] = useState<string>('all');
  const [filtroAnt, setFiltroAnt] = useState<string>('all');
  const [showPago, setShowPago] = useState<Compra | null>(null);
  const [showDetalle, setShowDetalle] = useState<Compra | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showNota, setShowNota] = useState<Compra | null>(null);
  const [almacenes, setAlmacenes] = useState<any[]>([]);
  const [lineasCompra, setLineasCompra] = useState<any[]>([]);
  const [notasByCompra, setNotasByCompra] = useState<Record<string, any[]>>({});
  const [notaForm, setNotaForm] = useState({
    tipo: 'incidencia' as 'incidencia' | 'negociada' | 'objetivo_trimestral',
    monto: '', motivo: '', productoId: '', cantidad: '', almacenId: '',
  });
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [pagoForm, setPagoForm] = useState({ fecha: new Date().toISOString().slice(0, 10), monto: '', forma_pago: 'transferencia', referencia: '', banco_cuenta_id: '', notas: '' });
  const fileImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (selectedSucursal) load(); }, [selectedSucursal]);

  const load = async () => {
    if (!selectedSucursal) return;
    setLoading(true);
    const { data } = await supabase.from('compras')
      .select('*, proveedores(nombre, plazo_pago_dias)')
      .eq('sucursal_id', selectedSucursal.id)
      .neq('estado', 'cancelada')
      .not('fecha_factura', 'is', null)
      .order('fecha_pago_limite', { ascending: true, nullsFirst: false });
    setCompras((data as any) || []);

    const ids = (data || []).map((c: any) => c.id);
    if (ids.length) {
      const { data: pagos } = await supabase.from('pagos_cxp').select('*').in('compra_id', ids).order('fecha', { ascending: false });
      const grp: Record<string, Pago[]> = {};
      (pagos || []).forEach((p: any) => { (grp[p.compra_id] ||= []).push(p); });
      setPagosByCompra(grp);
    } else setPagosByCompra({});

    const [{ data: provs }, { data: ctas }, { data: alms }] = await Promise.all([
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('cuentas_bancarias').select('id, alias').eq('activo', true).order('alias'),
      supabase.from('almacenes').select('id, nombre').eq('sucursal_id', selectedSucursal.id).eq('activo', true).order('nombre'),
    ]);
    setProveedores(provs || []);
    setCuentasBan(ctas || []);
    setAlmacenes(alms || []);

    if (ids.length) {
      const { data: notas } = await (supabase as any).from('notas_credito_proveedor').select('*').in('compra_id', ids).order('created_at', { ascending: false });
      const grpN: Record<string, any[]> = {};
      (notas || []).forEach((n: any) => { (grpN[n.compra_id] ||= []).push(n); });
      setNotasByCompra(grpN);
    } else setNotasByCompra({});

    setLoading(false);
  };

  const sumPagos = (c: Compra) => (pagosByCompra[c.id] || []).reduce((s, p) => s + Number(p.monto), 0);
  const saldo = (c: Compra) => Math.max(0, Number(c.total) - sumPagos(c));

  const openPago = (c: Compra) => {
    setShowPago(c);
    setPagoForm({ fecha: new Date().toISOString().slice(0, 10), monto: saldo(c).toFixed(2), forma_pago: 'transferencia', referencia: '', banco_cuenta_id: '', notas: '' });
  };

  const openNota = async (c: Compra) => {
    setShowNota(c);
    setNotaForm({ tipo: 'incidencia', monto: '', motivo: '', productoId: '', cantidad: '', almacenId: almacenes[0]?.id || '' });
    const { data } = await supabase.from('compra_lineas')
      .select('id, producto_id, cantidad_recibida, precio_unitario_real, precio_unitario_estimado, productos(sku, nombre)')
      .eq('compra_id', c.id);
    setLineasCompra(data || []);
  };

  const guardarNota = async () => {
    if (!showNota) return;
    const monto = Number(notaForm.monto);
    if (!monto || monto <= 0) { toast.error('Captura un monto válido'); return; }
    const requiereProducto = notaForm.tipo === 'incidencia' || notaForm.tipo === 'negociada';
    if (requiereProducto && (!notaForm.productoId || !notaForm.cantidad)) {
      toast.error('Selecciona el producto y la cantidad afectada'); return;
    }
    if (notaForm.tipo === 'incidencia' && !notaForm.almacenId) { toast.error('Selecciona el almacén a ajustar'); return; }
    setGuardandoNota(true);
    const { data, error } = await (supabase as any).rpc('crear_nota_credito_proveedor', {
      p_proveedor_id: showNota.proveedor_id,
      p_tipo: notaForm.tipo,
      p_monto: monto,
      p_motivo: notaForm.motivo || null,
      p_compra_id: showNota.id,
      p_producto_id: requiereProducto ? notaForm.productoId : null,
      p_cantidad_incidencia: requiereProducto ? Number(notaForm.cantidad) : null,
      p_almacen_id: notaForm.tipo === 'incidencia' ? notaForm.almacenId : null,
    });
    setGuardandoNota(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Nota de crédito ${data?.folio} aplicada por $${monto.toFixed(2)}`);
    setShowNota(null);
    load();
  };

  const registrarPago = async () => {
    if (!showPago) return;
    const monto = parseFloat(pagoForm.monto);
    if (!monto || monto <= 0) { toast.error('Monto inválido'); return; }
    const { error, quedaSaldada } = await registrarPagoCompra({
      compraId: showPago.id,
      compraTotal: Number(showPago.total),
      montoYaPagado: sumPagos(showPago),
      monto,
      fecha: pagoForm.fecha,
      formaPago: pagoForm.forma_pago,
      referencia: pagoForm.referencia,
      bancoCuentaId: pagoForm.banco_cuenta_id,
      notas: pagoForm.notas,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`Pago de $${monto.toFixed(2)} registrado${quedaSaldada ? ' — compra saldada' : ''}`);
    setShowPago(null); load();
  };

  const programarPago = async (c: Compra, fecha: string, prioridad: string) => {
    await supabase.from('compras').update({ fecha_programada: fecha || null, prioridad }).eq('id', c.id);
    toast.success('Programación actualizada'); load();
  };

  const guardarCfdiUuid = async (c: Compra, uuid: string) => {
    await supabase.from('compras').update({ cfdi_proveedor_uuid: uuid || null }).eq('id', c.id);
    toast.success('UUID CFDI guardado'); load();
  };

  const importarSaldos = async (file: File) => {
    if (!selectedSucursal) { toast.error('Selecciona sucursal'); return; }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (!rows.length) { toast.error('Archivo vacío'); return; }

      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const findKey = (row: any, ...needles: string[]) => {
        const keys = Object.keys(row);
        for (const n of needles) { const k = keys.find(k => norm(k).includes(n)); if (k) return k; }
        return null;
      };
      const s = rows[0];
      const kProv = findKey(s, 'proveedor');
      const kFact = findKey(s, 'factura', 'folio');
      const kMonto = findKey(s, 'monto', 'total', 'importe');
      const kFecha = findKey(s, 'fechafactura', 'fechaemision', 'fecha');
      const kVenc = findKey(s, 'vencimiento', 'fechavencimiento', 'limite');
      if (!kProv || !kMonto || !kVenc) { toast.error('Faltan columnas requeridas: proveedor, monto, vencimiento'); return; }

      const provMap = new Map(proveedores.map(p => [norm(p.nombre), p.id]));
      const parseFecha = (v: any): string | null => {
        if (!v) return null;
        if (typeof v === 'number') {
          const d = XLSX.SSF.parse_date_code(v);
          if (!d) return null;
          return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        }
        const d = new Date(String(v));
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
      };
      const user = (await supabase.auth.getUser()).data.user;
      let ok = 0, fail = 0;
      for (const r of rows) {
        const nombreProv = String(r[kProv] || '').trim();
        const provId = provMap.get(norm(nombreProv));
        if (!provId) { fail++; continue; }
        const monto = parseFloat(String(r[kMonto]).replace(/[$,\s]/g, '')) || 0;
        if (monto <= 0) { fail++; continue; }
        const numero = `SI-${(r[kFact!] || Date.now()).toString().slice(0, 20)}-${ok}`;
        const fechaFact = kFecha ? parseFecha(r[kFecha]) : null;
        const fechaVenc = parseFecha(r[kVenc]);
        const { error } = await supabase.from('compras').insert({
          numero_compra: numero, proveedor_id: provId, sucursal_id: selectedSucursal.id,
          estado: 'ordenada', subtotal: monto, total: monto,
          fecha_factura: fechaFact, fecha_pago_limite: fechaVenc,
          notas: 'Saldo inicial importado', creado_por: user?.id,
        } as any);
        if (error) fail++; else ok++;
      }
      toast.success(`Importadas: ${ok}, fallidas: ${fail}`);
      setShowImport(false); load();
    } catch (e: any) { toast.error('Error: ' + e.message); }
  };

  // Filtros
  const filtradas = compras.filter(c => {
    if (filtroProv !== 'all' && c.proveedor_id !== filtroProv) return false;
    if (filtroAnt !== 'all' && bucketAntiguedad(diasEntre(c.fecha_pago_limite)) !== filtroAnt) return false;
    if (filtro === 'todas') return true;
    if (filtro === 'pagadas') return c.pagada;
    if (filtro === 'pendientes') return !c.pagada;
    if (filtro === 'vencidas') {
      const d = diasEntre(c.fecha_pago_limite);
      return !c.pagada && d !== null && d < 0;
    }
    return true;
  });

  // KPIs
  const pendientes = compras.filter(c => !c.pagada);
  const totalPendiente = pendientes.reduce((s, c) => s + saldo(c), 0);
  const vencidas = pendientes.filter(c => { const d = diasEntre(c.fecha_pago_limite); return d !== null && d < 0; });
  const totalVencido = vencidas.reduce((s, c) => s + saldo(c), 0);
  const proximas = pendientes.filter(c => { const d = diasEntre(c.fecha_pago_limite); return d !== null && d >= 0 && d <= 7; });
  const totalProximo = proximas.reduce((s, c) => s + saldo(c), 0);

  // Antigüedad por proveedor
  const antiguedadPorProv = (() => {
    const map: Record<string, { nombre: string; corriente: number; b1_30: number; b31_60: number; b61_90: number; b90: number; total: number }> = {};
    pendientes.forEach(c => {
      const key = c.proveedor_id;
      if (!map[key]) map[key] = { nombre: c.proveedores?.nombre || '—', corriente: 0, b1_30: 0, b31_60: 0, b61_90: 0, b90: 0, total: 0 };
      const s = saldo(c);
      const b = bucketAntiguedad(diasEntre(c.fecha_pago_limite));
      const target = b === 'corriente' ? 'corriente' : b === '1_30' ? 'b1_30' : b === '31_60' ? 'b31_60' : b === '61_90' ? 'b61_90' : 'b90';
      (map[key] as any)[target] += s;
      map[key].total += s;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cuentas por Pagar</h1>
          <p className="text-muted-foreground">{selectedSucursal?.nombre} — pagos a proveedores</p>
        </div>
        <Button variant="outline" onClick={() => setShowImport(true)}><FileUp className="h-4 w-4 mr-2" />Importar saldos iniciales</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Saldo total</p><Wallet className="h-4 w-4 text-muted-foreground" /></div>
          <p className="text-2xl font-bold mt-1">${totalPendiente.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted-foreground">{pendientes.length} cuentas</p>
        </CardContent></Card>
        <Card className="border-destructive/50"><CardContent className="p-4">
          <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Vencidas</p><AlertTriangle className="h-4 w-4 text-destructive" /></div>
          <p className="text-2xl font-bold mt-1 text-destructive">${totalVencido.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted-foreground">{vencidas.length} cuentas</p>
        </CardContent></Card>
        <Card className="border-amber-500/50"><CardContent className="p-4">
          <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Vencen en 7 días</p><Clock className="h-4 w-4 text-amber-500" /></div>
          <p className="text-2xl font-bold mt-1 text-amber-600">${totalProximo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted-foreground">{proximas.length} cuentas</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Pagadas</p><CheckCircle2 className="h-4 w-4 text-green-600" /></div>
          <p className="text-2xl font-bold mt-1">{compras.filter(c => c.pagada).length}</p>
          <p className="text-xs text-muted-foreground">histórico</p>
        </CardContent></Card>
      </div>

      {/* Antigüedad por proveedor */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b"><h2 className="font-semibold">Antigüedad de saldos por proveedor</h2></div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Proveedor</TableHead>
              <TableHead className="text-right">Corriente</TableHead>
              <TableHead className="text-right">1-30 d</TableHead>
              <TableHead className="text-right">31-60 d</TableHead>
              <TableHead className="text-right">61-90 d</TableHead>
              <TableHead className="text-right">90+ d</TableHead>
              <TableHead className="text-right font-bold">Total</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {antiguedadPorProv.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Sin saldos pendientes</TableCell></TableRow>
              ) : antiguedadPorProv.map(r => (
                <TableRow key={r.nombre}>
                  <TableCell className="font-medium">{r.nombre}</TableCell>
                  <TableCell className="text-right">${r.corriente.toFixed(2)}</TableCell>
                  <TableCell className="text-right">${r.b1_30.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-amber-600">${r.b31_60.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-orange-600">${r.b61_90.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-destructive">${r.b90.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-bold">${r.total.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={filtro} onValueChange={(v: any) => setFiltro(v)}>
          <TabsList>
            <TabsTrigger value="pendientes">Pendientes ({pendientes.length})</TabsTrigger>
            <TabsTrigger value="vencidas">Vencidas ({vencidas.length})</TabsTrigger>
            <TabsTrigger value="pagadas">Pagadas</TabsTrigger>
            <TabsTrigger value="todas">Todas</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="min-w-[200px]">
          <Label className="text-xs">Proveedor</Label>
          <Select value={filtroProv} onValueChange={setFiltroProv}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
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
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead><TableHead>Proveedor</TableHead>
                <TableHead>Vencimiento</TableHead><TableHead>Programado</TableHead>
                <TableHead>Prioridad</TableHead><TableHead className="text-center">Estado</TableHead>
                <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Saldo</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={9} className="text-center py-8">Cargando...</TableCell></TableRow> :
                filtradas.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Sin compras en este filtro</TableCell></TableRow> :
                  filtradas.map(c => {
                    const dias = diasEntre(c.fecha_pago_limite);
                    const sal = saldo(c);
                    const pag = sumPagos(c);
                    let badge;
                    if (c.pagada) badge = <Badge className="bg-green-100 text-green-700">Pagada</Badge>;
                    else if (pag > 0) badge = <Badge className="bg-blue-100 text-blue-700">Parcial</Badge>;
                    else if (dias === null) badge = <Badge variant="secondary">Sin fecha</Badge>;
                    else if (dias < 0) badge = <Badge variant="destructive">Vencida {Math.abs(dias)}d</Badge>;
                    else if (dias <= 7) badge = <Badge className="bg-amber-500">En {dias}d</Badge>;
                    else badge = <Badge variant="secondary">En {dias}d</Badge>;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.numero_compra}</TableCell>
                        <TableCell className="text-sm">{c.proveedores?.nombre || '—'}</TableCell>
                        <TableCell className="text-xs">{c.fecha_pago_limite || '—'}</TableCell>
                        <TableCell className="text-xs">{c.fecha_programada || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={c.prioridad === 'alta' ? 'border-destructive text-destructive' : c.prioridad === 'baja' ? 'opacity-70' : ''}>
                            {c.prioridad || 'media'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">{badge}</TableCell>
                        <TableCell className="text-right">${Number(c.total).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-bold">
                          ${sal.toFixed(2)}
                          {(notasByCompra[c.id]?.length || 0) > 0 && (
                            <div className="text-[10px] font-normal text-muted-foreground">
                              {notasByCompra[c.id].length} nota{notasByCompra[c.id].length === 1 ? '' : 's'} de crédito
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="space-x-1 whitespace-nowrap">
                          {!c.pagada && <Button size="sm" onClick={() => openPago(c)}><Wallet className="h-3 w-3 mr-1" />Pago</Button>}
                          {!c.pagada && <Button size="sm" variant="outline" onClick={() => openNota(c)}><FileMinus className="h-3 w-3 mr-1" />Nota</Button>}
                          <Button size="sm" variant="outline" onClick={() => setShowDetalle(c)}><History className="h-3 w-3" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Nota de crédito de proveedor */}
      <Dialog open={!!showNota} onOpenChange={o => !o && setShowNota(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nota de crédito — {showNota?.numero_compra}</DialogTitle></DialogHeader>
          {showNota && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Proveedor:</span><strong>{showNota.proveedores?.nombre}</strong>
              </div>
              <div>
                <Label>Tipo de nota</Label>
                <Select value={notaForm.tipo} onValueChange={(v: any) => setNotaForm({ ...notaForm, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="incidencia">Incidencia (faltante de piezas) — ajusta inventario</SelectItem>
                    <SelectItem value="negociada">Negociada / descuento — impacta el costo</SelectItem>
                    <SelectItem value="objetivo_trimestral">Objetivo trimestral — beneficio financiero</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(notaForm.tipo === 'incidencia' || notaForm.tipo === 'negociada') && (
                <div>
                  <Label>Producto de esta compra</Label>
                  <Select value={notaForm.productoId} onValueChange={v => setNotaForm({ ...notaForm, productoId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecciona el producto..." /></SelectTrigger>
                    <SelectContent>
                      {lineasCompra.map((l: any) => (
                        <SelectItem key={l.producto_id} value={l.producto_id}>
                          {l.productos?.sku} — {l.productos?.nombre} (recibidas: {l.cantidad_recibida})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {(notaForm.tipo === 'incidencia' || notaForm.tipo === 'negociada') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{notaForm.tipo === 'incidencia' ? 'Piezas faltantes' : 'Piezas sobre las que aplica el descuento'}</Label>
                    <Input type="number" value={notaForm.cantidad} onChange={e => setNotaForm({ ...notaForm, cantidad: e.target.value })} />
                  </div>
                  {notaForm.tipo === 'incidencia' && (
                    <div>
                      <Label>Almacén a ajustar</Label>
                      <Select value={notaForm.almacenId} onValueChange={v => setNotaForm({ ...notaForm, almacenId: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                        <SelectContent>
                          {almacenes.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
              <div>
                <Label>Monto total de la nota</Label>
                <Input type="number" step="0.01" value={notaForm.monto} onChange={e => setNotaForm({ ...notaForm, monto: e.target.value })} />
                {notaForm.tipo === 'negociada' && Number(notaForm.cantidad) > 0 && Number(notaForm.monto) > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Ajuste de costo unitario: -${(Number(notaForm.monto) / Number(notaForm.cantidad)).toFixed(4)} por pieza
                  </p>
                )}
              </div>
              <div>
                <Label>Motivo (opcional)</Label>
                <Textarea value={notaForm.motivo} onChange={e => setNotaForm({ ...notaForm, motivo: e.target.value })} rows={2} />
              </div>
              <p className="text-xs text-muted-foreground">
                Esta nota se aplica de inmediato contra el saldo pendiente de esta compra
                {notaForm.tipo === 'incidencia' && ' y descuenta el inventario correspondiente'}
                {notaForm.tipo === 'negociada' && ' y reduce el costo unitario del lote'}.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNota(null)}>Cancelar</Button>
            <Button onClick={guardarNota} disabled={guardandoNota}>{guardandoNota ? 'Aplicando...' : 'Aplicar nota de crédito'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registrar pago */}
      <Dialog open={!!showPago} onOpenChange={o => !o && setShowPago(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pago — {showPago?.numero_compra}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="bg-muted/40 rounded-md p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>Proveedor:</span><strong>{showPago?.proveedores?.nombre}</strong></div>
              <div className="flex justify-between"><span>Total:</span><strong>${Number(showPago?.total || 0).toFixed(2)}</strong></div>
              <div className="flex justify-between"><span>Pagado:</span><strong>${(showPago ? sumPagos(showPago) : 0).toFixed(2)}</strong></div>
              <div className="flex justify-between"><span>Saldo:</span><strong>${(showPago ? saldo(showPago) : 0).toFixed(2)}</strong></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Fecha *</Label><Input type="date" value={pagoForm.fecha} onChange={e => setPagoForm({ ...pagoForm, fecha: e.target.value })} /></div>
              <div><Label>Monto *</Label><Input type="number" step="0.01" value={pagoForm.monto} onChange={e => setPagoForm({ ...pagoForm, monto: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Forma de pago</Label>
                <Select value={pagoForm.forma_pago} onValueChange={v => setPagoForm({ ...pagoForm, forma_pago: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Cuenta bancaria</Label>
                <Select value={pagoForm.banco_cuenta_id} onValueChange={v => setPagoForm({ ...pagoForm, banco_cuenta_id: v })}>
                  <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                  <SelectContent>{cuentasBan.map(c => <SelectItem key={c.id} value={c.id}>{c.alias}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Referencia</Label><Input value={pagoForm.referencia} onChange={e => setPagoForm({ ...pagoForm, referencia: e.target.value })} /></div>
            <div><Label>Notas</Label><Textarea rows={2} value={pagoForm.notas} onChange={e => setPagoForm({ ...pagoForm, notas: e.target.value })} /></div>
            {showPago && (
              <div className="border-t pt-3 space-y-2">
                <Label className="text-xs">Programación / prioridad</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={showPago.fecha_programada || ''} onChange={e => programarPago(showPago, e.target.value, showPago.prioridad || 'media')} />
                  <Select value={showPago.prioridad || 'media'} onValueChange={v => programarPago(showPago, showPago.fecha_programada || '', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="media">Media</SelectItem>
                      <SelectItem value="baja">Baja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Label className="text-xs">UUID CFDI proveedor (opcional)</Label>
                <Input placeholder="UUID del CFDI recibido" defaultValue={showPago.cfdi_proveedor_uuid || ''}
                  onBlur={e => { if (e.target.value !== (showPago.cfdi_proveedor_uuid || '')) guardarCfdiUuid(showPago, e.target.value); }} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPago(null)}>Cancelar</Button>
            <Button onClick={registrarPago}>Confirmar pago</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalle / historial */}
      <Dialog open={!!showDetalle} onOpenChange={o => !o && setShowDetalle(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Historial — {showDetalle?.numero_compra}</DialogTitle></DialogHeader>
          {showDetalle && (
            <div className="space-y-3">
              <div className="bg-muted/40 rounded-md p-3 text-sm grid grid-cols-2 gap-2">
                <div>Proveedor: <strong>{showDetalle.proveedores?.nombre}</strong></div>
                <div>Total: <strong>${Number(showDetalle.total).toFixed(2)}</strong></div>
                <div>Pagado: <strong>${sumPagos(showDetalle).toFixed(2)}</strong></div>
                <div>Saldo: <strong>${saldo(showDetalle).toFixed(2)}</strong></div>
                <div>Factura: {showDetalle.fecha_factura || '—'}</div>
                <div>Vencimiento: {showDetalle.fecha_pago_limite || '—'}</div>
                <div>Programado: {showDetalle.fecha_programada || '—'}</div>
                <div>Prioridad: {showDetalle.prioridad || 'media'}</div>
                <div className="col-span-2 text-xs truncate">CFDI: {showDetalle.cfdi_proveedor_uuid || '—'}</div>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Forma</TableHead><TableHead>Ref.</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(pagosByCompra[showDetalle.id] || []).length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground">Sin pagos registrados</TableCell></TableRow>
                  ) : pagosByCompra[showDetalle.id].map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{p.fecha}</TableCell>
                      <TableCell>{p.forma_pago}</TableCell>
                      <TableCell className="text-xs">{p.referencia || '—'}</TableCell>
                      <TableCell className="text-right font-bold">${Number(p.monto).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Importar saldos */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent>
          <DialogHeader><DialogTitle>Importar saldos iniciales</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Columnas esperadas: <strong>proveedor</strong>, <strong>factura</strong> (opcional), <strong>monto</strong>, <strong>fecha</strong> (opcional), <strong>vencimiento</strong>.</p>
            <p className="text-muted-foreground text-xs">El proveedor debe coincidir por nombre con el catálogo. Las filas sin coincidencia se omiten.</p>
            <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50" onClick={() => fileImportRef.current?.click()}>
              <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm">Subir Excel o CSV</p>
            </div>
            <input ref={fileImportRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importarSaldos(f); e.target.value = ''; }} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CuentasPorPagarPage;
