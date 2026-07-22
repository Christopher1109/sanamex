import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Receipt } from 'lucide-react';
import { toast } from 'sonner';

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const FN_BASE = `https://${PROJECT_ID}.supabase.co/functions/v1`;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venta_id?: string;
  /** Facturación agrupada: varios tickets sin RFC en UNA sola factura */
  venta_ids?: string[];
  pedido_id?: string;
  cliente_id?: string | null;
  /** Texto descriptivo (folio venta/pedido) */
  referencia?: string;
  onSuccess?: () => void;
}

const REGIMENES = [
  { v: '601', l: '601 · General de Ley Personas Morales' },
  { v: '603', l: '603 · Personas Morales con Fines no Lucrativos' },
  { v: '605', l: '605 · Sueldos y Salarios' },
  { v: '606', l: '606 · Arrendamiento' },
  { v: '612', l: '612 · PF Actividades Empresariales y Profesionales' },
  { v: '616', l: '616 · Sin obligaciones fiscales' },
  { v: '621', l: '621 · Incorporación Fiscal' },
  { v: '626', l: '626 · RESICO' },
];

export default function FacturarRapidoDialog({ open, onOpenChange, venta_id, venta_ids, pedido_id, cliente_id, referencia, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [cfgCp, setCfgCp] = useState('00000');
  const [clienteData, setClienteData] = useState<any>(null);
  const [guardarCliente, setGuardarCliente] = useState(false);

  const [r, setR] = useState({
    rfc: 'XAXX010101000',
    nombre: 'PUBLICO EN GENERAL',
    regimen_fiscal: '616',
    cp: '',
    email: '',
    forma_pago: '01',
    metodo_pago: 'PUE' as 'PUE' | 'PPD',
    uso_cfdi: 'S01',
    lineas_con_iva: false,
  });

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: cfg } = await supabase
        .from('configuracion_fiscal')
        .select('cp_emisor')
        .is('sucursal_id', null)
        .maybeSingle();
      const cp = cfg?.cp_emisor || '00000';
      setCfgCp(cp);

      if (cliente_id) {
        const { data: cli } = await supabase
          .from('clientes')
          .select('id, nombre, rfc, email')
          .eq('id', cliente_id)
          .maybeSingle();
        setClienteData(cli);
        if (cli?.rfc) {
          setR({
            rfc: cli.rfc.toUpperCase(),
            nombre: cli.nombre.toUpperCase(),
            regimen_fiscal: '612',
            cp,
            email: cli.email || '',
            forma_pago: '01',
            metodo_pago: 'PUE',
            uso_cfdi: 'G03',
            lineas_con_iva: false,
          });
          setGuardarCliente(false);
          return;
        }
      }
      setClienteData(null);
      setR({
        rfc: 'XAXX010101000',
        nombre: 'PUBLICO EN GENERAL',
        regimen_fiscal: '616',
        cp,
        email: '',
        forma_pago: '01',
        metodo_pago: 'PUE',
        uso_cfdi: 'S01',
        lineas_con_iva: false,
      });
      setGuardarCliente(false);
    })();
  }, [open, cliente_id]);

  const esPublico = r.rfc.toUpperCase() === 'XAXX010101000';

  async function timbrar() {
    if (!venta_id && !(venta_ids && venta_ids.length) && !pedido_id) return;
    if (!r.rfc || r.rfc.length < 12) { toast.error('RFC inválido'); return; }
    if (!r.nombre.trim()) { toast.error('Captura la razón social'); return; }
    if (!r.cp || r.cp.length < 5) { toast.error('CP del receptor requerido'); return; }

    setLoading(true);
    try {
      // Si capturó RFC real y pidió guardarlo, crear/actualizar cliente
      if (!esPublico && guardarCliente) {
        if (clienteData?.id) {
          await supabase.from('clientes').update({
            nombre: r.nombre, rfc: r.rfc, email: r.email || null,
          }).eq('id', clienteData.id);
        } else {
          await supabase.from('clientes').insert({
            nombre: r.nombre, rfc: r.rfc, email: r.email || null, tipo: 'mayoreo', activo: true,
          });
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${FN_BASE}/facturapi-timbrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          venta_id, venta_ids, pedido_id,
          uso_cfdi: r.uso_cfdi,
          forma_pago: r.forma_pago,
          metodo_pago: r.metodo_pago,
          lineas_con_iva: r.lineas_con_iva,
          receptor: {
            rfc: r.rfc.toUpperCase(),
            nombre: r.nombre.toUpperCase(),
            regimen_fiscal: r.regimen_fiscal,
            cp: r.cp,
            email: r.email || undefined,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body?.error || 'Error al timbrar', { description: body?.detalle?.message });
      } else {
        toast.success(`CFDI timbrado · UUID ${body.cfdi?.uuid_sat || ''}`);
        onOpenChange(false);
        onSuccess?.();
      }
    } catch (e: any) {
      toast.error(e?.message || 'Error de red');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-primary" /> Facturar {referencia || ''}</DialogTitle>
          <DialogDescription>
            {clienteData?.rfc
              ? 'Cliente con RFC registrado. Revisa los datos y timbra.'
              : 'Captura los datos fiscales del receptor para generar el CFDI.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!clienteData?.rfc && (
            <div className="flex gap-2 pb-2 border-b">
              <Button
                size="sm"
                variant={esPublico ? 'default' : 'outline'}
                onClick={() => setR({ ...r, rfc: 'XAXX010101000', nombre: 'PUBLICO EN GENERAL', regimen_fiscal: '616', uso_cfdi: 'S01' })}
              >
                Público en general
              </Button>
              <Button
                size="sm"
                variant={!esPublico ? 'default' : 'outline'}
                onClick={() => setR({ ...r, rfc: '', nombre: '', regimen_fiscal: '612', uso_cfdi: 'G03' })}
              >
                Cliente con RFC
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Razón social / Nombre</Label>
              <Input value={r.nombre} onChange={e => setR({ ...r, nombre: e.target.value })} maxLength={200} />
            </div>
            <div>
              <Label>RFC</Label>
              <Input value={r.rfc} onChange={e => setR({ ...r, rfc: e.target.value.toUpperCase() })} maxLength={13} />
            </div>
            <div>
              <Label>Régimen fiscal</Label>
              <Select value={r.regimen_fiscal} onValueChange={v => setR({ ...r, regimen_fiscal: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{REGIMENES.map(x => <SelectItem key={x.v} value={x.v}>{x.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>CP del receptor</Label>
              <Input value={r.cp} onChange={e => setR({ ...r, cp: e.target.value.replace(/\D/g, '').slice(0, 5) })} placeholder={cfgCp} />
            </div>
            <div>
              <Label>Email (opcional)</Label>
              <Input type="email" value={r.email} onChange={e => setR({ ...r, email: e.target.value })} maxLength={150} />
            </div>
            <div>
              <Label>Uso CFDI</Label>
              <Select value={r.uso_cfdi} onValueChange={v => setR({ ...r, uso_cfdi: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="S01">S01 · Sin efectos fiscales</SelectItem>
                  <SelectItem value="G01">G01 · Adquisición de mercancías</SelectItem>
                  <SelectItem value="G03">G03 · Gastos en general</SelectItem>
                  <SelectItem value="P01">P01 · Por definir</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forma de pago</Label>
              <Select value={r.forma_pago} onValueChange={v => setR({ ...r, forma_pago: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="01">01 · Efectivo</SelectItem>
                  <SelectItem value="03">03 · Transferencia</SelectItem>
                  <SelectItem value="04">04 · Tarjeta de crédito</SelectItem>
                  <SelectItem value="28">28 · Tarjeta de débito</SelectItem>
                  <SelectItem value="99">99 · Por definir</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Método de pago</Label>
              <Select value={r.metodo_pago} onValueChange={v => setR({ ...r, metodo_pago: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PUE">PUE · Pago en una exhibición</SelectItem>
                  <SelectItem value="PPD">PPD · Pago en parcialidades</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t">
            <Switch checked={r.lineas_con_iva} onCheckedChange={c => setR({ ...r, lineas_con_iva: c })} />
            <Label className="cursor-pointer text-sm">Aplicar IVA 16% a todas las líneas</Label>
          </div>

          {!esPublico && !clienteData?.rfc && (
            <div className="flex items-center gap-2 pt-2">
              <Checkbox id="guardar" checked={guardarCliente} onCheckedChange={c => setGuardarCliente(!!c)} />
              <Label htmlFor="guardar" className="cursor-pointer text-sm">
                Guardar este RFC en la base de clientes para reusarlo
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={timbrar} disabled={loading}>{loading ? 'Timbrando…' : 'Timbrar CFDI'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
