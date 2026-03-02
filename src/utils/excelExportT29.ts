import ExcelJS from 'exceljs';

/**
 * Interpreta un nombre completo y lo separa en nombre(s), apellido paterno y apellido materno.
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
  
  const apellidoMaterno = partes.pop() || '';
  const apellidoPaterno = partes.pop() || '';
  const nombre = partes.join(' ');
  
  return { nombre, apellidoPaterno, apellidoMaterno };
};

/**
 * Formatea fecha al formato dd/mm/aaaa
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
    'general_alta_especialidad': 'Anestesia General de Alta Especialidad',
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
  if (!tipo) return '';
  
  // Si ya es una clave con formato XX.XX.XXX, usarla directamente
  if (/^\d{2}\.\d{2}\.\d{3}$/.test(tipo)) {
    return tipo;
  }
  
  const claveMap: Record<string, string> = {
    'general_balanceada_adulto': '19.01.001',
    'alta_especialidad': '19.01.002',
    'general_alta_especialidad': '19.01.002',
    'general_endovenosa': '19.01.003',
    'general_balanceada_pediatrica': '19.01.004',
    'locorregional': '19.01.005',
    'sedacion': '19.01.006',
  };
  
  return claveMap[tipo] || tipo;
};

export const generateAnexoT29Excel = async (
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
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistema CB Médica';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Anexo T29', {
    views: [{ state: 'frozen', ySplit: 7 }]
  });

  // Definir anchos de columna exactos
  worksheet.columns = [
    { key: 'A', width: 12 },   // No. de Partida
    { key: 'B', width: 18 },   // OOAD O UMAE
    { key: 'C', width: 15 },   // Tipo de Unidad Médica
    { key: 'D', width: 18 },   // Núm. de Unidad Médica
    { key: 'E', width: 12 },   // Localidad
    { key: 'F', width: 22 },   // Clave Presupuestal
    { key: 'G', width: 25 },   // Nombre(s) paciente
    { key: 'H', width: 22 },   // Primer Apellido Paciente
    { key: 'I', width: 22 },   // Segundo Apellido Paciente
    { key: 'J', width: 18 },   // Fecha Nacimiento
    { key: 'K', width: 18 },   // NSS
    { key: 'L', width: 18 },   // Agregado Médico
    { key: 'M', width: 10 },   // Sexo
    { key: 'N', width: 25 },   // Nombre(s) Médico
    { key: 'O', width: 22 },   // Primer Apellido Médico
    { key: 'P', width: 22 },   // Segundo Apellido Médico
    { key: 'Q', width: 18 },   // Clave Procedimiento
    { key: 'R', width: 35 },   // Tipo de procedimiento
    { key: 'S', width: 20 },   // Folio Servicio
    { key: 'T', width: 18 },   // Precio Unitario
    { key: 'U', width: 18 },   // Fecha Procedimiento
  ];

  // Estilo del título principal (fila 1)
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'Anexo 29. Control de productividad del licitante adjudicado por Unidad Médica del Servicio Médico Integral para Anestesia.';
  worksheet.mergeCells('A1:U1');
  titleCell.font = { name: 'Arial', size: 11, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF8DB4E2' } // Azul claro IMSS
  };
  titleCell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };
  worksheet.getRow(1).height = 30;

  // Fila 2 - vacía
  worksheet.getRow(2).height = 8;

  // Fila 3 - Licitante Adjudicado y Año del informe
  worksheet.getCell('B3').value = 'Licitante Adjudicado';
  worksheet.getCell('B3').font = { name: 'Arial', size: 10, bold: true };
  worksheet.getCell('C3').value = 'CB MÉDICA';
  worksheet.getCell('C3').font = { name: 'Arial', size: 10 };
  worksheet.getCell('G3').value = 'Año del informe';
  worksheet.getCell('G3').font = { name: 'Arial', size: 10, bold: true };
  worksheet.getCell('H3').value = fechaInicio.split('-')[0] || '';
  worksheet.getCell('H3').font = { name: 'Arial', size: 10 };

  // Fila 4 - Núm. de Contrato y Mes del informe
  worksheet.getCell('B4').value = 'Núm. de Contrato';
  worksheet.getCell('B4').font = { name: 'Arial', size: 10, bold: true };
  worksheet.getCell('C4').value = '';
  worksheet.getCell('G4').value = 'Mes del informe';
  worksheet.getCell('G4').font = { name: 'Arial', size: 10, bold: true };
  
  // Obtener nombre del mes
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const mesNum = parseInt(fechaInicio.split('-')[1]) - 1;
  worksheet.getCell('H4').value = meses[mesNum] || '';
  worksheet.getCell('H4').font = { name: 'Arial', size: 10 };

  // Fila 5 - Instrucciones
  worksheet.getCell('B5').value = 'Instrucciones:';
  worksheet.getCell('B5').font = { name: 'Arial', size: 9, bold: true };
  worksheet.getCell('C5').value = 'El llenado debe ser registrando el dato requerido en la celda, evitando abreviaturas, así mismo evitar combinar celdas.';
  worksheet.mergeCells('C5:U5');
  worksheet.getCell('C5').font = { name: 'Arial', size: 9, italic: true };
  worksheet.getCell('C5').alignment = { wrapText: true };

  // Fila 6 - vacía
  worksheet.getRow(6).height = 8;

  // Fila 7 - Encabezados de columnas
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

  const headerRow = worksheet.getRow(7);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { name: 'Arial', size: 9, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' } // Azul muy claro
    };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });
  headerRow.height = 45;

  // Datos
  folios.forEach((folio, index) => {
    const rowNum = index + 8;
    const row = worksheet.getRow(rowNum);
    
    const medicoTratante = parsearNombreCompleto(folio.cirujano_nombre || '');
    const tipoAnestesia = folio.tipo_anestesia || folio.anestesia_principal || '';
    
    const rowData = [
      index + 1,
      folio.state_name || hospitalInfo?.state_name || '',
      hospitalInfo?.hospital_type || '',
      hospitalInfo?.clinic_number || '',
      hospitalInfo?.locality || '',
      folio.hospital_budget_code || hospitalInfo?.budget_code || '',
      folio.paciente_nombre || '',
      folio.paciente_apellido_paterno || '',
      folio.paciente_apellido_materno || '',
      formatearFechaIMSS(folio.paciente_fecha_nacimiento),
      folio.paciente_nss || '',
      '', // Agregado Médico - vacío por ahora
      folio.paciente_genero || '',
      medicoTratante.nombre,
      medicoTratante.apellidoPaterno,
      medicoTratante.apellidoMaterno,
      getClaveProcedimiento(tipoAnestesia),
      getTipoAnestesiaLabel(tipoAnestesia),
      folio.numero_folio || '',
      '', // Precio Unitario - vacío por ahora
      formatearFechaIMSS(folio.fecha),
    ];

    rowData.forEach((value, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      cell.value = value;
      cell.font = { name: 'Arial', size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Alternar color de fondo para mejor legibilidad
    if (index % 2 === 1) {
      rowData.forEach((_, colIndex) => {
        row.getCell(colIndex + 1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' } // Gris muy claro
        };
      });
    }
  });

  // Fila de ejemplo si está vacío
  if (folios.length === 0) {
    const exampleRow = worksheet.getRow(8);
    const exampleData = [
      'Ejemplo 1',
      'Baja California',
      'HGPMF',
      '31',
      'Mexicali',
      '020115182151',
      'Juan José',
      'XX',
      'XX',
      '03/08/2000',
      '6687730122',
      '1M2000OR',
      'M',
      'Lorena',
      'xx',
      'xx',
      '19.01.001',
      'Anestesia General Balanceada Adulto',
      '150305',
      '$1,000.00',
      '03/07/2023',
    ];

    exampleData.forEach((value, colIndex) => {
      const cell = exampleRow.getCell(colIndex + 1);
      cell.value = value;
      cell.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF808080' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  }

  // Generar y descargar
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Anexo_T29_${fechaInicio}_${fechaFin}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
};
