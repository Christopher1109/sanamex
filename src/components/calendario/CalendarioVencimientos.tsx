import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Wallet, HandCoins, Loader2 } from 'lucide-react';

/**
 * Vista de calendario de vencimientos — Cuentas por Pagar y Cuentas por
 * Cobrar (junta SANAMEX 15-ago-2026, punto 6): Isaac la propuso "como
 * Google Calendar" como alternativa a la lista, Alejandro la aprobó.
 * Diseño acordado: tarjetas/días marcados, al entrar a un día se despliegan
 * los créditos de ese día. Se usa el mismo componente en Cuentas por Pagar
 * y en Cuentas por Cobrar para no duplicar lógica ni tener dos calendarios
 * distintos que se puedan desincronizar.
 *
 * Fuentes de datos:
 *  - CxP: `cxp_facturas_pendientes` ya trae fecha_limite_pago POR FACTURA,
 *    así que el vencimiento que se marca en el día es exacto.
 *  - CxC: `cxc_resumen` solo trae un agregado POR CLIENTE (venta_mas_antigua
 *    + dias_credito), no un vencimiento por venta individual. El día que se
 *    marca aquí es una fecha aproximada (venta_mas_antigua + dias_credito)
 *    del portafolio de crédito de ese cliente, no de una factura específica.
 *    Si más adelante se necesita el vencimiento exacto por venta, hay que
 *    exponer fecha_limite_pago a nivel venta en una RPC nueva.
 */

type EventoCxP = {
  tipo: 'cxp';
  id: string;
  fecha: string; // YYYY-MM-DD
  nombre: string;
  folio: string;
  monto: number;
  vencido: boolean;
};

type EventoCxC = {
  tipo: 'cxc';
  id: string;
  fecha: string; // YYYY-MM-DD (aproximada, ver nota arriba)
  nombre: string;
  folio: string;
  monto: number;
  vencido: boolean;
};

type Evento = EventoCxP | EventoCxC;

