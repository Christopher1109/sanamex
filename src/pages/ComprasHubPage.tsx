import ComprasPage from './ComprasPage';

// Tab "Órdenes de Compra" (tabla ordenes_compra) oculta a propósito —
// el flujo unificado vive en la tabla `compras`. No se borra el módulo,
// solo se oculta del menú para no confundir con dos flujos paralelos.
export default function ComprasHubPage() {
  return <ComprasPage />;
}
