import TabShell from '@/components/layout/TabShell';
import InventarioPage from '@/pages/InventarioPage';
import Kardex from '@/pages/Kardex';
import MermasPage from '@/pages/MermasPage';
import CaducidadesPage from '@/pages/CaducidadesPage';
import RentabilidadLotesPage from '@/pages/RentabilidadLotesPage';

const INV = ['super_admin','admin','gerente','subgerente','almacen','almacen_ventas'] as any;
const INV_AUD = [...INV, 'auditoria'];

export default function InventarioShell() {
  return (
    <TabShell
      tabs={[
        { id: 'stock', label: 'Stock', content: <InventarioPage />, roles: INV },
        { id: 'kardex', label: 'Kardex', content: <Kardex />, roles: INV_AUD },
        { id: 'mermas', label: 'Mermas', content: <MermasPage />, roles: INV_AUD },
        { id: 'caducidades', label: 'Caducidades', content: <CaducidadesPage />, roles: INV_AUD },
        { id: 'lotes', label: 'Lotes', content: <RentabilidadLotesPage />, roles: INV },
      ]}
      defaultTab="stock"
    />
  );
}
