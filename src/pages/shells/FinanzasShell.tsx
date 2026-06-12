import TabShell from '@/components/layout/TabShell';
import CuentasPorPagarPage from '@/pages/CuentasPorPagarPage';
import FiscalPage from '@/pages/FiscalPage';
import CortesCaja from '@/pages/CortesCaja';

const MGMT = ['super_admin','admin','gerente','subgerente'] as any;

export default function FinanzasShell() {
  return (
    <TabShell
      tabs={[
        { id: 'cxp', label: 'Cuentas por Pagar', content: <CuentasPorPagarPage />, roles: MGMT },
        { id: 'cfdi', label: 'Facturación (CFDI)', content: <FiscalPage />, roles: MGMT },
        { id: 'cortes', label: 'Cortes de Caja', content: <CortesCaja />, roles: MGMT },
      ]}
      defaultTab="cxp"
    />
  );
}
