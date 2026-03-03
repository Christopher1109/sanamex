import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

const AjustesMermasPage = () => {
  const { selectedSucursal } = useSucursal();
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [motivos, setMotivos] = useState<any[]>([]);
  const [lotes, setLotes] = useState<any[]>([]);
  const [almacenId, setAlmacenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ tipo: 'ajuste', lote_id: '', cantidad: '', motivo_id: '', notas: '' });

  useEffect(() => { if (selectedSucursal) loadAll(); }, [selectedSucursal]);

  const loadAll = async () => {
    if (!selectedSucursal) return;
    setLoading(true);
    const { data: alm } = await supabase.from('almacenes').select('id').eq('sucursal_id', selectedSucursal.id).limit(1);
    const aId = alm?.[0]?.id;
    setAlmacenId(aId || null);
    if (!aId) { setLoading(false); return; }

    const [movRes, motRes, lotRes] = await Promise.all([
      supabase.from('movimientos_inventario').select('*, lotes(numero_lote, productos(nombre, sku)), motivos_ajuste(nombre)').eq('almacen_id', aId).in('tipo', ['ajuste', 'merma']).order('created_at', { ascending: false }).limit(50),
      supabase.from('motivos_ajuste').select('*').eq('activo', true),
      supabase.from('inventario').select('*, lotes(id, numero_lote, productos(nombre, sku))').eq('almacen_id', aId).gt('cantidad', 0),
    ]);
    setMovimientos(movRes.data || []);
    setMotivos(motRes.data || []);
    setLotes(lotRes.data || []);
    setLoading(false);
  };

  const save = async () => {
    if (!form.lote_id || !form.cantidad || !almacenId) { toast.error('Complete todos los campos'); return; }
    const user = (await supabase.auth.getUser()).data.user;
    const { error } = await supabase.from('movimientos_inventario').insert({
      almacen_id: almacenId, lote_id: form.lote_id, tipo: form.tipo, cantidad: parseInt(form.cantidad),
      motivo_id: form.motivo_id || null, notas: form.notas || null, usuario_id: user?.id, sucursal_id: selectedSucursal?.id,
    });
    if (error) { toast.error('Error al registrar'); console.error(error); }
    else {
      // Update inventory
      const inv = lotes.find(l => l.lotes?.id === form.lote_id);
      if (inv) {
        const newCant = Math.max(0, inv.cantidad - parseInt(form.cantidad));
        await supabase.from('inventario').update({ cantidad: newCant }).eq('id', inv.id);
      }
      toast.success(`${form.tipo === 'merma' ? 'Merma' : 'Ajuste'} registrado`);
      loadAll(); setDialogOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Ajustes y Mermas</h1><p className="text-muted-foreground">{selectedSucursal?.nombre}</p></div>
        <Button onClick={() => { setForm({ tipo: 'ajuste', lote_id: '', cantidad: '', motivo_id: '', notas: '' }); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Nuevo Ajuste</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Producto</TableHead><TableHead>Lote</TableHead><TableHead>Cantidad</TableHead><TableHead>Motivo</TableHead><TableHead>Notas</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow> :
               movimientos.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin ajustes registrados</TableCell></TableRow> :
               movimientos.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs">{new Date(m.created_at).toLocaleDateString('es-MX')}</TableCell>
                  <TableCell><Badge variant={m.tipo === 'merma' ? 'destructive' : 'secondary'}>{m.tipo}</Badge></TableCell>
                  <TableCell>{(m.lotes as any)?.productos?.nombre}</TableCell>
                  <TableCell className="font-mono text-xs">{(m.lotes as any)?.numero_lote}</TableCell>
                  <TableCell className="font-bold">{m.cantidad}</TableCell>
                  <TableCell>{(m.motivos_ajuste as any)?.nombre || '—'}</TableCell>
                  <TableCell className="text-xs max-w-[150px] truncate">{m.notas || '—'}</TableCell>
                </TableRow>
               ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar Ajuste / Merma</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({...form, tipo: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ajuste">Ajuste</SelectItem><SelectItem value="merma">Merma</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Lote (Producto)</Label>
              <Select value={form.lote_id} onValueChange={v => setForm({...form, lote_id: v})}>
                <SelectTrigger><SelectValue placeholder="Seleccionar lote..." /></SelectTrigger>
                <SelectContent>{lotes.map(l => <SelectItem key={l.lotes?.id} value={l.lotes?.id}>{(l.lotes as any)?.productos?.nombre} — {(l.lotes as any)?.numero_lote} (Disp: {l.cantidad})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Cantidad</Label><Input type="number" value={form.cantidad} onChange={e => setForm({...form, cantidad: e.target.value})} /></div>
            <div><Label>Motivo</Label>
              <Select value={form.motivo_id} onValueChange={v => setForm({...form, motivo_id: v})}>
                <SelectTrigger><SelectValue placeholder="Seleccionar motivo..." /></SelectTrigger>
                <SelectContent>{motivos.map(m => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Notas</Label><Textarea value={form.notas} onChange={e => setForm({...form, notas: e.target.value})} /></div>
          </div>
          <DialogFooter><Button onClick={save}>Registrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AjustesMermasPage;
