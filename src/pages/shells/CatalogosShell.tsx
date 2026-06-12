import TabShell from '@/components/layout/TabShell';
import Productos from '@/pages/Productos';
import ProveedoresPage from '@/pages/ProveedoresPage';
import ClientesPage from '@/pages/ClientesPage';
import ListasPreciosPage from '@/pages/ListasPreciosPage';

const MGMT = ['super_admin','admin','gerente','subgerente'] as any;
const ART = ['super_admin','admin','gerente','subgerente','almacen','almacen_ventas'] as any;
const CLI = [...MGMT, 'ventas'];

export default function CatalogosShell() {
  return (
    <TabShell
      tabs={[
        { id: 'articulos', label: 'Artículos', content: <Productos />, roles: ART },
        { id: 'proveedores', label: 'Proveedores', content: <ProveedoresPage />, roles: MGMT },
        { id: 'clientes', label: 'Clientes', content: <ClientesPage />, roles: CLI },
        { id: 'listas-precios', label: 'Listas de Precios', content: <ListasPreciosPage />, roles: MGMT },
      ]}
      defaultTab="articulos"
    />
  );
}
