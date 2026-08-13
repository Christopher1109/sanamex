import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileCode2 } from 'lucide-react';
import { toast } from 'sonner';
import { generarBalanzaXml, generarCatalogoXml, descargarArchivo } from '@/services/SatCatalogoXml';

export default function ReportesAdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reportes administrativos</h1>
        <p className="text-muted-foreground">Estados financieros, flujo y antigüedad. Para impuestos (IVA, ISR, ISN, retenciones), ve al módulo de Determinación de Impuestos.</p>
      </div>
      <Tabs defaultValue="balanza" className="space-y-4">
        <TabsList>
          <TabsTrigger value="balanza">Balanza</TabsTrigger>
          <TabsTrigger value="er">Estado de Resultados</TabsTrigger>
          <TabsTrigger value="bg">Balance General</TabsTrigger>
          <TabsTrigger value="flujo">Flujo de Efectivo</TabsTrigger>
          <TabsTrigger value="cxp">Antigüedad CxP</TabsTrigger>
          <TabsTrigger value="sat">XML SAT</TabsTrigger>
        </TabsList>
        <TabsContent value="balanza"><BalanzaTab /></TabsContent>
        <TabsContent value="er"><ERTab /></TabsContent>
        <TabsContent value="bg"><BGTab /></TabsContent>
        <TabsContent value="flujo"><FlujoTab /></TabsContent>
        <TabsContent value="cxp"><CxPTab /></TabsContent>
        <TabsContent value="sat"><SatTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function useFiltros() {
  const [desde, setDesde] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0,10));
  const [hasta, setHasta] = useState(new Date().toISOString().slice(0,10));
  const [sucursalId, setSucursalId] = useState<string>('todas');
  const [sucursales, setSucursales] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('sucursales').select('id,nombre,codigo,es_fiscal').eq('activo', true).order('codigo')
      .then(({ data }) => setSucursales((data as any) || []));
  }, []);
  return { desde, setDesde, hasta, setHasta, sucursalId, setSucursalId, sucursales };
}

