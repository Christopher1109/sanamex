import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useHospital } from '@/contexts/HospitalContext';

export type TipoActividad = 
  | 'folio_creado'
  | 'folio_cancelado'
  | 'folio_completado'
  | 'folio_borrador_creado'
  | 'folio_borrador_eliminado'
  | 'traspaso_almacen_provisional'
  | 'devolucion_almacen_principal'
  | 'recepcion_almacen_central'
  | 'ajuste_inventario'
  | 'almacen_provisional_creado'
  | 'almacen_provisional_eliminado'
  | 'insumo_agregado'
  | 'insumo_modificado';

export interface InsumoAfectado {
  insumo_id: string;
  nombre: string;
  clave?: string;
  cantidad: number;
  cantidad_anterior?: number;
  cantidad_nueva?: number;
}

export interface RegistroActividadData {
  tipo_actividad: TipoActividad;
  descripcion: string;
  folio_id?: string;
  numero_folio?: string;
  almacen_origen_id?: string;
  almacen_origen_nombre?: string;
  almacen_destino_id?: string;
  almacen_destino_nombre?: string;
  insumos_afectados?: InsumoAfectado[];
  cantidad_total?: number;
  detalles_adicionales?: Record<string, any>;
  hospital_id?: string; // Opcional, si no se pasa usa el del contexto
}

export const useRegistroActividad = () => {
  const { user, username } = useAuth();
  const { selectedHospital } = useHospital();

  const registrarActividad = async (data: RegistroActividadData): Promise<boolean> => {
    if (!user) {
      console.error('No hay usuario autenticado para registrar actividad');
      return false;
    }

    const hospitalId = data.hospital_id || selectedHospital?.id;
    if (!hospitalId) {
      console.error('No hay hospital seleccionado para registrar actividad');
      return false;
    }

    try {
      const insertData = {
        hospital_id: hospitalId,
        usuario_id: user.id,
        usuario_nombre: username || user.email || 'Usuario desconocido',
        tipo_actividad: data.tipo_actividad,
        descripcion: data.descripcion,
        folio_id: data.folio_id,
        numero_folio: data.numero_folio,
        almacen_origen_id: data.almacen_origen_id,
        almacen_origen_nombre: data.almacen_origen_nombre,
        almacen_destino_id: data.almacen_destino_id,
        almacen_destino_nombre: data.almacen_destino_nombre,
        insumos_afectados: data.insumos_afectados || [],
        cantidad_total: data.cantidad_total,
        detalles_adicionales: data.detalles_adicionales || {},
      };

      const { error } = await supabase
        .from('registro_actividad')
        .insert(insertData as any);

      if (error) {
        console.error('Error al registrar actividad:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error inesperado al registrar actividad:', err);
      return false;
    }
  };

  return { registrarActividad };
};

// Función helper para usar fuera de componentes React
export const registrarActividadDirecta = async (
  userId: string,
  userName: string,
  hospitalId: string,
  data: Omit<RegistroActividadData, 'hospital_id'>
): Promise<boolean> => {
  try {
    const insertData = {
      hospital_id: hospitalId,
      usuario_id: userId,
      usuario_nombre: userName,
      tipo_actividad: data.tipo_actividad,
      descripcion: data.descripcion,
      folio_id: data.folio_id,
      numero_folio: data.numero_folio,
      almacen_origen_id: data.almacen_origen_id,
      almacen_origen_nombre: data.almacen_origen_nombre,
      almacen_destino_id: data.almacen_destino_id,
      almacen_destino_nombre: data.almacen_destino_nombre,
      insumos_afectados: data.insumos_afectados || [],
      cantidad_total: data.cantidad_total,
      detalles_adicionales: data.detalles_adicionales || {},
    };

    const { error } = await supabase
      .from('registro_actividad')
      .insert(insertData as any);

    if (error) {
      console.error('Error al registrar actividad:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error inesperado al registrar actividad:', err);
    return false;
  }
};
