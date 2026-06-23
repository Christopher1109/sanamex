import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Plus, Building2, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

type Cuenta = {
  id: string; banco_id: string; alias: string; no_cuenta: string | null; clabe: string | null;
  moneda: string; tipo: 'cuenta' | 'subcuenta' | 'tpv'; parent_id: string | null;
  sucursal_id: string | null; activo: boolean;
  bancos?: { nombre: string; codigo: string };
};
type Mov = {
  id: string; cuenta_id: string; fecha: string; concepto: string | null; referencia: string | null;
  cargo: number; abono: number; saldo: number | null; contraparte_nombre: string | null;
  contraparte_clabe: string | null; conciliado: boolean; origen: string;
};

const BancosPage = () => {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [bancos, setBancos] = useState<any[]>([]);
  const [sel, setSel] = useState<Cuenta | null>(null);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showMov, setShowMov] = useState(false);
  const [form, setForm] = useState({ banco_id: '', alias: '', no_cuenta: '', clabe: '', tipo: 'cuenta', parent_id: '' });
  const [movForm, setMovForm] = useState({ fecha: new Date().toISOString().slice(0, 10), concepto: '', referencia: '', cargo: '', abono: '', contraparte_nombre: '', contraparte_clabe: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);
  useEffect(() => { if (sel) loadMovs(sel.id); }, [sel]);

  const load = async () => {
    setLoading(true);
    const [{ data: cs }, { data: bs }] = await Promise.all([
      supabase.from('cuentas_bancarias').select('*, bancos(nombre,codigo)').eq('activo', true).order('alias'),
      supabase.from('bancos').select('*').eq('activo', true).order('nombre'),
    ]);
    setCuentas((cs as any) || []);
    setBancos(bs || []);
    if (cs?.length && !sel) setSel(cs[0] as any);
    setLoading(false);
  };

  const loadMovs = async (cuentaId: string) => {
    const { data } = await supabase.from('movimientos_bancarios').select('*').eq('cuenta_id', cuentaId).order('fecha', { ascending: false }).limit(200);
    setMovs((data as any) || []);
  };

  const createCuenta = async () => {
    if (!form.banco_id || !form.alias) { toast.error('Banco y alias requeridos'); return; }
    const { error } = await supabase.from('cuentas_bancarias').insert({
      banco_id: form.banco_id, alias: form.alias, no_cuenta: form.no_cuenta || null,
      clabe: form.clabe || null, tipo: form.tipo as any, parent_id: form.parent_id || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Cuenta creada'); setShowNew(false); load();
  };

  const saveMov = async () => {
    if (!sel) return;
    const cargo = parseFloat(movForm.cargo || '0');
    const abono = parseFloat(movForm.abono || '0');
    if (cargo === 0 && abono === 0) { toast.error('Captura cargo o abono'); return; }
    // Match básico por CLABE/cuenta
    let proveedor_sugerido_id: string | null = null;
    let cliente_sugerido_id: string | null = null;
    if (movForm.contraparte_clabe) {
      const { data: p } = await supabase.from('proveedores').select('id').or(`clabe.eq.${movForm.contraparte_clabe},cuenta_bancaria.eq.${movForm.contraparte_clabe}`).limit(1).maybeSingle();
      if (p) proveedor_sugerido_id = (p as any).id;
    }
    const { error } = await supabase.from('movimientos_bancarios').insert({
      cuenta_id: sel.id, fecha: movForm.fecha, concepto: movForm.concepto || null,
      referencia: movForm.referencia || null, cargo, abono,
      contraparte_nombre: movForm.contraparte_nombre || null, contraparte_clabe: movForm.contraparte_clabe || null,
      origen: 'manual', proveedor_sugerido_id, cliente_sugerido_id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Movimiento guardado'); setShowMov(false); loadMovs(sel.id);
  };

  const importarEstadoCuenta = async (file: File) => {
    if (!sel) { toast.error('Selecciona una cuenta primero'); return; }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sh = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sh, { defval: '' });
      if (!rows.length) { toast.error('Archivo vacío'); return; }
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const findKey = (row: any, ...needles: string[]) => {
        const keys = Object.keys(row);
        for (const n of needles) {
          const k = keys.find(k => norm(k).includes(n));
          if (k) return k;
        }
        return null;
      };
      const sample = rows[0];
      const kFecha = findKey(sample, 'fecha');
      const kConc = findKey(sample, 'concepto', 'descripcion');
      const kRef = findKey(sample, 'referencia', 'folio');
      const kCargo = findKey(sample, 'cargo', 'retiro', 'debito');
      const kAbono = findKey(sample, 'abono', 'deposito', 'credito');
      const kSaldo = findKey(sample, 'saldo');
      if (!kFecha) { toast.error('No se encontró columna "Fecha"'); return; }

      const parseFecha = (v: any): string | null => {
        if (!v) return null;
        if (typeof v === 'number') {
          const d = XLSX.SSF.parse_date_code(v);
          if (!d) return null;
          return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        }
        const s = String(v).trim();
        const iso = new Date(s);
        if (!isNaN(iso.getTime())) return iso.toISOString().slice(0, 10);
        return null;
      };
      const parseNum = (v: any): number => {
        if (v === '' || v === null || v === undefined) return 0;
        const n = parseFloat(String(v).replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : n;
      };

      const payload = rows.map(r => ({
        cuenta_id: sel.id,
        fecha: parseFecha(r[kFecha]),
        concepto: kConc ? String(r[kConc] || '') : null,
        referencia: kRef ? String(r[kRef] || '') : null,
        cargo: kCargo ? parseNum(r[kCargo]) : 0,
        abono: kAbono ? parseNum(r[kAbono]) : 0,
        saldo: kSaldo ? parseNum(r[kSaldo]) : null,
        origen: 'importado' as const,
      })).filter(x => x.fecha);

      if (!payload.length) { toast.error('Ninguna fila válida'); return; }
      const { error } = await supabase.from('movimientos_bancarios').insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success(`${payload.length} movimientos importados`);
      loadMovs(sel.id);
    } catch (e: any) { toast.error('Error: ' + e.message); }
  };

  const cuentasPadre = cuentas.filter(c => c.tipo === 'cuenta');
  const hijos = (padreId: string) => cuentas.filter(c => c.parent_id === padreId);

  const tipoBadge = (t: string) => (
    <Badge variant={t === 'cuenta' ? 'default' : t === 'subcuenta' ? 'secondary' : 'outline'}>{t.toUpperCase()}</Badge>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bancos</h1>
          <p className="text-muted-foreground">Catálogo de cuentas bancarias y movimientos</p>
        </div>
        <Button onClick={() => { setForm({ banco_id: '', alias: '', no_cuenta: '', clabe: '', tipo: 'cuenta', parent_id: '' }); setShowNew(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nueva cuenta
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Cuentas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {loading ? <p className="text-sm text-muted-foreground">Cargando...</p> :
              cuentasPadre.map(p => (
                <div key={p.id} className="space-y-1">
                  <button onClick={() => setSel(p)}
                    className={`w-full text-left p-2 rounded-md text-sm flex items-center gap-2 ${sel?.id === p.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                    <CreditCard className="h-4 w-4" />
                    <div className="flex-1">
                      <div className="font-medium">{p.alias}</div>
                      <div className="text-xs opacity-70">{p.bancos?.nombre}</div>
                    </div>
                  </button>
                  {hijos(p.id).map(h => (
                    <button key={h.id} onClick={() => setSel(h)}
                      className={`w-full text-left p-2 pl-8 rounded-md text-xs flex items-center justify-between ${sel?.id === h.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                      <span>{h.alias}</span>{tipoBadge(h.tipo)}
                    </button>
                  ))}
                </div>
              ))
            }
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">{sel?.alias || 'Selecciona una cuenta'}</CardTitle>
              {sel && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-1" /> Importar
                  </Button>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) importarEstadoCuenta(f); e.target.value = ''; }} />
                  <Button size="sm" onClick={() => { setMovForm({ fecha: new Date().toISOString().slice(0, 10), concepto: '', referencia: '', cargo: '', abono: '', contraparte_nombre: '', contraparte_clabe: '' }); setShowMov(true); }}>
                    <Plus className="h-4 w-4 mr-1" /> Movimiento
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!sel ? <p className="p-6 text-muted-foreground text-sm">Selecciona una cuenta de la izquierda.</p> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Fecha</TableHead><TableHead>Concepto</TableHead><TableHead>Ref.</TableHead>
                  <TableHead className="text-right">Cargo</TableHead><TableHead className="text-right">Abono</TableHead>
                  <TableHead>Estado</TableHead><TableHead>Origen</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {movs.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin movimientos</TableCell></TableRow>
                  ) : movs.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">{m.fecha}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{m.concepto || '—'}</TableCell>
                      <TableCell className="text-xs">{m.referencia || '—'}</TableCell>
                      <TableCell className="text-right text-destructive">{m.cargo > 0 ? `$${m.cargo.toFixed(2)}` : '—'}</TableCell>
                      <TableCell className="text-right text-green-600">{m.abono > 0 ? `$${m.abono.toFixed(2)}` : '—'}</TableCell>
                      <TableCell>{m.conciliado ? <Badge className="bg-green-100 text-green-700">Conciliado</Badge> : <Badge variant="secondary">Pendiente</Badge>}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{m.origen}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Nueva cuenta */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva cuenta bancaria</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Banco *</Label>
              <Select value={form.banco_id} onValueChange={v => setForm({ ...form, banco_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                <SelectContent>{bancos.map(b => <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Alias *</Label><Input value={form.alias} onChange={e => setForm({ ...form, alias: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>No. cuenta</Label><Input value={form.no_cuenta} onChange={e => setForm({ ...form, no_cuenta: e.target.value })} /></div>
              <div><Label>CLABE</Label><Input value={form.clabe} onChange={e => setForm({ ...form, clabe: e.target.value })} /></div>
            </div>
            <div><Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cuenta">Cuenta</SelectItem>
                  <SelectItem value="subcuenta">Subcuenta</SelectItem>
                  <SelectItem value="tpv">TPV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(form.tipo === 'subcuenta' || form.tipo === 'tpv') && (
              <div><Label>Cuenta padre</Label>
                <Select value={form.parent_id} onValueChange={v => setForm({ ...form, parent_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                  <SelectContent>{cuentasPadre.filter(c => !form.banco_id || c.banco_id === form.banco_id).map(c => <SelectItem key={c.id} value={c.id}>{c.alias}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter><Button onClick={createCuenta}>Crear</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movimiento manual */}
      <Dialog open={showMov} onOpenChange={setShowMov}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo movimiento — {sel?.alias}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Fecha</Label><Input type="date" value={movForm.fecha} onChange={e => setMovForm({ ...movForm, fecha: e.target.value })} /></div>
            <div><Label>Concepto</Label><Input value={movForm.concepto} onChange={e => setMovForm({ ...movForm, concepto: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Cargo</Label><Input type="number" step="0.01" value={movForm.cargo} onChange={e => setMovForm({ ...movForm, cargo: e.target.value })} /></div>
              <div><Label>Abono</Label><Input type="number" step="0.01" value={movForm.abono} onChange={e => setMovForm({ ...movForm, abono: e.target.value })} /></div>
            </div>
            <div><Label>Referencia</Label><Input value={movForm.referencia} onChange={e => setMovForm({ ...movForm, referencia: e.target.value })} /></div>
            <div><Label>Contraparte (nombre)</Label><Input value={movForm.contraparte_nombre} onChange={e => setMovForm({ ...movForm, contraparte_nombre: e.target.value })} /></div>
            <div><Label>Contraparte CLABE</Label><Input value={movForm.contraparte_clabe} onChange={e => setMovForm({ ...movForm, contraparte_clabe: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={saveMov}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BancosPage;
