import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';

interface Notif {
  id: string;
  tipo: string;
  severidad: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  created_at: string;
}

export function NotificacionesBell() {
  const { selectedSucursal } = useSucursal();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('notif-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones' }, () => load())
      .subscribe();
    const i = setInterval(load, 60000);
    return () => { supabase.removeChannel(ch); clearInterval(i); };
  }, [selectedSucursal]);

  async function load() {
    let q = supabase.from('notificaciones').select('*').order('created_at', { ascending: false }).limit(20);
    if (selectedSucursal) q = q.or(`sucursal_id.eq.${selectedSucursal.id},sucursal_id.is.null`);
    const { data } = await q;
    setNotifs((data as Notif[]) || []);
  }

  async function marcarLeida(id: string) {
    await supabase.from('notificaciones').update({ leida: true, leida_at: new Date().toISOString() }).eq('id', id);
    load();
  }
  async function marcarTodasLeidas() {
    const ids = notifs.filter(n => !n.leida).map(n => n.id);
    if (!ids.length) return;
    await supabase.from('notificaciones').update({ leida: true, leida_at: new Date().toISOString() }).in('id', ids);
    load();
  }

  const noLeidas = notifs.filter(n => !n.leida).length;

  const sevColor: Record<string, string> = {
    critical: 'text-red-600',
    warning: 'text-amber-600',
    info: 'text-blue-600',
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {noLeidas > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs">{noLeidas}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-semibold">Notificaciones</h3>
          {noLeidas > 0 && <Button size="sm" variant="ghost" onClick={marcarTodasLeidas}>Marcar todas</Button>}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifs.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Sin notificaciones.</div>}
          {notifs.map(n => (
            <button key={n.id} onClick={() => marcarLeida(n.id)} className={`w-full text-left p-3 border-b hover:bg-muted/50 ${!n.leida ? 'bg-muted/30' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <span className={`font-medium text-sm ${sevColor[n.severidad] || ''}`}>{n.titulo}</span>
                {!n.leida && <span className="h-2 w-2 rounded-full bg-primary mt-1.5" />}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{n.mensaje}</p>
              <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
