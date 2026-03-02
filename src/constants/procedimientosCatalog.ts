// Catálogo maestro de procedimientos de anestesia con claves estandarizadas IMSS
// Estas claves son universales para todos los hospitales

export interface ProcedimientoCatalogo {
  clave: string;
  nombre: string;
  tipoAnestesiaKey: string; // Clave usada en anestesia_insumos para obtener insumos
}

export const PROCEDIMIENTOS_CATALOG: ProcedimientoCatalogo[] = [
  {
    clave: "19.01.001",
    nombre: "Anestesia General Balanceada Adulto",
    tipoAnestesiaKey: "general_balanceada_adulto",
  },
  {
    clave: "19.01.002",
    nombre: "Anestesia General de Alta Especialidad",
    tipoAnestesiaKey: "alta_especialidad",
  },
  {
    clave: "19.01.003",
    nombre: "Anestesia General Endovenosa",
    tipoAnestesiaKey: "general_endovenosa",
  },
  {
    clave: "19.01.004",
    nombre: "Anestesia General Balanceada Pediátrica",
    tipoAnestesiaKey: "general_balanceada_pediatrica",
  },
  {
    clave: "19.01.005",
    nombre: "Anestesia Loco Regional",
    tipoAnestesiaKey: "loco_regional",
  },
  {
    clave: "19.01.006",
    nombre: "Sedación",
    tipoAnestesiaKey: "sedacion",
  },
  {
    clave: "19.01.007",
    nombre: "Anestesia de Alta Especialidad en Neurocirugía",
    tipoAnestesiaKey: "alta_especialidad_neurocirugia",
  },
  {
    clave: "19.01.008",
    nombre: "Anestesia de Alta Especialidad en Trasplante Hepático",
    tipoAnestesiaKey: "19.01.008", // Usa la clave directa como está en DB
  },
  {
    clave: "19.01.009",
    nombre: "Anestesia de Alta Especialidad en Trasplante Renal",
    tipoAnestesiaKey: "19.01.009", // Usa la clave directa como está en DB
  },
  {
    clave: "19.01.010",
    nombre: "Cuidados Anestésicos Monitoreados",
    tipoAnestesiaKey: "19.01.010", // Usa la clave directa como está en DB
  },
];

// Mapeo de clave a procedimiento para búsquedas rápidas
export const PROCEDIMIENTOS_BY_CLAVE = new Map(
  PROCEDIMIENTOS_CATALOG.map((p) => [p.clave, p])
);

// Mapeo de tipoAnestesiaKey a procedimiento
export const PROCEDIMIENTOS_BY_TIPO = new Map(
  PROCEDIMIENTOS_CATALOG.map((p) => [p.tipoAnestesiaKey, p])
);

// Obtener el nombre completo con clave
export const getProcedimientoLabel = (clave: string): string => {
  const proc = PROCEDIMIENTOS_BY_CLAVE.get(clave);
  return proc ? `${proc.clave} - ${proc.nombre}` : clave;
};

// Obtener tipoAnestesiaKey desde clave
export const getTipoAnestesiaKey = (clave: string): string => {
  const proc = PROCEDIMIENTOS_BY_CLAVE.get(clave);
  return proc?.tipoAnestesiaKey || clave;
};
