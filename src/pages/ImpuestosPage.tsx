import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Calculator, Download, FileText, Send } from 'lucide-react';
import { toast } from 'sonner';
import { ImpuestosCalculator, SatConnector } from '@/services/ImpuestosCalculator';

export default function ImpuestosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Determinación de impuestos</h1>
        <p className="text-muted-foreground">IVA, ISR, ISN, retenciones e IEPS opcional.</p>
      </div>
      <Tabs defaultValue="iva">
        <TabsList>
          <TabsTrigger value="iva">IVA</TabsTrigger>
          <TabsTrigger value="isr">ISR provisional</TabsTrigger>
          <TabsTrigger value="isn">ISN / Retenciones</TabsTrigger>
          <TabsTrigger value="ieps">IEPS</TabsTrigger>
          <TabsTrigger value="declaraciones">Declaraciones</TabsTrigger>
          <TabsTrigger value="parametros">Parámetros</TabsTrigger>
        </TabsList>
        <TabsContent value="iva"><IvaTab /></TabsContent>
        <TabsContent value="isr"><IsrTab /></TabsContent>
        <TabsContent value="isn"><IsnTab /></TabsContent>
        <TabsContent value="ieps"><IepsTab /></TabsContent>
        <TabsContent value="declaraciones"><DeclaracionesTab /></TabsContent>
        <TabsContent value="parametros"><ParametrosTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function Periodo({ anio, mes, setAnio, setMes }: any) {
  return (
    <div className="flex gap-2 items-end">
      <div><Label>Año</Label><Input type="number" value={anio} onChange={e => setAnio(Number(e.target.value))} className="w-24" /></div>
      <div><Label>Mes</Label><Input type="number" min={1} max={12} value={mes} onChange={e => setMes(Number(e.target.value))} className="w-20" /></div>
    </div>
  );
}

