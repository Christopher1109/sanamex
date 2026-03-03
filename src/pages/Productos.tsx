import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search } from 'lucide-react';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { toast } from 'sonner';

const PAGE_SIZE = 20;

const Productos = () => {
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [form, setForm] = useState({
    sku: '', nombre: '', categoria: '', unidad: 'pieza', precio_base: '',
    requiere_lote: true, codigo_barras: '', descripcion: '',
  });
  const [preciosSucursal, setPreciosSucursal] = useState<Record<string, string>>({});

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { loadProductos(); }, [page, debouncedSearch]);

  const loadProductos = async () => {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase.from('productos').select('*', { count: 'exact' });
    
    if (debouncedSearch) {
      query = query.or(`nombre.ilike.%${debouncedSearch}%,sku.ilike.%${debouncedSearch}%,codigo_barras.ilike.%${debouncedSearch}%`);
    }

    const { data, error, count } = await query.order('nombre').range(from, to);
    if (error) { toast.error('Error cargando productos'); console.error(error); }
    else { setProductos(data || []); setTotalCount(count || 0); }
    setLoading(false);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const openCreate = async () => {
    setForm({ sku: '', nombre: '', categoria: '', unidad: 'pieza', precio_base: '', requiere_lote: true, codigo_barras: '', descripcion: '' });
    setPreciosSucursal({});
    setShowCreate(true);
    const { data } = await supabase.from('sucursales').select('id, nombre, codigo').eq('activo', true);
    setSucursales(data || []);
  };

  const saveProduct = async () => {
    if (!form.sku.trim() || !form.nombre.trim()) { toast.error('SKU y Nombre son requeridos'); return; }
    setSaving(true);

    const { data: prod, error } = await supabase.from('productos').insert({
      sku: form.sku.trim(), nombre: form.nombre.trim(), categoria: form.categoria || null,
      unidad: form.unidad, precio_base: parseFloat(form.precio_base) || 0,
      requiere_lote: form.requiere_lote, codigo_barras: form.codigo_barras || null,
      descripcion: form.descripcion || null,
    }).select().single();

    if (error) { toast.error('Error: ' + (error.message.includes('unique') ? 'SKU duplicado' : error.message)); setSaving(false); return; }

    // Insert branch prices
    const priceInserts = Object.entries(preciosSucursal)
      .filter(([_, v]) => v && parseFloat(v) > 0)
      .map(([sucId, precio]) => ({ producto_id: prod.id, sucursal_id: sucId, precio: parseFloat(precio) }));
    
    if (priceInserts.length > 0) {
      await supabase.from('producto_precios_sucursal').insert(priceInserts);
    }

    toast.success('Producto creado exitosamente');
    setSaving(false);
    setShowCreate(false);
    loadProductos();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Catálogo de Productos</h1>
          <p className="text-muted-foreground">{totalCount} productos registrados</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Nuevo Producto</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nombre, SKU o código de barras..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Cargando...</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Precio Base</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productos.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No hay productos</TableCell></TableRow>
                  ) : productos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="font-medium">{p.nombre}</TableCell>
                      <TableCell>{p.categoria || '—'}</TableCell>
                      <TableCell>${Number(p.precio_base).toFixed(2)}</TableCell>
                      <TableCell>{p.unidad}</TableCell>
                      <TableCell>{p.requiere_lote ? <Badge variant="secondary">Sí</Badge> : 'No'}</TableCell>
                      <TableCell><Badge variant={p.activo ? 'default' : 'destructive'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <PaginationControls
                page={page} totalPages={totalPages} totalCount={totalCount}
                pageSize={PAGE_SIZE} hasNextPage={page < totalPages} hasPreviousPage={page > 1}
                onPageChange={setPage} isLoading={loading}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Product Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuevo Producto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>SKU *</Label><Input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} placeholder="MED-026" /></div>
              <div><Label>Código de Barras</Label><Input value={form.codigo_barras} onChange={e => setForm({...form, codigo_barras: e.target.value})} /></div>
            </div>
            <div><Label>Nombre *</Label><Input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} placeholder="Nombre del producto" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Categoría</Label>
                <Select value={form.categoria} onValueChange={v => setForm({...form, categoria: v})}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Analgésicos">Analgésicos</SelectItem>
                    <SelectItem value="Antibióticos">Antibióticos</SelectItem>
                    <SelectItem value="Cardiovascular">Cardiovascular</SelectItem>
                    <SelectItem value="Diabetes">Diabetes</SelectItem>
                    <SelectItem value="Gastrointestinal">Gastrointestinal</SelectItem>
                    <SelectItem value="Respiratorio">Respiratorio</SelectItem>
                    <SelectItem value="Dermatológico">Dermatológico</SelectItem>
                    <SelectItem value="Otros">Otros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Precio Base</Label><Input type="number" step="0.01" value={form.precio_base} onChange={e => setForm({...form, precio_base: e.target.value})} /></div>
              <div className="flex items-end gap-2 pb-1">
                <Checkbox id="req-lote" checked={form.requiere_lote} onCheckedChange={(v) => setForm({...form, requiere_lote: !!v})} />
                <label htmlFor="req-lote" className="text-sm">Requiere Lote</label>
              </div>
            </div>
            <div><Label>Descripción</Label><Input value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} /></div>
            
            {sucursales.length > 0 && (
              <div>
                <Label className="mb-2 block">Precio por Sucursal (opcional)</Label>
                <div className="space-y-2 border rounded-lg p-3">
                  {sucursales.map(s => (
                    <div key={s.id} className="flex items-center gap-2">
                      <span className="text-sm w-32 truncate">{s.nombre}</span>
                      <Input type="number" step="0.01" placeholder="Precio" className="w-32"
                        value={preciosSucursal[s.id] || ''} onChange={e => setPreciosSucursal({...preciosSucursal, [s.id]: e.target.value})} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={saveProduct} disabled={saving}>{saving ? 'Guardando...' : 'Crear Producto'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Productos;
