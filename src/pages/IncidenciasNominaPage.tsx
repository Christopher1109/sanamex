import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { UserCog, Plus } from 'lucide-react';
import { toast } from 'sonner';

// Reportar incidencias que afectan nómina (falta, retardo, permiso, etc.).
// No requiere el módulo completo de Nómina — solo gerente/subgerente (de su
// propia sucursal), auditoría o administración. Pedido Alejandro, sesión
// 20-jul-2026, roles confirmados el 22-jul-2026.
const ROLES_PERMITIDOS = ['gerente', 'subgerente', 'auditoria', 'auditor', 'admin', 'super_admin'];

const INCIDENCIA_OPCIONES = [
  { value: 'falta', label: 'Falta' },
  { value: 'retardo', label: 'Retardo' },
  { value: 'permiso_ce', label: 'Permiso con goce' },
  { value: 'permiso_sg', label: 'Permiso sin goce' },
  { value: 'incapacidad', label: 'Incapacidad' },
  { value: 'vacaciones', label: 'Vacaciones' },
  { value: 'dia_festivo', label: 'Día festivo' },
  { value: 'descanso_laborado', label: 'Descanso laborado' },
];

const IncidenciasNominaPage = () => {
  const { user, userRole } = useAuth();
  const puedeReportar = !!userRole && ROLES_PERMITIDOS.includes(userRole);
  const esAdminOAuditoria = !!userRole && ['admin', 'super_admin', 'auditoria', 'auditor'].includes(userRole);

  const [empleados, setEmpleados] = useState<any[]>([]);
  const [recientes, setRecientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ empleado_id: '', fecha: new Date().toISOString().slice(0, 10), incidencia: 'falta', horas_extra: '0', notas: '' });
  const [guardando, setGuardando] = useState(false);

  // Filtros del historial
  const [fEmpleado, setFEmpleado] = useState('all');
  const [fTipo, setFTipo] = useState('all');
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');

  useEffect(() => { if (puedeReportar) load(); }, [puedeReportar, fEmpleado, fTipo, fDesde, fHasta]);

  const load = async () => {
    setLoading(true);
    let empQuery = supabase.from('empleados').select('id, nombre, numero_empleado, puesto, sucursal_id, sucursales(nombre)').eq('activo', true);

    if (!esAdminOAuditoria && user) {
      // Gerente/subgerente: solo empleados de la(s) sucursal(es) asignadas
      const { data: asign } = await supabase.from('user_sucursal_asignacion').select('sucursal_id').eq('user_id', user.id);
      const sucIds = (asign || []).map((a: any) => a.sucursal_id);
      if (sucIds.length === 0) { setEmpleados([]); setLoading(false); return; }
      empQuery = empQuery.in('sucursal_id', sucIds);
    }

    const { data: emps } = await empQuery.order('nombre');
    setEmpleados(emps || []);

    const empIds = (emps || []).map((e: any) => e.id);
    if (empIds.length) {
      let q = supabase
        .from('asistencia')
        .select('*, empleados(nombre)')
        .in('empleado_id', fEmpleado === 'all' ? empIds : [fEmpleado])
        .not('incidencia', 'is', null);
      if (fTipo !== 'all') q = q.eq('incidencia', fTipo);
      if (fDesde) q = q.gte('fecha', fDesde);
      if (fHasta) q = q.lte('fecha', fHasta);
      const { data: asis } = await q.order('fecha', { ascending: false }).limit(100);
      setRecientes(asis || []);
    } else {
      setRecientes([]);
    }
    setLoading(false);
  };

  const abrirDialogo = (empleadoId?: string) => {
    setForm({ empleado_id: empleadoId || '', fecha: new Date().toISOString().slice(0, 10), incidencia: 'falta', horas_extra: '0', notas: '' });
    setDialogOpen(true);
  };

  const guardar = async () => {
    if (!form.empleado_id) { toast.error('Selecciona un empleado'); return; }
    setGuardando(true);
    const { error } = await supabase.from('asistencia').upsert({
      empleado_id: form.empleado_id,
      fecha: form.fecha,
      incidencia: form.incidencia,
      horas_extra: Number(form.horas_extra) || 0,
      notas: form.notas || null,
      origen: 'incidencia_manual',
    } as any, { onConflict: 'empleado_id,fecha' });
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success('Incidencia registrada — se reflejará en el próximo cálculo de nómina y en el perfil del empleado');
    setDialogOpen(false);
    load();
  };

  if (!puedeReportar) {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        No tienes permiso para reportar incidencias de nómina. Disponible para gerencia, auditoría o administración.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><UserCog className="h-6 w-6" /> Incidencias de Nómina</h1>
          <p className="text-muted-foreground">
            Reporta faltas, retardos, permisos e incapacidades. Se reflejan en el próximo recibo del empleado y en "Mi Nómina".
          </p>
        </div>
        <Button onClick={() => abrirDialogo()} className="gap-2"><Plus className="h-4 w-4" /> Reportar incidencia</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Empleados</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead><TableHead>Puesto</TableHead><TableHead>Sucursal</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={4} className="text-center py-6">Cargando…</TableCell></TableRow>
                : empleados.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Sin empleados para tu sucursal asignada.</TableCell></TableRow>
                : empleados.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.nombre}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.puesto || '—'}</TableCell>
                    <TableCell className="text-sm">{(e.sucursales as any)?.nombre || '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => abrirDialogo(e.id)}>Reportar incidencia</Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Historial de incidencias</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 pb-4">
          <div><Label className="text-xs">Empleado</Label>
            <select className="w-full h-9 border rounded px-2 text-sm" value={fEmpleado} onChange={e=>setFEmpleado(e.target.value)}>
              <option value="all">Todos</option>
              {empleados.map((e:any)=><option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">Tipo de incidencia</Label>
            <select className="w-full h-9 border rounded px-2 text-sm" value={fTipo} onChange={e=>setFTipo(e.target.value)}>
              <option value="all">Todas</option>
              {INCIDENCIA_OPCIONES.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">Desde</Label><Input type="date" value={fDesde} onChange={e=>setFDesde(e.target.value)} /></div>
          <div><Label className="text-xs">Hasta</Label><Input type="date" value={fHasta} onChange={e=>setFHasta(e.target.value)} /></div>
        </CardContent>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Fecha</TableHead><TableHead>Empleado</TableHead><TableHead>Incidencia</TableHead><TableHead>Notas</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {recientes.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Sin incidencias con estos filtros.</TableCell></TableRow>
              ) : recientes.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs">{a.fecha}</TableCell>
                  <TableCell>{a.empleados?.nombre}</TableCell>
                  <TableCell><Badge variant="outline">{INCIDENCIA_OPCIONES.find(o => o.value === a.incidencia)?.label || a.incidencia}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">{a.notas || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reportar incidencia</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Empleado</Label>
              <Select value={form.empleado_id} onValueChange={v => setForm(f => ({ ...f, empleado_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona empleado" /></SelectTrigger>
                <SelectContent>
                  {empleados.map(e => <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Fecha</Label>
                <Input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={form.incidencia} onValueChange={v => setForm(f => ({ ...f, incidencia: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INCIDENCIA_OPCIONES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Horas extra (si aplica)</Label>
              <Input type="number" min="0" value={form.horas_extra} onChange={e => setForm(f => ({ ...f, horas_extra: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Notas (opcional)</Label>
              <Textarea rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Ej. Justificante médico entregado, permiso autorizado por…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default IncidenciasNominaPage;
