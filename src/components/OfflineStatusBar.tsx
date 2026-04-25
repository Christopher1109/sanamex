import { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CloudUpload } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { countRequiresReview } from '@/lib/offline/sync';
import { Link } from 'react-router-dom';

const formatRelative = (iso: string | null) => {
  if (!iso) return 'nunca';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
};

export const OfflineStatusBar = () => {
  const { status, lastSync, pendingCount, syncing, runSync, hoursSinceSync } = useOfflineSync();
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    const update = () => countRequiresReview().then(setReviewCount);
    update();
    const id = setInterval(update, 10_000);
    return () => clearInterval(id);
  }, []);

  const isOffline = status === 'offline';
  const longOffline = isOffline && hoursSinceSync !== null && hoursSinceSync >= 24;
  const criticalOffline = isOffline && hoursSinceSync !== null && hoursSinceSync >= 48;
  const blockingOffline = isOffline && hoursSinceSync !== null && hoursSinceSync >= 72;

  // Hide bar when fully online with no pending and no review
  if (status === 'online' && pendingCount === 0 && reviewCount === 0 && !syncing) {
    return null;
  }

  const tone = blockingOffline
    ? 'bg-destructive text-destructive-foreground'
    : criticalOffline
    ? 'bg-destructive/15 text-destructive border-b border-destructive/30'
    : longOffline
    ? 'bg-warning/15 text-warning-foreground border-b border-warning/30'
    : isOffline
    ? 'bg-muted text-muted-foreground border-b'
    : syncing
    ? 'bg-primary/10 text-primary border-b border-primary/20'
    : 'bg-warning/10 text-warning-foreground border-b border-warning/20';

  return (
    <div className={cn('flex items-center justify-between gap-3 px-4 py-2 text-sm', tone)}>
      <div className="flex items-center gap-2 flex-wrap">
        {isOffline ? <WifiOff className="h-4 w-4" /> : syncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
        <span className="font-medium">
          {syncing
            ? 'Sincronizando…'
            : isOffline
            ? 'Modo offline'
            : 'Conectado'}
        </span>
        <span className="text-xs opacity-80">Última sincronización: {formatRelative(lastSync)}</span>
        {pendingCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-background/40 px-2 py-0.5 text-xs">
            <CloudUpload className="h-3 w-3" />
            {pendingCount} venta(s) pendiente(s) de subir
          </span>
        )}
        {reviewCount > 0 && (
          <Link
            to="/conflictos"
            className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs hover:bg-destructive/30"
          >
            <AlertTriangle className="h-3 w-3" />
            {reviewCount} requiere(n) revisión
          </Link>
        )}
        {blockingOffline && (
          <span className="font-semibold">⚠ Más de 72 h offline. Reconectarse para continuar operando con seguridad.</span>
        )}
        {!blockingOffline && criticalOffline && (
          <span>⚠ Más de 48 h sin sincronizar. El inventario local puede estar desactualizado.</span>
        )}
        {!criticalOffline && longOffline && (
          <span>Llevas más de 24 h sin sincronizar. Conéctate pronto.</span>
        )}
      </div>
      <div>
        <Button size="sm" variant={blockingOffline ? 'secondary' : 'outline'} onClick={runSync} disabled={syncing || isOffline}>
          {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
        </Button>
      </div>
    </div>
  );
};

export default OfflineStatusBar;
