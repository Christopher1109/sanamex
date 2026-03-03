import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

const estadoBadge: Record<string, string> = { pendiente: 'secondary', aprobado: 'default', completado: 'outline', rechazado: 'destructive' };

const TraspasosPage = () => {
  const { selectedSucursal } = useSucursal();
  const [traspasos, setTraspasos] = useState<any[]>([]);
  const [almacenes, setAlmacenes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ almacen_origen_id: '', almacen_destino_id: '', notas: '' });

  useEffect(() => { load(); loadAlmacenes(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('traspasos').select('*, origen:almacenes!traspasos_almacen_origen_id_fkey(nombre, sucursal_id, sucursales:sucursales(nombre)), destino:almacenes!traspasos_almacen_destino_id_fkey(nombre, sucursal_id, sucursales:sucursales(nombre))').order('created_at', { ascending: false }).limit(50);
    setTraspasos(data || []);
    setLoading(false);
  };

  const loadAlmacenes = async () => {
    const { data } = await supabase.from('almacenes').select('*, sucursales(nombre)').eq('activo', true);
    setAlmacenes(data || []);
  };

  const save = async () => {
    if (!form.almacen_origen_id || !form.almacen_destino_id) { toast.error('Seleccione origen y destino'); return; }
    if (form.almacen_origen_id === form.almacen_destino_id) { toast.error('Origen y destino deben ser diferentes'); return; }
    const user = (await supabase.auth.getUser()).data.user;
    const { error } = await supabase.from('traspasos').insert({ ...form, solicitado_por: user?.id });
    if (error) toast.error('Error al crear traspaso'); else { toast.success('Traspaso creado'); load(); setDialogOpen(false); }
  };

  const updateEstado = async (id: string, estado: string) => {
    const user = (await supabase.auth.getUser()).data.user;
    const updates: any = { estado };
    if (estado === 'completado') updates.recibido_por = user?.id;
    const { error } = await supabase.from('traspasos').update(updates).eq('id', id);
    if (error) toast.error('Error'); else { toast.success(`Traspaso ${estado}`); load(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Traspasos entre Almacenes</h1><p className="text-muted-foreground">Movimiento de inventario entre sucursales</p></div>
        <Button onClick={() => { setForm({ almacen_origen_id: '', almacen_destino_id: '', notas: '' }); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Nuevo Traspaso</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Origen</TableHead><TableHead>Destino</TableHead><TableHead>Estado</TableHead><TableHead>Notas</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8">Cargando...</TableCell></TableRow> :
               traspasos.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin traspasos</TableCell></TableRow> :
               traspasos.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="text-xs">{new Date(t.created_at).toLocaleDateString('es-MX')}</TableCell>
                  <TableCell>{(t.origen as any)?.sucursales?.nombre} — {(t.origen as any)?.nombre}</TableCell>
                  <TableCell>{(t.destino as any)?.sucursales?.nombre} — {(t.destino as any)?.nombre}</TableCell>
                  <TableCell><Badge variant={(estadoBadge[t.estado] || 'secondary') as any}>{t.estado}</Badge></TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{t.notas || '—'}</TableCell>
                  <TableCell className="space-x-1">
                    {t.estado === 'pendiente' && <>
                      <Button size="sm" variant="outline" onClick={() => updateEstado(t.id, 'aprobado')}>Aprobar</Button>
                      <Button size="sm" variant="destructive" onClick={() => updateEstado(t.id, 'rechazado')}>Rechazar</Button>
                    </>}
                    {t.estado === 'aprobado' && <Button size="sm" onClick={() => updateEstado(t.id, 'completado')}>Completar</Button>}
                  </TableCell>
                </TableRow>
               ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo Traspaso</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Almacén Origen</Label>
              <Select value={form.almacen_origen_id} onValueChange={v => setForm({...form, almacen_origen_id: v})}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{almacenes.map(a => <SelectItem key={a.id} value={a.id}>{(a.sucursales as any)?.nombre} — {a.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Almacén Destino</Label>
              <Select value={form.almacen_destino_id} onValueChange={v => setForm({...form, almacen_destino_id: v})}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{almacenes.map(a => <SelectItem key={a.id} value={a.id}>{(a.sucursales as any)?.nombre} — {a.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Notas</Label><Textarea value={form.notas} onChange={e => setForm({...form, notas: e.target.value})} /></div>
          </div>
          <DialogFooter><Button onClick={save}>Crear Traspaso</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TraspasosPage;
