import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Shield, KeyRound, UserX, UserCheck, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface UserRow {
  id: string;
  nombre: string;
  username: string | null;
  email: string | null;
  activo: boolean;
  role?: string;
  sucursal?: string;
}

export default function SuperAdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [resetDialog, setResetDialog] = useState<{ open: boolean; userId?: string; nombre?: string }>({ open: false });
  const [newPassword, setNewPassword] = useState('');
  const [generatedPwd, setGeneratedPwd] = useState<string | null>(null);
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; userId?: string; current?: string }>({ open: false });
  const [newUsername, setNewUsername] = useState('');
  const [newNombre, setNewNombre] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('*').order('username', { ascending: true });
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    const { data: asign } = await supabase.from('user_sucursal_asignacion').select('user_id, sucursal_id, sucursales(nombre,codigo)');
    const rolesMap = new Map((roles || []).map((r: any) => [r.user_id, r.role]));
    const asignMap = new Map((asign || []).map((a: any) => [a.user_id, a.sucursales?.codigo || '—']));
    setUsers((profiles || []).map((p: any) => ({
      ...p, role: rolesMap.get(p.id) || '—', sucursal: asignMap.get(p.id) || '—',
    })));
    setLoading(false);
  }

  async function doReset() {
    if (!resetDialog.userId) return;
    const body: any = { target_user_id: resetDialog.userId };
    if (newPassword.trim().length >= 8) body.custom_password = newPassword.trim();
    const { data, error } = await supabase.functions.invoke('super-admin-reset-password', { body });
    if (error || data?.error) { toast.error(error?.message || data?.error || 'Error'); return; }
    setGeneratedPwd(data.new_password);
    toast.success('Contraseña reseteada');
  }

  async function toggleActive(u: UserRow) {
    const action = u.activo ? 'disable' : 'enable';
    const { error } = await supabase.functions.invoke('super-admin-toggle-user', { body: { target_user_id: u.id, action } });
    if (error) toast.error(error.message); else { toast.success(u.activo ? 'Usuario deshabilitado' : 'Usuario habilitado'); load(); }
  }

  async function doRename() {
    if (!renameDialog.userId) return;
    const { error } = await supabase.functions.invoke('super-admin-toggle-user', {
      body: { target_user_id: renameDialog.userId, action: 'rename', new_username: newUsername || undefined, new_nombre: newNombre || undefined },
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Actualizado'); setRenameDialog({ open: false }); setNewUsername(''); setNewNombre(''); load();
  }

  const filtered = users.filter(u =>
    !filter ||
    u.username?.toLowerCase().includes(filter.toLowerCase()) ||
    u.nombre?.toLowerCase().includes(filter.toLowerCase()) ||
    u.email?.toLowerCase().includes(filter.toLowerCase()) ||
    u.sucursal?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Panel Super Admin</h1>
          <p className="text-sm text-muted-foreground">Gestión de usuarios, contraseñas y accesos.</p>
        </div>
      </div>

      <Card className="p-4">
        <Input placeholder="Buscar por usuario, nombre, email o sucursal…" value={filter} onChange={e => setFilter(e.target.value)} />
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Sucursal</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={6} className="text-center py-8">Cargando…</TableCell></TableRow>}
            {!loading && filtered.map(u => (
              <TableRow key={u.id}>
                <TableCell className="font-mono">{u.username || '—'}</TableCell>
                <TableCell>{u.nombre}</TableCell>
                <TableCell><Badge variant="outline">{u.role}</Badge></TableCell>
                <TableCell>{u.sucursal}</TableCell>
                <TableCell>{u.activo ? <Badge>Activo</Badge> : <Badge variant="destructive">Inactivo</Badge>}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="outline" onClick={() => { setResetDialog({ open: true, userId: u.id, nombre: u.nombre }); setNewPassword(''); setGeneratedPwd(null); }}>
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setRenameDialog({ open: true, userId: u.id, current: u.username || '' }); setNewUsername(u.username || ''); setNewNombre(u.nombre); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant={u.activo ? 'destructive' : 'default'} onClick={() => toggleActive(u)}>
                    {u.activo ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={resetDialog.open} onOpenChange={o => setResetDialog({ open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resetear contraseña — {resetDialog.nombre}</DialogTitle></DialogHeader>
          {generatedPwd ? (
            <div className="space-y-2">
              <p className="text-sm">Nueva contraseña asignada:</p>
              <code className="block bg-muted p-3 rounded text-lg font-mono">{generatedPwd}</code>
              <p className="text-xs text-muted-foreground">Cópiala y entrégasela al usuario. No volverá a mostrarse.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Deja en blanco para generar una contraseña aleatoria segura, o escribe una propia (mínimo 8 caracteres).</p>
              <Input placeholder="Contraseña personalizada (opcional)" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            {!generatedPwd && <Button onClick={doReset}>Resetear</Button>}
            <Button variant="outline" onClick={() => setResetDialog({ open: false })}>{generatedPwd ? 'Cerrar' : 'Cancelar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameDialog.open} onOpenChange={o => setRenameDialog({ open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Renombrar usuario</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-sm">Username</label>
            <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} />
            <label className="text-sm">Nombre</label>
            <Input value={newNombre} onChange={e => setNewNombre(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={doRename}>Guardar</Button>
            <Button variant="outline" onClick={() => setRenameDialog({ open: false })}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
