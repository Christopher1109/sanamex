// Generador GANCHO de XML SAT (Catálogo de cuentas y Balanza).
// Estructura compatible con Anexo 24; validación final llega después.
export function generarCatalogoXml(cuentas: any[], rfc: string, anio: number, mes: number) {
  const filas = cuentas.map(c =>
    `<catalogocuentas:Ctas CodAgrup="${c.codigo_agrupador_sat || c.codigo}" NumCta="${c.codigo}" Desc="${escapeXml(c.nombre)}" Nivel="${c.nivel}" Natur="${c.naturaleza === 'deudora' ? 'D' : 'A'}"/>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<catalogocuentas:Catalogo xmlns:catalogocuentas="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas" Version="1.3" RFC="${rfc}" Mes="${String(mes).padStart(2,'0')}" Anio="${anio}">
${filas}
</catalogocuentas:Catalogo>`;
}

export function generarBalanzaXml(balanza: any[], rfc: string, anio: number, mes: number, tipoEnvio = 'N') {
  const filas = balanza.map(b =>
    `<BCE:Ctas NumCta="${b.codigo}" SaldoIni="0" Debe="${(b.cargos||0).toFixed(2)}" Haber="${(b.abonos||0).toFixed(2)}" SaldoFin="${(b.saldo||0).toFixed(2)}"/>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<BCE:Balanza xmlns:BCE="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion" Version="1.3" RFC="${rfc}" Mes="${String(mes).padStart(2,'0')}" Anio="${anio}" TipoEnvio="${tipoEnvio}">
${filas}
</BCE:Balanza>`;
}

function escapeXml(s: string) {
  return String(s || '').replace(/[<>&"']/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;' }[c]!));
}

export function descargarArchivo(contenido: string, filename: string, mime = 'application/xml') {
  const blob = new Blob([contenido], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
