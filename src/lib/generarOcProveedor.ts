// Genera el archivo de Orden de Compra para el proveedor usando EXACTAMENTE
// el machote proporcionado (public/plantillas/machote_oc_proveedor.xlsx),
// sin tocar fórmulas, estilos ni las demás hojas (Hoja1 / lay out / MACHOTE).
// Solo se escriben valores en las celdas de captura de la hoja "OC".
//
// OJO — pendiente de confirmar con el cliente: las columnas de REPARTO del
// machote son F37 / F35 / GH / SV / ECA, pero en el sistema la única
// sucursal "F" que existe es F36 — no hay una correspondencia 1 a 1 clara
// entre F36 y F37/F35. Por ahora F36 se manda a la columna F37; hay que
// confirmar cuál es la correcta o si el machote necesita actualizarse.

import * as XLSX from 'xlsx';

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

export async function generarOcProveedorExcel(params: DatosOcProveedor): Promise<Blob> {
  const resp = await fetch('/plantillas/machote_oc_proveedor.xlsx');
  if (!resp.ok) throw new Error('No se pudo cargar la plantilla de OC (public/plantillas/machote_oc_proveedor.xlsx)');
  const buf = await resp.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets['OC'];
  if (!ws) throw new Error('La plantilla no tiene una hoja llamada "OC"');

  const setCell = (addr: string, value: string | number) => {
    const existing = ws[addr];
    const t: XLSX.ExcelDataType = typeof value === 'number' ? 'n' : 's';
    if (existing) {
      existing.v = value;
      existing.t = t;
      delete existing.f; // por si la celda destino tenía fórmula, la volvemos valor fijo
    } else {
      ws[addr] = { t, v: value };
    }
  };

  setCell('B2', params.proveedorNombre);
  setCell('B3', new Date().toLocaleDateString('es-MX'));
  setCell('B4', params.condicionesPago);
  setCell('B5', params.numeroOC);
  setCell('B6', params.sucursalDestinoTexto);
  setCell('B7', 'COMPRA');
  setCell('B8', params.folioCotizacion || '');

  let row = 10;
  for (const linea of params.lineas) {
    setCell(`A${row}`, linea.sku);
    setCell(`B${row}`, linea.nombre);
    setCell(`C${row}`, linea.piezas);
    setCell(`E${row}`, linea.precioConIva);
    for (const [suc, cant] of Object.entries(linea.reparto)) {
      const col = SUCURSAL_A_COLUMNA_REPARTO[suc];
      if (col && cant > 0) setCell(`${col}${row}`, cant);
    }
    row++;
  }

  const rangeRef = ws['!ref'] || 'A1:U77';
  const range = XLSX.utils.decode_range(rangeRef);
  if (row - 1 > range.e.r) {
    range.e.r = row - 1;
    ws['!ref'] = XLSX.utils.encode_range(range);
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
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
