import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, FileText, Loader2 } from 'lucide-react';

/**
 * Portal público de autofacturación (junta 15-ago-2026).
 *
 * El cliente entra sin cuenta, identifica su ticket con sucursal + folio +
 * total y captura sus datos fiscales. La validación y el registro se hacen en
 * la función de servidor `autofactura-solicitar`; el timbrado lo dispara el
 * personal desde Ventas.
 */

const REGIMENES = [
  { v: '601', t: '601 — General de Ley Personas Morales' },
  { v: '603', t: '603 — Personas Morales con Fines no Lucrativos' },
  { v: '605', t: '605 — Sueldos y Salarios' },
  { v: '606', t: '606 — Arrendamiento' },
  { v: '612', t: '612 — Actividades Empresariales y Profesionales' },
  { v: '616', t: '616 — Sin obligaciones fiscales' },
  { v: '621', t: '621 — Incorporación Fiscal' },
  { v: '626', t: '626 — RESICO' },
];

const USOS = [
  { v: 'G01', t: 'G01 — Adquisición de mercancías' },
  { v: 'G03', t: 'G03 — Gastos en general' },
  { v: 'D01', t: 'D01 — Honorarios médicos y gastos hospitalarios' },
  { v: 'P01', t: 'P01 — Por definir' },
  { v: 'S01', t: 'S01 — Sin efectos fiscales' },
];

const AutofacturacionPage = () => {
  const [sucursales, setSucursales] = useState<{ id: string; nombre: string }[]>([]);
  const [form, setForm] = useState({
    sucursal_id: '', folio: '', total: '',
    rfc: '', razon_social: '', regimen_fiscal: '616', codigo_postal: '', email: '', uso_cfdi: 'G03',
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  useEffect(() => {
    (supabase as any).from('sucursales').select('id, nombre').eq('activa', true).order('nombre')
      .then(({ data }: any) => setSucursales((data as any[]) || []));
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setExito(null); setEnviando(true);
    const { data, error: fnErr } = await supabase.functions.invoke('autofactura-solicitar', {
      body: { ...form, total: Number(form.total) },
    });
    setEnviando(false);
    const msg = (data as any)?.error;
    if (fnErr || msg) { setError(msg || fnErr?.message || 'No se pudo enviar la solicitud'); return; }
    setExito((data as any)?.mensaje || 'Solicitud registrada.');
  }

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold">Facturación en línea</h1>
          <p className="text-sm text-muted-foreground">
            Captura los datos de tu ticket y tus datos fiscales. Solo puedes facturar dentro del mismo mes de tu compra.
          </p>
        </div>

        {exito ? (
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
              <p className="font-medium">{exito}</p>
              <Button variant="outline" onClick={() => { setExito(null); setForm({ ...form, folio: '', total: '' }); }}>
                Facturar otro ticket
              </Button>
            </CardContent>
          </Card>
        ) : (
          <form onSubmit={enviar}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Datos del ticket</CardTitle>
                <CardDescription>Los encuentras impresos en tu comprobante de compra.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-1">
                    <Label>Sucursal</Label>
                    <Select value={form.sucursal_id} onValueChange={(v) => set('sucursal_id', v)}>
                      <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                      <SelectContent>
                        {sucursales.map((s) => (<SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Folio del ticket</Label>
                    <Input value={form.folio} onChange={(e) => set('folio', e.target.value)} placeholder="Ej. V-000123" />
                  </div>
                  <div>
                    <Label>Total pagado</Label>
                    <Input type="number" step="0.01" value={form.total} onChange={(e) => set('total', e.target.value)} placeholder="0.00" />
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <p className="text-sm font-medium mb-3">Datos fiscales</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>RFC</Label>
                      <Input value={form.rfc} onChange={(e) => set('rfc', e.target.value.toUpperCase())} placeholder="XAXX010101000" />
                    </div>
                    <div>
                      <Label>Razón social / Nombre</Label>
                      <Input value={form.razon_social} onChange={(e) => set('razon_social', e.target.value)} />
                    </div>
                    <div>
                      <Label>Régimen fiscal</Label>
                      <Select value={form.regimen_fiscal} onValueChange={(v) => set('regimen_fiscal', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {REGIMENES.map((r) => (<SelectItem key={r.v} value={r.v}>{r.t}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Código postal fiscal</Label>
                      <Input value={form.codigo_postal} onChange={(e) => set('codigo_postal', e.target.value)} maxLength={5} placeholder="00000" />
                    </div>
                    <div>
                      <Label>Correo para recibir la factura</Label>
                      <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
                    </div>
                    <div>
                      <Label>Uso del CFDI</Label>
                      <Select value={form.uso_cfdi} onValueChange={(v) => set('uso_cfdi', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {USOS.map((u) => (<SelectItem key={u.v} value={u.v}>{u.t}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

                <Button type="submit" className="w-full" disabled={enviando}>
                  {enviando ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando…</>) : 'Solicitar factura'}
                </Button>
              </CardContent>
            </Card>
          </form>
        )}
      </div>
    </div>
  );
};

export default AutofacturacionPage;