function Filtros({ f }: { f: ReturnType<typeof useFiltros> }) {
  return (
    <div className="flex gap-3 items-end flex-wrap">
      <div><Label>Desde</Label><Input type="date" value={f.desde} onChange={e => f.setDesde(e.target.value)} /></div>
      <div><Label>Hasta</Label><Input type="date" value={f.hasta} onChange={e => f.setHasta(e.target.value)} /></div>
      <div className="min-w-[180px]"><Label>Sucursal</Label>
        <Select value={f.sucursalId} onValueChange={f.setSucursalId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas (consolidado)</SelectItem>
            <SelectItem value="fiscales">Solo fiscales (4)</SelectItem>
            {f.sucursales.map(s => <SelectItem key={s.id} value={s.id}>{s.codigo} - {s.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

async function exportExcel(rows: any[], filename: string) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  XLSX.writeFile(wb, filename);
}

function BalanzaTab() {
  const f = useFiltros();
  const [rows, setRows] = useState<any[]>([]);
  const load = async () => {
    const { data, error } = await supabase.rpc('balanza_comprobacion', { p_desde: f.desde, p_hasta: f.hasta, p_solo_autorizadas: true });
    if (error) { toast.error(error.message); return; }
    setRows((data as any) || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [f.desde, f.hasta]);
  return (
    <Card>
      <CardHeader className="flex flex-row justify-between items-end">
        <Filtros f={f} />
        <Button variant="outline" onClick={() => exportExcel(rows, 'balanza.xlsx')}><Download className="h-4 w-4 mr-2" />Excel</Button>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="bg-muted"><tr><th className="p-2 text-left">Código</th><th className="p-2 text-left">Cuenta</th><th className="p-2 text-right">Cargos</th><th className="p-2 text-right">Abonos</th><th className="p-2 text-right">Saldo</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.cuenta_id} className="border-b">
                <td className="p-2 font-mono">{r.codigo}</td>
                <td className="p-2">{r.nombre}</td>
                <td className="p-2 text-right">${Number(r.cargos).toFixed(2)}</td>
                <td className="p-2 text-right">${Number(r.abonos).toFixed(2)}</td>
                <td className="p-2 text-right font-semibold">${Number(r.saldo).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ERTab() {
  const f = useFiltros();
  const [rows, setRows] = useState<any[]>([]);
  const load = async () => {
    const { data } = await supabase.rpc('balanza_comprobacion', { p_desde: f.desde, p_hasta: f.hasta, p_solo_autorizadas: true });
    setRows((data as any) || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [f.desde, f.hasta]);
  const ing = rows.filter(r => r.codigo.startsWith('4')).reduce((s, r) => s + Number(r.saldo), 0);
  const cos = rows.filter(r => r.codigo.startsWith('5')).reduce((s, r) => s + Number(r.saldo), 0);
  const gas = rows.filter(r => r.codigo.startsWith('6')).reduce((s, r) => s + Number(r.saldo), 0);
  const ut = ing - cos - gas;
  return (
    <Card>
      <CardHeader><Filtros f={f} /></CardHeader>
      <CardContent className="space-y-2 max-w-2xl">
        <div className="flex justify-between border-b py-2"><strong>Ingresos</strong><span>${ing.toFixed(2)}</span></div>
        <div className="flex justify-between border-b py-2"><span>(-) Costo de ventas</span><span>${cos.toFixed(2)}</span></div>
        <div className="flex justify-between border-b py-2"><span>(-) Gastos</span><span>${gas.toFixed(2)}</span></div>
        <div className="flex justify-between py-2 text-lg font-bold"><span>Utilidad neta</span><span className={ut>=0?'text-green-600':'text-red-600'}>${ut.toFixed(2)}</span></div>
        <Button variant="outline" onClick={() => exportExcel([{Ingresos:ing, Costos:cos, Gastos:gas, Utilidad:ut}], 'estado_resultados.xlsx')}><Download className="h-4 w-4 mr-2" />Excel</Button>
      </CardContent>
    </Card>
  );
}

function BGTab() {
  const f = useFiltros();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { supabase.rpc('balanza_comprobacion', { p_desde: f.desde, p_hasta: f.hasta, p_solo_autorizadas: true }).then(({data}) => setRows((data as any)||[])); }, [f.desde, f.hasta]);
  const act = rows.filter(r => r.codigo.startsWith('1')).reduce((s, r) => s + Number(r.saldo), 0);
  const pas = rows.filter(r => r.codigo.startsWith('2')).reduce((s, r) => s + Number(r.saldo), 0);
  const cap = rows.filter(r => r.codigo.startsWith('3')).reduce((s, r) => s + Number(r.saldo), 0);
  return (
    <Card>
      <CardHeader><Filtros f={f} /></CardHeader>
      <CardContent className="space-y-2 max-w-2xl">
        <div className="flex justify-between border-b py-2"><strong>Activo</strong><span>${act.toFixed(2)}</span></div>
        <div className="flex justify-between border-b py-2"><strong>Pasivo</strong><span>${pas.toFixed(2)}</span></div>
        <div className="flex justify-between border-b py-2"><strong>Capital</strong><span>${cap.toFixed(2)}</span></div>
        <div className="flex justify-between py-2 font-bold"><span>Pasivo + Capital</span><span>${(pas+cap).toFixed(2)}</span></div>
        <Button variant="outline" onClick={() => exportExcel([{Activo:act,Pasivo:pas,Capital:cap}], 'balance_general.xlsx')}><Download className="h-4 w-4 mr-2" />Excel</Button>
      </CardContent>
    </Card>
  );
}

function FlujoTab() {
  const f = useFiltros();
  const [movs, setMovs] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('movimientos_bancarios').select('fecha, concepto, cargo, abono, conciliado')
      .gte('fecha', f.desde).lte('fecha', f.hasta).order('fecha')
      .then(({ data }) => setMovs((data as any) || []));
  }, [f.desde, f.hasta]);
  const entradas = movs.reduce((s, m) => s + Number(m.abono || 0), 0);
  const salidas = movs.reduce((s, m) => s + Number(m.cargo || 0), 0);
  return (
    <Card>
      <CardHeader className="flex flex-row justify-between items-end">
        <Filtros f={f} />
        <Button variant="outline" onClick={() => exportExcel(movs, 'flujo.xlsx')}><Download className="h-4 w-4 mr-2" />Excel</Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card><CardContent className="p-4"><p className="text-xs">Entradas</p><p className="text-2xl font-bold text-green-600">${entradas.toFixed(2)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs">Salidas</p><p className="text-2xl font-bold text-red-600">${salidas.toFixed(2)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs">Flujo neto</p><p className="text-2xl font-bold">${(entradas-salidas).toFixed(2)}</p></CardContent></Card>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted"><tr><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Concepto</th><th className="p-2 text-right">Entrada</th><th className="p-2 text-right">Salida</th></tr></thead>
          <tbody>{movs.map((m,i)=>(<tr key={i} className="border-b"><td className="p-2">{m.fecha}</td><td className="p-2">{m.concepto}</td><td className="p-2 text-right text-green-600">${Number(m.abono||0).toFixed(2)}</td><td className="p-2 text-right text-red-600">${Number(m.cargo||0).toFixed(2)}</td></tr>))}</tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CxPTab() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('compras').select('numero_compra, proveedor_id, total, saldo, fecha_factura, pagada, proveedores(nombre)')
      .eq('pagada', false).order('fecha_factura')
      .then(({ data }) => setRows((data as any) || []));
  }, []);
  const today = new Date();
  const enriched = rows.map(r => {
    const dias = r.fecha_factura ? Math.floor((today.getTime() - new Date(r.fecha_factura).getTime()) / 86400000) : 0;
    const bucket = dias <= 30 ? '1-30' : dias <= 60 ? '31-60' : dias <= 90 ? '61-90' : '90+';
    return { ...r, dias, bucket };
  });
  return (
    <Card>
      <CardHeader className="flex flex-row justify-between">
        <CardTitle>Antigüedad de CxP</CardTitle>
        <Button variant="outline" onClick={() => exportExcel(enriched, 'antiguedad_cxp.xlsx')}><Download className="h-4 w-4 mr-2" />Excel</Button>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="bg-muted"><tr><th className="p-2 text-left">Compra</th><th className="p-2 text-left">Proveedor</th><th className="p-2 text-left">Fecha</th><th className="p-2 text-right">Días</th><th className="p-2 text-left">Bucket</th><th className="p-2 text-right">Saldo</th></tr></thead>
          <tbody>{enriched.map((r:any,i)=>(<tr key={i} className="border-b"><td className="p-2">{r.numero_compra}</td><td className="p-2">{r.proveedores?.nombre}</td><td className="p-2">{r.fecha_factura}</td><td className="p-2 text-right">{r.dias}</td><td className="p-2">{r.bucket}</td><td className="p-2 text-right">${Number(r.saldo||0).toFixed(2)}</td></tr>))}</tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function SatTab() {
  const [rfc, setRfc] = useState('GQU210304NJ5');
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);

  const descargarCatalogo = async () => {
    const { data } = await supabase.from('catalogo_cuentas').select('*').eq('activo', true).order('codigo');
    const xml = generarCatalogoXml((data as any) || [], rfc, anio, mes);
    descargarArchivo(xml, `CT_${rfc}_${anio}${String(mes).padStart(2,'0')}.xml`);
    toast.success('Catálogo XML descargado');
  };
  const descargarBalanza = async () => {
    const desde = `${anio}-${String(mes).padStart(2,'0')}-01`;
    const hastaD = new Date(anio, mes, 0).toISOString().slice(0,10);
    const { data } = await supabase.rpc('balanza_comprobacion', { p_desde: desde, p_hasta: hastaD, p_solo_autorizadas: true });
    const xml = generarBalanzaXml((data as any) || [], rfc, anio, mes);
    descargarArchivo(xml, `BN_${rfc}_${anio}${String(mes).padStart(2,'0')}.xml`);
    toast.success('Balanza XML descargada');
  };
  return (
    <Card>
      <CardHeader><CardTitle>Contabilidad electrónica SAT (Anexo 24)</CardTitle></CardHeader>
      <CardContent className="space-y-3 max-w-md">
        <p className="text-sm text-muted-foreground">Estructura XML lista. Validación oficial llega después.</p>
        <div><Label>RFC emisor</Label><Input value={rfc} onChange={e => setRfc(e.target.value.toUpperCase())} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Año</Label><Input type="number" value={anio} onChange={e => setAnio(Number(e.target.value))} /></div>
          <div><Label>Mes</Label><Input type="number" min={1} max={12} value={mes} onChange={e => setMes(Number(e.target.value))} /></div>
        </div>
        <div className="flex gap-2">
          <Button onClick={descargarCatalogo}><FileCode2 className="h-4 w-4 mr-2" />Catálogo XML</Button>
          <Button onClick={descargarBalanza}><FileCode2 className="h-4 w-4 mr-2" />Balanza XML</Button>
        </div>
      </CardContent>
    </Card>
  );
}
