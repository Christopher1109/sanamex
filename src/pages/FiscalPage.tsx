import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function FiscalPage() {
  const { selectedSucursal } = useSucursal();
  const [config, setConfig] = useState<any>(null);
  const [cfdis, setCfdis] = useState<any[]>([]);
  const [form, setForm] = useState({ rfc: '', razon_social: '', regimen_fiscal: '', cp_emisor: '', pac_proveedor: '', serie_default: 'A' });

  useEffect(() => {
    if (selectedSucursal) { loadConfig(); loadCfdis(); }
  }, [selectedSucursal]);

  async function loadConfig() {
    const { data } = await supabase.from('configuracion_fiscal').select('*').eq('sucursal_id', selectedSucursal!.id).maybeSingle();
    if (data) { setConfig(data); setForm({ ...form, ...data }); } else setConfig(null);
  }
  async function loadCfdis() {
    const { data } = await supabase.from('cfdi_emitidos').select('*').eq('sucursal_id', selectedSucursal!.id).order('created_at', { ascending: false }).limit(50);
    setCfdis(data || []);
  }

  async function save() {
    if (!selectedSucursal) return;
    const payload = { ...form, sucursal_id: selectedSucursal.id, updated_at: new Date().toISOString() };
    const { error } = config
      ? await supabase.from('configuracion_fiscal').update(payload).eq('id', config.id)
      : await supabase.from('configuracion_fiscal').insert(payload);
    if (error) toast.error(error.message); else { toast.success('Configuración guardada'); loadConfig(); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Receipt className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Facturación CFDI</h1>
          <p className="text-sm text-muted-foreground">Configuración fiscal y comprobantes emitidos.</p>
        </div>
      </div>

      <Card className="p-5 border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20">
        <h2 className="font-semibold text-amber-700 dark:text-amber-400 mb-1">Integración PAC pendiente</h2>
        <p className="text-sm">Cuando elijas el PAC (Facturama, SW Sapien, Edicom, etc.) conectaremos esta pantalla para timbrar CFDI 4.0 automáticamente al cerrar cada venta. Por ahora puedes capturar la configuración fiscal y llevar registro manual.</p>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-4">Configuración fiscal de la sucursal</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>RFC</Label><Input value={form.rfc} onChange={e => setForm({ ...form, rfc: e.target.value.toUpperCase() })} /></div>
          <div><Label>Razón social</Label><Input value={form.razon_social} onChange={e => setForm({ ...form, razon_social: e.target.value })} /></div>
          <div><Label>Régimen fiscal</Label><Input placeholder="601 - General de Ley" value={form.regimen_fiscal} onChange={e => setForm({ ...form, regimen_fiscal: e.target.value })} /></div>
          <div><Label>CP del emisor</Label><Input value={form.cp_emisor} onChange={e => setForm({ ...form, cp_emisor: e.target.value })} /></div>
          <div><Label>PAC proveedor</Label><Input placeholder="Facturama / SW Sapien / Edicom" value={form.pac_proveedor} onChange={e => setForm({ ...form, pac_proveedor: e.target.value })} /></div>
          <div><Label>Serie default</Label><Input value={form.serie_default} onChange={e => setForm({ ...form, serie_default: e.target.value })} /></div>
        </div>
        <Button className="mt-4" onClick={save} disabled={!selectedSucursal}>Guardar configuración</Button>
      </Card>

      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">CFDI emitidos</h2></div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Folio</TableHead>
              <TableHead>UUID SAT</TableHead>
              <TableHead>RFC Receptor</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cfdis.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Aún no hay comprobantes.</TableCell></TableRow>}
            {cfdis.map(c => (
              <TableRow key={c.id}>
                <TableCell>{c.serie}-{c.folio}</TableCell>
                <TableCell className="font-mono text-xs">{c.uuid_sat || '—'}</TableCell>
                <TableCell>{c.rfc_receptor}</TableCell>
                <TableCell className="text-right">${Number(c.total).toFixed(2)}</TableCell>
                <TableCell><Badge variant={c.estado === 'timbrado' ? 'default' : 'outline'}>{c.estado}</Badge></TableCell>
                <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
