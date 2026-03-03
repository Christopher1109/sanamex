import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Eye } from 'lucide-react';
import { toast } from 'sonner';

const estadoBadge: Record<string, any> = { preparando: 'secondary', en_ruta: 'default', completada: 'outline', cancelada: 'destructive' };

const RutasPage = () => {
  const { selectedSucursal } = useSucursal();
  const [rutas, setRutas] = useState<any[]>([]);
  const [entregas, setEntregas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailRuta, setDetailRuta] = useState<any>(null);

  useEffect(() => { if (selectedSucursal) load(); }, [selectedSucursal]);

  const load = async () => {
    if (!selectedSucursal) return;
    setLoading(true);
    const { data } = await supabase.from('rutas').select('*, profiles:repartidor_id(nombre)').eq('sucursal_id', selectedSucursal.id).order('fecha', { ascending: false }).limit(50);
    setRutas(data || []);
    setLoading(false);
  };

  const viewDetail = async (ruta: any) => {
    setDetailRuta(ruta);
    const { data } = await supabase.from('ruta_entregas').select('*, productos(nombre, sku), lotes(numero_lote), clientes(nombre)').eq('ruta_id', ruta.id);
    setEntregas(data || []);
  };

  const updateEstado = async (id: string, estado: string) => {
    const { error } = await supabase.from('rutas').update({ estado }).eq('id', id);
    if (error) toast.error('Error'); else { toast.success(`Ruta ${estado}`); load(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Rutas de Entrega</h1><p className="text-muted-foreground">{selectedSucursal?.nombre}</p></div>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Repartidor</TableHead><TableHead>Estado</TableHead><TableHead>Notas</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow> :
               rutas.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin rutas</TableCell></TableRow> :
               rutas.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{r.fecha}</TableCell>
                  <TableCell>{(r.profiles as any)?.nombre || '—'}</TableCell>
                  <TableCell><Badge variant={estadoBadge[r.estado] || 'secondary'}>{r.estado}</Badge></TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{r.notas || '—'}</TableCell>
                  <TableCell className="space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => viewDetail(r)}><Eye className="h-4 w-4" /></Button>
                    {r.estado === 'preparando' && <Button size="sm" onClick={() => updateEstado(r.id, 'en_ruta')}>Enviar</Button>}
                    {r.estado === 'en_ruta' && <Button size="sm" onClick={() => updateEstado(r.id, 'completada')}>Completar</Button>}
                  </TableCell>
                </TableRow>
               ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={!!detailRuta} onOpenChange={() => setDetailRuta(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Detalle de Ruta — {detailRuta?.fecha}</DialogTitle></DialogHeader>
          <Table>
            <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead>Lote</TableHead><TableHead>Cliente</TableHead><TableHead className="text-right">Enviados</TableHead><TableHead className="text-right">Entregados</TableHead><TableHead className="text-right">Devueltos</TableHead><TableHead className="text-right">Merma</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
            <TableBody>
              {entregas.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-4 text-muted-foreground">Sin entregas</TableCell></TableRow> :
               entregas.map(e => (
                <TableRow key={e.id}>
                  <TableCell>{(e.productos as any)?.nombre}</TableCell>
                  <TableCell className="font-mono text-xs">{(e.lotes as any)?.numero_lote}</TableCell>
                  <TableCell>{(e.clientes as any)?.nombre || '—'}</TableCell>
                  <TableCell className="text-right">{e.cantidad_enviada}</TableCell>
                  <TableCell className="text-right">{e.cantidad_entregada}</TableCell>
                  <TableCell className="text-right">{e.cantidad_devuelta}</TableCell>
                  <TableCell className="text-right text-destructive">{e.cantidad_merma}</TableCell>
                  <TableCell><Badge variant={e.estado === 'entregado' ? 'default' : 'secondary'}>{e.estado}</Badge></TableCell>
                </TableRow>
               ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RutasPage;
