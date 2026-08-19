import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { CheckCircle2, RotateCcw, Link2, Send } from 'lucide-react';
import { toast } from 'sonner';

type Mov = {
  id: string; cuenta_id: string; fecha: string; concepto: string | null;
  cargo: number; abono: number; conciliado: boolean; referencia: string | null;
  proveedor_sugerido_id?: string | null; cliente_sugerido_id?: string | null;
};
type Documento = {
  id: string; tipo: 'pago_cxp' | 'cfdi'; fecha: string; monto: number; descripcion: string;
};

const ConciliacionPage = () => {
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [cuentaId, setCuentaId] = useState<string>('');
  const [desde, setDesde] = useState<string>(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [hasta, setHasta] = useState<string>(new Date().toISOString().slice(0, 10));
  const [movs, setMovs] = useState<Mov[]>([]);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [selMov, setSelMov] = useState<Mov | null>(null);
  const [tolDias, setTolDias] = useState(3);
  const [conciliaciones, setConciliaciones] = useState<Record<string, any>>({});
  const [cuentasContables, setCuentasContables] = useState<any[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [dialogEnviar, setDialogEnviar] = useState<Mov | null>(null);
  const [enviarForm, setEnviarForm] = useState({ entidadTipo: 'proveedor' as 'proveedor' | 'cliente', entidadId: '', cuentaContableId: '' });
  const [comprasPendientes, setComprasPendientes] = useState<any[]>([]);
  const [comprasSel, setComprasSel] = useState<Set<string>>(new Set());
  // Cliente: ventas a crédito con saldo, para repartir el depósito conciliado
  // entre varias de ellas (junta 15-ago-2026, punto 8).
  const [ventasPendientes, setVentasPendientes] = useState<any[]>([]);
  const [ventasSel, setVentasSel] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    supabase.from('cuentas_bancarias').select('id, alias, bancos(nombre)').eq('activo', true).order('alias')
      .then(({ data }) => { setCuentas(data || []); if (data?.length && !cuentaId) setCuentaId(data[0].id); });
    supabase.from('catalogo_cuentas').select('id, codigo, nombre, naturaleza').eq('activo', true).eq('afectable', true).order('codigo')
      .then(({ data }) => setCuentasContables(data || []));
    supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setProveedores(data || []));
    supabase.from('clientes').select('id, nombre').eq('activo', true).order('nombre').limit(500)
      .then(({ data }) => setClientes(data || []));
  }, []);

  useEffect(() => { if (cuentaId) load(); }, [cuentaId, desde, hasta]);

  const load = async () => {
    const { data: m } = await supabase.from('movimientos_bancarios').select('*')
      .eq('cuenta_id', cuentaId).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false });
    setMovs((m as any) || []);

    const idsMov = (m || []).map((x: any) => x.id);
    if (idsMov.length) {
      const { data: concs } = await (supabase as any).from('conciliacion_bancaria').select('*').in('movimiento_id', idsMov);
      const byMov: Record<string, any> = {};
      (concs || []).forEach((c: any) => { byMov[c.movimiento_id] = c; });
      setConciliaciones(byMov);
    } else setConciliaciones({});

    // Documentos: pagos_cxp (egresos) + cfdi_emitidos no demo (ingresos)
    const [{ data: pagos }, { data: cfdis }] = await Promise.all([
      supabase.from('pagos_cxp').select('id, fecha, monto, referencia, compras(numero_compra, proveedores(nombre))')
        .gte('fecha', desde).lte('fecha', hasta),
      supabase.from('cfdi_emitidos').select('id, timbrado_at, total, folio, rfc_receptor, es_demo')
        .eq('es_demo', false).gte('timbrado_at', desde).lte('timbrado_at', hasta + 'T23:59:59'),
    ]);

    const docs: Documento[] = [
      ...((pagos as any[]) || []).map((p: any) => ({
        id: p.id, tipo: 'pago_cxp' as const, fecha: p.fecha, monto: Number(p.monto),
        descripcion: `Pago ${p.compras?.numero_compra || ''} → ${p.compras?.proveedores?.nombre || ''} ${p.referencia ? `(${p.referencia})` : ''}`,
      })),
      ...((cfdis as any[]) || []).map((c: any) => ({
        id: c.id, tipo: 'cfdi' as const, fecha: String(c.timbrado_at).slice(0, 10), monto: Number(c.total),
        descripcion: `CFDI ${c.folio || ''} ← ${c.rfc_receptor || ''}`,
      })),
    ];
    setDocs(docs);
  };

  const sugerencias = useMemo(() => {
    if (!selMov) return [] as Documento[];
    const monto = selMov.cargo > 0 ? selMov.cargo : selMov.abono;
    const tipoEsperado = selMov.cargo > 0 ? 'pago_cxp' : 'cfdi';
    const fechaMov = new Date(selMov.fecha).getTime();
    return docs
      .filter(d => d.tipo === tipoEsperado)
      .map(d => {
        const diffDias = Math.abs((new Date(d.fecha).getTime() - fechaMov) / 86400000);
        const diffMonto = Math.abs(d.monto - monto);
        return { d, diffDias, diffMonto };
      })
      .filter(x => x.diffDias <= tolDias && x.diffMonto <= 0.5)
      .sort((a, b) => (a.diffMonto - b.diffMonto) || (a.diffDias - b.diffDias))
      .map(x => x.d);
  }, [selMov, docs, tolDias]);

  const conciliar = async (mov: Mov, doc: Documento) => {
    const user = (await supabase.auth.getUser()).data.user;
    const { error: e1 } = await supabase.from('conciliacion_bancaria').insert({
      monto: mov.cargo > 0 ? mov.cargo : mov.abono,
      referencia: mov.referencia, fecha_estado_cuenta: mov.fecha, estado: 'conciliado',
      movimiento_id: mov.id, documento_tipo: doc.tipo, documento_id: doc.id,
      conciliado_por: user?.id, conciliado_at: new Date().toISOString(),
    });
    if (e1) { toast.error(e1.message); return; }
    await supabase.from('movimientos_bancarios').update({ conciliado: true }).eq('id', mov.id);
    toast.success('Conciliado'); setSelMov(null); load();
  };

  const desconciliar = async (mov: Mov) => {
    await supabase.from('conciliacion_bancaria').delete().eq('movimiento_id', mov.id);
    await supabase.from('movimientos_bancarios').update({ conciliado: false }).eq('id', mov.id);
    toast.success('Desconciliado'); load();
  };

  async function abrirEnviar(mov: Mov) {
    const entidadTipo: 'proveedor' | 'cliente' = mov.cargo > 0 ? 'proveedor' : 'cliente';
    setEnviarForm({
      entidadTipo,
      entidadId: (entidadTipo === 'proveedor' ? mov.proveedor_sugerido_id : mov.cliente_sugerido_id) || '',
      cuentaContableId: '',
    });
    setComprasSel(new Set());
    setComprasPendientes([]);
    setVentasSel(new Set());
    setVentasPendientes([]);
    setDialogEnviar(mov);
    if (entidadTipo === 'proveedor' && mov.proveedor_sugerido_id) {
      await cargarComprasPendientes(mov.proveedor_sugerido_id);
    }
    if (entidadTipo === 'cliente' && mov.cliente_sugerido_id) {
      await cargarVentasPendientes(mov.cliente_sugerido_id);
    }
  }

  async function cargarComprasPendientes(proveedorId: string) {
    if (!proveedorId) { setComprasPendientes([]); return; }
    const { data } = await supabase.from('compras')
      .select('id, numero_compra, total, pagada, pagos_cxp(monto)')
      .eq('proveedor_id', proveedorId).eq('pagada', false)
      .order('created_at', { ascending: true });
    const conSaldo = (data || []).map((c: any) => {
      const pagado = (c.pagos_cxp || []).reduce((s: number, p: any) => s + Number(p.monto), 0);
      return { ...c, pagado, saldo: Number(c.total) - pagado };
    }).filter((c: any) => c.saldo > 0.5);
    setComprasPendientes(conSaldo);
  }

  async function cargarVentasPendientes(clienteId: string) {
    if (!clienteId) { setVentasPendientes([]); return; }
    const { data } = await (supabase as any).from('ventas')
      .select('id, numero_venta, fecha, total, cxc_abonos(monto)')
      .eq('cliente_id', clienteId).eq('tipo_venta', 'credito').neq('estado', 'cancelada')
      .order('fecha', { ascending: true }).limit(200);
    const conSaldo = (data || []).map((v: any) => {
      const abonado = (v.cxc_abonos || []).reduce((s: number, a: any) => s + Number(a.monto), 0);
      return { ...v, abonado, saldo: Number(v.total) - abonado };
    }).filter((v: any) => v.saldo > 0.5);
    setVentasPendientes(conSaldo);
  }

  async function confirmarEnviar() {
    if (!dialogEnviar) return;
    if (!enviarForm.entidadId) { toast.error('Selecciona el cliente o proveedor'); return; }
    if (!enviarForm.cuentaContableId) { toast.error('Selecciona la cuenta contable destino'); return; }
    setEnviando(true);
    const conc = conciliaciones[dialogEnviar.id];
    if (!conc) { toast.error('Este movimiento todavía no está conciliado'); setEnviando(false); return; }
    const { data, error } = await (supabase as any).rpc('conciliacion_enviar_a_cuenta', {
      p_conciliacion_id: conc.id,
      p_entidad_tipo: enviarForm.entidadTipo,
      p_entidad_id: enviarForm.entidadId,
      p_cuenta_contable_id: enviarForm.cuentaContableId,
      p_compra_ids: enviarForm.entidadTipo === 'proveedor' && comprasSel.size ? Array.from(comprasSel) : null,
      p_venta_ids: enviarForm.entidadTipo === 'cliente' && ventasSel.size ? Array.from(ventasSel) : null,
    });
    setEnviando(false);
    if (error) { toast.error(error.message); return; }
    const sinAplicar = Number(data?.sin_aplicar || 0);
    toast.success(
      `Póliza generada por $${Number(data?.monto || 0).toFixed(2)}` +
      (sinAplicar > 0.5 ? ` · $${sinAplicar.toFixed(2)} quedaron sin aplicar a documentos` : '')
    );
    setDialogEnviar(null);
    load();
  }

  const movsFiltrados = movs;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Conciliación Bancaria</h1>
        <p className="text-muted-foreground">Compara movimientos del banco contra pagos a proveedores y CFDIs emitidos</p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div><Label>Cuenta</Label>
            <Select value={cuentaId} onValueChange={setCuentaId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{cuentas.map(c => <SelectItem key={c.id} value={c.id}>{c.alias}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Desde</Label><Input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></div>
          <div><Label>Hasta</Label><Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
          <div><Label>Tolerancia (días)</Label><Input type="number" value={tolDias} onChange={e => setTolDias(parseInt(e.target.value) || 0)} /></div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Movimientos del banco ({movsFiltrados.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Fecha</TableHead><TableHead>Concepto</TableHead>
                <TableHead className="text-right">Monto</TableHead><TableHead>Acciones</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {movsFiltrados.map(m => {
                  const monto = m.cargo > 0 ? m.cargo : m.abono;
                  return (
                    <TableRow key={m.id} className={selMov?.id === m.id ? 'bg-muted' : ''}>
                      <TableCell className="text-xs">{m.fecha}</TableCell>
                      <TableCell className="text-sm max-w-[180px] truncate">{m.concepto || '—'}</TableCell>
                      <TableCell className={`text-right ${m.cargo > 0 ? 'text-destructive' : 'text-green-600'}`}>
                        {m.cargo > 0 ? '-' : '+'}${monto.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {m.conciliado ? (
                          <div className="flex gap-1 items-center flex-wrap">
                            <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>
                            {conciliaciones[m.id]?.enviado_a_cuenta ? (
                              <Badge variant="outline" className="text-xs">Enviado a cuenta</Badge>
                            ) : (
                              <Button size="sm" variant="outline" className="gap-1" onClick={() => abrirEnviar(m)}>
                                <Send className="h-3 w-3" />Enviar a cuenta
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => desconciliar(m)}><RotateCcw className="h-3 w-3" /></Button>
                          </div>
                        ) : (
                          <Button size="sm" variant={selMov?.id === m.id ? 'default' : 'outline'} onClick={() => setSelMov(m)}>
                            <Link2 className="h-3 w-3 mr-1" />Match
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selMov ? `Sugerencias para ${selMov.fecha} (${sugerencias.length})` : 'Selecciona un movimiento'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!selMov ? (
              <p className="p-6 text-sm text-muted-foreground">Haz clic en "Match" en un movimiento sin conciliar para ver candidatos.</p>
            ) : sugerencias.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Sin coincidencias dentro de la tolerancia. Ajusta filtros o registra el pago/CFDI.</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Tipo</TableHead><TableHead>Fecha</TableHead><TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Monto</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {sugerencias.map(d => (
                    <TableRow key={`${d.tipo}-${d.id}`}>
                      <TableCell><Badge variant="outline">{d.tipo}</Badge></TableCell>
                      <TableCell className="text-xs">{d.fecha}</TableCell>
                      <TableCell className="text-sm max-w-[180px] truncate">{d.descripcion}</TableCell>
                      <TableCell className="text-right">${d.monto.toFixed(2)}</TableCell>
                      <TableCell><Button size="sm" onClick={() => conciliar(selMov, d)}>Conciliar</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!dialogEnviar} onOpenChange={(o) => !o && setDialogEnviar(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enviar a cuenta {enviarForm.entidadTipo === 'proveedor' ? 'acreedora (proveedor)' : 'deudora (cliente)'}</DialogTitle></DialogHeader>
          {dialogEnviar && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Movimiento: {dialogEnviar.concepto || '—'} · ${(dialogEnviar.cargo > 0 ? dialogEnviar.cargo : dialogEnviar.abono).toFixed(2)} ·{' '}
                {dialogEnviar.cargo > 0 ? 'salida (pago)' : 'entrada (cobro)'}
              </p>
              <div>
                <Label>Tipo</Label>
                <Select value={enviarForm.entidadTipo} onValueChange={(v: 'proveedor' | 'cliente') => {
                  setEnviarForm({ ...enviarForm, entidadTipo: v, entidadId: '' });
                  setComprasPendientes([]); setComprasSel(new Set());
                  setVentasPendientes([]); setVentasSel(new Set());
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proveedor">Proveedor (acreedora)</SelectItem>
                    <SelectItem value="cliente">Cliente (deudora)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{enviarForm.entidadTipo === 'proveedor' ? 'Proveedor' : 'Cliente'}</Label>
                <Select value={enviarForm.entidadId} onValueChange={(v) => {
                  setEnviarForm({ ...enviarForm, entidadId: v });
                  if (enviarForm.entidadTipo === 'proveedor') cargarComprasPendientes(v);
                  else cargarVentasPendientes(v);
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                  <SelectContent>
                    {(enviarForm.entidadTipo === 'proveedor' ? proveedores : clientes).map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cuenta contable destino</Label>
                <Select value={enviarForm.cuentaContableId} onValueChange={(v) => setEnviarForm({ ...enviarForm, cuentaContableId: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona la cuenta..." /></SelectTrigger>
                  <SelectContent>
                    {cuentasContables.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.codigo} — {c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {enviarForm.entidadTipo === 'proveedor' && comprasPendientes.length > 0 && (
                <div>
                  <Label>Aplicar contra estas compras (opcional)</Label>
                  <div className="border rounded max-h-40 overflow-y-auto">
                    {comprasPendientes.map((c: any) => (
                      <label key={c.id} className="flex items-center gap-2 p-2 text-sm border-b last:border-0">
                        <input type="checkbox" checked={comprasSel.has(c.id)} onChange={() => {
                          const n = new Set(comprasSel);
                          n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                          setComprasSel(n);
                        }} />
                        <span className="font-mono">{c.numero_compra}</span>
                        <span className="text-muted-foreground ml-auto">Saldo: ${c.saldo.toFixed(2)}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">El monto se reparte en el orden mostrado, de la más antigua a la más reciente. Si no seleccionas ninguna, solo se registra la póliza contable.</p>
                </div>
              )}
              {enviarForm.entidadTipo === 'cliente' && ventasPendientes.length > 0 && (
                <div>
                  <Label>Aplicar contra estas ventas a crédito (opcional)</Label>
                  <div className="border rounded max-h-40 overflow-y-auto">
                    {ventasPendientes.map((v: any) => (
                      <label key={v.id} className="flex items-center gap-2 p-2 text-sm border-b last:border-0">
                        <input type="checkbox" checked={ventasSel.has(v.id)} onChange={() => {
                          const n = new Set(ventasSel);
                          n.has(v.id) ? n.delete(v.id) : n.add(v.id);
                          setVentasSel(n);
                        }} />
                        <span className="font-mono">{v.numero_venta || v.id.slice(0, 8)}</span>
                        <span className="text-xs text-muted-foreground">{String(v.fecha).slice(0, 10)}</span>
                        <span className="text-muted-foreground ml-auto">Saldo: ${v.saldo.toFixed(2)}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Seleccionadas: {ventasSel.size} · Saldo seleccionado: ${ventasPendientes
                      .filter((v: any) => ventasSel.has(v.id))
                      .reduce((s: number, v: any) => s + v.saldo, 0).toFixed(2)} — el cobro se aplica como abono y descuenta el crédito del cliente.
                  </p>
                </div>
              )}
              {enviarForm.entidadTipo === 'cliente' && enviarForm.entidadId && ventasPendientes.length === 0 && (
                <p className="text-xs text-muted-foreground">Este cliente no tiene ventas a crédito con saldo pendiente.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogEnviar(null)}>Cancelar</Button>
            <Button onClick={confirmarEnviar} disabled={enviando}>{enviando ? 'Enviando...' : 'Confirmar y crear póliza'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConciliacionPage;
