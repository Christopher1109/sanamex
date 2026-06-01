import { useState, useReducer, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Barcode, Plus, Minus, ShoppingCart, Search, Printer, RotateCcw, WifiOff, Receipt } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSucursal } from '@/contexts/SucursalContext';
import { toast } from 'sonner';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { offlineDB } from '@/lib/offline/db';
import { deductInventoryLocalFEFO, getLocalStock } from '@/lib/offline/sync';
import { Badge } from '@/components/ui/badge';
import FacturarRapidoDialog from '@/components/FacturarRapidoDialog';

// ── Types ──

interface CartItem {
  producto_id: string;
  nombre: string;
  sku: string;
  codigo_barras: string;
  precio_unitario: number;
  cantidad: number;
  stock_disponible: number;
  subtotal: number;
}

type CartAction =
  | { type: 'ADD_ITEM'; payload: Omit<CartItem, 'subtotal'> }
  | { type: 'REMOVE_ITEM'; producto_id: string }
  | { type: 'SET_QTY'; producto_id: string; cantidad: number }
  | { type: 'INCREMENT'; producto_id: string }
  | { type: 'DECREMENT'; producto_id: string }
  | { type: 'CLEAR' };

interface SaleResult {
  sale_id: string;
  numero_venta: string;
  subtotal: number;
  total: number;
  cambio: number;
  items_count: number;
}

// ── Reducer ──

function cartReducer(state: CartItem[], action: CartAction): CartItem[] {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.find(i => i.producto_id === action.payload.producto_id);
      if (existing) {
        const newQty = existing.cantidad + 1;
        if (newQty > existing.stock_disponible) {
          toast.warning(`Stock máximo alcanzado: ${existing.stock_disponible} unidades`);
          return state;
        }
        return state.map(i =>
          i.producto_id === action.payload.producto_id
            ? { ...i, cantidad: newQty, subtotal: newQty * i.precio_unitario }
            : i
        );
      }
      if (action.payload.cantidad > action.payload.stock_disponible) {
        toast.warning(`Stock máximo: ${action.payload.stock_disponible} unidades`);
        return state;
      }
      const item: CartItem = {
        ...action.payload,
        subtotal: action.payload.cantidad * action.payload.precio_unitario,
      };
      return [...state, item];
    }
    case 'REMOVE_ITEM':
      return state.filter(i => i.producto_id !== action.producto_id);
    case 'SET_QTY': {
      return state.map(i => {
        if (i.producto_id !== action.producto_id) return i;
        let qty = Math.max(1, action.cantidad);
        if (qty > i.stock_disponible) {
          qty = i.stock_disponible;
          toast.warning(`Stock máximo: ${i.stock_disponible}`);
        }
        return { ...i, cantidad: qty, subtotal: qty * i.precio_unitario };
      });
    }
    case 'INCREMENT':
      return state.map(i => {
        if (i.producto_id !== action.producto_id) return i;
        const qty = i.cantidad + 1;
        if (qty > i.stock_disponible) {
          toast.warning(`Stock máximo: ${i.stock_disponible}`);
          return i;
        }
        return { ...i, cantidad: qty, subtotal: qty * i.precio_unitario };
      });
    case 'DECREMENT':
      return state.map(i => {
        if (i.producto_id !== action.producto_id) return i;
        const qty = Math.max(1, i.cantidad - 1);
        return { ...i, cantidad: qty, subtotal: qty * i.precio_unitario };
      });
    case 'CLEAR':
      return [];
    default:
      return state;
  }
}

// ── Component ──

