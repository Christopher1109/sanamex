import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { usePrefetchCatalogs } from './hooks/useCachedCatalogs';
import { HospitalProvider } from './contexts/HospitalContext';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Folios from './pages/Folios';
import Insumos from './pages/Insumos';
import Medicos from './pages/Medicos';
import Paquetes from './pages/Paquetes';
import Reportes from './pages/Reportes';
import Traspasos from './pages/Traspasos';
import Usuarios from './pages/Usuarios';
import ExportUsers from './pages/ExportUsers';
import SetupData from './pages/SetupData';
import AutoSetup from './pages/AutoSetup';
import ImportSetup from './pages/ImportSetup';
import FixUsers from './pages/FixUsers';
import GenerateCredentials from './pages/GenerateCredentials';
import PopulateInsumos from './pages/PopulateInsumos';
import ImportProcedimientos from './pages/ImportProcedimientos';
import SetupAlmacenes from './pages/SetupAlmacenes';

import GerenteOperacionesDashboard from './pages/GerenteOperacionesDashboard';
import GerenteOperacionesDashboardHome from './pages/GerenteOperacionesDashboardHome';
import GerenteAlmacenDashboard from './pages/GerenteAlmacenDashboard';
import GerenteAlmacenDashboardHome from './pages/GerenteAlmacenDashboardHome';
import CadenaSuministrosDashboard from './pages/CadenaSuministrosDashboard';
import CadenaSuministrosDashboardHome from './pages/CadenaSuministrosDashboardHome';
import FinanzasDashboard from './pages/FinanzasDashboard';
import FinanzasDashboardHome from './pages/FinanzasDashboardHome';
import FinanzasRentabilidad from './pages/FinanzasRentabilidad';
import FinanzasReportes from './pages/FinanzasReportes';
// FinanzasConsumo removed - functionality covered by other reports
import FinanzasComparativo from './pages/FinanzasComparativo';
import FinanzasMermas from './pages/FinanzasMermas';
import FinanzasPresupuestos from './pages/FinanzasPresupuestos';
import FinanzasProyecciones from './pages/FinanzasProyecciones';
import FinanzasTrazabilidadPagos from './pages/FinanzasTrazabilidadPagos';
import FinanzasPreciosInsumos from './pages/FinanzasPreciosInsumos';
import ConfiguracionTarifas from './pages/ConfiguracionTarifas';
import ConfiguracionProcedimientoInsumos from './pages/ConfiguracionProcedimientoInsumos';
import CatalogoInsumosMaestro from './pages/CatalogoInsumosMaestro';
import AlmacenistaAlertasTransferencia from './pages/AlmacenistaAlertasTransferencia';
import AlmacenesProvisionales from './pages/AlmacenesProvisionales';
import SupervisorProcedimientos from './pages/SupervisorProcedimientos';
import SupervisorAsignaciones from './pages/SupervisorAsignaciones';
import RutasDistribucion from './pages/RutasDistribucion';
import RegistroActividad from './pages/RegistroActividad';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Mantener datos en caché por 5 minutos (reduce llamadas repetidas)
      staleTime: 5 * 60 * 1000,
      // Mantener datos en caché por 30 minutos
      gcTime: 30 * 60 * 1000,
      // No re-fetch automáticamente al enfocar ventana
      refetchOnWindowFocus: false,
      // Reintentar solo 2 veces en caso de error
      retry: 2,
      // Reducir intervalo de reintento
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
    mutations: {
      // Reintentar mutaciones solo 1 vez
      retry: 1,
    },
  },
});

