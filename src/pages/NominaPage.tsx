import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Upload, Plus, Calculator, FileCheck, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { NominaCalculator, BiometricoConnector } from '@/services/NominaCalculator';

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
          <TabsTrigger value="conceptos">Conceptos</TabsTrigger>
          <TabsTrigger value="asistencia">Asistencia</TabsTrigger>
          <TabsTrigger value="recibos">Recibos</TabsTrigger>
          <TabsTrigger value="comisiones">Comisiones</TabsTrigger>
        </TabsList>
        <TabsContent value="empleados"><EmpleadosTab /></TabsContent>
        <TabsContent value="conceptos"><ConceptosTab /></TabsContent>
        <TabsContent value="asistencia"><AsistenciaTab /></TabsContent>
        <TabsContent value="recibos"><RecibosTab /></TabsContent>
        <TabsContent value="comisiones"><ComisionesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function EmpleadosTab() {
  const [emps, setEmps] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [n, setN] = useState<any>({ nombre: '', rfc: '', salario_diario: 0, sbc: 0, periodicidad_pago: 'quincenal' });
  const load = async () => {
    const { data } = await supabase.from('empleados').select('*').order('nombre');
    setEmps((data as any) || []);
  };
  useEffect(() => { load(); }, []);
  const importar = async (file: File) => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer());
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const filas = rows.map(r => ({
      numero_empleado: String(r.numero_empleado ?? r.NumeroEmpleado ?? r.NUM ?? '').trim() || null,
      nombre: r.nombre ?? r.Nombre,
      rfc: r.rfc ?? r.RFC, curp: r.curp ?? r.CURP, nss: r.nss ?? r.NSS,
      fecha_alta: r.fecha_alta ?? r.FechaAlta,
      salario_diario: Number(r.salario_diario ?? r.SD ?? 0),
      sbc: Number(r.sbc ?? r.SBC ?? r.salario_diario ?? 0),
      puesto: r.puesto, departamento: r.departamento,
      periodicidad_pago: r.periodicidad_pago ?? 'quincenal',
      regimen: String(r.regimen ?? '02'),
      entidad_federativa: r.entidad_federativa ?? 'MEX',
      tipo_contrato: r.tipo_contrato ?? 'indeterminado',
      riesgo_puesto: Number(r.riesgo_puesto ?? 1),
      banco: r.banco, clabe: r.clabe, email: r.email,
    })).filter(f => f.nombre);
    const { error } = await supabase.from('empleados').upsert(filas as any, { onConflict: 'numero_empleado' });
    if (error) { toast.error(error.message); return; }
    toast.success(`${filas.length} empleados importados`);
    load();
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
          <thead className="bg-muted"><tr><th className="p-2 text-left">Nombre</th><th className="p-2 text-left">RFC</th><th className="p-2 text-left">Puesto</th><th className="p-2 text-right">SD</th><th className="p-2 text-right">SBC</th><th className="p-2 text-left">Estatus</th></tr></thead>
          <tbody>{emps.map(e => (
            <tr key={e.id} className="border-b"><td className="p-2">{e.nombre}</td><td className="p-2 font-mono text-xs">{e.rfc}</td><td className="p-2">{e.puesto}</td><td className="p-2 text-right">${Number(e.salario_diario).toFixed(2)}</td><td className="p-2 text-right">${Number(e.sbc).toFixed(2)}</td><td className="p-2"><Badge variant={e.activo?'default':'secondary'}>{e.activo?'Activo':'Baja'}</Badge></td></tr>
          ))}</tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

function ConceptosTab() {
  const [conc, setConc] = useState<any[]>([]);
  useEffect(() => { supabase.from('conceptos_nomina').select('*').order('tipo').order('clave').then(({data})=>setConc((data as any)||[])); }, []);
  return (
    <Card><CardContent className="p-0">
      <table className="w-full text-sm">
        <thead className="bg-muted"><tr><th className="p-2 text-left">Clave</th><th className="p-2 text-left">Descripción</th><th className="p-2 text-left">Tipo</th><th className="p-2 text-left">SAT</th><th className="p-2">Grava ISR</th><th className="p-2">Grava IMSS</th></tr></thead>
        <tbody>{conc.map(c => (
          <tr key={c.id} className="border-b"><td className="p-2 font-mono">{c.clave}</td><td className="p-2">{c.descripcion}</td><td className="p-2"><Badge variant={c.tipo==='percepcion'?'default':'secondary'}>{c.tipo}</Badge></td><td className="p-2">{c.codigo_sat}</td><td className="p-2 text-center">{c.grava_isr?'✓':'—'}</td><td className="p-2 text-center">{c.grava_imss?'✓':'—'}</td></tr>
        ))}</tbody>
      </table>
    </CardContent></Card>
  );
}

