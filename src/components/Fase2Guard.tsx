import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { canAccessFase2 } from '@/config/faseAccess';
import { MODULOS } from '@/config/modulos';

interface Fase2GuardProps {
  children: ReactNode;
}

/**
 * Guardia unificado de acceso a rutas.
 *
 * Regla:
 *   1. Si el usuario tiene un nivel de acceso (≠ sin_acceso) en el módulo
 *      cuyo path coincide con la ruta actual → permite entrar.
 *   2. Si no, cae al filtro por rol (canAccessFase2) como respaldo para
 *      rutas que no están mapeadas 1:1 a un módulo.
 *
 * Esto elimina la inconsistencia donde el sidebar mostraba módulos que el
 * guard bloqueaba (ej. contraloría, contabilidad, tesorería con nivel
 * "consultar" en artículos, inventario, etc.).
 */
const Fase2Guard = ({ children }: Fase2GuardProps) => {
  const { user, userRole, loading } = useAuth();
  const { access, can, loading: accessLoading, isBypass } = useModuleAccess(user?.id, userRole);
  const location = useLocation();

  if (loading || accessLoading) return null;
  if (isBypass) return <>{children}</>;

  // Legacy: usuarios sin filas en user_module_access → fallback por rol
  // para no romper a los 26 usuarios previos a la migración de permisos granulares.
  const isLegacy = Object.keys(access).length === 0;

  const path = location.pathname;
  const modulo =
    MODULOS.find(m => m.path === path) ||
    MODULOS.find(m => path.startsWith(m.path + '/')) ||
    MODULOS.find(m => m.path !== '/' && path.startsWith(m.path));

  if (!isLegacy) {
    // Fuente única de verdad: user_module_access
    if (modulo && can(modulo.key, 'consultar')) return <>{children}</>;
    // Rutas sin módulo mapeado (kardex, cotizador, consultas): permitir por rol
    if (!modulo && canAccessFase2(userRole)) return <>{children}</>;
    return <Navigate to="/dashboard" replace />;
  }

  // Legacy: comportamiento anterior por rol
  if (canAccessFase2(userRole)) {
    return <>{children}</>;
  }

  return <Navigate to="/dashboard" replace />;
};

export default Fase2Guard;
