import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
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

const estadoBadge: Record<string, any> = { pendiente: 'secondary', conciliado: 'default', discrepancia: 'destructive' };

const ConciliacionPage = () => {
  const [registros, setRegistros] = useState<any[]>([]);
  const [bolsas, setBolsas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ bolsa_id: '', monto: '', referencia: '', fecha_estado_cuenta: '', notas: '' });

  useEffect(() => { load(); loadBolsas(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('conciliacion_bancaria').select('*, bolsas_valores(numero_bolsa, monto)').order('created_at', { ascending: false }).limit(50);
    setRegistros(data || []);
    setLoading(false);
  };

  const loadBolsas = async () => {
    const { data } = await supabase.from('bolsas_valores').select('id, numero_bolsa, monto').eq('estado', 'depositada');
    setBolsas(data || []);
  };

  const save = async () => {
    if (!form.monto) { toast.error('Monto requerido'); return; }
    const { error } = await supabase.from('conciliacion_bancaria').insert({
      bolsa_id: form.bolsa_id || null, monto: parseFloat(form.monto),
      referencia: form.referencia || null, fecha_estado_cuenta: form.fecha_estado_cuenta || null, notas: form.notas || null,
    });
    if (error) toast.error('Error'); else { toast.success('Registro creado'); load(); setDialogOpen(false); }
  };

  const conciliar = async (id: string) => {
    const { error } = await supabase.from('conciliacion_bancaria').update({ estado: 'conciliado' }).eq('id', id);
    if (error) toast.error('Error'); else { toast.success('Conciliado'); load(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Conciliación Bancaria</h1><p className="text-muted-foreground">Conciliación de depósitos vs estado de cuenta</p></div>
        <Button onClick={() => { setForm({ bolsa_id: '', monto: '', referencia: '', fecha_estado_cuenta: '', notas: '' }); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Nuevo Registro</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Bolsa</TableHead><TableHead>Referencia</TableHead><TableHead>Fecha Edo. Cuenta</TableHead><TableHead className="text-right">Monto</TableHead><TableHead>Estado</TableHead><TableHead>Notas</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow> :
               registros.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin registros</TableCell></TableRow> :
               registros.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{(r.bolsas_valores as any)?.numero_bolsa || '—'}</TableCell>
                  <TableCell>{r.referencia || '—'}</TableCell>
                  <TableCell className="text-xs">{r.fecha_estado_cuenta || '—'}</TableCell>
                  <TableCell className="text-right font-bold">${Number(r.monto).toFixed(2)}</TableCell>
                  <TableCell><Badge variant={estadoBadge[r.estado] || 'secondary'}>{r.estado}</Badge></TableCell>
                  <TableCell className="text-xs max-w-[150px] truncate">{r.notas || '—'}</TableCell>
                  <TableCell>{r.estado === 'pendiente' && <Button size="sm" onClick={() => conciliar(r.id)}>Conciliar</Button>}</TableCell>
                </TableRow>
               ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo Registro de Conciliación</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Bolsa de Valores (opcional)</Label>
              <Select value={form.bolsa_id} onValueChange={v => setForm({...form, bolsa_id: v})}>
                <SelectTrigger><SelectValue placeholder="Seleccionar bolsa..." /></SelectTrigger>
                <SelectContent>{bolsas.map(b => <SelectItem key={b.id} value={b.id}>{b.numero_bolsa} — ${Number(b.monto).toFixed(2)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Monto *</Label><Input type="number" step="0.01" value={form.monto} onChange={e => setForm({...form, monto: e.target.value})} /></div>
            <div><Label>Referencia bancaria</Label><Input value={form.referencia} onChange={e => setForm({...form, referencia: e.target.value})} /></div>
            <div><Label>Fecha Estado de Cuenta</Label><Input type="date" value={form.fecha_estado_cuenta} onChange={e => setForm({...form, fecha_estado_cuenta: e.target.value})} /></div>
            <div><Label>Notas</Label><Textarea value={form.notas} onChange={e => setForm({...form, notas: e.target.value})} /></div>
          </div>
          <DialogFooter><Button onClick={save}>Crear</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConciliacionPage;
