import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileText, Loader2, CheckCircle2, AlertTriangle, Trash2, ArrowRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { parseCfdiXml, CfdiParsed } from '@/lib/cfdiParser';
import ProductSearchInput from '@/components/ProductSearchInput';

export interface CompraPrefill {
  compra_id: string;
  numero_compra: string;
  proveedor_id: string;
  lineas: Array<{
    linea_id: string;
    producto_id: string;
    producto_nombre: string;
    producto_sku: string;
    cantidad: number;
    precio_estimado: number;
  }>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
  /** Si se pasa, el wizard entra en modo "Generar Factura desde OC recibida":
   *  arranca en paso 2, con proveedor y líneas ya pre-llenadas de la OC.
   *  Al guardar, ACTUALIZA la fila existente de `compras` (no crea otra
   *  ni toca inventario — la recepción ya se hizo). */
  prefill?: CompraPrefill | null;
}

type Origen = 'xml' | 'manual' | null;

interface Linea {
  clave_origen: string;       // sku/codigo del XML o vacío en manual
  descripcion_origen: string;
  cantidad: number;
  precio_unitario: number;
  // match resuelto contra catálogo:
  producto_id: string | null;
  producto_nombre: string | null;
  estado_match: 'matched' | 'pending' | 'manual';
  numero_lote: string;
  fecha_caducidad: string;    // YYYY-MM-DD
}

