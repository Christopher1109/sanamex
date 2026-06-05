import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, Upload, Pencil, Trash2, Eye } from 'lucide-react';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { toast } from 'sonner';

const PAGE_SIZE = 25;

const empty = {
  sku: '', codigo_interno: '', nombre: '', descripcion: '', codigo_barras: '',
  formula: '', sustancia_activa: '', presentacion: '', forma_farmaceutica: '',
  laboratorio: '', indice_terapeutico: '', registro_sanitario: '', fraccion_arancelaria: '',
  receta_medica: false, departamento: '', categoria: '', estatus: 'A',
  clasificacion_80_20: '', iva_tasa: '0', ieps: '0', clave_sat: '',
  unidad: 'pieza', precio_base: '0', costo: '0', stock_minimo: '10',
  requiere_lote: true,
};

type Form = typeof empty;

const Productos = () => {
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showEdit, setShowEdit] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [precios, setPrecios] = useState<Record<number, { precio: string; cantidad_minima: string }>>({
    1: { precio: '0', cantidad_minima: '1' },
    2: { precio: '0', cantidad_minima: '1' },
    3: { precio: '0', cantidad_minima: '1' },
    4: { precio: '0', cantidad_minima: '1' },
  });
  const [saving, setSaving] = useState(false);

  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [toDelete, setToDelete] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { load(); }, [page, debouncedSearch]);

  async function load() {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q: any = supabase.from('productos').select('*', { count: 'exact' });
    if (debouncedSearch) {
      q = q.or(`nombre.ilike.%${debouncedSearch}%,sku.ilike.%${debouncedSearch}%,codigo_barras.ilike.%${debouncedSearch}%,laboratorio.ilike.%${debouncedSearch}%,codigo_interno.ilike.%${debouncedSearch}%`);
    }
    const { data, error, count } = await q.order('nombre').range(from, to);
    if (error) toast.error('Error cargando productos');
    else { setProductos(data || []); setTotalCount(count || 0); }
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setPrecios({
      1: { precio: '0', cantidad_minima: '1' },
      2: { precio: '0', cantidad_minima: '1' },
      3: { precio: '0', cantidad_minima: '1' },
      4: { precio: '0', cantidad_minima: '1' },
    });
    setShowEdit(true);
  }

  async function openEdit(p: any) {
    setEditing(p);
    setForm({
      sku: p.sku || '', codigo_interno: p.codigo_interno || '', nombre: p.nombre || '',
      descripcion: p.descripcion || '', codigo_barras: p.codigo_barras || '',
      formula: p.formula || '', sustancia_activa: p.sustancia_activa || '',
      presentacion: p.presentacion || '', forma_farmaceutica: p.forma_farmaceutica || '',
      laboratorio: p.laboratorio || '', indice_terapeutico: p.indice_terapeutico || '',
      registro_sanitario: p.registro_sanitario || '', fraccion_arancelaria: p.fraccion_arancelaria || '',
      receta_medica: !!p.receta_medica, departamento: p.departamento || '', categoria: p.categoria || '',
      estatus: p.estatus || 'A', clasificacion_80_20: p.clasificacion_80_20 || '',
      iva_tasa: String(p.iva_tasa ?? 0), ieps: String(p.ieps ?? 0), clave_sat: p.clave_sat || '',
      unidad: p.unidad || 'pieza', precio_base: String(p.precio_base ?? 0), costo: String(p.costo ?? 0),
      stock_minimo: String(p.stock_minimo ?? 10), requiere_lote: !!p.requiere_lote,
    });
    const { data: pe } = await supabase.from('producto_precios_escalonados').select('*').eq('producto_id', p.id);
    const map: any = {
      1: { precio: String(p.precio_base ?? 0), cantidad_minima: '1' },
      2: { precio: '0', cantidad_minima: '1' },
      3: { precio: '0', cantidad_minima: '1' },
      4: { precio: '0', cantidad_minima: '1' },
    };
    (pe || []).forEach(r => { map[r.nivel] = { precio: String(r.precio), cantidad_minima: String(r.cantidad_minima) }; });
    setPrecios(map);
    setShowEdit(true);
  }

  async function save() {
    if (!form.sku.trim() || !form.nombre.trim()) { toast.error('SKU y Nombre son requeridos'); return; }
    setSaving(true);
    const payload = {
      sku: form.sku.trim(), codigo_interno: form.codigo_interno || null,
      nombre: form.nombre.trim(), descripcion: form.descripcion || null,
      codigo_barras: form.codigo_barras || null,
      formula: form.formula || null, sustancia_activa: form.sustancia_activa || null,
      presentacion: form.presentacion || null, forma_farmaceutica: form.forma_farmaceutica || null,
      laboratorio: form.laboratorio || null, indice_terapeutico: form.indice_terapeutico || null,
      registro_sanitario: form.registro_sanitario || null, fraccion_arancelaria: form.fraccion_arancelaria || null,
      receta_medica: form.receta_medica, departamento: form.departamento || null,
      categoria: form.categoria || null, estatus: form.estatus || 'A',
      clasificacion_80_20: form.clasificacion_80_20 || null,
      iva_tasa: parseFloat(form.iva_tasa) || 0, ieps: parseFloat(form.ieps) || 0,
      clave_sat: form.clave_sat || null, unidad: form.unidad || 'pieza',
      precio_base: parseFloat(form.precio_base) || 0, costo: parseFloat(form.costo) || 0,
      stock_minimo: parseInt(form.stock_minimo) || 10, requiere_lote: form.requiere_lote,
    };

    let prodId = editing?.id;
    if (editing) {
      const { error } = await supabase.from('productos').update(payload).eq('id', editing.id);
      if (error) { toast.error('Error: ' + error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('productos').insert(payload).select().single();
      if (error) { toast.error('Error: ' + (error.message.includes('unique') ? 'SKU duplicado' : error.message)); setSaving(false); return; }
      prodId = data.id;
    }

    // upsert precios escalonados
    const rows = [1, 2, 3, 4].map(n => ({
      producto_id: prodId, nivel: n,
      precio: parseFloat(precios[n].precio) || 0,
      cantidad_minima: parseInt(precios[n].cantidad_minima) || 1,
    })).filter(r => r.precio > 0);
    await supabase.from('producto_precios_escalonados').delete().eq('producto_id', prodId);
    if (rows.length) await supabase.from('producto_precios_escalonados').insert(rows);

    toast.success(editing ? 'Producto actualizado' : 'Producto creado');
    setSaving(false);
    setShowEdit(false);
    load();
  }

  function askDelete(ids: string[]) {
    setToDelete(ids);
    setConfirmStep(1);
  }

  async function confirmDelete() {
    setDeleting(true);
    const { error } = await supabase.from('productos').delete().in('id', toDelete);
    if (error) {
      // si falla por FK, intentar soft-delete
      const { error: e2 } = await supabase.from('productos').update({ activo: false }).in('id', toDelete);
      if (e2) toast.error('No se pudieron eliminar: ' + error.message);
      else toast.success(`${toDelete.length} producto(s) desactivado(s) (tienen historial)`);
    } else {
      toast.success(`${toDelete.length} producto(s) eliminado(s)`);
    }
    setDeleting(false);
    setConfirmStep(0);
    setToDelete([]);
    setSelectedIds(new Set());
    load();
  }

  async function importExcel(file: File) {
    setImporting(true);
    setImportProgress('Leyendo archivo...');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      if (!rows.length) { toast.error('Archivo vacío'); return; }

      const norm = (v: any) => v === null || v === undefined || v === '' ? null : String(v).trim();
      const num = (v: any) => { const n = Number(v); return isNaN(n) ? 0 : n; };
      const bool = (v: any) => String(v ?? '').trim().toUpperCase() === 'S';

      let ok = 0, err = 0;
      const total = rows.length;

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (i % 50 === 0) setImportProgress(`Procesando ${i + 1}/${total}...`);

        const sku = norm(r['CODIGO']) || norm(r['CODIGO INTERNO']);
        const nombre = norm(r['DESCRIPCIÓN (NOMBRE COMERCIAL)']) || norm(r['DESCRIPCION']) || norm(r['NOMBRE']);
        if (!sku || !nombre) { err++; continue; }

        const fecha = r['FECHA DE CARGA A ERP'];
        let fechaErp: string | null = null;
        if (fecha) {
          const d = fecha instanceof Date ? fecha : new Date(fecha);
          if (!isNaN(d.getTime())) fechaErp = d.toISOString().slice(0, 10);
        }

        const payload = {
          sku, codigo_interno: norm(r['CODIGO INTERNO']),
          nombre, codigo_barras: norm(r['CODIGO']),
          formula: norm(r['FORMULA']), sustancia_activa: norm(r['SUSTANCIA ACTIVA']),
          presentacion: norm(r['PRESENTACIÓN']), forma_farmaceutica: norm(r['FORMA FARMACEUTICA']),
          laboratorio: norm(r['LABORATORIO']), indice_terapeutico: norm(r['INDICE TERAPEUTICO']),
          registro_sanitario: norm(r['REGISTRO SANITARIO']), fraccion_arancelaria: norm(r['FRACCIÓN']),
          receta_medica: bool(r['RECETA MEDICA']), departamento: norm(r['DEPARTAMENTO']),
          categoria: norm(r['CATEGORIA']), estatus: norm(r['ESTATUS']) || 'A',
          clasificacion_80_20: norm(r['CLASIFICACIÓN 80/20']),
          iva_tasa: String(r['IVA'] ?? '').trim().toUpperCase() === 'S' ? 16 : 0,
          ieps: num(r['IEPS']), clave_sat: norm(r['CLAVE SAT']),
          fecha_carga_erp: fechaErp,
          costo: num(r['COSTO']), precio_base: num(r['PRECIO 1']),
          unidad: 'pieza', stock_minimo: 10, requiere_lote: true,
        };

        const { data, error } = await supabase.from('productos').upsert(payload, { onConflict: 'sku' }).select('id').single();
        if (error) { err++; continue; }

        // precios escalonados
        const escal = [
          { nivel: 1, precio: num(r['PRECIO 1']), cantidad_minima: 1 },
          { nivel: 2, precio: num(r['PRECIO 2']), cantidad_minima: num(r['MAYOREO 2']) || 1 },
          { nivel: 3, precio: num(r['PRECIO 3']), cantidad_minima: num(r['MAYOREO 3']) || 1 },
          { nivel: 4, precio: num(r['PRECIO 4']), cantidad_minima: num(r['MAYOREO 4']) || 1 },
        ].filter(x => x.precio > 0).map(x => ({ ...x, producto_id: data.id }));

        if (escal.length) {
          await supabase.from('producto_precios_escalonados').delete().eq('producto_id', data.id);
          await supabase.from('producto_precios_escalonados').insert(escal);
        }
        ok++;
      }

      toast.success(`Importación: ${ok} OK / ${err} con error`);
      load();
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setImporting(false);
      setImportProgress('');
    }
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) setSelectedIds(new Set(productos.map(p => p.id)));
    else setSelectedIds(new Set());
  }

  function toggleSelect(id: string, checked: boolean) {
    const s = new Set(selectedIds);
    if (checked) s.add(id); else s.delete(id);
    setSelectedIds(s);
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Catálogo de Productos</h1>
          <p className="text-muted-foreground">{totalCount} productos registrados</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <Button variant="destructive" onClick={() => askDelete(Array.from(selectedIds))}>
              <Trash2 className="h-4 w-4 mr-2" /> Eliminar {selectedIds.size}
            </Button>
          )}
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
            <Upload className="h-4 w-4 mr-2" /> {importing ? importProgress || 'Importando...' : 'Importar Excel'}
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) importExcel(f); e.target.value = ''; }} />
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Nuevo</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nombre, SKU, código interno, laboratorio, código de barras..."
              value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xl" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Cargando...</p>
          ) : (
            <>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={productos.length > 0 && selectedIds.size === productos.length}
                        onCheckedChange={v => toggleSelectAll(!!v)} />
                    </TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Código barras</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Laboratorio</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Precio 1</TableHead>
                    <TableHead>Estatus</TableHead>
                    <TableHead className="text-right w-32">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productos.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No hay productos</TableCell></TableRow>
                  ) : productos.map((p) => {
                    const faltante = (v: any) => v === null || v === undefined || String(v).trim() === '';
                    const SinDef = () => <Badge variant="outline" className="text-amber-600 border-amber-500 text-xs whitespace-nowrap">⚠ Sin definir</Badge>;
                    return (
                    <TableRow key={p.id} className={!p.activo ? 'opacity-50' : ''}>
                      <TableCell>
                        <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={v => toggleSelect(p.id, !!v)} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.codigo_interno || p.sku}</TableCell>
                      <TableCell className="font-mono text-xs">{p.codigo_barras || '—'}</TableCell>
                      <TableCell className="font-medium max-w-md truncate" title={p.nombre}>{p.nombre}</TableCell>
                      <TableCell className="text-sm">{p.laboratorio || '—'}</TableCell>
                      <TableCell className="text-sm">{p.forma_farmaceutica || '—'}</TableCell>
                      <TableCell className="text-sm">{faltante(p.categoria) ? <SinDef /> : p.categoria}</TableCell>
                      <TableCell className="text-right">${Number(p.precio_base || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        {p.activo === false ? <Badge variant="destructive">Inactivo</Badge>
                          : p.estatus === 'A' ? <Badge variant="default">Activo</Badge>
                          : <Badge variant="secondary">{p.estatus || '—'}</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(p)} title="Ver/Editar">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => openEdit(p)} title="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => askDelete([p.id])} title="Eliminar">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );})}
                </TableBody>
              </Table>
              </div>
              <PaginationControls
                page={page} totalPages={totalPages} totalCount={totalCount}
                pageSize={PAGE_SIZE} hasNextPage={page < totalPages} hasPreviousPage={page > 1}
                onPageChange={setPage} isLoading={loading}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create dialog with tabs */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
            <DialogDescription>Completa la información del producto en las distintas pestañas.</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basico">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="basico">Básico</TabsTrigger>
              <TabsTrigger value="ficha">Ficha técnica</TabsTrigger>
              <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
              <TabsTrigger value="precios">Precios</TabsTrigger>
            </TabsList>

            <TabsContent value="basico" className="space-y-3 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>SKU / Código *</Label><Input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} /></div>
                <div><Label>Código interno</Label><Input value={form.codigo_interno} onChange={e => setForm({...form, codigo_interno: e.target.value})} /></div>
              </div>
              <div><Label>Descripción (nombre comercial) *</Label><Input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Código de barras</Label><Input value={form.codigo_barras} onChange={e => setForm({...form, codigo_barras: e.target.value})} /></div>
                <div><Label>Laboratorio</Label><Input value={form.laboratorio} onChange={e => setForm({...form, laboratorio: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Categoría</Label><Input value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})} /></div>
                <div><Label>Departamento</Label><Input value={form.departamento} onChange={e => setForm({...form, departamento: e.target.value})} /></div>
                <div><Label>Unidad</Label>
                  <Select value={form.unidad} onValueChange={v => setForm({...form, unidad: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pieza">Pieza</SelectItem>
                      <SelectItem value="caja">Caja</SelectItem>
                      <SelectItem value="frasco">Frasco</SelectItem>
                      <SelectItem value="ampolleta">Ampolleta</SelectItem>
                      <SelectItem value="sobre">Sobre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Estatus</Label>
                  <Select value={form.estatus} onValueChange={v => setForm({...form, estatus: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">Activo (A)</SelectItem>
                      <SelectItem value="B">Baja (B)</SelectItem>
                      <SelectItem value="D">Descontinuado (D)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Clasificación 80/20</Label><Input value={form.clasificacion_80_20} onChange={e => setForm({...form, clasificacion_80_20: e.target.value})} /></div>
                <div><Label>Stock mínimo</Label><Input type="number" value={form.stock_minimo} onChange={e => setForm({...form, stock_minimo: e.target.value})} /></div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.requiere_lote} onCheckedChange={v => setForm({...form, requiere_lote: !!v})} />
                  Requiere lote
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.receta_medica} onCheckedChange={v => setForm({...form, receta_medica: !!v})} />
                  Requiere receta médica
                </label>
              </div>
              <div><Label>Descripción larga</Label><Textarea value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} /></div>
            </TabsContent>

            <TabsContent value="ficha" className="space-y-3 pt-4">
              <div><Label>Sustancia activa</Label><Input value={form.sustancia_activa} onChange={e => setForm({...form, sustancia_activa: e.target.value})} /></div>
              <div><Label>Fórmula</Label><Textarea value={form.formula} onChange={e => setForm({...form, formula: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Presentación</Label><Input value={form.presentacion} onChange={e => setForm({...form, presentacion: e.target.value})} /></div>
                <div><Label>Forma farmacéutica</Label><Input value={form.forma_farmaceutica} onChange={e => setForm({...form, forma_farmaceutica: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Índice terapéutico</Label><Input value={form.indice_terapeutico} onChange={e => setForm({...form, indice_terapeutico: e.target.value})} /></div>
                <div><Label>Registro sanitario</Label><Input value={form.registro_sanitario} onChange={e => setForm({...form, registro_sanitario: e.target.value})} /></div>
              </div>
            </TabsContent>

            <TabsContent value="fiscal" className="space-y-3 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Clave SAT</Label><Input value={form.clave_sat} onChange={e => setForm({...form, clave_sat: e.target.value})} /></div>
                <div><Label>Fracción arancelaria</Label><Input value={form.fraccion_arancelaria} onChange={e => setForm({...form, fraccion_arancelaria: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>IVA (%)</Label><Input type="number" step="0.01" value={form.iva_tasa} onChange={e => setForm({...form, iva_tasa: e.target.value})} /></div>
                <div><Label>IEPS (%)</Label><Input type="number" step="0.01" value={form.ieps} onChange={e => setForm({...form, ieps: e.target.value})} /></div>
              </div>
            </TabsContent>

            <TabsContent value="precios" className="space-y-3 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Costo</Label><Input type="number" step="0.01" value={form.costo} onChange={e => setForm({...form, costo: e.target.value})} /></div>
                <div><Label>Precio base</Label><Input type="number" step="0.01" value={form.precio_base} onChange={e => setForm({...form, precio_base: e.target.value})} /></div>
              </div>
              <div className="border rounded-lg p-3 space-y-2">
                <Label className="text-sm font-semibold">Precios escalonados (mayoreo)</Label>
                {[1, 2, 3, 4].map(n => (
                  <div key={n} className="grid grid-cols-3 gap-2 items-center">
                    <span className="text-sm font-medium">Nivel {n}</span>
                    <Input type="number" step="0.01" placeholder="Precio"
                      value={precios[n].precio}
                      onChange={e => setPrecios({...precios, [n]: {...precios[n], precio: e.target.value}})} />
                    <Input type="number" placeholder="Cant. mínima"
                      value={precios[n].cantidad_minima}
                      onChange={e => setPrecios({...precios, [n]: {...precios[n], cantidad_minima: e.target.value}})} />
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Crear producto')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Doble confirmación de borrado */}
      <AlertDialog open={confirmStep === 1} onOpenChange={(o) => !o && setConfirmStep(0)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {toDelete.length} producto(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción intentará eliminarlos del catálogo. Si tienen historial de movimientos, se desactivarán en lugar de borrarse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => setConfirmStep(2)}>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmStep === 2} onOpenChange={(o) => !o && setConfirmStep(0)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Confirmación final</AlertDialogTitle>
            <AlertDialogDescription>
              Última oportunidad: <b>{toDelete.length} producto(s)</b> se eliminarán o desactivarán definitivamente. ¿Estás 100% seguro?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete} disabled={deleting}>
              {deleting ? 'Eliminando...' : 'Sí, eliminar definitivamente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Productos;
