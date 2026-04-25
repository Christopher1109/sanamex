import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ConnectionStatus = 'online' | 'offline' | 'checking';

const PING_INTERVAL_MS = 30_000; // every 30s

let listeners: Array<(s: ConnectionStatus) => void> = [];
let currentStatus: ConnectionStatus = navigator.onLine ? 'online' : 'offline';
let pingTimer: number | null = null;

async function realPing(): Promise<boolean> {
  if (!navigator.onLine) return false;
  try {
    // Lightweight authenticated query — counts as a true reachability test
    const { error } = await supabase.from('sucursales').select('id', { count: 'exact', head: true }).limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function refresh() {
  const prev = currentStatus;
  currentStatus = 'checking';
  notify();
  const ok = await realPing();
  currentStatus = ok ? 'online' : 'offline';
  if (prev !== currentStatus) notify();
  else notify();
}

function notify() {
  listeners.forEach((l) => l(currentStatus));
}

function startPolling() {
  if (pingTimer) return;
  pingTimer = window.setInterval(refresh, PING_INTERVAL_MS);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', refresh);
  window.addEventListener('offline', () => {
    currentStatus = 'offline';
    notify();
  });
  startPolling();
  // Initial check
  refresh();
}

export function useOnlineStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(currentStatus);
  useEffect(() => {
    listeners.push(setStatus);
    setStatus(currentStatus);
    return () => {
      listeners = listeners.filter((l) => l !== setStatus);
    };
  }, []);
  return status;
}

export async function forceCheckOnline(): Promise<ConnectionStatus> {
  await refresh();
  return currentStatus;
}
