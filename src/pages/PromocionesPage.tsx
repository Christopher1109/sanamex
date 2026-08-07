import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tag, Plus, Loader2, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

// Promociones automáticas recurrentes (ej. "Día Sanamex" cada martes):
// se configura una vez (día de la semana + clasificación/estatus + % de
// descuento) y la vigencia se calcula en vivo contra el día de hoy — no
// hay botón de encender/apagar manual ni job que corra en la madrugada,
// el criterio simplemente aplica o no aplica según qué día sea.

type Promocion = {
  id: string; nombre: string; dia_semana: number;
  criterio_tipo: 'clasificacion' | 'estatus'; criterio_valor: string;
  porcentaje_descuento: number; activo: boolean; created_at: string;
};

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const CLASIFICACIONES = ['A', 'B', 'C'];
const ESTATUS = [
  { codigo: 'A', nombre: 'Activo' }, { codigo: 'I', nombre: 'Inactivo' },
  { codigo: 'C', nombre: 'Cancelado' }, { codigo: 'S', nombre: 'Sustituto' },
  { codigo: 'N', nombre: 'Nuevo' }, { codigo: 'E', nombre: 'Compra especial' },
  { codigo: 'K', nombre: 'Corta caducidad' }, { codigo: 'G', nombre: 'Agotado' },
];

const FORM_VACIO = {
  nombre: '', dia_semana: '2', criterio_tipo: 'clasificacion' as 'clasificacion' | 'estatus',
  criterio_valor: 'A', porcentaje_descuento: '10', activo: true,
};

