import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Wallet, Calendar, AlertCircle } from 'lucide-react';

// Perfil de nómina del propio empleado (vendedores, almacenistas, etc.):
// ve sus incidencias recientes y su recibo más reciente con desglose.
// Pedido Alejandro, sesión 20-jul-2026.
const INCIDENCIA_LABELS: Record<string, string> = {
  falta: 'Falta', retardo: 'Retardo', permiso_ce: 'Permiso con goce',
  permiso_sg: 'Permiso sin goce', incapacidad: 'Incapacidad', vacaciones: 'Vacaciones',
  dia_festivo: 'Día festivo', descanso_laborado: 'Descanso laborado',
};

const MiNominaPage = () => {
  const { user } = useAuth();
  const [empleado, setEmpleado] = useState<any>(null);
  const [incidencias, setIncidencias] = useState<any[]>([]);
  const [ultimoRecibo, setUltimoRecibo] = useState<any>(null);
  const [conceptos, setConceptos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sinVincular, setSinVincular] = useState(false);

  useEffect(() => { if (user) load(); }, [user]);

  const load = async () => {
    setLoading(true);
    const { data: emp } = await supabase.from('empleados').select('*, sucursales(nombre)').eq('user_id', user!.id).maybeSingle();
    if (!emp) { setSinVincular(true); setLoading(false); return; }
    setEmpleado(emp);

    const hace60 = new Date();
    hace60.setDate(hace60.getDate() - 60);
    const { data: asis } = await supabase
      .from('asistencia')
      .select('*')
      .eq('empleado_id', emp.id)
      .not('incidencia', 'is', null)
      .gte('fecha', hace60.toISOString().slice(0, 10))
      .order('fecha', { ascending: false });
    setIncidencias(asis || []);

    // Portal del empleado: solo debe ver recibos ya timbrados (nómina
    // pagada y con CFDI). Un recibo en borrador/generado todavía puede
    // cambiar, así que no se le muestra hasta que esté timbrado.
    const { data: recibo } = await supabase
      .from('recibos_nomina')
      .select('*')
      .eq('empleado_id', emp.id)
      .eq('estatus', 'timbrado')
      .order('periodo_fin', { ascending: false })
      .limit(1)
      .maybeSingle();
    setUltimoRecibo(recibo);

    if (recibo) {
      const { data: conc } = await supabase.from('recibo_conceptos').select('*').eq('recibo_id', recibo.id);
      setConceptos(conc || []);
    }
    setLoading(false);
  };

  if (loading) return <div className="text-center py-12 text-muted-foreground">Cargando…</div>;

  if (sinVincular) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-2">
          <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="font-medium">Tu usuario todavía no está vinculado a un expediente de empleado</p>
          <p className="text-sm text-muted-foreground">Pide a administración o RH que te vincule desde Nómina → Empleados para poder ver tu información aquí.</p>
        </CardContent>
      </Card>
    );
  }

  const percepciones = conceptos.filter(c => c.tipo === 'percepcion');
  const deducciones = conceptos.filter(c => c.tipo === 'deduccion');
  const otros = conceptos.filter(c => c.tipo !== 'percepcion' && c.tipo !== 'deduccion');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6" /> Mi Nómina</h1>
        <p className="text-muted-foreground">{empleado.nombre} · {empleado.puesto || 'Sin puesto asignado'} · {(empleado.sucursales as any)?.nombre}</p>
      </div>

      {ultimoRecibo ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Último recibo — {ultimoRecibo.periodo_inicio} a {ultimoRecibo.periodo_fin}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Percepciones</p>
                <p className="text-lg font-bold text-green-600">${Number(ultimoRecibo.total_percepciones).toFixed(2)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Deducciones</p>
                <p className="text-lg font-bold text-rose-600">${Number(ultimoRecibo.total_deducciones).toFixed(2)}</p>
              </div>
              <div className="rounded-lg border p-3 bg-accent/40">
                <p className="text-xs text-muted-foreground">Neto pagado</p>
                <p className="text-lg font-bold">${Number(ultimoRecibo.neto_pagado).toFixed(2)}</p>
              </div>
            </div>

            {conceptos.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Concepto</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Importe</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {[...percepciones, ...deducciones, ...otros].map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm">{c.descripcion}</TableCell>
                      <TableCell>
                        <Badge variant={c.tipo === 'percepcion' ? 'default' : c.tipo === 'deduccion' ? 'destructive' : 'secondary'}>
                          {c.tipo === 'percepcion' ? 'Percepción' : c.tipo === 'deduccion' ? 'Deducción' : c.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">${Number(c.importe_total).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="p-6 text-center text-muted-foreground">Todavía no tienes recibos de nómina timbrados. En cuanto se timbre tu recibo del periodo, aparecerá aquí.</CardContent></Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Incidencias de los últimos 60 días</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Fecha</TableHead><TableHead>Incidencia</TableHead><TableHead>Notas</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {incidencias.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Sin incidencias registradas — todo en orden.</TableCell></TableRow>
              ) : incidencias.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs">{a.fecha}</TableCell>
                  <TableCell><Badge variant="outline">{INCIDENCIA_LABELS[a.incidencia] || a.incidencia}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.notas || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Estas incidencias se toman en cuenta en el cálculo de tu siguiente recibo de nómina. Si no estás de acuerdo con alguna, coméntalo con tu gerente.
      </p>
    </div>
  );
};

export default MiNominaPage;
