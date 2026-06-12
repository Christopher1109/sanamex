import TabShell from '@/components/layout/TabShell';
import CargasMasivasPage from '@/pages/CargasMasivasPage';
import ConflictosPage from '@/pages/ConflictosPage';
import CatalogosCotizadorPage from '@/pages/CatalogosCotizadorPage';
import AuditoriaPage from '@/pages/AuditoriaPage';
import SuperAdminPage from '@/pages/SuperAdminPage';

const MGMT = ['super_admin','admin','gerente','subgerente'] as any;
const SALES = ['super_admin','admin','gerente','subgerente','ventas','almacen_ventas'] as any;
const AUDIT = ['super_admin','admin','gerente','auditoria','supervisor'] as any;

export default function SistemaShell() {
  return (
    <TabShell
      tabs={[
        { id: 'cargas', label: 'Cargas Masivas', content: <CargasMasivasPage />, roles: MGMT },
        { id: 'offline', label: 'Ventas Offline', content: <ConflictosPage />, roles: SALES },
        { id: 'cotizador-catalogos', label: 'Catálogos Cotizador', content: <CatalogosCotizadorPage />, roles: MGMT },
        { id: 'actividad', label: 'Actividad', content: <AuditoriaPage />, roles: AUDIT },
        { id: 'super-admin', label: 'Super Admin', content: <SuperAdminPage />, roles: ['super_admin'] as any },
      ]}
      defaultTab="cargas"
    />
  );
}
