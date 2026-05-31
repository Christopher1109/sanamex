import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, ChevronRight, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Proveedor = {
  id: string;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  correo_aux: string | null;
  rfc: string | null;
  plazo_pago_dias: number | null;
  condiciones: string | null;
  banco: string | null;
  cuenta_banco: string | null;
  direccion_fiscal: string | null;
  constancia_situacion_fiscal_url: string | null;
  aviso_funcionamiento_url: string | null;
  comprobante_domicilio_url: string | null;
  identificacion_oficial_url: string | null;
  notas: string | null;
  activo: boolean;
};

const empty: Partial<Proveedor> = {
  nombre: '', contacto: '', telefono: '', email: '', correo_aux: '', rfc: '',
  plazo_pago_dias: null, condiciones: '', banco: '', cuenta_banco: '',
  direccion_fiscal: '', constancia_situacion_fiscal_url: '', aviso_funcionamiento_url: '',
  comprobante_domicilio_url: '', identificacion_oficial_url: '', notas: '',
};

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Proveedor | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Proveedor>>(empty);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('proveedores').select('*').order('nombre');
    setProveedores((data as Proveedor[]) || []);
    setLoading(false);
  }

  function openDetail(p: Proveedor) {
    setSelected(p);
    setForm(p);
    setEditing(false);
  }

  async function saveDetail() {
    if (!selected) return;
    const payload: any = { ...form };
    delete payload.id;
    if (payload.plazo_pago_dias === '' || payload.plazo_pago_dias === undefined) payload.plazo_pago_dias = null;
    const { error } = await supabase.from('proveedores').update(payload).eq('id', selected.id);
    if (error) { toast.error('Error al guardar: ' + error.message); return; }
    toast.success('Proveedor actualizado');
    setEditing(false);
    await load();
    const updated = (await supabase.from('proveedores').select('*').eq('id', selected.id).single()).data as Proveedor;
    setSelected(updated);
    setForm(updated);
  }

  async function createProveedor() {
    if (!form.nombre?.trim()) { toast.error('Nombre requerido'); return; }
    const payload: any = { ...form };
    if (payload.plazo_pago_dias === '' || payload.plazo_pago_dias === undefined) payload.plazo_pago_dias = null;
    const { error } = await supabase.from('proveedores').insert(payload);
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.success('Proveedor creado');
    setCreateOpen(false);
    setForm(empty);
    load();
  }

  async function deleteProveedor() {
    if (!selected) return;
    const { error } = await supabase.from('proveedores').delete().eq('id', selected.id);
    if (error) {
      toast.error('No se puede eliminar: ' + (error.message.includes('foreign key') ? 'tiene movimientos asociados (compras/lotes). Considera desactivarlo.' : error.message));
      return;
    }
    toast.success('Proveedor eliminado');
    setSelected(null);
    setEditing(false);
    load();
  }

  const filtered = proveedores.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (p.contacto || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const Field = ({ label, value, onChange, type = 'text', textarea = false }: any) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        textarea ? (
          <Textarea value={value ?? ''} onChange={e => onChange(e.target.value)} rows={2} />
        ) : (
          <Input type={type} value={value ?? ''} onChange={e => onChange(type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)} />
        )
      ) : (
        <div className="text-sm py-2 px-3 rounded-md bg-muted/40 min-h-[36px] break-words">{value || <span className="text-muted-foreground italic">Sin información</span>}</div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proveedores</h1>
          <p className="text-muted-foreground">{proveedores.length} registrados</p>
        </div>
        <Button onClick={() => { setForm(empty); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo Proveedor
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nombre, contacto o correo..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proveedor</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin proveedores</TableCell></TableRow>
              ) : filtered.map(p => (
                <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(p)}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {p.nombre}
                      {!p.activo && <Badge variant="destructive" className="text-[10px]">Inactivo</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{p.contacto || '—'}</TableCell>
                  <TableCell>{p.telefono || '—'}</TableCell>
                  <TableCell className="text-sm">{p.email || '—'}</TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setEditing(false); } }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between gap-2 pr-6">
              <span>{selected?.nombre}</span>
              {!editing && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Editar</Button>}
            </SheetTitle>
          </SheetHeader>

          {selected && (
            <div className="mt-6 space-y-6">
              <section>
                <h3 className="font-semibold text-sm mb-3 text-primary">Contacto</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nombre" value={form.nombre} onChange={(v: string) => setForm({ ...form, nombre: v })} />
                  <Field label="Persona responsable" value={form.contacto} onChange={(v: string) => setForm({ ...form, contacto: v })} />
                  <Field label="Teléfono" value={form.telefono} onChange={(v: string) => setForm({ ...form, telefono: v })} />
                  <Field label="Correo principal" value={form.email} onChange={(v: string) => setForm({ ...form, email: v })} />
                  <Field label="Correo auxiliar" value={form.correo_aux} onChange={(v: string) => setForm({ ...form, correo_aux: v })} />
                </div>
              </section>

              <section>
                <h3 className="font-semibold text-sm mb-3 text-primary">Condiciones comerciales</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Plazo de pago (días)" type="number" value={form.plazo_pago_dias} onChange={(v: any) => setForm({ ...form, plazo_pago_dias: v })} />
                  <Field label="Condiciones" value={form.condiciones} onChange={(v: string) => setForm({ ...form, condiciones: v })} />
                </div>
              </section>

              <section>
                <h3 className="font-semibold text-sm mb-3 text-primary">Datos fiscales y bancarios</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="RFC" value={form.rfc} onChange={(v: string) => setForm({ ...form, rfc: v })} />
                  <Field label="Banco" value={form.banco} onChange={(v: string) => setForm({ ...form, banco: v })} />
                  <Field label="Cuenta bancaria" value={form.cuenta_banco} onChange={(v: string) => setForm({ ...form, cuenta_banco: v })} />
                  <div className="col-span-2">
                    <Field label="Dirección fiscal" textarea value={form.direccion_fiscal} onChange={(v: string) => setForm({ ...form, direccion_fiscal: v })} />
                  </div>
                </div>
              </section>

              <section>
                <h3 className="font-semibold text-sm mb-3 text-primary">Documentos (URLs)</h3>
                <div className="grid grid-cols-1 gap-3">
                  <Field label="Constancia de situación fiscal" value={form.constancia_situacion_fiscal_url} onChange={(v: string) => setForm({ ...form, constancia_situacion_fiscal_url: v })} />
                  <Field label="Aviso de funcionamiento y responsable sanitario" value={form.aviso_funcionamiento_url} onChange={(v: string) => setForm({ ...form, aviso_funcionamiento_url: v })} />
                  <Field label="Comprobante de domicilio" value={form.comprobante_domicilio_url} onChange={(v: string) => setForm({ ...form, comprobante_domicilio_url: v })} />
                  <Field label="Identificación oficial" value={form.identificacion_oficial_url} onChange={(v: string) => setForm({ ...form, identificacion_oficial_url: v })} />
                </div>
              </section>

              <section>
                <h3 className="font-semibold text-sm mb-3 text-primary">Notas internas</h3>
                <Field label="Notas" textarea value={form.notas} onChange={(v: string) => setForm({ ...form, notas: v })} />
              </section>
            </div>
          )}

          <SheetFooter className="mt-6 flex-row justify-between sm:justify-between gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm"><Trash2 className="h-4 w-4 mr-2" />Eliminar</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar proveedor?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción eliminará permanentemente a <strong>{selected?.nombre}</strong>. Si tiene compras o lotes asociados, no se podrá borrar.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteProveedor} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {editing && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setForm(selected!); setEditing(false); }}>Cancelar</Button>
                <Button onClick={saveDetail}>Guardar cambios</Button>
              </div>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuevo Proveedor</DialogTitle></DialogHeader>
          <div className="space-y-5">
            <section>
              <h3 className="font-semibold text-sm mb-2 text-primary">Contacto</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label>Nombre *</Label><Input value={form.nombre || ''} onChange={e => setForm({ ...form, nombre: e.target.value })} /></div>
                <div><Label>Persona responsable</Label><Input value={form.contacto || ''} onChange={e => setForm({ ...form, contacto: e.target.value })} /></div>
                <div><Label>Teléfono</Label><Input value={form.telefono || ''} onChange={e => setForm({ ...form, telefono: e.target.value })} /></div>
                <div><Label>Correo principal</Label><Input value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Correo auxiliar</Label><Input value={form.correo_aux || ''} onChange={e => setForm({ ...form, correo_aux: e.target.value })} /></div>
              </div>
            </section>
            <section>
              <h3 className="font-semibold text-sm mb-2 text-primary">Condiciones comerciales</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Plazo de pago (días)</Label><Input type="number" value={form.plazo_pago_dias ?? ''} onChange={e => setForm({ ...form, plazo_pago_dias: e.target.value === '' ? null : Number(e.target.value) })} /></div>
                <div><Label>Condiciones</Label><Input placeholder="Ej. CONTADO, 30 DÍAS..." value={form.condiciones || ''} onChange={e => setForm({ ...form, condiciones: e.target.value })} /></div>
              </div>
            </section>
            <section>
              <h3 className="font-semibold text-sm mb-2 text-primary">Datos fiscales y bancarios</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>RFC</Label><Input value={form.rfc || ''} onChange={e => setForm({ ...form, rfc: e.target.value })} /></div>
                <div><Label>Banco</Label><Input value={form.banco || ''} onChange={e => setForm({ ...form, banco: e.target.value })} /></div>
                <div className="col-span-2"><Label>Cuenta bancaria</Label><Input value={form.cuenta_banco || ''} onChange={e => setForm({ ...form, cuenta_banco: e.target.value })} /></div>
                <div className="col-span-2"><Label>Dirección fiscal</Label><Textarea rows={2} value={form.direccion_fiscal || ''} onChange={e => setForm({ ...form, direccion_fiscal: e.target.value })} /></div>
              </div>
            </section>
            <section>
              <h3 className="font-semibold text-sm mb-2 text-primary">Notas</h3>
              <Textarea rows={2} value={form.notas || ''} onChange={e => setForm({ ...form, notas: e.target.value })} />
            </section>
            <p className="text-xs text-muted-foreground">Los documentos (constancia fiscal, aviso sanitario, etc.) se pueden adjuntar después desde la ficha del proveedor.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={createProveedor}>Crear proveedor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
