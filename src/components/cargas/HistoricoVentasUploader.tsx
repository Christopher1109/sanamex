import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Upload, Download, Loader2, AlertTriangle, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import SheetPickerDialog from './SheetPickerDialog';

// =========================================================================
// HISTÓRICO DE VENTAS (CONCENTRADOR)
// - Filtro temporal (default: últimos 90 días desde MAX(fecha del archivo)).
// - Normalizador flexible de headers + HEADER_MAP.
// - Mapeo sucursal legacy con nombres largos.
// - Folio opcional, caja opcional, estatus case-insensitive.
// - 1 venta por fila (sin agrupación). origen='carga_historica'.
// - INSERT directo a ventas + venta_lineas (sin process_pos_sale).
// =========================================================================

type Row = Record<string, any>;

const norm = (v: any) => (v == null ? '' : String(v).trim());
const upper = (v: any) => norm(v).toUpperCase();
const num = (v: any) => {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[$,\s]/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
};

function parseFecha(v: any): Date | null {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    let [, dd, mm, yyyy, hh, mi, ss] = m as any;
    if (yyyy.length === 2) yyyy = '20' + yyyy;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh || 0), Number(mi || 0), Number(ss || 0));
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const fechaDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// --- Fix (a) — mapear sucursal con nombres largos -----------------------
function mapearSucursal(codigo: string): string | null {
  const c = upper(codigo);
  switch (c) {
    case '': return null;
    case 'F37': return 'F36';
    case 'F35': return null;
    case 'IZTAPALAPA': return null;
    case 'SAN VICENTE': return 'SV';
    case 'ECATEPEC': return 'ECA';
    case 'IZTAPALAPA F37': return 'F36';
    case 'IZTAPALAPA F35': return null;
    case 'IZTAPALAPA GH': return 'GH';
    case 'IZTAPALAPA H': return 'GH';
    case 'H': return 'GH';
    case 'CEDIS': return 'CEDIS';
    case 'CEDIS CENTRAL': return 'CEDIS';
    default: return c;
  }
}

