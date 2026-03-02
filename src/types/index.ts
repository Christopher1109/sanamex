export type UserRole = 
  | 'auxiliar' 
  | 'almacenista' 
  | 'lider' 
  | 'supervisor' 
  | 'gerente'
  | 'gerente_operaciones'
  | 'gerente_almacen'
  | 'cadena_suministros'
  | 'finanzas';

export interface Doctor {
  id: string;
  nombre: string;
  especialidad: 'anestesiologo' | 'cirujano';
  unidad: string;
}

export interface Insumo {
  id: string;
  nombre: string;
  lote: string;
  cantidad: number;
  fechaCaducidad: string;
  unidad: string;
  origen: 'LOAD' | 'Prestado';
}

export interface PaqueteAnestesia {
  id: string;
  tipo: 'general_balanceada_adulto' 
    | 'general_balanceada_pediatrica' 
    | 'general_alta_especialidad' 
    | 'general_endovenosa' 
    | 'locorregional' 
    | 'sedacion';
  insumos: InsumoRequerido[];
}

export interface InsumoRequerido {
  insumoId: string;
  cantidad: number;
}

export interface Folio {
  id: string;
  numeroFolio: string;
  fechaHora: string;
  paciente: {
    nombre: string;
    edad: number;
    genero: 'M' | 'F' | 'Otro';
  };
  cirugia: string;
  tipoAnestesia: string;
  cirujano: string;
  anestesiologo: string;
  insumosUtilizados: InsumoUtilizado[];
  unidad: string;
  estado: 'activo' | 'cancelado';
  creadoPor: string;
}

export interface InsumoUtilizado {
  insumoId: string;
  nombre: string;
  lote: string;
  cantidad: number;
}

export interface Traspaso {
  id: string;
  fecha: string;
  unidadOrigen: string;
  unidadDestino: string;
  insumos: InsumoUtilizado[];
  estado: 'pendiente' | 'completado' | 'rechazado';
  creadoPor: string;
}
