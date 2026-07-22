import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileSpreadsheet } from 'lucide-react';
import ReporteVentasInventarioSanamex from './ReporteVentasInventarioSanamex';
import ReporteInventarioGeneral from './ReporteInventarioGeneral';
import ReporteVentasPresupuesto from './ReporteVentasPresupuesto';
import ReporteSugeridos from './ReporteSugeridos';

export default function ReportesHubPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileSpreadsheet className="h-6 w-6" /> Reportes</h1>
        <p className="text-muted-foreground">Centro de reportes.</p>
      </div>
      <Tabs defaultValue="sanamex" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="sanamex">Ventas e Inventario SANAMEX</TabsTrigger>
          <TabsTrigger value="inventario-general">Inventario General</TabsTrigger>
          <TabsTrigger value="ventas-presupuesto">Ventas y Presupuesto</TabsTrigger>
          <TabsTrigger value="sugeridos">Sugeridos</TabsTrigger>
        </TabsList>
        <TabsContent value="sanamex"><ReporteVentasInventarioSanamex /></TabsContent>
        <TabsContent value="inventario-general"><ReporteInventarioGeneral /></TabsContent>
        <TabsContent value="ventas-presupuesto"><ReporteVentasPresupuesto /></TabsContent>
        <TabsContent value="sugeridos"><ReporteSugeridos /></TabsContent>
      </Tabs>
    </div>
  );
}
