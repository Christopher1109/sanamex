import TabShell from '@/components/layout/TabShell';
import PedidosPage from '@/pages/PedidosPage';
import VentasHistorial from '@/pages/VentasHistorial';

const SALES = ['super_admin','admin','gerente','subgerente','ventas','almacen_ventas'] as any;

export default function VentasShell() {
  return (
    <TabShell
      tabs={[
        { id: 'pedidos', label: 'Pedidos', content: <PedidosPage />, roles: SALES },
        { id: 'historial', label: 'Historial', content: <VentasHistorial />, roles: SALES },
      ]}
      defaultTab="pedidos"
    />
  );
}
