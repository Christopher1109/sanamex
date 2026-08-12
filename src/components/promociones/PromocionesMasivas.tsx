import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Upload, Loader2, FileSpreadsheet, Download, AlertTriangle, Save, Play, Ban, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

// Carga masiva de promociones desde Excel:
// el archivo solo necesita una columna de SKU (y opcionalmente el descuento
// deseado). El sistema calcula el descuento máximo que respeta el margen
// mínimo objetivo y propone ese valor; el usuario puede ajustar cada línea
// antes de guardar la campaña.

type Propuesta = {
  sku: string;
  producto_id: string | null;
  descripcion: string | null;
  costo: number | null;
  precio_base: number | null;
  margen_actual: number | null;
  descuento_maximo: number | null;
  descuento_propuesto: number | null;
  precio_propuesto: number | null;
  margen_resultante: number | null;
  observacion: string | null;
  descuento_aprobado?: number | null;
};

type Campania = {
  id: string; nombre: string; notas: string | null; fecha_inicio: string; fecha_fin: string | null;
  margen_minimo: number; estado: 'borrador' | 'activa' | 'cancelada'; created_at: string;
};

const hoy = () => new Date().toISOString().slice(0, 10);
const num = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));
const money = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `$${Number(v).toFixed(2)}`);
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(1)}%`);

function detectarColumnas(fila: Record<string, any>) {
  const keys = Object.keys(fila);
  const find = (opts: string[]) =>
    keys.find(k => opts.some(o => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(o)));
  return {
    sku: find(['sku', 'clave', 'codigo']) || keys[0],
    desc: find(['descuento', 'porcentaje', 'dscto']),
  };
}

export default function PromocionesMasivas() {
  const [campanias, setCampanias] = useState<Campania[]>([]);
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState<{ campania: Campania; lineas: any[] } | null>(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [notas, setNotas] = useState('');
  const [fechaInicio, setFechaInicio] = useState(hoy());
  const [fechaFin, setFechaFin] = useState('');
  const [margenMinimo, setMargenMinimo] = useState('15');
  const [descuentoDeseado, setDescuentoDeseado] = useState('');
  const [skusArchivo, setSkusArchivo] = useState<{ sku: string; descuento: number | null }[]>([]);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [propuestas, setPropuestas] = useState<Propuesta[]>([]);
  const [calculando, setCalculando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { cargarCampanias(); }, []);

  async function cargarCampanias() {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('promociones_lista').select('*').order('created_at', { ascending: false });
    setCampanias((data || []) as Campania[]);
    setLoading(false);
  }

  function reiniciar() {
    setNombre(''); setNotas(''); setFechaInicio(hoy()); setFechaFin('');
    setMargenMinimo('15'); setDescuentoDeseado('');
    setSkusArchivo([]); setNombreArchivo(''); setPropuestas([]);
  }

  function plantilla() {
    const ws = XLSX.utils.aoa_to_sheet([['SKU', 'Descuento %'], ['EJEMPLO-001', 10]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Promociones');
    XLSX.writeFile(wb, 'plantilla_promociones.xlsx');
  }

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (!rows.length) { toast.error('El archivo está vacío'); return; }
      const cols = detectarColumnas(rows[0]);
      const items = rows
        .map(r => ({
          sku: String(r[cols.sku] ?? '').trim().toUpperCase(),
          descuento: cols.desc ? num(r[cols.desc]) : null,
        }))
        .filter(r => r.sku);
      if (!items.length) { toast.error('No encontré ninguna columna de SKU con datos'); return; }
      setSkusArchivo(items);
      setNombreArchivo(file.name);
      toast.success(`${items.length} SKU leídos de ${file.name}`);
      await calcular(items);
    } catch (err: any) {
      toast.error('No pude leer el archivo: ' + (err?.message || 'formato no válido'));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function calcular(items = skusArchivo) {
    if (!items.length) { toast.error('Primero carga el archivo de SKUs'); return; }
    setCalculando(true);
    try {
      const deseado = descuentoDeseado.trim() === '' ? null : Number(descuentoDeseado);
      const { data, error } = await (supabase as any).rpc('promociones_propuesta_margen', {
        p_skus: items.map(i => i.sku),
        p_margen_minimo: Number(margenMinimo) || 0,
        p_descuento_deseado: deseado,
      });
      if (error) { toast.error(error.message); return; }
      const porSku = new Map(items.map(i => [i.sku, i.descuento]));
      const res: Propuesta[] = (data || []).map((p: Propuesta) => {
        // El descuento del archivo (si viene) manda, pero nunca por encima del máximo por margen.
        const delArchivo = porSku.get(p.sku);
        const tope = p.descuento_maximo;
        let aprobado = p.descuento_propuesto;
        if (delArchivo !== null && delArchivo !== undefined && tope !== null) {
          aprobado = Math.min(delArchivo, tope);
        }
        return { ...p, descuento_aprobado: aprobado };
      });
      setPropuestas(res);
    } finally {
      setCalculando(false);
    }
  }

  function editarDescuento(sku: string, valor: string) {
    setPropuestas(prev => prev.map(p => {
      if (p.sku !== sku) return p;
      const v = valor === '' ? null : Number(valor);
      return { ...p, descuento_aprobado: v };
    }));
  }

  function lineaFinal(p: Propuesta) {
    const d = p.descuento_aprobado;
    const precio = p.precio_base !== null && d !== null && d !== undefined
      ? Number((p.precio_base * (1 - d / 100)).toFixed(2)) : null;
    const margen = precio && p.costo !== null && precio > 0
      ? Number((((precio - p.costo) / precio) * 100).toFixed(2)) : null;
    const excedeMargen = margen !== null && margen < Number(margenMinimo || 0);
    return { precio, margen, excedeMargen };
  }

  const validas = propuestas.filter(p => p.producto_id && p.descuento_aprobado);
  const conProblema = propuestas.filter(p => !p.producto_id || p.costo === null || p.precio_base === null);
  const bajoMargen = propuestas.filter(p => lineaFinal(p).excedeMargen);

  async function guardar(activar: boolean) {
    if (!nombre.trim()) { toast.error('Ponle un nombre a la campaña'); return; }
    if (!validas.length) { toast.error('No hay líneas válidas para guardar'); return; }
    if (bajoMargen.length) { toast.error(`${bajoMargen.length} línea(s) quedan bajo el margen mínimo — corrígelas antes de guardar`); return; }
    setGuardando(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const { data: promo, error } = await (supabase as any).from('promociones_lista').insert({
        nombre: nombre.trim(),
        notas: notas.trim() || null,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin || null,
        margen_minimo: Number(margenMinimo) || 0,
        estado: activar ? 'activa' : 'borrador',
        creado_por: user?.user?.id ?? null,
      }).select('*').single();
      if (error) { toast.error(error.message); return; }

      const lineas = validas.map(p => {
        const f = lineaFinal(p);
        return {
          promocion_id: promo.id,
          producto_id: p.producto_id,
          sku: p.sku,
          descripcion: p.descripcion,
          costo: p.costo,
          precio_base: p.precio_base,
          descuento_propuesto: p.descuento_propuesto,
          descuento_aprobado: p.descuento_aprobado,
          precio_promo: f.precio,
          margen_resultante: f.margen,
          observacion: p.observacion,
        };
      });
      const { error: e2 } = await (supabase as any).from('promociones_lista_lineas').insert(lineas);
      if (e2) { toast.error('Campaña creada pero fallaron las líneas: ' + e2.message); return; }
      toast.success(`Campaña ${activar ? 'activada' : 'guardada como borrador'} con ${lineas.length} productos`);
      setWizardOpen(false); reiniciar(); await cargarCampanias();
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado(c: Campania, estado: Campania['estado']) {
    const { error } = await (supabase as any).from('promociones_lista').update({ estado }).eq('id', c.id);
    if (error) { toast.error(error.message); return; }
    toast.success(estado === 'activa' ? 'Campaña activada' : estado === 'cancelada' ? 'Campaña cancelada' : 'Campaña en borrador');
    await cargarCampanias();
  }

  async function eliminar(c: Campania) {
    if (!confirm(`¿Eliminar la campaña "${c.nombre}" y todos sus productos?`)) return;
    const { error } = await (supabase as any).from('promociones_lista').delete().eq('id', c.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Campaña eliminada');
    await cargarCampanias();
  }

  async function verDetalle(c: Campania) {
    const { data } = await (supabase as any)
      .from('promociones_lista_lineas').select('*').eq('promocion_id', c.id).order('sku');
    setDetalle({ campania: c, lineas: data || [] });
  }

  const badgeEstado = (e: Campania['estado']) =>
    e === 'activa' ? <Badge className="bg-emerald-600">Activa</Badge>
      : e === 'cancelada' ? <Badge variant="destructive">Cancelada</Badge>
        : <Badge variant="secondary">Borrador</Badge>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> Campañas por lista de productos</h2>
          <p className="text-sm text-muted-foreground">
            Sube el Excel con los SKU y el sistema propone el descuento máximo que respeta el margen mínimo.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={plantilla}><Download className="h-4 w-4" /> Plantilla</Button>
          <Button className="gap-2" onClick={() => { reiniciar(); setWizardOpen(true); }}>
            <Upload className="h-4 w-4" /> Nueva carga masiva
          </Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead>Campaña</TableHead><TableHead>Vigencia</TableHead>
              <TableHead className="text-right">Margen mín.</TableHead>
              <TableHead>Estado</TableHead><TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={5} className="text-center p-6"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>}
            {!loading && !campanias.length && (
              <TableRow><TableCell colSpan={5} className="text-center p-6 text-muted-foreground">Todavía no hay campañas cargadas.</TableCell></TableRow>
            )}
            {campanias.map(c => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => verDetalle(c)}>
                <TableCell>
                  <div className="font-medium">{c.nombre}</div>
                  {c.notas && <div className="text-xs text-muted-foreground">{c.notas}</div>}
                </TableCell>
                <TableCell className="text-sm">{c.fecha_inicio}{c.fecha_fin ? ` → ${c.fecha_fin}` : ' → sin fin'}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(c.margen_minimo)}</TableCell>
                <TableCell>{badgeEstado(c.estado)}</TableCell>
                <TableCell className="text-right space-x-1" onClick={e => e.stopPropagation()}>
                  {c.estado !== 'activa' && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => cambiarEstado(c, 'activa')}>
                      <Play className="h-3 w-3" /> Activar
                    </Button>
                  )}
                  {c.estado === 'activa' && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => cambiarEstado(c, 'cancelada')}>
                      <Ban className="h-3 w-3" /> Cancelar
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => eliminar(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Wizard de carga */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-[96vw] sm:max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva carga masiva de promociones</DialogTitle>
            <DialogDescription>
              El descuento que traiga el archivo se respeta siempre que no rompa el margen mínimo; si lo rompe, se recorta.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3">
                <Label className="text-xs">Nombre de la campaña</Label>
                <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Liquidación corta caducidad agosto" />
              </div>
              <div>
                <Label className="text-xs">Inicio</Label>
                <Input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Fin (opcional)</Label>
                <Input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Margen mínimo (%)</Label>
                <Input type="number" min={0} max={99} value={margenMinimo} onChange={e => setMargenMinimo(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Descuento deseado (%) — opcional</Label>
                <Input type="number" min={0} max={100} value={descuentoDeseado} onChange={e => setDescuentoDeseado(e.target.value)} placeholder="vacío = máximo posible" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Notas</Label>
                <Textarea rows={1} value={notas} onChange={e => setNotas(e.target.value)} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onArchivo} />
              <Button variant="outline" className="gap-2" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> {nombreArchivo || 'Elegir archivo Excel/CSV'}
              </Button>
              {!!skusArchivo.length && (
                <Button variant="secondary" className="gap-2" onClick={() => calcular()} disabled={calculando}>
                  {calculando ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Recalcular propuesta
                </Button>
              )}
              {!!skusArchivo.length && <Badge variant="outline">{skusArchivo.length} SKU en el archivo</Badge>}
            </div>

            {!!propuestas.length && (
              <>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge className="bg-emerald-600">{validas.length} listas</Badge>
                  {!!conProblema.length && <Badge variant="destructive">{conProblema.length} con problema</Badge>}
                  {!!bajoMargen.length && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> {bajoMargen.length} bajo margen mínimo
                    </Badge>
                  )}
                </div>

                <Card className="p-0 overflow-auto max-h-[45vh]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead>SKU</TableHead><TableHead>Producto</TableHead>
                        <TableHead className="text-right">Costo</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead className="text-right">Margen</TableHead>
                        <TableHead className="text-right">Dscto. máx.</TableHead>
                        <TableHead className="text-right w-28">Dscto. aprob.</TableHead>
                        <TableHead className="text-right">Precio promo</TableHead>
                        <TableHead className="text-right">Margen final</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {propuestas.map(p => {
                        const f = lineaFinal(p);
                        const roto = !p.producto_id || p.costo === null || p.precio_base === null;
                        return (
                          <TableRow key={p.sku} className={roto ? 'bg-destructive/5' : f.excedeMargen ? 'bg-amber-50' : ''}>
                            <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                            <TableCell className="text-sm">
                              {p.descripcion || <span className="text-destructive">{p.observacion}</span>}
                              {p.descripcion && p.observacion && (
                                <div className="text-xs text-amber-700">{p.observacion}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{money(p.costo)}</TableCell>
                            <TableCell className="text-right tabular-nums">{money(p.precio_base)}</TableCell>
                            <TableCell className="text-right tabular-nums">{pct(p.margen_actual)}</TableCell>
                            <TableCell className="text-right tabular-nums">{pct(p.descuento_maximo)}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number" min={0} max={100} className="h-8 text-right"
                                disabled={roto}
                                value={p.descuento_aprobado ?? ''}
                                onChange={e => editarDescuento(p.sku, e.target.value)}
                              />
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-semibold text-emerald-700">{money(f.precio)}</TableCell>
                            <TableCell className={`text-right tabular-nums ${f.excedeMargen ? 'text-destructive font-semibold' : ''}`}>{pct(f.margen)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Card>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setWizardOpen(false)}>Cancelar</Button>
            <Button variant="secondary" className="gap-2" onClick={() => guardar(false)} disabled={guardando || !validas.length}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar borrador
            </Button>
            <Button className="gap-2" onClick={() => guardar(true)} disabled={guardando || !validas.length}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Guardar y activar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalle de campaña */}
      <Dialog open={!!detalle} onOpenChange={o => !o && setDetalle(null)}>
        <DialogContent className="max-w-[96vw] sm:max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detalle?.campania.nombre}</DialogTitle>
            <DialogDescription>
              {detalle?.campania.fecha_inicio}{detalle?.campania.fecha_fin ? ` → ${detalle?.campania.fecha_fin}` : ' → sin fin'}
              {' · '}margen mínimo {pct(detalle?.campania.margen_minimo)}
              {' · '}{detalle?.lineas.length} productos
            </DialogDescription>
          </DialogHeader>
          <Card className="p-0 overflow-auto max-h-[60vh]">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>SKU</TableHead><TableHead>Producto</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Dscto.</TableHead>
                  <TableHead className="text-right">Precio promo</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detalle?.lineas || []).map(l => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                    <TableCell className="text-sm">{l.descripcion}</TableCell>
                    <TableCell className="text-right tabular-nums line-through text-muted-foreground">{money(l.precio_base)}</TableCell>
                    <TableCell className="text-right tabular-nums">-{pct(l.descuento_aprobado)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-emerald-700">{money(l.precio_promo)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(l.margen_resultante)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </DialogContent>
      </Dialog>
    </div>
  );
}
