import * as XLSX from 'xlsx';

// Interface para Anexo T29 - Formato IMSS exacto
interface T29Record {
  noPartida: number;
  ooadUmae: string;
  tipoUnidadMedica: string;
  numUnidadMedica: string;
  localidad: string;
  clavePresupuestal: string;
  nombrePaciente: string;
  primerApellidoPaciente: string;
  segundoApellidoPaciente: string;
  fechaNacimiento: string;
  nss: string;
  agregadoMedico: string;
  sexo: string;
  nombreMedicoTratante: string;
  primerApellidoMedico: string;
  segundoApellidoMedico: string;
  claveProcedimiento: string;
  tipoProcedimiento: string;
  folioServicio: string;
  precioUnitario: string;
  fechaProcedimiento: string;
}

interface T30Record {
  fecha: string;
  folio: string;
  nombreInsumo: string;
  lote: string;
  cantidad: number;
  unidad: string;
  origen: string;
  anestesiologo: string;
}

/**
 * Interpreta un nombre completo y lo separa en nombre(s), apellido paterno y apellido materno.
 * Asume formato: "Nombre(s) ApellidoPaterno ApellidoMaterno"
 * Si hay 2 palabras: primera es nombre, segunda apellido paterno
 * Si hay 3 palabras: primera nombre, segunda paterno, tercera materno
 * Si hay 4+ palabras: primeras son nombres, últimas dos son apellidos
 */
const parsearNombreCompleto = (nombreCompleto: string): { nombre: string; apellidoPaterno: string; apellidoMaterno: string } => {
  if (!nombreCompleto || nombreCompleto.trim() === '') {
    return { nombre: '', apellidoPaterno: '', apellidoMaterno: '' };
  }

  const partes = nombreCompleto.trim().split(/\s+/);
  
  if (partes.length === 1) {
    return { nombre: partes[0], apellidoPaterno: '', apellidoMaterno: '' };
  }
  
  if (partes.length === 2) {
    return { nombre: partes[0], apellidoPaterno: partes[1], apellidoMaterno: '' };
  }
  
  if (partes.length === 3) {
    return { nombre: partes[0], apellidoPaterno: partes[1], apellidoMaterno: partes[2] };
  }
  
  // 4+ palabras: últimas dos son apellidos, resto es nombre
  const apellidoMaterno = partes.pop() || '';
  const apellidoPaterno = partes.pop() || '';
  const nombre = partes.join(' ');
  
  return { nombre, apellidoPaterno, apellidoMaterno };
};

/**
 * Formatea fecha al formato dd/mm/aaaa requerido por IMSS
 */
const formatearFechaIMSS = (fecha: string | null): string => {
  if (!fecha) return '';
  try {
    const date = new Date(fecha);
    if (isNaN(date.getTime())) return '';
    const dia = date.getDate().toString().padStart(2, '0');
    const mes = (date.getMonth() + 1).toString().padStart(2, '0');
    const anio = date.getFullYear();
    return `${dia}/${mes}/${anio}`;
  } catch {
    return '';
  }
};

/**
 * Obtiene el label del tipo de anestesia
 */
const getTipoAnestesiaLabel = (tipo: string): string => {
  const labels: Record<string, string> = {
    'general_balanceada_adulto': 'Anestesia General Balanceada Adulto',
    'general_balanceada_pediatrica': 'Anestesia General Balanceada Pediátrica',
    'general_alta_especialidad': 'Anestesia General Alta Especialidad',
    'alta_especialidad': 'Anestesia de Alta Especialidad',
    'general_endovenosa': 'Anestesia General Endovenosa',
    'locorregional': 'Anestesia Loco Regional',
    'sedacion': 'Sedación',
    '19.01.001': 'Anestesia General Balanceada Adulto',
    '19.01.002': 'Anestesia General de Alta Especialidad',
    '19.01.003': 'Anestesia General Endovenosa',
    '19.01.004': 'Anestesia General Balanceada Pediátrica',
    '19.01.005': 'Anestesia Loco Regional',
    '19.01.006': 'Sedación',
    '19.01.007': 'Anestesia de Alta Especialidad en Neurocirugía',
    '19.01.008': 'Anestesia de Alta Especialidad en Trasplante Hepático',
    '19.01.009': 'Anestesia de Alta Especialidad en Trasplante Renal',
  };
  return labels[tipo] || tipo;
};

/**
 * Obtiene la clave del procedimiento
 */
const getClaveProcedimiento = (tipo: string): string => {
  // Si ya es una clave con formato XX.XX.XXX, usarla directamente
  if (/^\d{2}\.\d{2}\.\d{3}$/.test(tipo)) {
    return tipo;
  }
  
  // Mapear tipos legacy a claves
  const claveMap: Record<string, string> = {
    'general_balanceada_adulto': '19.01.001',
    'alta_especialidad': '19.01.002',
    'general_alta_especialidad': '19.01.002',
    'general_endovenosa': '19.01.003',
    'general_balanceada_pediatrica': '19.01.004',
    'locorregional': '19.01.005',
    'sedacion': '19.01.006',
  };
  
  return claveMap[tipo] || '';
};

