import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Edit } from 'lucide-react';
import { toast } from 'sonner';

const ProveedoresPage = () => {
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ nombre: '', rfc: '', contacto: '', telefono: '', email: '' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('proveedores').select('*').order('nombre');
    setProveedores(data || []);
    setLoading(false);
  };

  const openNew = () => { setEditing(null); setForm({ nombre: '', rfc: '', contacto: '', telefono: '', email: '' }); setDialogOpen(true); };
  const openEdit = (p: any) => { setEditing(p); setForm({ nombre: p.nombre, rfc: p.rfc || '', contacto: p.contacto || '', telefono: p.telefono || '', email: p.email || '' }); setDialogOpen(true); };

  const save = async () => {
    if (!form.nombre.trim()) { toast.error('Nombre requerido'); return; }
    if (editing) {
      const { error } = await supabase.from('proveedores').update(form).eq('id', editing.id);
      if (error) toast.error('Error al actualizar'); else { toast.success('Proveedor actualizado'); load(); setDialogOpen(false); }
    } else {
      const { error } = await supabase.from('proveedores').insert(form);
      if (error) toast.error('Error al crear'); else { toast.success('Proveedor creado'); load(); setDialogOpen(false); }
    }
  };

  const filtered = proveedores.filter(p => p.nombre.toLowerCase().includes(search.toLowerCase()) || (p.rfc || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Proveedores</h1><p className="text-muted-foreground">{proveedores.length} registrados</p></div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Nuevo Proveedor</Button>
      </div>
      <Card>
        <CardHeader><div className="flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" /></div></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>RFC</TableHead><TableHead>Contacto</TableHead><TableHead>Teléfono</TableHead><TableHead>Email</TableHead><TableHead>Estado</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow> :
               filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin proveedores</TableCell></TableRow> :
               filtered.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nombre}</TableCell>
                  <TableCell className="font-mono text-xs">{p.rfc || '—'}</TableCell>
                  <TableCell>{p.contacto || '—'}</TableCell>
                  <TableCell>{p.telefono || '—'}</TableCell>
                  <TableCell>{p.email || '—'}</TableCell>
                  <TableCell><Badge variant={p.activo ? 'default' : 'destructive'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                  <TableCell><Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Edit className="h-4 w-4" /></Button></TableCell>
                </TableRow>
               ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Editar Proveedor' : 'Nuevo Proveedor'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre *</Label><Input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} /></div>
            <div><Label>RFC</Label><Input value={form.rfc} onChange={e => setForm({...form, rfc: e.target.value})} /></div>
            <div><Label>Contacto</Label><Input value={form.contacto} onChange={e => setForm({...form, contacto: e.target.value})} /></div>
            <div><Label>Teléfono</Label><Input value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
          </div>
          <DialogFooter><Button onClick={save}>{editing ? 'Guardar' : 'Crear'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProveedoresPage;
