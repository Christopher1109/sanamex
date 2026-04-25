import { useEffect, useState } from 'react';
import { offlineDB, type PendingVenta } from '@/lib/offline/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { processPendingQueue } from '@/lib/offline/sync';
import { toast } from 'sonner';

const ConflictosPage = () => {
  const [items, setItems] = useState<PendingVenta[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const all = await offlineDB.pending_ventas
      .where('status')
      .anyOf('requires_review', 'error', 'pending')
      .reverse()
      .sortBy('created_at');
    setItems(all);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const retry = async () => {
    await processPendingQueue();
    await load();
  };

  const dismiss = async (uuid: string) => {
    await offlineDB.pending_ventas.delete(uuid);
    toast.success('Registro descartado del dispositivo. La venta sigue en el servidor si fue sincronizada.');
    await load();
  };

  const grouped = {
    requires_review: items.filter(i => i.status === 'requires_review'),
    error: items.filter(i => i.status === 'error'),
    pending: items.filter(i => i.status === 'pending'),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conflictos & Ventas Pendientes</h1>
          <p className="text-muted-foreground">Ventas creadas en modo offline que requieren atención</p>
        </div>
        <Button onClick={retry} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" /> Reintentar sincronización
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay ventas offline pendientes ni con conflictos. ✅
          </CardContent>
        </Card>
      ) : (
        <>
          {grouped.requires_review.length > 0 && (
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" /> Requieren revisión ({grouped.requires_review.length})
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Ventas que se procesaron pero el stock real al sincronizar no era suficiente.
                  Verifica con un gerente y ajusta el inventario manualmente si corresponde.
                </p>
              </CardHeader>
              <CardContent>
                <ConflictTable items={grouped.requires_review} onDismiss={dismiss} />
              </CardContent>
            </Card>
          )}

          {grouped.error.length > 0 && (
            <Card className="border-warning/40">
              <CardHeader>
                <CardTitle className="text-warning-foreground">Con error ({grouped.error.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ConflictTable items={grouped.error} onDismiss={dismiss} />
              </CardContent>
            </Card>
          )}

          {grouped.pending.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Pendientes de sincronizar ({grouped.pending.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ConflictTable items={grouped.pending} onDismiss={dismiss} />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

const ConflictTable = ({ items, onDismiss }: { items: PendingVenta[]; onDismiss: (u: string) => void }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Fecha local</TableHead>
        <TableHead>N° servidor</TableHead>
        <TableHead>Items</TableHead>
        <TableHead className="text-right">Total</TableHead>
        <TableHead>Estado</TableHead>
        <TableHead>Detalle</TableHead>
        <TableHead></TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {items.map(v => (
        <TableRow key={v.cliente_uuid_local}>
          <TableCell className="text-xs">{new Date(v.created_at).toLocaleString()}</TableCell>
          <TableCell className="font-mono text-xs">{v.numero_venta_servidor || '—'}</TableCell>
          <TableCell className="text-xs max-w-[300px] truncate">
            {v.items.map(i => `${i.cantidad}× ${i.nombre}`).join(', ')}
          </TableCell>
          <TableCell className="text-right font-medium">${v.total.toFixed(2)}</TableCell>
          <TableCell>
            {v.status === 'requires_review' && <Badge variant="destructive">Revisar</Badge>}
            {v.status === 'error' && <Badge className="bg-warning text-warning-foreground">Error</Badge>}
            {v.status === 'pending' && <Badge variant="secondary">Pendiente</Badge>}
          </TableCell>
          <TableCell className="text-xs text-muted-foreground max-w-[300px]">
            {v.error_message || '—'}
          </TableCell>
          <TableCell>
            <Button size="sm" variant="ghost" onClick={() => onDismiss(v.cliente_uuid_local)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

export default ConflictosPage;
