// Simplificado: antes tenía pestañas "Consulta Salida" / "Consulta Entrada"
// que eran solo stubs sin funcionalidad real. Alejandro pidió quitarlas —
// ese filtrado ahora vive dentro de TraspasosPage (pestaña "Bandeja
// entrante", con filtro de dirección). Sesión 22-jul-2026.
import TraspasosPage from './TraspasosPage';

export default function TraspasosHubPage() {
  return <TraspasosPage />;
}
