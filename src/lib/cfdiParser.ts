// Parser ligero de CFDI 4.0 (también compatible con 3.3) en el cliente.
// Extrae datos del emisor, factura y conceptos.

export interface CfdiConcepto {
  clave: string;           // NoIdentificacion (lo usaremos para match contra codigo_barras/sku)
  claveProdServ?: string;  // ClaveProdServ (catálogo SAT, opcional)
  descripcion: string;
  cantidad: number;
  unidad?: string;
  valorUnitario: number;
  importe: number;
}

export interface CfdiParsed {
  uuid?: string;
  folio?: string;
  serie?: string;
  fecha?: string;          // ISO date YYYY-MM-DD
  rfcEmisor?: string;
  nombreEmisor?: string;
  rfcReceptor?: string;
  metodoPago?: string;     // PUE / PPD
  formaPago?: string;
  subTotal: number;
  total: number;
  conceptos: CfdiConcepto[];
}

const num = (v: string | null | undefined, def = 0) => {
  if (v == null || v === '') return def;
  const n = parseFloat(v);
  return isNaN(n) ? def : n;
};

export function parseCfdiXml(xmlText: string): CfdiParsed {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const parseErr = doc.getElementsByTagName('parsererror')[0];
  if (parseErr) throw new Error('XML inválido o malformado');

  // getElementsByTagNameNS no funciona si el documento no tiene namespaces declarados de forma estándar,
  // así que buscamos por nombre local con un helper.
  const findFirst = (localName: string): Element | null => {
    const all = doc.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      if (all[i].localName === localName) return all[i] as Element;
    }
    return null;
  };
  const findAll = (localName: string): Element[] => {
    const out: Element[] = [];
    const all = doc.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      if (all[i].localName === localName) out.push(all[i] as Element);
    }
    return out;
  };

  const comprobante = findFirst('Comprobante');
  if (!comprobante) throw new Error('No es un CFDI: falta nodo Comprobante');

  const emisor = findFirst('Emisor');
  const receptor = findFirst('Receptor');
  const timbre = findFirst('TimbreFiscalDigital');

  const fechaRaw = comprobante.getAttribute('Fecha') || '';
  const fecha = fechaRaw ? fechaRaw.slice(0, 10) : undefined;

  const conceptos: CfdiConcepto[] = findAll('Concepto').map((c) => ({
    clave: (c.getAttribute('NoIdentificacion') || '').trim(),
    claveProdServ: c.getAttribute('ClaveProdServ') || undefined,
    descripcion: c.getAttribute('Descripcion') || '',
    cantidad: num(c.getAttribute('Cantidad'), 0),
    unidad: c.getAttribute('Unidad') || c.getAttribute('ClaveUnidad') || undefined,
    valorUnitario: num(c.getAttribute('ValorUnitario'), 0),
    importe: num(c.getAttribute('Importe'), 0),
  }));

  return {
    uuid: timbre?.getAttribute('UUID') || undefined,
    folio: comprobante.getAttribute('Folio') || undefined,
    serie: comprobante.getAttribute('Serie') || undefined,
    fecha,
    rfcEmisor: emisor?.getAttribute('Rfc') || undefined,
    nombreEmisor: emisor?.getAttribute('Nombre') || undefined,
    rfcReceptor: receptor?.getAttribute('Rfc') || undefined,
    metodoPago: comprobante.getAttribute('MetodoPago') || undefined,
    formaPago: comprobante.getAttribute('FormaPago') || undefined,
    subTotal: num(comprobante.getAttribute('SubTotal'), 0),
    total: num(comprobante.getAttribute('Total'), 0),
    conceptos,
  };
}