const NuevaFacturaWizard = ({ open, onOpenChange, onSaved, prefill }: Props) => {
  const { selectedSucursal } = useSucursal();
  const [paso, setPaso] = useState(1);
  const [origen, setOrigen] = useState<Origen>(null);
  const [cfdi, setCfdi] = useState<CfdiParsed | null>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [proveedores, setProveedores] = useState<any[]>([]);
  const [proveedorId, setProveedorId] = useState('');
  const [folioFactura, setFolioFactura] = useState('');
  const [fechaFactura, setFechaFactura] = useState(new Date().toISOString().slice(0, 10));
  const [metodoPago, setMetodoPago] = useState<'contado' | 'credito'>('contado');
  const [diasCredito, setDiasCredito] = useState('30');
  const [notas, setNotas] = useState('');

  const [lineas, setLineas] = useState<Linea[]>([]);
  const [verificando, setVerificando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productos, setProductos] = useState<any[]>([]);

  const modoPrefill = !!prefill;

  useEffect(() => {
    if (open) {
      if (prefill) {
        // Modo "Generar Factura desde OC ya recibida":
        // saltamos paso 1, pre-llenamos proveedor y líneas de la compra existente.
        setPaso(2);
        setOrigen('manual');
        setProveedorId(prefill.proveedor_id);
        setFolioFactura('');
        setFechaFactura(new Date().toISOString().slice(0, 10));
        setMetodoPago('contado'); setDiasCredito('30'); setNotas('');
        setCfdi(null); setXmlFile(null);
        setLineas(prefill.lineas.map(l => ({
          clave_origen: l.producto_sku,
          descripcion_origen: l.producto_nombre,
          cantidad: l.cantidad,
          precio_unitario: l.precio_estimado,
          producto_id: l.producto_id,
          producto_nombre: l.producto_nombre,
          estado_match: 'matched',
          numero_lote: '',
          fecha_caducidad: '',
        })));
      } else {
        setPaso(1); setOrigen(null); setCfdi(null); setXmlFile(null);
        setProveedorId(''); setFolioFactura(''); setFechaFactura(new Date().toISOString().slice(0, 10));
        setMetodoPago('contado'); setDiasCredito('30'); setNotas('');
        setLineas([]);
      }
      supabase.from('proveedores').select('id, nombre, rfc, plazo_pago_dias').eq('activo', true).order('nombre')
        .then(({ data }) => setProveedores(data || []));
      supabase.from('productos').select('id, nombre, sku, precio_base').eq('activo', true).limit(5000)
        .then(({ data }) => setProductos(data || []));
    }
  }, [open, prefill]);

  // -------- Paso 1: origen ----------
  const handleXmlFile = async (file: File) => {
    setXmlFile(file);
    try {
      const text = await file.text();
      const parsed = parseCfdiXml(text);
      setCfdi(parsed);
      setOrigen('xml');
      setFolioFactura([parsed.serie, parsed.folio].filter(Boolean).join('-') || parsed.folio || '');
      if (parsed.fecha) setFechaFactura(parsed.fecha);
      setLineas(parsed.conceptos.map(c => ({
        clave_origen: c.clave,
        descripcion_origen: c.descripcion,
        cantidad: Math.max(1, Math.round(c.cantidad)),
        precio_unitario: c.valorUnitario,
        producto_id: null,
        producto_nombre: null,
        estado_match: 'pending',
        numero_lote: '',
        fecha_caducidad: '',
      })));
      if (parsed.rfcEmisor) {
        const { data } = await supabase.from('proveedores')
          .select('id').ilike('rfc', parsed.rfcEmisor).limit(1);
        if (data && data[0]) setProveedorId(data[0].id);
      }
      toast.success(`CFDI parseado: ${parsed.conceptos.length} conceptos`);
      setPaso(2); // auto-avance
    } catch (e: any) {
      toast.error(`Error parseando XML: ${e.message}`);
      setCfdi(null); setXmlFile(null);
    }
  };

  const elegirManual = () => {
    setOrigen('manual');
    setLineas([]);
    setPaso(2);
  };

  // -------- Paso 3: match híbrido ----------
  const ejecutarMatch = async () => {
    const claves = lineas.map(l => l.clave_origen).filter(Boolean);
    if (claves.length === 0) return;
    setVerificando(true);
    const { data, error } = await supabase.rpc('verificar_productos_lista', { p_claves: claves });
    setVerificando(false);
    if (error) { toast.error('Error al verificar productos'); return; }
    const map = new Map<string, any>();
    (data || []).forEach((r: any) => map.set(r.clave, r));
    setLineas(prev => prev.map(l => {
      const m = map.get(l.clave_origen);
      if (m?.existe) {
        return { ...l, producto_id: m.producto_id, producto_nombre: m.descripcion_actual, estado_match: 'matched' };
      }
      return l;
    }));
    const matched = (data || []).filter((r: any) => r.existe).length;
    toast.success(`${matched} de ${claves.length} productos encontrados en catálogo`);
  };

  const setMatchManual = (idx: number, prod: { id: string; nombre: string } | null) => {
    setLineas(prev => prev.map((l, i) => i === idx ? {
      ...l,
      producto_id: prod?.id ?? null,
      producto_nombre: prod?.nombre ?? null,
      estado_match: prod ? 'manual' : 'pending',
    } : l));
  };

  const updateLinea = (idx: number, patch: Partial<Linea>) => {
    setLineas(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  };
  const removeLinea = (idx: number) => setLineas(prev => prev.filter((_, i) => i !== idx));
  const addLineaManual = () => setLineas(prev => [...prev, {
    clave_origen: '', descripcion_origen: '', cantidad: 1, precio_unitario: 0,
    producto_id: null, producto_nombre: null, estado_match: 'pending',
    numero_lote: '', fecha_caducidad: '',
  }]);

  // -------- Totales ----------
  const lineasMapeadas = useMemo(() => lineas.filter(l => l.producto_id), [lineas]);
  const lineasSinMapear = lineas.length - lineasMapeadas.length;
  const subtotal = useMemo(
    () => lineasMapeadas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0),
    [lineasMapeadas]
  );
  const iva = Math.round(subtotal * 0.16 * 100) / 100;
  const total = Math.round((subtotal + iva) * 100) / 100;

  // -------- Guardar ----------
  const guardar = async () => {
    if (!selectedSucursal) { toast.error('Selecciona una sucursal'); return; }
    if (!proveedorId) { toast.error('Selecciona un proveedor'); return; }
    if (lineasMapeadas.length === 0) { toast.error('Necesitas al menos una línea mapeada a un producto del catálogo'); return; }

    // Validar lotes/caducidades en líneas mapeadas
    for (const l of lineasMapeadas) {
      if (!l.cantidad || l.cantidad <= 0) { toast.error(`Cantidad inválida en "${l.descripcion_origen || l.producto_nombre}"`); return; }
    }

    setSaving(true);
    try {
      // ============================================================
      // MODO PREFILL: Generar factura desde OC ya recibida.
      // Actualiza la fila EXISTENTE de `compras` (folio, fecha_factura,
      // metodo_pago, dias_credito, uuid, xml_url, estado='facturada').
      // NO se toca inventario (ya se movió en la recepción). NO se
      // crean compra_lineas nuevas — solo se sincronizan los precios.
      // El trigger B1 (compras_to_cxp_trg) escucha UPDATE de estos
      // campos y creará/sincronizará la CxP automáticamente.
      // ============================================================
      if (modoPrefill && prefill) {
        // Subir XML si aplica
        let xml_url: string | null = null;
        if (xmlFile && cfdi?.uuid) {
          const path = `${proveedorId}/${cfdi.uuid}.xml`;
          const { error: upErr } = await supabase.storage.from('comprobantes-pago')
            .upload(path, xmlFile, { upsert: true, contentType: 'application/xml' });
          if (!upErr) xml_url = path;
        }

        // Recalcular totales con posibles ajustes de precio
        const nuevoSubtotal = subtotal;
        const nuevoTotal = total;

        // Actualizar precio real por línea (si el usuario ajustó)
        for (const l of lineasMapeadas) {
          const orig = prefill.lineas.find(x => x.producto_id === l.producto_id);
          if (orig) {
            await supabase.from('compra_lineas')
              .update({ precio_unitario_real: l.precio_unitario })
              .eq('id', orig.linea_id);
          }
        }

        // Calcular fecha_pago_limite si es crédito
        const dias = metodoPago === 'credito' ? parseInt(diasCredito) || 0 : 0;
        const fechaLimite = dias > 0
          ? new Date(new Date(fechaFactura + 'T00:00:00').getTime() + dias * 86400000).toISOString().slice(0, 10)
          : null;

        const { error: upErr } = await supabase.from('compras').update({
          folio_factura: folioFactura || null,
          fecha_factura: fechaFactura,
          rfc_emisor: cfdi?.rfcEmisor || null,
          uuid_cfdi: cfdi?.uuid || null,
          xml_url,
          metodo_pago: metodoPago,
          dias_credito: dias,
          fecha_pago_limite: fechaLimite,
          subtotal: nuevoSubtotal,
          impuestos: iva,
          total: nuevoTotal,
          estado: 'facturada',
          notas: notas
            ? `${notas}\n[Facturada desde OC recibida ${prefill.numero_compra}]`
            : `[Facturada desde OC recibida ${prefill.numero_compra}]`,
        } as any).eq('id', prefill.compra_id);

        if (upErr) throw upErr;

        // Si el trigger B1 acaba de crear una CxP retroactiva, marcarla
        // con nota clara para trazabilidad futura (solo si es crédito).
        if (metodoPago === 'credito' && dias > 0) {
          const { data: cxpNueva } = await supabase.from('cuentas_por_pagar')
            .select('id, notas')
            .eq('compra_id', prefill.compra_id)
            .limit(1)
            .maybeSingle();
          if (cxpNueva) {
            const marcador = 'Generada retroactivo al facturar OC ya recibida';
            if (!(cxpNueva.notas || '').includes(marcador)) {
              await supabase.from('cuentas_por_pagar').update({
                notas: `${cxpNueva.notas || ''} — ${marcador} (${prefill.numero_compra})`.trim(),
              }).eq('id', cxpNueva.id);
            }
          }
        }

        toast.success(`Factura registrada sobre ${prefill.numero_compra} — Total $${nuevoTotal.toFixed(2)}`);
        onSaved?.();
        onOpenChange(false);
        return;
      }

      // ============================================================
      // MODO NORMAL: registrar compra nueva vía RPC.
      // ============================================================
      const { data: alm, error: almErr } = await supabase.from('almacenes')
        .select('id, activo').eq('sucursal_id', selectedSucursal.id).order('activo', { ascending: false }).limit(1);
      if (almErr) throw almErr;
      if (!alm?.[0]) {
        throw new Error(`No hay almacén configurado para la sucursal "${selectedSucursal.nombre}". Contacta al admin.`);
      }
      if (!alm[0].activo) {
        throw new Error(`El almacén de la sucursal "${selectedSucursal.nombre}" está inactivo. Contacta al admin.`);
      }

      let xml_url: string | null = null;
      if (xmlFile && cfdi?.uuid) {
        const path = `${proveedorId}/${cfdi.uuid}.xml`;
        const { error: upErr } = await supabase.storage.from('comprobantes-pago')
          .upload(path, xmlFile, { upsert: true, contentType: 'application/xml' });
        if (!upErr) xml_url = path;
      }

      const { data, error } = await supabase.rpc('registrar_compra', {
        p_proveedor_id: proveedorId,
        p_sucursal_id: selectedSucursal.id,
        p_almacen_id: alm[0].id,
        p_lineas: lineasMapeadas.map(l => ({
          producto_id: l.producto_id,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          numero_lote: l.numero_lote || null,
          fecha_caducidad: l.fecha_caducidad || null,
        })),
        p_folio_factura: folioFactura || null,
        p_fecha_factura: fechaFactura,
        p_rfc_emisor: cfdi?.rfcEmisor || null,
        p_uuid_cfdi: cfdi?.uuid || null,
        p_xml_url: xml_url,
        p_metodo_pago: metodoPago,
        p_dias_credito: metodoPago === 'credito' ? parseInt(diasCredito) || 0 : 0,
        p_notas: notas || (lineasSinMapear > 0 ? `Quedan ${lineasSinMapear} conceptos sin mapear del CFDI` : null),
      });

      if (error) throw error;
      const res: any = data;
      toast.success(`Compra ${res.numero_compra} registrada — Total $${Number(res.total).toFixed(2)}`);
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Error al registrar la compra');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // -------- Render ----------
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {modoPrefill
              ? `Generar Factura — OC ${prefill?.numero_compra}`
              : `Nueva Factura de Compra — Paso ${paso} de 4`}
          </DialogTitle>
        </DialogHeader>

        {/* Paso 1: Origen */}
        {paso === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">¿Cómo quieres capturar esta compra?</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xml,application/xml,text/xml"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleXmlFile(f); e.target.value = ''; }}
            />
            <div className="grid grid-cols-2 gap-4">
              <Card
                className="cursor-pointer hover:border-primary hover:shadow-md transition"
                onClick={() => fileRef.current?.click()}
              >
                <CardContent className="p-6 text-center space-y-2">
                  <FileText className="h-10 w-10 mx-auto text-primary" />
                  <h3 className="font-semibold">Subir XML (CFDI)</h3>
                  <p className="text-xs text-muted-foreground">Recomendado. Auto-llena proveedor, folio, fecha y conceptos.</p>
                  <p className="text-[10px] text-muted-foreground">Click para seleccionar archivo</p>
                </CardContent>
              </Card>
              <Card
                className="cursor-pointer hover:border-primary hover:shadow-md transition"
                onClick={elegirManual}
              >
                <CardContent className="p-6 text-center space-y-2">
                  <Upload className="h-10 w-10 mx-auto text-primary" />
                  <h3 className="font-semibold">Captura manual</h3>
                  <p className="text-xs text-muted-foreground">Para facturas sin XML o ajustes manuales.</p>
                  <p className="text-[10px] text-muted-foreground">Click para continuar →</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Paso 2: Datos generales */}
        {paso === 2 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Proveedor *</Label>
              <Select value={proveedorId} onValueChange={(v) => {
                setProveedorId(v);
                const p = proveedores.find(x => x.id === v);
                if (p?.plazo_pago_dias) { setDiasCredito(String(p.plazo_pago_dias)); }
              }}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {proveedores.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre} {p.rfc ? `(${p.rfc})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cfdi?.rfcEmisor && !proveedorId && (
                <p className="text-xs text-amber-600 mt-1">
                  RFC del XML: {cfdi.rfcEmisor} — no encontrado en proveedores. Selecciona uno o crea el proveedor primero.
                </p>
              )}
            </div>
            <div>
              <Label>Folio de factura</Label>
              <Input value={folioFactura} onChange={e => setFolioFactura(e.target.value)} placeholder="A-1234" />
            </div>
            <div>
              <Label>Fecha de factura *</Label>
              <Input type="date" value={fechaFactura} onChange={e => setFechaFactura(e.target.value)} />
            </div>
            <div>
              <Label>Método de pago</Label>
              <Select value={metodoPago} onValueChange={(v: any) => setMetodoPago(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contado">Contado</SelectItem>
                  <SelectItem value="credito">Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Días de crédito</Label>
              <Input type="number" min="0" value={diasCredito}
                onChange={e => setDiasCredito(e.target.value)}
                disabled={metodoPago === 'contado'} />
            </div>
            <div className="col-span-2">
              <Label>Notas</Label>
              <Textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} />
            </div>
          </div>
        )}

        {/* Paso 3: Líneas + match */}
        {paso === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex gap-2 text-sm">
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> {lineasMapeadas.length} mapeadas
                </Badge>
                {lineasSinMapear > 0 && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-900">
                    <AlertTriangle className="h-3 w-3 mr-1" /> {lineasSinMapear} sin mapear
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                {origen === 'xml' && (
                  <Button size="sm" variant="outline" onClick={ejecutarMatch} disabled={verificando}>
                    {verificando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Re-verificar catálogo'}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={addLineaManual}>+ Agregar línea</Button>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clave / Producto</TableHead>
                    <TableHead className="w-24">Cant</TableHead>
                    <TableHead className="w-28">Precio U.</TableHead>
                    <TableHead className="w-32">Lote</TableHead>
                    <TableHead className="w-36">Caducidad</TableHead>
                    <TableHead className="w-28 text-right">Importe</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineas.map((l, i) => (
                    <TableRow key={i} className={!l.producto_id ? 'bg-amber-50/50' : ''}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">{l.clave_origen} — {l.descripcion_origen}</div>
                          <ProductSearchInput
                            products={productos}
                            value={l.producto_id || ''}
                            onSelect={(prodId) => {
                              const p = productos.find(x => x.id === prodId);
                              setMatchManual(i, p ? { id: p.id, nombre: p.nombre } : null);
                            }}
                            placeholder={l.producto_id ? l.producto_nombre || '' : 'Buscar producto en catálogo…'}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input type="number" min="1" value={l.cantidad}
                          onChange={e => updateLinea(i, { cantidad: parseInt(e.target.value) || 0 })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="0.01" value={l.precio_unitario}
                          onChange={e => updateLinea(i, { precio_unitario: parseFloat(e.target.value) || 0 })} />
                      </TableCell>
                      <TableCell>
                        <Input value={l.numero_lote} onChange={e => updateLinea(i, { numero_lote: e.target.value })}
                          placeholder="auto" />
                      </TableCell>
                      <TableCell>
                        <Input type="date" value={l.fecha_caducidad}
                          onChange={e => updateLinea(i, { fecha_caducidad: e.target.value })} />
                      </TableCell>
                      <TableCell className="text-right">
                        ${(l.cantidad * l.precio_unitario).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => removeLinea(i)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {lineas.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      Sin líneas. Agrega manualmente o regresa al paso 1 para subir un XML.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {lineasSinMapear > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                Hay {lineasSinMapear} línea(s) sin producto del catálogo. Se guardarán en las notas y no afectarán inventario.
                Mapéalas manualmente o continúa si prefieres dejarlas pendientes.
              </p>
            )}
          </div>
        )}

        {/* Paso 4: Resumen */}
        {paso === 4 && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span>Proveedor:</span><strong>{proveedores.find(p => p.id === proveedorId)?.nombre}</strong></div>
                <div className="flex justify-between"><span>Folio factura:</span><strong>{folioFactura || '—'}</strong></div>
                <div className="flex justify-between"><span>Fecha:</span><strong>{fechaFactura}</strong></div>
                <div className="flex justify-between"><span>Método de pago:</span><strong>{metodoPago === 'credito' ? `Crédito ${diasCredito} días` : 'Contado'}</strong></div>
                <div className="flex justify-between"><span>Líneas a registrar:</span><strong>{lineasMapeadas.length}</strong></div>
                {lineasSinMapear > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>Líneas sin mapear (se omiten):</span><strong>{lineasSinMapear}</strong>
                  </div>
                )}
                <div className="border-t pt-2 mt-2 space-y-1">
                  <div className="flex justify-between"><span>Subtotal:</span><strong>${subtotal.toFixed(2)}</strong></div>
                  <div className="flex justify-between"><span>IVA 16%:</span><strong>${iva.toFixed(2)}</strong></div>
                  <div className="flex justify-between text-lg"><span>Total:</span><strong>${total.toFixed(2)}</strong></div>
                </div>
                {cfdi?.uuid && Math.abs(total - cfdi.total) > 0.5 && (
                  <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                    El total calculado (${total.toFixed(2)}) difiere del total del CFDI (${cfdi.total.toFixed(2)}).
                    Revisa cantidades/precios o líneas sin mapear.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button variant="outline" onClick={() => paso > 1 ? setPaso(paso - 1) : onOpenChange(false)}>
            {paso > 1 ? <><ArrowLeft className="h-4 w-4 mr-1" /> Atrás</> : 'Cancelar'}
          </Button>
          {paso === 1 ? (
            <span className="text-xs text-muted-foreground self-center">Elige una opción arriba para continuar</span>
          ) : paso < 4 ? (
            <Button onClick={async () => {
              if (paso === 2) {
                if (!proveedorId) { toast.error('Selecciona proveedor'); return; }
                setPaso(3);
                if (origen === 'xml' && lineas.some(l => !l.producto_id)) {
                  await ejecutarMatch();
                }
              } else if (paso === 3) {
                if (lineasMapeadas.length === 0) { toast.error('Mapea al menos una línea al catálogo'); return; }
                setPaso(4);
              }
            }}>
              Siguiente <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={guardar} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Registrar compra
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NuevaFacturaWizard;
