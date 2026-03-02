import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useHospital } from "@/contexts/HospitalContext";
import { useRegistroActividad } from "@/hooks/useRegistroActividad";
import { useAlmacenesProvisionales, usePaginatedInventarioProvisional, usePaginatedInventarioGeneral } from "@/hooks/usePaginatedAlmacenesProvisionales";
import { Plus, Warehouse, ArrowRight, ArrowLeft, Package, RefreshCw, Search, Trash2, CheckSquare, Calendar } from "lucide-react";
import ProgramacionDiaForm from "@/components/forms/ProgramacionDiaForm";
import { assertSupabaseOk, collectSupabaseErrors } from "@/utils/supabaseAssert";
import { useQueryClient } from "@tanstack/react-query";

interface AlmacenProvisional {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  es_principal: boolean;
}

interface InventarioProvisional {
  id: string;
  almacen_provisional_id: string;
  insumo_catalogo_id: string;
  cantidad_disponible: number;
  insumo?: { id: string; nombre: string; clave: string };
}

const AlmacenesProvisionales = () => {
  const { selectedHospital } = useHospital();
  const { registrarActividad } = useRegistroActividad();
  const queryClient = useQueryClient();
  
  const [selectedAlmacen, setSelectedAlmacen] = useState<AlmacenProvisional | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchTermTraspaso, setSearchTermTraspaso] = useState("");

  // Cached almacenes query
  const { data: almacenes = [], isLoading: loadingAlmacenes, refetch: refetchAlmacenes } = 
    useAlmacenesProvisionales(selectedHospital?.id);

  // Paginated provisional inventory
  const {
    data: inventarioProvisional,
    hasAnyData: hasAnyInventarioProvisional, // Saber si hay datos sin filtrar
    isLoading: loadingProvisional,
    page: pageProvisional,
    pageSize: pageSizeProvisional,
    totalCount: totalProvisional,
    totalPages: totalPagesProvisional,
    hasNextPage: hasNextProvisional,
    hasPreviousPage: hasPrevProvisional,
    goToPage: goToPageProvisional,
    changePageSize: changePageSizeProvisional,
    refetch: refetchProvisional,
  } = usePaginatedInventarioProvisional(selectedAlmacen?.id, searchTerm);

  // Paginated general inventory for transfers
  const {
    data: inventarioGeneral,
    isLoading: loadingGeneral,
    page: pageGeneral,
    pageSize: pageSizeGeneral,
    totalCount: totalGeneral,
    totalPages: totalPagesGeneral,
    hasNextPage: hasNextGeneral,
    hasPreviousPage: hasPrevGeneral,
    goToPage: goToPageGeneral,
    changePageSize: changePageSizeGeneral,
  } = usePaginatedInventarioGeneral(selectedHospital?.id, searchTermTraspaso);

  // Dialogs
  const [dialogCrearOpen, setDialogCrearOpen] = useState(false);
  const [dialogTraspasoOpen, setDialogTraspasoOpen] = useState(false);
  const [dialogDevolucionOpen, setDialogDevolucionOpen] = useState(false);
  const [dialogEliminarOpen, setDialogEliminarOpen] = useState(false);
  const [dialogProgramacionOpen, setDialogProgramacionOpen] = useState(false);
  const [almacenAEliminar, setAlmacenAEliminar] = useState<AlmacenProvisional | null>(null);
  const [inventarioAlmacenEliminar, setInventarioAlmacenEliminar] = useState<InventarioProvisional[]>([]);
  const [modoEliminar, setModoEliminar] = useState<"confirmar" | "inspeccionar">("confirmar");

  // Form states
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaDescripcion, setNuevaDescripcion] = useState("");
  const [cantidadesTraspaso, setCantidadesTraspaso] = useState<Record<string, number>>({});
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [cantidadesDevolucion, setCantidadesDevolucion] = useState<Record<string, number>>({});
  const [procesando, setProcesando] = useState(false);
  const [progresoTraspaso, setProgresoTraspaso] = useState(0);
  const [mensajeProgreso, setMensajeProgreso] = useState("");

  // Auto-select first almacen when loaded
  useEffect(() => {
    if (almacenes.length > 0 && !selectedAlmacen) {
      setSelectedAlmacen(almacenes[0]);
    }
  }, [almacenes, selectedAlmacen]);

  const toggleSeleccion = (insumoCatalogoId: string) => {
    const nuevos = new Set(seleccionados);
    if (nuevos.has(insumoCatalogoId)) {
      nuevos.delete(insumoCatalogoId);
      const nuevasCantidades = { ...cantidadesTraspaso };
      delete nuevasCantidades[insumoCatalogoId];
      setCantidadesTraspaso(nuevasCantidades);
    } else {
      nuevos.add(insumoCatalogoId);
    }
    setSeleccionados(nuevos);
  };

  const seleccionarTodos = () => {
    const nuevos = new Set(inventarioGeneral.map((item) => item.insumo_catalogo_id));
    setSeleccionados(nuevos);
  };

  const deseleccionarTodos = () => {
    setSeleccionados(new Set());
    setCantidadesTraspaso({});
  };

  const crearAlmacen = async () => {
    if (!selectedHospital || !nuevoNombre.trim()) return;

    setProcesando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("almacenes_provisionales")
        .insert({
          hospital_id: selectedHospital.id,
          nombre: nuevoNombre.trim(),
          descripcion: nuevaDescripcion.trim() || null,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      await registrarActividad({
        tipo_actividad: 'almacen_provisional_creado',
        descripcion: `Almacén provisional "${nuevoNombre.trim()}" creado`,
        almacen_destino_id: data.id,
        almacen_destino_nombre: nuevoNombre.trim(),
        detalles_adicionales: { descripcion: nuevaDescripcion.trim() || null }
      });

      toast.success("Almacén provisional creado");
      setDialogCrearOpen(false);
      setNuevoNombre("");
      setNuevaDescripcion("");
      refetchAlmacenes();

      if (data) {
        setSelectedAlmacen(data);
      }
    } catch (error) {
      console.error("Error creating warehouse:", error);
      toast.error("Error al crear almacén");
    } finally {
      setProcesando(false);
    }
  };

  const abrirDialogTraspaso = () => {
    if (!selectedAlmacen) return;
    setCantidadesTraspaso({});
    setSeleccionados(new Set());
    setSearchTermTraspaso("");
    setProgresoTraspaso(0);
    setMensajeProgreso("");
    setDialogTraspasoOpen(true);
  };

  const ejecutarTraspaso = async () => {
    if (!selectedHospital || !selectedAlmacen) {
      toast.error("No hay almacén seleccionado");
      return;
    }

    const itemsTraspaso = Object.entries(cantidadesTraspaso).filter(
      ([insumoCatalogoId, cantidad]) => seleccionados.has(insumoCatalogoId) && cantidad > 0,
    );

    if (itemsTraspaso.length === 0) {
      toast.error("Selecciona al menos un insumo y asigna cantidades");
      return;
    }

    setProcesando(true);
    setProgresoTraspaso(0);
    setMensajeProgreso("Preparando traspaso...");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const almacenId = selectedAlmacen.id;
      const hospitalId = selectedHospital.id;
      const totalItems = itemsTraspaso.length;

      setMensajeProgreso("Cargando inventario...");
      const lotesRes = await supabase
        .from("inventario_lotes")
        .select(`
          id, 
          cantidad, 
          consolidado_id,
          inventario_consolidado!inner(insumo_catalogo_id, hospital_id)
        `)
        .eq("inventario_consolidado.hospital_id", hospitalId)
        .gt("cantidad", 0)
        .order("fecha_entrada", { ascending: true });

      const todosLotes = assertSupabaseOk(
        lotesRes,
        "AlmacenesProvisionales.ejecutarTraspaso: cargar inventario general",
      ) as Array<{ id: string; cantidad: number; consolidado_id: string; inventario_consolidado: { insumo_catalogo_id: string; hospital_id: string } }> | null;

      const provRes = await supabase
        .from("almacen_provisional_inventario")
        .select("id, insumo_catalogo_id, cantidad_disponible")
        .eq("almacen_provisional_id", almacenId);

      const inventarioProv = assertSupabaseOk(
        provRes,
        "AlmacenesProvisionales.ejecutarTraspaso: cargar inventario provisional",
      ) as Array<{ id: string; insumo_catalogo_id: string; cantidad_disponible: number }> | null;

      const lotesPorInsumo = new Map<string, Array<{ id: string; cantidad: number; consolidado_id: string }>>();
      for (const lote of (todosLotes || [])) {
        const insumoCatId = lote.inventario_consolidado.insumo_catalogo_id;
        const arr = lotesPorInsumo.get(insumoCatId) || [];
        arr.push({ id: lote.id, cantidad: lote.cantidad, consolidado_id: lote.consolidado_id });
        lotesPorInsumo.set(insumoCatId, arr);
      }

      const provPorInsumo = new Map<string, { id: string; cantidad_disponible: number }>();
      for (const item of (inventarioProv || [])) {
        provPorInsumo.set(item.insumo_catalogo_id, { id: item.id, cantidad_disponible: item.cantidad_disponible });
      }

      setMensajeProgreso("Procesando traspasos...");
      const updateLotes: Array<{ id: string; cantidad: number; consolidado_id: string }> = [];
      const updateConsolidados: Map<string, number> = new Map();
      const updateProv: Array<{ id: string; cantidad_disponible: number }> = [];
      const insertProv: Array<{
        almacen_provisional_id: string;
        insumo_catalogo_id: string;
        cantidad_disponible: number;
      }> = [];
      const movimientos: Array<{
        almacen_provisional_id: string;
        hospital_id: string;
        insumo_catalogo_id: string;
        cantidad: number;
        tipo: string;
        usuario_id: string | undefined;
        observaciones: string;
      }> = [];

      let procesados = 0;
      for (const [insumoCatalogoId, cantidadSolicitada] of itemsTraspaso) {
        const lotes = lotesPorInsumo.get(insumoCatalogoId) || [];
        const stockTotal = lotes.reduce((sum, l) => sum + (l.cantidad || 0), 0);
        if (stockTotal < cantidadSolicitada) {
          throw new Error(
            `Stock insuficiente para insumo ${insumoCatalogoId}. Disponible: ${stockTotal}, Requerido: ${cantidadSolicitada}.`,
          );
        }
        let cantidadRestante = cantidadSolicitada;

        for (const lote of lotes) {
          if (cantidadRestante <= 0) break;
          const aDescontar = Math.min(cantidadRestante, lote.cantidad);
          const nuevaCantidad = lote.cantidad - aDescontar;
          lote.cantidad = nuevaCantidad;
          updateLotes.push({ id: lote.id, cantidad: nuevaCantidad, consolidado_id: lote.consolidado_id });
          
          const currentDeduct = updateConsolidados.get(lote.consolidado_id) || 0;
          updateConsolidados.set(lote.consolidado_id, currentDeduct + aDescontar);
          
          cantidadRestante -= aDescontar;
        }

        const existente = provPorInsumo.get(insumoCatalogoId);
        if (existente) {
          updateProv.push({
            id: existente.id,
            cantidad_disponible: (existente.cantidad_disponible || 0) + cantidadSolicitada,
          });
        } else {
          insertProv.push({
            almacen_provisional_id: almacenId,
            insumo_catalogo_id: insumoCatalogoId,
            cantidad_disponible: cantidadSolicitada,
          });
        }

        movimientos.push({
          almacen_provisional_id: almacenId,
          hospital_id: hospitalId,
          insumo_catalogo_id: insumoCatalogoId,
          cantidad: cantidadSolicitada,
          tipo: "entrada",
          usuario_id: user?.id,
          observaciones: "Traspaso desde almacén general",
        });

        procesados++;
        setProgresoTraspaso(Math.round((procesados / totalItems) * 50));
      }

      setMensajeProgreso(`Guardando ${procesados} traspasos...`);

      const BATCH_SIZE = 50;
      for (let i = 0; i < updateLotes.length; i += BATCH_SIZE) {
        const batch = updateLotes.slice(i, i + BATCH_SIZE);
        const batchRes = await Promise.all(
          batch.map((lote) =>
            supabase
              .from("inventario_lotes")
              .update({ cantidad: lote.cantidad, updated_at: new Date().toISOString() })
              .eq("id", lote.id),
          ),
        );
        collectSupabaseErrors(batchRes as any, "AlmacenesProvisionales.ejecutarTraspaso: update inventario_lotes");
        setProgresoTraspaso(50 + Math.round((i / updateLotes.length) * 20));
      }

      for (const [consolidadoId, cantidadRestar] of updateConsolidados) {
        await supabase.rpc("recalcular_alerta_consolidado", { p_consolidado_id: consolidadoId });
        const { data: currentConsolidado } = await supabase
          .from("inventario_consolidado")
          .select("cantidad_total")
          .eq("id", consolidadoId)
          .single();
        if (currentConsolidado) {
          await supabase
            .from("inventario_consolidado")
            .update({ 
              cantidad_total: Math.max(0, currentConsolidado.cantidad_total - cantidadRestar),
              updated_at: new Date().toISOString() 
            })
            .eq("id", consolidadoId);
        }
      }

      if (updateProv.length > 0) {
        const upRes = await Promise.all(
          updateProv.map((item) =>
            supabase
              .from("almacen_provisional_inventario")
              .update({ cantidad_disponible: item.cantidad_disponible, updated_at: new Date().toISOString() })
              .eq("id", item.id),
          ),
        );
        collectSupabaseErrors(upRes as any, "AlmacenesProvisionales.ejecutarTraspaso: update provisional");
      }

      if (insertProv.length > 0) {
        const insRes = await supabase.from("almacen_provisional_inventario").insert(insertProv);
        assertSupabaseOk(insRes as any, "AlmacenesProvisionales.ejecutarTraspaso: insert provisional");
      }
      setProgresoTraspaso(80);

      if (movimientos.length > 0) {
        const movRes = await supabase.from("movimientos_almacen_provisional").insert(movimientos);
        assertSupabaseOk(movRes as any, "AlmacenesProvisionales.ejecutarTraspaso: insert movimientos");
      }
      setProgresoTraspaso(100);

      const insumosAfectados = itemsTraspaso.map(([insumoCatalogoId, cantidad]) => {
        const inv = inventarioGeneral.find(i => i.insumo_catalogo_id === insumoCatalogoId);
        return {
          insumo_id: insumoCatalogoId,
          nombre: inv?.insumo?.nombre || 'Desconocido',
          clave: inv?.insumo?.clave || '',
          cantidad
        };
      });

      await registrarActividad({
        tipo_actividad: 'traspaso_almacen_provisional',
        descripcion: `Traspaso de ${procesados} insumos al almacén provisional "${selectedAlmacen.nombre}"`,
        almacen_origen_nombre: 'Almacén General',
        almacen_destino_id: almacenId,
        almacen_destino_nombre: selectedAlmacen.nombre,
        insumos_afectados: insumosAfectados,
        cantidad_total: insumosAfectados.reduce((sum, i) => sum + i.cantidad, 0)
      });

      toast.success(`${procesados} insumos traspasados correctamente`);
      setDialogTraspasoOpen(false);
      setCantidadesTraspaso({});
      setSeleccionados(new Set());
      refetchProvisional();
      queryClient.invalidateQueries({ queryKey: ['inventario-general-paginated'] });
    } catch (error) {
      console.error("Error executing transfer:", error);
      toast.error("Error al realizar traspaso");
    } finally {
      setProcesando(false);
      setProgresoTraspaso(0);
      setMensajeProgreso("");
    }
  };

  const abrirDialogDevolucion = () => {
    if (!selectedAlmacen) return;
    setCantidadesDevolucion({});
    setDialogDevolucionOpen(true);
  };

  const ejecutarDevolucion = async () => {
    if (!selectedHospital || !selectedAlmacen) return;

    const itemsDevolucion = Object.entries(cantidadesDevolucion).filter(([_, cantidad]) => cantidad > 0);
    if (itemsDevolucion.length === 0) {
      toast.error("Selecciona al menos un insumo");
      return;
    }

    setProcesando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: almacenGeneral } = await supabase
        .from("almacenes")
        .select("id")
        .eq("hospital_id", selectedHospital.id)
        .maybeSingle();

      if (!almacenGeneral) {
        toast.error("No se encontró almacén general");
        return;
      }

      for (const [inventarioProvId, cantidad] of itemsDevolucion) {
        const item = inventarioProvisional.find((i) => i.id === inventarioProvId);
        if (!item || cantidad > item.cantidad_disponible) continue;

        await supabase
          .from("almacen_provisional_inventario")
          .update({
            cantidad_disponible: item.cantidad_disponible - cantidad,
            updated_at: new Date().toISOString(),
          })
          .eq("id", inventarioProvId);

        const { data: existenteConsolidado } = await supabase
          .from("inventario_consolidado")
          .select("id, cantidad_total")
          .eq("hospital_id", selectedHospital.id)
          .eq("almacen_id", almacenGeneral.id)
          .eq("insumo_catalogo_id", item.insumo_catalogo_id)
          .maybeSingle();

        let consolidadoId: string;

        if (existenteConsolidado) {
          await supabase
            .from("inventario_consolidado")
            .update({
              cantidad_total: (existenteConsolidado.cantidad_total || 0) + cantidad,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existenteConsolidado.id);
          consolidadoId = existenteConsolidado.id;
        } else {
          const { data: newConsolidado } = await supabase
            .from("inventario_consolidado")
            .insert({
              hospital_id: selectedHospital.id,
              almacen_id: almacenGeneral.id,
              insumo_catalogo_id: item.insumo_catalogo_id,
              cantidad_total: cantidad,
              cantidad_minima: 10,
            })
            .select()
            .single();
          consolidadoId = newConsolidado?.id;
        }

        if (consolidadoId) {
          await supabase.from("inventario_lotes").insert({
            consolidado_id: consolidadoId,
            cantidad: cantidad,
            fecha_entrada: new Date().toISOString(),
            ubicacion: "Devolución provisional",
          });
        }

        await supabase.from("movimientos_almacen_provisional").insert({
          almacen_provisional_id: selectedAlmacen.id,
          hospital_id: selectedHospital.id,
          insumo_catalogo_id: item.insumo_catalogo_id,
          cantidad: cantidad,
          tipo: "salida",
          usuario_id: user?.id,
          observaciones: "Devolución a almacén general",
        });
      }

      const insumosAfectados = itemsDevolucion.map(([inventarioProvId, cantidad]) => {
        const item = inventarioProvisional.find((i) => i.id === inventarioProvId);
        return {
          insumo_id: item?.insumo_catalogo_id || '',
          nombre: item?.insumo?.nombre || 'Desconocido',
          clave: item?.insumo?.clave || '',
          cantidad
        };
      });

      await registrarActividad({
        tipo_actividad: 'devolucion_almacen_principal',
        descripcion: `Devolución de ${itemsDevolucion.length} insumos del almacén provisional "${selectedAlmacen.nombre}" al almacén general`,
        almacen_origen_id: selectedAlmacen.id,
        almacen_origen_nombre: selectedAlmacen.nombre,
        almacen_destino_nombre: 'Almacén General',
        insumos_afectados: insumosAfectados,
        cantidad_total: insumosAfectados.reduce((sum, i) => sum + i.cantidad, 0)
      });

      toast.success(`${itemsDevolucion.length} insumos devueltos al almacén general`);
      setDialogDevolucionOpen(false);
      refetchProvisional();
    } catch (error) {
      console.error("Error executing return:", error);
      toast.error("Error al realizar devolución");
    } finally {
      setProcesando(false);
    }
  };

  const abrirDialogEliminar = async (almacen: AlmacenProvisional) => {
    try {
      const { data: inventario, error } = await supabase
        .from("almacen_provisional_inventario")
        .select(`*, insumo:insumos_catalogo(id, nombre, clave)`)
        .eq("almacen_provisional_id", almacen.id)
        .gt("cantidad_disponible", 0);

      if (error) throw error;

      setAlmacenAEliminar(almacen);
      setInventarioAlmacenEliminar(inventario || []);
      setModoEliminar("confirmar");
      setDialogEliminarOpen(true);
    } catch (error) {
      console.error("Error checking inventory:", error);
      toast.error("Error al verificar inventario");
    }
  };

  const ejecutarEliminacion = async (devolverTodo: boolean) => {
    if (!almacenAEliminar || !selectedHospital) {
      toast.error("Datos incompletos para eliminar");
      return;
    }

    const almacenIdEliminar = almacenAEliminar.id;
    setProcesando(true);
    setProgresoTraspaso(0);
    setMensajeProgreso("Preparando eliminación...");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const timestamp = new Date().toISOString();

      if (devolverTodo && inventarioAlmacenEliminar.length > 0) {
        setMensajeProgreso("Buscando almacén general...");
        const { data: almacenGeneral } = await supabase
          .from("almacenes")
          .select("id")
          .eq("hospital_id", selectedHospital.id)
          .maybeSingle();

        if (!almacenGeneral) {
          toast.error("No se encontró almacén general");
          setProcesando(false);
          return;
        }

        setMensajeProgreso("Cargando inventario consolidado...");
        setProgresoTraspaso(10);

        // Cargar TODOS los consolidados existentes de una vez
        const insumoIds = inventarioAlmacenEliminar.map(i => i.insumo_catalogo_id);
        const { data: consolidadosExistentes } = await supabase
          .from("inventario_consolidado")
          .select("id, cantidad_total, insumo_catalogo_id")
          .eq("hospital_id", selectedHospital.id)
          .eq("almacen_id", almacenGeneral.id)
          .in("insumo_catalogo_id", insumoIds);

        const consolidadoMap = new Map<string, { id: string; cantidad_total: number }>();
        for (const c of consolidadosExistentes || []) {
          consolidadoMap.set(c.insumo_catalogo_id, { id: c.id, cantidad_total: c.cantidad_total });
        }

        setMensajeProgreso("Preparando devoluciones...");
        setProgresoTraspaso(20);

        // Preparar todas las operaciones
        const updateConsolidados: Array<{ id: string; cantidad_total: number }> = [];
        const insertConsolidados: Array<{ hospital_id: string; almacen_id: string; insumo_catalogo_id: string; cantidad_total: number; cantidad_minima: number }> = [];
        const insertLotes: Array<{ consolidado_id: string; cantidad: number; fecha_entrada: string; ubicacion: string }> = [];
        const movimientos: Array<any> = [];

        for (const item of inventarioAlmacenEliminar) {
          const cantidad = item.cantidad_disponible;
          if (cantidad <= 0) continue;

          const existente = consolidadoMap.get(item.insumo_catalogo_id);

          if (existente) {
            updateConsolidados.push({
              id: existente.id,
              cantidad_total: (existente.cantidad_total || 0) + cantidad,
            });
            insertLotes.push({
              consolidado_id: existente.id,
              cantidad: cantidad,
              fecha_entrada: timestamp,
              ubicacion: "Devolución por eliminación",
            });
          } else {
            // Necesitamos crear consolidado primero
            insertConsolidados.push({
              hospital_id: selectedHospital.id,
              almacen_id: almacenGeneral.id,
              insumo_catalogo_id: item.insumo_catalogo_id,
              cantidad_total: cantidad,
              cantidad_minima: 10,
            });
          }

          movimientos.push({
            almacen_provisional_id: almacenIdEliminar,
            hospital_id: selectedHospital.id,
            insumo_catalogo_id: item.insumo_catalogo_id,
            cantidad: cantidad,
            tipo: "salida",
            usuario_id: user?.id,
            observaciones: "Devolución por eliminación de almacén provisional",
          });
        }

        setMensajeProgreso("Actualizando inventario consolidado...");
        setProgresoTraspaso(40);

        // Ejecutar updates de consolidados en paralelo
        if (updateConsolidados.length > 0) {
          await Promise.all(
            updateConsolidados.map(c =>
              supabase
                .from("inventario_consolidado")
                .update({ cantidad_total: c.cantidad_total, updated_at: timestamp })
                .eq("id", c.id)
            )
          );
        }

        setProgresoTraspaso(50);

        // Insertar nuevos consolidados y crear sus lotes
        if (insertConsolidados.length > 0) {
          const { data: nuevosConsolidados } = await supabase
            .from("inventario_consolidado")
            .insert(insertConsolidados)
            .select("id, insumo_catalogo_id");

          if (nuevosConsolidados) {
            for (const nc of nuevosConsolidados) {
              const item = inventarioAlmacenEliminar.find(i => i.insumo_catalogo_id === nc.insumo_catalogo_id);
              if (item) {
                insertLotes.push({
                  consolidado_id: nc.id,
                  cantidad: item.cantidad_disponible,
                  fecha_entrada: timestamp,
                  ubicacion: "Devolución por eliminación",
                });
              }
            }
          }
        }

        setMensajeProgreso("Creando lotes de inventario...");
        setProgresoTraspaso(60);

        // Insertar todos los lotes de una vez
        if (insertLotes.length > 0) {
          await supabase.from("inventario_lotes").insert(insertLotes);
        }

        setMensajeProgreso("Registrando movimientos...");
        setProgresoTraspaso(70);

        // Insertar todos los movimientos de una vez
        if (movimientos.length > 0) {
          await supabase.from("movimientos_almacen_provisional").insert(movimientos);
        }

        setProgresoTraspaso(80);
      }

      setMensajeProgreso("Eliminando almacén provisional...");

      // Primero eliminar el inventario del almacén provisional
      await supabase
        .from("almacen_provisional_inventario")
        .delete()
        .eq("almacen_provisional_id", almacenIdEliminar);

      // Marcar como inactivo
      const { error: updateError } = await supabase
        .from("almacenes_provisionales")
        .update({ activo: false, updated_at: timestamp })
        .eq("id", almacenIdEliminar);

      if (updateError) throw updateError;

      setProgresoTraspaso(90);

      // Limpiar selección si era el almacén seleccionado
      if (selectedAlmacen?.id === almacenIdEliminar) {
        setSelectedAlmacen(null);
      }

      // Invalidar cachés y refrescar
      queryClient.invalidateQueries({ queryKey: ['almacenes-provisionales'] });
      queryClient.invalidateQueries({ queryKey: ['inventario-general-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['inventario-general-count'] });
      await refetchAlmacenes();

      setProgresoTraspaso(100);
      setDialogEliminarOpen(false);
      setAlmacenAEliminar(null);
      setInventarioAlmacenEliminar([]);

      const insumosDevueltos = devolverTodo && inventarioAlmacenEliminar.length > 0 
        ? inventarioAlmacenEliminar.map(item => ({
            insumo_id: item.insumo_catalogo_id,
            nombre: item.insumo?.nombre || 'Desconocido',
            clave: item.insumo?.clave || '',
            cantidad: item.cantidad_disponible
          }))
        : [];

      await registrarActividad({
        tipo_actividad: 'almacen_provisional_eliminado',
        descripcion: `Almacén provisional "${almacenAEliminar.nombre}" eliminado${devolverTodo && insumosDevueltos.length > 0 ? ` (${insumosDevueltos.length} insumos devueltos al almacén general)` : ''}`,
        almacen_origen_id: almacenIdEliminar,
        almacen_origen_nombre: almacenAEliminar.nombre,
        insumos_afectados: insumosDevueltos,
        cantidad_total: insumosDevueltos.reduce((sum, i) => sum + i.cantidad, 0),
        detalles_adicionales: { devueltos_a_general: devolverTodo }
      });

      toast.success("Almacén eliminado correctamente");
    } catch (error) {
      console.error("Error deleting warehouse:", error);
      toast.error("Error al eliminar almacén");
    } finally {
      setProcesando(false);
      setProgresoTraspaso(0);
      setMensajeProgreso("");
    }
  };

  if (!selectedHospital) {
    return (
      <Alert>
        <AlertDescription>Selecciona un hospital para gestionar almacenes provisionales.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Almacenes Provisionales</h1>
          <p className="text-muted-foreground">Gestiona almacenes temporales para procedimientos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetchAlmacenes()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
          <Button onClick={() => setDialogCrearOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Almacén
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: List of warehouses */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Warehouse className="h-5 w-5" />
                Mis Almacenes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingAlmacenes ? (
                <p className="text-center text-muted-foreground py-4">Cargando...</p>
              ) : almacenes.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Warehouse className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>No tienes almacenes provisionales</p>
                  <Button variant="link" onClick={() => setDialogCrearOpen(true)}>
                    Crear uno
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {almacenes.map((almacen) => (
                    <Card
                      key={almacen.id}
                      className={`cursor-pointer transition-all ${
                        selectedAlmacen?.id === almacen.id ? "border-primary bg-primary/5" : "hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedAlmacen(almacen)}
                    >
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{almacen.nombre}</p>
                            {almacen.descripcion && (
                              <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                                {almacen.descripcion}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              abrirDialogEliminar(almacen);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Inventory of selected warehouse */}
        <div className="lg:col-span-2">
          {selectedAlmacen ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{selectedAlmacen.nombre}</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setDialogProgramacionOpen(true)}>
                      <Calendar className="mr-2 h-4 w-4" />
                      Programación del Día
                    </Button>
                    <Button variant="outline" size="sm" onClick={abrirDialogTraspaso}>
                      <ArrowRight className="mr-2 h-4 w-4" />
                      Agregar Insumos
                    </Button>
                    <Button variant="outline" size="sm" onClick={abrirDialogDevolucion}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Devolver al General
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingProvisional ? (
                  <p className="text-center text-muted-foreground py-4">Cargando...</p>
                ) : !hasAnyInventarioProvisional && !searchTerm ? (
                  // Almacén realmente vacío (sin ningún insumo, ni siquiera agotados)
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p>Este almacén está vacío</p>
                    <Button variant="link" onClick={abrirDialogTraspaso}>
                      Agregar insumos desde el almacén general
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Barra de búsqueda SIEMPRE visible cuando hay datos o hay búsqueda */}
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar insumo por nombre o código..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-9"
                      />
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm("")}
                          className="absolute right-3 top-3 h-4 w-4 text-muted-foreground hover:text-foreground"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    
                    {inventarioProvisional.length === 0 ? (
                      // Búsqueda sin resultados
                      <div className="text-center py-12 text-muted-foreground">
                        <Search className="h-12 w-12 mx-auto mb-4 opacity-30" />
                        <p className="text-lg mb-2">No se encontró "{searchTerm}"</p>
                        <Button variant="outline" onClick={() => setSearchTerm("")}>
                          Limpiar búsqueda
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Clave</TableHead>
                              <TableHead>Insumo</TableHead>
                              <TableHead className="text-right">Cantidad</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {inventarioProvisional.map((item) => (
                              <TableRow key={item.id} className={item.cantidad_disponible === 0 ? "opacity-50" : ""}>
                                <TableCell className="font-mono text-sm">{item.insumo?.clave}</TableCell>
                                <TableCell>{item.insumo?.nombre}</TableCell>
                                <TableCell className="text-right font-mono font-bold">
                                  {item.cantidad_disponible === 0 ? (
                                    <span className="text-destructive">Agotado</span>
                                  ) : (
                                    item.cantidad_disponible
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <PaginationControls
                          page={pageProvisional}
                          totalPages={totalPagesProvisional}
                          totalCount={totalProvisional}
                          pageSize={pageSizeProvisional}
                          hasPreviousPage={hasPrevProvisional}
                          hasNextPage={hasNextProvisional}
                          isLoading={loadingProvisional}
                          onPageChange={goToPageProvisional}
                          onPageSizeChange={changePageSizeProvisional}
                          pageSizeOptions={[25, 50, 100]}
                        />
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <Warehouse className="h-16 w-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg">Selecciona un almacén para ver su inventario</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Dialog: Crear almacén */}
      <Dialog open={dialogCrearOpen} onOpenChange={setDialogCrearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Almacén Provisional</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre *</Label>
              <Input
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                placeholder="Ej: Quirófano 1, Urgencias, etc."
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea
                value={nuevaDescripcion}
                onChange={(e) => setNuevaDescripcion(e.target.value)}
                placeholder="Descripción opcional..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogCrearOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={crearAlmacen} disabled={!nuevoNombre.trim() || procesando}>
              Crear Almacén
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Traspaso desde general */}
      <Dialog open={dialogTraspasoOpen} onOpenChange={setDialogTraspasoOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Agregar Insumos a {selectedAlmacen?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {procesando && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{mensajeProgreso}</span>
                  <span className="font-medium">{progresoTraspaso}%</span>
                </div>
                <Progress value={progresoTraspaso} className="h-2" />
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar insumo por nombre o clave..."
                  value={searchTermTraspaso}
                  onChange={(e) => setSearchTermTraspaso(e.target.value)}
                  className="pl-9 pr-9"
                />
                {searchTermTraspaso && (
                  <button
                    onClick={() => setSearchTermTraspaso("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={seleccionarTodos}>
                  <CheckSquare className="mr-1 h-4 w-4" />
                  Todos
                </Button>
                <Button variant="outline" size="sm" onClick={deseleccionarTodos}>
                  Limpiar
                </Button>
              </div>
            </div>

            {seleccionados.size > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-sm">
                  {seleccionados.size} insumos seleccionados
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Total a traspasar: {Object.values(cantidadesTraspaso).reduce((a, b) => a + b, 0)} unidades
                </span>
              </div>
            )}

            {inventarioGeneral.length === 0 && searchTermTraspaso ? (
              <div className="text-center py-12 text-muted-foreground border rounded-md">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg mb-2">No se encontró "{searchTermTraspaso}"</p>
                <Button variant="outline" onClick={() => setSearchTermTraspaso("")}>
                  Limpiar búsqueda
                </Button>
              </div>
            ) : (
              <ScrollArea className="h-[350px] border rounded-md">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead className="w-24">Clave</TableHead>
                      <TableHead>Insumo</TableHead>
                      <TableHead className="text-right w-24">Disponible</TableHead>
                      <TableHead className="text-right w-28">Traspasar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventarioGeneral.map((item) => {
                      const isSelected = seleccionados.has(item.insumo_catalogo_id);
                      return (
                        <TableRow key={item.insumo_catalogo_id} className={isSelected ? "bg-primary/5" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSeleccion(item.insumo_catalogo_id)}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{item.insumo?.clave}</TableCell>
                          <TableCell className="max-w-[250px] truncate text-sm">{item.insumo?.nombre}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{item.cantidad_actual}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              max={item.cantidad_actual}
                              value={cantidadesTraspaso[item.insumo_catalogo_id] || ""}
                              onChange={(e) => {
                                const valor = Math.min(Number(e.target.value), item.cantidad_actual);
                                setCantidadesTraspaso((prev) => ({
                                  ...prev,
                                  [item.insumo_catalogo_id]: valor,
                                }));
                                if (valor > 0 && !seleccionados.has(item.insumo_catalogo_id)) {
                                  setSeleccionados((prev) => new Set([...prev, item.insumo_catalogo_id]));
                                }
                              }}
                              className="h-8 w-20"
                              disabled={!isSelected}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
            
            <PaginationControls
              page={pageGeneral}
              totalPages={totalPagesGeneral}
              totalCount={totalGeneral}
              pageSize={pageSizeGeneral}
              hasPreviousPage={hasPrevGeneral}
              hasNextPage={hasNextGeneral}
              isLoading={loadingGeneral}
              onPageChange={goToPageGeneral}
              onPageSizeChange={changePageSizeGeneral}
              pageSizeOptions={[25, 50, 100]}
            />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDialogTraspasoOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={ejecutarTraspaso} disabled={procesando || seleccionados.size === 0}>
              {procesando ? "Procesando..." : `Traspasar ${seleccionados.size} Insumos`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Devolución a general */}
      <Dialog open={dialogDevolucionOpen} onOpenChange={setDialogDevolucionOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Devolver Insumos al Almacén General</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 mb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const todasCantidades: Record<string, number> = {};
                inventarioProvisional.forEach((item) => {
                  todasCantidades[item.id] = item.cantidad_disponible;
                });
                setCantidadesDevolucion(todasCantidades);
              }}
            >
              <CheckSquare className="mr-1 h-4 w-4" />
              Seleccionar Todo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCantidadesDevolucion({})}
            >
              Limpiar
            </Button>
          </div>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clave</TableHead>
                  <TableHead>Insumo</TableHead>
                  <TableHead className="text-right">En Provisional</TableHead>
                  <TableHead className="text-right w-24">Devolver</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventarioProvisional.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">{item.insumo?.clave}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{item.insumo?.nombre}</TableCell>
                    <TableCell className="text-right font-mono">{item.cantidad_disponible}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={item.cantidad_disponible}
                        value={cantidadesDevolucion[item.id] || ""}
                        onChange={(e) =>
                          setCantidadesDevolucion((prev) => ({
                            ...prev,
                            [item.id]: Math.min(Number(e.target.value), item.cantidad_disponible),
                          }))
                        }
                        className="h-8 w-20"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogDevolucionOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={ejecutarDevolucion} disabled={procesando}>
              {procesando ? "Procesando..." : "Devolver Insumos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar eliminación */}
      <Dialog open={dialogEliminarOpen} onOpenChange={setDialogEliminarOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Eliminar Almacén "{almacenAEliminar?.nombre}"
            </DialogTitle>
          </DialogHeader>

          {modoEliminar === "confirmar" ? (
            <div className="space-y-4">
              {inventarioAlmacenEliminar.length > 0 ? (
                <>
                  <Alert>
                    <AlertDescription>
                      Este almacén tiene <strong>{inventarioAlmacenEliminar.length} insumos</strong> con un total de{" "}
                      <strong>
                        {inventarioAlmacenEliminar.reduce((sum, i) => sum + i.cantidad_disponible, 0)} unidades
                      </strong>
                      .
                    </AlertDescription>
                  </Alert>
                  <p className="text-sm text-muted-foreground">¿Qué deseas hacer con los insumos?</p>
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => ejecutarEliminacion(true)} disabled={procesando} className="justify-start">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Devolver todo al almacén general y eliminar
                    </Button>
                    <Button variant="outline" onClick={() => setModoEliminar("inspeccionar")} className="justify-start">
                      <Package className="mr-2 h-4 w-4" />
                      Inspeccionar insumos primero
                    </Button>
                    <Button variant="ghost" onClick={() => setDialogEliminarOpen(false)} className="justify-start">
                      Cancelar
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Este almacén está vacío. ¿Confirmas que deseas eliminarlo?
                  </p>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogEliminarOpen(false)}>
                      Cancelar
                    </Button>
                    <Button variant="destructive" onClick={() => ejecutarEliminacion(false)} disabled={procesando}>
                      {procesando ? "Eliminando..." : "Eliminar Almacén"}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Insumos en el almacén:</p>
              <ScrollArea className="h-[300px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clave</TableHead>
                      <TableHead>Insumo</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventarioAlmacenEliminar.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">{item.insumo?.clave}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{item.insumo?.nombre}</TableCell>
                        <TableCell className="text-right font-mono">{item.cantidad_disponible}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
              <DialogFooter className="flex gap-2">
                <Button variant="outline" onClick={() => setModoEliminar("confirmar")}>
                  Volver
                </Button>
                <Button onClick={() => ejecutarEliminacion(true)} disabled={procesando}>
                  {procesando ? "Procesando..." : "Devolver todo y eliminar"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Programación del Día */}
      <Dialog open={dialogProgramacionOpen} onOpenChange={setDialogProgramacionOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Programación del Día</DialogTitle>
          </DialogHeader>
          {selectedAlmacen && selectedHospital && (
            <ProgramacionDiaForm
              hospitalId={selectedHospital.id}
              almacenProvId={selectedAlmacen.id}
              almacenProvNombre={selectedAlmacen.nombre}
              onClose={() => setDialogProgramacionOpen(false)}
              onSuccess={() => {
                setDialogProgramacionOpen(false);
                refetchProvisional();
                queryClient.invalidateQueries({ queryKey: ['inventario-all'] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AlmacenesProvisionales;
