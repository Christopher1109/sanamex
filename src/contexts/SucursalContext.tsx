import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Sucursal {
  id: string;
  nombre: string;
  codigo: string;
  direccion?: string;
  telefono?: string;
  activo: boolean;
}

interface SucursalContextType {
  selectedSucursal: Sucursal | null;
  availableSucursales: Sucursal[];
  setSelectedSucursal: (s: Sucursal | null) => void;
  loading: boolean;
  canSwitchSucursal: boolean;
}

const SucursalContext = createContext<SucursalContextType | undefined>(undefined);

export const useSucursal = (): SucursalContextType => {
  const context = useContext(SucursalContext);
  if (!context) throw new Error("useSucursal must be used within SucursalProvider");
  return context;
};

export const SucursalProvider = ({ children }: { children: ReactNode }) => {
  const { user, userRole } = useAuth();
  const [selectedSucursal, setSelectedSucursalState] = useState<Sucursal | null>(null);
  const [availableSucursales, setAvailableSucursales] = useState<Sucursal[]>([]);
  const [loading, setLoading] = useState(true);

  const canSwitchSucursal = userRole === "super_admin" || userRole === "admin";

  const setSelectedSucursal = (s: Sucursal | null) => {
    if (!canSwitchSucursal) return; // bloqueado para usuarios locales
    setSelectedSucursalState(s);
  };

  useEffect(() => {
    const load = async () => {
      if (!user || !userRole) {
        setLoading(false);
        return;
      }
      try {
        const { data: allSucursales, error } = await supabase
          .from("sucursales")
          .select("*")
          .eq("activo", true)
          .order("codigo");
        if (error) throw error;
        const todas = (allSucursales || []) as Sucursal[];

        let visibles: Sucursal[];
        if (canSwitchSucursal) {
          visibles = todas;
        } else {
          const { data: asign } = await supabase
            .from("user_sucursal_asignacion")
            .select("sucursal_id")
            .eq("user_id", user.id);
          const ids = new Set((asign || []).map((a: any) => a.sucursal_id));
          visibles = todas.filter((s) => ids.has(s.id));
        }

        setAvailableSucursales(visibles);
        if (visibles.length > 0) setSelectedSucursalState(visibles[0]);
        else setSelectedSucursalState(null);
      } catch (err) {
        console.error("Error loading sucursales:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id, userRole, canSwitchSucursal]);

  return (
    <SucursalContext.Provider
      value={{ selectedSucursal, availableSucursales, setSelectedSucursal, loading, canSwitchSucursal }}
    >
      {children}
    </SucursalContext.Provider>
  );
};
