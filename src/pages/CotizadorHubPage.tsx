import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calculator, Boxes, Store } from 'lucide-react';
import CotizadorPage from './CotizadorPage';
import CatalogosCotizadorPage from './CatalogosCotizadorPage';
import ReposicionSucursal from '@/components/cotizador/ReposicionSucursal';

export default function CotizadorHubPage() {
  return (
    <Tabs defaultValue="cotizador" className="space-y-4">
      <TabsList>
        <TabsTrigger value="cotizador" className="gap-2"><Calculator className="h-4 w-4" /> Cotizador</TabsTrigger>
        <TabsTrigger value="sucursal" className="gap-2"><Store className="h-4 w-4" /> Mi sucursal</TabsTrigger>
        <TabsTrigger value="catalogos" className="gap-2"><Boxes className="h-4 w-4" /> Catálogos</TabsTrigger>
      </TabsList>
      <TabsContent value="cotizador"><CotizadorPage /></TabsContent>
      <TabsContent value="sucursal"><ReposicionSucursal /></TabsContent>
      <TabsContent value="catalogos"><CatalogosCotizadorPage /></TabsContent>
    </Tabs>
  );
}
