import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Edit } from 'lucide-react';
import { toast } from 'sonner';

const ClientesPage = () => {
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ nombre: '', rfc: '', tipo: 'mayoreo', telefono: '', email: '', direccion: '' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('clientes').select('*').order('nombre');
    setClientes(data || []);
    setLoading(false);
  };

  const openNew = () => { setEditing(null); setForm({ nombre: '', rfc: '', tipo: 'mayoreo', telefono: '', email: '', direccion: '' }); setDialogOpen(true); };
  const openEdit = (c: any) => { setEditing(c); setForm({ nombre: c.nombre, rfc: c.rfc || '', tipo: c.tipo || 'mayoreo', telefono: c.telefono || '', email: c.email || '', direccion: c.direccion || '' }); setDialogOpen(true); };

  const save = async () => {
    if (!form.nombre.trim()) { toast.error('Nombre requerido'); return; }
    if (editing) {
      const { error } = await supabase.from('clientes').update(form).eq('id', editing.id);
      if (error) toast.error('Error'); else { toast.success('Cliente actualizado'); load(); setDialogOpen(false); }
    } else {
      const { error } = await supabase.from('clientes').insert(form);
      if (error) toast.error('Error'); else { toast.success('Cliente creado'); load(); setDialogOpen(false); }
    }
  };

  const filtered = clientes.filter(c => c.nombre.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Clientes</h1><p className="text-muted-foreground">{clientes.length} registrados</p></div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Nuevo Cliente</Button>
      </div>
      <Card>
        <CardHeader><div className="flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" /></div></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Tipo</TableHead><TableHead>RFC</TableHead><TableHead>Teléfono</TableHead><TableHead>Email</TableHead><TableHead>Estado</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow> :
               filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin clientes</TableCell></TableRow> :
               filtered.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nombre}</TableCell>
                  <TableCell><Badge variant="secondary">{c.tipo}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{c.rfc || '—'}</TableCell>
                  <TableCell>{c.telefono || '—'}</TableCell>
                  <TableCell>{c.email || '—'}</TableCell>
                  <TableCell><Badge variant={c.activo ? 'default' : 'destructive'}>{c.activo ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                  <TableCell><Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Edit className="h-4 w-4" /></Button></TableCell>
                </TableRow>
               ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre *</Label><Input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} /></div>
            <div><Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({...form, tipo: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="mayoreo">Mayoreo</SelectItem><SelectItem value="menudeo">Menudeo</SelectItem><SelectItem value="hospital">Hospital</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>RFC</Label><Input value={form.rfc} onChange={e => setForm({...form, rfc: e.target.value})} /></div>
            <div><Label>Teléfono</Label><Input value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
            <div><Label>Dirección</Label><Input value={form.direccion} onChange={e => setForm({...form, direccion: e.target.value})} /></div>
          </div>
          <DialogFooter><Button onClick={save}>{editing ? 'Guardar' : 'Crear'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientesPage;
