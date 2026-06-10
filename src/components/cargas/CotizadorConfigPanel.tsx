import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function CotizadorConfigPanel() {
  const { user, userRole } = useAuth();
  const puedeEditar = ['admin', 'super_admin'].includes(userRole || '');
  const [id, setId] = useState<string | null>(null);
  const [monto, setMonto] = useState<number>(50000);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from('cotizador_config')
        .select('id, monto_aprobacion_oc').eq('activo', true).maybeSingle();
      if (data) { setId(data.id); setMonto(Number(data.monto_aprobacion_oc)); }
      setLoading(false);
    })();
  }, []);

  async function guardar() {
    if (!puedeEditar) return;
    setSaving(true);
    const payload: any = { monto_aprobacion_oc: monto, modificado_por: user?.id, updated_at: new Date().toISOString() };
    const { error } = id
      ? await (supabase as any).from('cotizador_config').update(payload).eq('id', id)
      : await (supabase as any).from('cotizador_config').insert({ ...payload, activo: true });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Umbral actualizado');
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <Label>Monto umbral para aprobación de OCs (MXN)</Label>
        <Input
          type="number" min={0} step={1000} value={monto}
          onChange={e => setMonto(parseFloat(e.target.value || '0'))}
          disabled={!puedeEditar}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Cualquier OC con total ≥ este monto entrará en estado <strong>pendiente_aprobacion</strong>.
        </p>
      </div>
      <Button onClick={guardar} disabled={!puedeEditar || saving}>
        {saving ? 'Guardando…' : 'Guardar'}
      </Button>
      {!puedeEditar && <p className="text-xs text-amber-600">Solo admin o super_admin pueden modificar este valor.</p>}
    </div>
  );
}
