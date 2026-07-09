import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Upload, Wand2, FileCheck } from 'lucide-react';
import { toast } from 'sonner';
import { AsientoGenerator } from '@/services/AsientoGenerator';

type Cuenta = { id: string; codigo: string; nombre: string; naturaleza: string; nivel: number; codigo_agrupador_sat: string | null; afectable: boolean; activo: boolean };
type Mov = { id?: string; cuenta_id: string; cargo: number; abono: number; concepto?: string };

export default function ContabilidadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Contabilidad</h1>
        <p className="text-muted-foreground">Catálogo de cuentas, pólizas, reglas y consolidación.</p>
      </div>
      <Tabs defaultValue="polizas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="polizas">Pólizas</TabsTrigger>
          <TabsTrigger value="catalogo">Catálogo de cuentas</TabsTrigger>
          <TabsTrigger value="saldos">Saldos de apertura</TabsTrigger>
          <TabsTrigger value="reglas">Reglas</TabsTrigger>
          <TabsTrigger value="auto">Asientos automáticos</TabsTrigger>
          <TabsTrigger value="parametros">Parámetros</TabsTrigger>
        </TabsList>
        <TabsContent value="polizas"><PolizasTab /></TabsContent>
        <TabsContent value="catalogo"><CatalogoTab /></TabsContent>
        <TabsContent value="saldos"><SaldosAperturaTab /></TabsContent>
        <TabsContent value="reglas"><ReglasTab /></TabsContent>
        <TabsContent value="auto"><AutoTab /></TabsContent>
        <TabsContent value="parametros"><ParametrosTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function CatalogoTab() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('catalogo_cuentas').select('*').order('codigo');
    setCuentas((data as any) || []);
  };
  useEffect(() => { load(); }, []);

  const importarExcel = async (file: File) => {
    setLoading(true);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const filas = rows.map(r => ({
        codigo: String(r.codigo ?? r.Codigo ?? r['Código'] ?? '').trim(),
        nombre: String(r.nombre ?? r.Nombre ?? '').trim(),
        nivel: Number(r.nivel ?? r.Nivel ?? 1),
        naturaleza: String(r.naturaleza ?? r.Naturaleza ?? 'deudora').toLowerCase().includes('acre') ? 'acreedora' : 'deudora',
        codigo_agrupador_sat: r.codigo_agrupador_sat ?? r.SAT ?? null,
        afectable: r.afectable === false ? false : true,
      })).filter(f => f.codigo && f.nombre);
      if (!filas.length) { toast.error('Archivo vacío o columnas inválidas'); return; }
      const { error } = await supabase.from('catalogo_cuentas').upsert(filas as any, { onConflict: 'codigo' });
      if (error) throw error;
      toast.success(`Importadas/actualizadas ${filas.length} cuentas`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setLoading(false); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Catálogo de cuentas ({cuentas.length})</CardTitle>
        <div>
          <input id="cat-file" type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => e.target.files?.[0] && importarExcel(e.target.files[0])} />
          <Button variant="outline" disabled={loading} onClick={() => document.getElementById('cat-file')?.click()}>
            <Upload className="h-4 w-4 mr-2" />Importar catálogo
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b">
              <tr><th className="text-left p-2">Código</th><th className="text-left p-2">Nombre</th><th className="text-left p-2">Nivel</th><th className="text-left p-2">Naturaleza</th><th className="text-left p-2">SAT</th></tr>
            </thead>
            <tbody>
              {cuentas.map(c => (
                <tr key={c.id} className="border-b hover:bg-accent/30">
                  <td className="p-2 font-mono">{c.codigo}</td>
                  <td className="p-2">{c.nombre}</td>
                  <td className="p-2">{c.nivel}</td>
                  <td className="p-2"><Badge variant={c.naturaleza === 'deudora' ? 'default' : 'secondary'}>{c.naturaleza}</Badge></td>
                  <td className="p-2 font-mono text-xs">{c.codigo_agrupador_sat}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function PolizasTab() {
  const [polizas, setPolizas] = useState<any[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [show, setShow] = useState(false);
  const [tipo, setTipo] = useState<'ingreso'|'egreso'|'diario'>('diario');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0,10));
  const [concepto, setConcepto] = useState('');
  const [movs, setMovs] = useState<Mov[]>([{ cuenta_id: '', cargo: 0, abono: 0 }, { cuenta_id: '', cargo: 0, abono: 0 }]);

  const load = async () => {
    const { data } = await supabase.from('polizas').select('*').order('fecha', { ascending: false }).limit(100);
    setPolizas((data as any) || []);
  };
  useEffect(() => {
    load();
    supabase.from('catalogo_cuentas').select('*').eq('activo', true).eq('afectable', true).order('codigo')
      .then(({ data }) => setCuentas((data as any) || []));
  }, []);

  const sumC = movs.reduce((s, m) => s + Number(m.cargo || 0), 0);
  const sumA = movs.reduce((s, m) => s + Number(m.abono || 0), 0);
  const balanceada = Math.abs(sumC - sumA) < 0.01 && sumC > 0;

  const guardar = async (autorizar: boolean) => {
    if (autorizar && !balanceada) { toast.error('Cargo ≠ Abono'); return; }
    const { data: pol, error } = await supabase.from('polizas').insert({
      tipo, fecha, concepto, estatus: autorizar ? 'autorizada' : 'borrador', origen: 'manual',
    }).select('id').single();
    if (error) { toast.error(error.message); return; }
    const lineas = movs.filter(m => m.cuenta_id && (Number(m.cargo) > 0 || Number(m.abono) > 0))
      .map(m => ({ poliza_id: pol!.id, cuenta_id: m.cuenta_id, cargo: Number(m.cargo || 0), abono: Number(m.abono || 0), concepto: m.concepto }));
    if (!lineas.length) { toast.error('Sin movimientos'); return; }
    await supabase.from('poliza_movimientos').insert(lineas);
    if (autorizar) {
      const { error: e2 } = await supabase.from('polizas').update({ estatus: 'autorizada' }).eq('id', pol!.id);
      if (e2) { toast.error('No se pudo autorizar: ' + e2.message); }
    }
    toast.success('Póliza guardada');
    setShow(false); setConcepto(''); setMovs([{ cuenta_id: '', cargo: 0, abono: 0 }, { cuenta_id: '', cargo: 0, abono: 0 }]);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Pólizas ({polizas.length})</h2>
        <Button onClick={() => setShow(!show)}><Plus className="h-4 w-4 mr-2" />Nueva póliza</Button>
      </div>

      {show && (
        <Card>
          <CardHeader><CardTitle>Captura</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Tipo</Label>
                <Select value={tipo} onValueChange={(v: any) => setTipo(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ingreso">Ingreso</SelectItem>
                    <SelectItem value="egreso">Egreso</SelectItem>
                    <SelectItem value="diario">Diario</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Fecha</Label><Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></div>
              <div><Label>Concepto</Label><Input value={concepto} onChange={e => setConcepto(e.target.value)} /></div>
            </div>
            <div className="border rounded">
              <table className="w-full text-sm">
                <thead className="bg-muted"><tr><th className="p-2 text-left">Cuenta</th><th className="p-2 text-right">Cargo</th><th className="p-2 text-right">Abono</th><th className="p-2">Concepto</th><th></th></tr></thead>
                <tbody>
                  {movs.map((m, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-1">
                        <Select value={m.cuenta_id} onValueChange={v => { const n=[...movs]; n[i].cuenta_id=v; setMovs(n); }}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Cuenta" /></SelectTrigger>
                          <SelectContent>{cuentas.map(c => <SelectItem key={c.id} value={c.id}>{c.codigo} - {c.nombre}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="p-1"><Input type="number" step="0.01" value={m.cargo} onChange={e => { const n=[...movs]; n[i].cargo=Number(e.target.value); setMovs(n); }} className="h-8 text-right" /></td>
                      <td className="p-1"><Input type="number" step="0.01" value={m.abono} onChange={e => { const n=[...movs]; n[i].abono=Number(e.target.value); setMovs(n); }} className="h-8 text-right" /></td>
                      <td className="p-1"><Input value={m.concepto || ''} onChange={e => { const n=[...movs]; n[i].concepto=e.target.value; setMovs(n); }} className="h-8" /></td>
                      <td className="p-1"><Button size="icon" variant="ghost" onClick={() => setMovs(movs.filter((_,j)=>j!==i))}><Trash2 className="h-4 w-4" /></Button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/50 font-semibold">
                  <tr>
                    <td className="p-2">Totales</td>
                    <td className="p-2 text-right">${sumC.toFixed(2)}</td>
                    <td className="p-2 text-right">${sumA.toFixed(2)}</td>
                    <td className="p-2" colSpan={2}>
                      {balanceada ? <Badge>Balanceada</Badge> : <Badge variant="destructive">Diferencia ${(sumC-sumA).toFixed(2)}</Badge>}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMovs([...movs, { cuenta_id: '', cargo: 0, abono: 0 }])}>Agregar renglón</Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={() => guardar(false)}>Guardar borrador</Button>
              <Button disabled={!balanceada} onClick={() => guardar(true)}><FileCheck className="h-4 w-4 mr-2" />Autorizar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted"><tr><th className="p-2 text-left">Folio</th><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Tipo</th><th className="p-2 text-left">Concepto</th><th className="p-2 text-left">Origen</th><th className="p-2 text-right">Cargo</th><th className="p-2 text-right">Abono</th><th className="p-2 text-left">Estatus</th></tr></thead>
            <tbody>
              {polizas.map(p => (
                <tr key={p.id} className="border-b">
                  <td className="p-2 font-mono text-xs">{p.folio || p.id.slice(0,8)}</td>
                  <td className="p-2">{p.fecha}</td>
                  <td className="p-2">{p.tipo}</td>
                  <td className="p-2">{p.concepto}</td>
                  <td className="p-2"><Badge variant="outline">{p.origen}</Badge></td>
                  <td className="p-2 text-right">${Number(p.total_cargo).toFixed(2)}</td>
                  <td className="p-2 text-right">${Number(p.total_abono).toFixed(2)}</td>
                  <td className="p-2"><Badge variant={p.estatus==='autorizada'?'default':p.estatus==='cancelada'?'destructive':'secondary'}>{p.estatus}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function ReglasTab() {
  const [reglas, setReglas] = useState<any[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const load = async () => {
    const { data } = await supabase.from('reglas_contabilizacion').select('*').order('origen');
    setReglas((data as any) || []);
  };
  useEffect(() => {
    load();
    supabase.from('catalogo_cuentas').select('*').eq('afectable', true).order('codigo')
      .then(({ data }) => setCuentas((data as any) || []));
  }, []);
  const guardar = async (r: any) => {
    await supabase.from('reglas_contabilizacion').update({
      cuenta_cargo_id: r.cuenta_cargo_id, cuenta_abono_id: r.cuenta_abono_id, activo: r.activo,
    }).eq('id', r.id);
    toast.success('Regla actualizada');
  };
  return (
    <Card>
      <CardHeader><CardTitle>Reglas de contabilización</CardTitle></CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="bg-muted"><tr><th className="p-2 text-left">Origen</th><th className="p-2 text-left">Descripción</th><th className="p-2 text-left">Cuenta cargo</th><th className="p-2 text-left">Cuenta abono</th><th></th></tr></thead>
          <tbody>
            {reglas.map((r, i) => (
              <tr key={r.id} className="border-b">
                <td className="p-2 font-mono">{r.origen}</td>
                <td className="p-2">{r.descripcion}</td>
                <td className="p-2">
                  <Select value={r.cuenta_cargo_id || ''} onValueChange={v => { const n=[...reglas]; n[i].cuenta_cargo_id=v; setReglas(n); }}>
                    <SelectTrigger className="h-8 w-72"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{cuentas.map(c => <SelectItem key={c.id} value={c.id}>{c.codigo} - {c.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="p-2">
                  <Select value={r.cuenta_abono_id || ''} onValueChange={v => { const n=[...reglas]; n[i].cuenta_abono_id=v; setReglas(n); }}>
                    <SelectTrigger className="h-8 w-72"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{cuentas.map(c => <SelectItem key={c.id} value={c.id}>{c.codigo} - {c.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="p-2"><Button size="sm" onClick={() => guardar(r)}>Guardar</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function AutoTab() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<{creadas:number; total:number}>) => {
    setBusy(true);
    try {
      const r = await fn();
      toast.success(`${r.creadas} pólizas borrador creadas de ${r.total} registros`);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Generador de asientos automáticos</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Crea pólizas <strong>borrador</strong> (no afectan saldos hasta autorizarlas). Mapeo de cuentas configurable en la pestaña Reglas.</p>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div><Label>Desde</Label><Input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></div>
          <div><Label>Hasta</Label><Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button disabled={busy} onClick={() => run(() => AsientoGenerator.generarDesdeCFDIs(desde||undefined, hasta||undefined))}>
            <Wand2 className="h-4 w-4 mr-2" />Desde CFDIs (ingreso)
          </Button>
          <Button disabled={busy} onClick={() => run(() => AsientoGenerator.generarDesdePagosCxP(desde||undefined, hasta||undefined))}>
            <Wand2 className="h-4 w-4 mr-2" />Desde Pagos CxP
          </Button>
          <Button disabled={busy} onClick={() => run(() => AsientoGenerator.generarDesdeBancos(desde||undefined, hasta||undefined))}>
            <Wand2 className="h-4 w-4 mr-2" />Desde Bancos conciliados
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ParametrosTab() {
  const [p, setP] = useState<any>(null);
  useEffect(() => { supabase.from('contabilidad_parametros').select('*').eq('id',1).maybeSingle().then(({data})=>setP(data)); }, []);
  if (!p) return <div>Cargando...</div>;
  const save = async () => {
    await supabase.from('contabilidad_parametros').update({
      fecha_inicio_contable: p.fecha_inicio_contable, prorrateo_cedis_pct: p.prorrateo_cedis_pct,
    }).eq('id', 1);
    toast.success('Parámetros guardados');
  };
  return (
    <Card>
      <CardHeader><CardTitle>Parámetros</CardTitle></CardHeader>
      <CardContent className="space-y-3 max-w-md">
        <div><Label>Fecha de inicio contable</Label>
          <Input type="date" value={p.fecha_inicio_contable} onChange={e=>setP({...p,fecha_inicio_contable:e.target.value})} /></div>
        <div><Label>Prorrateo de CEDIS (%) sobre 4 sucursales fiscales</Label>
          <Input type="number" step="0.01" value={p.prorrateo_cedis_pct} onChange={e=>setP({...p,prorrateo_cedis_pct:Number(e.target.value)})} />
          <p className="text-xs text-muted-foreground mt-1">25% = repartir CEDIS equitativo entre las 4 fiscales.</p>
        </div>
        <Button onClick={save}>Guardar</Button>
      </CardContent>
    </Card>
  );
}

function SaldosAperturaTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [fechaCorte, setFechaCorte] = useState('2026-03-31');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any[] | null>(null);

  const load = async () => {
    const { data } = await supabase.from('saldos_apertura')
      .select('*, catalogo_cuentas(codigo, nombre)')
      .eq('fecha_corte', fechaCorte)
      .order('created_at');
    setRows((data as any) || []);
  };
  useEffect(() => { load(); }, [fechaCorte]);
  useEffect(() => {
    supabase.from('catalogo_cuentas').select('id,codigo,nombre,nivel,naturaleza,codigo_agrupador_sat,afectable,activo').order('codigo')
      .then(({ data }) => setCuentas((data as any) || []));
  }, []);

  const totales = {
    deudor: rows.reduce((s, r) => s + Number(r.saldo_deudor || 0), 0),
    acreedor: rows.reduce((s, r) => s + Number(r.saldo_acreedor || 0), 0),
  };
  const diff = totales.deudor - totales.acreedor;

  const importarExcel = async (file: File) => {
    setLoading(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer());
      const raw: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      // find header row containing 'Cuenta' or 'Código'
      let headerIdx = 0;
      for (let i = 0; i < Math.min(15, raw.length); i++) {
        const line = raw[i].map((v: any) => String(v).toLowerCase()).join(' ');
        if (line.includes('cuenta') || line.includes('código') || line.includes('codigo')) { headerIdx = i; break; }
      }
      const map = new Map(cuentas.map(c => [c.codigo, c.id]));
      const parsed = raw.slice(headerIdx + 1).map((r: any[]) => {
        const codigo = String(r[0] ?? '').trim();
        const deudor = Number(String(r[6] ?? r[2] ?? 0).replace(/[,$\s]/g, '')) || 0;
        const acreedor = Number(String(r[7] ?? r[3] ?? 0).replace(/[,$\s]/g, '')) || 0;
        return { codigo, deudor, acreedor, cuenta_id: map.get(codigo), match: !!map.get(codigo) };
      }).filter(x => x.codigo && (x.deudor !== 0 || x.acreedor !== 0));
      setPreview(parsed);
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };

  const confirmar = async () => {
    if (!preview) return;
    const validos = preview.filter(p => p.match);
    if (!validos.length) { toast.error('Ningún código coincide con el catálogo'); return; }
    const payload = validos.map(p => ({
      cuenta_id: p.cuenta_id, fecha_corte: fechaCorte,
      saldo_deudor: p.deudor, saldo_acreedor: p.acreedor,
      origen: 'importado_ui', notas: `Importado ${new Date().toLocaleDateString()}`,
    }));
    const { error } = await supabase.from('saldos_apertura').upsert(payload as any, { onConflict: 'cuenta_id,fecha_corte' });
    if (error) { toast.error(error.message); return; }
    toast.success(`${validos.length} saldos guardados`);
    setPreview(null); load();
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div><Label>Fecha de corte</Label><Input type="date" value={fechaCorte} onChange={e => setFechaCorte(e.target.value)} className="w-48" /></div>
          <input id="sa-file" type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => e.target.files?.[0] && importarExcel(e.target.files[0])} />
          <Button variant="outline" disabled={loading} onClick={() => document.getElementById('sa-file')?.click()}>
            <Upload className="h-4 w-4 mr-2" />Importar balanza (Excel)
          </Button>
          <div className="ml-auto text-sm">
            <div>Total deudor: <strong>${totales.deudor.toLocaleString('es-MX',{minimumFractionDigits:2})}</strong></div>
            <div>Total acreedor: <strong>${totales.acreedor.toLocaleString('es-MX',{minimumFractionDigits:2})}</strong></div>
            <div>Diferencia: <Badge variant={Math.abs(diff)<0.5?'default':'destructive'}>${diff.toLocaleString('es-MX',{minimumFractionDigits:2})}</Badge></div>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Vista previa — {preview.length} filas ({preview.filter(p=>p.match).length} coinciden con catálogo)</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreview(null)}>Cancelar</Button>
              <Button onClick={confirmar}><FileCheck className="h-4 w-4 mr-2" />Confirmar carga</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0"><tr><th className="p-2 text-left">Código</th><th className="p-2 text-right">Deudor</th><th className="p-2 text-right">Acreedor</th><th className="p-2">Estado</th></tr></thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2 font-mono">{p.codigo}</td>
                    <td className="p-2 text-right">${p.deudor.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                    <td className="p-2 text-right">${p.acreedor.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                    <td className="p-2">{p.match ? <Badge>OK</Badge> : <Badge variant="destructive">Sin código en catálogo</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Saldos guardados ({rows.length})</CardTitle></CardHeader>
        <CardContent className="p-0 max-h-[500px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted sticky top-0"><tr><th className="p-2 text-left">Código</th><th className="p-2 text-left">Cuenta</th><th className="p-2 text-right">Deudor</th><th className="p-2 text-right">Acreedor</th><th className="p-2 text-left">Origen</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b">
                  <td className="p-2 font-mono">{r.catalogo_cuentas?.codigo}</td>
                  <td className="p-2">{r.catalogo_cuentas?.nombre}</td>
                  <td className="p-2 text-right">${Number(r.saldo_deudor).toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                  <td className="p-2 text-right">${Number(r.saldo_acreedor).toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                  <td className="p-2 text-xs"><Badge variant="outline">{r.origen}</Badge></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Sin saldos para esta fecha. Importa la balanza o captura manualmente.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