const POSPage = () => {
  const { user } = useAuth();
  const { selectedSucursal, availableSucursales, setSelectedSucursal } = useSucursal();

  const onlineStatus = useOnlineStatus();
  const isOffline = onlineStatus === 'offline';

  const [cart, dispatch] = useReducer(cartReducer, []);
  const [scanInput, setScanInput] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [efectivoRecibido, setEfectivoRecibido] = useState('');
  const [nota, setNota] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [saleResult, setSaleResult] = useState<SaleResult | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [facturarOpen, setFacturarOpen] = useState(false);
  const [saleFacturada, setSaleFacturada] = useState(false);
  const [changeSucursalPending, setChangeSucursalPending] = useState<string | null>(null);

  const scanRef = useRef<HTMLInputElement>(null);

  const subtotal = cart.reduce((s, i) => s + i.subtotal, 0);
  const total = subtotal;
  const cambio = metodoPago === 'Efectivo' && efectivoRecibido
    ? Math.max(0, parseFloat(efectivoRecibido) - total)
    : 0;
  const canCharge = cart.length > 0 && total > 0 && !!selectedSucursal &&
    (metodoPago !== 'Efectivo' || (parseFloat(efectivoRecibido || '0') >= total));

  // ── Focus management ──
  const refocusScan = useCallback(() => {
    setTimeout(() => scanRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    refocusScan();
  }, [refocusScan]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setScanInput('');
        refocusScan();
      }
      if (e.ctrlKey && e.key === 'Backspace' && cart.length > 0) {
        e.preventDefault();
        setClearConfirmOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cart.length, refocusScan]);

  // ── Get stock for a product in the selected sucursal (online or offline) ──
  const getStockForProduct = async (productoId: string): Promise<number> => {
    if (!selectedSucursal) return 0;

    if (isOffline) {
      // Use cached almacen + inventory
      const almacenes = await offlineDB.almacenes
        .where({ sucursal_id: selectedSucursal.id })
        .toArray();
      if (!almacenes.length) return 0;
      let total = 0;
      for (const a of almacenes) {
        total += await getLocalStock(a.id, productoId);
      }
      return total;
    }

    const { data: almacenes } = await supabase
      .from('almacenes')
      .select('id')
      .eq('sucursal_id', selectedSucursal.id)
      .eq('activo', true);
    if (!almacenes?.length) return 0;

    const almacenIds = almacenes.map(a => a.id);
    const { data: inv } = await supabase
      .from('inventario')
      .select('cantidad, lote_id, lotes!inner(producto_id)')
      .in('almacen_id', almacenIds)
      .gt('cantidad', 0);

    if (!inv) return 0;
    return inv
      .filter((row: any) => row.lotes?.producto_id === productoId)
      .reduce((sum: number, row: any) => sum + (row.cantidad || 0), 0);
  };

  // ── Get sucursal-specific price (with cache fallback) ──
  const getPrecioForProduct = async (producto: any): Promise<number> => {
    if (!selectedSucursal) return producto.precio_base;
    if (isOffline) {
      const cached = await offlineDB.precios_sucursal
        .where({ producto_id: producto.id, sucursal_id: selectedSucursal.id })
        .first();
      return cached?.precio ?? producto.precio_base;
    }
    return producto.precio_base;
  };

  // ── Barcode scan handler ──
  const handleScan = async (barcode: string) => {
    if (!barcode.trim() || !selectedSucursal) return;
    const code = barcode.trim();

    let prod: any = null;
    if (isOffline) {
      prod = await offlineDB.productos.where('codigo_barras').equals(code).first();
      if (!prod) prod = await offlineDB.productos.where('sku').equals(code).first();
    } else {
      const { data: productos, error } = await supabase
        .from('productos')
        .select('*')
        .eq('codigo_barras', code)
        .eq('activo', true)
        .limit(1);
      if (!error && productos?.length) prod = productos[0];
    }

    if (!prod) {
      toast.error('Producto no encontrado');
      setScanInput('');
      refocusScan();
      return;
    }

    const stock = await getStockForProduct(prod.id);

    if (stock <= 0) {
      toast.error(`Sin stock en ${selectedSucursal.nombre}`);
      setScanInput('');
      refocusScan();
      return;
    }

    const existing = cart.find(i => i.producto_id === prod.id);
    if (existing && existing.cantidad >= stock) {
      toast.warning(`Stock máximo alcanzado: ${stock} unidades`);
      setScanInput('');
      refocusScan();
      return;
    }

    const precio = await getPrecioForProduct(prod);
    dispatch({
      type: 'ADD_ITEM',
      payload: {
        producto_id: prod.id,
        nombre: prod.nombre,
        sku: prod.sku || '',
        codigo_barras: prod.codigo_barras || '',
        precio_unitario: precio,
        cantidad: 1,
        stock_disponible: stock,
      },
    });

    toast.success(`${prod.nombre} agregado${isOffline ? ' (offline)' : ''}`);
    setScanInput('');
    refocusScan();
  };

  // ── Manual search ──
  const handleSearch = async () => {
    if (!searchInput.trim() || !selectedSucursal) return;
    const term = searchInput.trim().toLowerCase();

    if (isOffline) {
      const all = await offlineDB.productos.where('activo').equals(1 as any).toArray()
        .catch(async () => offlineDB.productos.toArray());
      const filtered = all
        .filter((p: any) => p.activo !== false)
        .filter((p: any) =>
          (p.nombre || '').toLowerCase().includes(term) ||
          (p.sku || '').toLowerCase().includes(term) ||
          (p.codigo_barras || '').toLowerCase().includes(term)
        )
        .slice(0, 20);
      setSearchResults(filtered);
      setSearchOpen(true);
      return;
    }

    const { data } = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)
      .or(`nombre.ilike.%${searchInput}%,sku.ilike.%${searchInput}%,codigo_barras.ilike.%${searchInput}%`)
      .limit(20);
    setSearchResults(data || []);
    setSearchOpen(true);
  };

  const addFromSearch = async (prod: any) => {
    const stock = await getStockForProduct(prod.id);
    if (stock <= 0) {
      toast.error(`Sin stock en ${selectedSucursal?.nombre}`);
      return;
    }
    const precio = await getPrecioForProduct(prod);
    dispatch({
      type: 'ADD_ITEM',
      payload: {
        producto_id: prod.id,
        nombre: prod.nombre,
        sku: prod.sku || '',
        codigo_barras: prod.codigo_barras || '',
        precio_unitario: precio,
        cantidad: 1,
        stock_disponible: stock,
      },
    });
    toast.success(`${prod.nombre} agregado${isOffline ? ' (offline)' : ''}`);
    setSearchOpen(false);
    setSearchInput('');
    refocusScan();
  };

  // ── Sucursal change with cart warning ──
  const handleSucursalChange = (sucursalId: string) => {
    if (cart.length > 0) {
      setChangeSucursalPending(sucursalId);
    } else {
      const s = availableSucursales.find(s => s.id === sucursalId);
      if (s) setSelectedSucursal(s);
    }
  };

  const confirmSucursalChange = () => {
    if (changeSucursalPending) {
      dispatch({ type: 'CLEAR' });
      const s = availableSucursales.find(s => s.id === changeSucursalPending);
      if (s) setSelectedSucursal(s);
      setChangeSucursalPending(null);
    }
  };

  // ── Checkout (online or offline) ──
  const handleCheckout = async () => {
    if (!user || !selectedSucursal) return;
    setLoading(true);
    setConfirmOpen(false);

    const itemsPayload = cart.map(i => ({
      producto_id: i.producto_id,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
    }));

    try {
      if (isOffline) {
        // ── OFFLINE PATH ──
        const uuid = crypto.randomUUID();
        const totalLocal = cart.reduce((s, i) => s + i.subtotal, 0);
        const cambioLocal = metodoPago === 'Efectivo' && efectivoRecibido
          ? Math.max(0, parseFloat(efectivoRecibido) - totalLocal) : 0;

        // 1. Save to pending queue
        await offlineDB.pending_ventas.put({
          cliente_uuid_local: uuid,
          sucursal_id: selectedSucursal.id,
          cajero_id: user.id,
          cliente_id: null,
          metodo_pago: metodoPago,
          efectivo_recibido: metodoPago === 'Efectivo' ? parseFloat(efectivoRecibido || '0') : null,
          notas: nota || null,
          items: cart.map(i => ({
            producto_id: i.producto_id,
            sku: i.sku,
            nombre: i.nombre,
            cantidad: i.cantidad,
            precio_unitario: i.precio_unitario,
          })),
          total: totalLocal,
          created_at: new Date().toISOString(),
          status: 'pending',
          error_message: null,
          numero_venta_servidor: null,
          synced_at: null,
          retry_count: 0,
        });

        // 2. Decrement local cache (FEFO) — Opción B reserva
        const almacenes = await offlineDB.almacenes.where({ sucursal_id: selectedSucursal.id }).toArray();
        const almacenId = almacenes[0]?.id;
        if (almacenId) {
          for (const i of cart) {
            await deductInventoryLocalFEFO(almacenId, i.producto_id, i.cantidad);
          }
        }

        const result: SaleResult = {
          sale_id: uuid,
          numero_venta: `OFFLINE-${uuid.slice(0, 8).toUpperCase()}`,
          subtotal: totalLocal,
          total: totalLocal,
          cambio: cambioLocal,
          items_count: cart.length,
        };
        setSaleResult(result);
        setSuccessOpen(true);
        dispatch({ type: 'CLEAR' });
        setEfectivoRecibido('');
        setNota('');
        toast.success(`Venta offline registrada · se sincronizará al recuperar conexión`);
        return;
      }

      // ── ONLINE PATH ──
      const { data, error } = await supabase.rpc('process_pos_sale', {
        p_sucursal_id: selectedSucursal.id,
        p_cajero_id: user.id,
        p_items: itemsPayload as any,
        p_metodo_pago: metodoPago,
        p_efectivo_recibido: metodoPago === 'Efectivo' ? parseFloat(efectivoRecibido || '0') : null,
        p_nota: nota || null,
        p_cliente_id: null,
      });

      if (error) throw error;

      const result = data as unknown as SaleResult;
      setSaleResult(result);
      setSuccessOpen(true);
      dispatch({ type: 'CLEAR' });
      setEfectivoRecibido('');
      setNota('');
      toast.success(`Venta ${result.numero_venta} completada`);
    } catch (err: any) {
      toast.error(err.message || 'Error al procesar la venta');
    } finally {
      setLoading(false);
    }
  };

  const handleNewSale = () => {
    setSuccessOpen(false);
    setSaleResult(null);
    refocusScan();
  };

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)]">
      {/* Top bar: Sucursal + Scan */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 min-w-[280px]">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Sucursal:</span>
          <Select value={selectedSucursal?.id || ''} onValueChange={handleSucursalChange}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Seleccionar sucursal" />
            </SelectTrigger>
            <SelectContent>
              {availableSucursales.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.codigo} — {s.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isOffline && (
            <Badge variant="destructive" className="gap-1">
              <WifiOff className="h-3 w-3" /> Offline
            </Badge>
          )}
        </div>

        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={scanRef}
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleScan(scanInput);
                }
              }}
              onBlur={refocusScan}
              placeholder="Escanear código de barras…"
              className="pl-10 text-lg h-12"
              autoFocus
            />
          </div>
          <div className="flex gap-1">
            <Input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Buscar por nombre/SKU"
              className="w-[200px]"
              onFocus={e => e.target.select()}
            />
            <Button variant="outline" onClick={handleSearch} size="icon">
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main 2-col layout */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-4 h-[calc(100%-5rem)]">
        {/* Left: Cart (70%) */}
        <Card className="lg:col-span-7 flex flex-col overflow-hidden">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Carrito ({cart.length} {cart.length === 1 ? 'producto' : 'productos'})
            </CardTitle>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setClearConfirmOpen(true)}>
                Limpiar carrito
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-center w-[100px]">Stock</TableHead>
                  <TableHead className="text-center w-[160px]">Cantidad</TableHead>
                  <TableHead className="text-right w-[100px]">Precio</TableHead>
                  <TableHead className="text-right w-[110px]">Subtotal</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-16">
                      <Barcode className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p className="text-lg">Escanee un código de barras para comenzar</p>
                      <p className="text-sm mt-1">o busque un producto manualmente</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  cart.map(item => (
                    <TableRow key={item.producto_id}>
                      <TableCell>
                        <p className="font-medium">{item.nombre}</p>
                        {item.sku && <p className="text-xs text-muted-foreground">{item.sku}</p>}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground text-sm">
                        {item.stock_disponible}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="outline" size="icon" className="h-8 w-8"
                            onClick={() => { dispatch({ type: 'DECREMENT', producto_id: item.producto_id }); refocusScan(); }}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            min={1}
                            max={item.stock_disponible}
                            value={item.cantidad}
                            onChange={e => {
                              dispatch({ type: 'SET_QTY', producto_id: item.producto_id, cantidad: parseInt(e.target.value) || 1 });
                            }}
                            className="w-16 text-center h-8"
                            onFocus={e => e.target.select()}
                          />
                          <Button variant="outline" size="icon" className="h-8 w-8"
                            onClick={() => { dispatch({ type: 'INCREMENT', producto_id: item.producto_id }); refocusScan(); }}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">${item.precio_unitario.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-bold">${item.subtotal.toFixed(2)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8"
                          onClick={() => { dispatch({ type: 'REMOVE_ITEM', producto_id: item.producto_id }); refocusScan(); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Right: Summary (30%) */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Resumen de Venta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Artículos</span>
                  <span>{cart.reduce((s, i) => s + i.cantidad, 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between text-xl font-bold">
                  <span>Total</span>
                  <span className="text-primary">${total.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Método de Pago</label>
                  <Select value={metodoPago} onValueChange={setMetodoPago}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Efectivo">💵 Efectivo</SelectItem>
                      <SelectItem value="Transferencia">🏦 Transferencia</SelectItem>
                      <SelectItem value="Tarjeta">💳 Tarjeta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {metodoPago === 'Efectivo' && (
                  <div className="space-y-2">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Efectivo recibido</label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={efectivoRecibido}
                        onChange={e => setEfectivoRecibido(e.target.value)}
                        placeholder="0.00"
                        className="mt-1"
                        onFocus={e => e.target.select()}
                      />
                    </div>
                    {parseFloat(efectivoRecibido || '0') >= total && total > 0 && (
                      <div className="flex justify-between text-lg font-bold text-green-600">
                        <span>Cambio</span>
                        <span>${cambio.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-muted-foreground">Nota (opcional)</label>
                  <Textarea
                    value={nota}
                    onChange={e => setNota(e.target.value)}
                    placeholder="Cliente o comentario…"
                    rows={2}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Button
                  className="w-full h-12 text-lg"
                  disabled={!canCharge || loading}
                  onClick={() => setConfirmOpen(true)}
                >
                  {loading ? 'Procesando…' : `💵 Cobrar $${total.toFixed(2)}`}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={cart.length === 0}
                  onClick={() => setClearConfirmOpen(true)}
                >
                  Cancelar Venta
                </Button>
              </div>

              {selectedSucursal && (
                <p className="text-xs text-muted-foreground text-center">
                  Sucursal: {selectedSucursal.nombre}
                </p>
              )}
              {!selectedSucursal && (
                <p className="text-xs text-destructive text-center font-medium">
                  ⚠ Seleccione una sucursal para vender
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Dialogs ── */}

      {/* Confirm checkout */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Venta</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p><strong>Sucursal:</strong> {selectedSucursal?.nombre}</p>
                <p><strong>Artículos:</strong> {cart.reduce((s, i) => s + i.cantidad, 0)}</p>
                <p><strong>Total:</strong> ${total.toFixed(2)}</p>
                <p><strong>Método:</strong> {metodoPago}</p>
                {metodoPago === 'Efectivo' && <p><strong>Cambio:</strong> ${cambio.toFixed(2)}</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCheckout} disabled={loading}>
              {loading ? 'Procesando…' : 'Confirmar Cobro'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear cart confirm */}
      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Limpiar carrito?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminarán todos los productos del carrito actual.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={() => { dispatch({ type: 'CLEAR' }); setClearConfirmOpen(false); refocusScan(); }}>
              Sí, limpiar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change sucursal confirm */}
      <AlertDialog open={!!changeSucursalPending} onOpenChange={() => setChangeSucursalPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiar sucursal</AlertDialogTitle>
            <AlertDialogDescription>Cambiar de sucursal limpiará el carrito actual. ¿Continuar?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setChangeSucursalPending(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSucursalChange}>Cambiar y limpiar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sale success */}
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-green-600 text-xl">✅ Venta completada</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2">
                {saleResult && (
                  <>
                    <div className="bg-muted p-4 rounded-lg text-center">
                      <p className="text-sm text-muted-foreground">Folio</p>
                      <p className="text-2xl font-mono font-bold">{saleResult.numero_venta}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Subtotal:</span> ${saleResult.subtotal?.toFixed(2)}</div>
                      <div><span className="text-muted-foreground">Total:</span> <strong>${saleResult.total?.toFixed(2)}</strong></div>
                      <div><span className="text-muted-foreground">Artículos:</span> {saleResult.items_count}</div>
                      {saleResult.cambio > 0 && (
                        <div><span className="text-muted-foreground">Cambio:</span> <strong className="text-green-600">${saleResult.cambio?.toFixed(2)}</strong></div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir
            </Button>
            {saleResult && !saleResult.numero_venta.startsWith('OFFLINE-') && (
              <Button variant="secondary" onClick={() => setFacturarOpen(true)}>
                <Receipt className="h-4 w-4 mr-2" /> Facturar ahora
              </Button>
            )}
            <Button onClick={handleNewSale}>
              <RotateCcw className="h-4 w-4 mr-2" /> Nueva Venta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Facturación rápida */}
      {saleResult && (
        <FacturarRapidoDialog
          open={facturarOpen}
          onOpenChange={setFacturarOpen}
          venta_id={saleResult.sale_id}
          referencia={saleResult.numero_venta}
          onSuccess={() => setFacturarOpen(false)}
        />
      )}

      {/* Search results */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Resultados de búsqueda</DialogTitle>
          </DialogHeader>
          <div className="max-h-[400px] overflow-auto">
            {searchResults.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Sin resultados</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchResults.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="font-medium">{p.nombre}</p>
                        <p className="text-xs text-muted-foreground">{p.sku} {p.codigo_barras ? `• ${p.codigo_barras}` : ''}</p>
                      </TableCell>
                      <TableCell className="text-right">${p.precio_base?.toFixed(2)}</TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => addFromSearch(p)}>
                          <Plus className="h-3 w-3 mr-1" /> Agregar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default POSPage;
