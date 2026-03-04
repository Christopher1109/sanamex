import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Activity } from 'lucide-react';

const AuditoriaPage = () => {
  const { selectedSucursal } = useSucursal();
  const [logs, setLogs] = useState<any[]>([]);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('todo');

  useEffect(() => { if (selectedSucursal) load(); }, [selectedSucursal]);

  const load = async () => {
    if (!selectedSucursal) return;
    setLoading(true);

    // Load audit_log
    const { data: auditData } = await supabase.from('audit_log')
      .select('*')
      .eq('sucursal_id', selectedSucursal.id)
      .order('created_at', { ascending: false }).limit(200);
    setLogs(auditData || []);

    // Also load recent movimientos_inventario as activity
    const { data: movData } = await supabase.from('movimientos_inventario')
      .select('*, lotes(numero_lote, productos(nombre))')
      .eq('sucursal_id', selectedSucursal.id)
      .order('created_at', { ascending: false }).limit(200);
    setMovimientos(movData || []);

    setLoading(false);
  };

  // Combine both sources into a unified activity list
  type ActivityItem = { id: string; fecha: string; tipo: string; descripcion: string; usuario: string; entidad: string; };

  const allActivity: ActivityItem[] = [
    ...(logs || []).map(l => ({
      id: l.id,
      fecha: l.created_at,
      tipo: 'audit',
      descripcion: l.accion,
      usuario: l.usuario_nombre || '—',
      entidad: l.entidad,
    })),
    ...(movimientos || []).map(m => ({
      id: m.id,
      fecha: m.created_at,
      tipo: m.tipo,
      descripcion: `${m.tipo.replace(/_/g, ' ')} — ${(m.lotes as any)?.productos?.nombre || ''} (${m.cantidad} uds)`,
      usuario: '—',
      entidad: 'inventario',
    })),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  const filtered = allActivity.filter(a => {
    if (tab === 'audit' && a.tipo !== 'audit') return false;
    if (tab === 'inventario' && a.tipo === 'audit') return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return a.descripcion.toLowerCase().includes(s) || a.entidad.toLowerCase().includes(s) || a.usuario.toLowerCase().includes(s);
  });

  const tipoBadgeColor = (tipo: string) => {
    if (tipo === 'audit') return 'default';
    if (tipo.includes('merma')) return 'destructive';
    if (tipo.includes('entrada')) return 'default';
    if (tipo.includes('salida')) return 'secondary';
    return 'outline';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6" /> Registro de Actividad</h1>
        <p className="text-muted-foreground">{selectedSucursal?.nombre} — Historial de operaciones y movimientos</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Registros</p><p className="text-2xl font-bold">{allActivity.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Operaciones</p><p className="text-2xl font-bold">{logs.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Movimientos Inventario</p><p className="text-2xl font-bold">{movimientos.length}</p></CardContent></Card>
      </div>

      <div className="flex gap-3 items-center">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="todo">Todo</TabsTrigger>
            <TabsTrigger value="audit">Operaciones</TabsTrigger>
            <TabsTrigger value="inventario">Inventario</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2 flex-1">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Descripción</TableHead>
              <TableHead>Entidad</TableHead><TableHead>Usuario</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow> :
               filtered.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin registros de actividad</TableCell></TableRow> :
               filtered.slice(0, 100).map(a => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(a.fecha).toLocaleString('es-MX')}</TableCell>
                  <TableCell><Badge variant={tipoBadgeColor(a.tipo) as any}>{a.tipo === 'audit' ? 'Operación' : a.tipo.replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell className="max-w-[300px] truncate">{a.descripcion}</TableCell>
                  <TableCell><Badge variant="outline">{a.entidad}</Badge></TableCell>
                  <TableCell className="text-sm">{a.usuario}</TableCell>
                </TableRow>
               ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuditoriaPage;
