import { useRef, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, Loader2, ChevronRight, Check, AlertCircle, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { normalizeHeader, normalizeRow, parseNum, parseInt2, parseDate } from '@/lib/headerNorm';

type Proveedor = { id: string; codigo: string | null; nombre: string };
type Producto = { id: string; sku: string | null; codigo_barras: string | null; nombre: string };

type ParsedRow = {
  fila: number;
  clave: string;
  descripcion: string;
  precio: number | null;
  precio_con_iva: number | null;
  existencia: number | null;
  iva_tasa: number | null;
  fecha_vigencia: string | null;
  cantidad_min: number;
  match: 'OK' | 'NOT_FOUND' | 'INVALID';
  motivo?: string;
  producto_id?: string;
  precio_anterior?: number | null;
};

const HEADER_MAP: Record<string, string> = {
  clave: 'clave', sku: 'clave', codigo: 'clave', codigo_de_barras: 'clave', codigo_barras: 'clave', cb: 'clave', upc: 'clave', ean: 'clave',
  descripcion: 'descripcion', producto: 'descripcion', nombre: 'descripcion', nombre_producto: 'descripcion',
  precio: 'precio', precio_unitario: 'precio', costo: 'precio', precio_sin_iva: 'precio', precio_neto: 'precio', pu: 'precio',
  precio_con_iva: 'precio_con_iva', precio_iva: 'precio_con_iva', precio_publico: 'precio_con_iva',
  existencia: 'existencia', stock: 'existencia', inventario: 'existencia', disponible: 'existencia', existencias: 'existencia',
  iva: 'iva', iva_tasa: 'iva', tasa_iva: 'iva',
  vigencia: 'fecha_vigencia', fecha: 'fecha_vigencia', fecha_vigencia: 'fecha_vigencia', vigente_desde: 'fecha_vigencia',
  cantidad_minima: 'cantidad_min', cant_min: 'cantidad_min', min: 'cantidad_min', cantidad_min: 'cantidad_min',
};

const STD_FIELDS = ['clave', 'descripcion', 'precio', 'precio_con_iva', 'existencia', 'iva', 'fecha_vigencia', 'cantidad_min'] as const;
type StdField = typeof STD_FIELDS[number];

function downloadPlantilla() {
  const ws = XLSX.utils.json_to_sheet([
    { clave: '7501000000001', descripcion: 'PARACETAMOL 500MG C/10', precio: 12.50, existencia: 200, iva: 16, vigencia: '2026-01-01', cantidad_minima: 1 },
    { clave: '7501000000002', descripcion: 'IBUPROFENO 400MG C/20', precio: 28.00, existencia: 80, iva: 16, vigencia: '2026-01-01', cantidad_minima: 6 },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'lista_precios');
  XLSX.writeFile(wb, 'plantilla_lista_precios.xlsx');
}

export default function ListaPreciosUploader({ onDone }: { onDone?: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proveedorId, setProveedorId] = useState<string>('');
  const [newProvOpen, setNewProvOpen] = useState(false);
  const [newProv, setNewProv] = useState({ codigo: '', nombre: '', razon_social: '', plazo_pago_dias: 0 });

  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<StdField, string>>({
    clave: '', descripcion: '', precio: '', precio_con_iva: '', existencia: '', iva: '', fecha_vigencia: '', cantidad_min: '',
  });

  const [vigenciaDesde, setVigenciaDesde] = useState<string>(new Date().toISOString().slice(0, 10));
  const [vigenciaHasta, setVigenciaHasta] = useState<string>('');
  const [precioIncluyeIva, setPrecioIncluyeIva] = useState(false);
  const [ivaTasaDefault, setIvaTasaDefault] = useState(16);
  const [reemplazaAnterior, setReemplazaAnterior] = useState(true);
  const [autoCrearFaltantes, setAutoCrearFaltantes] = useState(false);

  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [resumen, setResumen] = useState<{ insertados: number; reemplazados: number; omitidos: number; autocreados: number; cargaId?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('proveedores').select('id, codigo, nombre').eq('activo', true).order('nombre').then(({ data }) => {
      setProveedores((data as Proveedor[]) || []);
    });
  }, []);

  const proveedorActual = proveedores.find(p => p.id === proveedorId);

  // ---------- Step 1: proveedor ----------
  async function crearProveedor() {
    if (!newProv.nombre.trim()) { toast.error('Nombre requerido'); return; }
    const payload: any = {
      nombre: newProv.nombre.trim(),
      codigo: newProv.codigo.trim() || null,
      razon_social: newProv.razon_social.trim() || null,
      plazo_pago_dias: Number(newProv.plazo_pago_dias) || 0,
      activo: true,
    };
    const { data, error } = await supabase.from('proveedores').insert(payload).select('id, codigo, nombre').single();
    if (error) { toast.error('Error: ' + error.message); return; }
    setProveedores(prev => [...prev, data as Proveedor].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setProveedorId((data as any).id);
    setNewProvOpen(false);
    setNewProv({ codigo: '', nombre: '', razon_social: '', plazo_pago_dias: 0 });
    toast.success('Proveedor creado');
  }

  // ---------- Step 2: leer archivo ----------
  async function leerArchivo(f: File) {
    setFile(f);
    setFileName(f.name);
    const ab = await f.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length) { toast.error('Hoja vacía'); return; }

    const headers = Object.keys(rows[0]);
    setRawHeaders(headers);
    setRawRows(rows);

    // Auto-detect mapping
    const auto: Record<StdField, string> = {
      clave: '', descripcion: '', precio: '', precio_con_iva: '', existencia: '', iva: '', fecha_vigencia: '', cantidad_min: '',
    };
    for (const h of headers) {
      const std = HEADER_MAP[normalizeHeader(h)];
      if (std && !auto[std as StdField]) auto[std as StdField] = h;
    }
    setMapping(auto);
    setStep(2);
  }

  // ---------- Step 4: vista previa ----------
  async function generarPreview() {
    if (!mapping.clave || !mapping.precio) {
      toast.error('Mapeo incompleto: se requiere columna de clave y precio');
      return;
    }
    setPreviewLoading(true);
    try {
      // Build claves
      const wantedClaves = Array.from(new Set(
        rawRows.map(r => String(r[mapping.clave] ?? '').trim()).filter(Boolean)
      ));

      // Fetch productos in chunks
      const CHUNK = 250;
      const byClave = new Map<string, Producto>();
      for (let i = 0; i < wantedClaves.length; i += CHUNK) {
        const slice = wantedClaves.slice(i, i + CHUNK);
        const [a, b] = await Promise.all([
          supabase.from('productos').select('id, sku, codigo_barras, nombre').in('sku', slice),
          supabase.from('productos').select('id, sku, codigo_barras, nombre').in('codigo_barras', slice),
        ]);
        for (const p of [...(a.data || []), ...(b.data || [])] as Producto[]) {
          if (p.codigo_barras) byClave.set(String(p.codigo_barras), p);
          if (p.sku && !byClave.has(String(p.sku))) byClave.set(String(p.sku), p);
        }
      }

      // Fetch previous active prices for this proveedor
      const { data: prevPrices } = await supabase
        .from('lista_precio_proveedor')
        .select('producto_id, precio')
        .eq('proveedor_id', proveedorId)
        .eq('activo', true);
      const prevByProd = new Map<string, number>();
      (prevPrices || []).forEach((p: any) => prevByProd.set(p.producto_id, Number(p.precio)));

      const out: ParsedRow[] = rawRows.map((r, idx) => {
        const clave = String(r[mapping.clave] ?? '').trim();
        const descripcion = String(r[mapping.descripcion] ?? '').trim();
        const precio = mapping.precio ? parseNum(r[mapping.precio]) : null;
        const precioConIva = mapping.precio_con_iva ? parseNum(r[mapping.precio_con_iva]) : null;
        const existencia = mapping.existencia ? parseInt2(r[mapping.existencia]) : 0;
        const iva = mapping.iva ? parseNum(r[mapping.iva]) : null;
        const fecha = mapping.fecha_vigencia ? parseDate(r[mapping.fecha_vigencia]) : null;
        const cantMin = mapping.cantidad_min ? (parseInt2(r[mapping.cantidad_min]) ?? 1) : 1;
        const fila = idx + 2;

        if (!clave) return { fila, clave, descripcion, precio, precio_con_iva: precioConIva, existencia, iva_tasa: iva, fecha_vigencia: fecha, cantidad_min: cantMin, match: 'INVALID', motivo: 'Clave vacía' };
        if (precio == null || precio < 0) return { fila, clave, descripcion, precio, precio_con_iva: precioConIva, existencia, iva_tasa: iva, fecha_vigencia: fecha, cantidad_min: cantMin, match: 'INVALID', motivo: 'Precio inválido' };

        const prod = byClave.get(clave);
        if (!prod) {
          return { fila, clave, descripcion, precio, precio_con_iva: precioConIva, existencia, iva_tasa: iva, fecha_vigencia: fecha, cantidad_min: cantMin, match: 'NOT_FOUND' };
        }
        return {
          fila, clave, descripcion, precio, precio_con_iva: precioConIva, existencia, iva_tasa: iva,
          fecha_vigencia: fecha, cantidad_min: cantMin, match: 'OK', producto_id: prod.id,
          precio_anterior: prevByProd.get(prod.id) ?? null,
        };
      });

      setParsed(out);
      setStep(4);
    } catch (e: any) {
      toast.error('Error al procesar: ' + e.message);
    } finally {
      setPreviewLoading(false);
    }
  }

  function descargarNoEncontrados() {
    const rows = parsed.filter(p => p.match === 'NOT_FOUND').map(p => ({
      fila: p.fila, clave: p.clave, descripcion: p.descripcion, precio: p.precio, existencia: p.existencia,
    }));
    if (!rows.length) { toast.info('No hay productos no encontrados'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'no_encontrados');
    XLSX.writeFile(wb, `no_encontrados_${fileName}`);
  }

  // ---------- Step 5: importar ----------
  async function importar() {
    setCommitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      // 1. Create carga record
      const { data: cargaRow, error: cargaErr } = await supabase
        .from('lista_precio_cargas')
        .insert({
          proveedor_id: proveedorId,
          archivo_nombre: fileName,
          fecha_vigencia_desde: vigenciaDesde,
          fecha_vigencia_hasta: vigenciaHasta || null,
          precio_incluye_iva: precioIncluyeIva,
          iva_tasa_default: ivaTasaDefault,
          reemplaza_carga_anterior: reemplazaAnterior,
          cargado_por: userId,
        } as any)
        .select('id')
        .single();
      if (cargaErr) throw cargaErr;
      const cargaId = (cargaRow as any).id;

      // 2. Optionally auto-create missing productos
      let autoCreados = 0;
      let rows = [...parsed];
      if (autoCrearFaltantes) {
        const faltantes = rows.filter(r => r.match === 'NOT_FOUND' && r.descripcion);
        if (faltantes.length) {
          const inserts = faltantes.map(r => ({
            sku: r.clave,
            codigo_barras: /^\d{8,}$/.test(r.clave) ? r.clave : null,
            nombre: r.descripcion || r.clave,
            precio_base: 0,
            estatus: 'N',
            activo: true,
          }));
          // Chunk insert
          for (let i = 0; i < inserts.length; i += 200) {
            const slice = inserts.slice(i, i + 200);
            const { data: created, error } = await supabase
              .from('productos')
              .insert(slice as any)
              .select('id, sku, codigo_barras');
            if (error) throw error;
            for (const p of (created || []) as any[]) {
              const key = p.codigo_barras || p.sku;
              const target = rows.find(r => r.match === 'NOT_FOUND' && r.clave === key);
              if (target) { target.match = 'OK'; target.producto_id = p.id; autoCreados++; }
            }
          }
        }
      }

      // 3. Deactivate prior list
      if (reemplazaAnterior) {
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        const { error: deactErr } = await supabase
          .from('lista_precio_proveedor')
          .update({ activo: false, fecha_vigencia_hasta: yesterday.toISOString().slice(0, 10) } as any)
          .eq('proveedor_id', proveedorId)
          .eq('activo', true);
        if (deactErr) throw deactErr;
      }

      // 4. Insert valid rows
      const validRows = rows.filter(r => r.match === 'OK' && r.producto_id);
      const ivaPct = ivaTasaDefault / 100;
      const toInsert = validRows.map(r => {
        const precioNeto = precioIncluyeIva && r.precio != null ? r.precio / (1 + ivaPct) : r.precio;
        const precioCon = r.precio_con_iva ?? (precioIncluyeIva ? r.precio : (r.precio != null ? r.precio * (1 + ivaPct) : null));
        return {
          proveedor_id: proveedorId,
          producto_id: r.producto_id!,
          precio: precioNeto,
          precio_con_iva: precioCon,
          existencia_proveedor: r.existencia ?? 0,
          cantidad_min: r.cantidad_min || 1,
          fecha_vigencia_desde: r.fecha_vigencia || vigenciaDesde,
          fecha_vigencia_hasta: vigenciaHasta || null,
          carga_id: cargaId,
          activo: true,
        };
      });

      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += 500) {
        const slice = toInsert.slice(i, i + 500);
        const { error, count } = await supabase
          .from('lista_precio_proveedor')
          .insert(slice as any, { count: 'exact' });
        if (error) throw error;
        inserted += count ?? slice.length;
      }

      const omitidos = parsed.filter(r => r.match !== 'OK').length - autoCreados;

      // 5. Update carga counters
      await supabase.from('lista_precio_cargas').update({
        productos_cargados: inserted,
        productos_actualizados: validRows.filter(v => v.precio_anterior != null).length,
        productos_omitidos: omitidos < 0 ? 0 : omitidos,
        productos_autocreados: autoCreados,
      } as any).eq('id', cargaId);

      setResumen({ insertados: inserted, reemplazados: validRows.filter(v => v.precio_anterior != null).length, omitidos: Math.max(0, omitidos), autocreados: autoCreados, cargaId });
      setStep(6);
      toast.success(`Lista cargada: ${inserted} precios`);
      onDone?.();
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setCommitting(false);
    }
  }

  function resetWizard() {
    setStep(1); setFile(null); setFileName(''); setRawHeaders([]); setRawRows([]); setParsed([]); setResumen(null);
    setMapping({ clave: '', descripcion: '', precio: '', precio_con_iva: '', existencia: '', iva: '', fecha_vigencia: '', cantidad_min: '' });
  }

  // ----- counts -----
  const counts = {
    ok: parsed.filter(p => p.match === 'OK').length,
    notFound: parsed.filter(p => p.match === 'NOT_FOUND').length,
    invalid: parsed.filter(p => p.match === 'INVALID').length,
    changed: parsed.filter(p => p.match === 'OK' && p.precio_anterior != null && Math.abs((p.precio || 0) - (p.precio_anterior || 0)) > 0.001).length,
  };

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-2 text-xs">
        {[1, 2, 3, 4, 5, 6].map(n => (
          <div key={n} className={`flex items-center gap-1 ${step >= n ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] ${step > n ? 'bg-primary text-primary-foreground' : step === n ? 'bg-primary/20 border border-primary' : 'bg-muted'}`}>
              {step > n ? <Check className="h-3 w-3" /> : n}
            </div>
            {n < 6 && <ChevronRight className="h-3 w-3" />}
          </div>
        ))}
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h3 className="font-semibold">Paso 1: Seleccionar proveedor</h3>
            <div className="flex gap-2">
              <Select value={proveedorId} onValueChange={setProveedorId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Selecciona un proveedor activo" /></SelectTrigger>
                <SelectContent>
                  {proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.codigo ? `[${p.codigo}] ` : ''}{p.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => setNewProvOpen(true)}><Plus className="h-4 w-4 mr-1" />Nuevo</Button>
            </div>
            <div className="flex justify-end">
              <Button disabled={!proveedorId} onClick={() => setStep(2)}>Siguiente <ChevronRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Upload + mapping */}
      {step === 2 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h3 className="font-semibold">Paso 2: Subir archivo y mapear columnas</h3>
            <div className="flex gap-2">
              <Button variant="outline" onClick={downloadPlantilla}><Download className="h-4 w-4 mr-2" />Plantilla</Button>
              <Button onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />{fileName || 'Subir archivo .xlsx'}
              </Button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) leerArchivo(f); e.target.value = ''; }} />
            </div>
            {rawHeaders.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Detectamos {rawRows.length} filas y {rawHeaders.length} columnas. Confirma o ajusta el mapeo:</p>
                <div className="grid grid-cols-2 gap-3">
                  {STD_FIELDS.map(f => (
                    <div key={f}>
                      <Label className="text-xs">
                        {f.replace('_', ' ')} {(f === 'clave' || f === 'precio') && <span className="text-red-600">*</span>}
                      </Label>
                      <Select value={mapping[f] || '__none__'} onValueChange={(v) => setMapping(m => ({ ...m, [f]: v === '__none__' ? '' : v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— (sin asignar)</SelectItem>
                          {rawHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Atrás</Button>
              <Button disabled={!mapping.clave || !mapping.precio} onClick={() => setStep(3)}>Siguiente</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Vigencia */}
      {step === 3 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h3 className="font-semibold">Paso 3: Configurar vigencia y opciones</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Vigencia desde *</Label><Input type="date" value={vigenciaDesde} onChange={e => setVigenciaDesde(e.target.value)} /></div>
              <div><Label>Vigencia hasta (opcional)</Label><Input type="date" value={vigenciaHasta} onChange={e => setVigenciaHasta(e.target.value)} /></div>
            </div>
            <div className="space-y-3 border rounded-md p-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <Label>El precio del archivo INCLUYE IVA</Label>
                  <p className="text-xs text-muted-foreground">Default: sin IVA (precio neto). Se calcula el precio con IVA automáticamente.</p>
                </div>
                <Switch checked={precioIncluyeIva} onCheckedChange={setPrecioIncluyeIva} />
              </div>
              <div>
                <Label>Tasa de IVA por default (%)</Label>
                <Input type="number" min={0} max={100} value={ivaTasaDefault} onChange={e => setIvaTasaDefault(Number(e.target.value) || 0)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Reemplaza la lista anterior del proveedor</Label>
                  <p className="text-xs text-muted-foreground">Si activo, desactiva TODOS los precios activos previos de este proveedor antes de cargar.</p>
                </div>
                <Switch checked={reemplazaAnterior} onCheckedChange={setReemplazaAnterior} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-crear productos faltantes</Label>
                  <p className="text-xs text-muted-foreground">Crea productos en catálogo si la clave no existe (estatus N - Nuevo).</p>
                </div>
                <Switch checked={autoCrearFaltantes} onCheckedChange={setAutoCrearFaltantes} />
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Atrás</Button>
              <Button onClick={generarPreview} disabled={previewLoading}>
                {previewLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Generar vista previa
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: Preview */}
      {step === 4 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h3 className="font-semibold">Paso 4: Vista previa para {proveedorActual?.nombre}</h3>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-green-600">Válidos: {counts.ok}</Badge>
              <Badge variant="destructive">No encontrados: {counts.notFound}</Badge>
              <Badge variant="outline">Inválidos: {counts.invalid}</Badge>
              <Badge className="bg-blue-600">Precios cambiados: {counts.changed}</Badge>
              <Badge variant="secondary">Total: {parsed.length}</Badge>
            </div>
            {counts.notFound > 0 && (
              <Button variant="outline" size="sm" onClick={descargarNoEncontrados}>
                <Download className="h-4 w-4 mr-1" />Descargar no encontrados ({counts.notFound})
              </Button>
            )}
            {counts.changed > 0 && (
              <div className="border rounded-md max-h-64 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clave</TableHead><TableHead>Precio anterior</TableHead><TableHead>Precio nuevo</TableHead><TableHead>Δ %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.filter(p => p.match === 'OK' && p.precio_anterior != null && Math.abs((p.precio || 0) - (p.precio_anterior || 0)) > 0.001).slice(0, 100).map(p => {
                      const prev = p.precio_anterior!;
                      const diff = ((p.precio || 0) - prev) / prev * 100;
                      return (
                        <TableRow key={p.fila}>
                          <TableCell className="font-mono text-xs">{p.clave}</TableCell>
                          <TableCell>${prev.toFixed(2)}</TableCell>
                          <TableCell className="font-semibold">${(p.precio || 0).toFixed(2)}</TableCell>
                          <TableCell className={diff >= 0 ? 'text-red-600' : 'text-green-600'}>{diff >= 0 ? '+' : ''}{diff.toFixed(1)}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)}>Atrás</Button>
              <Button disabled={counts.ok === 0 || committing} onClick={() => { setStep(5); importar(); }}>
                Importar {counts.ok} productos válidos
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 5: Importing */}
      {step === 5 && (
        <Card>
          <CardContent className="pt-6 flex flex-col items-center justify-center py-12">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Importando lista de precios...</p>
          </CardContent>
        </Card>
      )}

      {/* STEP 6: Done */}
      {step === 6 && resumen && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-green-700">
              <Check className="h-5 w-5" />
              <h3 className="font-semibold">Importación completada</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-green-50 rounded-md"><p className="text-xs text-muted-foreground">Precios insertados</p><p className="text-2xl font-bold text-green-700">{resumen.insertados}</p></div>
              <div className="p-3 bg-blue-50 rounded-md"><p className="text-xs text-muted-foreground">Reemplazaron precios previos</p><p className="text-2xl font-bold text-blue-700">{resumen.reemplazados}</p></div>
              <div className="p-3 bg-amber-50 rounded-md"><p className="text-xs text-muted-foreground">Filas omitidas</p><p className="text-2xl font-bold text-amber-700">{resumen.omitidos}</p></div>
              <div className="p-3 bg-purple-50 rounded-md"><p className="text-xs text-muted-foreground">Productos auto-creados</p><p className="text-2xl font-bold text-purple-700">{resumen.autocreados}</p></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetWizard}>Cargar otra lista</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Nuevo proveedor dialog */}
      <Dialog open={newProvOpen} onOpenChange={setNewProvOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo proveedor</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Código *</Label><Input value={newProv.codigo} onChange={e => setNewProv({ ...newProv, codigo: e.target.value.toUpperCase() })} placeholder="FANASA" /></div>
            <div><Label>Nombre comercial *</Label><Input value={newProv.nombre} onChange={e => setNewProv({ ...newProv, nombre: e.target.value })} /></div>
            <div><Label>Razón social</Label><Input value={newProv.razon_social} onChange={e => setNewProv({ ...newProv, razon_social: e.target.value })} /></div>
            <div><Label>Días de crédito</Label><Input type="number" min={0} value={newProv.plazo_pago_dias} onChange={e => setNewProv({ ...newProv, plazo_pago_dias: Number(e.target.value) || 0 })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewProvOpen(false)}>Cancelar</Button>
            <Button onClick={crearProveedor}>Crear y seleccionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