// --- Fix (b) — Normalizador flexible de headers -------------------------
function normalizeHeader(h: string): string {
  return String(h ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .trim()
    .replace(/\s+/g, '_');
}

const HEADER_MAP: Record<string, string> = {
  'sucursal': 'sucursal',
  'estatus': 'estatus', 'estado': 'estatus', 'status': 'estatus',
  'fecha': 'fecha', 'fecha_venta': 'fecha',
  'hora': 'hora',
  'folio': 'folio', 'numero': 'folio', 'no': 'folio',
  'cliente': 'cliente', 'nombre_cliente': 'cliente',
  'clave_articulo': 'clave', 'clave': 'clave', 'sku': 'clave',
  'codigo_barras': 'clave', 'codigo': 'clave', 'codigo_de_barras': 'clave',
  'descripcion': 'descripcion', 'producto': 'descripcion',
  'caja': 'caja', 'no_caja': 'caja',
  'usuario': 'usuario', 'user': 'usuario',
  'vendedor': 'vendedor', 'seller': 'vendedor',
  'cantidad_vendida': 'cantidad', 'cantidad': 'cantidad', 'qty': 'cantidad', 'piezas': 'cantidad',
  'precio_unitario_compra': 'costo', 'costo_unitario': 'costo', 'costo': 'costo', 'cu': 'costo',
  'precio_unitario_venta': 'precio', 'precio_unitario': 'precio', 'precio': 'precio', 'pu': 'precio',
  'total_venta': 'subtotal', 'subtotal': 'subtotal', 'importe': 'subtotal', 'total_linea': 'subtotal',
  'total_compra': 'costo_total',
  'utilidad': 'utilidad', 'margen': 'margen',
  'lp1': 'lp1', 'lp2': 'lp2', 'lp3': 'lp3', 'lp4': 'lp4',
  'lista_de_precios': 'lista_precio', 'lista_precio': 'lista_precio', 'lista': 'lista_precio',
};

// Devuelve un row "canonicalizado" con keys del HEADER_MAP.
function canon(row: Row): Row {
  const out: Row = {};
  for (const k of Object.keys(row)) {
    const nk = normalizeHeader(k);
    const mapped = HEADER_MAP[nk];
    if (mapped && (out[mapped] === undefined || out[mapped] === '')) out[mapped] = row[k];
  }
  return out;
}

type ParsedLinea = {
  fila: number;
  sucursal_codigo: string;
  sucursal_id: string;
  fecha_iso: string;
  fecha_full: Date;
  folio: string;
  caja: string;
  clave: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  costo_unitario: number;
  lista_precio: string | null;
  cliente_nombre: string;
  usuario: string;
  vendedor: string;
};

type OmitidaRow = { fila: number; motivo: string; clave?: string };
type NoMatchRow = { clave: string; descripcion: string; ocurrencias: number };

type CabeceraAgg = {
  key: string;
  sucursal_id: string;
  sucursal_codigo: string;
  fecha_iso: string;
  fecha_full: Date;
  folio: string;
  caja: string;
  cliente_nombre: string;
  usuario: string;
  vendedor: string;
  lista_precio: string | null;
  lineas: ParsedLinea[];
  subtotal: number;
  yaExiste: boolean;
  numero_venta?: string;
};

type DatePreset = '30' | '60' | '90' | 'all' | 'custom';

export default function HistoricoVentasUploader({ onDone }: { onDone?: () => void }) {
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState('');
  const [committing, setCommitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [cabeceras, setCabeceras] = useState<CabeceraAgg[]>([]);
  const [omitidas, setOmitidas] = useState<OmitidaRow[]>([]);
  const [filtradasTemporal, setFiltradasTemporal] = useState(0);
  const [noMatch, setNoMatch] = useState<NoMatchRow[]>([]);
  const [totalFilas, setTotalFilas] = useState(0);
  const [rangoAplicado, setRangoAplicado] = useState<{ from: string; to: string; label: string } | null>(null);

  const [pickerFile, setPickerFile] = useState<File | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Date filter dialog state
  const [dateDlgOpen, setDateDlgOpen] = useState(false);
  const [pendingRows, setPendingRows] = useState<Row[]>([]);
  const [pendingFileName, setPendingFileName] = useState('');
  const [maxFileDate, setMaxFileDate] = useState<Date | null>(null);
  const [minFileDate, setMinFileDate] = useState<Date | null>(null);
  const [preset, setPreset] = useState<DatePreset>('90');
  const [customFrom, setCustomFrom] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  const fromDate = useMemo(() => {
    if (!maxFileDate) return null;
    if (preset === 'all') return null;
    if (preset === 'custom') {
      if (!customFrom) return null;
      const d = new Date(customFrom + 'T00:00:00');
      return isNaN(d.getTime()) ? null : d;
    }
    const days = Number(preset);
    const d = new Date(maxFileDate);
    d.setDate(d.getDate() - days);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [preset, customFrom, maxFileDate]);

  const filasEnRango = useMemo(() => {
    if (!pendingRows.length) return 0;
    if (!fromDate) return pendingRows.length;
    let n = 0;
    for (const r of pendingRows) {
      const c = canon(r);
      const f = parseFecha(c.fecha);
      if (f && f.getTime() >= fromDate.getTime()) n++;
    }
    return n;
  }, [pendingRows, fromDate]);

  const descargarPlantilla = () => {
    const ws = XLSX.utils.json_to_sheet([{
      'Sucursal': 'SV', 'Fecha': '01/10/2025 14:35', 'Folio': '12345', 'Caja': '1',
      'Clave Articulo': '7501000000001', 'Descripcion': 'PARACETAMOL 500MG',
      'Cantidad Vendida': 2, 'Precio Unitario Venta': 45.5, 'Precio Unitario Compra': 30,
      'Total Venta': 91, 'Estatus': 'Vigente', 'Lista de Precios': 'LP1',
      'Cliente': 'PUBLICO EN GENERAL', 'Usuario': 'cajero01', 'Vendedor': 'cajero01',
    }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'historico');
    XLSX.writeFile(wb, 'plantilla_historico_ventas.xlsx');
  };

  const descargarNoMatch = () => {
    if (!noMatch.length) return;
    const ws = XLSX.utils.json_to_sheet(noMatch.map((r) => ({
      clave: r.clave, descripcion: r.descripcion, ocurrencias: r.ocurrencias,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'no_encontrados');
    XLSX.writeFile(wb, `productos_no_encontrados_${fileName.replace(/\.[^.]+$/, '')}.xlsx`);
  };

  // Paso 1: leer hoja → calcular MAX/MIN fecha → abrir diálogo de filtro temporal.
  const onSheetConfirm = (wb: XLSX.WorkBook, sheetName: string, name: string) => {
    setProgress(`Leyendo hoja "${sheetName}"...`);
    try {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) { toast.error(`Hoja "${sheetName}" no encontrada`); setProgress(''); return; }
      const raw: Row[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
      if (!raw.length) { toast.error('La hoja está vacía'); setProgress(''); return; }
      let maxD: Date | null = null;
      let minD: Date | null = null;
      for (const r of raw) {
        const c = canon(r);
        const f = parseFecha(c.fecha);
        if (!f) continue;
        if (!maxD || f.getTime() > maxD.getTime()) maxD = f;
        if (!minD || f.getTime() < minD.getTime()) minD = f;
      }
      if (!maxD) { toast.error('No se detectaron fechas válidas en la hoja'); setProgress(''); return; }
      setPendingRows(raw);
      setPendingFileName(name);
      setMaxFileDate(maxD);
      setMinFileDate(minD);
      setPreset('90');
      setCustomFrom('');
      setProgress('');
      setDateDlgOpen(true);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Error leyendo archivo');
      setProgress('');
    }
  };

  // Paso 2: procesar con filtro temporal.
  const procesarArchivo = async (raw: Row[], from: Date | null, name: string, presetLabel: string) => {
    setFileName(name);
    setTotalFilas(raw.length);
    try {
      // 1) Sucursales
      setProgress('Cargando catálogo de sucursales...');
      const { data: sucData, error: sucErr } = await supabase
        .from('sucursales').select('id, codigo, activo').eq('activo', true);
      if (sucErr) throw sucErr;
      const sucByCodigo = new Map<string, string>();
      (sucData || []).forEach((s: any) => sucByCodigo.set(upper(s.codigo), s.id));

      const omit: OmitidaRow[] = [];
      let fueraRango = 0;
      type Stage = {
        fila: number; raw: Row;
        sucursal_id: string; sucursal_codigo: string;
        fecha_full: Date; fecha_iso: string;
        folio: string; caja: string;
        clave: string; descripcion: string;
        cantidad: number; precio_unitario: number; costo_unitario: number; subtotal: number;
        lista_precio: string | null;
        cliente_nombre: string; usuario: string; vendedor: string;
      };
      const stage: Stage[] = [];

      setProgress(`Validando ${raw.length.toLocaleString()} filas...`);
      raw.forEach((r, idx) => {
        const fila = idx + 2;
        const c = canon(r);

        // Filtro temporal PRIMERO
        const fechaFull = parseFecha(c.fecha);
        if (!fechaFull) {
          omit.push({ fila, motivo: 'Fecha vacía o no parseable' });
          return;
        }
        if (from && fechaFull.getTime() < from.getTime()) {
          fueraRango++;
          return;
        }

        // Fix (c): Estatus case-insensitive
        const estatus = upper(c.estatus);
        if (estatus && estatus !== 'VIGENTE') {
          omit.push({ fila, motivo: `Estatus="${estatus}" (solo Vigente)` });
          return;
        }
        const sucCodRaw = norm(c.sucursal);
        const sucCod = mapearSucursal(sucCodRaw);
        if (!sucCod) {
          omit.push({ fila, motivo: `Sucursal "${sucCodRaw}" omitida (mapeo legacy)` });
          return;
        }
        const sucId = sucByCodigo.get(sucCod);
        if (!sucId) {
          omit.push({ fila, motivo: `Sucursal "${sucCod}" no existe activa en BD` });
          return;
        }
        const clave = norm(c.clave);
        if (!clave) {
          omit.push({ fila, motivo: 'Clave de producto vacía' });
          return;
        }
        const cantidad = num(c.cantidad);
        if (cantidad <= 0) {
          omit.push({ fila, motivo: `Cantidad inválida: ${cantidad}` });
          return;
        }
        const precio = num(c.precio);
        const costo = num(c.costo);
        const subtotal = num(c.subtotal) || cantidad * precio;

        stage.push({
          fila, raw: r,
          sucursal_id: sucId, sucursal_codigo: sucCod,
          fecha_full: fechaFull, fecha_iso: fechaDia(fechaFull),
          folio: norm(c.folio), caja: norm(c.caja),
          clave, descripcion: norm(c.descripcion),
          cantidad, precio_unitario: precio, costo_unitario: costo, subtotal,
          lista_precio: norm(c.lista_precio) || null,
          cliente_nombre: norm(c.cliente),
          usuario: norm(c.usuario),
          vendedor: norm(c.vendedor),
        });
      });

      // 3) Match productos por clave (chunked)
      const claves = Array.from(new Set(stage.map((s) => s.clave)));
      const CHUNK = 250;
      const totalLotes = Math.max(1, Math.ceil(claves.length / CHUNK));
      const prodById = new Map<string, any>();
      for (let i = 0; i < claves.length; i += CHUNK) {
        const loteNum = Math.floor(i / CHUNK) + 1;
        setProgress(`Matching productos: lote ${loteNum}/${totalLotes} (${claves.length} claves)...`);
        const slice = claves.slice(i, i + CHUNK);
        const [a, b] = await Promise.all([
          supabase.from('productos').select('id, sku, codigo_barras, nombre').in('sku', slice),
          supabase.from('productos').select('id, sku, codigo_barras, nombre').in('codigo_barras', slice),
        ]);
        if (a.error || b.error) throw new Error(`Match lote ${loteNum}: ${a.error?.message || b.error?.message}`);
        [...(a.data || []), ...(b.data || [])].forEach((p: any) => prodById.set(p.id, p));
      }
      const prodByClave = new Map<string, any>();
      prodById.forEach((p) => {
        if (p.codigo_barras) prodByClave.set(String(p.codigo_barras), p);
        if (p.sku && !prodByClave.has(String(p.sku))) prodByClave.set(String(p.sku), p);
      });

      // 4) Separar matched vs no-match. UNA venta por fila.
      const lineas: ParsedLinea[] = [];
      const noMatchMap = new Map<string, NoMatchRow>();
      for (const s of stage) {
        const p = prodByClave.get(s.clave);
        if (!p) {
          const ex = noMatchMap.get(s.clave);
          if (ex) ex.ocurrencias++;
          else noMatchMap.set(s.clave, { clave: s.clave, descripcion: s.descripcion, ocurrencias: 1 });
          omit.push({ fila: s.fila, clave: s.clave, motivo: 'Producto no encontrado' });
          continue;
        }
        lineas.push({
          fila: s.fila,
          sucursal_codigo: s.sucursal_codigo, sucursal_id: s.sucursal_id,
          fecha_iso: s.fecha_iso, fecha_full: s.fecha_full,
          folio: s.folio, caja: s.caja,
          clave: s.clave, producto_id: p.id,
          cantidad: s.cantidad, precio_unitario: s.precio_unitario,
          subtotal: s.subtotal, costo_unitario: s.costo_unitario,
          lista_precio: s.lista_precio,
          cliente_nombre: s.cliente_nombre, usuario: s.usuario, vendedor: s.vendedor,
        });
      }

      // 5) UNA cabecera por línea. Folio sintético HIST-{suc}-{YYYYMMDD}-{seq:06d}.
      lineas.sort((a, b) =>
        a.sucursal_codigo.localeCompare(b.sucursal_codigo) ||
        a.fecha_iso.localeCompare(b.fecha_iso) ||
        a.fila - b.fila,
      );
      const seqBySucFecha = new Map<string, number>();
      const cabsArr: CabeceraAgg[] = lineas.map((l) => {
        const k = `${l.sucursal_codigo}|${l.fecha_iso}`;
        const next = (seqBySucFecha.get(k) || 0) + 1;
        seqBySucFecha.set(k, next);
        const numero = `HIST-${l.sucursal_codigo}-${l.fecha_iso.replace(/-/g, '')}-${String(next).padStart(6, '0')}`;
        return {
          key: `${l.sucursal_id}|${l.fila}`,
          sucursal_id: l.sucursal_id, sucursal_codigo: l.sucursal_codigo,
          fecha_iso: l.fecha_iso, fecha_full: l.fecha_full,
          folio: l.folio, caja: l.caja,
          cliente_nombre: l.cliente_nombre, usuario: l.usuario, vendedor: l.vendedor,
          lista_precio: l.lista_precio,
          lineas: [l], subtotal: l.subtotal, yaExiste: false,
          numero_venta: numero,
        };
      });

      // 6) Idempotencia
      setProgress('Chequeando idempotencia...');
      const fechasIso = Array.from(new Set(cabsArr.map((c) => c.fecha_iso)));
      const sucIds = Array.from(new Set(cabsArr.map((c) => c.sucursal_id)));
      const minD = fechasIso.length ? fechasIso.reduce((a, b) => (a < b ? a : b)) : null;
      const maxD = fechasIso.length ? fechasIso.reduce((a, b) => (a > b ? a : b)) : null;
      if (minD && maxD && sucIds.length) {
        const { data: existentes, error: exErr } = await supabase
          .from('ventas')
          .select('numero_venta')
          .eq('origen', 'carga_historica')
          .in('sucursal_id', sucIds)
          .gte('fecha', `${minD}T00:00:00`)
          .lte('fecha', `${maxD}T23:59:59`);
        if (exErr) throw exErr;
        const existSet = new Set((existentes || []).map((v: any) => v.numero_venta));
        for (const c of cabsArr) if (existSet.has(c.numero_venta!)) c.yaExiste = true;
      }

      setCabeceras(cabsArr);
      setOmitidas(omit);
      setFiltradasTemporal(fueraRango);
      setNoMatch(Array.from(noMatchMap.values()).sort((a, b) => b.ocurrencias - a.ocurrencias));
      setRangoAplicado({
        from: from ? fechaDia(from) : '—',
        to: maxFileDate ? fechaDia(maxFileDate) : '—',
        label: presetLabel,
      });
      setProgress('');
      setOpen(true);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Error procesando archivo');
      setProgress('');
    }
  };

  const ejecutar = async () => {
    setCommitting(true);
    let ventasInsertadas = 0, lineasInsertadas = 0, ventasDuplicadas = 0;
    const errores: any[] = [];
    try {
      const aInsertar = cabeceras.filter((c) => !c.yaExiste);
      ventasDuplicadas = cabeceras.length - aInsertar.length;

      const ventasChunk = 500;
      const idByKey = new Map<string, string>();
      for (let i = 0; i < aInsertar.length; i += ventasChunk) {
        const slice = aInsertar.slice(i, i + ventasChunk);
        setProgress(`Insertando ventas: ${Math.min(i + slice.length, aInsertar.length)}/${aInsertar.length}`);
        const payload = slice.map((c) => ({
          numero_venta: c.numero_venta,
          sucursal_id: c.sucursal_id,
          cajero_id: null,
          cliente_id: null,
          cliente_nombre_libre: c.cliente_nombre || null,
          usuario_libre: c.usuario || null,
          vendedor_libre: c.vendedor || null,
          caja: c.caja || null,
          fecha: c.fecha_full.toISOString(),
          subtotal: c.subtotal,
          impuestos: 0,
          total: c.subtotal,
          estado: 'completada',
          origen: 'carga_historica',
          lista_precio_aplicada: c.lista_precio || null,
        }));
        const { data, error } = await supabase.from('ventas').insert(payload as any).select('id, numero_venta, sucursal_id');
        if (error) { errores.push({ fase: 'ventas', chunk: i, error: error.message }); continue; }
        (data || []).forEach((v: any) => {
          const c = slice.find((x) => x.numero_venta === v.numero_venta && x.sucursal_id === v.sucursal_id);
          if (c) idByKey.set(c.key, v.id);
        });
        ventasInsertadas += data?.length || 0;
      }

      const allLineas: any[] = [];
      for (const c of aInsertar) {
        const vid = idByKey.get(c.key);
        if (!vid) continue;
        for (const l of c.lineas) {
          allLineas.push({
            venta_id: vid,
            producto_id: l.producto_id,
            lote_id: null,
            cantidad: l.cantidad,
            precio_unitario: l.precio_unitario,
            subtotal: l.subtotal,
            costo_unitario: l.costo_unitario || null,
          });
        }
      }
      const linChunk = 1000;
      for (let i = 0; i < allLineas.length; i += linChunk) {
        const slice = allLineas.slice(i, i + linChunk);
        setProgress(`Insertando líneas: ${Math.min(i + slice.length, allLineas.length)}/${allLineas.length}`);
        const { error, count } = await supabase.from('venta_lineas').insert(slice as any, { count: 'exact' });
        if (error) errores.push({ fase: 'venta_lineas', chunk: i, error: error.message });
        else lineasInsertadas += count || slice.length;
      }

      await supabase.from('cargas_masivas_historico').insert({
        tipo: 'historico_ventas',
        nombre_archivo: fileName,
        total_filas: totalFilas,
        filas_ok: lineasInsertadas,
        filas_error: errores.length + omitidas.length,
        errores: (errores.length || omitidas.length)
          ? [
              ...errores,
              { info: `filtradas_por_rango_temporal: ${filtradasTemporal}` },
              ...omitidas.slice(0, 50).map((o) => ({ fila: o.fila, clave: o.clave, error: o.motivo })),
            ].slice(0, 100)
          : null,
      });

      toast.success(`Histórico: ${ventasInsertadas} ventas · ${lineasInsertadas} líneas · ${ventasDuplicadas} duplicadas · ${errores.length} errores`);
      setOpen(false);
      setCabeceras([]); setOmitidas([]); setNoMatch([]); setFiltradasTemporal(0);
      onDone?.();
    } catch (e: any) {
      toast.error(e.message || 'Error en la importación');
    } finally {
      setProgress('');
      setCommitting(false);
    }
  };

  const cabsNuevas = cabeceras.filter((c) => !c.yaExiste);
  const cabsDup = cabeceras.length - cabsNuevas.length;
  const lineasTotal = cabsNuevas.reduce((s, c) => s + c.lineas.length, 0);
  const importeTotal = cabsNuevas.reduce((s, c) => s + c.subtotal, 0);
  const fechasRango = cabeceras.length
    ? {
        min: cabeceras.reduce((a, c) => (a < c.fecha_iso ? a : c.fecha_iso), cabeceras[0].fecha_iso),
        max: cabeceras.reduce((a, c) => (a > c.fecha_iso ? a : c.fecha_iso), cabeceras[0].fecha_iso),
      }
    : null;
  const sucursalesUnicas = Array.from(new Set(cabeceras.map((c) => c.sucursal_codigo))).sort();

  const presetLabel = (p: DatePreset) =>
    p === '30' ? 'Últimos 30 días' :
    p === '60' ? 'Últimos 60 días' :
    p === '90' ? 'Últimos 90 días' :
    p === 'all' ? 'Todo el histórico' : 'Personalizado';

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Cargador Histórico de Ventas (Concentrador)</p>
        <ul className="text-xs text-muted-foreground mt-2 space-y-1">
          <li>• Selector de rango temporal: <b>últimos 90 días por default</b> (base = MAX fecha del archivo).</li>
          <li>• Mapeo sucursal: <code>F37→F36</code>, <code>San Vicente→SV</code>, <code>Ecatepec→ECA</code>, <code>F35/Iztapalapa→OMIT</code>.</li>
          <li>• Headers flexibles: acepta <code>Clave Articulo</code>, <code>Cantidad Vendida</code>, <code>Precio Unitario Venta</code>, etc.</li>
          <li>• Folio y caja opcionales. <b>Una venta por fila</b> con <code>origen='carga_historica'</code>.</li>
          <li>• Idempotente: re-subir el mismo archivo + rango no duplica.</li>
        </ul>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={descargarPlantilla}>
          <Download className="h-4 w-4 mr-2" />Descargar plantilla
        </Button>
        <Button onClick={() => fileRef.current?.click()} disabled={!!progress}>
          {progress ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          {progress || 'Subir Excel'}
        </Button>
        <input
          ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPickerFile(f); setPickerOpen(true); } e.target.value = ''; }}
        />
      </div>

      <SheetPickerDialog
        file={pickerFile}
        open={pickerOpen}
        preferred={['BD']}
        cellDates
        onCancel={() => { setPickerOpen(false); setPickerFile(null); }}
        onConfirm={(wb, sheetName, name) => { setPickerOpen(false); setPickerFile(null); onSheetConfirm(wb, sheetName, name); }}
      />

      {/* Date filter dialog */}
      <Dialog open={dateDlgOpen} onOpenChange={(o) => { if (!o) setDateDlgOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" /> Cargar ventas desde…
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3 bg-muted/30 space-y-1 text-xs">
              <div>Archivo: <span className="font-mono">{pendingFileName}</span></div>
              <div>Fechas en archivo: <b>{minFileDate ? fechaDia(minFileDate) : '—'}</b> → <b>{maxFileDate ? fechaDia(maxFileDate) : '—'}</b></div>
              <div>Total filas leídas: <b>{pendingRows.length.toLocaleString()}</b></div>
            </div>
            <RadioGroup value={preset} onValueChange={(v) => setPreset(v as DatePreset)} className="space-y-2">
              {(['30', '60', '90', 'all', 'custom'] as DatePreset[]).map((p) => (
                <div key={p} className="flex items-center gap-2">
                  <RadioGroupItem id={`pr-${p}`} value={p} />
                  <Label htmlFor={`pr-${p}`} className="cursor-pointer font-normal">
                    {presetLabel(p)}
                    {p !== 'all' && p !== 'custom' && maxFileDate && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        (desde {fechaDia(new Date(maxFileDate.getTime() - Number(p) * 86400000))})
                      </span>
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {preset === 'custom' && (
              <div className="pl-6">
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="max-w-xs" />
              </div>
            )}
            <div className="rounded-md border p-3 text-xs">
              <div>Filtro aplicado: <b>{presetLabel(preset)}</b>{fromDate && <> (desde <span className="font-mono">{fechaDia(fromDate)}</span>)</>}</div>
              <div>Filas en rango: <b className="text-green-600">{filasEnRango.toLocaleString()}</b> de {pendingRows.length.toLocaleString()}</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDateDlgOpen(false)}>Cancelar</Button>
            <Button
              disabled={preset === 'custom' && !fromDate}
              onClick={() => {
                setDateDlgOpen(false);
                procesarArchivo(pendingRows, fromDate, pendingFileName, presetLabel(preset));
              }}
            >
              Procesar {filasEnRango.toLocaleString()} filas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Vista previa — Histórico de Ventas ({fileName})</DialogTitle>
          </DialogHeader>

          {rangoAplicado && (
            <div className="rounded-md border p-3 bg-muted/30 text-xs space-y-1">
              <div>Filtro aplicado: <b>{rangoAplicado.label}</b> (desde <span className="font-mono">{rangoAplicado.from}</span>)</div>
              <div>Filas en archivo: <b>{totalFilas.toLocaleString()}</b> · Filas fuera de rango: <b className="text-muted-foreground">{filtradasTemporal.toLocaleString()}</b> · Filas en rango procesadas: <b>{(totalFilas - filtradasTemporal).toLocaleString()}</b></div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground text-xs">Ventas nuevas</div>
              <div className="text-2xl font-bold text-green-600">{cabsNuevas.length.toLocaleString()}</div>
              {cabsDup > 0 && <div className="text-xs text-amber-600">+ {cabsDup} ya existían</div>}
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground text-xs">Líneas a insertar</div>
              <div className="text-2xl font-bold text-blue-600">{lineasTotal.toLocaleString()}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground text-xs">Filas omitidas</div>
              <div className="text-2xl font-bold text-red-600">{omitidas.length.toLocaleString()}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground text-xs">Importe total</div>
              <div className="text-2xl font-bold">${importeTotal.toLocaleString('es-MX', { maximumFractionDigits: 2 })}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground text-xs">Rango de fechas (procesadas)</div>
              <div className="font-mono">{fechasRango ? `${fechasRango.min} → ${fechasRango.max}` : '—'}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground text-xs">Sucursales detectadas</div>
              <div className="font-mono">{sucursalesUnicas.join(', ') || '—'}</div>
            </div>
          </div>

          {noMatch.length > 0 && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/5 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-semibold">
                    {noMatch.length.toLocaleString()} claves del Excel sin match en productos
                  </span>
                </div>
                <Button size="sm" variant="outline" onClick={descargarNoMatch}>
                  <Download className="h-3 w-3 mr-1" />Descargar lista
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Revisa este listado antes de confirmar. Las filas con clave no encontrada se omiten.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-semibold">Muestra (primeras 50 ventas):</p>
            <div className="max-h-[35vh] overflow-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folio sintético</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Caja</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cabeceras.slice(0, 50).map((c) => (
                    <TableRow key={c.key}>
                      <TableCell className="font-mono text-xs">{c.numero_venta}</TableCell>
                      <TableCell>{c.sucursal_codigo}</TableCell>
                      <TableCell className="text-xs">{c.fecha_iso}</TableCell>
                      <TableCell>{c.caja || '—'}</TableCell>
                      <TableCell className="text-right">{c.lineas[0]?.cantidad}</TableCell>
                      <TableCell className="text-right">${c.subtotal.toFixed(2)}</TableCell>
                      <TableCell>
                        {c.yaExiste
                          ? <Badge variant="outline">Ya existe</Badge>
                          : <Badge className="bg-green-600">Nueva</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {progress && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> {progress}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={committing}>Cancelar</Button>
            <Button onClick={ejecutar} disabled={committing || cabsNuevas.length === 0}>
              {committing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Importar {cabsNuevas.length.toLocaleString()} ventas / {lineasTotal.toLocaleString()} líneas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
