import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { NivelAcceso, nivelSuficiente } from '@/config/modulos';
import { UserRole } from '@/types';

// Hook global: carga los permisos por módulo del usuario logeado.
// super_admin y admin obtienen "administrar" en todo por bypass (sin llamada a la BD).

const BYPASS_ROLES: UserRole[] = ['super_admin', 'admin'];

export function useModuleAccess(userId: string | null | undefined, userRole: UserRole | null | undefined) {
  const [access, setAccess] = useState<Record<string, NivelAcceso>>({});
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const refresh = () => setVersion(v => v + 1);

  useEffect(() => {
    let active = true;
    if (!userId || !userRole) {
      setAccess({});
      setLoading(false);
      return;
    }

    // Bypass total: super_admin / admin
    if (BYPASS_ROLES.includes(userRole)) {
      setAccess({ __bypass__: 'administrar' as NivelAcceso });
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase
      .from('user_module_access')
      .select('modulo, nivel_acceso')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (!active) return;
        const map: Record<string, NivelAcceso> = {};
        (data || []).forEach((r: any) => { map[r.modulo] = r.nivel_acceso; });
        setAccess(map);
        setLoading(false);
      });

    return () => { active = false; };
  }, [userId, userRole, version]);

  const isBypass = !!access.__bypass__;

  const getNivel = (modulo: string): NivelAcceso => {
    if (isBypass) return 'administrar';
    return access[modulo] || 'sin_acceso';
  };

  const can = (modulo: string, min: NivelAcceso = 'consultar'): boolean => {
    if (isBypass) return true;
    return nivelSuficiente(access[modulo], min);
  };

  return { access, getNivel, can, loading, isBypass, refresh };
}
