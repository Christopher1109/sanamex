import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

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
}

const SucursalContext = createContext<SucursalContextType | undefined>(undefined);

export const useSucursal = (): SucursalContextType => {
  const context = useContext(SucursalContext);
  if (!context) throw new Error("useSucursal must be used within SucursalProvider");
  return context;
};

export const SucursalProvider = ({ children }: { children: ReactNode }) => {
  const [selectedSucursal, setSelectedSucursal] = useState<Sucursal | null>(null);
  const [availableSucursales, setAvailableSucursales] = useState<Sucursal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("sucursales")
          .select("*")
          .eq("activo", true)
          .order("codigo");

        if (error) throw error;
        const sucursales = (data || []) as Sucursal[];
        setAvailableSucursales(sucursales);
        if (sucursales.length > 0) setSelectedSucursal(sucursales[0]);
      } catch (err) {
        console.error("Error loading sucursales:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <SucursalContext.Provider value={{ selectedSucursal, availableSucursales, setSelectedSucursal, loading }}>
      {children}
    </SucursalContext.Provider>
  );
};
