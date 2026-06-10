import { useRef, useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import {
  Upload, Download, Loader2, ChevronRight, Check, AlertCircle, Plus,
  FileSpreadsheet, CheckCircle2, XCircle, ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { normalizeHeader, parseNum, parseInt2, parseDate } from '@/lib/headerNorm';

type Proveedor = {
  id: string; codigo: string | null; nombre: string;
  plazo_pago_dias?: number; lead_time_prometido_dias?: number | null;
  monto_minimo_pedido?: number | null; acepta_devoluciones?: boolean;
};

// Standard 9-column template
const REQUIRED_HEADERS = ['clave', 'descripcion', 'precio_neto', 'existencia'] as const;
const OPTIONAL_HEADERS = ['piezas_corrugado', 'iva_pct', 'precio_oferta', 'oferta_inicio', 'oferta_fin'] as const;
const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];

type Row = {
  fila: number;
  clave: string;
  descripcion: string;
  precio_neto: number | null;
  existencia: number | null;
  piezas_corrugado: number | null;
  iva_pct: number | null;
  precio_oferta: number | null;
  oferta_inicio: string | null;
  oferta_fin: string | null;
};

type ValidationError = { fila: number; campo: string; mensaje: string };
type DuplicatePolicy = 'first' | 'cheapest' | 'cancel';

function downloadPlantilla() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ALL_HEADERS,
    ['7502208894557', 'CEFTRIAXONA INY 1G', 15.50, 1500, 100, 16, 13.99, '2026-06-01', '2026-06-30'],
    ['7501000000002', 'PARACETAMOL 500MG C/10', 12.50, 200, 50, 16, '', '', ''],
    ['7501000000003', 'IBUPROFENO 400MG C/20', 28.00, 80, '', 16, '', '', ''],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'lista_precios');
  const inst = XLSX.utils.aoa_to_sheet([
    ['INSTRUCCIONES — Plantilla estándar de lista de precios'],
    [''],
    ['1. No cambies los nombres de las columnas.'],
    ['2. Columnas obligatorias: clave, descripcion, precio_neto, existencia.'],
    ['3. Columnas opcionales: piezas_corrugado, iva_pct, precio_oferta, oferta_inicio, oferta_fin.'],
    ['4. La clave debe ser código de barras o SKU (solo dígitos).'],
    ['5. Los precios van SIN IVA en precio_neto. Usa iva_pct para indicar la tasa (0 ó 16).'],
    ['6. Las fechas en formato YYYY-MM-DD (ej. 2026-06-30).'],
    ['7. Si hay duplicados de "clave", se te preguntará qué hacer al validar.'],
    [''],
    ['Hoja a cargar: "lista_precios" (la primera).'],
  ]);
  XLSX.utils.book_append_sheet(wb, inst, 'Instrucciones');
  XLSX.writeFile(wb, 'plantilla_lista_precios.xlsx');
}

