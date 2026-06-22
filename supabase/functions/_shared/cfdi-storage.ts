// Helpers to download CFDI XML/PDF from Facturapi and persist them in the private 'cfdi' bucket.
const FACTURAPI_BASE = 'https://www.facturapi.io/v2';

export interface StoredArtifacts {
  xml_storage_path: string | null;
  pdf_storage_path: string | null;
  errors: string[];
}

export async function fetchAndStoreCfdiArtifacts(params: {
  admin: any;
  apiKey: string;
  facturapiId: string;
  rfcEmisor: string;
}): Promise<StoredArtifacts> {
  const { admin, apiKey, facturapiId, rfcEmisor } = params;
  const errors: string[] = [];
  const year = new Date().getFullYear();
  const folder = `${(rfcEmisor || 'SIN_RFC').toUpperCase()}/${year}/${facturapiId}`;
  let xml_storage_path: string | null = null;
  let pdf_storage_path: string | null = null;

  // XML first (legal). If it fails, surface error but DO NOT throw – caller decides.
  try {
    const xmlRes = await fetch(`${FACTURAPI_BASE}/invoices/${facturapiId}/xml`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!xmlRes.ok) {
      errors.push(`XML download HTTP ${xmlRes.status}: ${await xmlRes.text()}`);
    } else {
      const xmlBuf = new Uint8Array(await xmlRes.arrayBuffer());
      const xmlPath = `${folder}.xml`;
      const up = await admin.storage.from('cfdi').upload(xmlPath, xmlBuf, {
        contentType: 'application/xml',
        upsert: true,
      });
      if (up.error) errors.push(`XML upload: ${up.error.message}`);
      else xml_storage_path = xmlPath;
    }
  } catch (e: any) {
    errors.push(`XML exception: ${e?.message || e}`);
  }

  // PDF (best effort)
  try {
    const pdfRes = await fetch(`${FACTURAPI_BASE}/invoices/${facturapiId}/pdf`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!pdfRes.ok) {
      errors.push(`PDF download HTTP ${pdfRes.status}`);
    } else {
      const pdfBuf = new Uint8Array(await pdfRes.arrayBuffer());
      const pdfPath = `${folder}.pdf`;
      const up = await admin.storage.from('cfdi').upload(pdfPath, pdfBuf, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (up.error) errors.push(`PDF upload: ${up.error.message}`);
      else pdf_storage_path = pdfPath;
    }
  } catch (e: any) {
    errors.push(`PDF exception: ${e?.message || e}`);
  }

  return { xml_storage_path, pdf_storage_path, errors };
}
