import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

const estadoBadge: Record<string, any> = { creada: 'secondary', recolectada: 'default', depositada: 'outline' };

const BolsasValoresPage = () => {
  const { selectedSucursal } = useSucursal();
  const [bolsas, setBolsas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ numero_bolsa: '', monto: '' });

  useEffect(() => { if (selectedSucursal) load(); }, [selectedSucursal]);

  const load = async () => {
    if (!selectedSucursal) return;
    setLoading(true);
    const { data } = await supabase.from('bolsas_valores').select('*').eq('sucursal_id', selectedSucursal.id).order('created_at', { ascending: false }).limit(50);
    setBolsas(data || []);
    setLoading(false);
  };

  const save = async () => {
    if (!form.numero_bolsa || !form.monto || !selectedSucursal) { toast.error('Complete todos los campos'); return; }
    const { error } = await supabase.from('bolsas_valores').insert({ numero_bolsa: form.numero_bolsa, monto: parseFloat(form.monto), sucursal_id: selectedSucursal.id });
    if (error) toast.error('Error'); else { toast.success('Bolsa creada'); load(); setDialogOpen(false); }
  };

  const updateEstado = async (id: string, estado: string) => {
    const user = (await supabase.auth.getUser()).data.user;
    const updates: any = { estado };
    if (estado === 'recolectada') { updates.recolectado_at = new Date().toISOString(); updates.recolectado_por = user?.id; }
    if (estado === 'depositada') updates.depositado_at = new Date().toISOString();
    const { error } = await supabase.from('bolsas_valores').update(updates).eq('id', id);
    if (error) toast.error('Error'); else { toast.success(`Bolsa ${estado}`); load(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Bolsas de Valores</h1><p className="text-muted-foreground">{selectedSucursal?.nombre}</p></div>
        <Button onClick={() => { setForm({ numero_bolsa: '', monto: '' }); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Nueva Bolsa</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Núm. Bolsa</TableHead><TableHead className="text-right">Monto</TableHead><TableHead>Estado</TableHead><TableHead>Creada</TableHead><TableHead>Recolectada</TableHead><TableHead>Depositada</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow> :
               bolsas.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin bolsas</TableCell></TableRow> :
               bolsas.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono font-bold">{b.numero_bolsa}</TableCell>
                  <TableCell className="text-right font-bold">${Number(b.monto).toFixed(2)}</TableCell>
                  <TableCell><Badge variant={estadoBadge[b.estado] || 'secondary'}>{b.estado}</Badge></TableCell>
                  <TableCell className="text-xs">{new Date(b.created_at).toLocaleDateString('es-MX')}</TableCell>
                  <TableCell className="text-xs">{b.recolectado_at ? new Date(b.recolectado_at).toLocaleDateString('es-MX') : '—'}</TableCell>
                  <TableCell className="text-xs">{b.depositado_at ? new Date(b.depositado_at).toLocaleDateString('es-MX') : '—'}</TableCell>
                  <TableCell className="space-x-1">
                    {b.estado === 'creada' && <Button size="sm" onClick={() => updateEstado(b.id, 'recolectada')}>Recolectar</Button>}
                    {b.estado === 'recolectada' && <Button size="sm" onClick={() => updateEstado(b.id, 'depositada')}>Depositar</Button>}
                  </TableCell>
                </TableRow>
               ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva Bolsa de Valores</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Número de Bolsa</Label><Input value={form.numero_bolsa} onChange={e => setForm({...form, numero_bolsa: e.target.value})} /></div>
            <div><Label>Monto</Label><Input type="number" step="0.01" value={form.monto} onChange={e => setForm({...form, monto: e.target.value})} /></div>
          </div>
          <DialogFooter><Button onClick={save}>Crear Bolsa</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BolsasValoresPage;
