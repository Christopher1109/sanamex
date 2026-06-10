import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { SucursalProvider } from './contexts/SucursalContext';
import Auth from './pages/Auth';
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
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';


const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000, refetchOnWindowFocus: false, retry: 2 },
  },
});

const AppContent = () => {
  const { user, userRole, loading, signOut } = useAuth();

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
    return <Routes><Route path="*" element={<Auth />} /></Routes>;
  }

  return (
    <SucursalProvider>
      <div className="flex h-screen">
        <Sidebar userRole={userRole} onLogout={signOut} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          
          <main className="flex-1 overflow-y-auto bg-background p-6">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard userRole={userRole} />} />
              <Route path="/productos" element={<Productos />} />
              <Route path="/proveedores" element={<ProveedoresPage />} />
              <Route path="/clientes" element={<ClientesPage />} />
              <Route path="/inventario" element={<InventarioPage />} />
              <Route path="/kardex" element={<Kardex />} />
              <Route path="/traspasos" element={<TraspasosPage />} />
              <Route path="/ajustes" element={<AjustesMermasPage />} />
              <Route path="/mermas" element={<MermasPage />} />
              <Route path="/caducidades" element={<CaducidadesPage />} />
              <Route path="/pedidos" element={<PedidosPage />} />
              <Route path="/compras" element={<ComprasPage />} />
              <Route path="/reportes" element={<ReportesPage />} />
              <Route path="/actividad" element={<AuditoriaPage />} />
              <Route path="/pos" element={<POSPage />} />
              <Route path="/conflictos" element={<ConflictosPage />} />
              <Route path="/super-admin" element={<SuperAdminPage />} />
              <Route path="/recomendaciones" element={<RecomendacionesPage />} />
              <Route path="/rotacion" element={<RotacionPage />} />
              <Route path="/rentabilidad-lotes" element={<RentabilidadLotesPage />} />
              <Route path="/reporte-sanamex" element={<ReporteVentasInventarioSanamex />} />
              <Route path="/reporte-inventario-general" element={<ReporteInventarioGeneral />} />
              <Route path="/reporte-ventas-presupuesto" element={<ReporteVentasPresupuesto />} />
              <Route path="/reporte-sugeridos" element={<ReporteSugeridos />} />
              <Route path="/listas-precios" element={<ListasPreciosPage />} />
              <Route path="/catalogos-cotizador" element={<CatalogosCotizadorPage />} />
              <Route path="/cotizador" element={<CotizadorPage />} />
              <Route path="/ordenes-compra" element={<OrdenesCompraPage />} />
              <Route path="/cuentas-por-pagar" element={<CuentasPorPagarPage />} />
              <Route path="/fiscal" element={<FiscalPage />} />
              <Route path="/cargas-masivas" element={<CargasMasivasPage />} />
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
