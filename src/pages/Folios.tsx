import { useState, useEffect, useMemo } from "react";
import { UserRole } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Search, FileX, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import FolioForm from "@/components/forms/FolioForm";
import FolioDetailDialog from "@/components/dialogs/FolioDetailDialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useHospital } from "@/contexts/HospitalContext";
import { generateFolioPDF } from "@/utils/pdfExport";
import { assertSupabaseOk, collectSupabaseErrors } from "@/utils/supabaseAssert";
import { useRegistroActividad } from "@/hooks/useRegistroActividad";
import { usePaginatedFolios } from "@/hooks/usePaginatedQuery";
import { PaginationControls } from "@/components/ui/pagination-controls";

interface FoliosProps {
  userRole: UserRole;
}

const Folios = ({ userRole }: FoliosProps) => {
  const { user, username } = useAuth();
  const { selectedHospital } = useHospital();
  const { registrarActividad } = useRegistroActividad();
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [borradores, setBorradores] = useState<any[]>([]);
  const [selectedFolio, setSelectedFolio] = useState<any>(null);
  const [selectedFolioInsumos, setSelectedFolioInsumos] = useState<any[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  const [editingDraft, setEditingDraft] = useState<any>(null);

  // Usar paginación optimizada para folios
  const {
    data: allFoliosData,
    isLoading: loading,
    page,
    totalPages,
    totalCount,
    pageSize,
    hasNextPage,
    hasPreviousPage,
    goToPage,
    refetch: refetchFolios,
  } = usePaginatedFolios(selectedHospital?.budget_code, { pageSize: 50 });

  // Separar borradores de folios finalizados (del lote paginado)
  const folios = useMemo(() => {
    return allFoliosData.filter((f: any) => f.estado !== "borrador");
  }, [allFoliosData]);

  // Los borradores se cargan por separado (pocos registros)
  useEffect(() => {
    if (selectedHospital) {
      fetchBorradores();
    }
  }, [selectedHospital]);

  const fetchBorradores = async () => {
    if (!selectedHospital) return;
    const { data } = await supabase
      .from("folios")
      .select("*")
      .eq("hospital_budget_code", selectedHospital.budget_code)
      .eq("estado", "borrador")
      .order("created_at", { ascending: false })
      .limit(20);
    setBorradores(data || []);
  };

  // Filtrado local optimizado con useMemo
  const filteredFolios = useMemo(() => {
    if (!searchTerm) return folios;
    const term = searchTerm.toLowerCase();
    return folios.filter(
      (f: any) =>
        f.numero_folio?.toLowerCase().includes(term) ||
        f.paciente_nombre?.toLowerCase().includes(term) ||
        f.cirugia?.toLowerCase().includes(term)
    );
  }, [folios, searchTerm]);

  const canCancel = userRole === "supervisor" || userRole === "gerente" || userRole === "gerente_operaciones";


  const handleCreateFolio = async (data: any, isBorrador: boolean = false) => {
    try {
      if (!user || !selectedHospital) {
        toast.error("Debes seleccionar un hospital para continuar");
        return;
      }

      // Si es borrador, guardar sin validar stock ni afectar inventario
      if (isBorrador) {
        const existingNumeroFolioResult = data.editingDraftId
          ? await supabase.from("folios").select("numero_folio").eq("id", data.editingDraftId).single()
          : null;

        if (existingNumeroFolioResult?.error) throw existingNumeroFolioResult.error;

        const numeroFolio = data.editingDraftId
          ? existingNumeroFolioResult?.data?.numero_folio
          : `BORRADOR-${Date.now()}`;

        const folioPayload = {
          numero_folio: numeroFolio,
          state_name: selectedHospital.state_name,
          hospital_budget_code: selectedHospital.budget_code,
          hospital_display_name: selectedHospital.display_name,
          hospital_id: selectedHospital.id,
          almacen_provisional_id: data.almacen_provisional_id || null,
          unidad: data.unidad,
          numero_quirofano: data.numeroQuirofano || null,
          hora_inicio_procedimiento: data.inicioProcedimiento || null,
          hora_fin_procedimiento: data.finProcedimiento || null,
          hora_inicio_anestesia: data.inicioAnestesia || null,
          hora_fin_anestesia: data.finAnestesia || null,
          paciente_apellido_paterno: data.pacienteApellidoPaterno || null,
          paciente_apellido_materno: data.pacienteApellidoMaterno || null,
          paciente_nombre: data.pacienteNombre || null,
          paciente_nss: data.pacienteNSS || null,
          paciente_edad: data.pacienteEdad,
          paciente_edad_unidad: data.pacienteEdadUnidad || "años",
          paciente_fecha_nacimiento: data.pacienteFechaNacimiento || null,
          paciente_genero: data.pacienteGenero || null,
          cirugia: data.procedimientoQuirurgico || null,
          especialidad_quirurgica: data.especialidadQuirurgica || null,
          tipo_cirugia: data.tipoCirugia || null,
          tipo_evento: data.tipoEvento || null,
          tipo_anestesia: data.tipo_anestesia || null,
          anestesia_principal: data.anestesiaPrincipal || null,
          anestesia_secundaria: data.anestesiaSecundaria || null,
          cirujano_id: data.cirujano || null,
          anestesiologo_id: data.anestesiologo || null,
          cirujano_nombre: data.cirujanoNombre || null,
          anestesiologo_nombre: data.anestesiologoNombre || null,
          estado: "borrador" as const,
        };

        if (data.editingDraftId) {
          const updateResult = await supabase.from("folios").update(folioPayload).eq("id", data.editingDraftId);
          if (updateResult.error) throw updateResult.error;
          toast.success("Borrador actualizado");
        } else {
          const insertResult = await supabase.from("folios").insert(folioPayload).select().single();
          if (insertResult.error) throw insertResult.error;
          
          // Registrar actividad de borrador creado
          await registrarActividad({
            tipo_actividad: 'folio_borrador_creado',
            descripcion: `Borrador de folio creado para ${data.pacienteNombre || 'paciente'} ${data.pacienteApellidoPaterno || ''}`,
            numero_folio: numeroFolio,
            folio_id: insertResult.data?.id,
            detalles_adicionales: {
              tipo_anestesia: data.tipo_anestesia,
              especialidad: data.especialidadQuirurgica,
            }
          });
          
          toast.success("Borrador guardado");
        }

        setShowForm(false);
        setEditingDraft(null);
        refetchFolios();
        fetchBorradores();
        return;
      }

      // Validar que venga el almacén provisional seleccionado
      if (!data.almacen_provisional_id) {
        toast.error("Debe seleccionar un almacén provisional", {
          description: "Los insumos solo pueden consumirse de almacenes provisionales",
        });
        return;
      }

      // PASO 1: Obtener almacén general (para referencia) e inventario del provisional seleccionado
      const [almacenResult, provisionalResult] = await Promise.all([
        supabase.from("almacenes").select("id").eq("hospital_id", selectedHospital.id).maybeSingle(),
        supabase
          .from("almacen_provisional_inventario")
          .select(
            `
            id,
            cantidad_disponible,
            insumo_catalogo_id,
            insumo:insumos_catalogo(id, nombre)
          `,
          )
          .eq("almacen_provisional_id", data.almacen_provisional_id),
      ]);

      // No permitir fallos silenciosos
      assertSupabaseOk(almacenResult as any, "Folios.handleCreateFolio: cargar almacén general");
      assertSupabaseOk(provisionalResult as any, "Folios.handleCreateFolio: cargar inventario provisional");

      const almacen = (almacenResult as any).data;

      if (!almacen) {
        toast.error("No se encontró almacén para este hospital", {
          description: "Contacta al administrador del sistema",
        });
        return;
      }

      const inventarioProvisional = provisionalResult.data || [];

      // Crear mapa del inventario provisional - SOLO del provisional seleccionado
      const provisionalMap = new Map<string, { cantidad_disponible: number; items: any[] }>();
      inventarioProvisional.forEach((inv: any) => {
        if (inv.insumo_catalogo_id) {
          const existing = provisionalMap.get(inv.insumo_catalogo_id);
          if (existing) {
            existing.cantidad_disponible += inv.cantidad_disponible || 0;
            existing.items.push(inv);
          } else {
            provisionalMap.set(inv.insumo_catalogo_id, {
              cantidad_disponible: inv.cantidad_disponible || 0,
              items: [inv],
            });
          }
        }
      });

      // PASO 2: VALIDAR EXISTENCIAS SOLO EN EL PROVISIONAL (insumos regulares + adicionales)
      const validacionErrors: string[] = [];

      // Crear mapa de cantidades totales requeridas (regulares + adicionales)
      const cantidadesRequeridas = new Map<string, { cantidad: number; nombre: string }>();

      // Agregar insumos regulares
      if (data.insumos && data.insumos.length > 0) {
        for (const item of data.insumos) {
          const insumo_id = item.insumo?.id || item.insumo_catalogo_id;
          if (!insumo_id) {
            validacionErrors.push(`❌ ${item.insumo?.nombre || "Insumo"}: ID de insumo no encontrado`);
            continue;
          }
          const existing = cantidadesRequeridas.get(insumo_id);
          cantidadesRequeridas.set(insumo_id, {
            cantidad: (existing?.cantidad || 0) + item.cantidad,
            nombre: item.insumo?.nombre || existing?.nombre || "Insumo",
          });
        }
      }

      // Agregar insumos adicionales al total requerido
      if (data.insumosAdicionales && data.insumosAdicionales.length > 0) {
        for (const item of data.insumosAdicionales) {
          const insumo_id = item.insumo?.id;
          if (!insumo_id) {
            validacionErrors.push(`❌ ${item.insumo?.nombre || "Insumo adicional"}: ID de insumo no encontrado`);
            continue;
          }
          const existing = cantidadesRequeridas.get(insumo_id);
          cantidadesRequeridas.set(insumo_id, {
            cantidad: (existing?.cantidad || 0) + item.cantidad,
            nombre: item.insumo?.nombre || existing?.nombre || "Insumo",
          });
        }
      }

      // Validar disponibilidad de stock SOLO EN EL PROVISIONAL
      for (const [insumo_id, { cantidad, nombre }] of cantidadesRequeridas) {
        const stockProvisional = provisionalMap.get(insumo_id)?.cantidad_disponible || 0;

        if (stockProvisional < cantidad) {
          if (stockProvisional === 0) {
            validacionErrors.push(
              `❌ ${nombre}: No disponible en el almacén provisional "${data.almacen_provisional_nombre}"`,
            );
          } else {
            validacionErrors.push(
              `❌ ${nombre}: Stock insuficiente en provisional (Disponible: ${stockProvisional}, Requerido: ${cantidad})`,
            );
          }
        }
      }

      if (validacionErrors.length > 0) {
        toast.error("No se puede crear el folio - Stock insuficiente en almacén provisional", {
          description: validacionErrors.join("\n"),
          duration: 10000,
        });
        return;
      }

      // PASO 4: Generar número de folio único
      // Obtener el máximo número de folio existente para este hospital
      const { data: maxFolioData, error: maxError } = await supabase
        .from("folios")
        .select("numero_folio")
        .eq("hospital_budget_code", selectedHospital.budget_code)
        .like("numero_folio", `${selectedHospital.budget_code}-%`)
        .order("numero_folio", { ascending: false })
        .limit(1);

      if (maxError) throw maxError;

      let nextNumber = 1;
      if (maxFolioData && maxFolioData.length > 0) {
        const lastFolio = maxFolioData[0].numero_folio;
        const match = lastFolio.match(/-(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }

      // Añadir timestamp para evitar colisiones en caso de concurrencia
      const timestamp = Date.now().toString().slice(-4);
      const numeroFolio = `${selectedHospital.budget_code}-${String(nextNumber).padStart(6, "0")}-${timestamp}`;

      // PASO 5: Crear el folio CON almacen_provisional_id para rastreo
      const { data: folioData, error: folioError } = await supabase
        .from("folios")
        .insert({
          numero_folio: numeroFolio,
          state_name: selectedHospital.state_name,
          hospital_budget_code: selectedHospital.budget_code,
          hospital_display_name: selectedHospital.display_name,
          hospital_id: selectedHospital.id,
          almacen_provisional_id: data.almacen_provisional_id,
          unidad: data.unidad,
          numero_quirofano: data.numeroQuirofano,
          hora_inicio_procedimiento: data.inicioProcedimiento,
          hora_fin_procedimiento: data.finProcedimiento,
          hora_inicio_anestesia: data.inicioAnestesia,
          hora_fin_anestesia: data.finAnestesia,
          paciente_apellido_paterno: data.pacienteApellidoPaterno,
          paciente_apellido_materno: data.pacienteApellidoMaterno,
          paciente_nombre: data.pacienteNombre,
          paciente_nss: data.pacienteNSS,
          paciente_edad: data.pacienteEdad,
          paciente_fecha_nacimiento: data.pacienteFechaNacimiento || null,
          paciente_genero: data.pacienteGenero,
          cirugia: data.procedimientoQuirurgico,
          especialidad_quirurgica: data.especialidadQuirurgica,
          tipo_cirugia: data.tipoCirugia,
          tipo_evento: data.tipoEvento,
          tipo_anestesia: data.tipo_anestesia,
          anestesia_principal: data.anestesiaPrincipal || null,
          anestesia_secundaria: data.anestesiaSecundaria || null,
          cirujano_id: data.cirujano || null,
          anestesiologo_id: data.anestesiologo || null,
          cirujano_nombre: data.cirujanoNombre || null,
          anestesiologo_nombre: data.anestesiologoNombre || null,
          observaciones: data.observaciones || null,
          estado: "activo",
        })
        .select()
        .single();

      if (folioError) throw folioError;

      // PASO 6: Procesar insumos - Preparar todas las operaciones (SOLO del provisional)
      const provisionalUpdates: any[] = [];
      const movimientosProvisional: any[] = [];
      const foliosInsumos: any[] = [];
      const foliosInsumosAdicionales: any[] = [];

      // Función para procesar descuento SOLO del almacén provisional
      const procesarDescuentoProvisional = (insumo_id: string, cantidad: number, observacionExtra: string = "") => {
        let cantidadRestante = cantidad;
        const insumoProvisional = provisionalMap.get(insumo_id);

        if (insumoProvisional && insumoProvisional.cantidad_disponible > 0) {
          for (const item of insumoProvisional.items) {
            if (cantidadRestante <= 0) break;
            if (item.cantidad_disponible <= 0) continue;

            const cantidadDesdeEsteItem = Math.min(cantidadRestante, item.cantidad_disponible);

            const existingUpdate = provisionalUpdates.find((u) => u.id === item.id);
            if (existingUpdate) {
              existingUpdate.cantidad_disponible -= cantidadDesdeEsteItem;
            } else {
              provisionalUpdates.push({
                id: item.id,
                cantidad_disponible: item.cantidad_disponible - cantidadDesdeEsteItem,
              });
            }

            movimientosProvisional.push({
              almacen_provisional_id: data.almacen_provisional_id,
              hospital_id: selectedHospital.id,
              insumo_catalogo_id: insumo_id,
              cantidad: cantidadDesdeEsteItem,
              tipo: "salida",
              folio_id: folioData.id,
              usuario_id: user.id,
              observaciones: `Consumo en folio ${numeroFolio} desde ${data.almacen_provisional_nombre}${observacionExtra}`,
            });

            item.cantidad_disponible -= cantidadDesdeEsteItem;
            cantidadRestante -= cantidadDesdeEsteItem;
          }
          insumoProvisional.cantidad_disponible -= cantidad - cantidadRestante;
        }
      };

      // Procesar insumos regulares
      if (data.insumos && data.insumos.length > 0) {
        for (const item of data.insumos) {
          const insumo_id = item.insumo?.id || item.insumo_catalogo_id;
          if (!insumo_id) continue;
          procesarDescuentoProvisional(insumo_id, item.cantidad, "");
          foliosInsumos.push({
            folio_id: folioData.id,
            insumo_id: insumo_id,
            cantidad: item.cantidad,
          });
        }
      }

      // Procesar insumos adicionales
      if (data.insumosAdicionales && data.insumosAdicionales.length > 0) {
        for (const item of data.insumosAdicionales) {
          const insumo_id = item.insumo?.id;
          if (!insumo_id) continue;
          procesarDescuentoProvisional(insumo_id, item.cantidad, " [ADICIONAL]");
          foliosInsumosAdicionales.push({
            folio_id: folioData.id,
            insumo_id: insumo_id,
            cantidad: item.cantidad,
            motivo: item.motivo || null,
            created_by: user.id,
          });
        }
      }

      // PASO 7: Ejecutar todas las operaciones en paralelo
      const updateOperations = [];

      for (const upd of provisionalUpdates) {
        updateOperations.push(
          supabase
            .from("almacen_provisional_inventario")
            .update({ cantidad_disponible: upd.cantidad_disponible, updated_at: new Date().toISOString() })
            .eq("id", upd.id),
        );
      }

      if (movimientosProvisional.length > 0) {
        updateOperations.push(supabase.from("movimientos_almacen_provisional").insert(movimientosProvisional));
      }
      if (foliosInsumos.length > 0) {
        updateOperations.push(supabase.from("folios_insumos").insert(foliosInsumos));
      }
      if (foliosInsumosAdicionales.length > 0) {
        updateOperations.push(supabase.from("folios_insumos_adicionales").insert(foliosInsumosAdicionales));
      }

      // Ejecutar en paralelo y NO ignorar errores.
      const results = await Promise.all(updateOperations);
      collectSupabaseErrors(results as any, "Folios.handleCreateFolio: aplicar updates/inserts");

      // Si estamos completando un borrador, eliminarlo
      if (data.editingDraftId) {
        await supabase.from("folios").delete().eq("id", data.editingDraftId);
      }

      // Registrar actividad de folio creado
      const insumosAfectados = [
        ...(data.insumos || []).map((item: any) => ({
          insumo_id: item.insumo?.id || item.insumo_catalogo_id,
          nombre: item.insumo?.nombre || 'Insumo',
          clave: item.insumo?.clave,
          cantidad: item.cantidad,
        })),
        ...(data.insumosAdicionales || []).map((item: any) => ({
          insumo_id: item.insumo?.id,
          nombre: item.insumo?.nombre || 'Insumo adicional',
          clave: item.insumo?.clave,
          cantidad: item.cantidad,
        })),
      ];

      await registrarActividad({
        tipo_actividad: 'folio_creado',
        descripcion: `Folio ${numeroFolio} creado para paciente ${data.pacienteNombre || ''} ${data.pacienteApellidoPaterno || ''} - Procedimiento: ${data.tipo_anestesia || 'No especificado'}`,
        folio_id: folioData.id,
        numero_folio: numeroFolio,
        almacen_origen_id: data.almacen_provisional_id,
        almacen_origen_nombre: data.almacen_provisional_nombre,
        insumos_afectados: insumosAfectados,
        cantidad_total: insumosAfectados.reduce((sum: number, i: any) => sum + (i.cantidad || 0), 0),
        detalles_adicionales: {
          paciente: `${data.pacienteNombre || ''} ${data.pacienteApellidoPaterno || ''}`,
          tipo_anestesia: data.tipo_anestesia,
          especialidad: data.especialidadQuirurgica,
          cirujano: data.cirujanoNombre,
          anestesiologo: data.anestesiologoNombre,
        }
      });

      toast.success("Folio creado exitosamente", {
        description: `Número de folio: ${numeroFolio} (consumido de ${data.almacen_provisional_nombre})`,
      });
      setShowForm(false);
      setEditingDraft(null);
      refetchFolios();
      fetchBorradores();
    } catch (error: any) {
      console.error("Error al crear folio:", error);
      toast.error("Error al crear folio", {
        description: error.message,
      });
    }
  };

  const handleCompleteFolio = async (folioId: string, numeroFolio: string) => {
    try {
      if (!user || !selectedHospital) return;

      const { error } = await supabase
        .from("folios")
        .update({ estado: "completado" as any, updated_at: new Date().toISOString() })
        .eq("id", folioId);

      if (error) throw error;

      await registrarActividad({
        tipo_actividad: 'folio_completado',
        descripcion: `Folio ${numeroFolio} marcado como completado`,
        folio_id: folioId,
        numero_folio: numeroFolio,
      });

      toast.success("Folio completado", {
        description: `El folio ${numeroFolio} ha sido marcado como completado y ahora se contabiliza en reportes.`,
      });

      refetchFolios();
    } catch (error: any) {
      console.error("Error al completar folio:", error);
      toast.error("Error al completar folio", { description: error.message });
    }
  };

  const handleCancelFolio = async (folioId: string) => {
    try {
      if (!user || !selectedHospital) return;

      // Obtener el folio con su almacén provisional y sus insumos (regulares + adicionales)
      const { data: folio, error: folioError } = await supabase
        .from("folios")
        .select(
          `
          *,
          folios_insumos (
            insumo_id,
            cantidad
          ),
          folios_insumos_adicionales (
            insumo_id,
            cantidad
          )
        `,
        )
        .eq("id", folioId)
        .single();

      if (folioError) throw folioError;

      // Determinar almacén provisional origen (primero del folio, luego de movimientos)
      let almacenProvisionalId = folio.almacen_provisional_id;

      if (!almacenProvisionalId) {
        // Fallback: obtener desde movimientos_almacen_provisional
        const { data: movimiento } = await supabase
          .from("movimientos_almacen_provisional")
          .select("almacen_provisional_id")
          .eq("folio_id", folioId)
          .eq("tipo", "salida")
          .limit(1)
          .maybeSingle();

        almacenProvisionalId = movimiento?.almacen_provisional_id;
      }

      // Actualizar estado del folio
      const { error: updateError } = await supabase
        .from("folios")
        .update({
          estado: "cancelado",
          cancelado_por: user.id,
        })
        .eq("id", folioId);

      if (updateError) throw updateError;

      // Combinar insumos regulares + adicionales para devolución
      const todosLosInsumos: { insumo_id: string; cantidad: number }[] = [
        ...(folio.folios_insumos || []),
        ...(folio.folios_insumos_adicionales || []),
      ];

      // DEVOLVER inventario AL ALMACÉN PROVISIONAL CORRECTO
      if (almacenProvisionalId && todosLosInsumos.length > 0) {
        // Obtener inventario actual del provisional para este folio
        const { data: inventarioProvisional } = await supabase
          .from("almacen_provisional_inventario")
          .select("id, insumo_catalogo_id, cantidad_disponible")
          .eq("almacen_provisional_id", almacenProvisionalId);

        const provisionalMap = new Map((inventarioProvisional || []).map((inv) => [inv.insumo_catalogo_id, inv]));

        const updatePromises: Array<PromiseLike<{ error: any }>> = [];
        const movimientosDevolucion: any[] = [];

        for (const folioInsumo of todosLosInsumos) {
          const itemProvisional = provisionalMap.get(folioInsumo.insumo_id);

          if (itemProvisional) {
            // El insumo existe en provisional - solo actualizar cantidad
            updatePromises.push(
              supabase
                .from("almacen_provisional_inventario")
                .update({
                  cantidad_disponible: itemProvisional.cantidad_disponible + folioInsumo.cantidad,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", itemProvisional.id)
                .select(),
            );
            // Actualizar mapa para evitar conflictos en múltiples items del mismo insumo
            itemProvisional.cantidad_disponible += folioInsumo.cantidad;
          } else {
            // El insumo no existe en provisional - crear nuevo registro
            updatePromises.push(
              supabase.from("almacen_provisional_inventario").insert({
                almacen_provisional_id: almacenProvisionalId,
                insumo_catalogo_id: folioInsumo.insumo_id,
                cantidad_disponible: folioInsumo.cantidad,
              }).select(),
            );
          }

          // Registrar movimiento de devolución
          movimientosDevolucion.push({
            almacen_provisional_id: almacenProvisionalId,
            hospital_id: selectedHospital.id,
            insumo_catalogo_id: folioInsumo.insumo_id,
            cantidad: folioInsumo.cantidad,
            tipo: "entrada",
            folio_id: folioId,
            usuario_id: user.id,
            observaciones: `Devolución por cancelación de folio ${folio.numero_folio}`,
          });
        }

        // Ejecutar todas las operaciones
        const res = await Promise.all(updatePromises);
        collectSupabaseErrors(res as any, "Folios.handleCancelFolio: devolver inventario a provisional");

        if (movimientosDevolucion.length > 0) {
          const movRes = await supabase.from("movimientos_almacen_provisional").insert(movimientosDevolucion);
          assertSupabaseOk(movRes as any, "Folios.handleCancelFolio: insertar movimientos devolución");
        }

        // Registrar actividad de cancelación
        await registrarActividad({
          tipo_actividad: 'folio_cancelado',
          descripcion: `Folio ${folio.numero_folio} cancelado - Insumos devueltos al almacén provisional`,
          folio_id: folioId,
          numero_folio: folio.numero_folio,
          almacen_destino_id: almacenProvisionalId,
          insumos_afectados: todosLosInsumos.map((i: any) => ({
            insumo_id: i.insumo_id,
            nombre: 'Insumo',
            cantidad: i.cantidad,
          })),
          cantidad_total: todosLosInsumos.reduce((sum: number, i: any) => sum + (i.cantidad || 0), 0),
        });

        toast.success("Folio cancelado exitosamente", {
          description: "El inventario ha sido devuelto al almacén provisional",
        });
      } else {
        // Registrar cancelación sin devolución
        await registrarActividad({
          tipo_actividad: 'folio_cancelado',
          descripcion: `Folio ${folio.numero_folio} cancelado - Sin almacén provisional para devolución`,
          folio_id: folioId,
          numero_folio: folio.numero_folio,
        });

        toast.success("Folio cancelado", {
          description: "No se encontró almacén provisional para devolución de inventario",
        });
      }

      refetchFolios();
    } catch (error: any) {
      console.error("Error al cancelar folio:", error);
      toast.error("Error al cancelar folio", {
        description: error.message,
      });
    }
  };

  const tiposAnestesiaLabels: Record<string, string> = {
    general_balanceada_adulto: "General Balanceada Adulto",
    general_balanceada_pediatrica: "General Balanceada Pediátrica",
    general_alta_especialidad: "General Alta Especialidad",
    general_endovenosa: "General Endovenosa",
    locorregional: "Locorregional",
    sedacion: "Sedación",
  };

  return (
    <div className="space-y-6">
      {!selectedHospital && (
        <Alert>
          <AlertDescription>Debes seleccionar un hospital para ver y gestionar los folios.</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Folios</h1>
          <p className="text-muted-foreground">Gestión de procedimientos quirúrgicos</p>
        </div>
        <Button className="gap-2" onClick={() => setShowForm(true)} disabled={!selectedHospital}>
          <Plus className="h-4 w-4" />
          Nuevo Folio
        </Button>
      </div>

      {/* Sección de Borradores Pendientes */}
      {borradores.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-600">
              <FileX className="h-5 w-5" />
              Borradores Pendientes ({borradores.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {borradores.map((borrador) => (
                <Card key={borrador.id} className="border-l-4 border-l-amber-500">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
                            Borrador
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {new Date(borrador.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="font-medium">Paciente:</span>{" "}
                          {borrador.paciente_nombre || "Sin definir"} |{" "}
                          <span className="font-medium">Cirugía:</span>{" "}
                          {borrador.cirugia || "Sin definir"} |{" "}
                          <span className="font-medium">Anestesia:</span>{" "}
                          {tiposAnestesiaLabels[borrador.tipo_anestesia] || borrador.tipo_anestesia || "Sin definir"}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingDraft(borrador);
                            setShowForm(true);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setEditingDraft({ ...borrador, completar: true });
                            setShowForm(true);
                          }}
                        >
                          Completar
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={async () => {
                            await supabase.from("folios").delete().eq("id", borrador.id);
                            
                            // Registrar actividad de borrador eliminado
                            await registrarActividad({
                              tipo_actividad: 'folio_borrador_eliminado',
                              descripcion: `Borrador eliminado - Paciente: ${borrador.paciente_nombre || 'Sin definir'}`,
                              folio_id: borrador.id,
                              detalles_adicionales: {
                                paciente_nombre: borrador.paciente_nombre,
                                cirugia: borrador.cirugia,
                                tipo_anestesia: borrador.tipo_anestesia,
                              }
                            });
                            
                            toast.success("Borrador eliminado");
                            refetchFolios();
                            fetchBorradores();
                          }}
                        >
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por folio, paciente o cirugía..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Cargando folios...</p>
          ) : (
            <>
              <div className="space-y-4">
                {filteredFolios.map((folio: any) => (
                  <Card key={folio.id} className="border-l-4 border-l-primary">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold">{folio.numero_folio}</h3>
                            <Badge variant={
                              folio.estado === "activo" ? "default" : 
                              folio.estado === "completado" ? "secondary" : "destructive"
                            } className={folio.estado === "completado" ? "bg-green-100 text-green-800" : ""}>
                              {folio.estado === "activo" ? "Activo" : 
                               folio.estado === "completado" ? "Completado" : "Cancelado"}
                            </Badge>
                          </div>
                          <div className="grid gap-1 text-sm">
                            <p>
                              <span className="font-medium">Paciente:</span> {folio.paciente_nombre}
                            </p>
                            <p>
                              <span className="font-medium">Cirugía:</span> {folio.cirugia}
                            </p>
                            <p>
                              <span className="font-medium">Fecha:</span>{" "}
                              {new Date(folio.created_at).toLocaleDateString()}
                            </p>
                            <p>
                              <span className="font-medium">Tipo de Anestesia:</span>{" "}
                              {tiposAnestesiaLabels[folio.tipo_anestesia] || folio.tipo_anestesia}
                            </p>
                            <p>
                              <span className="font-medium">Unidad:</span> {folio.unidad}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              setSelectedFolio(folio);
                              const { data: insumosData } = await supabase
                                .from("folios_insumos")
                                .select(`
                                  cantidad,
                                  insumos_catalogo:insumo_id (
                                    id, nombre, descripcion, clave, presentacion, tipo
                                  )
                                `)
                                .eq("folio_id", folio.id);

                              const insumosFormatted = (insumosData || []).map((item: any) => ({
                                cantidad: item.cantidad,
                                insumos: {
                                  nombre: item.insumos_catalogo?.nombre || "Sin nombre",
                                  descripcion: item.insumos_catalogo?.descripcion || "",
                                  clave: item.insumos_catalogo?.clave || "",
                                  presentacion: item.insumos_catalogo?.presentacion || "",
                                  tipo: item.insumos_catalogo?.tipo || "",
                                },
                              }));
                              setSelectedFolioInsumos(insumosFormatted);
                              setShowDetail(true);
                            }}
                          >
                            Ver Detalle
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={async () => {
                              const { data: insumosData } = await supabase
                                .from("folios_insumos")
                                .select(`
                                  cantidad,
                                  insumos_catalogo:insumo_id (
                                    nombre, descripcion, clave, presentacion
                                  )
                                `)
                                .eq("folio_id", folio.id);

                              const insumosFlat = (insumosData || []).map((item: any) => ({
                                nombre: item.insumos_catalogo?.nombre || "",
                                descripcion: item.insumos_catalogo?.descripcion || "",
                                clave: item.insumos_catalogo?.clave || "",
                                presentacion: item.insumos_catalogo?.presentacion || "",
                                cantidad: item.cantidad,
                              }));

                              generateFolioPDF(folio, insumosFlat, tiposAnestesiaLabels);
                            }}
                          >
                            <Download className="h-4 w-4" />
                            PDF
                          </Button>
                          {folio.estado === "activo" && (
                            <Button
                              variant="default"
                              size="sm"
                              className="gap-2 bg-green-600 hover:bg-green-700"
                              onClick={() => handleCompleteFolio(folio.id, folio.numero_folio)}
                            >
                              Completar
                            </Button>
                          )}
                          {canCancel && folio.estado === "activo" && (
                            <Button
                              variant="destructive"
                              size="sm"
                              className="gap-2"
                              onClick={() => handleCancelFolio(folio.id)}
                            >
                              <FileX className="h-4 w-4" />
                              Cancelar
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              
              {/* Controles de paginación */}
              <PaginationControls
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={pageSize}
                hasNextPage={hasNextPage}
                hasPreviousPage={hasPreviousPage}
                onPageChange={goToPage}
                isLoading={loading}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) setEditingDraft(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <FolioForm 
            onClose={() => { setShowForm(false); setEditingDraft(null); }} 
            onSubmit={handleCreateFolio}
            editingDraft={editingDraft}
          />
        </DialogContent>
      </Dialog>

      <FolioDetailDialog
        open={showDetail}
        onOpenChange={setShowDetail}
        folio={selectedFolio}
        tiposAnestesiaLabels={tiposAnestesiaLabels}
        insumos={selectedFolioInsumos}
      />
    </div>
  );
};

export default Folios;
