import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { canAccessFase2 } from './config/faseAccess';
import { SucursalProvider } from './contexts/SucursalContext';
import Auth from './pages/Auth';
import AreaSelectorPage from './pages/AreaSelectorPage';
import Dashboard from './pages/Dashboard';
import Productos from './pages/Productos';
import InventarioPage from './pages/InventarioPage';
import Kardex from './pages/Kardex';
import ProveedoresPage from './pages/ProveedoresPage';
import ClientesPage from './pages/ClientesPage';
import TraspasosPage from './pages/TraspasosPage';
import AjustesMermasPage from './pages/AjustesMermasPage';
import MermasPage from './pages/MermasPage';
import PedidosPage from './pages/PedidosPage';
import ComprasPage from './pages/ComprasPage';
import ReportesPage from './pages/ReportesPage';
import AuditoriaPage from './pages/AuditoriaPage';
import POSPage from './pages/POSPage';
import CaducidadesPage from './pages/CaducidadesPage';
import ConflictosPage from './pages/ConflictosPage';
import SuperAdminPage from './pages/SuperAdminPage';
import GestionUsuariosPage from './pages/GestionUsuariosPage';
import RecomendacionesPage from './pages/RecomendacionesPage';
import FiscalPage from './pages/FiscalPage';
import CargasMasivasPage from './pages/CargasMasivasPage';
import CuentasPorPagarPage from './pages/CuentasPorPagarPage';
import RotacionPage from './pages/RotacionPage';
import RentabilidadLotesPage from './pages/RentabilidadLotesPage';
import ReporteVentasInventarioSanamex from './pages/ReporteVentasInventarioSanamex';
import ReporteInventarioGeneral from './pages/ReporteInventarioGeneral';
import ReporteVentasPresupuesto from './pages/ReporteVentasPresupuesto';
import ListasPreciosPage from './pages/ListasPreciosPage';
import ReporteSugeridos from './pages/ReporteSugeridos';
import CatalogosCotizadorPage from './pages/CatalogosCotizadorPage';
import CotizadorPage from './pages/CotizadorPage';
import OrdenesCompraPage from './pages/OrdenesCompraPage';
import StubPage from './pages/StubPage';
import DevolucionesProveedorPage from './pages/DevolucionesProveedorPage';
import CotizadorHubPage from './pages/CotizadorHubPage';
import ComprasHubPage from './pages/ComprasHubPage';
import TraspasosHubPage from './pages/TraspasosHubPage';
import InventarioHubPage from './pages/InventarioHubPage';
import ReportesHubPage from './pages/ReportesHubPage';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Fase2Guard from './components/Fase2Guard';
import BancosPage from './pages/BancosPage';
import ConciliacionPage from './pages/ConciliacionPage';
import ContabilidadPage from './pages/ContabilidadPage';
import ReportesAdminPage from './pages/ReportesAdminPage';
import ImpuestosPage from './pages/ImpuestosPage';
import NominaPage from './pages/NominaPage';
import OAuthConsent from './pages/OAuthConsent';


const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000, refetchOnWindowFocus: false, retry: 2 },
  },
});

const AREA_SESSION_KEY = 'sanamex_area_elegida';

