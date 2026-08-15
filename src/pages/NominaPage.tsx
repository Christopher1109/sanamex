import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Upload, Plus, Calculator, FileCheck, Receipt, FileText, Download, Lock, Pencil, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { NominaCalculator, BiometricoConnector } from '@/services/NominaCalculator';
import { ComisionesCalculator, type PreviewComision } from '@/services/ComisionesCalculator';

export default function NominaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Nómina</h1>
        <p className="text-muted-foreground">Empleados, conceptos, asistencia, recibos y comisiones.</p>
      </div>
      <Tabs defaultValue="empleados">
        <TabsList>
          <TabsTrigger value="empleados">Empleados</TabsTrigger>
          <TabsTrigger value="primas">Primas RT</TabsTrigger>
          <TabsTrigger value="conceptos">Conceptos</TabsTrigger>
          <TabsTrigger value="asistencia">Asistencia</TabsTrigger>
          <TabsTrigger value="recibos">Recibos</TabsTrigger>
          <TabsTrigger value="comisiones">Comisiones</TabsTrigger>
        </TabsList>
        <TabsContent value="empleados"><EmpleadosTab /></TabsContent>
        <TabsContent value="primas"><PrimasRTTab /></TabsContent>
        <TabsContent value="conceptos"><ConceptosTab /></TabsContent>
        <TabsContent value="asistencia"><AsistenciaTab /></TabsContent>
        <TabsContent value="recibos"><RecibosTab /></TabsContent>
        <TabsContent value="comisiones"><ComisionesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// EMPLEADOS (sin cambios)
