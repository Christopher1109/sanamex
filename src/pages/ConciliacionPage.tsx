import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, RotateCcw, Link2 } from 'lucide-react';
import { toast } from 'sonner';

type Mov = {
  id: string; cuenta_id: string; fecha: string; concepto: string | null;
  cargo: number; abono: number; conciliado: boolean; referencia: string | null;
};
type Documento = {
  id: string; tipo: 'pago_cxp' | 'cfdi'; fecha: string; monto: number; descripcion: string;
};

const ConciliacionPage = () => {
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [cuentaId, setCuentaId] = useState<string>('');
  const [desde, setDesde] = useState<string>(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [hasta, setHasta] = useState<string>(new Date().toISOString().slice(0, 10));
  const [movs, setMovs] = useState<Mov[]>([]);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [selMov, setSelMov] = useState<Mov | null>(null);
  const [tolDias, setTolDias] = useState(3);

  useEffect(() => {
    supabase.from('cuentas_bancarias').select('id, alias, bancos(nombre)').eq('activo', true).order('alias')
      .then(({ data }) => { setCuentas(data || []); if (data?.length && !cuentaId) setCuentaId(data[0].id); });
  }, []);

  useEffect(() => { if (cuentaId) load(); }, [cuentaId, desde, hasta]);

  const load = async () => {
    const { data: m } = await supabase.from('movimientos_bancarios').select('*')
      .eq('cuenta_id', cuentaId).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false });
    setMovs((m as any) || []);

    // Documentos: pagos_cxp (egresos) + cfdi_emitidos no demo (ingresos)
    const [{ data: pagos }, { data: cfdis }] = await Promise.all([
      supabase.from('pagos_cxp').select('id, fecha, monto, referencia, compras(numero_compra, proveedores(nombre))')
        .gte('fecha', desde).lte('fecha', hasta),
      supabase.from('cfdi_emitidos').select('id, timbrado_at, total, folio, rfc_receptor, es_demo')
        .eq('es_demo', false).gte('timbrado_at', desde).lte('timbrado_at', hasta + 'T23:59:59'),
    ]);

    const docs: Documento[] = [
      ...((pagos as any[]) || []).map((p: any) => ({
        id: p.id, tipo: 'pago_cxp' as const, fecha: p.fecha, monto: Number(p.monto),
        descripcion: `Pago ${p.compras?.numero_compra || ''} → ${p.compras?.proveedores?.nombre || ''} ${p.referencia ? `(${p.referencia})` : ''}`,
      })),
      ...((cfdis as any[]) || []).map((c: any) => ({
        id: c.id, tipo: 'cfdi' as const, fecha: String(c.timbrado_at).slice(0, 10), monto: Number(c.total),
        descripcion: `CFDI ${c.folio || ''} ← ${c.rfc_receptor || ''}`,
      })),
    ];
    setDocs(docs);
  };

  const sugerencias = useMemo(() => {
    if (!selMov) return [] as Documento[];
    const monto = selMov.cargo > 0 ? selMov.cargo : selMov.abono;
    const tipoEsperado = selMov.cargo > 0 ? 'pago_cxp' : 'cfdi';
    const fechaMov = new Date(selMov.fecha).getTime();
    return docs
      .filter(d => d.tipo === tipoEsperado)
      .map(d => {
        const diffDias = Math.abs((new Date(d.fecha).getTime() - fechaMov) / 86400000);
        const diffMonto = Math.abs(d.monto - monto);
        return { d, diffDias, diffMonto };
      })
      .filter(x => x.diffDias <= tolDias && x.diffMonto <= 0.5)
      .sort((a, b) => (a.diffMonto - b.diffMonto) || (a.diffDias - b.diffDias))
      .map(x => x.d);
  }, [selMov, docs, tolDias]);

  const conciliar = async (mov: Mov, doc: Documento) => {
    const user = (await supabase.auth.getUser()).data.user;
    const { error: e1 } = await supabase.from('conciliacion_bancaria').insert({
      monto: mov.cargo > 0 ? mov.cargo : mov.abono,
      referencia: mov.referencia, fecha_estado_cuenta: mov.fecha, estado: 'conciliado',
      movimiento_id: mov.id, documento_tipo: doc.tipo, documento_id: doc.id,
      conciliado_por: user?.id, conciliado_at: new Date().toISOString(),
    });
    if (e1) { toast.error(e1.message); return; }
    await supabase.from('movimientos_bancarios').update({ conciliado: true }).eq('id', mov.id);
    toast.success('Conciliado'); setSelMov(null); load();
  };

  const desconciliar = async (mov: Mov) => {
    await supabase.from('conciliacion_bancaria').delete().eq('movimiento_id', mov.id);
    await supabase.from('movimientos_bancarios').update({ conciliado: false }).eq('id', mov.id);
    toast.success('Desconciliado'); load();
  };

  const movsFiltrados = movs;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Conciliación Bancaria</h1>
        <p className="text-muted-foreground">Compara movimientos del banco contra pagos a proveedores y CFDIs emitidos</p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div><Label>Cuenta</Label>
            <Select value={cuentaId} onValueChange={setCuentaId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{cuentas.map(c => <SelectItem key={c.id} value={c.id}>{c.alias}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Desde</Label><Input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></div>
          <div><Label>Hasta</Label><Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
          <div><Label>Tolerancia (días)</Label><Input type="number" value={tolDias} onChange={e => setTolDias(parseInt(e.target.value) || 0)} /></div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Movimientos del banco ({movsFiltrados.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Fecha</TableHead><TableHead>Concepto</TableHead>
                <TableHead className="text-right">Monto</TableHead><TableHead>Acciones</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {movsFiltrados.map(m => {
                  const monto = m.cargo > 0 ? m.cargo : m.abono;
                  return (
                    <TableRow key={m.id} className={selMov?.id === m.id ? 'bg-muted' : ''}>
                      <TableCell className="text-xs">{m.fecha}</TableCell>
                      <TableCell className="text-sm max-w-[180px] truncate">{m.concepto || '—'}</TableCell>
                      <TableCell className={`text-right ${m.cargo > 0 ? 'text-destructive' : 'text-green-600'}`}>
                        {m.cargo > 0 ? '-' : '+'}${monto.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {m.conciliado ? (
                          <div className="flex gap-1 items-center">
                            <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3 mr-1" />OK</Badge>
                            <Button size="sm" variant="ghost" onClick={() => desconciliar(m)}><RotateCcw className="h-3 w-3" /></Button>
                          </div>
                        ) : (
                          <Button size="sm" variant={selMov?.id === m.id ? 'default' : 'outline'} onClick={() => setSelMov(m)}>
                            <Link2 className="h-3 w-3 mr-1" />Match
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selMov ? `Sugerencias para ${selMov.fecha} (${sugerencias.length})` : 'Selecciona un movimiento'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!selMov ? (
              <p className="p-6 text-sm text-muted-foreground">Haz clic en "Match" en un movimiento sin conciliar para ver candidatos.</p>
            ) : sugerencias.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Sin coincidencias dentro de la tolerancia. Ajusta filtros o registra el pago/CFDI.</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Tipo</TableHead><TableHead>Fecha</TableHead><TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Monto</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {sugerencias.map(d => (
                    <TableRow key={`${d.tipo}-${d.id}`}>
                      <TableCell><Badge variant="outline">{d.tipo}</Badge></TableCell>
                      <TableCell className="text-xs">{d.fecha}</TableCell>
                      <TableCell className="text-sm max-w-[180px] truncate">{d.descripcion}</TableCell>
                      <TableCell className="text-right">${d.monto.toFixed(2)}</TableCell>
                      <TableCell><Button size="sm" onClick={() => conciliar(selMov, d)}>Conciliar</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ConciliacionPage;
