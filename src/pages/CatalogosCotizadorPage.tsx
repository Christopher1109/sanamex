import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Boxes } from 'lucide-react';
import ProveedoresUploader from '@/components/cargas/ProveedoresUploader';
import CorrugadoUploader from '@/components/cargas/CorrugadoUploader';
import EstatusSucursalUploader from '@/components/cargas/EstatusSucursalUploader';
import OfertasUploader from '@/components/cargas/OfertasUploader';
import CotizadorConfigPanel from '@/components/cargas/CotizadorConfigPanel';

export default function CatalogosCotizadorPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Boxes className="h-6 w-6" />Catálogos del Cotizador</h1>
        <p className="text-muted-foreground">Carga masiva de proveedores, piezas por corrugado, estatus por sucursal y ofertas vigentes.</p>
      </div>

      <Tabs defaultValue="proveedores">
        <TabsList>
          <TabsTrigger value="proveedores">Proveedores</TabsTrigger>
          <TabsTrigger value="corrugado">Corrugado</TabsTrigger>
          <TabsTrigger value="estatus">Estatus por sucursal</TabsTrigger>
          <TabsTrigger value="ofertas">Ofertas vigentes</TabsTrigger>
          <TabsTrigger value="config">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="proveedores">
          <Card>
            <CardHeader><CardTitle className="text-base">Cargar proveedores desde Excel</CardTitle></CardHeader>
            <CardContent><ProveedoresUploader /></CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="corrugado">
          <Card>
            <CardHeader><CardTitle className="text-base">Cargar piezas por corrugado</CardTitle></CardHeader>
            <CardContent><CorrugadoUploader /></CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="estatus">
          <Card>
            <CardHeader><CardTitle className="text-base">Cargar estatus de SKU por sucursal</CardTitle></CardHeader>
            <CardContent><EstatusSucursalUploader /></CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ofertas">
          <Card>
            <CardHeader><CardTitle className="text-base">Cargar ofertas vigentes</CardTitle></CardHeader>
            <CardContent><OfertasUploader /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
