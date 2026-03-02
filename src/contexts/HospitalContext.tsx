import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Estructura de un hospital según la tabla reales `hospitales`
 */
export interface Hospital {
  id: string;
  nombre: string;
  state_name: string;
  budget_code: string;
  hospital_type: string;
  clinic_number: string;
  locality: string;
  display_name: string;
  codigo: string;
  estado_id: string;
}

/**
 * Estructura de un registro de la tabla `users`
 */
interface UserRow {
  id: number;
  username: string;
  role: string;
  state_name?: string | null;
  hospital_budget_code?: string | null;
  hospital_display_name?: string | null;
  assigned_hospitals?: string | null;
  supervisor_group?: number | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Valores expuestos por el contexto de hospitales
 */
interface HospitalContextType {
  selectedHospital: Hospital | null;
  availableHospitals: Hospital[];
  setSelectedHospital: (hospital: Hospital | null) => void;
  loading: boolean;
  userRole: string | null;
  canSelectHospital: boolean;
}

const HospitalContext = createContext<HospitalContextType | undefined>(undefined);

/**
 * Hook para consumir el contexto de hospitales
 */
export const useHospital = (): HospitalContextType => {
  const context = useContext(HospitalContext);
  if (!context) {
    throw new Error("useHospital must be used within HospitalProvider");
  }
  return context;
};

interface HospitalProviderProps {
  children: ReactNode;
  userId: string | null; // aquí esperamos el username (ej. 'almacenista_baja_california_31')
  userRole: string | null; // 'gerente_operaciones', 'supervisor', 'almacenista', 'lider', 'auxiliar'
}

/**
 * HospitalProvider: carga los hospitales basándose en la tabla `users`
 * (NO usa user_roles, porque ahí no tienes hospitales asignados).
 */
export const HospitalProvider = ({ children, userId, userRole }: HospitalProviderProps) => {
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [availableHospitals, setAvailableHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);

  // Roles globales pueden elegir hospital; los demás NO
  const canSelectHospital = userRole === "gerente_operaciones" || userRole === "gerente_almacen" || userRole === "cadena_suministros" || userRole === "supervisor" || userRole === "finanzas";

  // Helper para mapear el registro crudo de la tabla hospitales a la interfaz Hospital
  const mapHospital = (h: any): Hospital => ({
    id: h.id,
    nombre: h.nombre,
    state_name: "", // opcional, si luego quieres lo llenamos con la tabla `states`
    budget_code: h.budget_code || h.codigo || "",
    hospital_type: h.hospital_type || "",
    clinic_number: h.clinic_number || "",
    locality: h.locality || "",
    display_name: h.display_name || h.nombre,
    codigo: h.codigo || "",
    estado_id: h.estado_id || h.state_id || "",
  });

  useEffect(() => {
    // Si no hay usuario o rol, limpiamos
    if (!userId || !userRole) {
      setAvailableHospitals([]);
      setSelectedHospital(null);
      setLoading(false);
      return;
    }

    const loadHospitals = async () => {
      try {
        setLoading(true);

        // 1) ROLES GLOBALES → ven todos los hospitales ordenados por estado
        if (userRole === "gerente_operaciones" || userRole === "gerente" || userRole === "gerente_almacen" || userRole === "cadena_suministros" || userRole === "finanzas") {
          const { data: allHospitals, error } = await supabase
            .from("hospitales")
            .select("*, states(name)")
            .order("states(name)", { ascending: true })
            .order("nombre", { ascending: true });

          if (error) {
            console.error("Error loading hospitals for manager:", error);
            setAvailableHospitals([]);
            setSelectedHospital(null);
            return;
          }

          const hospitals: Hospital[] = (allHospitals || []).map((h: any) => ({
            ...mapHospital(h),
            state_name: h.states?.name || ""
          }));
          
          // Ordenar por state_name y luego por display_name en el frontend
          hospitals.sort((a, b) => {
            if (a.state_name !== b.state_name) {
              return a.state_name.localeCompare(b.state_name);
            }
            return a.display_name.localeCompare(b.display_name);
          });
          
          setAvailableHospitals(hospitals);
          if (hospitals.length > 0) {
            setSelectedHospital(hospitals[0]);
          }
          return;
        }

        // 2) TODOS LOS DEMÁS ROLES → obtenemos su fila en la tabla `users`
        // userId aquí debe ser el username, por ejemplo 'almacenista_baja_california_31'
        const { data: userRow, error: userError } = await (supabase as any)
          .from("users")
          .select("*")
          .eq("username", userId)
          .maybeSingle() as { data: UserRow | null; error: any };

        if (userError) {
          console.error("Error fetching user from users table:", userError);
          setAvailableHospitals([]);
          setSelectedHospital(null);
          return;
        }

        if (!userRow) {
          console.warn("No se encontró registro en users para", userId);
          setAvailableHospitals([]);
          setSelectedHospital(null);
          return;
        }

        // 2a) SUPERVISOR → buscar en supervisor_hospital_assignments primero,
        // luego fallback a assigned_hospitals en tabla users
        if (userRole === "supervisor") {
          // Primero obtener el auth user_id del perfil
          const { data: profileData, error: profileError } = await supabase
            .from("profiles")
            .select("id")
            .eq("username", userId)
            .maybeSingle();

          if (profileError) {
            console.error("Error fetching profile for supervisor:", profileError);
          }

          let hospitals: Hospital[] = [];

          // Intentar buscar en supervisor_hospital_assignments
          if (profileData?.id) {
            const { data: assignments, error: assignmentsError } = await supabase
              .from("supervisor_hospital_assignments")
              .select(`
                hospital_id,
                hospital:hospitales(*)
              `)
              .eq("supervisor_user_id", profileData.id);

            if (!assignmentsError && assignments && assignments.length > 0) {
              hospitals = assignments
                .filter((a: any) => a.hospital)
                .map((a: any) => ({
                  ...mapHospital(a.hospital),
                  state_name: a.hospital.state_id || ""
                }));
            }
          }

          // Fallback: buscar en users.assigned_hospitals si no hay asignaciones
          if (hospitals.length === 0) {
            const assigned = userRow.assigned_hospitals || "";
            const hospitalNames = assigned
              .split(",")
              .map((h) => h.trim())
              .filter((h) => h.length > 0);

            if (hospitalNames.length > 0) {
              const { data: hospitalsData, error: hospitalsError } = await (supabase as any)
                .from("hospitales")
                .select("*")
                .in("display_name", hospitalNames)
                .order("nombre") as { data: any[] | null; error: any };

              if (!hospitalsError && hospitalsData) {
                hospitals = hospitalsData.map(mapHospital);
              }
            }
          }

          // Segundo fallback: buscar por budget_code del supervisor
          if (hospitals.length === 0 && userRow.hospital_budget_code) {
            // Obtener el estado del hospital del supervisor
            const { data: supervisorHospital, error: shError } = await supabase
              .from("hospitales")
              .select("*, states(name)")
              .eq("budget_code", userRow.hospital_budget_code)
              .maybeSingle();

            if (!shError && supervisorHospital) {
              // Buscar todos los hospitales del mismo estado
              const stateId = supervisorHospital.state_id;
              if (stateId) {
                const { data: stateHospitals, error: stateError } = await supabase
                  .from("hospitales")
                  .select("*, states(name)")
                  .eq("state_id", stateId)
                  .order("nombre");

                if (!stateError && stateHospitals) {
                  hospitals = stateHospitals.map((h: any) => ({
                    ...mapHospital(h),
                    state_name: h.states?.name || ""
                  }));
                }
              }
            }
          }

          if (hospitals.length === 0) {
            console.warn("Supervisor sin hospitales asignados");
            setAvailableHospitals([]);
            setSelectedHospital(null);
            return;
          }

          setAvailableHospitals(hospitals);
          setSelectedHospital(hospitals[0]);
          return;
        }

        // 2b) ROLES DE UN SOLO HOSPITAL → almacenista, lider, auxiliar
        const budgetCode = userRow.hospital_budget_code || null;
        const displayName = userRow.hospital_display_name || null;

        if (!budgetCode || !displayName) {
          console.warn("Usuario de un solo hospital sin hospital_budget_code/display_name en users");
          setAvailableHospitals([]);
          setSelectedHospital(null);
          return;
        }

        // Buscamos el hospital por budget_code
        const { data: hospitalData, error: hospitalError } = await (supabase as any)
          .from("hospitales")
          .select("*")
          .eq("budget_code", budgetCode)
          .maybeSingle() as { data: any | null; error: any };

        let hospital: Hospital;

        if (hospitalError) {
          console.error("Error fetching hospital by budget_code:", hospitalError);
          // fallback: crear hospital "virtual" desde users
          hospital = {
            id: "",
            nombre: displayName || "",
            state_name: userRow.state_name || "",
            budget_code: budgetCode || "",
            hospital_type: "",
            clinic_number: "",
            locality: "",
            display_name: displayName || "",
            codigo: "",
            estado_id: "",
          };
        } else if (!hospitalData) {
          // Sin match exacto en hospitales → fallback igual
          hospital = {
            id: "",
            nombre: displayName || "",
            state_name: userRow.state_name || "",
            budget_code: budgetCode || "",
            hospital_type: "",
            clinic_number: "",
            locality: "",
            display_name: displayName || "",
            codigo: "",
            estado_id: "",
          };
        } else {
          hospital = mapHospital(hospitalData);
          // si quieres, aquí podríamos sobreescribir state_name con userRow.state_name
          if (userRow.state_name) {
            hospital.state_name = userRow.state_name;
          }
        }

        setAvailableHospitals([hospital]);
        setSelectedHospital(hospital);
      } catch (error) {
        console.error("Error in loadHospitals:", error);
        setAvailableHospitals([]);
        setSelectedHospital(null);
      } finally {
        setLoading(false);
      }
    };

    loadHospitals();
  }, [userId, userRole]);

  return (
    <HospitalContext.Provider
      value={{
        selectedHospital,
        availableHospitals,
        setSelectedHospital,
        loading,
        userRole,
        canSelectHospital,
      }}
    >
      {children}
    </HospitalContext.Provider>
  );
};
