import { supabase } from '@/integrations/supabase/client';
import { offlineDB, setMeta, META_KEYS, type PendingVenta } from './db';
import { toast } from 'sonner';

export interface SyncStats {
  cached: {
    productos: number;
    lotes: number;
    inventario: number;
    almacenes: number;
    metodos_pago: number;
    clientes: number;
    precios: number;
  };
}

/** Downloads a fresh snapshot of all data needed for offline operation. */
export async function fullSnapshot(sucursalId?: string): Promise<SyncStats> {
  const stats: SyncStats = {
    cached: { productos: 0, lotes: 0, inventario: 0, almacenes: 0, metodos_pago: 0, clientes: 0, precios: 0 },
  };

  // Sucursales
  const { data: sucursales } = await supabase.from('sucursales').select('*').eq('activo', true);
  if (sucursales) {
    await offlineDB.sucursales.clear();
    await offlineDB.sucursales.bulkPut(sucursales as any);
  }

  // Almacenes (all branches — small table)
  const { data: almacenes } = await supabase.from('almacenes').select('*').eq('activo', true);
  if (almacenes) {
    await offlineDB.almacenes.clear();
    await offlineDB.almacenes.bulkPut(almacenes as any);
    stats.cached.almacenes = almacenes.length;
  }

  // Productos
  const { data: productos } = await supabase.from('productos').select('*').eq('activo', true);
  if (productos) {
    await offlineDB.productos.clear();
    await offlineDB.productos.bulkPut(productos as any);
    stats.cached.productos = productos.length;
  }

  // Lotes
  const { data: lotes } = await supabase.from('lotes').select('*');
  if (lotes) {
    await offlineDB.lotes.clear();
    await offlineDB.lotes.bulkPut(lotes as any);
    stats.cached.lotes = lotes.length;
  }

  // Inventario — scope to selected sucursal's almacenes if provided
  let inventarioQuery = supabase.from('inventario').select('*, almacenes!inner(sucursal_id)');
  if (sucursalId) inventarioQuery = inventarioQuery.eq('almacenes.sucursal_id', sucursalId);
  const { data: inventario } = await inventarioQuery;
  if (inventario) {
    await offlineDB.inventario.clear();
    const rows = (inventario as any[]).map((i) => ({
      id: i.id,
      almacen_id: i.almacen_id,
      lote_id: i.lote_id,
      cantidad: i.cantidad,
      cantidad_servidor: i.cantidad,
      sucursal_id: i.almacenes?.sucursal_id || null,
    }));
    await offlineDB.inventario.bulkPut(rows as any);
    stats.cached.inventario = rows.length;
  }

  // Métodos de pago
  const { data: metodos } = await supabase.from('metodos_pago').select('*').eq('activo', true);
  if (metodos) {
    await offlineDB.metodos_pago.clear();
    await offlineDB.metodos_pago.bulkPut(metodos as any);
    stats.cached.metodos_pago = metodos.length;
  }

  // Clientes
  const { data: clientes } = await supabase.from('clientes').select('*').eq('activo', true);
  if (clientes) {
    await offlineDB.clientes.clear();
    await offlineDB.clientes.bulkPut(clientes as any);
    stats.cached.clientes = clientes.length;
  }

  // Precios por sucursal
  const { data: precios } = await supabase.from('producto_precios_sucursal').select('*').eq('activo', true);
  if (precios) {
    await offlineDB.precios_sucursal.clear();
    await offlineDB.precios_sucursal.bulkPut(precios as any);
    stats.cached.precios = precios.length;
  }

  await setMeta(META_KEYS.LAST_SYNC, new Date().toISOString());
  if (sucursalId) await setMeta(META_KEYS.LAST_SUCURSAL_ID, sucursalId);
  return stats;
}

