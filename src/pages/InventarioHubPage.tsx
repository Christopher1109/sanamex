import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Warehouse, ClipboardList, AlertTriangle } from 'lucide-react';
import InventarioPage from './InventarioPage';
import Kardex from './Kardex';
import MermasPage from './MermasPage';

export default function InventarioHubPage() {
  return (
    <Tabs defaultValue="inventario" className="space-y-4">
      <TabsList>
        <TabsTrigger value="inventario" className="gap-2"><Warehouse className="h-4 w-4" /> Inventario</TabsTrigger>
        <TabsTrigger value="kardex" className="gap-2"><ClipboardList className="h-4 w-4" /> Kardex</TabsTrigger>
        <TabsTrigger value="mermas" className="gap-2"><AlertTriangle className="h-4 w-4" /> Mermas</TabsTrigger>
      </TabsList>
      <TabsContent value="inventario"><InventarioPage /></TabsContent>
      <TabsContent value="kardex"><Kardex /></TabsContent>
      <TabsContent value="mermas"><MermasPage /></TabsContent>
    </Tabs>
  );
}
