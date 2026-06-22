import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { FASE_2_VISIBLE } from '@/config/featureFlags';

interface Fase2GuardProps {
  children: ReactNode;
}

/**
 * Intercepta el render de rutas de Fase 2 cuando el flag está apagado.
 * NO desmonta el código ni los imports; solo redirige a /dashboard.
 */
const Fase2Guard = ({ children }: Fase2GuardProps) => {
  if (!FASE_2_VISIBLE) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

export default Fase2Guard;
