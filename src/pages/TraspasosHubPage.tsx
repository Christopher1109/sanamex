import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeftRight } from 'lucide-react';
import TraspasosPage from './TraspasosPage';
import StubPage from './StubPage';

export default function TraspasosHubPage() {
  return (
    <Tabs defaultValue="traspasos" className="space-y-4">
      <TabsList>
        <TabsTrigger value="traspasos" className="gap-2"><ArrowLeftRight className="h-4 w-4" /> Traspasos</TabsTrigger>
        <TabsTrigger value="salida">Consulta Salida</TabsTrigger>
        <TabsTrigger value="entrada">Consulta Entrada</TabsTrigger>
      </TabsList>
      <TabsContent value="traspasos"><TraspasosPage /></TabsContent>
      <TabsContent value="salida">
        <StubPage title="Traspasos de Salida" description="Consulta histórica de traspasos donde la sucursal activa es el origen." />
      </TabsContent>
      <TabsContent value="entrada">
        <StubPage title="Traspasos de Entrada" description="Consulta histórica de traspasos donde la sucursal activa es el destino." />
      </TabsContent>
    </Tabs>
  );
}
