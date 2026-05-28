import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

export default function RecomendacionesPage() {
  const { selectedSucursal } = useSucursal();
  const [rec, setRec] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (selectedSucursal) load(false); }, [selectedSucursal]);

  async function load(force: boolean) {
    if (!selectedSucursal) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('recomendaciones-compra', {
      body: { sucursal_id: selectedSucursal.id, force },
    });
    if (error || data?.error) { toast.error(error?.message || data?.error || 'Error'); setLoading(false); return; }
    setRec(data.recomendacion);
    if (data.cached) toast.info('Usando caché (< 24h). Pulsa Regenerar para forzar.');
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Recomendaciones IA</h1>
            <p className="text-sm text-muted-foreground">Sugerencias de compra basadas en histórico de ventas y caducidades.</p>
          </div>
        </div>
        <Button onClick={() => load(true)} disabled={loading || !selectedSucursal}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Regenerar
        </Button>
      </div>

      {!selectedSucursal && <Card className="p-6 text-center text-muted-foreground">Selecciona una sucursal.</Card>}
      {loading && <Card className="p-6 text-center">Analizando datos con IA…</Card>}

      {rec && (
        <>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Resumen IA</h2>
              <Badge variant="outline">{rec.modelo}</Badge>
            </div>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">{rec.resumen_ia}</div>
            <p className="text-xs text-muted-foreground mt-3">Generada: {new Date(rec.generada_at).toLocaleString()}</p>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold mb-3">Top productos por demanda (90 días)</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {(rec.payload?.top_ventas || []).slice(0, 15).map((p: any) => (
                <div key={p.sku} className="border rounded p-2 text-sm">
                  <div className="font-medium truncate">{p.nombre}</div>
                  <div className="text-xs text-muted-foreground">{p.sku}</div>
                  <div className="flex justify-between mt-1">
                    <span>Vendidos: <b>{p.total}</b></span>
                    <span className="text-primary">~{p.promedio_diario}/día</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {rec.payload?.caducando?.length > 0 && (
            <Card className="p-5">
              <h2 className="font-semibold mb-3 text-amber-600">Lotes próximos a caducar</h2>
              <ul className="text-sm space-y-1">
                {rec.payload.caducando.map((c: any, i: number) => (
                  <li key={i} className="flex justify-between border-b py-1">
                    <span>{c.nombre} <span className="text-muted-foreground">({c.sku})</span></span>
                    <span className="text-amber-600">{c.fecha_caducidad}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
