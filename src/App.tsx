import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { SucursalProvider } from './contexts/SucursalContext';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import TraspasosPage from './pages/TraspasosPage';
import AjustesMermasPage from './pages/AjustesMermasPage';
import POSPage from './pages/POSPage';
import RecomendacionesPage from './pages/RecomendacionesPage';
import CotizadorPage from './pages/CotizadorPage';
import StubPage from './pages/StubPage';

// Shells (group pages with internal tabs)
import ComprasShell from './pages/shells/ComprasShell';
import VentasShell from './pages/shells/VentasShell';
import DevolucionesShell from './pages/shells/DevolucionesShell';
import InventarioShell from './pages/shells/InventarioShell';
import ReportesShell from './pages/shells/ReportesShell';
import FinanzasShell from './pages/shells/FinanzasShell';
import CatalogosShell from './pages/shells/CatalogosShell';
import SistemaShell from './pages/shells/SistemaShell';

import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000, refetchOnWindowFocus: false, retry: 2 },
  },
});

// Helper: redirect with query string preserved as ?tab=
const R = ({ to }: { to: string }) => <Navigate to={to} replace />;

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

              {/* New consolidated routes */}
              <Route path="/compras" element={<ComprasShell />} />
              <Route path="/ventas" element={<VentasShell />} />
              <Route path="/traspasos" element={<TraspasosPage />} />
              <Route path="/devoluciones" element={<DevolucionesShell />} />
              <Route path="/inventario" element={<InventarioShell />} />
              <Route path="/reportes" element={<ReportesShell />} />
              <Route path="/finanzas" element={<FinanzasShell />} />
              <Route path="/catalogos" element={<CatalogosShell />} />
              <Route path="/sistema" element={<SistemaShell />} />

              {/* Standalone */}
              <Route path="/pos" element={<POSPage />} />
              <Route path="/cotizador" element={<CotizadorPage />} />
              <Route path="/recomendaciones" element={<RecomendacionesPage />} />
              <Route path="/ajustes" element={<AjustesMermasPage />} />

              {/* === Legacy URL redirects === */}
              {/* Catálogos */}
              <Route path="/productos" element={<R to="/catalogos?tab=articulos" />} />
              <Route path="/proveedores" element={<R to="/catalogos?tab=proveedores" />} />
              <Route path="/clientes" element={<R to="/catalogos?tab=clientes" />} />
              <Route path="/listas-precios" element={<R to="/catalogos?tab=listas-precios" />} />

              {/* Inventario */}
              <Route path="/kardex" element={<R to="/inventario?tab=kardex" />} />
              <Route path="/mermas" element={<R to="/inventario?tab=mermas" />} />
              <Route path="/caducidades" element={<R to="/inventario?tab=caducidades" />} />

              {/* Compras / Ventas */}
              <Route path="/ordenes-compra" element={<R to="/compras?tab=oc" />} />
              <Route path="/pedidos" element={<R to="/ventas?tab=pedidos" />} />

              {/* Reportes */}
              <Route path="/reporte-sanamex" element={<R to="/reportes?tab=sanamex" />} />
              <Route path="/reporte-inventario-general" element={<R to="/reportes?tab=inventario-general" />} />
              <Route path="/reporte-ventas-presupuesto" element={<R to="/reportes?tab=ventas-presupuesto" />} />
              <Route path="/reporte-sugeridos" element={<R to="/reportes?tab=sugeridos" />} />
              <Route path="/rotacion" element={<R to="/reportes?tab=rotacion" />} />
              <Route path="/rentabilidad-lotes" element={<R to="/reportes?tab=rentabilidad" />} />

              {/* Finanzas */}
              <Route path="/cuentas-por-pagar" element={<R to="/finanzas?tab=cxp" />} />
              <Route path="/fiscal" element={<R to="/finanzas?tab=cfdi" />} />

              {/* Sistema */}
              <Route path="/super-admin" element={<R to="/sistema?tab=super-admin" />} />
              <Route path="/actividad" element={<R to="/sistema?tab=actividad" />} />
              <Route path="/cargas-masivas" element={<R to="/sistema?tab=cargas" />} />
              <Route path="/conflictos" element={<R to="/sistema?tab=offline" />} />
              <Route path="/catalogos-cotizador" element={<R to="/sistema?tab=cotizador-catalogos" />} />

              {/* Devoluciones */}
              <Route path="/devoluciones-proveedor" element={<R to="/devoluciones?tab=proveedor" />} />

              {/* Consultas legacy */}
              <Route path="/consultas/articulos" element={<StubPage title="Movimientos de Artículo" description="Consulta histórica de todos los movimientos por artículo." />} />
              <Route path="/consultas/traspasos-salida" element={<R to="/traspasos" />} />
              <Route path="/consultas/traspasos-entrada" element={<R to="/traspasos" />} />
              <Route path="/consultas/compras" element={<R to="/compras?tab=facturas" />} />

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
