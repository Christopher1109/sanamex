import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

const emptyForm = {
  clave: '', nombre: '', razon_social: '', rfc: '', tipo: 'mayoreo',
  representante_suplente: '', telefono: '', celular_suplente: '', email: '',
  direccion: '', comentario: '',
  numero_precio: 1 as number | null, limite_credito: 0 as number | null, dias_credito: 0 as number | null,
  aplica_retenciones: false, desglosa_ieps: false, servicio_domicilio: false,
  factura_calle: '', factura_cp: '', activo: true,
};

type ClienteForm = typeof emptyForm;

const ClientesPage = () => {
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filtroEstatus, setFiltroEstatus] = useState('todos');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<ClienteForm>({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { load(); }, [page, debouncedSearch, filtroEstatus, filtroTipo]);

  async function load() {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = supabase.from('clientes').select('*', { count: 'exact' });
    const term = debouncedSearch.trim().replace(/[,()%]/g, ' ').replace(/\s+/g, ' ').trim();
    if (term) {
      q = q.or(
        `clave.ilike.%${term}%,nombre.ilike.%${term}%,razon_social.ilike.%${term}%,rfc.ilike.%${term}%,telefono.ilike.%${term}%,email.ilike.%${term}%`
      );
    }
    if (filtroEstatus !== 'todos') q = q.eq('activo', filtroEstatus === 'activos');
    if (filtroTipo !== 'todos') q = q.eq('tipo', filtroTipo);
    const { data, error, count } = await q.order('clave', { ascending: true, nullsFirst: false }).range(from, to);
    if (error) { toast.error('Error al cargar clientes'); }
    setClientes(data || []);
    setTotalCount(count || 0);
    setLoading(false);
  }

  function formFrom(c: any): ClienteForm {
    return {
      clave: c.clave || '', nombre: c.nombre || '', razon_social: c.razon_social || '',
      rfc: c.rfc || '', tipo: c.tipo || 'mayoreo',
      representante_suplente: c.representante_suplente || '', telefono: c.telefono || '',
      celular_suplente: c.celular_suplente || '', email: c.email || '',
      direccion: c.direccion || '', comentario: c.comentario || '',
      numero_precio: c.numero_precio ?? 1, limite_credito: c.limite_credito ?? 0, dias_credito: c.dias_credito ?? 0,
      aplica_retenciones: !!c.aplica_retenciones, desglosa_ieps: !!c.desglosa_ieps,
      servicio_domicilio: !!c.servicio_domicilio,
      factura_calle: c.factura_calle || '', factura_cp: c.factura_cp || '', activo: c.activo !== false,
    };
  }

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setDialogOpen(true); };
  const openDetail = (c: any) => { setEditing(c); setForm(formFrom(c)); setDialogOpen(true); };

  async function save() {
    if (!form.nombre.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    const payload: any = {
      ...form,
      clave: form.clave.trim() || null,
      razon_social: form.razon_social.trim() || null,
      rfc: form.rfc.trim() || null,
      representante_suplente: form.representante_suplente.trim() || null,
      telefono: form.telefono.trim() || null,
      celular_suplente: form.celular_suplente.trim() || null,
      email: form.email.trim() || null,
      direccion: form.direccion.trim() || null,
      comentario: form.comentario.trim() || null,
      factura_calle: form.factura_calle.trim() || null,
      factura_cp: form.factura_cp.trim() || null,
      numero_precio: form.numero_precio === null || (form.numero_precio as any) === '' ? null : Number(form.numero_precio),
      limite_credito: form.limite_credito === null || (form.limite_credito as any) === '' ? null : Number(form.limite_credito),
      dias_credito: form.dias_credito === null || (form.dias_credito as any) === '' ? null : Number(form.dias_credito),
    };
    if (editing) {
      const { error } = await supabase.from('clientes').update(payload).eq('id', editing.id);
      if (error) toast.error(error.code === '23505' ? 'Ya existe un cliente con esa clave' : 'Error al guardar');
      else { toast.success('Cliente actualizado'); setDialogOpen(false); load(); }
    } else {
      const { error } = await supabase.from('clientes').insert(payload);
      if (error) toast.error(error.code === '23505' ? 'Ya existe un cliente con esa clave' : 'Error al crear');
      else { toast.success('Cliente creado'); setDialogOpen(false); load(); }
    }
    setSaving(false);
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-muted-foreground">{totalCount.toLocaleString()} registrados</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Nuevo Cliente</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[280px]">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                placeholder="Buscar por clave, nombre, razón social, RFC, teléfono o email..."
                value={search} onChange={e => setSearch(e.target.value)} className="max-w-xl"
              />
            </div>
            <Select value={filtroEstatus} onValueChange={v => { setFiltroEstatus(v); setPage(1); }}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="activos">Activos</SelectItem>
                <SelectItem value="inactivos">Inactivos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroTipo} onValueChange={v => { setFiltroTipo(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los tipos</SelectItem>
                <SelectItem value="mayoreo">Mayoreo</SelectItem>
                <SelectItem value="menudeo">Menudeo</SelectItem>
                <SelectItem value="hospital">Hospital</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clave</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>RFC</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow>
              ) : clientes.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin clientes</TableCell></TableRow>
              ) : clientes.map(c => (
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(c)}>
                  <TableCell className="font-mono text-xs">{c.clave || '—'}</TableCell>
                  <TableCell className="font-medium max-w-sm truncate" title={c.nombre}>{c.nombre}</TableCell>
                  <TableCell><Badge variant="secondary">{c.tipo || '—'}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{c.rfc || '—'}</TableCell>
                  <TableCell>{c.telefono || c.celular_suplente || '—'}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate" title={c.email || ''}>{c.email || '—'}</TableCell>
                  <TableCell><Badge variant={c.activo ? 'default' : 'destructive'}>{c.activo ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!loading && (
            <div className="px-4 pb-4">
              <PaginationControls
                page={page} totalPages={totalPages} totalCount={totalCount}
                pageSize={PAGE_SIZE} hasNextPage={page < totalPages} hasPreviousPage={page > 1}
                onPageChange={setPage} isLoading={loading}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalle / edición con pestañas (mismo formato que Editar producto) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
            <DialogDescription>Completa la información del cliente en las distintas pestañas.</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basico">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="basico">Básico</TabsTrigger>
              <TabsTrigger value="contacto">Contacto</TabsTrigger>
              <TabsTrigger value="credito">Crédito y facturación</TabsTrigger>
            </TabsList>

            <TabsContent value="basico" className="space-y-3 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Clave</Label><Input value={form.clave} onChange={e => setForm({ ...form, clave: e.target.value })} placeholder="Ej. F370001" /></div>
                <div><Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mayoreo">Mayoreo</SelectItem>
                      <SelectItem value="menudeo">Menudeo</SelectItem>
                      <SelectItem value="hospital">Hospital</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Nombre *</Label><Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></div>
              <div><Label>Razón social</Label><Input value={form.razon_social} onChange={e => setForm({ ...form, razon_social: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>RFC</Label><Input value={form.rfc} onChange={e => setForm({ ...form, rfc: e.target.value })} /></div>
                <div><Label>Estatus</Label>
                  <Select value={form.activo ? 'activo' : 'inactivo'} onValueChange={v => setForm({ ...form, activo: v === 'activo' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="inactivo">Inactivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Comentario</Label><Textarea rows={2} value={form.comentario} onChange={e => setForm({ ...form, comentario: e.target.value })} /></div>
            </TabsContent>

            <TabsContent value="contacto" className="space-y-3 pt-4">
              <div><Label>Representante / suplente</Label><Input value={form.representante_suplente} onChange={e => setForm({ ...form, representante_suplente: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Teléfono</Label><Input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} /></div>
                <div><Label>Celular suplente</Label><Input value={form.celular_suplente} onChange={e => setForm({ ...form, celular_suplente: e.target.value })} /></div>
              </div>
              <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Dirección</Label><Textarea rows={3} value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} /></div>
              <div className="flex items-center gap-2 pt-1">
                <Checkbox id="cli-dom" checked={form.servicio_domicilio} onCheckedChange={v => setForm({ ...form, servicio_domicilio: !!v })} />
                <Label htmlFor="cli-dom" className="cursor-pointer">Servicio a domicilio</Label>
              </div>
            </TabsContent>

            <TabsContent value="credito" className="space-y-3 pt-4">
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Número de precio</Label><Input type="number" min={1} value={form.numero_precio ?? ''} onChange={e => setForm({ ...form, numero_precio: e.target.value === '' ? null : Number(e.target.value) })} /></div>
                <div><Label>Límite de crédito</Label><Input type="number" min={0} value={form.limite_credito ?? ''} onChange={e => setForm({ ...form, limite_credito: e.target.value === '' ? null : Number(e.target.value) })} /></div>
                <div><Label>Días de crédito</Label><Input type="number" min={0} value={form.dias_credito ?? ''} onChange={e => setForm({ ...form, dias_credito: e.target.value === '' ? null : Number(e.target.value) })} /></div>
              </div>
              <div className="flex items-center gap-6 pt-1">
                <div className="flex items-center gap-2">
                  <Checkbox id="cli-ret" checked={form.aplica_retenciones} onCheckedChange={v => setForm({ ...form, aplica_retenciones: !!v })} />
                  <Label htmlFor="cli-ret" className="cursor-pointer">Aplica retenciones</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="cli-ieps" checked={form.desglosa_ieps} onCheckedChange={v => setForm({ ...form, desglosa_ieps: !!v })} />
                  <Label htmlFor="cli-ieps" className="cursor-pointer">Desglosa IEPS</Label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Calle de facturación</Label><Input value={form.factura_calle} onChange={e => setForm({ ...form, factura_calle: e.target.value })} /></div>
                <div><Label>C.P. de facturación</Label><Input value={form.factura_cp} onChange={e => setForm({ ...form, factura_cp: e.target.value })} /></div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientesPage;
