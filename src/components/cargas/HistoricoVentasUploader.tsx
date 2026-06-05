import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import SheetPickerDialog from './SheetPickerDialog';

// =========================================================================
// HISTÓRICO DE VENTAS (CONCENTRADOR)
// =========================================================================
// - Match producto por codigo_barras O sku.
// - Filtro Estatus = 'Vigente'.
// - mapear_sucursal_legacy: F35 -> OMIT, F37 -> F36.
// - Agrupación (sucursal, fecha-día, folio, caja) -> 1 venta + N líneas.
// - INSERT directo (no process_pos_sale, no trigger inventario).
// - Idempotencia: pre-check de (sucursal_id, fecha, numero_venta) +
//   índice único parcial ventas_hist_idem como red de seguridad.
// - origen = 'carga_historica' en TODAS las filas.
// =========================================================================

type Row = Record<string, any>;

const norm = (v: any) => (v == null ? '' : String(v).trim());
const upper = (v: any) => norm(v).toUpperCase();
const num = (v: any) => {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[$,\s]/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
};

// Acepta Date, número Excel serial o string.
function parseFecha(v: any): Date | null {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    // Excel serial
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  // dd/mm/yyyy hh:mm[:ss]
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

// Mapeo sucursal legacy (espejo de la función SQL).
function mapearSucursal(codigo: string): string | null {
  const c = upper(codigo);
  if (c === 'F37') return 'F36';
  if (c === 'F35' || c === 'IZTAPALAPA' || c === '') return null;
  return c;
}

// Buscar valor por varias posibles columnas (case-insensitive, normalizado).
function pick(row: Row, ...keys: string[]): any {
  const lc: Record<string, any> = {};
  for (const k of Object.keys(row)) lc[k.toLowerCase().trim()] = row[k];
  for (const k of keys) {
    const v = lc[k.toLowerCase().trim()];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

type ParsedLinea = {
  fila: number;
  sucursal_codigo: string;
  sucursal_id: string;
  fecha_iso: string;             // YYYY-MM-DD
  fecha_full: Date;              // timestamp completo
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

type OmitidaRow = { fila: number; motivo: string; clave?: string; raw: Row };
type NoMatchRow = { clave: string; descripcion: string; ocurrencias: number };

type CabeceraAgg = {
  key: string;                   // sucursal_id|fecha_iso|folio|caja
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
};

export default function HistoricoVentasUploader({ onDone }: { onDone?: () => void }) {
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState('');
  const [committing, setCommitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [cabeceras, setCabeceras] = useState<CabeceraAgg[]>([]);
  const [omitidas, setOmitidas] = useState<OmitidaRow[]>([]);
  const [noMatch, setNoMatch] = useState<NoMatchRow[]>([]);
  const [totalFilas, setTotalFilas] = useState(0);
  const [pickerFile, setPickerFile] = useState<File | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const descargarPlantilla = () => {
    const ws = XLSX.utils.json_to_sheet([{
      'Sucursal': 'SV', 'Fecha': '01/10/2025 14:35', 'Folio': '12345', 'Caja': '1',
      'Clave': '7501000000001', 'Descripción': 'PARACETAMOL 500MG',
      'Cantidad': 2, 'Precio Unitario': 45.5, 'Costo Unitario': 30, 'Subtotal': 91,
      'Estatus': 'Vigente', 'Lista de Precios': 'LP1',
      'Cliente': 'PÚBLICO EN GENERAL', 'Usuario': 'cajero01', 'Vendedor': 'cajero01',
      'LP1': 45.5, 'LP2': 42, 'LP3': 40, 'LP4': 38,
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

  const procesarArchivo = async (wb: XLSX.WorkBook, sheetName: string, name: string) => {
    setFileName(name);
    setProgress(`Leyendo hoja "${sheetName}"...`);
    try {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) { toast.error(`Hoja "${sheetName}" no encontrada`); setProgress(''); return; }
      const raw: Row[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
      if (!raw.length) { toast.error('La hoja seleccionada está vacía'); setProgress(''); return; }
      setTotalFilas(raw.length);

      // 1) Cargar sucursales -> codigo->id
      setProgress('Cargando catálogo de sucursales...');
      const { data: sucData, error: sucErr } = await supabase
        .from('sucursales').select('id, codigo, activo').eq('activo', true);
      if (sucErr) throw sucErr;
      const sucByCodigo = new Map<string, string>();
      (sucData || []).forEach((s: any) => sucByCodigo.set(upper(s.codigo), s.id));

      // 2) Primer pase: extraer claves de producto únicas + filtrar OMIT obvios.
      const omit: OmitidaRow[] = [];
      type Tmp = ParsedLinea & { _needsProd: boolean };
      const stage: Array<{
        fila: number; raw: Row;
        sucursal_id?: string; sucursal_codigo?: string;
        fecha_full?: Date; fecha_iso?: string;
        folio?: string; caja?: string;
        clave: string;
        cantidad: number; precio_unitario: number; costo_unitario: number; subtotal: number;
        lista_precio: string | null;
        cliente_nombre: string; usuario: string; vendedor: string;
      }> = [];

      raw.forEach((r, idx) => {
        const fila = idx + 2; // header en 1
        const estatus = upper(pick(r, 'Estatus', 'estatus', 'Status'));
        if (estatus && estatus !== 'VIGENTE') {
          omit.push({ fila, raw: r, motivo: `Estatus="${estatus}" (solo se cargan Vigente)` });
          return;
        }
        const sucCodRaw = norm(pick(r, 'Sucursal', 'sucursal', 'Codigo Sucursal', 'Cod Sucursal'));
        const sucCod = mapearSucursal(sucCodRaw);
        if (!sucCod) {
          omit.push({ fila, raw: r, motivo: `Sucursal "${sucCodRaw}" omitida (mapeo legacy)` });
          return;
        }
        const sucId = sucByCodigo.get(sucCod);
        if (!sucId) {
          omit.push({ fila, raw: r, motivo: `Sucursal "${sucCod}" no existe activa en BD` });
          return;
        }
        const fechaFull = parseFecha(pick(r, 'Fecha', 'fecha', 'Fecha Venta', 'FechaVenta'));
        if (!fechaFull) {
          omit.push({ fila, raw: r, motivo: 'Fecha vacía o no parseable' });
          return;
        }
        const folio = norm(pick(r, 'Folio', 'folio', 'Numero', 'No', 'No.'));
        const caja = norm(pick(r, 'Caja', 'caja', 'No Caja', 'No. Caja'));
        const clave = norm(pick(r, 'Clave', 'clave', 'SKU', 'sku', 'Código', 'Codigo', 'Codigo Barras'));
        if (!clave) {
          omit.push({ fila, raw: r, motivo: 'Clave de producto vacía' });
          return;
        }
        if (!folio) {
          omit.push({ fila, raw: r, motivo: 'Folio vacío' });
          return;
        }
        const cantidad = num(pick(r, 'Cantidad', 'cantidad', 'Qty', 'Piezas'));
        const precio = num(pick(r, 'Precio Unitario', 'PrecioUnitario', 'Precio', 'PU'));
        const costo = num(pick(r, 'Costo Unitario', 'CostoUnitario', 'Costo', 'CU'));
        const subtotal = num(pick(r, 'Subtotal', 'subtotal', 'Importe', 'Total Línea', 'Total Linea'))
          || cantidad * precio;
        if (cantidad <= 0) {
          omit.push({ fila, raw: r, motivo: `Cantidad inválida: ${cantidad}` });
          return;
        }
        stage.push({
          fila, raw: r,
          sucursal_id: sucId, sucursal_codigo: sucCod,
          fecha_full: fechaFull, fecha_iso: fechaDia(fechaFull),
          folio, caja,
          clave, cantidad, precio_unitario: precio, costo_unitario: costo, subtotal,
          lista_precio: norm(pick(r, 'Lista de Precios', 'Lista', 'ListaPrecio', 'Lista Precios')) || null,
          cliente_nombre: norm(pick(r, 'Cliente', 'cliente', 'Nombre Cliente')),
          usuario: norm(pick(r, 'Usuario', 'usuario', 'User')),
          vendedor: norm(pick(r, 'Vendedor', 'vendedor', 'Seller')),
        });
      });

      // 3) Match productos por clave (chunked, sku + codigo_barras).
      const claves = Array.from(new Set(stage.map((s) => s.clave)));
      const CHUNK = 250;
      const totalLotes = Math.max(1, Math.ceil(claves.length / CHUNK));
      const prodById = new Map<string, any>();
      for (let i = 0; i < claves.length; i += CHUNK) {
        const loteNum = Math.floor(i / CHUNK) + 1;
        setProgress(`Matching productos: lote ${loteNum}/${totalLotes} (${claves.length} claves)...`);
        const slice = claves.slice(i, i + CHUNK);
        for (let attempt = 1; attempt <= 2; attempt++) {
          const [a, b] = await Promise.all([
            supabase.from('productos').select('id, sku, codigo_barras, nombre').in('sku', slice),
            supabase.from('productos').select('id, sku, codigo_barras, nombre').in('codigo_barras', slice),
          ]);
          if (!a.error && !b.error) {
            [...(a.data || []), ...(b.data || [])].forEach((p: any) => prodById.set(p.id, p));
            break;
          }
          if (attempt === 2) throw new Error(`Match lote ${loteNum} falló: ${a.error?.message || b.error?.message}`);
        }
      }
      const prodByClave = new Map<string, any>();
      prodById.forEach((p) => {
        if (p.codigo_barras) prodByClave.set(String(p.codigo_barras), p);
        if (p.sku && !prodByClave.has(String(p.sku))) prodByClave.set(String(p.sku), p);
      });

      // 4) Separar matched vs no-match.
      const lineas: ParsedLinea[] = [];
      const noMatchMap = new Map<string, NoMatchRow>();
      for (const s of stage) {
        const p = prodByClave.get(s.clave);
        if (!p) {
          const existing = noMatchMap.get(s.clave);
          const desc = norm(pick(s.raw, 'Descripción', 'Descripcion', 'descripcion', 'Producto'));
          if (existing) existing.ocurrencias++;
          else noMatchMap.set(s.clave, { clave: s.clave, descripcion: desc, ocurrencias: 1 });
          omit.push({ fila: s.fila, clave: s.clave, raw: s.raw, motivo: 'Producto no encontrado por sku ni codigo_barras' });
          continue;
        }
        lineas.push({
          fila: s.fila,
          sucursal_codigo: s.sucursal_codigo!, sucursal_id: s.sucursal_id!,
          fecha_iso: s.fecha_iso!, fecha_full: s.fecha_full!,
          folio: s.folio!, caja: s.caja!,
          clave: s.clave, producto_id: p.id,
          cantidad: s.cantidad, precio_unitario: s.precio_unitario,
          subtotal: s.subtotal, costo_unitario: s.costo_unitario,
          lista_precio: s.lista_precio,
          cliente_nombre: s.cliente_nombre, usuario: s.usuario, vendedor: s.vendedor,
        });
      }

      // 5) Agrupar por (sucursal, fecha-dia, folio, caja).
      const seqBySucFecha = new Map<string, number>();
      const cabsMap = new Map<string, CabeceraAgg>();
      // Ordenar para asignación de seq estable.
      lineas.sort((a, b) =>
        a.sucursal_codigo.localeCompare(b.sucursal_codigo) ||
        a.fecha_iso.localeCompare(b.fecha_iso) ||
        a.fecha_full.getTime() - b.fecha_full.getTime() ||
        a.folio.localeCompare(b.folio) ||
        a.caja.localeCompare(b.caja),
      );
      for (const l of lineas) {
        const key = `${l.sucursal_id}|${l.fecha_iso}|${l.folio}|${l.caja}`;
        let c = cabsMap.get(key);
        if (!c) {
          c = {
            key, sucursal_id: l.sucursal_id, sucursal_codigo: l.sucursal_codigo,
            fecha_iso: l.fecha_iso, fecha_full: l.fecha_full,
            folio: l.folio, caja: l.caja,
            cliente_nombre: l.cliente_nombre, usuario: l.usuario, vendedor: l.vendedor,
            lista_precio: l.lista_precio,
            lineas: [], subtotal: 0, yaExiste: false,
          };
          cabsMap.set(key, c);
        }
        c.lineas.push(l);
        c.subtotal += l.subtotal;
      }
      // Asignar numero_venta sintético HIST-{cod}-{YYYYMMDD}-{seq:04d}.
      const cabsArr = Array.from(cabsMap.values());
      const numerosByCab = new Map<string, string>();
      for (const c of cabsArr) {
        const k = `${c.sucursal_codigo}|${c.fecha_iso}`;
        const next = (seqBySucFecha.get(k) || 0) + 1;
        seqBySucFecha.set(k, next);
        const numero = `HIST-${c.sucursal_codigo}-${c.fecha_iso.replace(/-/g, '')}-${String(next).padStart(4, '0')}`;
        numerosByCab.set(c.key, numero);
      }

      // 6) Idempotencia: chequeo previo contra ventas existentes con origen='carga_historica'.
      //    Buscamos por (sucursal_id, fecha-rango del archivo) y descartamos las que ya existen.
      setProgress('Chequeando idempotencia contra cargas previas...');
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
        for (const c of cabsArr) {
          const nv = numerosByCab.get(c.key)!;
          if (existSet.has(nv)) c.yaExiste = true;
          (c as any).numero_venta = nv;
        }
      }

      // 7) Set preview state.
      setCabeceras(cabsArr);
      setOmitidas(omit);
      setNoMatch(Array.from(noMatchMap.values()).sort((a, b) => b.ocurrencias - a.ocurrencias));
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

      // Insert ventas en chunks de 500 con .select() para obtener IDs.
      const ventasChunk = 500;
      const idByKey = new Map<string, string>();
      for (let i = 0; i < aInsertar.length; i += ventasChunk) {
        const slice = aInsertar.slice(i, i + ventasChunk);
        setProgress(`Insertando ventas: ${Math.min(i + slice.length, aInsertar.length)}/${aInsertar.length}`);
        const payload = slice.map((c) => ({
          numero_venta: (c as any).numero_venta,
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
        if (error) {
          errores.push({ fase: 'ventas', chunk: i, error: error.message });
          continue;
        }
        (data || []).forEach((v: any) => {
          const c = slice.find((x) => (x as any).numero_venta === v.numero_venta && x.sucursal_id === v.sucursal_id);
          if (c) idByKey.set(c.key, v.id);
        });
        ventasInsertadas += data?.length || 0;
      }

      // Insert venta_lineas en chunks de 1000.
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
              ...omitidas.slice(0, 50).map((o) => ({ fila: o.fila, clave: o.clave, error: o.motivo })),
            ].slice(0, 100)
          : null,
      });

      toast.success(
        `Histórico: ${ventasInsertadas} ventas · ${lineasInsertadas} líneas · ${ventasDuplicadas} duplicadas (omitidas) · ${errores.length} errores`,
      );
      setOpen(false);
      setCabeceras([]);
      setOmitidas([]);
      setNoMatch([]);
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

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Cargador Histórico de Ventas (Concentrador)</p>
        <ul className="text-xs text-muted-foreground mt-2 space-y-1">
          <li>• Filtro automático: solo filas con <b>Estatus = Vigente</b>.</li>
          <li>• Mapeo sucursal: <code>F37 → F36</code>, <code>F35 / Iztapalapa → OMIT</code>.</li>
          <li>• Match producto por <code>codigo_barras</code> o <code>sku</code>.</li>
          <li>• Agrupa por (sucursal, fecha-día, folio, caja) → 1 venta + N líneas.</li>
          <li>• Folio sintético: <code>HIST-{'{'}sucursal{'}'}-{'{'}YYYYMMDD{'}'}-{'{'}seq:04{'}'}</code>.</li>
          <li>• <b>INSERT directo</b> a <code>ventas</code> + <code>venta_lineas</code> (no ejecuta <code>process_pos_sale</code> ni mueve inventario).</li>
          <li>• <b>Idempotente</b>: re-subir el mismo archivo no duplica (índice único parcial <code>ventas_hist_idem</code>).</li>
          <li>• <code>origen='carga_historica'</code> en todas las filas.</li>
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
          onChange={(e) => { const f = e.target.files?.[0]; if (f) procesarArchivo(f); e.target.value = ''; }}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Vista previa — Histórico de Ventas ({fileName})</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground text-xs">Filas Excel</div>
              <div className="text-2xl font-bold">{totalFilas.toLocaleString()}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground text-xs">Cabeceras (ventas) nuevas</div>
              <div className="text-2xl font-bold text-green-600">{cabsNuevas.length.toLocaleString()}</div>
              {cabsDup > 0 && <div className="text-xs text-amber-600">+ {cabsDup} ya existían (idempotente)</div>}
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground text-xs">Líneas a insertar</div>
              <div className="text-2xl font-bold text-blue-600">{lineasTotal.toLocaleString()}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground text-xs">Importe total</div>
              <div className="text-2xl font-bold">${importeTotal.toLocaleString('es-MX', { maximumFractionDigits: 2 })}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground text-xs">Rango de fechas</div>
              <div className="font-mono">{fechasRango ? `${fechasRango.min} → ${fechasRango.max}` : '—'}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground text-xs">Sucursales detectadas</div>
              <div className="font-mono">{sucursalesUnicas.join(', ') || '—'}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground text-xs">Filas omitidas</div>
              <div className="text-2xl font-bold text-red-600">{omitidas.length.toLocaleString()}</div>
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
                Revisa este listado antes de confirmar. Las filas con clave no encontrada se omiten — los productos faltantes se pueden cargar primero desde Atributos Maestros.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-semibold">Muestra de cabeceras (primeras 50):</p>
            <div className="max-h-[35vh] overflow-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folio sintético</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Caja</TableHead>
                    <TableHead className="text-right">Líneas</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cabeceras.slice(0, 50).map((c) => (
                    <TableRow key={c.key}>
                      <TableCell className="font-mono text-xs">{(c as any).numero_venta}</TableCell>
                      <TableCell>{c.sucursal_codigo}</TableCell>
                      <TableCell className="text-xs">{c.fecha_iso}</TableCell>
                      <TableCell>{c.caja || '—'}</TableCell>
                      <TableCell className="text-right">{c.lineas.length}</TableCell>
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
