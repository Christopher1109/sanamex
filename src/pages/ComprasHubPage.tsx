import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShoppingCart, ClipboardList } from 'lucide-react';
import ComprasPage from './ComprasPage';
import OrdenesCompraPage from './OrdenesCompraPage';

export default function ComprasHubPage() {
  return (
    <Tabs defaultValue="compras" className="space-y-4">
      <TabsList>
        <TabsTrigger value="compras" className="gap-2"><ShoppingCart className="h-4 w-4" /> Compras</TabsTrigger>
        <TabsTrigger value="ordenes" className="gap-2"><ClipboardList className="h-4 w-4" /> Órdenes de Compra</TabsTrigger>
      </TabsList>
      <TabsContent value="compras"><ComprasPage /></TabsContent>
      <TabsContent value="ordenes"><OrdenesCompraPage /></TabsContent>
    </Tabs>
  );
}