const AppContent = () => {
  const { user, userRole, username, loading, signOut } = useAuth();
  
  // Precargar catálogos al inicio para mejor rendimiento
  usePrefetchCatalogs();

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

  // Allow access to auto-setup without authentication
  if (!user || !userRole) {
    return (
      <Routes>
        <Route path="/auto-setup" element={<AutoSetup />} />
        <Route path="/fix-users" element={<FixUsers />} />
        <Route path="*" element={<Auth />} />
      </Routes>
    );
  }

  return (
    <HospitalProvider userId={username} userRole={userRole}>
      <div className="flex h-screen">
        <Sidebar userRole={userRole} onLogout={signOut} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto bg-background p-6">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={
                userRole === 'finanzas' ? <FinanzasDashboardHome /> :
                userRole === 'gerente_operaciones' ? <GerenteOperacionesDashboardHome /> :
                userRole === 'gerente_almacen' ? <GerenteAlmacenDashboardHome /> :
                userRole === 'cadena_suministros' ? <CadenaSuministrosDashboardHome /> :
                <Dashboard userRole={userRole} />
              } />
              {(userRole === 'auxiliar' || userRole === 'lider' || userRole === 'supervisor' || userRole === 'gerente' || userRole === 'gerente_operaciones') && (
                <Route path="/folios" element={<Folios userRole={userRole} />} />
              )}
              {(userRole === 'almacenista' || userRole === 'gerente_operaciones') && (
                <Route path="/almacenes-provisionales" element={<AlmacenesProvisionales />} />
              )}
              {(userRole === 'almacenista' || userRole === 'lider' || userRole === 'supervisor' || userRole === 'gerente' || userRole === 'gerente_operaciones') && (
                <>
                  <Route path="/insumos" element={<Insumos />} />
                  <Route path="/alertas-transferencia" element={<AlmacenistaAlertasTransferencia />} />
                </>
              )}
              {(userRole === 'lider' || userRole === 'supervisor' || userRole === 'gerente' || userRole === 'gerente_operaciones') && (
                <>
                  <Route path="/medicos" element={<Medicos />} />
                  <Route path="/paquetes" element={<Paquetes />} />
                  <Route path="/reportes" element={<Reportes />} />
                </>
              )}
              {(userRole === 'supervisor' || userRole === 'gerente' || userRole === 'gerente_operaciones') && (
                <>
                  <Route path="/procedimientos-hospital" element={<SupervisorProcedimientos />} />
                  <Route path="/registro-actividad" element={<RegistroActividad userRole={userRole} />} />
                </>
              )}
              {(userRole === 'gerente' || userRole === 'gerente_operaciones') && (
                <>
                  <Route path="/alertas-operaciones" element={<GerenteOperacionesDashboard />} />
                  <Route path="/gerente-operaciones" element={<GerenteOperacionesDashboard />} />
                  <Route path="/configuracion-procedimiento-insumos" element={<ConfiguracionProcedimientoInsumos />} />
                  <Route path="/catalogo-insumos-maestro" element={<CatalogoInsumosMaestro />} />
                  <Route path="/supervisor-asignaciones" element={<SupervisorAsignaciones />} />
                  <Route path="/finanzas" element={<FinanzasDashboard />} />
                  <Route path="/traspasos" element={<Traspasos />} />
                  <Route path="/usuarios" element={<Usuarios />} />
                  <Route path="/export-users" element={<ExportUsers />} />
                  <Route path="/setup" element={<SetupData />} />
                  <Route path="/auto-setup" element={<AutoSetup />} />
                  <Route path="/import-setup" element={<ImportSetup />} />
                  <Route path="/fix-users" element={<FixUsers />} />
                  <Route path="/generate-credentials" element={<GenerateCredentials />} />
                  <Route path="/populate-insumos" element={<PopulateInsumos />} />
                  <Route path="/import-procedimientos" element={<ImportProcedimientos />} />
                  <Route path="/setup-almacenes" element={<SetupAlmacenes />} />
                </>
              )}
              {userRole === 'gerente_almacen' && (
                <>
                  <Route path="/almacen-central" element={<GerenteAlmacenDashboard />} />
                  <Route path="/traspasos" element={<Traspasos />} />
                  <Route path="/alertas-operaciones" element={<GerenteOperacionesDashboard />} />
                  <Route path="/insumos" element={<Insumos />} />
                  <Route path="/almacenes-provisionales" element={<AlmacenesProvisionales />} />
                  <Route path="/alertas-transferencia" element={<AlmacenistaAlertasTransferencia />} />
                  <Route path="/registro-actividad" element={<RegistroActividad userRole={userRole} />} />
                  <Route path="/distribucion" element={<CadenaSuministrosDashboard />} />
                  <Route path="/rutas-distribucion" element={<RutasDistribucion />} />
                </>
              )}
              {userRole === 'cadena_suministros' && (
                <>
                  <Route path="/distribucion" element={<CadenaSuministrosDashboard />} />
                  <Route path="/rutas-distribucion" element={<RutasDistribucion />} />
                  <Route path="/alertas-operaciones" element={<GerenteOperacionesDashboard />} />
                  <Route path="/almacen-central" element={<GerenteAlmacenDashboard />} />
                  <Route path="/insumos" element={<Insumos />} />
                  <Route path="/almacenes-provisionales" element={<AlmacenesProvisionales />} />
                  <Route path="/alertas-transferencia" element={<AlmacenistaAlertasTransferencia />} />
                  <Route path="/registro-actividad" element={<RegistroActividad userRole={userRole} />} />
                </>
              )}
              {userRole === 'finanzas' && (
                <>
                  <Route path="/finanzas" element={<FinanzasDashboard />} />
                  <Route path="/finanzas-trazabilidad" element={<FinanzasTrazabilidadPagos />} />
                  <Route path="/finanzas-reportes" element={<FinanzasReportes />} />
                  <Route path="/finanzas-comparativo" element={<FinanzasComparativo />} />
                  <Route path="/finanzas-mermas" element={<FinanzasMermas />} />
                  <Route path="/finanzas-presupuestos" element={<FinanzasPresupuestos />} />
                  <Route path="/finanzas-proyecciones" element={<FinanzasProyecciones />} />
                  <Route path="/finanzas-precios" element={<FinanzasPreciosInsumos />} />
                  <Route path="/rentabilidad" element={<FinanzasRentabilidad />} />
                  <Route path="/configuracion-tarifas" element={<ConfiguracionTarifas />} />
                  <Route path="/registro-actividad" element={<RegistroActividad userRole={userRole} />} />
                </>
              )}
              {(userRole === 'gerente_operaciones' || userRole === 'finanzas') && (
                <Route path="/configuracion-tarifas" element={<ConfiguracionTarifas />} />
              )}
              {userRole === 'gerente_operaciones' && (
                <Route path="/rentabilidad" element={<FinanzasRentabilidad />} />
              )}
              <Route path="/auth" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </HospitalProvider>
  );
};

const App = () => {
  return (
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
};

export default App;