const AppContent = () => {
  const { user, userRole, loading, signOut } = useAuth();
  const [areaElegida, setAreaElegida] = useState(
    () => sessionStorage.getItem(AREA_SESSION_KEY) === '1'
  );

  const handleLogout = () => {
    sessionStorage.removeItem(AREA_SESSION_KEY);
    setAreaElegida(false);
    signOut();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user || !userRole) {
    return (
      <Routes>
        <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
        <Route path="*" element={<Auth />} />
      </Routes>
    );
  }

  if (canAccessFase2(userRole) && !areaElegida) {
    return (
      <Routes>
        <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
        <Route
          path="*"
          element={
            <AreaSelectorPage
              userRole={userRole}
              onSelect={() => {
                sessionStorage.setItem(AREA_SESSION_KEY, '1');
                setAreaElegida(true);
              }}
            />
          }
        />
      </Routes>
    );
  }

  return (
    <SucursalProvider>
      <div className="flex h-screen">
        <Sidebar userRole={userRole} onLogout={handleLogout} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          
          <main className="flex-1 overflow-y-auto bg-background p-6">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard userRole={userRole} />} />
              {/* Fase 1 (siempre visibles) */}
              <Route path="/actividad" element={<AuditoriaPage />} />
              <Route path="/super-admin" element={<SuperAdminPage />} />
              <Route path="/super-admin/usuarios" element={<GestionUsuariosPage />} />
              <Route path="/cuentas-por-pagar" element={<CuentasPorPagarPage />} />
              <Route path="/bancos" element={<BancosPage />} />
              <Route path="/conciliacion" element={<ConciliacionPage />} />
              <Route path="/fiscal" element={<FiscalPage />} />
              <Route path="/contabilidad" element={<ContabilidadPage />} />
              <Route path="/reportes-admin" element={<ReportesAdminPage />} />
              <Route path="/impuestos" element={<ImpuestosPage />} />
              <Route path="/nomina" element={<NominaPage />} />
              {/* Fase 2 (ocultas tras feature flag) */}
              <Route path="/productos" element={<Fase2Guard><Productos /></Fase2Guard>} />
              <Route path="/proveedores" element={<Fase2Guard><ProveedoresPage /></Fase2Guard>} />
              <Route path="/clientes" element={<Fase2Guard><ClientesPage /></Fase2Guard>} />
              <Route path="/inventario" element={<Fase2Guard><InventarioHubPage /></Fase2Guard>} />
              <Route path="/kardex" element={<Fase2Guard><Kardex /></Fase2Guard>} />
              <Route path="/traspasos" element={<Fase2Guard><TraspasosHubPage /></Fase2Guard>} />
              <Route path="/ajustes" element={<Fase2Guard><AjustesMermasPage /></Fase2Guard>} />
              <Route path="/mermas" element={<Fase2Guard><MermasPage /></Fase2Guard>} />
              <Route path="/caducidades" element={<Fase2Guard><CaducidadesPage /></Fase2Guard>} />
              <Route path="/pedidos" element={<Fase2Guard><PedidosPage /></Fase2Guard>} />
              <Route path="/compras" element={<Fase2Guard><ComprasHubPage /></Fase2Guard>} />
              <Route path="/reportes" element={<Fase2Guard><ReportesHubPage /></Fase2Guard>} />
              <Route path="/pos" element={<Fase2Guard><POSPage /></Fase2Guard>} />
              <Route path="/conflictos" element={<Fase2Guard><ConflictosPage /></Fase2Guard>} />
              <Route path="/recomendaciones" element={<Fase2Guard><RecomendacionesPage /></Fase2Guard>} />
              <Route path="/rotacion" element={<Fase2Guard><RotacionPage /></Fase2Guard>} />
              <Route path="/rentabilidad-lotes" element={<Fase2Guard><RentabilidadLotesPage /></Fase2Guard>} />
              <Route path="/reporte-sanamex" element={<Fase2Guard><ReporteVentasInventarioSanamex /></Fase2Guard>} />
              <Route path="/reporte-inventario-general" element={<Fase2Guard><ReporteInventarioGeneral /></Fase2Guard>} />
              <Route path="/reporte-ventas-presupuesto" element={<Fase2Guard><ReporteVentasPresupuesto /></Fase2Guard>} />
              <Route path="/reporte-sugeridos" element={<Fase2Guard><ReporteSugeridos /></Fase2Guard>} />
              <Route path="/listas-precios" element={<Fase2Guard><ListasPreciosPage /></Fase2Guard>} />
              <Route path="/catalogos-cotizador" element={<Fase2Guard><CatalogosCotizadorPage /></Fase2Guard>} />
              <Route path="/cotizador" element={<Fase2Guard><CotizadorHubPage /></Fase2Guard>} />
              <Route path="/ordenes-compra" element={<Fase2Guard><OrdenesCompraPage /></Fase2Guard>} />
              <Route path="/cargas-masivas" element={<Fase2Guard><CargasMasivasPage /></Fase2Guard>} />
              <Route path="/devoluciones-proveedor" element={<Fase2Guard><DevolucionesProveedorPage /></Fase2Guard>} />
              <Route path="/consultas/articulos" element={<Fase2Guard><StubPage title="Movimientos de Artículo" description="Consulta histórica de todos los movimientos (compras, ventas, traspasos, ajustes) por artículo." /></Fase2Guard>} />
              <Route path="/consultas/traspasos-salida" element={<Fase2Guard><StubPage title="Traspasos de Salida" description="Traspasos donde la sucursal activa es el origen." /></Fase2Guard>} />
              <Route path="/consultas/traspasos-entrada" element={<Fase2Guard><StubPage title="Traspasos de Entrada" description="Traspasos donde la sucursal activa es el destino." /></Fase2Guard>} />
              <Route path="/consultas/compras" element={<Fase2Guard><StubPage title="Compras Históricas" description="Listado completo de compras con filtros por fecha y proveedor." /></Fase2Guard>} />
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
              <Route path="/auth" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </SucursalProvider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