export const generateAnexoT29 = (
  folios: any[],
  fechaInicio: string,
  fechaFin: string,
  hospitalInfo?: { 
    state_name?: string; 
    hospital_type?: string; 
    clinic_number?: string; 
    locality?: string; 
    budget_code?: string;
    display_name?: string;
  }
) => {
  const data: T29Record[] = folios.map((folio, index) => {
    // Parsear nombre del médico tratante (cirujano)
    const medicoTratante = parsearNombreCompleto(folio.cirujano_nombre || '');
    
    return {
      noPartida: index + 1,
      ooadUmae: folio.state_name || hospitalInfo?.state_name || '',
      tipoUnidadMedica: hospitalInfo?.hospital_type || '',
      numUnidadMedica: hospitalInfo?.clinic_number || '',
      localidad: hospitalInfo?.locality || '',
      clavePresupuestal: folio.hospital_budget_code || hospitalInfo?.budget_code || '',
      nombrePaciente: folio.paciente_nombre || '',
      primerApellidoPaciente: folio.paciente_apellido_paterno || '',
      segundoApellidoPaciente: folio.paciente_apellido_materno || '',
      fechaNacimiento: formatearFechaIMSS(folio.paciente_fecha_nacimiento),
      nss: folio.paciente_nss || '',
      agregadoMedico: '', // Por ahora vacío según instrucciones
      sexo: folio.paciente_genero || '',
      nombreMedicoTratante: medicoTratante.nombre,
      primerApellidoMedico: medicoTratante.apellidoPaterno,
      segundoApellidoMedico: medicoTratante.apellidoMaterno,
      claveProcedimiento: getClaveProcedimiento(folio.tipo_anestesia || folio.anestesia_principal || ''),
      tipoProcedimiento: getTipoAnestesiaLabel(folio.tipo_anestesia || folio.anestesia_principal || ''),
      folioServicio: folio.numero_folio || '',
      precioUnitario: '', // Por ahora vacío según instrucciones
      fechaProcedimiento: formatearFechaIMSS(folio.fecha),
    };
  });

  // Crear hoja con encabezados exactos del formato IMSS
  const headers = [
    'No. de Partida',
    'OOAD O UMAE',
    'Tipo de Unidad Médica',
    'Núm. de Unidad Médica',
    'Localidad',
    'Clave Presupuestal de la Unidad Médica (Anexo T1 detallado)',
    'Nombre(s) del paciente sin abreviaturas',
    'Primer Apellido Paciente sin abreviaturas',
    'Segundo Apellido Paciente sin abreviaturas',
    'Fecha de Nacimiento del Paciente (dd/mm/aaaa)',
    'NSS (a diez dígitos o posiciones)',
    'Agregado Médico (a ocho dígitos o posiciones)',
    'Sexo del Paciente (F/M)',
    'Nombre(s) Médico Tratante sin abreviaturas',
    'Primer Apellido Médico Tratante sin abreviaturas',
    'Segundo Apellido Médico Tratante sin abreviaturas',
    'Clave del Servicio Médico Integral del Procedimiento',
    'Tipo de procedimiento realizado',
    'Folio Servicio (otorgado por el licitante adjudicado)',
    'Precio Unitario del Procedimiento sin IVA',
    'Fecha de Procedimiento (dd/mm/aaaa)',
  ];

  // Convertir datos a array de arrays para mantener orden exacto de columnas
  const rows = data.map(record => [
    record.noPartida,
    record.ooadUmae,
    record.tipoUnidadMedica,
    record.numUnidadMedica,
    record.localidad,
    record.clavePresupuestal,
    record.nombrePaciente,
    record.primerApellidoPaciente,
    record.segundoApellidoPaciente,
    record.fechaNacimiento,
    record.nss,
    record.agregadoMedico,
    record.sexo,
    record.nombreMedicoTratante,
    record.primerApellidoMedico,
    record.segundoApellidoMedico,
    record.claveProcedimiento,
    record.tipoProcedimiento,
    record.folioServicio,
    record.precioUnitario,
    record.fechaProcedimiento,
  ]);

  // Crear worksheet con título y encabezados
  const titleRow = ['Anexo 29. Control de productividad del licitante adjudicado por Unidad Médica del Servicio Médico Integral para Anestesia.'];
  const emptyRow: string[] = [];
  const infoRows = [
    ['', 'Licitante Adjudicado', '', '', '', '', 'Año del informe', fechaInicio.split('-')[0] || ''],
    ['', 'Núm. de Contrato', '', '', '', '', 'Mes del informe', ''],
    ['', 'Instrucciones:', 'El llenado debe ser registrando el dato requerido en la celda, evitando abreviaturas, así mismo evitar combinar celdas.'],
  ];

  const allRows = [
    titleRow,
    emptyRow,
    ...infoRows,
    emptyRow,
    headers,
    ...rows
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(allRows);

  // Configurar anchos de columna
  worksheet['!cols'] = [
    { wch: 12 },  // No. de Partida
    { wch: 18 },  // OOAD O UMAE
    { wch: 18 },  // Tipo de Unidad Médica
    { wch: 18 },  // Núm. de Unidad Médica
    { wch: 15 },  // Localidad
    { wch: 25 },  // Clave Presupuestal
    { wch: 25 },  // Nombre(s) paciente
    { wch: 22 },  // Primer Apellido Paciente
    { wch: 22 },  // Segundo Apellido Paciente
    { wch: 18 },  // Fecha Nacimiento
    { wch: 15 },  // NSS
    { wch: 18 },  // Agregado Médico
    { wch: 10 },  // Sexo
    { wch: 25 },  // Nombre(s) Médico
    { wch: 22 },  // Primer Apellido Médico
    { wch: 22 },  // Segundo Apellido Médico
    { wch: 18 },  // Clave Procedimiento
    { wch: 35 },  // Tipo de procedimiento
    { wch: 20 },  // Folio Servicio
    { wch: 18 },  // Precio Unitario
    { wch: 18 },  // Fecha Procedimiento
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Anexo T29');

  // Agregar hoja de información
  const infoSheet = XLSX.utils.aoa_to_sheet([
    ['ANEXO T29 - CONTROL DE PRODUCTIVIDAD'],
    [''],
    ['Hospital:', hospitalInfo?.display_name || ''],
    ['Fecha de inicio:', fechaInicio],
    ['Fecha de fin:', fechaFin],
    ['Total de registros:', data.length.toString()],
    ['Fecha de generación:', new Date().toLocaleDateString('es-MX')],
  ]);
  XLSX.utils.book_append_sheet(workbook, infoSheet, 'Información');

  const fileName = `Anexo_T29_${fechaInicio}_${fechaFin}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

export const generateAnexoT30 = (
  folios: any[],
  fechaInicio: string,
  fechaFin: string
) => {
  const data: T30Record[] = [];

  folios.forEach(folio => {
    // Usar folios_insumos si existe
    const insumos = folio.folios_insumos || folio.insumosUtilizados || [];
    
    insumos.forEach((insumo: any) => {
      data.push({
        fecha: folio.fecha || '',
        folio: folio.numero_folio || '',
        nombreInsumo: insumo.insumos_catalogo?.nombre || insumo.nombre || 'Sin nombre',
        lote: insumo.lote || 'N/A',
        cantidad: insumo.cantidad || 0,
        unidad: folio.unidad || folio.hospital_display_name || '',
        origen: 'LOAD',
        anestesiologo: folio.anestesiologo_nombre || '',
      });
    });
  });

  const worksheet = XLSX.utils.json_to_sheet(data, {
    header: [
      'fecha',
      'folio',
      'nombreInsumo',
      'lote',
      'cantidad',
      'unidad',
      'origen',
      'anestesiologo',
    ],
  });

  // Configurar anchos de columna
  worksheet['!cols'] = [
    { wch: 12 }, // fecha
    { wch: 15 }, // folio
    { wch: 30 }, // nombreInsumo
    { wch: 18 }, // lote
    { wch: 10 }, // cantidad
    { wch: 15 }, // unidad
    { wch: 12 }, // origen
    { wch: 30 }, // anestesiologo
  ];

  // Renombrar encabezados
  const headerMapping: Record<string, string> = {
    fecha: 'Fecha',
    folio: 'Folio',
    nombreInsumo: 'Nombre del Insumo',
    lote: 'Lote',
    cantidad: 'Cantidad',
    unidad: 'Unidad',
    origen: 'Origen',
    anestesiologo: 'Anestesiólogo',
  };

  Object.keys(headerMapping).forEach((key, index) => {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: index });
    if (worksheet[cellAddress]) {
      worksheet[cellAddress].v = headerMapping[key];
    }
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Anexo T30');

  // Agregar información del periodo
  const infoSheet = XLSX.utils.aoa_to_sheet([
    ['ANEXO T30 - LISTADO DE INSUMOS UTILIZADOS'],
    [''],
    ['Fecha de inicio:', fechaInicio],
    ['Fecha de fin:', fechaFin],
    ['Total de registros:', data.length.toString()],
    ['Fecha de generación:', new Date().toLocaleDateString('es-MX')],
  ]);
  XLSX.utils.book_append_sheet(workbook, infoSheet, 'Información');

  const fileName = `Anexo_T30_${fechaInicio}_${fechaFin}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};
