import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Upload, ImageIcon, CheckCircle2, AlertTriangle, Clock, Wallet } from 'lucide-react';
import { toast } from 'sonner';

type Compra = {
  id: string;
  numero_compra: string;
  proveedor_id: string;
  total: number;
  estado: string;
  pagada: boolean;
  fecha_factura: string | null;
  fecha_pago_limite: string | null;
  fecha_pago_real: string | null;
  comprobante_pago_url: string | null;
  notas_pago: string | null;
  created_at: string;
  proveedores?: { nombre: string; plazo_pago_dias: number } | null;
};

const diasEntre = (dateStr: string | null): number | null => {
  if (!dateStr) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.floor((target.getTime() - hoy.getTime()) / 86400000);
};

const CuentasPorPagarPage = () => {
  const { selectedSucursal } = useSucursal();
  const [compras, setCompras] = useState<Compra[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'pendientes' | 'vencidas' | 'pagadas' | 'todas'>('pendientes');
  const [showPago, setShowPago] = useState<Compra | null>(null);
  const [pagoFile, setPagoFile] = useState<File | null>(null);
  const [pagoNotas, setPagoNotas] = useState('');
  const [pagoFecha, setPagoFecha] = useState(new Date().toISOString().slice(0, 10));
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (selectedSucursal) load(); }, [selectedSucursal]);

  const load = async () => {
    if (!selectedSucursal) return;
    setLoading(true);
    // Solo compras ya recibidas (con factura cargada) o pagadas — las "ordenadas" no entran a CxP hasta tener factura
    const { data } = await supabase.from('compras')
      .select('*, proveedores(nombre, plazo_pago_dias)')
      .eq('sucursal_id', selectedSucursal.id)
      .neq('estado', 'cancelada')
      .not('fecha_factura', 'is', null)
      .order('fecha_pago_limite', { ascending: true, nullsFirst: false });
    setCompras((data as any) || []);
    setLoading(false);
  };

  const openPago = (c: Compra) => {
    setShowPago(c);
    setPagoFile(null);
    setPagoNotas(c.notas_pago || '');
    setPagoFecha(new Date().toISOString().slice(0, 10));
  };

  const processPago = async () => {
    if (!showPago) return;
    setUploading(true);
    let comprobantePath: string | null = showPago.comprobante_pago_url;

    if (pagoFile) {
      const ext = pagoFile.name.split('.').pop();
      const filePath = `${showPago.id}/comprobante_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('comprobantes-pago').upload(filePath, pagoFile);
      if (upErr) { toast.error('Error subiendo comprobante'); setUploading(false); return; }
      comprobantePath = filePath;
    }

    await supabase.from('compras').update({
      pagada: true,
      fecha_pago_real: pagoFecha,
      comprobante_pago_url: comprobantePath,
      notas_pago: pagoNotas || null,
      estado: showPago.estado === 'ordenada' ? 'pagada' : showPago.estado,
    } as any).eq('id', showPago.id);

    const user = (await supabase.auth.getUser()).data.user;
    await supabase.from('audit_log').insert({
      entidad: 'compra', accion: 'Pago a proveedor registrado', entidad_id: showPago.id,
      usuario_id: user?.id, usuario_nombre: user?.email,
      sucursal_id: selectedSucursal!.id,
      datos_despues: { fecha_pago: pagoFecha, monto: showPago.total },
    });

    toast.success(`Pago de $${Number(showPago.total).toFixed(2)} registrado`);
    setShowPago(null);
    setUploading(false);
    load();
  };

  const viewComprobante = async (path: string) => {
    if (path.startsWith('http')) { window.open(path, '_blank'); return; }
    const { data, error } = await supabase.storage.from('comprobantes-pago').createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { toast.error('No se pudo abrir el comprobante'); return; }
    window.open(data.signedUrl, '_blank');
  };

  const filtradas = compras.filter(c => {
    if (filtro === 'todas') return true;
    if (filtro === 'pagadas') return c.pagada;
    if (filtro === 'pendientes') return !c.pagada;
    if (filtro === 'vencidas') {
      const dias = diasEntre(c.fecha_pago_limite);
      return !c.pagada && dias !== null && dias < 0;
    }
    return true;
  });

  // KPIs
  const pendientes = compras.filter(c => !c.pagada);
  const totalPendiente = pendientes.reduce((s, c) => s + Number(c.total), 0);
  const vencidas = pendientes.filter(c => { const d = diasEntre(c.fecha_pago_limite); return d !== null && d < 0; });
  const totalVencido = vencidas.reduce((s, c) => s + Number(c.total), 0);
  const proximas = pendientes.filter(c => { const d = diasEntre(c.fecha_pago_limite); return d !== null && d >= 0 && d <= 7; });
  const totalProximo = proximas.reduce((s, c) => s + Number(c.total), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cuentas por Pagar</h1>
        <p className="text-muted-foreground">{selectedSucursal?.nombre} — gestión de pagos a proveedores</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Total por pagar</p><Wallet className="h-4 w-4 text-muted-foreground" /></div>
          <p className="text-2xl font-bold mt-1">${totalPendiente.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted-foreground">{pendientes.length} compras</p>
        </CardContent></Card>
        <Card className="border-destructive/50"><CardContent className="p-4">
          <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Vencidas</p><AlertTriangle className="h-4 w-4 text-destructive" /></div>
          <p className="text-2xl font-bold mt-1 text-destructive">${totalVencido.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted-foreground">{vencidas.length} compras</p>
        </CardContent></Card>
        <Card className="border-amber-500/50"><CardContent className="p-4">
          <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Vencen en 7 días</p><Clock className="h-4 w-4 text-amber-500" /></div>
          <p className="text-2xl font-bold mt-1 text-amber-600">${totalProximo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted-foreground">{proximas.length} compras</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Pagadas</p><CheckCircle2 className="h-4 w-4 text-green-600" /></div>
          <p className="text-2xl font-bold mt-1">{compras.filter(c => c.pagada).length}</p>
          <p className="text-xs text-muted-foreground">histórico</p>
        </CardContent></Card>
      </div>

      <Tabs value={filtro} onValueChange={(v: any) => setFiltro(v)}>
        <TabsList>
          <TabsTrigger value="pendientes">Pendientes ({pendientes.length})</TabsTrigger>
          <TabsTrigger value="vencidas">Vencidas ({vencidas.length})</TabsTrigger>
          <TabsTrigger value="pagadas">Pagadas</TabsTrigger>
          <TabsTrigger value="todas">Todas</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead># OC</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Fecha factura</TableHead>
                <TableHead>Pago límite</TableHead>
                <TableHead className="text-center">Estatus</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow>
              ) : filtradas.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin compras en este filtro</TableCell></TableRow>
              ) : filtradas.map(c => {
                const dias = diasEntre(c.fecha_pago_limite);
                let statusBadge;
                if (c.pagada) {
                  statusBadge = <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Pagada</Badge>;
                } else if (dias === null) {
                  statusBadge = <Badge variant="secondary">Sin fecha</Badge>;
                } else if (dias < 0) {
                  statusBadge = <Badge variant="destructive">Vencida hace {Math.abs(dias)}d</Badge>;
                } else if (dias <= 7) {
                  statusBadge = <Badge className="bg-amber-500 hover:bg-amber-600">Vence en {dias}d</Badge>;
                } else {
                  statusBadge = <Badge variant="secondary">En {dias}d</Badge>;
                }
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-bold text-sm">{c.numero_compra}</TableCell>
                    <TableCell>{c.proveedores?.nombre || '—'}</TableCell>
                    <TableCell className="text-sm">{c.fecha_factura ? new Date(c.fecha_factura + 'T00:00:00').toLocaleDateString('es-MX') : '—'}</TableCell>
                    <TableCell className="text-sm">{c.fecha_pago_limite ? new Date(c.fecha_pago_limite + 'T00:00:00').toLocaleDateString('es-MX') : '—'}</TableCell>
                    <TableCell className="text-center">{statusBadge}</TableCell>
                    <TableCell className="text-right font-bold">${Number(c.total).toFixed(2)}</TableCell>
                    <TableCell className="space-x-1">
                      {!c.pagada && (
                        <Button size="sm" onClick={() => openPago(c)}><Wallet className="h-4 w-4 mr-1" />Registrar pago</Button>
                      )}
                      {c.comprobante_pago_url && (
                        <Button size="sm" variant="outline" onClick={() => viewComprobante(c.comprobante_pago_url!)}>Ver comprobante</Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog pago */}
      <Dialog open={!!showPago} onOpenChange={(o) => { if (!o) setShowPago(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pago — {showPago?.numero_compra}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/40 rounded-md p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Proveedor:</span><strong>{showPago?.proveedores?.nombre}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Monto:</span><strong>${Number(showPago?.total || 0).toFixed(2)}</strong></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Fecha límite:</span><strong>{showPago?.fecha_pago_limite || '—'}</strong></div>
            </div>
            <div>
              <Label>Fecha de pago real *</Label>
              <Input type="date" value={pagoFecha} onChange={e => setPagoFecha(e.target.value)} />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea rows={2} value={pagoNotas} onChange={e => setPagoNotas(e.target.value)} placeholder="Referencia bancaria, método..." />
            </div>
            <div>
              <Label>Comprobante (opcional)</Label>
              <div className="mt-2 border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50" onClick={() => fileRef.current?.click()}>
                {pagoFile ? (
                  <div className="flex items-center justify-center gap-2"><ImageIcon className="h-5 w-5 text-primary" /><span className="text-sm">{pagoFile.name}</span></div>
                ) : (
                  <div><Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" /><p className="text-sm text-muted-foreground">Subir imagen o PDF</p></div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setPagoFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPago(null)} disabled={uploading}>Cancelar</Button>
            <Button onClick={processPago} disabled={uploading}>{uploading ? 'Guardando...' : 'Confirmar pago'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CuentasPorPagarPage;
