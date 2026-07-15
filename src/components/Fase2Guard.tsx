import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { canAccessFase2 } from '@/config/faseAccess';

interface Fase2GuardProps {
  children: ReactNode;
}

/**
 * Intercepta el render de rutas de Fase 2 cuando el rol activo no
 * tiene acceso operativo. NO desmonta código ni imports; redirige a
 * /dashboard. Sustituye al flag global FASE_2_VISIBLE.
 */
const Fase2Guard = ({ children }: Fase2GuardProps) => {
  const { userRole, loading } = useAuth();
  if (loading) return null;
  if (!canAccessFase2(userRole)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

export default Fase2Guard;
