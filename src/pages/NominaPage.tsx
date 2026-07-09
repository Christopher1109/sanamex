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

function EmpleadosTab() {
  const [emps, setEmps] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [n, setN] = useState<any>({ nombre: '', rfc: '', salario_diario: 0, sbc: 0, periodicidad_pago: 'quincenal' });
  const load = async () => {
    const { data } = await supabase.from('empleados').select('*').order('nombre');
    setEmps((data as any) || []);
  };
  useEffect(() => { load(); }, []);
  const importar = async (file: File) => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer());
    // Detect Plantilla format (header en fila 2 con "Empleado", "RFC"...)
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
        const o: any = {};
        headers.forEach((h, i) => { o[h] = r[i]; });
        return o;
      });
    } else {
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    }

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
        },
        errores, duplicado,
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
                      {p.errores.length > 0
                        ? <Badge variant="destructive">{p.errores.join(', ')}</Badge>
                        : p.duplicado ? <Badge variant="secondary">Actualizar</Badge>
                        : <Badge>Nuevo</Badge>}
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
          <thead className="bg-muted"><tr><th className="p-2 text-left">Nombre</th><th className="p-2 text-left">RFC</th><th className="p-2 text-left">Reg. Patronal</th><th className="p-2 text-left">Puesto</th><th className="p-2 text-right">SD</th><th className="p-2 text-right">SBC</th><th className="p-2 text-left">Estatus</th></tr></thead>
          <tbody>{emps.map(e => (
            <tr key={e.id} className="border-b"><td className="p-2">{e.nombre}</td><td className="p-2 font-mono text-xs">{e.rfc}</td><td className="p-2 font-mono text-xs">{e.registro_patronal || '—'}</td><td className="p-2">{e.puesto}</td><td className="p-2 text-right">${Number(e.salario_diario).toFixed(2)}</td><td className="p-2 text-right">${Number(e.sbc).toFixed(2)}</td><td className="p-2"><Badge variant={e.activo?'default':'secondary'}>{e.activo?'Activo':'Baja'}</Badge></td></tr>
          ))}</tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

function PrimasRTTab() {
  const [rows, setRows] = useState<any[]>([]);
  const load = async () => {
    const { data } = await supabase.from('primas_riesgo_patronal').select('*').order('registro_patronal');
    setRows((data as any) || []);
  };
  useEffect(() => { load(); }, []);
  const guardar = async (r: any) => {
    const { error } = await supabase.from('primas_riesgo_patronal').update({
      clase_rt: r.clase_rt, prima_rt: r.prima_rt, vigencia_desde: r.vigencia_desde, activo: r.activo,
    }).eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Prima guardada');
  };
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader><CardTitle>Primas de Riesgo de Trabajo por Registro Patronal</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">La prima RT se aplica al SBC en el cálculo de la cuota patronal IMSS. Usada automáticamente según el registro patronal asignado al empleado.</p>
          <table className="w-full text-sm">
            <thead className="bg-muted"><tr><th className="p-2 text-left">Registro Patronal</th><th className="p-2 text-center">Clase RT</th><th className="p-2 text-right">Prima RT (%)</th><th className="p-2 text-left">Vigencia desde</th><th className="p-2 text-left">Notas</th><th></th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={r.id} className="border-b">
                <td className="p-2 font-mono">{r.registro_patronal}</td>
                <td className="p-2 text-center"><Input type="number" className="h-8 w-16 mx-auto" value={r.clase_rt || ''} onChange={e => { const n=[...rows]; n[i].clase_rt=Number(e.target.value); setRows(n); }} /></td>
                <td className="p-2 text-right"><Input type="number" step="0.000001" className="h-8 w-28 ml-auto" value={r.prima_rt} onChange={e => { const n=[...rows]; n[i].prima_rt=Number(e.target.value); setRows(n); }} /></td>
                <td className="p-2"><Input type="date" className="h-8" value={r.vigencia_desde} onChange={e => { const n=[...rows]; n[i].vigencia_desde=e.target.value; setRows(n); }} /></td>
                <td className="p-2 text-xs">{r.notas}</td>
                <td className="p-2"><Button size="sm" onClick={() => guardar(r)}>Guardar</Button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sin primas registradas</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
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
