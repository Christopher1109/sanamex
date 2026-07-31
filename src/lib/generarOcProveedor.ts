// Genera el archivo de Orden de Compra para el proveedor usando EXACTAMENTE
// el machote proporcionado (public/plantillas/machote_oc_proveedor.xlsx).
//
// IMPORTANTE (fix jul-2026): antes se usaba SheetJS (xlsx), que al reescribir
// el libro PIERDE todo el formato del machote (fuente Arial 11, negritas,
// relleno verde 92D050 del encabezado, alturas de fila, anchos de columna,
// orientación horizontal y área de impresión). Ahora se usa ExcelJS, que
// carga el archivo original conservando estilos y solo se sobrescriben los
// VALORES de las celdas de captura — el estilo de cada celda se respeta.
//
// OJO — pendiente de confirmar con el cliente: las columnas de REPARTO del
// machote son F37 / F35 / GH / SV / ECA, pero en el sistema la única
// sucursal "F" que existe es F36. Por ahora F36 se manda a la columna F37.

import ExcelJS from 'exceljs';

export type LineaOcProveedor = {
  sku: string;
  nombre: string;
  piezas: number;
  precioConIva: number;
  reparto: Record<string, number>; // { ECA: 10, F36: 5, GH: 0, SV: 20 }
};

const SUCURSAL_A_COLUMNA_REPARTO: Record<string, string> = {
  F37: 'J', F35: 'K', GH: 'L', SV: 'M', ECA: 'N',
  F36: 'J', // ver nota arriba — asunción pendiente de confirmar
};

export type DatosOcProveedor = {
  proveedorNombre: string;
  numeroOC: string;
  condicionesPago: string;
  sucursalDestinoTexto: string;
  folioCotizacion: string;
  lineas: LineaOcProveedor[];
};

const PRIMERA_FILA_DATOS = 10;

export async function generarOcProveedorExcel(params: DatosOcProveedor): Promise<Blob> {
  const resp = await fetch('/plantillas/machote_oc_proveedor.xlsx');
  if (!resp.ok) throw new Error('No se pudo cargar la plantilla de OC (public/plantillas/machote_oc_proveedor.xlsx)');
  const buf = await resp.arrayBuffer();

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const ws = wb.getWorksheet('OC');
  if (!ws) throw new Error('La plantilla no tiene una hoja llamada "OC"');

  // Solo se escribe el valor: ExcelJS conserva el estilo previo de la celda
  // (fuente, negrita, relleno, bordes, formato numérico).
  const setValor = (addr: string, value: string | number) => {
    const cell = ws.getCell(addr);
    cell.value = value;
  };

  setValor('B2', params.proveedorNombre);
  setValor('B3', new Date().toLocaleDateString('es-MX'));
  setValor('B4', params.condicionesPago);
  setValor('B5', params.numeroOC);
  setValor('B6', params.sucursalDestinoTexto);
  setValor('B7', 'COMPRA');
  setValor('B8', params.folioCotizacion || '');

  // Estilo y alto de la primera fila de captura, para clonarlos en las filas
  // extra que haya que agregar cuando la OC trae más renglones que el machote.
  const filaModelo = ws.getRow(PRIMERA_FILA_DATOS);
  const altoModelo = filaModelo.height;

  let row = PRIMERA_FILA_DATOS;
  for (const linea of params.lineas) {
    const fila = ws.getRow(row);
    if (row > PRIMERA_FILA_DATOS && !fila.height && altoModelo) fila.height = altoModelo;

    const escribir = (col: string, value: string | number) => {
      const cell = ws.getCell(`${col}${row}`);
      // Si es una fila nueva (fuera del machote), heredamos el estilo del modelo.
      if (!cell.style || !cell.style.font) {
        cell.style = { ...ws.getCell(`${col}${PRIMERA_FILA_DATOS}`).style };
      }
      cell.value = value;
    };

    escribir('A', linea.sku);
    escribir('B', linea.nombre);
    escribir('C', linea.piezas);
    escribir('E', linea.precioConIva);
    for (const [suc, cant] of Object.entries(linea.reparto)) {
      const col = SUCURSAL_A_COLUMNA_REPARTO[suc];
      if (col && cant > 0) escribir(col, cant);
    }
    fila.commit?.();
    row++;
  }

  const out = await wb.xlsx.writeBuffer();
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function descargarBlob(blob: Blob, nombreArchivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
