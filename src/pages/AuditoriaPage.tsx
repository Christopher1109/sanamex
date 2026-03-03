import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

const AuditoriaPage = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(100);
    setLogs(data || []);
    setLoading(false);
  };

  const filtered = logs.filter(l => l.entidad.toLowerCase().includes(search.toLowerCase()) || l.accion.toLowerCase().includes(search.toLowerCase()) || (l.usuario_nombre || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Log de Auditoría</h1><p className="text-muted-foreground">Registro de acciones del sistema</p></div>
      <Card>
        <CardHeader><div className="flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar por entidad, acción o usuario..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" /></div></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Usuario</TableHead><TableHead>Entidad</TableHead><TableHead>Acción</TableHead><TableHead>ID Entidad</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow> :
               filtered.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin registros</TableCell></TableRow> :
               filtered.map(l => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs">{new Date(l.created_at).toLocaleString('es-MX')}</TableCell>
                  <TableCell>{l.usuario_nombre || '—'}</TableCell>
                  <TableCell><Badge variant="secondary">{l.entidad}</Badge></TableCell>
                  <TableCell>{l.accion}</TableCell>
                  <TableCell className="font-mono text-xs max-w-[100px] truncate">{l.entidad_id || '—'}</TableCell>
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