function AsistenciaTab() {
  const [filas, setFilas] = useState<any[]>([]);
  const [emps, setEmps] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('asistencia').select('*, empleados(nombre)').order('fecha',{ascending:false}).limit(100).then(({data})=>setFilas((data as any)||[]));
    supabase.from('empleados').select('id,nombre,numero_empleado').then(({data})=>setEmps((data as any)||[]));
  }, []);
  const importar = async (file: File) => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer());
    const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const map = new Map(emps.map(e => [String(e.numero_empleado || '').trim(), e.id]));
    const map2 = new Map(emps.map(e => [String(e.nombre).toLowerCase().trim(), e.id]));
    const filas2 = rows.map(r => {
      const key = String(r.numero_empleado ?? r.empleado ?? '').trim();
      const empId = map.get(key) || map2.get(key.toLowerCase()) || r.empleado_id;
      return empId ? {
        empleado_id: empId, fecha: r.fecha, entrada: r.entrada || null, salida: r.salida || null,
        incidencia: r.incidencia || null, horas_extra: Number(r.horas_extra || 0), origen: 'import',
      } : null;
    }).filter(Boolean);
    const { error } = await supabase.from('asistencia').upsert(filas2 as any, { onConflict: 'empleado_id,fecha' });
    if (error) { toast.error(error.message); return; }
    toast.success(`${filas2.length} registros`);
  };
  const sync = async () => {
    try { await BiometricoConnector.sincronizar('', ''); } catch (e: any) { toast.error(e.message); }
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input id="asis-file" type="file" accept=".xlsx,.csv" className="hidden" onChange={e => e.target.files?.[0] && importar(e.target.files[0])} />
        <Button variant="outline" onClick={() => document.getElementById('asis-file')?.click()}><Upload className="h-4 w-4 mr-2" />Importar asistencia</Button>
        <Button variant="outline" onClick={sync}>Sincronizar biométrico (stub)</Button>
      </div>
      <Card><CardContent className="p-0"><table className="w-full text-sm">
        <thead className="bg-muted"><tr><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Empleado</th><th className="p-2">Entrada</th><th className="p-2">Salida</th><th className="p-2">Incidencia</th><th className="p-2 text-right">Hrs extra</th></tr></thead>
        <tbody>{filas.map(a => (
          <tr key={a.id} className="border-b"><td className="p-2">{a.fecha}</td><td className="p-2">{a.empleados?.nombre}</td><td className="p-2 text-center">{a.entrada || '—'}</td><td className="p-2 text-center">{a.salida || '—'}</td><td className="p-2 text-center">{a.incidencia && <Badge variant="outline">{a.incidencia}</Badge>}</td><td className="p-2 text-right">{a.horas_extra}</td></tr>
        ))}</tbody>
      </table></CardContent></Card>
    </div>
  );
}

function RecibosTab() {
  const [recs, setRecs] = useState<any[]>([]);
  const [emps, setEmps] = useState<any[]>([]);
  const [empId, setEmpId] = useState('');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const load = async () => {
    const { data } = await supabase.from('recibos_nomina').select('*, empleados(nombre)').order('periodo_fin',{ascending:false}).limit(50);
    setRecs((data as any) || []);
  };
  useEffect(() => {
    load();
    supabase.from('empleados').select('id,nombre').eq('activo',true).order('nombre').then(({data})=>setEmps((data as any)||[]));
  }, []);
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
  const timbrarPrueba = async (recId: string) => {
    const { data, error } = await supabase.functions.invoke('facturapi-timbrar-nomina', { body: { recibo_id: recId, es_prueba: true } });
    if (error) { toast.error(error.message); return; }
    toast.success((data as any)?.nota || 'Timbrado prueba ejecutado');
    load();
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
      <Card><CardContent className="p-0"><table className="w-full text-sm">
        <thead className="bg-muted"><tr><th className="p-2 text-left">Periodo</th><th className="p-2 text-left">Empleado</th><th className="p-2 text-right">Percep.</th><th className="p-2 text-right">Deduc.</th><th className="p-2 text-right">Neto</th><th className="p-2 text-left">Estatus</th><th></th></tr></thead>
        <tbody>{recs.map(r => (
          <tr key={r.id} className="border-b">
            <td className="p-2">{r.periodo_inicio} → {r.periodo_fin}</td>
            <td className="p-2">{r.empleados?.nombre}</td>
            <td className="p-2 text-right">${Number(r.total_percepciones).toFixed(2)}</td>
            <td className="p-2 text-right">${Number(r.total_deducciones).toFixed(2)}</td>
            <td className="p-2 text-right font-semibold">${Number(r.neto_pagado).toFixed(2)}</td>
            <td className="p-2"><Badge variant={r.estatus==='timbrado'?'default':'secondary'}>{r.estatus}{r.es_prueba?' (prueba)':''}</Badge></td>
            <td className="p-2">{r.estatus!=='timbrado' && <Button size="sm" variant="outline" onClick={() => timbrarPrueba(r.id)}><Receipt className="h-3 w-3 mr-1" />Timbrar (prueba)</Button>}</td>
          </tr>
        ))}</tbody>
      </table></CardContent></Card>
    </div>
  );
}

function ComisionesTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('comisiones').select('*, empleados(nombre)').order('periodo_fin',{ascending:false}).then(({data})=>setRows((data as any)||[]));
  }, []);
  return (
    <Card>
      <CardHeader><CardTitle>Comisiones</CardTitle></CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">Por defecto las comisiones aquí registradas <strong>no gravan</strong> en recibo (gancho). El esquema final lo confirma el cliente.</p>
        <table className="w-full text-sm"><thead className="bg-muted"><tr><th className="p-2 text-left">Empleado</th><th className="p-2 text-left">Periodo</th><th className="p-2 text-right">Base</th><th className="p-2 text-right">%</th><th className="p-2 text-right">Monto</th><th className="p-2">Grava</th></tr></thead>
          <tbody>{rows.length===0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Sin comisiones registradas</td></tr>}
          {rows.map(c => <tr key={c.id} className="border-b"><td className="p-2">{c.empleados?.nombre}</td><td className="p-2">{c.periodo_inicio} → {c.periodo_fin}</td><td className="p-2 text-right">${Number(c.base_calculo).toFixed(2)}</td><td className="p-2 text-right">{c.porcentaje}%</td><td className="p-2 text-right">${Number(c.monto).toFixed(2)}</td><td className="p-2 text-center">{c.grava?'✓':'—'}</td></tr>)}
          </tbody></table>
      </CardContent>
    </Card>
  );
}