/** Decrements cached inventory using FEFO when a sale happens offline. */
export async function deductInventoryLocalFEFO(
  almacenId: string,
  productoId: string,
  cantidad: number
): Promise<{ ok: boolean; deducted: number }> {
  // Find lots for product in this almacen, sorted by expiry (FEFO)
  const allInv = await offlineDB.inventario.where({ almacen_id: almacenId }).toArray();
  const lotIds = allInv.map((i) => i.lote_id);
  const lotes = await offlineDB.lotes.bulkGet(lotIds);
  const lotMap = new Map(lotes.filter(Boolean).map((l) => [l!.id, l!]));

  const candidates = allInv
    .filter((i) => {
      const l = lotMap.get(i.lote_id);
      return l && l.producto_id === productoId && i.cantidad > 0;
    })
    .sort((a, b) => {
      const fa = lotMap.get(a.lote_id)?.fecha_caducidad || '9999-12-31';
      const fb = lotMap.get(b.lote_id)?.fecha_caducidad || '9999-12-31';
      return fa.localeCompare(fb);
    });

  let remaining = cantidad;
  let deducted = 0;
  for (const inv of candidates) {
    if (remaining <= 0) break;
    const take = Math.min(inv.cantidad, remaining);
    await offlineDB.inventario.update(inv.id, { cantidad: inv.cantidad - take });
    remaining -= take;
    deducted += take;
  }
  return { ok: remaining === 0, deducted };
}

/** Returns total cached stock for a product in a given almacen. */
export async function getLocalStock(almacenId: string, productoId: string): Promise<number> {
  const allInv = await offlineDB.inventario.where({ almacen_id: almacenId }).toArray();
  const lotIds = allInv.map((i) => i.lote_id);
  const lotes = await offlineDB.lotes.bulkGet(lotIds);
  const lotMap = new Map(lotes.filter(Boolean).map((l) => [l!.id, l!]));
  return allInv
    .filter((i) => lotMap.get(i.lote_id)?.producto_id === productoId)
    .reduce((s, i) => s + i.cantidad, 0);
}

/** Processes the pending sales queue. Called when connection is restored. */
export async function processPendingQueue(): Promise<{
  ok: number;
  conflicts: number;
  errors: number;
}> {
  const pending = await offlineDB.pending_ventas
    .where('status')
    .anyOf('pending', 'error')
    .sortBy('created_at');

  let ok = 0;
  let conflicts = 0;
  let errors = 0;

  for (const v of pending) {
    await offlineDB.pending_ventas.update(v.cliente_uuid_local, { status: 'syncing' });
    try {
      const { data, error } = await supabase.rpc('process_pos_sale', {
        p_sucursal_id: v.sucursal_id,
        p_cajero_id: v.cajero_id,
        p_items: v.items.map((i) => ({
          producto_id: i.producto_id,
          cantidad: i.cantidad,
          precio_unitario: i.precio_unitario,
        })) as any,
        p_metodo_pago: v.metodo_pago,
        p_efectivo_recibido: v.efectivo_recibido ?? undefined,
        p_nota: v.notas ?? undefined,
        p_cliente_id: v.cliente_id ?? undefined,
        p_cliente_uuid_local: v.cliente_uuid_local,
        p_origen: 'offline',
      } as any);

      if (error) throw error;
      const result = data as any;
      if (v.requiere_factura && result?.sale_id) {
        await supabase.from('ventas').update({ requiere_factura: true }).eq('id', result.sale_id);
      }
      const isConflict = result?.estado === 'requiere_revision';


      await offlineDB.pending_ventas.update(v.cliente_uuid_local, {
        status: isConflict ? 'requires_review' : 'synced',
        synced_at: new Date().toISOString(),
        numero_venta_servidor: result?.numero_venta || null,
        error_message: isConflict ? result?.motivo_revision || null : null,
      });

      if (isConflict) conflicts++;
      else ok++;
    } catch (err: any) {
      await offlineDB.pending_ventas.update(v.cliente_uuid_local, {
        status: 'error',
        error_message: err?.message || String(err),
        retry_count: (v.retry_count || 0) + 1,
      });
      errors++;
    }
  }

  // Cleanup: remove successfully synced sales older than 7 days
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await offlineDB.pending_ventas
    .where('status')
    .equals('synced')
    .filter((v) => (v.synced_at || '') < weekAgo)
    .delete();

  if (ok + conflicts + errors > 0) {
    const parts: string[] = [];
    if (ok > 0) parts.push(`${ok} venta(s) sincronizada(s)`);
    if (conflicts > 0) parts.push(`${conflicts} requiere(n) revisión`);
    if (errors > 0) parts.push(`${errors} con error`);
    if (conflicts > 0 || errors > 0) toast.warning(parts.join(' · '));
    else toast.success(parts.join(' · '));
  }

  return { ok, conflicts, errors };
}

export async function countPending(): Promise<number> {
  return offlineDB.pending_ventas.where('status').anyOf('pending', 'error').count();
}

export async function countRequiresReview(): Promise<number> {
  return offlineDB.pending_ventas.where('status').equals('requires_review').count();
}
