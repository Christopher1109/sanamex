import { useEffect, useState, useCallback } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { fullSnapshot, processPendingQueue, countPending } from '@/lib/offline/sync';
import { getMeta, META_KEYS } from '@/lib/offline/db';
import { useSucursal } from '@/contexts/SucursalContext';

const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 min

export function useOfflineSync() {
  const status = useOnlineStatus();
  const { selectedSucursal } = useSucursal();
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshMeta = useCallback(async () => {
    const ts = await getMeta<string>(META_KEYS.LAST_SYNC);
    setLastSync(ts);
    setPendingCount(await countPending());
  }, []);

  const runSync = useCallback(async () => {
    if (status !== 'online' || syncing) return;
    setSyncing(true);
    try {
      // Process pending sales first
      await processPendingQueue();
      // Refresh snapshot
      await fullSnapshot(selectedSucursal?.id);
      await refreshMeta();
    } catch (e) {
      console.error('Sync error:', e);
    } finally {
      setSyncing(false);
    }
  }, [status, syncing, selectedSucursal?.id, refreshMeta]);

  // Initial load + periodic
  useEffect(() => {
    refreshMeta();
  }, [refreshMeta]);

  useEffect(() => {
    if (status !== 'online') return;
    runSync();
    const id = setInterval(runSync, AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, selectedSucursal?.id]);

  // Refresh count periodically
  useEffect(() => {
    const id = setInterval(refreshMeta, 10_000);
    return () => clearInterval(id);
  }, [refreshMeta]);

  const hoursSinceSync = lastSync
    ? (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60)
    : null;

  return {
    status,
    lastSync,
    pendingCount,
    syncing,
    runSync,
    hoursSinceSync,
  };
}
