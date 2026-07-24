import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Upload, Loader2, Save, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

type Proveedor = { id: string; codigo: string | null; nombre: string };
type Mapeo = {
  proveedor_id: string;
  nombre_hoja: string | null;
  fila_encabezado: number;
  col_codigo_barras: string | null;
  col_sku: string | null;
  col_descripcion: string | null;
  col_precio: string | null;
  col_precio_con_iva: string | null;
  col_cantidad: string | null;
  iva_incluido_default: boolean;
};

type PreviewRow = {
  fila: number;
  codigo_barras: string | null;
  sku: string | null;
  descripcion: string | null;
  precio: number | null;
  precio_con_iva: number | null;
  existencia: number | null;
  producto_id: string | null;
  estado: 'nuevo' | 'subio' | 'bajo' | 'igual' | 'no_encontrado' | 'error';
  precio_anterior: number | null;
  motivo?: string;
};

export default function MapeoProveedorUploader({ onDone }: { onDone?: () => void }) {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proveedorId, setProveedorId] = useState<string>('');
  const [mapeo, setMapeo] = useState<Mapeo | null>(null);
  const [savingMapeo, setSavingMapeo] = useState(false);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetActiva, setSheetActiva] = useState<string>('');
  const [rawGrid, setRawGrid] = useState<any[][]>([]);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('proveedores').select('id, codigo, nombre').eq('activo', true).order('nombre');
      setProveedores((data as Proveedor[]) || []);
    })();
  }, []);

  useEffect(() => {
    if (!proveedorId) { setMapeo(null); return; }
    (async () => {
      const { data } = await supabase.from('cotizador_mapeo_columnas').select('*').eq('proveedor_id', proveedorId).maybeSingle();
      if (data) setMapeo(data as Mapeo);
      else setMapeo({ proveedor_id: proveedorId, nombre_hoja: null, fila_encabezado: 1, col_codigo_barras: null, col_sku: null, col_descripcion: null, col_precio: null, col_precio_con_iva: null, col_cantidad: null, iva_incluido_default: true });
    })();
  }, [proveedorId]);

  useEffect(() => {
    if (!rawGrid.length || !mapeo) return;
    const fila = Math.max(1, mapeo.fila_encabezado || 1);
    const headers = (rawGrid[fila - 1] || []).map(v => (v === null || v === undefined) ? '' : String(v).trim());
    setDetectedHeaders(headers.filter(h => h !== ''));
  }, [rawGrid, mapeo?.fila_encabezado]);

  async function handleFile(f: File) {
    if (!mapeo) { toast.error('Selecciona un proveedor primero'); return; }
    setFileName(f.name);
    const ab = await f.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array' });
    setSheetNames(wb.SheetNames);
    const sheetName = mapeo.nombre_hoja && wb.SheetNames.includes(mapeo.nombre_hoja) ? mapeo.nombre_hoja : wb.SheetNames[0];
    setSheetActiva(sheetName);
    const grid: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });
    setRawGrid(grid);
    setPreview([]);
    setDialogOpen(true);
  }

  function cambiarHoja(name: string) {
    setSheetActiva(name);
    // Re-parse from the already-uploaded workbook via reading rawGrid isn't possible since we don't keep wb
    // Simplest: ask user to re-upload for a different sheet.
    if (fileRef.current) fileRef.current.click();
  }

  async function guardarMapeo() {
    if (!mapeo) return;
    if (!mapeo.col_precio && !mapeo.col_precio_con_iva) { toast.error('Debes mapear al menos una columna de precio'); return; }
    if (!mapeo.col_codigo_barras && !mapeo.col_sku) { toast.error('Debes mapear código de barras o SKU'); return; }
    setSavingMapeo(true);
    const payload = { ...mapeo, nombre_hoja: sheetActiva || mapeo.nombre_hoja };
    const { error } = await supabase.from('cotizador_mapeo_columnas').upsert(payload, { onConflict: 'proveedor_id' });
    setSavingMapeo(false);
    if (error) toast.error('Error guardando mapeo: ' + error.message);
    else toast.success('Mapeo guardado para este proveedor');
  }

  async function analizar() {
    if (!mapeo || !rawGrid.length) return;
    if (!mapeo.col_precio && !mapeo.col_precio_con_iva) { toast.error('Mapea al menos una columna de precio'); return; }
    if (!mapeo.col_codigo_barras && !mapeo.col_sku) { toast.error('Mapea código de barras o SKU'); return; }

    setCommitting(true);
    try {
      const headers = (rawGrid[mapeo.fila_encabezado - 1] || []).map(v => String(v ?? '').trim());
      const idx = (colName: string | null) => colName ? headers.findIndex(h => h.toLowerCase() === colName.toLowerCase()) : -1;
      const iCB = idx(mapeo.col_codigo_barras); const iSKU = idx(mapeo.col_sku);
      const iDesc = idx(mapeo.col_descripcion); const iPrecio = idx(mapeo.col_precio);
      const iPrecioIva = idx(mapeo.col_precio_con_iva); const iCant = idx(mapeo.col_cantidad);

      const dataRows = rawGrid.slice(mapeo.fila_encabezado);
      const rawParsed: Omit<PreviewRow, 'producto_id' | 'estado' | 'precio_anterior'>[] = [];

      dataRows.forEach((r, i) => {
        const cb = iCB >= 0 ? String(r[iCB] ?? '').trim() : '';
        const sku = iSKU >= 0 ? String(r[iSKU] ?? '').trim() : '';
        if (!cb && !sku) return;
        const precioRaw = iPrecio >= 0 ? r[iPrecio] : null;
        const precioIvaRaw = iPrecioIva >= 0 ? r[iPrecioIva] : null;
        const cantRaw = iCant >= 0 ? r[iCant] : null;
        const cleanNum = (v: any) => {
          if (v === null || v === undefined || v === '' || v === '-') return null;
          const s = String(v).replace(/[$,\s]/g, '');
          if (s === '' || s === '-') return null;
          const n = Number(s); return isNaN(n) ? null : n;
        };
        rawParsed.push({
          fila: mapeo.fila_encabezado + i + 1,
          codigo_barras: cb || null, sku: sku || null,
          descripcion: iDesc >= 0 ? String(r[iDesc] ?? '').trim() || null : null,
          precio: cleanNum(precioRaw), precio_con_iva: cleanNum(precioIvaRaw),
          existencia: (() => { const n = cleanNum(cantRaw); return n === null ? 0 : Math.floor(n); })(),
        });
      });

      // Buscar productos existentes
      const codigos = Array.from(new Set(rawParsed.map(r => r.codigo_barras).filter(Boolean))) as string[];
      const skus = Array.from(new Set(rawParsed.map(r => r.sku).filter(Boolean))) as string[];
      const { data: prodsPorCB } = codigos.length ? await supabase.from('productos').select('id, codigo_barras, sku').in('codigo_barras', codigos) : { data: [] };
      const { data: prodsPorSKU } = skus.length ? await supabase.from('productos').select('id, codigo_barras, sku').in('sku', skus) : { data: [] };
      const cbMap = new Map<string, string>();
      (prodsPorCB || []).forEach((p: any) => { if (p.codigo_barras) cbMap.set(p.codigo_barras, p.id); });
      const skuMap = new Map<string, string>();
      (prodsPorSKU || []).forEach((p: any) => { if (p.sku) skuMap.set(p.sku, p.id); });

      const prodIds = new Set<string>();
      const filasConId = rawParsed.map(r => {
        let pid: string | null = null;
        if (r.codigo_barras && cbMap.has(r.codigo_barras)) pid = cbMap.get(r.codigo_barras)!;
        else if (r.sku && skuMap.has(r.sku)) pid = skuMap.get(r.sku)!;
        if (pid) prodIds.add(pid);
        return { ...r, producto_id: pid };
      });

      // Fetch precios anteriores
      const { data: prevPrecios } = prodIds.size ? await supabase.from('lista_precio_proveedor')
        .select('producto_id, precio, precio_con_iva').eq('proveedor_id', proveedorId).eq('activo', true)
        .in('producto_id', Array.from(prodIds)) : { data: [] };
      const prevMap = new Map<string, number>();
      (prevPrecios || []).forEach((p: any) => { prevMap.set(p.producto_id, p.precio_con_iva || p.precio); });

      const finalPreview: PreviewRow[] = filasConId.map(f => {
        if (!f.producto_id) return { ...f, producto_id: null, estado: 'no_encontrado', precio_anterior: null, motivo: 'Sin match por código de barras ni SKU' };
        if (f.precio === null && f.precio_con_iva === null) return { ...f, producto_id: f.producto_id, estado: 'error', precio_anterior: null, motivo: 'Sin precio' };
        const precioActualCmp = f.precio_con_iva ?? f.precio!;
        const previo = prevMap.get(f.producto_id);
        let estado: PreviewRow['estado'];
        if (previo === undefined) estado = 'nuevo';
        else if (Math.abs(previo - precioActualCmp) < 0.005) estado = 'igual';
        else estado = precioActualCmp > previo ? 'subio' : 'bajo';
        return { ...f, estado, precio_anterior: previo ?? null };
      });

      setPreview(finalPreview);
    } catch (e: any) { toast.error('Error: ' + e.message); }
    finally { setCommitting(false); }
  }

  async function commit() {
    if (!mapeo) return;
    const validas = preview.filter(r => r.producto_id && r.estado !== 'error' && r.estado !== 'no_encontrado');
    if (!validas.length) { toast.error('Nada para importar'); return; }
    setCommitting(true);
    try {
      // Crear carga
      const today = new Date().toISOString().slice(0, 10);
      const { data: carga, error: eCarga } = await supabase.from('lista_precio_cargas').insert({
        proveedor_id: proveedorId, archivo_nombre: fileName, productos_cargados: validas.length,
        fecha_vigencia_desde: today, precio_incluye_iva: mapeo.iva_incluido_default,
      } as any).select('id').single();
      if (eCarga) throw eCarga;

      // Desactivar activas
      await supabase.from('lista_precio_proveedor').update({ activo: false }).eq('proveedor_id', proveedorId).eq('activo', true);

      // Insertar
      const inserts = validas.map(r => {
        const iva = mapeo.iva_incluido_default;
        const precio = r.precio !== null ? r.precio : (iva && r.precio_con_iva !== null ? +(r.precio_con_iva / 1.16).toFixed(4) : r.precio_con_iva!);
        const precioIva = r.precio_con_iva !== null ? r.precio_con_iva : (iva ? precio : +(precio * 1.16).toFixed(4));
        return {
          proveedor_id: proveedorId, producto_id: r.producto_id!,
          precio, precio_con_iva: precioIva, existencia_proveedor: r.existencia ?? 0,
          fecha_vigencia_desde: new Date().toISOString().slice(0, 10),
          carga_id: carga.id, activo: true,
        };
      });
      const { error: eIns } = await supabase.from('lista_precio_proveedor').insert(inserts);
      if (eIns) throw eIns;

      toast.success(`${inserts.length} precios cargados`);
      setDialogOpen(false); setPreview([]); setRawGrid([]); setFileName('');
      onDone?.();
    } catch (e: any) { toast.error('Error al importar: ' + e.message); }
    finally { setCommitting(false); }
  }

  const counts = useMemo(() => ({
    nuevo: preview.filter(p => p.estado === 'nuevo').length,
    subio: preview.filter(p => p.estado === 'subio').length,
    bajo: preview.filter(p => p.estado === 'bajo').length,
    igual: preview.filter(p => p.estado === 'igual').length,
    no_encontrado: preview.filter(p => p.estado === 'no_encontrado').length,
    error: preview.filter(p => p.estado === 'error').length,
  }), [preview]);

  const mapeoIncompleto = !mapeo || (!mapeo.col_codigo_barras && !mapeo.col_sku) || (!mapeo.col_precio && !mapeo.col_precio_con_iva);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Sube el archivo <strong>tal cual lo envía el proveedor</strong>. Mapea sus columnas una vez, el sistema recuerda el mapeo para futuras cargas.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Proveedor</Label>
          <Select value={proveedorId} onValueChange={setProveedorId}>
            <SelectTrigger><SelectValue placeholder="Selecciona proveedor" /></SelectTrigger>
            <SelectContent>{proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.codigo ? `${p.codigo} — ` : ''}{p.nombre}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2 flex items-end gap-2">
          <Button onClick={() => fileRef.current?.click()} disabled={!proveedorId}><Upload className="h-4 w-4 mr-1" /> Subir archivo del proveedor</Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
        </div>
      </div>

      {mapeo && (
        <Card className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Mapeo de columnas de este proveedor</h3>
            <Button size="sm" variant="outline" onClick={guardarMapeo} disabled={savingMapeo || mapeoIncompleto}>
              {savingMapeo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Guardar mapeo
            </Button>
          </div>
          {sheetNames.length > 0 && (
            <div className="text-xs">
              <span className="text-muted-foreground">Hoja activa: </span>
              <Select value={sheetActiva} onValueChange={cambiarHoja}>
                <SelectTrigger className="w-[240px] h-8 inline-flex"><SelectValue /></SelectTrigger>
                <SelectContent>{sheetNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <Label className="text-xs">Fila de encabezado</Label>
              <Input type="number" min={1} value={mapeo.fila_encabezado} onChange={e => setMapeo({ ...mapeo, fila_encabezado: Math.max(1, parseInt(e.target.value) || 1) })} className="h-8" />
            </div>
            {(['col_codigo_barras', 'col_sku', 'col_descripcion', 'col_precio', 'col_precio_con_iva', 'col_cantidad'] as const).map(k => (
              <div key={k}>
                <Label className="text-xs">
                  {k === 'col_codigo_barras' && 'Código de barras'}
                  {k === 'col_sku' && 'SKU'}
                  {k === 'col_descripcion' && 'Descripción'}
                  {k === 'col_precio' && 'Precio (sin IVA)'}
                  {k === 'col_precio_con_iva' && 'Precio con IVA'}
                  {k === 'col_cantidad' && 'Existencia / cantidad'}
                </Label>
                <Select value={mapeo[k] || '__none__'} onValueChange={v => setMapeo({ ...mapeo, [k]: v === '__none__' ? null : v })}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— sin mapear —</SelectItem>
                    {detectedHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-5">
              <Checkbox checked={mapeo.iva_incluido_default} onCheckedChange={v => setMapeo({ ...mapeo, iva_incluido_default: !!v })} />
              <Label className="text-xs">Precios traen IVA incluido</Label>
            </div>
          </div>
          {detectedHeaders.length === 0 && rawGrid.length > 0 && (
            <p className="text-xs text-orange-600">No se detectaron encabezados en la fila {mapeo.fila_encabezado}. Prueba con otra fila.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={analizar} disabled={mapeoIncompleto || !rawGrid.length || committing}>
              {committing && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Analizar cambios
            </Button>
          </div>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-auto">
          <DialogHeader><DialogTitle>Resumen — {fileName}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Badge className="bg-green-600">Nuevos: {counts.nuevo}</Badge>
              <Badge className="bg-red-600">Subieron: {counts.subio}</Badge>
              <Badge className="bg-blue-600">Bajaron: {counts.bajo}</Badge>
              <Badge variant="outline">Igual: {counts.igual}</Badge>
              <Badge variant="destructive">Sin match: {counts.no_encontrado}</Badge>
              <Badge variant="destructive">Errores: {counts.error}</Badge>
            </div>
            <div className="max-h-[55vh] overflow-auto border rounded">
              <Table>
                <TableHeader><TableRow><TableHead>Fila</TableHead><TableHead>Estado</TableHead><TableHead>Clave</TableHead><TableHead>SKU</TableHead><TableHead>Descripción</TableHead><TableHead className="text-right">Precio anterior</TableHead><TableHead className="text-right">Precio nuevo</TableHead><TableHead className="text-right">Δ%</TableHead><TableHead className="text-right">Exist.</TableHead></TableRow></TableHeader>
                <TableBody>
                  {preview.slice(0, 500).map((r, i) => {
                    const nuevo = r.precio_con_iva ?? r.precio;
                    const delta = r.precio_anterior && nuevo ? ((nuevo - r.precio_anterior) / r.precio_anterior * 100) : null;
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{r.fila}</TableCell>
                        <TableCell>
                          {r.estado === 'nuevo' && <Badge className="bg-green-600 text-[10px]">Nuevo</Badge>}
                          {r.estado === 'subio' && <Badge className="bg-red-600 text-[10px]">↑ Subió</Badge>}
                          {r.estado === 'bajo' && <Badge className="bg-blue-600 text-[10px]">↓ Bajó</Badge>}
                          {r.estado === 'igual' && <Badge variant="outline" className="text-[10px]">Igual</Badge>}
                          {r.estado === 'no_encontrado' && <Badge variant="destructive" className="text-[10px]">Sin match</Badge>}
                          {r.estado === 'error' && <Badge variant="destructive" className="text-[10px]">Error</Badge>}
                        </TableCell>
                        <TableCell className="font-mono text-[10px]">{r.codigo_barras || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{r.sku || '—'}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate" title={r.descripcion || ''}>{r.descripcion || '—'}{r.motivo && <div className="text-red-600 text-[10px]">{r.motivo}</div>}</TableCell>
                        <TableCell className="text-right text-xs">{r.precio_anterior != null ? '$' + r.precio_anterior.toFixed(2) : '—'}</TableCell>
                        <TableCell className="text-right text-xs font-medium">{nuevo != null ? '$' + nuevo.toFixed(2) : '—'}</TableCell>
                        <TableCell className={`text-right text-xs ${delta && delta > 0 ? 'text-red-600' : delta && delta < 0 ? 'text-green-600' : ''}`}>{delta != null ? delta.toFixed(1) + '%' : '—'}</TableCell>
                        <TableCell className="text-right text-xs">{r.existencia ?? '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {preview.length > 500 && <p className="text-xs text-muted-foreground">Mostrando 500 de {preview.length}. Se importarán todas las válidas.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={commit} disabled={committing || preview.length === 0}>
              {committing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Importar {counts.nuevo + counts.subio + counts.bajo + counts.igual} filas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
