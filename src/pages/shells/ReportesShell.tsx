import TabShell from '@/components/layout/TabShell';
import ReporteVentasInventarioSanamex from '@/pages/ReporteVentasInventarioSanamex';
import ReporteInventarioGeneral from '@/pages/ReporteInventarioGeneral';
import ReporteVentasPresupuesto from '@/pages/ReporteVentasPresupuesto';
import ReporteSugeridos from '@/pages/ReporteSugeridos';
import RotacionPage from '@/pages/RotacionPage';
import RentabilidadLotesPage from '@/pages/RentabilidadLotesPage';
import ReportesPage from '@/pages/ReportesPage';

const MGMT = ['super_admin','admin','gerente','subgerente'] as any;

export default function ReportesShell() {
  return (
    <TabShell
      tabs={[
        { id: 'general', label: 'General', content: <ReportesPage />, roles: MGMT },
        { id: 'sanamex', label: 'SANAMEX', content: <ReporteVentasInventarioSanamex />, roles: MGMT },
        { id: 'inventario-general', label: 'Inventario General', content: <ReporteInventarioGeneral />, roles: MGMT },
        { id: 'ventas-presupuesto', label: 'Ventas y Presupuesto', content: <ReporteVentasPresupuesto />, roles: MGMT },
        { id: 'sugeridos', label: 'Sugeridos', content: <ReporteSugeridos />, roles: MGMT },
        { id: 'rotacion', label: 'Rotación', content: <RotacionPage />, roles: MGMT },
        { id: 'rentabilidad', label: 'Rentabilidad', content: <RentabilidadLotesPage />, roles: MGMT },
      ]}
      defaultTab="general"
    />
  );
}
