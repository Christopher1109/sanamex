import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, ChevronRight, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import ExcelJS from 'exceljs';

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

  const [catalogo, setCatalogo] = useState<any[]>([]);
  const [catalogoSearch, setCatalogoSearch] = useState('');
  const [catalogoLoading, setCatalogoLoading] = useState(false);

  function openDetail(p: Proveedor) {
    setSelected(p);
    setForm(p);
    setEditing(false);
    setCatalogoSearch('');
    loadCatalogo(p.id);
  }

  async function loadCatalogo(proveedorId: string) {
    setCatalogoLoading(true);
    const { data } = await supabase
      .from('lista_precio_proveedor')
      .select('id, precio, precio_con_iva, existencia_proveedor, cantidad_min, fecha_vigencia_hasta, activo, productos(nombre, sku)')
      .eq('proveedor_id', proveedorId)
      .eq('activo', true)
      .order('created_at', { ascending: false })
      .limit(500);
    setCatalogo(data || []);
    setCatalogoLoading(false);
  }

  async function saveDetail() {
    if (!selected) return;
    if (form.plazo_pago_dias === null || form.plazo_pago_dias === undefined || (form.plazo_pago_dias as any) === '') {
      toast.error('El plazo de pago es obligatorio (use 0 si es de contado)');
      return;
    }
    if (Number(form.plazo_pago_dias) < 0) {
      toast.error('El plazo de pago no puede ser negativo');
      return;
    }
    const payload: any = { ...form };
    delete payload.id;
    payload.plazo_pago_dias = Number(form.plazo_pago_dias);
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
    if (form.plazo_pago_dias === null || form.plazo_pago_dias === undefined || (form.plazo_pago_dias as any) === '') {
      toast.error('El plazo de pago es obligatorio (use 0 si es de contado)');
      return;
    }
    if (Number(form.plazo_pago_dias) < 0) {
      toast.error('El plazo de pago no puede ser negativo');
      return;
    }
    const payload: any = { ...form };
    payload.plazo_pago_dias = Number(form.plazo_pago_dias);
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

  const [subiendo, setSubiendo] = useState<string | null>(null);

  async function subirDocumento(campo: keyof Proveedor, file: File) {
    if (!selected) return;
    setSubiendo(campo as string);
    try {
      const ext = file.name.split('.').pop();
      const path = `${selected.id}/${campo}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('expedientes-proveedor').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { error: updErr } = await supabase.from('proveedores').update({ [campo]: path }).eq('id', selected.id);
      if (updErr) throw updErr;
      setForm(f => ({ ...f, [campo]: path }));
      setSelected(s => s ? { ...s, [campo]: path } as Proveedor : s);
      toast.success('Documento subido');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Error al subir el documento');
    }
    setSubiendo(null);
  }

  async function verDocumento(path: string) {
    const { data, error } = await supabase.storage.from('expedientes-proveedor').createSignedUrl(path, 300);
    if (error || !data) { toast.error('No se pudo abrir el documento'); return; }
    window.open(data.signedUrl, '_blank');
  }

  const DocumentoField = ({ label, campo }: { label: string; campo: keyof Proveedor }) => {
    const valor = (form as any)[campo] as string | null;
    const esUrlVieja = valor && (valor.startsWith('http://') || valor.startsWith('https://'));
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-2">
          {valor ? (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => esUrlVieja ? window.open(valor, '_blank') : verDocumento(valor)}>
              Ver documento
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground italic py-2">Sin documento</span>
          )}
          <input
            type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" id={`doc-${campo}`}
            onChange={e => e.target.files?.[0] && subirDocumento(campo, e.target.files[0])}
          />
          <Button size="sm" variant="ghost" disabled={subiendo === campo} onClick={() => document.getElementById(`doc-${campo}`)?.click()}>
            {subiendo === campo ? 'Subiendo…' : valor ? 'Reemplazar' : 'Subir'}
          </Button>
        </div>
      </div>
    );
  };

  async function exportExcel() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Proveedores');
    ws.columns = [
      { header: 'Nombre', key: 'nombre', width: 30 },
      { header: 'Contacto', key: 'contacto', width: 22 },
      { header: 'Teléfono', key: 'telefono', width: 16 },
      { header: 'Correo principal', key: 'email', width: 26 },
      { header: 'Correo auxiliar', key: 'correo_aux', width: 26 },
      { header: 'RFC', key: 'rfc', width: 16 },
      { header: 'Plazo de pago (días)', key: 'plazo_pago_dias', width: 18 },
      { header: 'Condiciones', key: 'condiciones', width: 20 },
      { header: 'Banco', key: 'banco', width: 18 },
      { header: 'Cuenta bancaria', key: 'cuenta_banco', width: 20 },
      { header: 'Dirección fiscal', key: 'direccion_fiscal', width: 30 },
      { header: 'Documentación', key: 'documentacion', width: 16 },
      { header: 'Activo', key: 'activo', width: 10 },
    ];
    proveedores.forEach(p => {
      const docs = [p.constancia_situacion_fiscal_url, p.aviso_funcionamiento_url, p.comprobante_domicilio_url, p.identificacion_oficial_url];
      ws.addRow({ ...p, documentacion: `${docs.filter(Boolean).length}/4`, activo: p.activo ? 'Sí' : 'No' });
    });
    ws.getRow(1).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proveedores_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel}>
            <Download className="h-4 w-4 mr-2" /> Exportar Excel
          </Button>
          <Button onClick={() => { setForm(empty); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Nuevo Proveedor
          </Button>
        </div>
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
                <TableHead>Expediente</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">Cargando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin proveedores</TableCell></TableRow>
              ) : filtered.map(p => {
                const docs = [p.constancia_situacion_fiscal_url, p.aviso_funcionamiento_url, p.comprobante_domicilio_url, p.identificacion_oficial_url];
                const completos = docs.filter(Boolean).length;
                return (
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
                  <TableCell>
                    <Badge variant={completos === 4 ? 'default' : 'secondary'} className={completos === 4 ? 'bg-green-600 text-[10px]' : 'text-[10px]'}>
                      {completos}/4
                    </Badge>
                  </TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail sheet */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setEditing(false); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 pr-6">
              <span>{selected?.nombre}</span>
              {!editing && <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Editar</Button>}
            </DialogTitle>
            <DialogDescription>Consulta y edita la información del proveedor en las distintas pestañas.</DialogDescription>
          </DialogHeader>

          {selected && (
            <Tabs defaultValue="contacto">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="contacto">Contacto</TabsTrigger>
                <TabsTrigger value="fiscal">Fiscal y bancario</TabsTrigger>
                <TabsTrigger value="expediente">Expediente</TabsTrigger>
                <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
              </TabsList>

              <TabsContent value="contacto" className="space-y-6 pt-4">
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
                    <Field label="Plazo de pago (días) *" type="number" value={form.plazo_pago_dias} onChange={(v: any) => setForm({ ...form, plazo_pago_dias: v })} />
                    <Field label="Condiciones" value={form.condiciones} onChange={(v: string) => setForm({ ...form, condiciones: v })} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Use 0 si el proveedor es de contado. Este dato alimenta Cuentas por Pagar y las alertas de riesgo.</p>
                </section>

                <section>
                  <h3 className="font-semibold text-sm mb-3 text-primary">Notas internas</h3>
                  <Field label="Notas" textarea value={form.notas} onChange={(v: string) => setForm({ ...form, notas: v })} />
                </section>
              </TabsContent>

              <TabsContent value="fiscal" className="space-y-6 pt-4">
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
              </TabsContent>

              <TabsContent value="expediente" className="space-y-6 pt-4">
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm text-primary">Expediente digital</h3>
                    {(() => {
                      const campos = ['constancia_situacion_fiscal_url', 'aviso_funcionamiento_url', 'comprobante_domicilio_url', 'identificacion_oficial_url'] as const;
                      const completos = campos.filter(c => (form as any)[c]).length;
                      const completo = completos === campos.length;
                      return (
                        <Badge variant={completo ? 'default' : 'secondary'} className={completo ? 'bg-green-600' : ''}>
                          {completo ? 'Documentación completa' : `Documentación ${completos}/${campos.length}`}
                        </Badge>
                      );
                    })()}
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <DocumentoField label="Constancia de situación fiscal" campo="constancia_situacion_fiscal_url" />
                    <DocumentoField label="Aviso de funcionamiento y responsable sanitario" campo="aviso_funcionamiento_url" />
                    <DocumentoField label="Comprobante de domicilio" campo="comprobante_domicilio_url" />
                    <DocumentoField label="Identificación oficial" campo="identificacion_oficial_url" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Los documentos se suben directo (PDF, JPG o PNG) — ya no hace falta pegar una URL a mano.</p>
                </section>
              </TabsContent>

              <TabsContent value="catalogo" className="space-y-6 pt-4">
                <section>
                  <h3 className="font-semibold text-sm mb-3 text-primary">Catálogo y precios de este proveedor</h3>
                  {catalogo.length === 0 && !catalogoLoading ? (
                    <p className="text-sm text-muted-foreground bg-muted/40 rounded-md p-3">
                      Sin lista de precios cargada todavía. Se sube desde Compras → Catálogos → Proveedores (carga masiva por Excel).
                    </p>
                  ) : (
                    <>
                      <Input
                        placeholder="Buscar producto o SKU en este catálogo…"
                        value={catalogoSearch}
                        onChange={e => setCatalogoSearch(e.target.value)}
                        className="mb-2"
                      />
                      <div className="border rounded-md max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-muted sticky top-0">
                            <tr>
                              <th className="p-2 text-left">Producto</th>
                              <th className="p-2 text-right">Precio</th>
                              <th className="p-2 text-right">Con IVA</th>
                              <th className="p-2 text-right">Existencia</th>
                              <th className="p-2 text-right">Mín.</th>
                              <th className="p-2 text-left">Vigente hasta</th>
                            </tr>
                          </thead>
                          <tbody>
                            {catalogo
                              .filter(c => {
                                if (!catalogoSearch) return true;
                                const s = catalogoSearch.toLowerCase();
                                return (c.productos?.nombre || '').toLowerCase().includes(s) || (c.productos?.sku || '').toLowerCase().includes(s);
                              })
                              .slice(0, 200)
                              .map(c => (
                                <tr key={c.id} className="border-b">
                                  <td className="p-2">
                                    <div className="font-medium">{c.productos?.nombre}</div>
                                    <div className="text-muted-foreground">{c.productos?.sku}</div>
                                  </td>
                                  <td className="p-2 text-right font-mono">${Number(c.precio).toFixed(2)}</td>
                                  <td className="p-2 text-right font-mono">${Number(c.precio_con_iva || c.precio).toFixed(2)}</td>
                                  <td className="p-2 text-right">{c.existencia_proveedor ?? '—'}</td>
                                  <td className="p-2 text-right">{c.cantidad_min ?? '—'}</td>
                                  <td className="p-2">{c.fecha_vigencia_hasta || '—'}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{catalogo.length} producto(s) en la lista vigente de este proveedor.</p>
                    </>
                  )}
                </section>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter className="mt-6 flex-row justify-between sm:justify-between gap-2">
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <div><Label>Plazo de pago (días) *</Label><Input type="number" min={0} value={form.plazo_pago_dias ?? ''} onChange={e => setForm({ ...form, plazo_pago_dias: e.target.value === '' ? null : Number(e.target.value) })} /></div>
                <div><Label>Condiciones</Label><Input placeholder="Ej. CONTADO, 30 DÍAS..." value={form.condiciones || ''} onChange={e => setForm({ ...form, condiciones: e.target.value })} /></div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Use 0 si es de contado. Obligatorio para Cuentas por Pagar.</p>
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