// ============================================================
function EmpleadosTab() {
  const [emps, setEmps] = useState<any[]>([]);
  const [perfiles, setPerfiles] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [n, setN] = useState<any>({ nombre: '', rfc: '', salario_diario: 0, sbc: 0, periodicidad_pago: 'quincenal' });
  const load = async () => {
    const { data } = await supabase.from('empleados').select('*').order('nombre');
    setEmps((data as any) || []);
  };
  useEffect(() => {
    load();
    supabase.from('profiles').select('id, nombre, email').eq('activo', true).order('nombre')
      .then(({ data }) => setPerfiles(data || []));
  }, []);
  const vincularUsuario = async (empleadoId: string, userId: string) => {
    const { error } = await supabase.from('empleados').update({ user_id: userId || null }).eq('id', empleadoId);
    if (error) { toast.error(error.message); return; }
    toast.success(userId ? 'Usuario vinculado — ya puede ver su "Mi Nómina"' : 'Vínculo quitado');
    load();
  };
  const [pendingBaja, setPendingBaja] = useState<any | null>(null);
  const toggleBaja = async (emp: any) => {
    const dandoDeBaja = emp.activo;
    const { error } = await supabase.from('empleados').update({
      activo: !dandoDeBaja,
      fecha_baja: dandoDeBaja ? new Date().toISOString().slice(0, 10) : null,
    }).eq('id', emp.id);
    setPendingBaja(null);
    if (error) { toast.error(error.message); return; }
    toast.success(dandoDeBaja ? `${emp.nombre} dado de baja` : `${emp.nombre} reactivado`);
    load();
  };
  const importar = async (file: File) => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer());
    const raw: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    let hdr = -1;
    for (let i = 0; i < Math.min(10, raw.length); i++) {
      const s = raw[i].map(v => String(v).toLowerCase()).join('|');
      if (s.includes('empleado') && s.includes('rfc')) { hdr = i; break; }
    }
    let rows: any[];
    if (hdr >= 0) {
      const headers = raw[hdr].map((h: any) => String(h).toLowerCase().trim());
      rows = raw.slice(hdr + 1).filter((r: any[]) => r[headers.indexOf('empleado')] || r[headers.indexOf('rfc')]).map((r: any[]) => {
        const o: any = {}; headers.forEach((h, i) => { o[h] = r[i]; }); return o;
      });
    } else { rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]); }
    const rfcRE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
    const curpRE = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
    const existing = new Set(emps.map(e => (e.rfc || '').toUpperCase()));
    const numsExist = new Set(emps.map(e => String(e.numero_empleado || '')));
    const parsed = rows.map((r: any) => {
      const nombre = String(r.empleado || r.nombre || r.Empleado || r.Nombre || '').trim();
      const rfc = String(r.rfc || r.RFC || '').trim().toUpperCase();
      const curp = String(r.curp || r.CURP || '').trim().toUpperCase();
      const nss = String(r.nss || r.NSS || '').trim();
      const numero_empleado = String(r['n. sistema'] || r.numero_empleado || r.NumeroEmpleado || r.NUM || '').trim();
      const clave_sistema = String(r['27'] || r.clave_sistema || '').trim();
      const puesto = String(r.puesto || r.Puesto || '').trim();
      const departamento = String(r.depto || r.departamento || '').trim();
      const registro_patronal = String(r['reg patronal'] || r.registro_patronal || '').trim();
      const banco = String(r.banco || r.Banco || '').trim();
      const cuenta = String(r.cuenta || r.Cuenta || r.clabe || '').trim();
      const fecha_alta = r['fecha ingreso'] || r.fecha_alta || null;
      const sd = Number(r['salario diario'] || r.salario_diario || r.SD || 0);
      const errores: string[] = [];
      if (!nombre) errores.push('Sin nombre');
      if (!rfcRE.test(rfc)) errores.push('RFC inválido');
      if (curp && !curpRE.test(curp)) errores.push('CURP inválido');
      const duplicado = existing.has(rfc) || numsExist.has(numero_empleado);
      return {
        payload: {
          numero_empleado: numero_empleado || null, clave_sistema: clave_sistema || null,
          nombre, rfc, curp: curp || null, nss: nss || null,
          puesto, departamento, registro_patronal: registro_patronal || null,
          banco, numero_cuenta: cuenta, clabe: cuenta,
          fecha_alta: fecha_alta ? (typeof fecha_alta === 'string' ? fecha_alta.slice(0,10) : new Date(fecha_alta).toISOString().slice(0,10)) : null,
          salario_diario: sd, sbc: Math.round(sd * 1.0452 * 100) / 100,
        }, errores, duplicado,
      };
    });
    setPreview(parsed);
  };
  const confirmarImport = async () => {
    if (!preview) return;
    const validos = preview.filter(p => p.errores.length === 0).map(p => p.payload);
    if (!validos.length) { toast.error('Sin filas válidas'); return; }
    const { error } = await supabase.from('empleados').upsert(validos as any, { onConflict: 'numero_empleado' });
    if (error) { toast.error(error.message); return; }
    toast.success(`${validos.length} empleados importados`);
    setPreview(null); load();
  };
  const crear = async () => {
    const { error } = await supabase.from('empleados').insert(n);
    if (error) { toast.error(error.message); return; }
    toast.success('Empleado creado'); setShow(false); load();
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button onClick={() => setShow(!show)}><Plus className="h-4 w-4 mr-2" />Nuevo</Button>
        <input id="emp-file" type="file" accept=".xlsx,.csv" className="hidden" onChange={e => e.target.files?.[0] && importar(e.target.files[0])} />
        <Button variant="outline" onClick={() => document.getElementById('emp-file')?.click()}><Upload className="h-4 w-4 mr-2" />Importar empleados</Button>
      </div>
      {preview && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Vista previa — {preview.length} filas ({preview.filter(p=>p.errores.length===0).length} válidas, {preview.filter(p=>p.duplicado).length} duplicadas)</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreview(null)}>Cancelar</Button>
              <Button onClick={confirmarImport}><FileCheck className="h-4 w-4 mr-2" />Confirmar carga</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0"><tr><th className="p-2 text-left">Nombre</th><th className="p-2">RFC</th><th className="p-2">RP</th><th className="p-2 text-right">SD</th><th className="p-2 text-left">Estado</th></tr></thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2 text-sm">{p.payload.nombre}</td>
                    <td className="p-2 font-mono text-xs">{p.payload.rfc}</td>
                    <td className="p-2 font-mono text-xs">{p.payload.registro_patronal}</td>
                    <td className="p-2 text-right">${Number(p.payload.salario_diario).toFixed(2)}</td>
                    <td className="p-2">
                      {p.errores.length > 0 ? <Badge variant="destructive">{p.errores.join(', ')}</Badge>
                        : p.duplicado ? <Badge variant="secondary">Actualizar</Badge> : <Badge>Nuevo</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {show && (
        <Card><CardContent className="p-4 grid grid-cols-2 gap-3">
          <div><Label>Nombre</Label><Input value={n.nombre} onChange={e=>setN({...n,nombre:e.target.value})} /></div>
          <div><Label>RFC</Label><Input value={n.rfc} onChange={e=>setN({...n,rfc:e.target.value.toUpperCase()})} /></div>
          <div><Label>Salario diario</Label><Input type="number" value={n.salario_diario} onChange={e=>setN({...n,salario_diario:Number(e.target.value)})} /></div>
          <div><Label>SBC</Label><Input type="number" value={n.sbc} onChange={e=>setN({...n,sbc:Number(e.target.value)})} /></div>
          <div className="col-span-2"><Button onClick={crear}>Guardar</Button></div>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted"><tr><th className="p-2 text-left">Nombre</th><th className="p-2 text-left">RFC</th><th className="p-2 text-left">Reg. Patronal</th><th className="p-2 text-left">Puesto</th><th className="p-2 text-right">SD</th><th className="p-2 text-right">SBC</th><th className="p-2 text-left">Estatus</th><th className="p-2 text-left">Usuario vinculado</th><th className="p-2"></th></tr></thead>
          <tbody>{emps.map(e => (
            <tr key={e.id} className="border-b"><td className="p-2">{e.nombre}</td><td className="p-2 font-mono text-xs">{e.rfc}</td><td className="p-2 font-mono text-xs">{e.registro_patronal || '—'}</td><td className="p-2">{e.puesto}</td><td className="p-2 text-right">${Number(e.salario_diario).toFixed(2)}</td><td className="p-2 text-right">${Number(e.sbc).toFixed(2)}</td><td className="p-2"><Badge variant={e.activo?'default':'secondary'}>{e.activo?'Activo':'Baja'}</Badge></td>
            <td className="p-2">
              <Select value={e.user_id || '__none__'} onValueChange={v => vincularUsuario(e.id, v === '__none__' ? '' : v)}>
                <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Sin vincular" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin vincular</SelectItem>
                  {perfiles.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre || p.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </td>
            <td className="p-2">
              <Button size="sm" variant={e.activo ? 'outline' : 'default'} onClick={() => setPendingBaja(e)}>
                {e.activo ? 'Dar de baja' : 'Reactivar'}
              </Button>
            </td>
            </tr>
          ))}</tbody>
        </table>
      </CardContent></Card>

      <AlertDialog open={!!pendingBaja} onOpenChange={o => !o && setPendingBaja(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500"/>
              {pendingBaja?.activo ? 'Dar de baja empleado' : 'Reactivar empleado'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingBaja?.activo
                ? <>Vas a dar de baja a <strong>{pendingBaja?.nombre}</strong>. Dejará de aparecer en cálculos de nómina, asistencia e incidencias nuevas. Su historial (recibos, comisiones) no se borra. Se registra hoy como fecha de baja.</>
                : <>Vas a reactivar a <strong>{pendingBaja?.nombre}</strong>. Volverá a aparecer como empleado activo en nómina.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toggleBaja(pendingBaja)}>Sí, confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// PRIMAS RT — nuevo + modal confirmación al guardar cambio
// ============================================================
function PrimasRTTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [neu, setNeu] = useState<any>({ registro_patronal: '', clase_rt: 1, prima_rt: 0.005, vigencia_desde: new Date().toISOString().slice(0,10), notas: '', activo: true });
  const [pending, setPending] = useState<any | null>(null);
  const load = async () => {
    const { data } = await supabase.from('primas_riesgo_patronal').select('*').order('registro_patronal');
    setRows((data as any) || []);
  };
  useEffect(() => { load(); }, []);
  const guardarConfirmado = async () => {
    if (!pending) return;
    const r = pending;
    const { error } = await supabase.from('primas_riesgo_patronal').update({
      clase_rt: r.clase_rt, prima_rt: r.prima_rt, vigencia_desde: r.vigencia_desde, notas: r.notas, activo: r.activo,
    }).eq('id', r.id);
    setPending(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Prima guardada — afecta cuota patronal de todos los empleados de esa sucursal');
    load();
  };
  const crearNuevo = async () => {
    if (!neu.registro_patronal.trim()) { toast.error('Registro patronal requerido'); return; }
    const { error } = await supabase.from('primas_riesgo_patronal').insert(neu);
    if (error) { toast.error(error.message); return; }
    toast.success('Registro patronal creado');
    setShowNew(false);
    setNeu({ registro_patronal: '', clase_rt: 1, prima_rt: 0.005, vigencia_desde: new Date().toISOString().slice(0,10), notas: '', activo: true });
    load();
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-2" />Nuevo registro patronal</Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Primas de Riesgo de Trabajo por Registro Patronal</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">La prima RT se aplica al SBC en el cálculo de la cuota patronal IMSS. Cambiar un valor afecta a todos los empleados asignados a ese registro patronal — se pide confirmación al guardar.</p>
          <table className="w-full text-sm">
            <thead className="bg-muted"><tr><th className="p-2 text-left">Registro Patronal</th><th className="p-2 text-center">Clase RT</th><th className="p-2 text-right">Prima RT (%)</th><th className="p-2 text-left">Vigencia desde</th><th className="p-2 text-left">Notas</th><th></th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={r.id} className="border-b">
                <td className="p-2 font-mono">{r.registro_patronal}</td>
                <td className="p-2 text-center"><Input type="number" className="h-8 w-16 mx-auto" value={r.clase_rt || ''} onChange={e => { const n=[...rows]; n[i].clase_rt=Number(e.target.value); setRows(n); }} /></td>
                <td className="p-2 text-right"><Input type="number" step="0.000001" className="h-8 w-28 ml-auto" value={r.prima_rt} onChange={e => { const n=[...rows]; n[i].prima_rt=Number(e.target.value); setRows(n); }} /></td>
                <td className="p-2"><Input type="date" className="h-8" value={r.vigencia_desde} onChange={e => { const n=[...rows]; n[i].vigencia_desde=e.target.value; setRows(n); }} /></td>
                <td className="p-2"><Input className="h-8" value={r.notas || ''} onChange={e => { const n=[...rows]; n[i].notas=e.target.value; setRows(n); }} /></td>
                <td className="p-2"><Button size="sm" onClick={() => setPending(r)}>Guardar</Button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sin primas registradas</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo Registro Patronal</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Registro Patronal</Label><Input value={neu.registro_patronal} onChange={e=>setNeu({...neu, registro_patronal: e.target.value.toUpperCase()})} placeholder="A0000000000" /></div>
            <div><Label>Clase RT</Label><Input type="number" min="1" max="5" value={neu.clase_rt} onChange={e=>setNeu({...neu, clase_rt: Number(e.target.value)})} /></div>
            <div><Label>Prima RT (decimal)</Label><Input type="number" step="0.000001" value={neu.prima_rt} onChange={e=>setNeu({...neu, prima_rt: Number(e.target.value)})} /></div>
            <div className="col-span-2"><Label>Vigencia desde</Label><Input type="date" value={neu.vigencia_desde} onChange={e=>setNeu({...neu, vigencia_desde: e.target.value})} /></div>
            <div className="col-span-2"><Label>Notas</Label><Input value={neu.notas} onChange={e=>setNeu({...neu, notas: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setShowNew(false)}>Cancelar</Button>
            <Button onClick={crearNuevo}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pending} onOpenChange={o=>!o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500"/>Confirmar cambio de Prima RT</AlertDialogTitle>
            <AlertDialogDescription>
              Estás por modificar la prima RT del registro patronal <strong>{pending?.registro_patronal}</strong> a <strong>{pending ? (Number(pending.prima_rt)*100).toFixed(4) : 0}%</strong>. Esto recalcula la cuota patronal IMSS de todos los empleados asignados a ese registro en los próximos recibos. ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={guardarConfirmado}>Sí, guardar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// CONCEPTOS — nuevo + base bloqueados
// ============================================================
// ============================================================
// BONO DE PUNTUALIDAD — configuración "mixta" por categoría (13-ago)
//
// Ver comentario en NominaCalculator.ts: hay dos reglas confirmadas
// en distintos momentos que no cuadran entre sí (10%/5% plano vs
// variable por puesto). Esta tabla deja el % editable por categoría
// sin necesitar otro cambio de código — se sembró 10% parejo, que es
// el comportamiento que ya estaba activo, así que por sí sola esta
// pantalla no cambia ningún cálculo hasta que alguien la edite aquí.
// ============================================================
function BonoPuntualidadConfigCard() {
  const [rows, setRows] = useState<any[]>([]);
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);

  const load = () => (supabase as any).from('nomina_bono_puntualidad_config')
    .select('*').order('categoria').then(({ data }: any) => setRows(data || []));
  useEffect(() => { load(); }, []);

  const guardar = async (categoria: string) => {
    const val = editando[categoria];
    if (val === undefined) return;
    const pct = Number(val);
    if (isNaN(pct) || pct < 0 || pct > 100) { toast.error('% inválido (0-100)'); return; }
    setGuardando(categoria);
    const { error } = await (supabase as any).from('nomina_bono_puntualidad_config')
      .update({ pct_mensual: pct, updated_at: new Date().toISOString() }).eq('categoria', categoria);
    setGuardando(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Bono de puntualidad de "${categoria}" actualizado a ${pct}% mensual`);
    setEditando(prev => { const n = { ...prev }; delete n[categoria]; return n; });
    load();
  };

  return (
    <Card className="border-amber-400/50">
      <CardHeader>
        <CardTitle className="text-base">Bono de puntualidad — % mensual por categoría</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Pendiente de confirmar con el cliente si debe ser el mismo % para todos (como está ahora)
          o variar por categoría. Ajusta aquí en cuanto se decida — no requiere tocar código.
        </p>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="bg-muted"><tr>
            <th className="p-2 text-left">Categoría</th>
            <th className="p-2 text-right">% mensual</th>
            <th className="p-2 text-left">Notas</th>
            <th className="p-2"></th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.categoria} className="border-b">
                <td className="p-2 capitalize">{r.categoria}</td>
                <td className="p-2 text-right">
                  <Input
                    type="number" step="0.01" className="w-24 h-8 text-right inline-block"
                    value={editando[r.categoria] ?? String(r.pct_mensual)}
                    onChange={e => setEditando(prev => ({ ...prev, [r.categoria]: e.target.value }))}
                  />
                </td>
                <td className="p-2 text-xs text-muted-foreground">{r.notas || '—'}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="outline"
                    disabled={editando[r.categoria] === undefined || guardando === r.categoria}
                    onClick={() => guardar(r.categoria)}>
                    {guardando === r.categoria ? 'Guardando…' : 'Guardar'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ConceptosTab() {
  const [conc, setConc] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [neu, setNeu] = useState<any>({ clave: '', descripcion: '', tipo: 'percepcion', codigo_sat: '', grava_isr: true, grava_imss: true, activo: true, es_base: false });
  const load = () => supabase.from('conceptos_nomina').select('*').order('tipo').order('clave').then(({data})=>setConc((data as any)||[]));
  useEffect(() => { load(); }, []);
  const crear = async () => {
    if (!neu.clave.trim() || !neu.descripcion.trim()) { toast.error('Clave y descripción requeridas'); return; }
    const { error } = await supabase.from('conceptos_nomina').insert({ ...neu, es_base: false });
    if (error) { toast.error(error.message); return; }
    toast.success('Concepto creado');
    setShowNew(false);
    setNeu({ clave: '', descripcion: '', tipo: 'percepcion', codigo_sat: '', grava_isr: true, grava_imss: true, activo: true, es_base: false });
    load();
  };
  return (
    <div className="space-y-3">
      <BonoPuntualidadConfigCard />
      <div className="flex gap-2">
        <Button onClick={()=>setShowNew(true)}><Plus className="h-4 w-4 mr-2"/>Nuevo concepto</Button>
      </div>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted"><tr><th className="p-2 text-left">Clave</th><th className="p-2 text-left">Descripción</th><th className="p-2 text-left">Tipo</th><th className="p-2 text-left">SAT</th><th className="p-2">Grava ISR</th><th className="p-2">Grava IMSS</th><th className="p-2 text-center">Origen</th></tr></thead>
          <tbody>{conc.map(c => (
            <tr key={c.id} className="border-b">
              <td className="p-2 font-mono">{c.clave}</td>
              <td className="p-2">{c.descripcion}</td>
              <td className="p-2"><Badge variant={c.tipo==='percepcion'?'default':'secondary'}>{c.tipo}</Badge></td>
              <td className="p-2">{c.codigo_sat}</td>
              <td className="p-2 text-center">{c.grava_isr?'✓':'—'}</td>
              <td className="p-2 text-center">{c.grava_imss?'✓':'—'}</td>
              <td className="p-2 text-center">
                {c.es_base
                  ? <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3"/>Base SAT</Badge>
                  : <Badge>Personalizado</Badge>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </CardContent></Card>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo concepto de nómina</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Clave</Label><Input value={neu.clave} onChange={e=>setNeu({...neu, clave: e.target.value.toUpperCase()})} /></div>
            <div><Label>Código SAT</Label><Input value={neu.codigo_sat} onChange={e=>setNeu({...neu, codigo_sat: e.target.value})} /></div>
            <div className="col-span-2"><Label>Descripción</Label><Input value={neu.descripcion} onChange={e=>setNeu({...neu, descripcion: e.target.value})} /></div>
            <div><Label>Tipo</Label>
              <select className="w-full h-10 border rounded px-2" value={neu.tipo} onChange={e=>setNeu({...neu, tipo: e.target.value})}>
                <option value="percepcion">Percepción</option>
                <option value="deduccion">Deducción</option>
                <option value="otro_pago">Otro pago</option>
              </select>
            </div>
            <div className="flex flex-col gap-2 justify-end">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={neu.grava_isr} onChange={e=>setNeu({...neu, grava_isr: e.target.checked})}/>Grava ISR</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={neu.grava_imss} onChange={e=>setNeu({...neu, grava_imss: e.target.checked})}/>Grava IMSS</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setShowNew(false)}>Cancelar</Button>
            <Button onClick={crear}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// ASISTENCIA — edición manual de registro individual
// ============================================================
function AsistenciaTab() {
  const [filas, setFilas] = useState<any[]>([]);
  const [emps, setEmps] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const load = () => supabase.from('asistencia').select('*, empleados(nombre)').order('fecha',{ascending:false}).limit(200).then(({data})=>setFilas((data as any)||[]));
  useEffect(() => {
    load();
    supabase.from('empleados').select('id,nombre,numero_empleado').then(({data})=>setEmps((data as any)||[]));
  }, []);
  // Mapa de códigos del Excel oficial de incidencias -> valor que acepta
  // asistencia.incidencia (CHECK: falta|retardo|permiso|vacaciones|
  // incapacidad|dia_festivo|descanso_laborado|horas_extra|NULL).
  // 'A' y 'Descanso' se guardan como NULL (día pagado normal, sin
  // incidencia) — la diferencia entre "asistió" y "descanso programado"
  // no afecta el cálculo de nómina, ambos son días pagados.
  // 'PD' (prima dominical) se mapea a 'descanso_laborado' — es la
  // categoría más cercana que ya existe (día de descanso trabajado);
  // si el cliente la quiere separada hay que agregar un valor nuevo al
  // CHECK de la tabla. Igual con 'TF' -> 'dia_festivo'.
  const CODIGO_A_INCIDENCIA: Record<string, string | null> = {
    'A': null, 'ASISTENCIA': null,
    'D': null, 'DESCANSO': null,
    'F': 'falta', 'FALTA': 'falta',
    'R': 'retardo', 'RETARDO': 'retardo',
    'P': 'permiso', 'PERMISO': 'permiso',
    'V': 'vacaciones', 'VACACIONES': 'vacaciones',
    'IN': 'incapacidad', 'INCAPACIDAD': 'incapacidad',
    'TF': 'dia_festivo',
    'PD': 'descanso_laborado', // prima dominical -> asumido como descanso trabajado, ver comentario arriba
    'DD': 'descanso_laborado',
  };

  const importar = async (file: File) => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    // header:1 -> array de arrays (por posición), necesario porque este
    // archivo es una MATRIZ (una fila por empleado, una columna por día),
    // no una tabla de un registro por fila.
    const grid: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

    // 1) Encontrar la fila de encabezado buscando la celda "NC" (clave de
    //    empleado) y, en esa misma fila, todas las columnas cuyo valor sea
    //    una fecha real (los días de la quincena).
    let headerRowIdx = -1, colNC = -1, colNombre = -1;
    for (let i = 0; i < grid.length; i++) {
      const row = grid[i] || [];
      const idxNC = row.findIndex((c: any) => String(c ?? '').trim().toUpperCase() === 'NC');
      const idxNombre = row.findIndex((c: any) => String(c ?? '').trim().toUpperCase().startsWith('NOMBRE'));
      if (idxNC >= 0 && idxNombre >= 0) { headerRowIdx = i; colNC = idxNC; colNombre = idxNombre; break; }
    }
    if (headerRowIdx === -1) {
      toast.error('No se encontró el encabezado esperado (columnas "NC" y "NOMBRE DE COLABORADOR"). ¿Es el formato oficial de incidencias?');
      return;
    }
    const headerRow = grid[headerRowIdx];
    const diaCols: Array<{ col: number; fecha: string }> = [];
    headerRow.forEach((v: any, col: number) => {
      // xlsx con raw:true regresa fechas como objetos Date reales.
      if (v instanceof Date && !isNaN(v.getTime())) {
        diaCols.push({ col, fecha: v.toISOString().slice(0, 10) });
      }
    });
    if (diaCols.length === 0) {
      toast.error('No se encontraron columnas de fecha en el encabezado.');
      return;
    }

    // 2) Empleados activos, para casar por número de empleado (NC).
    const map = new Map(emps.map(e => [String(e.numero_empleado || '').trim(), e.id]));

    const filas: any[] = [];
    const codigosNoReconocidos = new Set<string>();
    let empleadosNoEncontrados = 0;

    for (let r = headerRowIdx + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      const nc = String(row[colNC] ?? '').trim();
      if (!nc) continue; // fila vacía = fin de la plantilla
      const empId = map.get(nc);
      if (!empId) { empleadosNoEncontrados++; continue; }

      for (const { col, fecha } of diaCols) {
        const raw = row[col];
        if (raw === undefined || raw === null || raw === '') continue;

        if (typeof raw === 'number') {
          // Celda numérica = horas extra ese día (el empleado sí asistió).
          filas.push({ empleado_id: empId, fecha, incidencia: null, horas_extra: raw, origen: 'import' });
          continue;
        }

        const codigo = String(raw).trim().toUpperCase();
        if (codigo === '.') continue; // columna/celda separadora sin dato
        if (!(codigo in CODIGO_A_INCIDENCIA)) {
          codigosNoReconocidos.add(codigo);
          continue; // no se adivina — mejor dejar el día sin tocar que meter un valor incorrecto
        }
        filas.push({ empleado_id: empId, fecha, incidencia: CODIGO_A_INCIDENCIA[codigo], horas_extra: 0, origen: 'import' });
      }
    }

    if (filas.length === 0) {
      toast.error('No se importó ningún registro — revisa que el archivo tenga el formato oficial.');
      return;
    }

    const { error } = await supabase.from('asistencia').upsert(filas as any, { onConflict: 'empleado_id,fecha' });
    if (error) { toast.error(error.message); return; }

    let msg = `${filas.length} registros importados`;
    if (empleadosNoEncontrados > 0) msg += ` — ${empleadosNoEncontrados} fila(s) con NC sin coincidencia de empleado`;
    if (codigosNoReconocidos.size > 0) msg += ` — códigos no reconocidos (se ignoraron): ${[...codigosNoReconocidos].join(', ')}`;
    if (empleadosNoEncontrados > 0 || codigosNoReconocidos.size > 0) toast.warning(msg); else toast.success(msg);
    load();
  };
  // Plantilla oficial "Lista de Raya": misma matriz que espera el importador
  // (fila de encabezado con NC / NOMBRE DE COLABORADOR y una columna por día),
  // prellenada con los empleados activos y la quincena en curso.
  const descargarPlantilla = async () => {
    const XLSX = await import('xlsx');
    const hoy = new Date();
    const primerDia = hoy.getDate() <= 15 ? 1 : 16;
    const ultimoDia = hoy.getDate() <= 15 ? 15 : new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
    const dias: Date[] = [];
    for (let d = primerDia; d <= ultimoDia; d++) dias.push(new Date(hoy.getFullYear(), hoy.getMonth(), d));

    const header = ['NC', 'NOMBRE DE COLABORADOR', ...dias];
    const cuerpo = [...emps]
      .sort((a, b) => String(a.numero_empleado || '').localeCompare(String(b.numero_empleado || '')))
      .map(e => [e.numero_empleado || '', e.nombre, ...dias.map(() => '')]);

    const ws = XLSX.utils.aoa_to_sheet([header, ...cuerpo]);
    ws['!cols'] = [{ wch: 8 }, { wch: 38 }, ...dias.map(() => ({ wch: 6 }))];

    const codigos = [
      ['CÓDIGO', 'SIGNIFICADO', 'CÓMO SE REGISTRA EN EL SISTEMA'],
      ['A', 'Asistencia', 'Día pagado normal (sin incidencia)'],
      ['D', 'Descanso programado', 'Día pagado normal (sin incidencia)'],
      ['F', 'Falta', 'falta'],
      ['R', 'Retardo', 'retardo'],
      ['P', 'Permiso', 'permiso'],
      ['V', 'Vacaciones', 'vacaciones'],
      ['IN', 'Incapacidad', 'incapacidad'],
      ['TF', 'Día festivo trabajado', 'dia_festivo'],
      ['PD', 'Prima dominical', 'descanso_laborado'],
      ['DD', 'Descanso trabajado', 'descanso_laborado'],
      ['(número)', 'Horas extra de ese día', 'horas_extra'],
      ['.', 'Celda separadora', 'Se ignora'],
    ];
    const wsCodigos = XLSX.utils.aoa_to_sheet(codigos);
    wsCodigos['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 38 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lista de Raya');
    XLSX.utils.book_append_sheet(wb, wsCodigos, 'Códigos');
    XLSX.writeFile(wb, `Lista_de_Raya_${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}_Q${primerDia === 1 ? 1 : 2}.xlsx`, { cellDates: true });
    toast.success('Plantilla descargada — no cambies los encabezados NC ni las fechas.');
  };

  const guardarEdicion = async () => {
    if (!editing) return;
    const { error } = await supabase.from('asistencia').update({
      entrada: editing.entrada || null,
      salida: editing.salida || null,
      incidencia: editing.incidencia || null,
      horas_extra: Number(editing.horas_extra || 0),
      notas: editing.notas || null,
    }).eq('id', editing.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Ajuste guardado'); setEditing(null); load();
  };
  const sync = async () => {
    try { await BiometricoConnector.sincronizar('', ''); } catch (e: any) { toast.error(e.message); }
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input id="asis-file" type="file" accept=".xlsx,.csv" className="hidden" onChange={e => e.target.files?.[0] && importar(e.target.files[0])} />
        <Button variant="outline" onClick={() => document.getElementById('asis-file')?.click()}><Upload className="h-4 w-4 mr-2" />Importar asistencia</Button>
        <Button variant="outline" onClick={descargarPlantilla}><Download className="h-4 w-4 mr-2" />Descargar plantilla</Button>
        <Button variant="outline" onClick={sync}>Sincronizar biométrico (stub)</Button>
      </div>
      <Card><CardContent className="p-4 text-xs space-y-1">
        <p className="font-semibold text-sm">Formato "Lista de Raya" — códigos válidos</p>
        <p className="text-muted-foreground">
          Una fila por colaborador (NC = número de empleado) y una columna por día. Cualquier código
          distinto a estos se ignora en la importación y se te reporta al final.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {[['A','Asistencia'],['D','Descanso'],['F','Falta'],['R','Retardo'],['P','Permiso'],['V','Vacaciones'],['IN','Incapacidad'],['TF','Festivo trabajado'],['PD','Prima dominical'],['DD','Descanso trabajado'],['1, 2, 3…','Horas extra']].map(([c, d]) => (
            <Badge key={c} variant="outline" className="font-normal">{c} = {d}</Badge>
          ))}
        </div>
      </CardContent></Card>
      <Card><CardContent className="p-0"><table className="w-full text-sm">
        <thead className="bg-muted"><tr><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Empleado</th><th className="p-2">Entrada</th><th className="p-2">Salida</th><th className="p-2">Incidencia</th><th className="p-2 text-right">Hrs extra</th><th className="p-2">Notas</th><th></th></tr></thead>
        <tbody>{filas.map(a => (
          <tr key={a.id} className="border-b">
            <td className="p-2">{a.fecha}</td>
            <td className="p-2">{a.empleados?.nombre}</td>
            <td className="p-2 text-center">{a.entrada || '—'}</td>
            <td className="p-2 text-center">{a.salida || '—'}</td>
            <td className="p-2 text-center">{a.incidencia && <Badge variant="outline">{a.incidencia}</Badge>}</td>
            <td className="p-2 text-right">{a.horas_extra}</td>
            <td className="p-2 text-xs text-muted-foreground max-w-[200px] truncate">{a.notas || '—'}</td>
            <td className="p-2"><Button size="sm" variant="outline" onClick={()=>setEditing({...a})}><Pencil className="h-3 w-3 mr-1"/>Ajustar</Button></td>
          </tr>
        ))}</tbody>
      </table></CardContent></Card>

      <Dialog open={!!editing} onOpenChange={o=>!o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajuste manual de asistencia</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 text-sm text-muted-foreground">
                {editing.empleados?.nombre} — {editing.fecha}
              </div>
              <div><Label>Entrada</Label><Input type="time" value={editing.entrada || ''} onChange={e=>setEditing({...editing, entrada: e.target.value})} /></div>
              <div><Label>Salida</Label><Input type="time" value={editing.salida || ''} onChange={e=>setEditing({...editing, salida: e.target.value})} /></div>
              <div><Label>Incidencia</Label>
                <select className="w-full h-10 border rounded px-2" value={editing.incidencia || ''} onChange={e=>setEditing({...editing, incidencia: e.target.value || null})}>
                  <option value="">— sin incidencia —</option>
                  <option value="falta">Falta</option>
                  <option value="retardo">Retardo</option>
                  <option value="permiso_ce">Permiso con goce</option>
                  <option value="permiso_sg">Permiso sin goce</option>
                  <option value="incapacidad">Incapacidad</option>
                  <option value="vacaciones">Vacaciones</option>
                  <option value="dia_festivo">Día festivo</option>
                  <option value="descanso_laborado">Descanso laborado</option>
                  <option value="bono">Bono</option>
                  <option value="penalizacion">Penalización</option>
                </select>
              </div>
              <div><Label>Horas extra</Label><Input type="number" step="0.25" value={editing.horas_extra || 0} onChange={e=>setEditing({...editing, horas_extra: Number(e.target.value)})} /></div>
              <div className="col-span-2"><Label>Notas (bono / penalización / motivo)</Label><Input value={editing.notas || ''} onChange={e=>setEditing({...editing, notas: e.target.value})} placeholder="Ej: Bono puntualidad extra por reemplazo, o penalización por retardo mayor a 30 min" /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={()=>setEditing(null)}>Cancelar</Button>
            <Button onClick={guardarEdicion}>Guardar ajuste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// RECIBOS — con descarga PDF/XML y confirmación de modo prueba
// ============================================================
function RecibosTab() {
  const [recs, setRecs] = useState<any[]>([]);
  const [emps, setEmps] = useState<any[]>([]);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [conceptos, setConceptos] = useState<any[]>([]);
  const [empId, setEmpId] = useState('');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');

  // ── Filtros de la lista (independientes del generador de arriba) ──
  const [fSucursal, setFSucursal] = useState('all');
  const [fEmpleado, setFEmpleado] = useState('all');
  const [fPeriodoDesde, setFPeriodoDesde] = useState('');
  const [fPeriodoHasta, setFPeriodoHasta] = useState('');
  const [fEstatus, setFEstatus] = useState('all');
  const [fConcepto, setFConcepto] = useState('all');

  const [preview, setPreview] = useState<any>(null);
  const [pendingTimbrar, setPendingTimbrar] = useState<string | null>(null);

  const load = async () => {
    let q = supabase.from('recibos_nomina')
      .select('*, empleados(nombre, sucursal_id), cfdi_emitidos(xml_storage_path, pdf_storage_path, uuid_sat)')
      .order('periodo_fin', { ascending: false }).limit(200);

    if (fEmpleado !== 'all') q = q.eq('empleado_id', fEmpleado);
    if (fPeriodoDesde) q = q.gte('periodo_inicio', fPeriodoDesde);
    if (fPeriodoHasta) q = q.lte('periodo_fin', fPeriodoHasta);
    if (fEstatus !== 'all') q = q.eq('estatus', fEstatus);

    let { data } = await q;
    let rows = (data as any[]) || [];

    if (fSucursal !== 'all') rows = rows.filter(r => r.empleados?.sucursal_id === fSucursal);

    if (fConcepto !== 'all') {
      const { data: rc } = await supabase.from('recibo_conceptos').select('recibo_id').eq('clave', fConcepto);
      const idsConConcepto = new Set((rc || []).map((r: any) => r.recibo_id));
      rows = rows.filter(r => idsConConcepto.has(r.id));
    }

    setRecs(rows);
  };
  useEffect(() => {
    load();
    supabase.from('empleados').select('id,nombre,sucursal_id').eq('activo',true).order('nombre').then(({data})=>setEmps((data as any)||[]));
    supabase.from('sucursales').select('id,nombre').eq('activo', true).order('nombre').then(({data})=>setSucursales((data as any)||[]));
    supabase.from('conceptos_nomina').select('clave,descripcion,tipo').order('tipo').then(({data})=>setConceptos((data as any)||[]));
  }, []);
  useEffect(() => { load(); }, [fSucursal, fEmpleado, fPeriodoDesde, fPeriodoHasta, fEstatus, fConcepto]);
  const calcular = async () => {
    if (!empId || !inicio || !fin) { toast.error('Datos incompletos'); return; }
    try { setPreview(await NominaCalculator.calcularRecibo(empId, inicio, fin)); }
    catch (e: any) { toast.error(e.message); }
  };
  const guardar = async () => {
    if (!empId || !inicio || !fin) return;
    await NominaCalculator.guardarRecibo(empId, inicio, fin, false);
    toast.success('Recibo guardado'); setPreview(null); load();
  };
  const ejecutarTimbrado = async () => {
    if (!pendingTimbrar) return;
    const recId = pendingTimbrar;
    setPendingTimbrar(null);
    const { data, error } = await supabase.functions.invoke('facturapi-timbrar-nomina', { body: { recibo_id: recId, es_prueba: true } });
    if (error) { toast.error(error.message); return; }
    const d = data as any;
    if (d?.prueba) toast.warning(d?.nota || 'Timbrado en modo PRUEBA — no se envió al SAT');
    else if (d?.uuid) toast.success(`Timbrado real — UUID ${d.uuid.slice(0,8)}…`);
    else toast.success('Timbrado procesado');
    load();
  };
  const descargar = async (path: string | null, formato: 'pdf'|'xml', recId: string) => {
    // Si tenemos storage_path descargamos vía signed URL desde bucket cfdi.
    // Si no lo hay, intentamos el proxy de facturapi (funciona si hay cfdi_id ligado).
    if (path) {
      const { data, error } = await supabase.storage.from('cfdi').createSignedUrl(path, 60);
      if (error || !data?.signedUrl) { toast.error('No se pudo generar URL de descarga'); return; }
      window.open(data.signedUrl, '_blank');
      return;
    }
    // Fallback: pasar por edge function facturapi-descargar usando facturapi_id
    const rec = recs.find(r => r.id === recId);
    const cfdi = rec?.cfdi_emitidos;
    if (!cfdi) { toast.error('Este recibo no tiene CFDI generado (solo se marcó como prueba sin archivos).'); return; }
    toast.error(`${formato.toUpperCase()} no disponible en storage — el timbrado fue solo prueba local`);
  };
  return (
    <div className="space-y-3">
      <Card><CardHeader><CardTitle>Generar recibo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <div><Label>Empleado</Label>
              <select className="w-full h-10 border rounded px-2" value={empId} onChange={e=>setEmpId(e.target.value)}>
                <option value="">—</option>
                {emps.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div><Label>Inicio</Label><Input type="date" value={inicio} onChange={e=>setInicio(e.target.value)} /></div>
            <div><Label>Fin</Label><Input type="date" value={fin} onChange={e=>setFin(e.target.value)} /></div>
            <div className="flex items-end gap-2">
              <Button onClick={calcular}><Calculator className="h-4 w-4 mr-2" />Calcular</Button>
              {preview && <Button onClick={guardar}><FileCheck className="h-4 w-4 mr-2" />Guardar</Button>}
            </div>
          </div>
          {preview && (
            <div className="border rounded p-3 bg-muted/30">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>Percepciones: <strong>${preview.total_percepciones.toFixed(2)}</strong></div>
                <div>Deducciones: <strong>${preview.total_deducciones.toFixed(2)}</strong></div>
                <div>Neto: <strong className="text-green-600">${preview.neto.toFixed(2)}</strong></div>
              </div>
              <table className="w-full text-sm">
                <thead><tr><th className="text-left">Clave</th><th className="text-left">Descripción</th><th className="text-right">Importe</th></tr></thead>
                <tbody>{preview.conceptos.map((c:any,i:number)=>(
                  <tr key={i}><td className="font-mono">{c.clave}</td><td>{c.descripcion}</td><td className={`text-right ${c.tipo==='deduccion'?'text-red-600':''}`}>{c.tipo==='deduccion'?'-':''}${c.importe_total.toFixed(2)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div><Label>Sucursal</Label>
            <select className="w-full h-9 border rounded px-2 text-sm" value={fSucursal} onChange={e=>setFSucursal(e.target.value)}>
              <option value="all">Todas</option>
              {sucursales.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div><Label>Empleado</Label>
            <select className="w-full h-9 border rounded px-2 text-sm" value={fEmpleado} onChange={e=>setFEmpleado(e.target.value)}>
              <option value="all">Todos</option>
              {emps.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div><Label>Periodo desde</Label><Input type="date" value={fPeriodoDesde} onChange={e=>setFPeriodoDesde(e.target.value)} /></div>
          <div><Label>Periodo hasta</Label><Input type="date" value={fPeriodoHasta} onChange={e=>setFPeriodoHasta(e.target.value)} /></div>
          <div><Label>Estatus</Label>
            <select className="w-full h-9 border rounded px-2 text-sm" value={fEstatus} onChange={e=>setFEstatus(e.target.value)}>
              <option value="all">Todos</option>
              <option value="pendiente">Pendiente</option>
              <option value="calculado">Calculado</option>
              <option value="timbrado">Timbrado</option>
            </select>
          </div>
          <div><Label>Concepto (percep./deduc.)</Label>
            <select className="w-full h-9 border rounded px-2 text-sm" value={fConcepto} onChange={e=>setFConcepto(e.target.value)}>
              <option value="all">Todos</option>
              {conceptos.map(c=><option key={c.clave} value={c.clave}>{c.tipo==='deduccion'?'↓':'↑'} {c.descripcion}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card><CardContent className="p-0"><table className="w-full text-sm">
        <thead className="bg-muted"><tr><th className="p-2 text-left">Periodo</th><th className="p-2 text-left">Empleado</th><th className="p-2 text-right">Percep.</th><th className="p-2 text-right">Deduc.</th><th className="p-2 text-right">Neto</th><th className="p-2 text-left">Estatus</th><th className="p-2">Acciones</th></tr></thead>
        <tbody>{recs.length === 0 ? (
          <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Sin recibos con estos filtros.</td></tr>
        ) : recs.map(r => {
          const xmlPath = r.xml_storage_path || r.cfdi_emitidos?.xml_storage_path;
          const pdfPath = r.pdf_storage_path || r.cfdi_emitidos?.pdf_storage_path;
          return (
            <tr key={r.id} className="border-b">
              <td className="p-2">{r.periodo_inicio} → {r.periodo_fin}</td>
              <td className="p-2">{r.empleados?.nombre}</td>
              <td className="p-2 text-right">${Number(r.total_percepciones).toFixed(2)}</td>
              <td className="p-2 text-right">${Number(r.total_deducciones).toFixed(2)}</td>
              <td className="p-2 text-right font-semibold">${Number(r.neto_pagado).toFixed(2)}</td>
              <td className="p-2"><Badge variant={r.estatus==='timbrado' && !r.es_prueba?'default':'secondary'}>{r.estatus}{r.es_prueba?' (prueba)':''}</Badge></td>
              <td className="p-2">
                <div className="flex gap-1 flex-wrap">
                  {r.estatus!=='timbrado' && (
                    <Button size="sm" variant="outline" onClick={() => setPendingTimbrar(r.id)}><Receipt className="h-3 w-3 mr-1" />Timbrar</Button>
                  )}
                  <Button size="sm" variant="ghost" disabled={!pdfPath} onClick={()=>descargar(pdfPath, 'pdf', r.id)} title={pdfPath?'Descargar PDF':'PDF no disponible (recibo de prueba sin CFDI)'}>
                    <FileText className="h-3 w-3 mr-1"/>PDF
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!xmlPath} onClick={()=>descargar(xmlPath, 'xml', r.id)} title={xmlPath?'Descargar XML':'XML no disponible (recibo de prueba sin CFDI)'}>
                    <Download className="h-3 w-3 mr-1"/>XML
                  </Button>
                </div>
              </td>
            </tr>
          );
        })}</tbody>
      </table></CardContent></Card>

      <AlertDialog open={!!pendingTimbrar} onOpenChange={o=>!o && setPendingTimbrar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500"/>Timbrar recibo</AlertDialogTitle>
            <AlertDialogDescription>
              El ambiente actual está en <strong>modo PRUEBA</strong> (llave <code>sk_test_</code> de Facturapi). El recibo NO se enviará al SAT, no se consumirán folios y no habrá UUID válido. Si el sandbox tiene CSD configurado, se generarán XML y PDF de prueba descargables. ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={ejecutarTimbrado}>Sí, timbrar en modo prueba</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// METAS DE COMISIONES — por vendedor o por sucursal, trimestral
// (pedido de Alejandro, sesión 27-jul-2026: "cada trimestre queremos
// hacer modificación de las metas, según desempeño, según cómo van
// moviéndose los gastos... por vendedor y por sucursal")
// ============================================================
function metaTrimestreActual() {
  const now = new Date();
  return { anio: now.getFullYear(), trimestre: Math.floor(now.getMonth() / 3) + 1 };
}
function MetasComisionesTab() {
  const { anio: anioIni, trimestre: trimIni } = metaTrimestreActual();
  const [anio, setAnio] = useState(anioIni);
  const [trimestre, setTrimestre] = useState(trimIni);
  const [metas, setMetas] = useState<any[]>([]);
  const [emps, setEmps] = useState<any[]>([]);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [neu, setNeu] = useState<any>({ alcance: 'vendedor', empleado_id: '', sucursal_id: '', meta_venta: '', porcentaje_comision: '', notas: '' });
  const [saving, setSaving] = useState(false);

  const load = () => (supabase as any).from('metas_comisiones')
    .select('*, empleados(nombre), sucursales(nombre)')
    .eq('anio', anio).eq('trimestre', trimestre)
    .order('created_at', { ascending: false })
    .then(({ data }: any) => setMetas(data || []));
  useEffect(() => { load(); }, [anio, trimestre]);
  useEffect(() => {
    supabase.from('empleados').select('id,nombre').eq('activo', true).order('nombre').then(({ data }) => setEmps((data as any) || []));
    supabase.from('sucursales').select('id,nombre').eq('activo', true).order('nombre').then(({ data }) => setSucursales((data as any) || []));
  }, []);

  const abrirNueva = () => {
    setNeu({ alcance: 'vendedor', empleado_id: '', sucursal_id: '', meta_venta: '', porcentaje_comision: '', notas: '' });
    setShowNew(true);
  };
  const guardar = async () => {
    if (neu.alcance === 'vendedor' && !neu.empleado_id) { toast.error('Selecciona el vendedor'); return; }
    if (neu.alcance === 'sucursal' && !neu.sucursal_id) { toast.error('Selecciona la sucursal'); return; }
    if (!neu.meta_venta) { toast.error('Captura la meta de venta'); return; }
    setSaving(true);
    const payload: any = {
      anio, trimestre,
      empleado_id: neu.alcance === 'vendedor' ? neu.empleado_id : null,
      sucursal_id: neu.alcance === 'sucursal' ? neu.sucursal_id : null,
      meta_venta: Number(neu.meta_venta),
      porcentaje_comision: Number(neu.porcentaje_comision || 0),
      notas: neu.notas || null,
    };
    const { error } = await (supabase as any).from('metas_comisiones').upsert(payload, {
      onConflict: neu.alcance === 'vendedor' ? 'empleado_id,anio,trimestre' : 'sucursal_id,anio,trimestre',
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Meta guardada');
    setShowNew(false); load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <div>
          <CardTitle>Metas de comisiones — Q{trimestre} {anio}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Editable cada trimestre por vendedor o por sucursal, según desempeño.</p>
        </div>
        <div className="flex gap-2 items-end">
          <div><Label className="text-xs">Trimestre</Label>
            <select className="h-9 border rounded px-2 text-sm" value={trimestre} onChange={e => setTrimestre(Number(e.target.value))}>
              <option value={1}>Q1 (ene-mar)</option><option value={2}>Q2 (abr-jun)</option>
              <option value={3}>Q3 (jul-sep)</option><option value={4}>Q4 (oct-dic)</option>
            </select>
          </div>
          <div><Label className="text-xs">Año</Label><Input type="number" className="h-9 w-24" value={anio} onChange={e => setAnio(Number(e.target.value))} /></div>
          <Button onClick={abrirNueva}><Plus className="h-4 w-4 mr-2" />Nueva meta</Button>
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="bg-muted"><tr><th className="p-2 text-left">Alcance</th><th className="p-2 text-right">Meta de venta</th><th className="p-2 text-right">% comisión al cumplir</th><th className="p-2 text-left">Notas</th></tr></thead>
          <tbody>{metas.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Sin metas capturadas para Q{trimestre} {anio}</td></tr>}
          {metas.map((m: any) => (
            <tr key={m.id} className="border-b">
              <td className="p-2">
                {m.empleado_id
                  ? <span className="flex items-center gap-2"><Badge variant="outline">Vendedor</Badge>{m.empleados?.nombre}</span>
                  : <span className="flex items-center gap-2"><Badge variant="secondary">Sucursal</Badge>{m.sucursales?.nombre}</span>}
              </td>
              <td className="p-2 text-right">${Number(m.meta_venta).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
              <td className="p-2 text-right">{m.porcentaje_comision}%</td>
              <td className="p-2 text-xs text-muted-foreground">{m.notas || '—'}</td>
            </tr>
          ))}
          </tbody>
        </table>
      </CardContent>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva meta — Q{trimestre} {anio}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Alcance</Label>
              <select className="w-full h-10 border rounded px-2" value={neu.alcance} onChange={e => setNeu({ ...neu, alcance: e.target.value, empleado_id: '', sucursal_id: '' })}>
                <option value="vendedor">Por vendedor</option>
                <option value="sucursal">Por sucursal</option>
              </select>
            </div>
            {neu.alcance === 'vendedor' ? (
              <div className="col-span-2"><Label>Vendedor</Label>
                <select className="w-full h-10 border rounded px-2" value={neu.empleado_id} onChange={e => setNeu({ ...neu, empleado_id: e.target.value })}>
                  <option value="">—</option>
                  {emps.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
            ) : (
              <div className="col-span-2"><Label>Sucursal</Label>
                <select className="w-full h-10 border rounded px-2" value={neu.sucursal_id} onChange={e => setNeu({ ...neu, sucursal_id: e.target.value })}>
                  <option value="">—</option>
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
            )}
            <div><Label>Meta de venta ($)</Label><Input type="number" step="0.01" value={neu.meta_venta} onChange={e => setNeu({ ...neu, meta_venta: e.target.value })} /></div>
            <div><Label>% comisión al cumplir</Label><Input type="number" step="0.01" value={neu.porcentaje_comision} onChange={e => setNeu({ ...neu, porcentaje_comision: e.target.value })} /></div>
            <div className="col-span-2"><Label>Notas</Label><Input value={neu.notas} onChange={e => setNeu({ ...neu, notas: e.target.value })} placeholder="Ej. Ajustada por gastos del trimestre" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar meta'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============================================================
// COMISIONES — Agregar manual
// ============================================================
// ============================================================
// COMISIONES — Motor automático (Plan Equipo) — v1
//
// Calcula Utilidad Neta de la sucursal en el trimestre y la reparte
// según los escalones y % por rol configurados. Ver ComisionesCalculator.ts
// para el detalle de qué queda fuera de esta primera versión (Plan
// Individual, Bono Gerentes, bonos trimestrales fijos).
// ============================================================
function MotorComisionesTab() {
  const { anio: anioIni, trimestre: trimIni } = metaTrimestreActual();
  const [anio, setAnio] = useState(anioIni);
  const [trimestre, setTrimestre] = useState(trimIni);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [sucursalId, setSucursalId] = useState('');
  const [gastos, setGastos] = useState('0');
  const [preview, setPreview] = useState<PreviewComision | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [confirmAplicar, setConfirmAplicar] = useState(false);

  useEffect(() => {
    supabase.from('sucursales').select('id,nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setSucursales((data as any) || []));
  }, []);

  const calcular = async () => {
    if (!sucursalId) { toast.error('Selecciona la sucursal'); return; }
    setCalculando(true);
    try {
      const p = await ComisionesCalculator.calcularPreview(sucursalId, anio, trimestre, Number(gastos || 0));
      setPreview(p);
    } catch (e: any) {
      toast.error(e.message || 'No se pudo calcular');
    } finally {
      setCalculando(false);
    }
  };

  const aplicar = async () => {
    if (!preview) return;
    setAplicando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await ComisionesCalculator.aplicarCalculo(preview, user?.id || null);
      toast.success('Comisiones aplicadas — ya aparecen en "Comisiones pagadas" abajo');
      setPreview(null);
      setConfirmAplicar(false);
    } catch (e: any) {
      toast.error(e.message || 'No se pudo aplicar');
    } finally {
      setAplicando(false);
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Calculator className="h-4 w-4" /> Motor de comisiones (automático) — v1</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Utilidad Neta de la sucursal en el trimestre → escalón → % de comisión → reparto por rol.
          Los gastos del periodo todavía se capturan a mano (no hay módulo de gastos operativos).
          Los escalones y el % de reparto por rol son <strong>valores de ejemplo</strong> — ajústalos en
          la base de datos con el cliente antes de usar esto en producción. Quedan fuera de esta
          primera versión: Plan Individual, Bono Gerentes, y bonos trimestrales fijos (A-P-P / metas
          consecutivas) del Excel original.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <div><Label className="text-xs">Sucursal</Label>
            <select className="w-full h-10 border rounded px-2" value={sucursalId} onChange={e => { setSucursalId(e.target.value); setPreview(null); }}>
              <option value="">—</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">Trimestre</Label>
            <select className="w-full h-10 border rounded px-2" value={trimestre} onChange={e => { setTrimestre(Number(e.target.value)); setPreview(null); }}>
              <option value={1}>Q1 (ene-mar)</option><option value={2}>Q2 (abr-jun)</option>
              <option value={3}>Q3 (jul-sep)</option><option value={4}>Q4 (oct-dic)</option>
            </select>
          </div>
          <div><Label className="text-xs">Año</Label>
            <Input type="number" value={anio} onChange={e => { setAnio(Number(e.target.value)); setPreview(null); }} />
          </div>
          <div><Label className="text-xs">Gastos del periodo ($)</Label>
            <Input type="number" step="0.01" value={gastos} onChange={e => { setGastos(e.target.value); setPreview(null); }} placeholder="Renta, financiamiento, admin…" />
          </div>
        </div>
        <Button onClick={calcular} disabled={calculando || !sucursalId}>
          {calculando ? 'Calculando…' : 'Calcular utilidad y comisión'}
        </Button>

        {preview && (
          <div className="space-y-3 border-t pt-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Ventas del trimestre</p>
                <p className="text-lg font-bold">${preview.ventas_totales.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Utilidad bruta</p>
                <p className="text-lg font-bold">${preview.utilidad_bruta.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="rounded-lg border p-3 bg-accent/40">
                <p className="text-xs text-muted-foreground">Utilidad neta (- gastos)</p>
                <p className="text-lg font-bold">${preview.utilidad_neta.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>

            {!preview.escalon && (
              <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-800">
                ⚠️ La utilidad neta no cayó en ningún escalón configurado para Q{trimestre} {anio}
                {preview.sucursal_id ? '' : ''} — revisa los escalones o si la utilidad es negativa. Comisión = $0.
              </div>
            )}
            {preview.escalon && (
              <p className="text-sm">
                Escalón aplicado: <Badge variant="secondary">#{preview.escalon.orden}</Badge>{' '}
                (${preview.escalon.limite_inferior.toLocaleString('es-MX')} – {preview.escalon.limite_superior === null ? 'sin tope' : `$${preview.escalon.limite_superior.toLocaleString('es-MX')}`})
                {' '}→ <strong>{preview.pct_comision_aplicado}%</strong> = <strong>${preview.comision_total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong> de comisión total
              </p>
            )}

            <table className="w-full text-sm">
              <thead className="bg-muted"><tr>
                <th className="p-2 text-left">Categoría</th><th className="p-2 text-right">% reparto</th>
                <th className="p-2 text-right">Monto categoría</th><th className="p-2 text-left">Empleados (monto c/u)</th>
              </tr></thead>
              <tbody>
                {preview.reparto.map(r => (
                  <tr key={r.categoria} className="border-b">
                    <td className="p-2 capitalize">{r.categoria}</td>
                    <td className="p-2 text-right">{r.pct_reparto}%</td>
                    <td className="p-2 text-right">${r.monto_categoria.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td className="p-2 text-xs">
                      {r.empleados.length === 0
                        ? <span className="text-muted-foreground">Sin empleados activos en esta categoría en esta sucursal</span>
                        : r.empleados.map(e => `${e.nombre} ($${e.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })})`).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {preview.empleados_sin_categoria.length > 0 && (
              <p className="text-xs text-muted-foreground">
                No entran al reparto (puesto administrativo/no clasificado): {preview.empleados_sin_categoria.map(e => `${e.nombre} (${e.puesto || 'sin puesto'})`).join(', ')}
              </p>
            )}

            <Button onClick={() => setConfirmAplicar(true)} disabled={preview.comision_total <= 0}>
              Aplicar — generar comisiones por empleado
            </Button>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmAplicar} onOpenChange={setConfirmAplicar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Aplicar este cálculo de comisiones?</AlertDialogTitle>
            <AlertDialogDescription>
              Se creará una comisión por cada empleado con monto mayor a $0 en la tabla de abajo
              ("Comisiones pagadas"), lista para incluirse en su siguiente recibo de nómina. Esta
              acción no se puede deshacer automáticamente — si algo está mal, se tendría que borrar
              manualmente cada comisión generada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={aplicar} disabled={aplicando}>{aplicando ? 'Aplicando…' : 'Sí, aplicar'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ComisionesTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [emps, setEmps] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [neu, setNeu] = useState<any>({ empleado_id: '', periodo_inicio: '', periodo_fin: '', base_calculo: 0, porcentaje: 0, monto: 0, grava: false, notas: '' });
  const load = () => supabase.from('comisiones').select('*, empleados(nombre)').order('periodo_fin',{ascending:false}).then(({data})=>setRows((data as any)||[]));
  useEffect(() => {
    load();
    supabase.from('empleados').select('id,nombre').eq('activo', true).order('nombre').then(({data})=>setEmps((data as any)||[]));
  }, []);
  // Auto-cálculo monto = base * porcentaje/100 si el usuario no lo tocó manualmente
  const setBase = (v: number) => setNeu((p: any) => ({...p, base_calculo: v, monto: Number((v * (p.porcentaje||0)/100).toFixed(2))}));
  const setPct = (v: number) => setNeu((p: any) => ({...p, porcentaje: v, monto: Number(((p.base_calculo||0) * v/100).toFixed(2))}));
  const crear = async () => {
    if (!neu.empleado_id || !neu.periodo_inicio || !neu.periodo_fin) { toast.error('Empleado y periodo requeridos'); return; }
    const { error } = await supabase.from('comisiones').insert(neu);
    if (error) { toast.error(error.message); return; }
    toast.success('Comisión registrada');
    setShowNew(false);
    setNeu({ empleado_id: '', periodo_inicio: '', periodo_fin: '', base_calculo: 0, porcentaje: 0, monto: 0, grava: false, notas: '' });
    load();
  };
  return (
    <div className="space-y-3">
      <MotorComisionesTab />
      <MetasComisionesTab />
      <div className="flex gap-2">
        <Button onClick={()=>setShowNew(true)}><Plus className="h-4 w-4 mr-2"/>Agregar comisión</Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Comisiones pagadas (captura manual)</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">Captura manual por empleado y periodo, normalmente calculada contra la meta de arriba. Marcar "Grava" solo si la comisión debe reflejarse como percepción gravable en el recibo del periodo.</p>
          <table className="w-full text-sm">
            <thead className="bg-muted"><tr><th className="p-2 text-left">Empleado</th><th className="p-2 text-left">Periodo</th><th className="p-2 text-right">Base</th><th className="p-2 text-right">%</th><th className="p-2 text-right">Monto</th><th className="p-2">Grava</th><th className="p-2 text-left">Notas</th></tr></thead>
            <tbody>{rows.length===0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Sin comisiones registradas</td></tr>}
            {rows.map(c => (
              <tr key={c.id} className="border-b">
                <td className="p-2">{c.empleados?.nombre}</td>
                <td className="p-2">{c.periodo_inicio} → {c.periodo_fin}</td>
                <td className="p-2 text-right">${Number(c.base_calculo).toFixed(2)}</td>
                <td className="p-2 text-right">{c.porcentaje}%</td>
                <td className="p-2 text-right font-semibold">${Number(c.monto).toFixed(2)}</td>
                <td className="p-2 text-center">{c.grava?'✓':'—'}</td>
                <td className="p-2 text-xs text-muted-foreground">{c.notas || '—'}</td>
              </tr>
            ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva comisión</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Empleado</Label>
              <select className="w-full h-10 border rounded px-2" value={neu.empleado_id} onChange={e=>setNeu({...neu, empleado_id: e.target.value})}>
                <option value="">—</option>
                {emps.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div><Label>Periodo inicio</Label><Input type="date" value={neu.periodo_inicio} onChange={e=>setNeu({...neu, periodo_inicio: e.target.value})} /></div>
            <div><Label>Periodo fin</Label><Input type="date" value={neu.periodo_fin} onChange={e=>setNeu({...neu, periodo_fin: e.target.value})} /></div>
            <div><Label>Base de cálculo</Label><Input type="number" step="0.01" value={neu.base_calculo} onChange={e=>setBase(Number(e.target.value))} /></div>
            <div><Label>Porcentaje (%)</Label><Input type="number" step="0.01" value={neu.porcentaje} onChange={e=>setPct(Number(e.target.value))} /></div>
            <div className="col-span-2"><Label>Monto</Label><Input type="number" step="0.01" value={neu.monto} onChange={e=>setNeu({...neu, monto: Number(e.target.value)})} /></div>
            <div className="col-span-2 flex items-center gap-2">
              <input id="grava" type="checkbox" checked={neu.grava} onChange={e=>setNeu({...neu, grava: e.target.checked})} />
              <Label htmlFor="grava">Grava en recibo (se sumará como percepción gravable)</Label>
            </div>
            <div className="col-span-2"><Label>Notas</Label><Input value={neu.notas} onChange={e=>setNeu({...neu, notas: e.target.value})} placeholder="Motivo, referencia, etc." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setShowNew(false)}>Cancelar</Button>
            <Button onClick={crear}>Guardar comisión</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
