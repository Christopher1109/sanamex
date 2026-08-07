import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calculator, Boxes, ClipboardList, Tag } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import CotizadorPage from './CotizadorPage';
import CatalogosCotizadorPage from './CatalogosCotizadorPage';
import OrdenesCompraPage from './OrdenesCompraPage';
import PromocionesPage from './PromocionesPage';

// El flujo manual anterior (crear OC eligiendo proveedor a mano, tabla
// `compras`) se retiró — Alejandro pidió que Compras funcione SOLO a partir
// del Cotizador. ComprasPage.tsx (el viejo flujo) se deja sin usar en el
// repo por si se necesita rescatar algo, pero ya no se enruta aquí.
// Sesión 21-jul-2026.
//
// Sesión 29-jul-2026: gerente/subgerente ya NO deben ver el Cotizador ni
// Catálogos (son vista y generación de compra a nivel cadena completa,
// no de su sucursal). Solo entran a Órdenes de Compra, donde además
// ahora la base de datos los limita a las OC de su(s) propia(s)
// sucursal(es) (RLS por sucursal_destino_id vía user_sucursal_asignacion).
const ROLES_SOLO_ORDENES = ['gerente', 'subgerente', 'almacen_ventas', 'almacen'];

export default function ComprasHubPage() {
  const { userRole } = useAuth();
  const soloOrdenes = !!userRole && ROLES_SOLO_ORDENES.includes(userRole);

  if (soloOrdenes) {
    return <OrdenesCompraPage />;
  }

  return (
    <Tabs defaultValue="cotizador" className="space-y-4">
      <TabsList>
        <TabsTrigger value="cotizador" className="gap-2"><Calculator className="h-4 w-4" /> Cotizador</TabsTrigger>
        <TabsTrigger value="catalogos" className="gap-2"><Boxes className="h-4 w-4" /> Catálogos</TabsTrigger>
        <TabsTrigger value="ordenes" className="gap-2"><ClipboardList className="h-4 w-4" /> Órdenes de Compra</TabsTrigger>
        <TabsTrigger value="promociones" className="gap-2"><Tag className="h-4 w-4" /> Promociones</TabsTrigger>
      </TabsList>
      <TabsContent value="cotizador"><CotizadorPage /></TabsContent>
      <TabsContent value="catalogos"><CatalogosCotizadorPage /></TabsContent>
      <TabsContent value="ordenes"><OrdenesCompraPage /></TabsContent>
      <TabsContent value="promociones"><PromocionesPage /></TabsContent>
    </Tabs>
  );
}