export default function ListaPreciosUploader({ onDone }: { onDone?: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Step 1/2 — file
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [duplicateKeys, setDuplicateKeys] = useState<string[]>([]);
  const [dupePolicy, setDupePolicy] = useState<DuplicatePolicy>('first');
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Step 3 — proveedor
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proveedorMode, setProveedorMode] = useState<'existing' | 'new'>('existing');
  const [proveedorId, setProveedorId] = useState<string>('');
  const [proveedorSearch, setProveedorSearch] = useState('');
  const [prevCarga, setPrevCarga] = useState<{ archivo: string; fecha: string; lineas: number } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [newProv, setNewProv] = useState({
    nombre: '', codigo: '', tipo: 'Farmacéutico',
    plazo_pago_dias: 0, lead_time_dias: '' as string | number,
    monto_minimo_pedido: '' as string | number, acepta_devoluciones: false,
  });
  const [creatingProv, setCreatingProv] = useState(false);

  // Step 4 — catalog validation
  const [verifying, setVerifying] = useState(false);
  const [existingKeys, setExistingKeys] = useState<Map<string, string>>(new Map()); // clave -> producto_id
  const [acceptNew, setAcceptNew] = useState(true);

  // Step 5 — result
  const [committing, setCommitting] = useState(false);
  const [resumen, setResumen] = useState<{
    cargaId: string; precios: number; nuevos: number; ofertas: number;
  } | null>(null);

  useEffect(() => {
    supabase.from('proveedores').select('id, codigo, nombre, plazo_pago_dias, lead_time_prometido_dias, monto_minimo_pedido, acepta_devoluciones').eq('activo', true).order('nombre').then(({ data }) => {
      setProveedores((data as Proveedor[]) || []);
    });
  }, []);

  const proveedorActual = proveedores.find(p => p.id === proveedorId);
  const proveedoresFiltrados = useMemo(() => {
    const s = proveedorSearch.trim().toLowerCase();
    if (!s) return proveedores.slice(0, 200);
    return proveedores.filter(p =>
      p.nombre.toLowerCase().includes(s) || (p.codigo || '').toLowerCase().includes(s)
    ).slice(0, 200);
  }, [proveedores, proveedorSearch]);

  // ===== Step 2: parse + validate =====
  async function leerArchivo(f: File) {
    setFileName(f.name);
    const ab = await f.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!raw.length) {
      setErrors([{ fila: 0, campo: 'archivo', mensaje: 'La hoja está vacía' }]);
      setRows([]); setStep(2); return;
    }

    // Normalize headers
    const headerMap: Record<string, string> = {};
    Object.keys(raw[0]).forEach(h => {
      const norm = normalizeHeader(h);
      if (ALL_HEADERS.includes(norm as any)) headerMap[h] = norm;
    });
    const presentStd = new Set(Object.values(headerMap));
    const missingRequired = REQUIRED_HEADERS.filter(h => !presentStd.has(h));

    if (missingRequired.length) {
      setErrors([{
        fila: 0, campo: 'headers',
        mensaje: `Faltan columnas obligatorias: ${missingRequired.join(', ')}. La plantilla debe tener: ${ALL_HEADERS.join(', ')}`,
      }]);
      setRows([]); setStep(2); return;
    }

    const errs: ValidationError[] = [];
    const parsed: Row[] = [];
    const keysSeen = new Map<string, number>(); // clave -> count

    raw.forEach((r, idx) => {
      const fila = idx + 2;
      const get = (std: string) => {
        const orig = Object.keys(headerMap).find(k => headerMap[k] === std);
        return orig ? r[orig] : '';
      };

      const clave = String(get('clave') ?? '').trim();
      const descripcion = String(get('descripcion') ?? '').trim();
      const precio = parseNum(get('precio_neto'));
      const existencia = parseInt2(get('existencia'));

      if (!clave) errs.push({ fila, campo: 'clave', mensaje: 'clave está vacía' });
      else if (!/^\d+$/.test(clave)) errs.push({ fila, campo: 'clave', mensaje: `la clave "${clave}" tiene caracteres no numéricos` });

      if (!descripcion) errs.push({ fila, campo: 'descripcion', mensaje: 'descripcion está vacía' });

      if (precio == null) errs.push({ fila, campo: 'precio_neto', mensaje: 'precio_neto está vacío o no es número' });
      else if (precio < 0) errs.push({ fila, campo: 'precio_neto', mensaje: `precio_neto inválido (${precio})` });

      if (existencia == null) errs.push({ fila, campo: 'existencia', mensaje: 'existencia está vacía o no es entera' });

      if (clave) keysSeen.set(clave, (keysSeen.get(clave) || 0) + 1);

      parsed.push({
        fila, clave, descripcion,
        precio_neto: precio,
        existencia: existencia,
        piezas_corrugado: presentStd.has('piezas_corrugado') ? parseInt2(get('piezas_corrugado')) : null,
        iva_pct: presentStd.has('iva_pct') ? parseNum(get('iva_pct')) : null,
        precio_oferta: presentStd.has('precio_oferta') ? parseNum(get('precio_oferta')) : null,
        oferta_inicio: presentStd.has('oferta_inicio') ? parseDate(get('oferta_inicio')) : null,
        oferta_fin: presentStd.has('oferta_fin') ? parseDate(get('oferta_fin')) : null,
      });
    });

    const dupes = Array.from(keysSeen.entries()).filter(([, n]) => n > 1).map(([k]) => k);
    setDuplicateKeys(dupes);
    setRows(parsed);
    setErrors(errs);
    setStep(2);
  }

  function descargarErroresCSV() {
    if (!errors.length) return;
    const csv = ['fila,campo,mensaje', ...errors.map(e => `${e.fila},"${e.campo}","${e.mensaje.replace(/"/g, '""')}"`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `errores_${fileName.replace(/\.[^.]+$/, '')}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // Resolve rows after applying duplicate policy
  const resolvedRows = useMemo(() => {
    if (!duplicateKeys.length || dupePolicy === 'cancel') return rows;
    const byKey = new Map<string, Row>();
    for (const r of rows) {
      if (!r.clave) continue;
      const prev = byKey.get(r.clave);
      if (!prev) { byKey.set(r.clave, r); continue; }
      if (dupePolicy === 'cheapest' && (r.precio_neto ?? Infinity) < (prev.precio_neto ?? Infinity)) {
        byKey.set(r.clave, r);
      }
    }
    return Array.from(byKey.values());
  }, [rows, duplicateKeys, dupePolicy]);

  const validRowCount = rows.filter(r => r.clave && r.precio_neto != null).length;
  const withExistencia = rows.filter(r => (r.existencia ?? 0) > 0).length;
  const withCorrugado = rows.filter(r => (r.piezas_corrugado ?? 0) > 0).length;

  // ===== Step 3: proveedor =====
  async function elegirProveedor(id: string) {
    setProveedorId(id);
    setConfirmReplace(false);
    const { data } = await supabase
      .from('lista_precio_cargas')
      .select('archivo_nombre, created_at, productos_cargados')
      .eq('proveedor_id', id)
      .order('created_at', { ascending: false })
      .limit(1);
    if (data && data.length) {
      const d = data[0] as any;
      setPrevCarga({
        archivo: d.archivo_nombre,
        fecha: new Date(d.created_at).toLocaleDateString(),
        lineas: d.productos_cargados,
      });
    } else {
      setPrevCarga(null);
    }
  }

  async function crearProveedorNuevo() {
    if (!newProv.nombre.trim()) { toast.error('Nombre requerido'); return; }
    setCreatingProv(true);
    try {
      const payload: any = {
        nombre: newProv.nombre.trim(),
        codigo: (newProv.codigo || newProv.nombre.replace(/[^A-Za-z0-9]/g, '').slice(0, 6)).toUpperCase().trim(),
        plazo_pago_dias: Number(newProv.plazo_pago_dias) || 0,
        lead_time_prometido_dias: newProv.lead_time_dias === '' ? null : Number(newProv.lead_time_dias),
        monto_minimo_pedido: newProv.monto_minimo_pedido === '' ? 0 : Number(newProv.monto_minimo_pedido),
        acepta_devoluciones: !!newProv.acepta_devoluciones,
        notas: `Tipo: ${newProv.tipo}`,
        activo: true,
      };
      const { data, error } = await supabase.from('proveedores').insert(payload).select('id, codigo, nombre').single();
      if (error) throw error;
      setProveedores(prev => [...prev, data as Proveedor].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setProveedorId((data as any).id);
      setProveedorMode('existing');
      setPrevCarga(null);
      setConfirmReplace(true);
      toast.success('Proveedor creado');
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setCreatingProv(false);
    }
  }

  // ===== Step 4: verify catalog =====
  async function verificarCatalogo() {
    setVerifying(true);
    try {
      const claves = Array.from(new Set(resolvedRows.map(r => r.clave).filter(Boolean)));
      const map = new Map<string, string>();
      const CHUNK = 800;
      for (let i = 0; i < claves.length; i += CHUNK) {
        const slice = claves.slice(i, i + CHUNK);
        const { data, error } = await supabase.rpc('verificar_productos_lista', { p_claves: slice });
        if (error) throw error;
        for (const r of (data as any[]) || []) {
          if (r.existe) map.set(r.clave, r.producto_id);
        }
      }
      setExistingKeys(map);
      setStep(4);
    } catch (e: any) {
      toast.error('Error verificando catálogo: ' + e.message);
    } finally {
      setVerifying(false);
    }
  }

  const nuevos = resolvedRows.filter(r => r.clave && !existingKeys.has(r.clave));
  const encontrados = resolvedRows.filter(r => r.clave && existingKeys.has(r.clave));

  // ===== Step 5: commit =====
  async function confirmar() {
    setCommitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id ?? null;

      // 1. Create carga
      const { data: cargaRow, error: cargaErr } = await supabase
        .from('lista_precio_cargas')
        .insert({
          proveedor_id: proveedorId,
          archivo_nombre: fileName,
          fecha_vigencia_desde: new Date().toISOString().slice(0, 10),
          precio_incluye_iva: false,
          iva_tasa_default: 16,
          reemplaza_carga_anterior: true,
          cargado_por: userId,
        } as any)
        .select('id')
        .single();
      if (cargaErr) throw cargaErr;
      const cargaId = (cargaRow as any).id;

      // 2. Insert new productos (if accepted)
      const keyToProd = new Map(existingKeys);
      let nuevosCreados = 0;
      if (acceptNew && nuevos.length) {
        const inserts = nuevos.map(r => ({
          sku: r.clave,
          codigo_barras: /^\d{8,}$/.test(r.clave) ? r.clave : null,
          nombre: r.descripcion,
          descripcion: r.descripcion,
          precio_base: 0,
          estatus: 'N',
          departamento: 'POR ASIGNAR',
          clasificacion: 'DESCLASIFICADO',
          activo: true,
        }));
        for (let i = 0; i < inserts.length; i += 200) {
          const slice = inserts.slice(i, i + 200);
          const { data: created, error } = await supabase
            .from('productos')
            .insert(slice as any)
            .select('id, sku, codigo_barras');
          if (error) throw error;
          for (const p of (created || []) as any[]) {
            const key = p.codigo_barras || p.sku;
            if (key) keyToProd.set(String(key), p.id);
            nuevosCreados++;
          }
        }
      }

      // 3. Deactivate prior list for this proveedor
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      await supabase
        .from('lista_precio_proveedor')
        .update({ activo: false, fecha_vigencia_hasta: yesterday.toISOString().slice(0, 10) } as any)
        .eq('proveedor_id', proveedorId)
        .eq('activo', true);

      // 4. Insert price rows
      const hoy = new Date().toISOString().slice(0, 10);
      const toInsert: any[] = [];
      for (const r of resolvedRows) {
        const pid = keyToProd.get(r.clave);
        if (!pid || r.precio_neto == null) continue;
        const ivaPct = (r.iva_pct ?? 16) / 100;
        toInsert.push({
          proveedor_id: proveedorId,
          producto_id: pid,
          precio: r.precio_neto,
          precio_con_iva: r.precio_neto * (1 + ivaPct),
          existencia_proveedor: r.existencia ?? 0,
          cantidad_min: 1,
          fecha_vigencia_desde: hoy,
          carga_id: cargaId,
          activo: true,
        });
      }
      let preciosInsertados = 0;
      for (let i = 0; i < toInsert.length; i += 500) {
        const slice = toInsert.slice(i, i + 500);
        const { error, count } = await supabase
          .from('lista_precio_proveedor')
          .insert(slice as any, { count: 'exact' });
        if (error) throw error;
        preciosInsertados += count ?? slice.length;
      }

      // 5. Insert ofertas
      const ofertas: any[] = [];
      for (const r of resolvedRows) {
        const pid = keyToProd.get(r.clave);
        if (!pid) continue;
        if (r.precio_oferta != null && r.oferta_inicio && r.oferta_fin) {
          ofertas.push({
            proveedor_id: proveedorId,
            producto_id: pid,
            precio_oferta: r.precio_oferta,
            fecha_inicio: r.oferta_inicio,
            fecha_fin: r.oferta_fin,
            activo: true,
          });
        }
      }
      let ofertasInsertadas = 0;
      for (let i = 0; i < ofertas.length; i += 500) {
        const slice = ofertas.slice(i, i + 500);
        const { error, count } = await supabase.from('ofertas_proveedor').insert(slice as any, { count: 'exact' });
        if (error) throw error;
        ofertasInsertadas += count ?? slice.length;
      }

      // 6. Insert corrugado
      const corrugados = resolvedRows.filter(r => keyToProd.has(r.clave) && (r.piezas_corrugado ?? 0) > 0).map(r => ({
        producto_id: keyToProd.get(r.clave)!,
        piezas_por_corrugado: r.piezas_corrugado,
      }));
      if (corrugados.length) {
        try {
          await supabase.from('producto_corrugado').upsert(corrugados as any, { onConflict: 'producto_id' });
        } catch { /* opcional */ }
      }

      // 7. Update counters
      await supabase.from('lista_precio_cargas').update({
        productos_cargados: preciosInsertados,
        productos_actualizados: encontrados.length,
        productos_omitidos: rows.length - resolvedRows.length,
        productos_autocreados: nuevosCreados,
      } as any).eq('id', cargaId);

      setResumen({ cargaId, precios: preciosInsertados, nuevos: nuevosCreados, ofertas: ofertasInsertadas });
      setStep(5);
      toast.success(`Lista cargada: ${preciosInsertados} precios`);
      onDone?.();
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setCommitting(false);
    }
  }

  function reset() {
    setStep(1); setFileName(''); setRows([]); setErrors([]); setDuplicateKeys([]);
    setProveedorId(''); setProveedorMode('existing'); setPrevCarga(null); setConfirmReplace(false);
    setExistingKeys(new Map()); setAcceptNew(true); setResumen(null);
  }

  // ============= RENDER =============
  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-2 text-xs">
        {[
          { n: 1, label: 'Archivo' },
          { n: 2, label: 'Validación' },
          { n: 3, label: 'Proveedor' },
          { n: 4, label: 'Confirmar' },
        ].map(({ n, label }) => (
          <div key={n} className={`flex items-center gap-1 ${step >= n ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] ${step > n ? 'bg-primary text-primary-foreground' : step === n ? 'bg-primary/20 border border-primary' : 'bg-muted'}`}>
              {step > n ? <Check className="h-3 w-3" /> : n}
            </div>
            <span>{label}</span>
            {n < 4 && <ChevronRight className="h-3 w-3" />}
          </div>
        ))}
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" />Paso 1 — Plantilla y archivo</h3>
                <p className="text-sm text-muted-foreground">El archivo debe tener exactamente las columnas de la plantilla. No detectamos formatos automáticamente.</p>
              </div>
              <Button variant="outline" size="lg" onClick={downloadPlantilla}>
                <Download className="h-4 w-4 mr-2" />Descargar plantilla
              </Button>
            </div>

            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault(); setDragOver(false);
                const f = e.dataTransfer.files?.[0]; if (f) leerArchivo(f);
              }}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}
            >
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium">Sube tu archivo aquí</p>
              <p className="text-sm text-muted-foreground mt-1">Arrastra el .xlsx o haz clic para seleccionar</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) leerArchivo(f); e.target.value = ''; }} />
            </div>

            <div className="text-xs text-muted-foreground border-l-2 border-blue-500 pl-3">
              <p className="font-semibold mb-1">Columnas requeridas:</p>
              <p>{REQUIRED_HEADERS.join(' · ')}</p>
              <p className="font-semibold mt-2 mb-1">Columnas opcionales:</p>
              <p>{OPTIONAL_HEADERS.join(' · ')}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Paso 2 — Validación automática</h3>
              <Button variant="ghost" size="sm" onClick={reset}><ArrowLeft className="h-4 w-4 mr-1" />Cambiar archivo</Button>
            </div>
            <p className="text-xs text-muted-foreground">Archivo: <span className="font-mono">{fileName}</span></p>

            {errors.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-red-600">
                  <XCircle className="h-5 w-5" />
                  <span className="font-semibold">Validación falló — {errors.length} errores</span>
                </div>
                <div className="max-h-72 overflow-auto border rounded-md">
                  <Table>
                    <TableHeader><TableRow><TableHead>Línea</TableHead><TableHead>Campo</TableHead><TableHead>Mensaje</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {errors.slice(0, 300).map((e, i) => (
                        <TableRow key={i}><TableCell className="text-xs">{e.fila}</TableCell><TableCell className="text-xs font-mono">{e.campo}</TableCell><TableCell className="text-xs text-red-600">{e.mensaje}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={descargarErroresCSV}><Download className="h-4 w-4 mr-2" />Descargar errores (CSV)</Button>
                  <Button variant="outline" onClick={reset}>Subir otro archivo</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-semibold">Archivo válido</span>
                </div>
                <div className="flex gap-2 flex-wrap text-sm">
                  <Badge variant="outline" className="text-base py-1">{rows.length} productos detectados</Badge>
                  <Badge variant="outline" className="text-base py-1">{validRowCount} con precio</Badge>
                  <Badge variant="outline" className="text-base py-1">{withExistencia} con existencia</Badge>
                  <Badge variant="outline" className="text-base py-1">{withCorrugado} con corrugado</Badge>
                </div>

                {duplicateKeys.length > 0 && (
                  <div className="border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20 rounded-md p-3 space-y-2">
                    <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                      <AlertCircle className="h-4 w-4" />
                      <span className="font-semibold">{duplicateKeys.length} claves duplicadas</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Ejemplos: {duplicateKeys.slice(0, 6).join(', ')}{duplicateKeys.length > 6 ? '…' : ''}</p>
                    <RadioGroup value={dupePolicy} onValueChange={v => setDupePolicy(v as DuplicatePolicy)} className="space-y-1">
                      <div className="flex items-center space-x-2"><RadioGroupItem value="first" id="d1" /><Label htmlFor="d1" className="text-sm">Usar el primer precio encontrado</Label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="cheapest" id="d2" /><Label htmlFor="d2" className="text-sm">Usar el precio MÁS BARATO</Label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="cancel" id="d3" /><Label htmlFor="d3" className="text-sm">Cancelar y corregir el archivo</Label></div>
                    </RadioGroup>
                  </div>
                )}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={reset}><ArrowLeft className="h-4 w-4 mr-1" />Cambiar archivo</Button>
                  <Button
                    disabled={dupePolicy === 'cancel' && duplicateKeys.length > 0}
                    onClick={() => setStep(3)}
                  >Siguiente <ChevronRight className="h-4 w-4 ml-1" /></Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h3 className="font-semibold">Paso 3 — Identificar proveedor</h3>

            <RadioGroup value={proveedorMode} onValueChange={v => setProveedorMode(v as any)} className="flex gap-6">
              <div className="flex items-center space-x-2"><RadioGroupItem value="existing" id="pe" /><Label htmlFor="pe">Proveedor existente</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="new" id="pn" /><Label htmlFor="pn"><Plus className="h-3 w-3 inline mr-1" />Es un proveedor nuevo</Label></div>
            </RadioGroup>

            {proveedorMode === 'existing' && (
              <div className="space-y-3">
                <Input placeholder="Buscar proveedor por nombre o código…" value={proveedorSearch} onChange={e => setProveedorSearch(e.target.value)} />
                <Select value={proveedorId} onValueChange={elegirProveedor}>
                  <SelectTrigger><SelectValue placeholder="Selecciona un proveedor" /></SelectTrigger>
                  <SelectContent>
                    {proveedoresFiltrados.map(p => <SelectItem key={p.id} value={p.id}>{p.codigo ? `[${p.codigo}] ` : ''}{p.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>

                {proveedorActual && (
                  <div className="border rounded-md p-3 bg-muted/30 text-sm space-y-1">
                    <p><span className="text-muted-foreground">Proveedor:</span> <strong>{proveedorActual.nombre}</strong> {proveedorActual.codigo && <span className="text-xs">[{proveedorActual.codigo}]</span>}</p>
                    {prevCarga ? (
                      <>
                        <p className="text-xs text-muted-foreground">Última carga: {prevCarga.archivo} — {prevCarga.fecha} ({prevCarga.lineas} líneas)</p>
                        <div className="border-l-2 border-orange-500 pl-2 mt-2 text-xs">
                          <p>⚠️ Esta es la lista de <strong>{proveedorActual.nombre}</strong>. ¿Quieres ACTUALIZAR su lista de precios? Esto reemplazará las {prevCarga.lineas} líneas actuales.</p>
                          <label className="flex items-center gap-2 mt-2">
                            <Switch checked={confirmReplace} onCheckedChange={setConfirmReplace} />
                            <span>Confirmo el reemplazo</span>
                          </label>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin cargas previas — esta será la primera lista.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {proveedorMode === 'new' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Nombre del proveedor *</Label><Input value={newProv.nombre} onChange={e => setNewProv({ ...newProv, nombre: e.target.value, codigo: newProv.codigo || e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() })} /></div>
                <div><Label>Código corto</Label><Input value={newProv.codigo} onChange={e => setNewProv({ ...newProv, codigo: e.target.value.toUpperCase() })} /></div>
                <div><Label>Tipo</Label>
                  <Select value={newProv.tipo} onValueChange={v => setNewProv({ ...newProv, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Farmacéutico">Farmacéutico</SelectItem>
                      <SelectItem value="Material">Material</SelectItem>
                      <SelectItem value="Equipo">Equipo</SelectItem>
                      <SelectItem value="Otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Días de crédito</Label><Input type="number" value={newProv.plazo_pago_dias} onChange={e => setNewProv({ ...newProv, plazo_pago_dias: Number(e.target.value) })} /></div>
                <div><Label>Lead time (días)</Label><Input type="number" value={newProv.lead_time_dias} onChange={e => setNewProv({ ...newProv, lead_time_dias: e.target.value })} /></div>
                <div><Label>Monto mínimo de pedido</Label><Input type="number" value={newProv.monto_minimo_pedido} onChange={e => setNewProv({ ...newProv, monto_minimo_pedido: e.target.value })} /></div>
                <div className="flex items-center gap-2 mt-6"><Switch checked={newProv.acepta_devoluciones} onCheckedChange={v => setNewProv({ ...newProv, acepta_devoluciones: v })} /><Label>Acepta devoluciones</Label></div>
                <div className="col-span-2 flex justify-end">
                  <Button onClick={crearProveedorNuevo} disabled={creatingProv || !newProv.nombre.trim()}>
                    {creatingProv && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Crear proveedor y continuar
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-1" />Atrás</Button>
              <Button
                disabled={!proveedorId || (!!prevCarga && !confirmReplace) || verifying}
                onClick={verificarCatalogo}
              >
                {verifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Validar contra catálogo <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4 */}
      {step === 4 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h3 className="font-semibold">Paso 4 — Validación contra catálogo</h3>

            <div className="grid md:grid-cols-3 gap-3">
              <div className="border rounded-md p-3 bg-green-50 dark:bg-green-950/20">
                <p className="text-green-800 dark:text-green-300 font-semibold">🟢 Encontrados</p>
                <p className="text-2xl font-bold">{encontrados.length}</p>
                <p className="text-xs text-muted-foreground">Se actualizan precio y existencia</p>
              </div>
              <div className="border rounded-md p-3 bg-yellow-50 dark:bg-yellow-950/20">
                <p className="text-yellow-800 dark:text-yellow-200 font-semibold">🟡 Nuevos</p>
                <p className="text-2xl font-bold">{nuevos.length}</p>
                <p className="text-xs text-muted-foreground">No están en catálogo SANAMEX</p>
              </div>
              <div className="border rounded-md p-3 bg-red-50 dark:bg-red-950/20">
                <p className="text-red-800 dark:text-red-300 font-semibold">🔴 Sin precio</p>
                <p className="text-2xl font-bold">0</p>
                <p className="text-xs text-muted-foreground">Bloqueante (ya validado)</p>
              </div>
            </div>

            {nuevos.length > 0 && (
              <div className="border rounded-md p-3 space-y-2">
                <p className="text-sm font-semibold">Productos NUEVOS — se agregan con estatus='N' (Nuevo), departamento='POR ASIGNAR'</p>
                <div className="max-h-48 overflow-auto text-xs font-mono">
                  {nuevos.slice(0, 10).map(r => <div key={r.clave}>{r.clave} — {r.descripcion}</div>)}
                  {nuevos.length > 10 && <div className="text-muted-foreground">… y {nuevos.length - 10} más</div>}
                </div>
                <label className="flex items-center gap-2 pt-1">
                  <Switch checked={acceptNew} onCheckedChange={setAcceptNew} />
                  <span className="text-sm">Aceptar agregar los {nuevos.length} productos nuevos al catálogo</span>
                </label>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="h-4 w-4 mr-1" />Atrás</Button>
              <Button onClick={confirmar} disabled={committing}>
                {committing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirmar carga
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 5 — result */}
      {step === 5 && resumen && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-6 w-6" />
              <h3 className="font-semibold text-lg">Carga exitosa</h3>
            </div>
            <ul className="text-sm space-y-1">
              <li>✅ {resumen.precios} precios cargados</li>
              <li>🆕 {resumen.nuevos} productos nuevos creados</li>
              <li>🏷️ {resumen.ofertas} ofertas vigentes creadas</li>
              <li className="text-xs text-muted-foreground font-mono">Carga ID: {resumen.cargaId.slice(0, 8)}…</li>
            </ul>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { onDone?.(); }}>Ver listas cargadas</Button>
              <Button onClick={reset}>Cargar otra lista</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