export default function PromocionesPage() {
  const [promos, setPromos] = useState<Promocion[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Promocion | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [vigentesHoy, setVigentesHoy] = useState<any[]>([]);

  useEffect(() => { load(); loadVigentesHoy(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await (supabase as any).from('promociones_precio').select('*').order('dia_semana').order('nombre');
    setPromos((data || []) as Promocion[]);
    setLoading(false);
  }

  async function loadVigentesHoy() {
    const { data } = await (supabase as any).from('v_promociones_vigentes_hoy').select('promocion_id, nombre, sku, producto_nombre, precio_base, precio_con_descuento').limit(500);
    setVigentesHoy(data || []);
  }

  function abrirNueva() {
    setEditando(null);
    setForm(FORM_VACIO);
    setOpen(true);
  }

  function abrirEditar(p: Promocion) {
    setEditando(p);
    setForm({
      nombre: p.nombre, dia_semana: String(p.dia_semana), criterio_tipo: p.criterio_tipo,
      criterio_valor: p.criterio_valor, porcentaje_descuento: String(p.porcentaje_descuento), activo: p.activo,
    });
    setOpen(true);
  }

  async function guardar() {
    if (!form.nombre.trim()) { toast.error('Ponle un nombre a la promoción'); return; }
    const pct = Number(form.porcentaje_descuento);
    if (!pct || pct <= 0 || pct > 100) { toast.error('El porcentaje debe estar entre 1 y 100'); return; }
    setGuardando(true);
    try {
      const payload = {
        nombre: form.nombre.trim(), dia_semana: Number(form.dia_semana),
        criterio_tipo: form.criterio_tipo, criterio_valor: form.criterio_valor,
        porcentaje_descuento: pct, activo: form.activo,
      };
      const { error } = editando
        ? await (supabase as any).from('promociones_precio').update(payload).eq('id', editando.id)
        : await (supabase as any).from('promociones_precio').insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success(editando ? 'Promoción actualizada' : 'Promoción creada');
      setOpen(false);
      await load(); await loadVigentesHoy();
    } catch (e: any) {
      toast.error('No se pudo guardar: ' + (e?.message || 'error desconocido'));
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(p: Promocion) {
    if (!confirm(`¿Eliminar la promoción "${p.nombre}"? No se puede deshacer.`)) return;
    const { error } = await (supabase as any).from('promociones_precio').delete().eq('id', p.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Promoción eliminada');
    await load(); await loadVigentesHoy();
  }

  async function toggleActivo(p: Promocion) {
    const { error } = await (supabase as any).from('promociones_precio').update({ activo: !p.activo }).eq('id', p.id);
    if (error) { toast.error(error.message); return; }
    await load(); await loadVigentesHoy();
  }

  const etiquetaCriterio = (p: Promocion) =>
    p.criterio_tipo === 'clasificacion'
      ? `Clasificación ${p.criterio_valor}`
      : `Estatus ${ESTATUS.find(e => e.codigo === p.criterio_valor)?.nombre || p.criterio_valor}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Tag className="h-6 w-6" /> Promociones automáticas</h1>
          <p className="text-sm text-muted-foreground">
            Descuentos recurrentes por día de la semana (ej. "Día Sanamex" cada martes). Se activan y desactivan
            solos según el día — no hay que hacer nada manualmente.
          </p>
        </div>
        <Button onClick={abrirNueva} className="gap-2"><Plus className="h-4 w-4" /> Nueva promoción</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead><TableHead>Día</TableHead><TableHead>Criterio</TableHead>
              <TableHead className="text-right">Descuento</TableHead><TableHead>Activa</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={6} className="text-center p-6"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
            )}
            {!loading && !promos.length && (
              <TableRow><TableCell colSpan={6} className="text-center p-6 text-muted-foreground">Todavía no hay promociones configuradas.</TableCell></TableRow>
            )}
            {promos.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nombre}</TableCell>
                <TableCell>{DIAS[p.dia_semana]}</TableCell>
                <TableCell>{etiquetaCriterio(p)}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold text-emerald-700">-{p.porcentaje_descuento}%</TableCell>
                <TableCell><Switch checked={p.activo} onCheckedChange={() => toggleActivo(p)} /></TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="icon" variant="ghost" onClick={() => abrirEditar(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => eliminar(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div>
        <h2 className="font-semibold mb-2 flex items-center gap-2">
          Vigentes hoy ({DIAS[new Date().getDay()]})
          <Badge variant="outline">{vigentesHoy.length} producto{vigentesHoy.length === 1 ? '' : 's'}</Badge>
        </h2>
        {!vigentesHoy.length ? (
          <p className="text-sm text-muted-foreground">Ninguna promoción activa aplica hoy.</p>
        ) : (
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Promoción</TableHead><TableHead>SKU</TableHead><TableHead>Producto</TableHead>
                  <TableHead className="text-right">Precio base</TableHead><TableHead className="text-right">Con descuento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vigentesHoy.slice(0, 50).map((v, i) => (
                  <TableRow key={i}>
                    <TableCell><Badge className="bg-emerald-600">{v.nombre}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                    <TableCell>{v.producto_nombre}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground line-through">${Number(v.precio_base).toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-emerald-700">${Number(v.precio_con_descuento).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {vigentesHoy.length > 50 && (
              <div className="text-xs text-muted-foreground text-center py-2 border-t">
                Mostrando 50 de {vigentesHoy.length} productos con promoción vigente hoy.
              </div>
            )}
          </Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editando ? 'Editar promoción' : 'Nueva promoción'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. Día Sanamex" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Día de la semana</Label>
                <Select value={form.dia_semana} onValueChange={v => setForm({ ...form, dia_semana: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIAS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Descuento (%)</Label>
                <Input type="number" min={1} max={100} value={form.porcentaje_descuento} onChange={e => setForm({ ...form, porcentaje_descuento: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Aplica por</Label>
                <Select value={form.criterio_tipo} onValueChange={(v: any) => setForm({ ...form, criterio_tipo: v, criterio_valor: v === 'clasificacion' ? 'A' : 'A' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clasificacion">Clasificación</SelectItem>
                    <SelectItem value="estatus">Estatus del producto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{form.criterio_tipo === 'clasificacion' ? 'Clasificación' : 'Estatus'}</Label>
                <Select value={form.criterio_valor} onValueChange={v => setForm({ ...form, criterio_valor: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {form.criterio_tipo === 'clasificacion'
                      ? CLASIFICACIONES.map(c => <SelectItem key={c} value={c}>Clasificación {c}</SelectItem>)
                      : ESTATUS.map(e => <SelectItem key={e.codigo} value={e.codigo}>{e.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.activo} onCheckedChange={v => setForm({ ...form, activo: v })} />
              <Label className="text-sm">Activa</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Todos los productos con {form.criterio_tipo === 'clasificacion' ? 'clasificación' : 'estatus'} "{form.criterio_valor}"
              {' '}van a tener {form.porcentaje_descuento || 0}% de descuento automático cada {DIAS[Number(form.dia_semana)]}, sin que nadie tenga que activarlo a mano.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
