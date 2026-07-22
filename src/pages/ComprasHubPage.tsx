import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calculator, Boxes, ClipboardList } from 'lucide-react';
import CotizadorPage from './CotizadorPage';
import CatalogosCotizadorPage from './CatalogosCotizadorPage';
import OrdenesCompraPage from './OrdenesCompraPage';

// El flujo manual anterior (crear OC eligiendo proveedor a mano, tabla
// `compras`) se retiró — Alejandro pidió que Compras funcione SOLO a partir
// del Cotizador. ComprasPage.tsx (el viejo flujo) se deja sin usar en el
// repo por si se necesita rescatar algo, pero ya no se enruta aquí.
// Sesión 21-jul-2026.
export default function ComprasHubPage() {
  return (
    <Tabs defaultValue="cotizador" className="space-y-4">
      <TabsList>
        <TabsTrigger value="cotizador" className="gap-2"><Calculator className="h-4 w-4" /> Cotizador</TabsTrigger>
        <TabsTrigger value="catalogos" className="gap-2"><Boxes className="h-4 w-4" /> Catálogos</TabsTrigger>
        <TabsTrigger value="ordenes" className="gap-2"><ClipboardList className="h-4 w-4" /> Órdenes de Compra</TabsTrigger>
      </TabsList>
      <TabsContent value="cotizador"><CotizadorPage /></TabsContent>
      <TabsContent value="catalogos"><CatalogosCotizadorPage /></TabsContent>
      <TabsContent value="ordenes"><OrdenesCompraPage /></TabsContent>
    </Tabs>
  );
}