function IvaTab() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [r, setR] = useState<any>(null);
  const calc = async () => { setR(await ImpuestosCalculator.ivaMensual(anio, mes)); };
  useEffect(() => { calc(); /* eslint-disable-next-line */ }, [anio, mes]);
  const guardar = async () => {
    if (!r) return;
    await supabase.from('declaraciones').insert({
      periodo_anio: anio, periodo_mes: mes, tipo: 'provisional', impuesto: 'IVA',
      base: r.base_16, causado: r.trasladado_16, retenido: r.acreditable_16,
      a_cargo_o_favor: r.a_cargo - r.a_favor, detalle: r,
    });
    toast.success('Declaración borrador creada');
  };
  return (
    <Card>
      <CardHeader className="flex flex-row justify-between"><Periodo anio={anio} mes={mes} setAnio={setAnio} setMes={setMes} />
        <Button onClick={guardar} disabled={!r}><FileText className="h-4 w-4 mr-2" />Crear declaración</Button>
      </CardHeader>
      <CardContent className="space-y-2 max-w-3xl">
        {!r ? 'Calculando...' : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Card><CardContent className="p-3"><p className="text-xs">IVA trasladado 16%</p><p className="text-xl font-bold">${r.trasladado_16.toFixed(2)}</p></CardContent></Card>
              <Card><CardContent className="p-3"><p className="text-xs">IVA acreditable</p><p className="text-xl font-bold">${r.acreditable_16.toFixed(2)}</p></CardContent></Card>
              <Card><CardContent className="p-3"><p className="text-xs">IVA a {r.a_cargo > r.a_favor ? 'cargo' : 'favor'}</p><p className="text-xl font-bold">${Math.max(r.a_cargo, r.a_favor).toFixed(2)}</p></CardContent></Card>
            </div>
            <table className="w-full text-sm border mt-3">
              <thead className="bg-muted"><tr><th className="p-2 text-left">Tasa</th><th className="p-2 text-right">Base</th><th className="p-2 text-right">IVA</th></tr></thead>
              <tbody>
                <tr className="border-b"><td className="p-2">16% (ingresos)</td><td className="p-2 text-right">${r.base_16.toFixed(2)}</td><td className="p-2 text-right">${r.trasladado_16.toFixed(2)}</td></tr>
                <tr className="border-b"><td className="p-2">0%</td><td className="p-2 text-right">${r.base_0.toFixed(2)}</td><td className="p-2 text-right">$0.00</td></tr>
                <tr className="border-b"><td className="p-2">Exento</td><td className="p-2 text-right">${r.base_exento.toFixed(2)}</td><td className="p-2 text-right">$0.00</td></tr>
                <tr><td className="p-2">Compras (acreditable)</td><td className="p-2 text-right">${r.base_compras.toFixed(2)}</td><td className="p-2 text-right">${r.acreditable_16.toFixed(2)}</td></tr>
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function IsrTab() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [r, setR] = useState<any>(null);
  useEffect(() => { ImpuestosCalculator.isrProvisional(anio, mes).then(setR); }, [anio, mes]);
  const guardar = async () => {
    if (!r) return;
    await supabase.from('declaraciones').insert({
      periodo_anio: anio, periodo_mes: mes, tipo: 'provisional', impuesto: 'ISR',
      base: r.utilidad_estimada, causado: r.isr_causado, pagado_previo: r.pagado_previo,
      a_cargo_o_favor: r.a_cargo, detalle: r,
    });
    toast.success('Declaración borrador creada');
  };
  return (
    <Card>
      <CardHeader className="flex flex-row justify-between"><Periodo anio={anio} mes={mes} setAnio={setAnio} setMes={setMes} />
        <Button onClick={guardar} disabled={!r}><FileText className="h-4 w-4 mr-2" />Crear declaración</Button>
      </CardHeader>
      <CardContent className="space-y-2 max-w-xl">
        {!r ? '...' : (
          <>
            <Row k="Ingresos acumulados" v={r.ingresos_acumulados} />
            <Row k={`× Coeficiente utilidad (${(r.coeficiente_utilidad * 100).toFixed(2)}%)`} v={r.utilidad_estimada} />
            <Row k="ISR causado (30%)" v={r.isr_causado} />
            <Row k="(-) Pagos provisionales previos" v={r.pagado_previo} />
            <Row k="ISR a cargo" v={r.a_cargo} bold />
            <p className="text-xs text-muted-foreground">Coeficiente de utilidad editable en pestaña Parámetros (lo confirma el cliente).</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
function Row({ k, v, bold }: any) {
  return <div className={`flex justify-between border-b py-2 ${bold ? 'font-bold text-lg' : ''}`}><span>{k}</span><span>${Number(v).toFixed(2)}</span></div>;
}

function IsnTab() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [isn, setIsn] = useState<any>(null);
  const [ret, setRet] = useState<any>(null);
  useEffect(() => {
    ImpuestosCalculator.isn(anio, mes).then(setIsn);
    ImpuestosCalculator.retenciones(anio, mes).then(setRet);
  }, [anio, mes]);
  return (
    <Card>
      <CardHeader><Periodo anio={anio} mes={mes} setAnio={setAnio} setMes={setMes} /></CardHeader>
      <CardContent className="space-y-3 max-w-xl">
        <h3 className="font-semibold">ISN (Impuesto Sobre Nómina) — por estado</h3>
        {isn && <>
          {Object.entries(isn.por_estado || {}).map(([estado, d]: any) => (
            <div key={estado} className="border rounded p-2 mb-2">
              <div className="flex justify-between items-center">
                <span className="font-medium">{estado} {d.codigo ? <span className="text-xs text-muted-foreground">({d.codigo})</span> : null}</span>
                <Badge variant={d.confirmado ? 'default' : 'secondary'}>
                  {d.confirmado ? `Tasa ${(d.tasa*100).toFixed(2)}%` : `Tasa ${(d.tasa*100).toFixed(2)}% — PENDIENTE`}
                </Badge>
              </div>
              <Row k="Base (percepciones)" v={d.base} />
              <Row k="ISN causado" v={d.causado} bold />
            </div>
          ))}
          <Row k="TOTAL ISN causado" v={isn.causado} bold />
        </>}
        <h3 className="font-semibold mt-4">Retenciones (tasas configurables)</h3>
        {ret && <>
          <p>ISR honorarios: <Badge>{ret.retencion_isr_pct}%</Badge></p>
          <p>IVA retenido: <Badge>{ret.retencion_iva_pct}%</Badge></p>
          <p className="text-xs text-muted-foreground">{ret.nota}</p>
        </>}
      </CardContent>
    </Card>
  );
}

function IepsTab() {
  const [params, setParams] = useState<any>(null);
  useEffect(() => { supabase.from('impuestos_parametros').select('*').eq('id',1).single().then(({data})=>setParams(data)); }, []);
  if (!params) return null;
  const toggle = async () => {
    const v = !params.ieps_activo;
    await supabase.from('impuestos_parametros').update({ ieps_activo: v }).eq('id', 1);
    setParams({ ...params, ieps_activo: v });
    toast.success(v ? 'IEPS activado' : 'IEPS desactivado');
  };
  return (
    <Card>
      <CardHeader><CardTitle>IEPS (opcional)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">En farmacia normalmente no aplica. El cliente confirma.</p>
        <div className="flex items-center gap-2">
          <Switch checked={params.ieps_activo} onCheckedChange={toggle} />
          <span>{params.ieps_activo ? 'Activo' : 'Desactivado'}</span>
        </div>
        {params.ieps_activo && <p className="text-xs">Estructura lista. Captura por producto vendrá cuando el cliente lo solicite.</p>}
      </CardContent>
    </Card>
  );
}

function DeclaracionesTab() {
  const [rows, setRows] = useState<any[]>([]);
  const load = async () => {
    const { data } = await supabase.from('declaraciones').select('*').order('periodo_anio', { ascending: false }).order('periodo_mes', { ascending: false });
    setRows((data as any) || []);
  };
  useEffect(() => { load(); }, []);
  const enviar = async (d: any) => {
    const r = await SatConnector.prellenarDeclaracion(d);
    toast.success(r.pendiente);
  };
  return (
    <Card>
      <CardHeader><CardTitle>Historial de declaraciones</CardTitle></CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="bg-muted"><tr><th className="p-2 text-left">Periodo</th><th className="p-2 text-left">Tipo</th><th className="p-2 text-left">Impuesto</th><th className="p-2 text-right">Base</th><th className="p-2 text-right">A cargo/favor</th><th className="p-2 text-left">Estatus</th><th></th></tr></thead>
          <tbody>{rows.map(d => (
            <tr key={d.id} className="border-b">
              <td className="p-2">{d.periodo_anio}{d.periodo_mes ? `-${String(d.periodo_mes).padStart(2,'0')}` : ''}</td>
              <td className="p-2">{d.tipo}</td><td className="p-2">{d.impuesto}</td>
              <td className="p-2 text-right">${Number(d.base).toFixed(2)}</td>
              <td className="p-2 text-right font-semibold">${Number(d.a_cargo_o_favor).toFixed(2)}</td>
              <td className="p-2"><Badge>{d.estatus}</Badge></td>
              <td className="p-2"><Button size="sm" variant="outline" onClick={() => enviar(d)}><Send className="h-3 w-3 mr-1" />SAT (stub)</Button></td>
            </tr>
          ))}</tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ParametrosTab() {
  const [p, setP] = useState<any>(null);
  useEffect(() => { supabase.from('impuestos_parametros').select('*').eq('id',1).single().then(({data})=>setP(data)); }, []);
  if (!p) return null;
  const save = async () => {
    await supabase.from('impuestos_parametros').update({
      coeficiente_utilidad: p.coeficiente_utilidad, isn_tasa_pct: p.isn_tasa_pct,
      retencion_isr_pct: p.retencion_isr_pct, retencion_iva_pct: p.retencion_iva_pct,
      uma_diaria: p.uma_diaria, salario_minimo_diario: p.salario_minimo_diario,
      anio_vigente: p.anio_vigente, periodicidad_nomina: p.periodicidad_nomina,
    }).eq('id', 1);
    toast.success('Guardado');
  };
  return (
    <Card>
      <CardHeader><CardTitle>Parámetros (ganchos configurables)</CardTitle></CardHeader>
      <CardContent className="space-y-3 max-w-md">
        <div><Label>Coeficiente de utilidad (ej. 0.05)</Label><Input type="number" step="0.0001" value={p.coeficiente_utilidad} onChange={e=>setP({...p,coeficiente_utilidad:Number(e.target.value)})} /></div>
        <div><Label>Tasa ISN (%) — confirma con Edomex</Label><Input type="number" step="0.01" value={p.isn_tasa_pct} onChange={e=>setP({...p,isn_tasa_pct:Number(e.target.value)})} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Retención ISR (%)</Label><Input type="number" step="0.01" value={p.retencion_isr_pct} onChange={e=>setP({...p,retencion_isr_pct:Number(e.target.value)})} /></div>
          <div><Label>Retención IVA (%)</Label><Input type="number" step="0.01" value={p.retencion_iva_pct} onChange={e=>setP({...p,retencion_iva_pct:Number(e.target.value)})} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>UMA diaria</Label><Input type="number" step="0.01" value={p.uma_diaria} onChange={e=>setP({...p,uma_diaria:Number(e.target.value)})} /></div>
          <div><Label>Salario mínimo</Label><Input type="number" step="0.01" value={p.salario_minimo_diario} onChange={e=>setP({...p,salario_minimo_diario:Number(e.target.value)})} /></div>
        </div>
        <div><Label>Periodicidad nómina</Label>
          <Select value={p.periodicidad_nomina} onValueChange={v=>setP({...p,periodicidad_nomina:v})}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="quincenal">Quincenal</SelectItem>
              <SelectItem value="mensual">Mensual</SelectItem>
              <SelectItem value="semanal">Semanal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={save}>Guardar parámetros</Button>
      </CardContent>
      <CardContent>
        <IsnTasasEditor />
      </CardContent>
    </Card>
  );
}

function IsnTasasEditor() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('isn_tasas_estado').select('*').order('estado');
    setRows((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const update = (id: string, patch: any) =>
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch, _dirty: true } : r));
  const save = async (r: any) => {
    const { error } = await supabase.from('isn_tasas_estado').update({
      tasa_pct: Number(r.tasa_pct), nota: r.nota || null, confirmado: true,
    }).eq('id', r.id);
    if (error) return toast.error(error.message);
    toast.success(`ISN ${r.estado} guardado y confirmado`);
    load();
  };
  const addNuevo = async () => {
    const estado = prompt('Código de estado (ej. MEX, CDMX, JAL):')?.trim().toUpperCase();
    if (!estado) return;
    const { error } = await supabase.from('isn_tasas_estado').insert({
      estado, tasa_pct: 3, confirmado: false, vigencia_desde: new Date().toISOString().slice(0,10),
      nota: 'Nuevo — confirmar tasa con contador',
    });
    if (error) return toast.error(error.message);
    load();
  };
  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Tasas ISN por estado</h3>
        <Button size="sm" variant="outline" onClick={addNuevo}>+ Nuevo estado</Button>
      </div>
      <p className="text-xs text-muted-foreground">Edita la tasa por estado. Al guardar queda marcada como <b>confirmada</b> y se aplica al cálculo por sucursal.</p>
      {loading ? <p>Cargando...</p> : (
        <table className="w-full text-sm border">
          <thead className="bg-muted"><tr>
            <th className="p-2 text-left">Estado</th>
            <th className="p-2 text-left">Tasa %</th>
            <th className="p-2 text-left">Nota</th>
            <th className="p-2 text-left">Estatus</th>
            <th className="p-2"></th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b">
                <td className="p-2 font-medium">{r.estado}</td>
                <td className="p-2"><Input type="number" step="0.01" value={r.tasa_pct} onChange={e=>update(r.id,{tasa_pct:e.target.value})} className="w-24" /></td>
                <td className="p-2"><Input value={r.nota || ''} onChange={e=>update(r.id,{nota:e.target.value})} /></td>
                <td className="p-2"><Badge variant={r.confirmado ? 'default':'secondary'}>{r.confirmado?'Confirmado':'Pendiente'}</Badge></td>
                <td className="p-2 text-right"><Button size="sm" disabled={!r._dirty} onClick={()=>save(r)}>Guardar</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
