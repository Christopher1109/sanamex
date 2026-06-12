import TabShell from '@/components/layout/TabShell';
import ComprasPage from '@/pages/ComprasPage';
import OrdenesCompraPage from '@/pages/OrdenesCompraPage';

const OPS = ['super_admin','admin','gerente','subgerente','almacen','almacen_ventas'] as any;

export default function ComprasShell() {
  return (
    <TabShell
      tabs={[
        { id: 'facturas', label: 'Facturas', content: <ComprasPage />, roles: OPS },
        { id: 'oc', label: 'Órdenes de Compra', content: <OrdenesCompraPage />, roles: OPS },
      ]}
      defaultTab="facturas"
    />
  );
}
