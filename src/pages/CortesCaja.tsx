import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

const estadoVariant: Record<string, any> = {
  abierto: 'default',
  revision: 'secondary',
  cerrado: 'outline',
};

const CortesCaja = () => {
  const { selectedSucursal } = useSucursal();
  const [cortes, setCortes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (selectedSucursal) loadCortes();
  }, [selectedSucursal]);

  const loadCortes = async () => {
    if (!selectedSucursal) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('cortes_caja')
      .select('*')
      .eq('sucursal_id', selectedSucursal.id)
      .order('fecha', { ascending: false })
      .limit(50);

    if (!error) setCortes(data || []);
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cortes de Caja</h1>
          <p className="text-muted-foreground">{selectedSucursal?.nombre}</p>
        </div>
        <Button><Plus className="h-4 w-4 mr-2" /> Nuevo Corte</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Esperado</TableHead>
                <TableHead className="text-right">Recibido</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow>
              ) : cortes.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin cortes</TableCell></TableRow>
              ) : (
                cortes.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.fecha}</TableCell>
                    <TableCell><Badge variant={estadoVariant[c.estado] || 'secondary'}>{c.estado}</Badge></TableCell>
                    <TableCell className="text-right">${Number(c.efectivo_esperado).toFixed(2)}</TableCell>
                    <TableCell className="text-right">${Number(c.efectivo_recibido).toFixed(2)}</TableCell>
                    <TableCell className={`text-right font-bold ${Number(c.diferencia) < 0 ? 'text-destructive' : 'text-accent'}`}>
                      ${Number(c.diferencia).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default CortesCaja;
