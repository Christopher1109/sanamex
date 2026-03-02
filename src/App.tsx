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
import POS from './pages/POS';
import Kardex from './pages/Kardex';
import CortesCaja from './pages/CortesCaja';
import StubPage from './pages/StubPage';
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
              <Route path="/proveedores" element={<StubPage title="Proveedores" description="Gestión de proveedores" />} />
              <Route path="/clientes" element={<StubPage title="Clientes" description="Gestión de clientes" />} />
              <Route path="/inventario" element={<InventarioPage />} />
              <Route path="/kardex" element={<Kardex />} />
              <Route path="/traspasos" element={<StubPage title="Traspasos" description="Traspasos entre sucursales" />} />
              <Route path="/ajustes" element={<StubPage title="Ajustes / Mermas" description="Ajustes de inventario y mermas" />} />
              <Route path="/pos" element={<POS />} />
              <Route path="/ventas" element={<StubPage title="Historial de Ventas" description="Consulta de ventas realizadas" />} />
              <Route path="/rutas" element={<StubPage title="Rutas" description="Gestión de rutas de entrega" />} />
              <Route path="/cortes" element={<CortesCaja />} />
              <Route path="/bolsas-valores" element={<StubPage title="Bolsas de Valores" description="Recolección de efectivo" />} />
              <Route path="/conciliacion" element={<StubPage title="Conciliación Bancaria" description="Conciliación de estados de cuenta" />} />
              <Route path="/reportes" element={<StubPage title="Reportes" description="Reportes operativos" />} />
              <Route path="/usuarios" element={<StubPage title="Usuarios" description="Gestión de usuarios y roles" />} />
              <Route path="/auditoria" element={<StubPage title="Auditoría" description="Log de auditoría del sistema" />} />
              <Route path="/registro-actividad" element={<StubPage title="Registro de Actividad" description="Historial de actividades" />} />
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