const money = (n: number) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function CalendarioVencimientos() {
  const hoy = new Date();
  const [mesActual, setMesActual] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [loading, setLoading] = useState(true);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(toISODate(hoy));

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: facturas }, { data: cxc }] = await Promise.all([
      (supabase as any).rpc('cxp_facturas_pendientes'),
      (supabase as any).rpc('cxc_resumen'),
    ]);

    const eventosCxP: EventoCxP[] = (facturas || [])
      .filter((f: any) => !f.pagada && f.fecha_limite_pago && Number(f.saldo || 0) > 0.009)
      .map((f: any) => ({
        tipo: 'cxp' as const,
        id: f.factura_id,
        fecha: String(f.fecha_limite_pago).slice(0, 10),
        nombre: f.proveedor_nombre || 'Proveedor',
        folio: f.folio_factura,
        monto: Number(f.saldo || 0),
        vencido: (f.dias_para_vencer ?? 0) < 0,
      }));

    const eventosCxC: EventoCxC[] = (cxc || [])
      .filter((c: any) => Number(c.saldo || 0) > 0.009 && c.venta_mas_antigua)
      .map((c: any) => {
        const base = new Date(String(c.venta_mas_antigua).slice(0, 10) + 'T00:00:00');
        base.setDate(base.getDate() + Number(c.dias_credito ?? 30));
        return {
          tipo: 'cxc' as const,
          id: c.cliente_id,
          fecha: toISODate(base),
          nombre: c.cliente_nombre,
          folio: `${c.num_ventas} venta${c.num_ventas === 1 ? '' : 's'} a crédito`,
          monto: Number(c.saldo || 0),
          vencido: !!c.vencido,
        };
      });

    setEventos([...eventosCxP, ...eventosCxC]);
    setLoading(false);
  }

  const eventosPorDia = useMemo(() => {
    const map = new Map<string, Evento[]>();
    for (const ev of eventos) {
      const lista = map.get(ev.fecha) || [];
      lista.push(ev);
      map.set(ev.fecha, lista);
    }
    return map;
  }, [eventos]);

  const diasDelMes = useMemo(() => {
    const anio = mesActual.getFullYear();
    const mes = mesActual.getMonth();
    const primerDia = new Date(anio, mes, 1);
    const ultimoDia = new Date(anio, mes + 1, 0);
    const inicioGrid = new Date(primerDia);
    inicioGrid.setDate(inicioGrid.getDate() - primerDia.getDay());
    const dias: Date[] = [];
    const cursor = new Date(inicioGrid);
    // Siempre 6 filas (42 días) para que la altura del calendario no salte entre meses.
    for (let i = 0; i < 42; i++) {
      dias.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return { dias, mes, ultimoDia };
  }, [mesActual]);

  const cambiarMes = (delta: number) => {
    setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + delta, 1));
  };

  const eventosDelDiaSeleccionado = diaSeleccionado ? (eventosPorDia.get(diaSeleccionado) || []) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">
            {MESES[diasDelMes.mes]} {mesActual.getFullYear()}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => cambiarMes(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setMesActual(new Date(hoy.getFullYear(), hoy.getMonth(), 1))}>Hoy</Button>
            <Button size="sm" variant="outline" onClick={() => cambiarMes(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {DIAS_SEMANA.map((d) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
              ))}
              {diasDelMes.dias.map((dia, i) => {
                const iso = toISODate(dia);
                const fueraDeMes = dia.getMonth() !== diasDelMes.mes;
                const esHoy = iso === toISODate(hoy);
                const evs = eventosPorDia.get(iso) || [];
                const cxp = evs.filter((e) => e.tipo === 'cxp');
                const cxc = evs.filter((e) => e.tipo === 'cxc');
                const totalDia = evs.reduce((s, e) => s + e.monto, 0);
                const hayVencidos = evs.some((e) => e.vencido);
                return (
                  <button
                    key={i}
                    onClick={() => setDiaSeleccionado(iso)}
                    className={`min-h-[64px] rounded-md border p-1.5 text-left transition-colors ${
                      fueraDeMes ? 'opacity-40' : ''
                    } ${diaSeleccionado === iso ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${esHoy ? 'font-bold text-primary' : ''}`}>{dia.getDate()}</span>
                      {hayVencidos && <span className="h-1.5 w-1.5 rounded-full bg-destructive" />}
                    </div>
                    {evs.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {cxp.length > 0 && (
                          <div className="text-[10px] text-orange-600 flex items-center gap-0.5">
                            <Wallet className="h-2.5 w-2.5" /> {cxp.length}
                          </div>
                        )}
                        {cxc.length > 0 && (
                          <div className="text-[10px] text-blue-600 flex items-center gap-0.5">
                            <HandCoins className="h-2.5 w-2.5" /> {cxc.length}
                          </div>
                        )}
                        <div className="text-[10px] font-medium truncate">{money(totalDia)}</div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Wallet className="h-3 w-3 text-orange-600" /> Por pagar</span>
            <span className="flex items-center gap-1"><HandCoins className="h-3 w-3 text-blue-600" /> Por cobrar</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-destructive inline-block" /> Con vencidos</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {diaSeleccionado ? new Date(diaSeleccionado + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Selecciona un día'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[420px] overflow-y-auto">
          {eventosDelDiaSeleccionado.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin vencimientos este día.</p>
          ) : (
            eventosDelDiaSeleccionado
              .sort((a, b) => b.monto - a.monto)
              .map((ev) => (
                <div key={`${ev.tipo}-${ev.id}`} className="flex items-start justify-between gap-2 rounded-md border p-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{ev.nombre}</p>
                    <p className="text-xs text-muted-foreground truncate">{ev.folio}</p>
                    {ev.tipo === 'cxc' && (
                      <p className="text-[10px] text-muted-foreground">Fecha aproximada (portafolio de crédito)</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant={ev.tipo === 'cxp' ? 'outline' : 'secondary'} className={ev.tipo === 'cxp' ? 'border-orange-500 text-orange-600' : 'border-blue-500 text-blue-600'}>
                      {ev.tipo === 'cxp' ? 'Por pagar' : 'Por cobrar'}
                    </Badge>
                    <p className={`text-sm font-bold mt-1 ${ev.vencido ? 'text-destructive' : ''}`}>{money(ev.monto)}</p>
                  </div>
                </div>
              ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
