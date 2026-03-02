import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useHospital } from "@/contexts/HospitalContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InsumoSearchCombobox } from "./InsumoSearchCombobox";
import { toast } from "sonner";
import { Plus, Trash2, AlertTriangle, Save } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { PROCEDIMIENTOS_CATALOG, PROCEDIMIENTOS_BY_CLAVE, getTipoAnestesiaKey } from "@/constants/procedimientosCatalog";

type Insumo = {
  id: string;
  nombre: string;
  clave?: string;
  lote: string;
  cantidadDefault: number;
  cantidadMinima: number | null;
  cantidadMaxima: number | null;
  condicionante: string | null;
  grupoExclusivo: string | null;
};

type FolioInsumo = {
  insumo: {
    id: string;
    nombre: string;
    lote: string;
  };
  cantidad: number;
  cantidadMinima: number | null;
  cantidadMaxima: number | null;
  condicionante: string | null;
  grupoExclusivo: string | null;
};

type InsumoAdicional = {
  insumo: {
    id: string;
    nombre: string;
  };
  cantidad: number;
  motivo?: string;
};

// Mapeo de clave de procedimiento a tipo_anestesia key para buscar insumos
const getClaveToTipoAnestesia = (clave: string): string => {
  return getTipoAnestesiaKey(clave);
};

// Mapeo de labels para mostrar nombres amigables (ahora usa catálogo)
const getProcedimientoLabel = (clave: string): string => {
  if (clave === "anestesia_mixta") return "Anestesia Mixta";
  const proc = PROCEDIMIENTOS_BY_CLAVE.get(clave);
  return proc ? `${proc.clave} - ${proc.nombre}` : clave;
};

// Esquema de validación de los campos del folio T33
const folioSchema = z.object({
  unidad: z.string().nonempty("Debes seleccionar un hospital"),
  numeroQuirofano: z.string().optional(),
  inicioProcedimiento: z.string().optional(),
  finProcedimiento: z.string().optional(),
  inicioAnestesia: z.string().optional(),
  finAnestesia: z.string().optional(),
  pacienteApellidoPaterno: z.string().nonempty("El apellido paterno es obligatorio"),
  pacienteApellidoMaterno: z.string().optional(),
  pacienteNombre: z.string().nonempty("El nombre del paciente es obligatorio"),
  pacienteNSS: z.string().optional(),
  pacienteEdad: z.number().min(0).optional(),
  pacienteFechaNacimiento: z.string().optional(),
  pacienteGenero: z.enum(["M", "F", "Otro"]).optional(),
  procedimientoQuirurgico: z.string().nonempty("El procedimiento es obligatorio"),
  especialidadQuirurgica: z.string().optional(),
  tipoCirugia: z.string().optional(),
  tipoEvento: z.string().optional(),
  tipo_anestesia: z.string().nonempty("El tipo de anestesia es obligatorio"),
  cirujano: z.string().optional(),
  anestesiologo: z.string().optional(),
});

type FolioFormValues = z.infer<typeof folioSchema>;

interface FolioFormProps {
  onClose: () => void;
  onSubmit: (values: any, isBorrador?: boolean) => void;
  defaultValues?: Partial<FolioFormValues>;
  editingDraft?: any; // Folio borrador que se está editando
}

type Medico = {
  id: string;
  nombre: string;
  especialidad: string;
};

