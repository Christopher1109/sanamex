import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const UsuariosPage = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('*').order('nombre');
    const { data: roles } = await supabase.from('user_roles').select('*');

    const roleMap: Record<string, string[]> = {};
    (roles || []).forEach(r => {
      if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
      roleMap[r.user_id].push(r.role);
    });

    setUsers((profiles || []).map(p => ({ ...p, roles: roleMap[p.id] || [] })));
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Usuarios</h1><p className="text-muted-foreground">Gestión de usuarios y roles</p></div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Username</TableHead><TableHead>Email</TableHead><TableHead>Roles</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow> :
               users.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin usuarios</TableCell></TableRow> :
               users.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nombre}</TableCell>
                  <TableCell className="font-mono text-xs">{u.username || '—'}</TableCell>
                  <TableCell>{u.email || '—'}</TableCell>
                  <TableCell className="space-x-1">{u.roles.map((r: string) => <Badge key={r} variant="secondary">{r}</Badge>)}</TableCell>
                  <TableCell><Badge variant={u.activo ? 'default' : 'destructive'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                </TableRow>
               ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default UsuariosPage;