export default function FolioForm({ onClose, onSubmit, defaultValues, editingDraft }: FolioFormProps) {
  const { selectedHospital, availableHospitals, canSelectHospital, setSelectedHospital } = useHospital();

  // Estado para tipo de anestesia (anestesia normal o mixta)
  const [tipoAnestesia, setTipoAnestesia] = useState<string>("");
  // En caso de anestesia mixta, estos guardan los tipos seleccionados
  const [anestesiaPrincipal, setAnestesiaPrincipal] = useState<string>("");
  const [anestesiaSecundaria, setAnestesiaSecundaria] = useState<string>("");
  // Listas de insumos disponibles por anestesia
  const [insumosDisponibles, setInsumosDisponibles] = useState<Insumo[]>([]);
  const [insumosDisponiblesPrincipal, setInsumosDisponiblesPrincipal] = useState<Insumo[]>([]);
  const [insumosDisponiblesSecundaria, setInsumosDisponiblesSecundaria] = useState<Insumo[]>([]);
  // Insumos actualmente seleccionados en el folio
  const [insumosFolio, setInsumosFolio] = useState<FolioInsumo[]>([]);
  // Insumos adicionales (que exceden el máximo)
  const [insumosAdicionales, setInsumosAdicionales] = useState<InsumoAdicional[]>([]);
  // Control para dialog de confirmación de adicional
  const [pendingAdicional, setPendingAdicional] = useState<{
    insumoId: string;
    nombreInsumo: string;
    cantidadSolicitada: number;
    cantidadMaxima: number;
  } | null>(null);
  // Listas de médicos para selects
  const [cirujanos, setCirujanos] = useState<Medico[]>([]);
  const [anestesiologos, setAnestesiologos] = useState<Medico[]>([]);
  // Control del modal de agregar insumo
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedInsumoId, setSelectedInsumoId] = useState<string>("");
  // Lista de tipos de anestesia disponibles para el hospital seleccionado
  const [tiposAnestesiaDisponibles, setTiposAnestesiaDisponibles] = useState<Array<{ value: string; label: string }>>(
    [],
  );
  const [loadingProcedimientos, setLoadingProcedimientos] = useState(false);
  
  // Almacenes provisionales del hospital
  const [almacenesProvisionales, setAlmacenesProvisionales] = useState<Array<{ id: string; nombre: string }>>([]);
  const [almacenProvSeleccionado, setAlmacenProvSeleccionado] = useState<string>("");
  const [loadingAlmacenes, setLoadingAlmacenes] = useState(false);

  // Estado para unidad de edad del paciente
  const [pacienteEdadUnidad, setPacienteEdadUnidad] = useState<string>(editingDraft?.paciente_edad_unidad || "años");

  // Configuración inicial del formulario
  const form = useForm<FolioFormValues>({
    resolver: zodResolver(folioSchema),
    defaultValues: {
      unidad: selectedHospital?.display_name || "",
      numeroQuirofano: "",
      inicioProcedimiento: "",
      finProcedimiento: "",
      inicioAnestesia: "",
      finAnestesia: "",
      pacienteApellidoPaterno: "",
      pacienteApellidoMaterno: "",
      pacienteNombre: "",
      pacienteNSS: "",
      pacienteEdad: 0,
      pacienteFechaNacimiento: "",
      pacienteGenero: undefined,
      procedimientoQuirurgico: "",
      especialidadQuirurgica: "",
      tipoCirugia: "",
      tipoEvento: "",
      tipo_anestesia: "",
      cirujano: "",
      anestesiologo: "",
      ...defaultValues,
    },
  });

  // Sincroniza el campo 'unidad' con el hospital seleccionado
  useEffect(() => {
    if (selectedHospital) {
      form.setValue("unidad", selectedHospital.display_name);
    }
  }, [selectedHospital, form]);

  // Cargar datos del borrador si existe
  useEffect(() => {
    if (editingDraft) {
      form.setValue("numeroQuirofano", editingDraft.numero_quirofano || "");
      form.setValue("inicioProcedimiento", editingDraft.hora_inicio_procedimiento || "");
      form.setValue("finProcedimiento", editingDraft.hora_fin_procedimiento || "");
      form.setValue("inicioAnestesia", editingDraft.hora_inicio_anestesia || "");
      form.setValue("finAnestesia", editingDraft.hora_fin_anestesia || "");
      form.setValue("pacienteApellidoPaterno", editingDraft.paciente_apellido_paterno || "");
      form.setValue("pacienteApellidoMaterno", editingDraft.paciente_apellido_materno || "");
      form.setValue("pacienteNombre", editingDraft.paciente_nombre || "");
      form.setValue("pacienteNSS", editingDraft.paciente_nss || "");
      form.setValue("pacienteEdad", editingDraft.paciente_edad || 0);
      form.setValue("pacienteFechaNacimiento", editingDraft.paciente_fecha_nacimiento || "");
      form.setValue("pacienteGenero", editingDraft.paciente_genero || undefined);
      form.setValue("procedimientoQuirurgico", editingDraft.cirugia || "");
      form.setValue("especialidadQuirurgica", editingDraft.especialidad_quirurgica || "");
      form.setValue("tipoCirugia", editingDraft.tipo_cirugia || "");
      form.setValue("tipoEvento", editingDraft.tipo_evento || "");
      form.setValue("tipo_anestesia", editingDraft.tipo_anestesia || "");
      form.setValue("cirujano", editingDraft.cirujano_id || "");
      form.setValue("anestesiologo", editingDraft.anestesiologo_id || "");
      
      // Establecer estados de anestesia
      if (editingDraft.tipo_anestesia) {
        setTipoAnestesia(editingDraft.tipo_anestesia);
      }
      if (editingDraft.anestesia_principal) {
        setAnestesiaPrincipal(editingDraft.anestesia_principal);
      }
      if (editingDraft.anestesia_secundaria) {
        setAnestesiaSecundaria(editingDraft.anestesia_secundaria);
      }
      if (editingDraft.paciente_edad_unidad) {
        setPacienteEdadUnidad(editingDraft.paciente_edad_unidad);
      }
      if (editingDraft.almacen_provisional_id) {
        setAlmacenProvSeleccionado(editingDraft.almacen_provisional_id);
      }
    }
  }, [editingDraft, form]);

  // Cargar tipos de anestesia disponibles para el hospital seleccionado (usando hospital_procedimientos)
  useEffect(() => {
    const loadProcedimientosHospital = async () => {
      if (!selectedHospital?.id) {
        setTiposAnestesiaDisponibles([]);
        return;
      }

      setLoadingProcedimientos(true);
      try {
        // First check hospital_procedimientos for authorized procedures
        const { data: hospitalProcs, error: hpError } = await supabase
          .from("hospital_procedimientos")
          .select("procedimiento_clave, procedimiento_nombre")
          .eq("hospital_id", selectedHospital.id)
          .eq("activo", true);

        if (hpError) throw hpError;

        if (hospitalProcs && hospitalProcs.length > 0) {
          // Use authorized procedures from hospital_procedimientos (using clave as value)
          const tiposDisponibles = hospitalProcs.map((proc) => ({
            value: proc.procedimiento_clave, // Ahora usamos la clave como value
            label: getProcedimientoLabel(proc.procedimiento_clave),
          }));

          // Add mixed anesthesia option if multiple types available
          if (tiposDisponibles.length > 1) {
            tiposDisponibles.push({
              value: "anestesia_mixta",
              label: "Anestesia Mixta",
            });
          }

          setTiposAnestesiaDisponibles(tiposDisponibles);
          console.log(`✅ Procedimientos autorizados para ${selectedHospital.display_name}:`, tiposDisponibles.length);
        } else {
          console.warn(`⚠️ No hay procedimientos configurados para ${selectedHospital.display_name}`);
          setTiposAnestesiaDisponibles([]);
          toast.error("Este hospital no tiene tipos de anestesia autorizados. Contacte al Gerente de Operaciones.");
        }
      } catch (error) {
        console.error("Error al cargar procedimientos del hospital:", error);
        toast.error("Error al cargar los tipos de anestesia disponibles");
        setTiposAnestesiaDisponibles([]);
      } finally {
        setLoadingProcedimientos(false);
      }
    };

    loadProcedimientosHospital();
  }, [selectedHospital]);

  // Cargar almacenes provisionales del hospital
  useEffect(() => {
    const loadAlmacenesProvisionales = async () => {
      if (!selectedHospital?.id) {
        setAlmacenesProvisionales([]);
        setAlmacenProvSeleccionado("");
        return;
      }

      setLoadingAlmacenes(true);
      try {
        const { data, error } = await supabase
          .from("almacenes_provisionales")
          .select("id, nombre")
          .eq("hospital_id", selectedHospital.id)
          .eq("activo", true)
          .order("created_at", { ascending: false });

        if (error) throw error;

        setAlmacenesProvisionales(data || []);
        // Auto-seleccionar el primero si existe
        if (data && data.length > 0) {
          setAlmacenProvSeleccionado(data[0].id);
        } else {
          setAlmacenProvSeleccionado("");
        }
      } catch (error) {
        console.error("Error loading almacenes provisionales:", error);
        setAlmacenesProvisionales([]);
      } finally {
        setLoadingAlmacenes(false);
      }
    };

    loadAlmacenesProvisionales();
  }, [selectedHospital]);

  // Carga las listas de médicos al montar el componente
  useEffect(() => {
    const loadMedicos = async () => {
      try {
        const { data: medicosData, error } = await supabase
          .from("medicos")
          .select("*")
          .eq("activo", true)
          .order("nombre");

        if (error) throw error;

        if (medicosData) {
          const cirujanosList = medicosData.filter(
            (m) => m.especialidad.toLowerCase().includes("ciruj") || m.especialidad.toLowerCase().includes("cirugía"),
          );
          const anestesiologosList = medicosData.filter(
            (m) =>
              m.especialidad.toLowerCase().includes("anestesia") ||
              m.especialidad.toLowerCase().includes("anestesiología"),
          );

          setCirujanos(cirujanosList.length > 0 ? cirujanosList : medicosData);
          setAnestesiologos(anestesiologosList.length > 0 ? anestesiologosList : medicosData);
        }
      } catch (error) {
        console.error("Error loading médicos:", error);
      }
    };

    loadMedicos();
  }, []);

  /**
   * Combina insumos de dos anestesias en modo mixta.
   * Si un insumo está en ambas, suma las cantidades.
   * Respeta grupos exclusivos (solo 1 de cada grupo).
   */
  const combinarInsumosAnestesiaMixta = (principal: Insumo[], secundaria: Insumo[]) => {
    const insumosMap = new Map<string, FolioInsumo>();
    const gruposUsados = new Set<string>();

    // Seleccionar de la principal (hasta 5 respetando grupos)
    let countPrincipal = 0;
    for (const insumo of principal) {
      if (countPrincipal >= 5) break;

      if (insumo.grupoExclusivo) {
        if (gruposUsados.has(insumo.grupoExclusivo)) continue;
        gruposUsados.add(insumo.grupoExclusivo);
      }

      insumosMap.set(insumo.id, {
        insumo: { id: insumo.id, nombre: insumo.nombre, lote: insumo.lote },
        cantidad: insumo.cantidadDefault,
        cantidadMinima: insumo.cantidadMinima,
        cantidadMaxima: insumo.cantidadMaxima,
        condicionante: insumo.condicionante,
        grupoExclusivo: insumo.grupoExclusivo,
      });
      countPrincipal++;
    }

    // Agregar de la secundaria (hasta 5 más, respetando grupos)
    let countSecundaria = 0;
    for (const insumo of secundaria) {
      if (countSecundaria >= 5) break;

      const existing = insumosMap.get(insumo.id);
      if (existing) {
        // Si ya existe, sumar la cantidad
        existing.cantidad += insumo.cantidadDefault;
        continue;
      }

      if (insumo.grupoExclusivo) {
        if (gruposUsados.has(insumo.grupoExclusivo)) continue;
        gruposUsados.add(insumo.grupoExclusivo);
      }

      insumosMap.set(insumo.id, {
        insumo: { id: insumo.id, nombre: insumo.nombre, lote: insumo.lote },
        cantidad: insumo.cantidadDefault,
        cantidadMinima: insumo.cantidadMinima,
        cantidadMaxima: insumo.cantidadMaxima,
        condicionante: insumo.condicionante,
        grupoExclusivo: insumo.grupoExclusivo,
      });
      countSecundaria++;
    }

    setInsumosFolio(Array.from(insumosMap.values()));
  };

  /**
   * Normaliza un texto eliminando acentos, puntuación y convirtiendo a mayúsculas
   * para mejorar el matching entre anestesia_insumos.nota e insumos_catalogo.nombre
   */
  const normalizarTexto = (texto: string): string => {
    return texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
      .replace(/[:\-,;\.\/\\()]/g, " ") // Reemplazar puntuación por espacios
      .replace(/\s+/g, " ") // Normalizar espacios múltiples
      .toUpperCase()
      .trim();
  };

  /**
   * Carga los insumos de una anestesia específica. Utiliza la clave del
   * procedimiento para obtener el tipo_anestesia correspondiente en la
   * tabla `anestesia_insumos`.
   */
  const loadInsumosForTipo = async (clave: string): Promise<Insumo[]> => {
    if (!clave) return [];

    try {
      console.log(`🔍 Buscando insumos para clave: "${clave}"`);

      // PRIMERO: Buscar en procedimiento_insumos_catalogo (configuración del Gerente de Operaciones)
      const { data: procInsumos, error: procError } = await supabase
        .from("procedimiento_insumos_catalogo")
        .select(`
          insumo_catalogo_id,
          cantidad_minima,
          cantidad_maxima,
          cantidad_sugerida,
          notas,
          insumo:insumos_catalogo(id, nombre, clave)
        `)
        .eq("procedimiento_clave", clave)
        .eq("activo", true);

      if (procError) {
        console.error("Error buscando en procedimiento_insumos_catalogo:", procError);
      }

      // Si hay configuración del Gerente de Operaciones, usarla
      if (procInsumos && procInsumos.length > 0) {
        console.log(`✅ Usando configuración de Gerente Operaciones: ${procInsumos.length} insumos autorizados`);
        
        const insumos: Insumo[] = procInsumos
          .filter((pi: any) => pi.insumo)
          .map((pi: any) => ({
            id: pi.insumo.id,
            nombre: pi.insumo.nombre,
            clave: pi.insumo.clave || undefined,
            lote: "",
            cantidadDefault: pi.cantidad_sugerida ?? 1,
            cantidadMinima: pi.cantidad_minima ?? null,
            cantidadMaxima: pi.cantidad_maxima ?? null,
            condicionante: null,
            grupoExclusivo: null,
          }));

        return insumos;
      }

      // FALLBACK: Usar anestesia_insumos (configuración legacy)
      console.log(`⚠️ No hay config de Gte Operaciones para ${clave}, usando fallback anestesia_insumos`);
      
      const tipoDb = getTipoAnestesiaKey(clave);

      const { data: anestesiaInsumos, error } = await supabase
        .from("anestesia_insumos")
        .select(`
          nota,
          cantidad_default,
          cantidad_minima,
          cantidad_maxima,
          condicionante,
          grupo_exclusivo,
          orden,
          insumo_id
        `)
        .eq("tipo_anestesia", tipoDb)
        .eq("activo", true)
        .order("orden", { ascending: true });

      if (error) throw error;

      if (!anestesiaInsumos || anestesiaInsumos.length === 0) {
        console.log(`⚠️ No se encontraron insumos para ${tipoDb}`);
        return [];
      }

      // Buscar todos los insumos del catálogo
      const { data: catalogoItems, error: catalogoError } = await supabase
        .from("insumos_catalogo")
        .select("id, nombre, clave")
        .eq("activo", true);

      if (catalogoError) throw catalogoError;

      // Crear mapa de nombre normalizado a ID del catálogo
      const catalogoMap = new Map<string, { id: string; nombre: string; clave: string | null }>();
      (catalogoItems || []).forEach((item: any) => {
        const nombreNorm = normalizarTexto(item.nombre);
        if (!catalogoMap.has(nombreNorm)) {
          catalogoMap.set(nombreNorm, { id: item.id, nombre: item.nombre, clave: item.clave });
        }
      });

      // Mapear insumos de anestesia_insumos a insumos del catálogo
      const insumos: Insumo[] = [];
      
      for (const ai of anestesiaInsumos) {
        if (!ai.nota) continue;
        
        const notaNorm = normalizarTexto(ai.nota);
        const catalogoItem = catalogoMap.get(notaNorm);
        
        if (catalogoItem) {
          insumos.push({
            id: catalogoItem.id,
            nombre: catalogoItem.nombre,
            clave: catalogoItem.clave || undefined,
            lote: "",
            cantidadDefault: ai.cantidad_default ?? 1,
            cantidadMinima: ai.cantidad_minima ?? null,
            cantidadMaxima: ai.cantidad_maxima ?? null,
            condicionante: ai.condicionante ?? null,
            grupoExclusivo: ai.grupo_exclusivo ?? null,
          });
        } else {
          console.log(`⚠️ Insumo no encontrado en catálogo: "${ai.nota}"`);
        }
      }

      console.log(`✅ Insumos cargados (fallback): ${insumos.length} de ${anestesiaInsumos.length} configurados`);
      return insumos;
    } catch (error) {
      console.error("Error loading insumos:", error);
      return [];
    }
  };

  /**
   * Selecciona 5 insumos respetando grupos exclusivos (solo 1 de cada grupo)
   */
  const seleccionarInsumosIniciales = (insumos: Insumo[]): FolioInsumo[] => {
    const selected: FolioInsumo[] = [];
    const gruposUsados = new Set<string>();

    for (const insumo of insumos) {
      if (selected.length >= 5) break;

      // Si tiene grupo exclusivo, verificar que no hayamos seleccionado otro del mismo grupo
      if (insumo.grupoExclusivo) {
        if (gruposUsados.has(insumo.grupoExclusivo)) {
          continue; // Ya hay uno de este grupo, saltar
        }
        gruposUsados.add(insumo.grupoExclusivo);
      }

      selected.push({
        insumo: {
          id: insumo.id,
          nombre: insumo.nombre,
          lote: insumo.lote,
        },
        cantidad: insumo.cantidadDefault,
        cantidadMinima: insumo.cantidadMinima,
        cantidadMaxima: insumo.cantidadMaxima,
        condicionante: insumo.condicionante,
        grupoExclusivo: insumo.grupoExclusivo,
      });
    }

    return selected;
  };

  // Efecto: cuando cambia 'tipoAnestesia' en modo normal
  useEffect(() => {
    const loadInsumosForAnestesia = async () => {
      // Limpiar al cambiar o si no hay tipo
      if (!tipoAnestesia) {
        setInsumosDisponibles([]);
        setInsumosFolio([]);
        setInsumosAdicionales([]);
        return;
      }

      if (tipoAnestesia === "anestesia_mixta") {
        // Si es mixta, limpiar y esperar a que se seleccionen los dos tipos
        setInsumosDisponibles([]);
        setInsumosFolio([]);
        setInsumosAdicionales([]);
        return;
      }

      const insumosData = await loadInsumosForTipo(tipoAnestesia);
      setInsumosDisponibles(insumosData);

      // Seleccionar 5 insumos iniciales respetando grupos exclusivos
      const preselected = seleccionarInsumosIniciales(insumosData);
      setInsumosFolio(preselected);
      setInsumosAdicionales([]);
    };

    loadInsumosForAnestesia();
  }, [tipoAnestesia]);

  // Efecto: cuando cambia anestesiaPrincipal en modo mixta
  useEffect(() => {
    const loadInsumosPrincipal = async () => {
      if (!anestesiaPrincipal || tipoAnestesia !== "anestesia_mixta") return;

      const insumosData = await loadInsumosForTipo(anestesiaPrincipal);
      setInsumosDisponiblesPrincipal(insumosData);

      // Si ya hay secundaria, recombinar ambas
      if (anestesiaSecundaria) {
        const secundariaData = await loadInsumosForTipo(anestesiaSecundaria);
        combinarInsumosAnestesiaMixta(insumosData, secundariaData);
      } else {
        // Solo principal, mostrar sus 5 insumos respetando grupos exclusivos
        const preselected = seleccionarInsumosIniciales(insumosData);
        setInsumosFolio(preselected);
      }
    };

    loadInsumosPrincipal();
  }, [anestesiaPrincipal, tipoAnestesia]);

  // Efecto: cuando cambia anestesiaSecundaria en modo mixta
  useEffect(() => {
    const loadInsumosSecundaria = async () => {
      if (!anestesiaSecundaria || tipoAnestesia !== "anestesia_mixta") return;

      const insumosData = await loadInsumosForTipo(anestesiaSecundaria);
      setInsumosDisponiblesSecundaria(insumosData);

      // Si ya hay principal, recombinar ambas
      if (anestesiaPrincipal) {
        const principalData = await loadInsumosForTipo(anestesiaPrincipal);
        combinarInsumosAnestesiaMixta(principalData, insumosData);
      } else {
        // Solo secundaria, mostrar sus 5 insumos respetando grupos exclusivos
        const preselected = seleccionarInsumosIniciales(insumosData);
        setInsumosFolio(preselected);
      }
    };

    loadInsumosSecundaria();
  }, [anestesiaSecundaria, tipoAnestesia]);

  // Calcula insumos para agregar en la UI. En modo mixta usa la unión de insumos de ambas anestesias
  // Filtra los que ya están seleccionados y los de grupos exclusivos ya usados
  const insumosParaAgregar = React.useMemo(() => {
    let availableInsumos: Insumo[] = [];
    if (tipoAnestesia === "anestesia_mixta") {
      const unionMap = new Map<string, Insumo>();
      [...insumosDisponiblesPrincipal, ...insumosDisponiblesSecundaria].forEach((insumo) => {
        unionMap.set(insumo.id, insumo);
      });
      availableInsumos = Array.from(unionMap.values());
    } else {
      availableInsumos = insumosDisponibles;
    }

    // Obtener grupos exclusivos ya en uso
    const gruposEnUso = new Set<string>();
    insumosFolio.forEach((fi) => {
      if (fi.grupoExclusivo) {
        gruposEnUso.add(fi.grupoExclusivo);
      }
    });

    // Filtrar insumos ya seleccionados y los de grupos exclusivos ya usados
    return availableInsumos.filter((insumo) => {
      // No mostrar si ya está seleccionado
      if (insumosFolio.some((fi) => fi.insumo.id === insumo.id)) {
        return false;
      }
      // No mostrar si su grupo exclusivo ya tiene un insumo seleccionado
      if (insumo.grupoExclusivo && gruposEnUso.has(insumo.grupoExclusivo)) {
        return false;
      }
      return true;
    });
  }, [tipoAnestesia, insumosDisponibles, insumosDisponiblesPrincipal, insumosDisponiblesSecundaria, insumosFolio]);

  // Agrega un insumo manualmente desde el modal
  const handleAgregarInsumo = () => {
    const insumo = insumosParaAgregar.find((i) => i.id === selectedInsumoId);
    if (!insumo) return;

    // Validar grupo exclusivo
    if (insumo.grupoExclusivo) {
      const existeDelMismoGrupo = insumosFolio.find(
        (fi) => fi.grupoExclusivo === insumo.grupoExclusivo
      );
      if (existeDelMismoGrupo) {
        toast.error(
          `Ya existe un insumo del grupo "${insumo.grupoExclusivo}". Solo puede seleccionar uno del grupo.`
        );
        return;
      }
    }

    const defaultCantidad = insumo.cantidadDefault ?? insumo.cantidadMinima ?? 1;

    setInsumosFolio([
      ...insumosFolio,
      {
        insumo: {
          id: insumo.id,
          nombre: insumo.nombre,
          lote: insumo.lote,
        },
        cantidad: defaultCantidad,
        cantidadMinima: insumo.cantidadMinima,
        cantidadMaxima: insumo.cantidadMaxima,
        condicionante: insumo.condicionante,
        grupoExclusivo: insumo.grupoExclusivo,
      },
    ]);
    setSelectedInsumoId("");
    setIsModalOpen(false);
  };

  // Elimina un insumo de la lista del folio
  const handleRemoveInsumo = (insumoId: string) => {
    setInsumosFolio(insumosFolio.filter((fi) => fi.insumo.id !== insumoId));
  };

  // Elimina un insumo adicional
  const handleRemoveAdicional = (insumoId: string) => {
    setInsumosAdicionales(insumosAdicionales.filter((ia) => ia.insumo.id !== insumoId));
  };

  // Actualiza la cantidad de un insumo del folio respetando min/max
  const handleUpdateCantidad = (insumoId: string, cantidad: number) => {
    const insumo = insumosFolio.find(fi => fi.insumo.id === insumoId);
    if (!insumo) return;

    const min = insumo.cantidadMinima ?? 0;
    const max = insumo.cantidadMaxima ?? Number.MAX_SAFE_INTEGER;

    if (cantidad < min) {
      toast.error(`La cantidad mínima para ${insumo.insumo.nombre} es ${min}`);
      setInsumosFolio(prev => prev.map(fi => 
        fi.insumo.id === insumoId ? { ...fi, cantidad: min } : fi
      ));
      return;
    }

    if (cantidad > max && insumo.cantidadMaxima != null) {
      // Mostrar dialog para preguntar si quiere agregar como adicional
      setPendingAdicional({
        insumoId,
        nombreInsumo: insumo.insumo.nombre,
        cantidadSolicitada: cantidad,
        cantidadMaxima: max
      });
      return;
    }

    setInsumosFolio(prev => prev.map(fi => 
      fi.insumo.id === insumoId ? { ...fi, cantidad } : fi
    ));
  };

  // Confirmar agregar como adicional
  const handleConfirmAdicional = () => {
    if (!pendingAdicional) return;

    const { insumoId, nombreInsumo, cantidadSolicitada, cantidadMaxima } = pendingAdicional;
    const cantidadAdicional = cantidadSolicitada - cantidadMaxima;

    // Poner el insumo regular al máximo
    setInsumosFolio(prev => prev.map(fi => 
      fi.insumo.id === insumoId ? { ...fi, cantidad: cantidadMaxima } : fi
    ));

    // Agregar o actualizar el adicional
    setInsumosAdicionales(prev => {
      const existing = prev.find(ia => ia.insumo.id === insumoId);
      if (existing) {
        return prev.map(ia => 
          ia.insumo.id === insumoId 
            ? { ...ia, cantidad: ia.cantidad + cantidadAdicional }
            : ia
        );
      }
      return [...prev, {
        insumo: { id: insumoId, nombre: nombreInsumo },
        cantidad: cantidadAdicional
      }];
    });

    toast.success(`${cantidadAdicional} unidades agregadas como adicionales`);
    setPendingAdicional(null);
  };

  // Actualiza cantidad de adicional
  const handleUpdateAdicionalCantidad = (insumoId: string, cantidad: number) => {
    if (cantidad <= 0) {
      handleRemoveAdicional(insumoId);
      return;
    }
    setInsumosAdicionales(prev => prev.map(ia => 
      ia.insumo.id === insumoId ? { ...ia, cantidad } : ia
    ));
  };

  // Envía el formulario completo
  const handleSubmitForm = async (values: FolioFormValues) => {
    // Validar que el tipo de anestesia sea válido para el hospital
    if (!selectedHospital?.id) {
      toast.error("Debe seleccionar un hospital");
      return;
    }

    // Validar que haya almacén provisional seleccionado
    if (almacenesProvisionales.length === 0) {
      toast.error("No hay almacenes provisionales configurados", {
        description: "Debe crear un almacén provisional antes de crear folios"
      });
      return;
    }

    if (!almacenProvSeleccionado) {
      toast.error("Debe seleccionar un almacén provisional");
      return;
    }

    try {
      // Validar tipo de anestesia con el backend
      const { data: validationResult, error: validationError } = await supabase.functions.invoke("validate-folio", {
        body: {
          hospital_id: selectedHospital.id,
          tipo_anestesia: values.tipo_anestesia,
          anestesia_principal: anestesiaPrincipal || null,
          anestesia_secundaria: anestesiaSecundaria || null,
        },
      });

      if (validationError) throw validationError;

      if (!validationResult?.valid) {
        toast.error(validationResult?.error || "El tipo de anestesia no es válido para este hospital");
        return;
      }

      // Obtener nombres de médicos seleccionados
      const cirujanoSeleccionado = cirujanos.find((m) => m.id === values.cirujano);
      const anestesiologoSeleccionado = anestesiologos.find((m) => m.id === values.anestesiologo);
      const almacenSeleccionado = almacenesProvisionales.find((a) => a.id === almacenProvSeleccionado);

      const submitData = {
        ...values,
        pacienteEdadUnidad: pacienteEdadUnidad,
        cirujanoNombre: cirujanoSeleccionado?.nombre,
        anestesiologoNombre: anestesiologoSeleccionado?.nombre,
        insumos: insumosFolio,
        insumosAdicionales: insumosAdicionales,
        hospital_id: selectedHospital?.id,
        hospital_display_name: selectedHospital?.display_name,
        hospital_budget_code: selectedHospital?.budget_code,
        state_name: selectedHospital?.state_name,
        almacen_provisional_id: almacenProvSeleccionado,
        almacen_provisional_nombre: almacenSeleccionado?.nombre,
        editingDraftId: editingDraft?.id || null,
        ...(tipoAnestesia === "anestesia_mixta" && {
          anestesiaPrincipal: anestesiaPrincipal,
          anestesiaSecundaria: anestesiaSecundaria,
        }),
      };
      onSubmit(submitData, false);
    } catch (error) {
      console.error("Error al validar el tipo de anestesia:", error);
      toast.error("Error al validar el formulario. Por favor, intente nuevamente.");
    }
  };

  // Handler para guardar como borrador (sin validaciones estrictas, sin afectar inventario)
  const handleSaveDraft = async () => {
    const values = form.getValues();
    
    // Validaciones mínimas para borrador
    if (!selectedHospital) {
      toast.error("Debe seleccionar un hospital");
      return;
    }

    const cirujanoSeleccionado = cirujanos.find((m) => m.id === values.cirujano);
    const anestesiologoSeleccionado = anestesiologos.find((m) => m.id === values.anestesiologo);
    const almacenSeleccionado = almacenesProvisionales.find((a) => a.id === almacenProvSeleccionado);

    const submitData = {
      ...values,
      pacienteEdadUnidad: pacienteEdadUnidad,
      cirujanoNombre: cirujanoSeleccionado?.nombre,
      anestesiologoNombre: anestesiologoSeleccionado?.nombre,
      insumos: insumosFolio,
      insumosAdicionales: insumosAdicionales,
      hospital_id: selectedHospital?.id,
      hospital_display_name: selectedHospital?.display_name,
      hospital_budget_code: selectedHospital?.budget_code,
      state_name: selectedHospital?.state_name,
      almacen_provisional_id: almacenProvSeleccionado || null,
      almacen_provisional_nombre: almacenSeleccionado?.nombre,
      editingDraftId: editingDraft?.id || null,
      ...(tipoAnestesia === "anestesia_mixta" && {
        anestesiaPrincipal: anestesiaPrincipal,
        anestesiaSecundaria: anestesiaSecundaria,
      }),
    };
    onSubmit(submitData, true);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmitForm)} className="space-y-6">
        {/* Encabezado: Unidad y Quirófano */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="unidad"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unidad Médica *</FormLabel>
                {canSelectHospital ? (
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      const hospital = availableHospitals.find((h) => h.display_name === value);
                      if (hospital) setSelectedHospital(hospital);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona hospital" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableHospitals.map((h) => (
                        <SelectItem key={h.budget_code} value={h.display_name}>
                          {h.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <FormControl>
                    <Input value={selectedHospital?.display_name || ""} readOnly className="bg-muted" />
                  </FormControl>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="numeroQuirofano"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número de Quirófano *</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Q-01" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Selector de Almacén Provisional */}
          <div className="col-span-2">
            <Label className="text-sm font-medium">Almacén Provisional *</Label>
            {loadingAlmacenes ? (
              <div className="h-10 flex items-center text-sm text-muted-foreground">
                Cargando almacenes...
              </div>
            ) : almacenesProvisionales.length === 0 ? (
              <div className="p-3 border border-destructive/50 bg-destructive/10 rounded-md">
                <p className="text-sm text-destructive font-medium">
                  ⚠️ No hay almacenes provisionales configurados
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Debe crear un almacén provisional antes de crear folios.
                </p>
              </div>
            ) : (
              <Select value={almacenProvSeleccionado} onValueChange={setAlmacenProvSeleccionado}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Seleccionar almacén provisional" />
                </SelectTrigger>
                <SelectContent>
                  {almacenesProvisionales.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Horarios */}
        <div className="space-y-3">
          <h3 className="font-semibold text-base">Horarios</h3>
          <div className="grid grid-cols-4 gap-4">
            <FormField
              control={form.control}
              name="inicioProcedimiento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Inicio Procedimiento *</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="finProcedimiento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fin Procedimiento *</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="inicioAnestesia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Inicio Anestesia *</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="finAnestesia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fin Anestesia *</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Datos del paciente */}
        <div className="space-y-3">
          <h3 className="font-semibold text-base">Datos del Paciente</h3>
          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="pacienteApellidoPaterno"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Apellido Paterno *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Pérez" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pacienteApellidoMaterno"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Apellido Materno *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="García" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pacienteNombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre(s) *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Juan" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-4 gap-4">
            <FormField
              control={form.control}
              name="pacienteNSS"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NSS *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="12345678901" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pacienteFechaNacimiento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de Nacimiento *</FormLabel>
                  <FormControl>
                    <Input 
                      type="date" 
                      {...field} 
                      onChange={(e) => {
                        field.onChange(e);
                        // Calcular edad automáticamente
                        if (e.target.value) {
                          const nacimiento = new Date(e.target.value);
                          const hoy = new Date();
                          let edadAnios = hoy.getFullYear() - nacimiento.getFullYear();
                          const mesesDiff = hoy.getMonth() - nacimiento.getMonth();
                          if (mesesDiff < 0 || (mesesDiff === 0 && hoy.getDate() < nacimiento.getDate())) {
                            edadAnios--;
                          }
                          
                          if (edadAnios >= 1) {
                            form.setValue("pacienteEdad", edadAnios);
                            setPacienteEdadUnidad("años");
                          } else {
                            // Calcular meses
                            let meses = (hoy.getFullYear() - nacimiento.getFullYear()) * 12;
                            meses += hoy.getMonth() - nacimiento.getMonth();
                            if (hoy.getDate() < nacimiento.getDate()) meses--;
                            if (meses >= 1) {
                              form.setValue("pacienteEdad", meses);
                              setPacienteEdadUnidad("meses");
                            } else {
                              // Calcular días
                              const diffTime = Math.abs(hoy.getTime() - nacimiento.getTime());
                              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                              form.setValue("pacienteEdad", diffDays);
                              setPacienteEdadUnidad("días");
                            }
                          }
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-2">
              <FormField
                control={form.control}
                name="pacienteEdad"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Edad (calculada)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        placeholder="Auto"
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>Unidad</FormLabel>
                <Select value={pacienteEdadUnidad} onValueChange={setPacienteEdadUnidad}>
                  <SelectTrigger>
                    <SelectValue placeholder="Años" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="años">Años</SelectItem>
                    <SelectItem value="meses">Meses</SelectItem>
                    <SelectItem value="semanas">Semanas</SelectItem>
                    <SelectItem value="días">Días</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            </div>

            <FormField
              control={form.control}
              name="pacienteGenero"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Género *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="M">Masculino</SelectItem>
                      <SelectItem value="F">Femenino</SelectItem>
                      <SelectItem value="Otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Procedimiento quirúrgico */}
        <div className="space-y-3">
          <h3 className="font-semibold text-base">Procedimiento Quirúrgico</h3>
          <FormField
            control={form.control}
            name="procedimientoQuirurgico"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Procedimiento Quirúrgico *</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Apendicectomía" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="especialidadQuirurgica"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Especialidad Quirúrgica</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Cirugía General" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipoCirugia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Cirugía</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="electiva">Electiva</SelectItem>
                      <SelectItem value="urgencia">Urgencia</SelectItem>
                      <SelectItem value="emergencia">Emergencia</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipoEvento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Evento</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="programado">Programado</SelectItem>
                      <SelectItem value="no_programado">No Programado</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Tipo de anestesia y anestesia mixta */}
        <div className="space-y-3">
          <h3 className="font-semibold text-base">Tipo de Anestesia</h3>
          <FormField
            control={form.control}
            name="tipo_anestesia"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Anestesia *</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    setTipoAnestesia(value);
                    // Si se elige una anestesia normal, reinicia campos de mixto
                    if (value !== "anestesia_mixta") {
                      setAnestesiaPrincipal("");
                      setAnestesiaSecundaria("");
                    }
                  }}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo de anestesia" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {loadingProcedimientos ? (
                      <SelectItem value="_loading" disabled>
                        Cargando procedimientos...
                      </SelectItem>
                    ) : tiposAnestesiaDisponibles.length === 0 ? (
                      <SelectItem value="_empty" disabled>
                        No hay procedimientos disponibles
                      </SelectItem>
                    ) : (
                      tiposAnestesiaDisponibles.map((tipo) => (
                        <SelectItem key={tipo.value} value={tipo.value}>
                          {tipo.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {tipoAnestesia === "anestesia_mixta" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Anestesia Principal *</Label>
                <Select value={anestesiaPrincipal} onValueChange={setAnestesiaPrincipal}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposAnestesiaDisponibles
                      .filter((tipo) => tipo.value !== "anestesia_mixta")
                      .map((tipo) => (
                        <SelectItem key={tipo.value} value={tipo.value}>
                          {tipo.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Anestesia Secundaria *</Label>
                <Select value={anestesiaSecundaria} onValueChange={setAnestesiaSecundaria}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposAnestesiaDisponibles
                      .filter((tipo) => tipo.value !== "anestesia_mixta")
                      .map((tipo) => (
                        <SelectItem key={tipo.value} value={tipo.value}>
                          {tipo.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        {/* Personal médico */}
        <div className="space-y-3">
          <h3 className="font-semibold text-base">Personal Médico</h3>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="cirujano"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cirujano</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar cirujano" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {cirujanos.map((medico) => (
                        <SelectItem key={medico.id} value={medico.id}>
                          {medico.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="anestesiologo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Anestesiólogo</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar anestesiólogo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {anestesiologos.map((medico) => (
                        <SelectItem key={medico.id} value={medico.id}>
                          {medico.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Insumos */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-base">Bienes de Consumo y Medicamentos</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              disabled={
                !tipoAnestesia || (tipoAnestesia === "anestesia_mixta" && (!anestesiaPrincipal || !anestesiaSecundaria))
              }
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar Insumo
            </Button>
          </div>

          {insumosFolio.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay insumos agregados. Haz clic en "Agregar insumo" para comenzar.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2">Nombre</TableHead>
                  <TableHead className="py-2 w-24">Min/Max</TableHead>
                  <TableHead className="w-32 py-2">Cantidad</TableHead>
                  <TableHead className="w-20 py-2"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {insumosFolio.map((fi) => (
                  <TableRow key={fi.insumo.id}>
                    <TableCell className="py-2">
                      <div className="space-y-1">
                        <div className="font-medium">{fi.insumo.nombre}</div>
                        <div className="flex gap-1 flex-wrap">
                          {fi.grupoExclusivo && (
                            <Badge variant="secondary" className="text-xs">
                              {fi.grupoExclusivo}
                            </Badge>
                          )}
                          {fi.condicionante && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              {fi.condicionante}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-sm text-muted-foreground">
                      {fi.cantidadMinima != null && fi.cantidadMaxima != null 
                        ? `${fi.cantidadMinima}-${fi.cantidadMaxima}`
                        : fi.cantidadMinima != null 
                        ? `Mín: ${fi.cantidadMinima}`
                        : fi.cantidadMaxima != null
                        ? `Máx: ${fi.cantidadMaxima}`
                        : '-'}
                    </TableCell>
                    <TableCell className="py-2">
                      <Input
                        type="number"
                        min={0}
                        value={fi.cantidad}
                        onChange={(e) => handleUpdateCantidad(fi.insumo.id, Number(e.target.value))}
                        className="w-20 h-8"
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveInsumo(fi.insumo.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Insumos Adicionales */}
        {insumosAdicionales.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h3 className="font-semibold text-base">Insumos Adicionales</h3>
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                {insumosAdicionales.length} adicional{insumosAdicionales.length > 1 ? 'es' : ''}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Estos insumos exceden la cantidad máxima permitida y se registrarán por separado para trazabilidad.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-2">Nombre</TableHead>
                  <TableHead className="w-32 py-2">Cantidad Extra</TableHead>
                  <TableHead className="w-20 py-2"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {insumosAdicionales.map((ia) => (
                  <TableRow key={`adicional-${ia.insumo.id}`} className="bg-amber-50/50">
                    <TableCell className="py-2">{ia.insumo.nombre}</TableCell>
                    <TableCell className="py-2">
                      <Input
                        type="number"
                        min={1}
                        value={ia.cantidad}
                        onChange={(e) => handleUpdateAdicionalCantidad(ia.insumo.id, Number(e.target.value))}
                        className="w-20 h-8"
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveAdicional(ia.insumo.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Botones de cancelar/borrador/crear */}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" variant="secondary" onClick={handleSaveDraft}>
            <Save className="h-4 w-4 mr-2" />
            Guardar Borrador
          </Button>
          <Button type="submit">{editingDraft ? "Finalizar Folio" : "Crear Folio"}</Button>
        </div>
      </form>

      {/* Modal para agregar insumo */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Agregar Insumo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Buscar y seleccionar insumo</Label>
              <InsumoSearchCombobox
                value={selectedInsumoId}
                onSelect={(insumo) => setSelectedInsumoId(insumo?.id || "")}
                insumosDisponibles={insumosParaAgregar}
                placeholder="Buscar por nombre o código BCB..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAgregarInsumo} disabled={!selectedInsumoId}>
                Agregar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog para confirmar insumo adicional */}
      <AlertDialog open={!!pendingAdicional} onOpenChange={() => setPendingAdicional(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cantidad excede el máximo permitido</AlertDialogTitle>
            <AlertDialogDescription>
              La cantidad máxima para <strong>{pendingAdicional?.nombreInsumo}</strong> es {pendingAdicional?.cantidadMaxima}.
              <br /><br />
              ¿Deseas agregar {pendingAdicional ? pendingAdicional.cantidadSolicitada - pendingAdicional.cantidadMaxima : 0} unidades como <strong>insumo adicional</strong>?
              <br /><br />
              Los insumos adicionales se registran por separado para trazabilidad.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAdicional}>
              Sí, agregar como adicional
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  );
}
