import { useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { UserRole } from '@/types';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Configurar el listener de cambios de autenticación PRIMERO
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Obtener el rol del usuario de forma diferida
        if (session?.user) {
          setTimeout(() => {
            fetchUserRole(session.user.id);
          }, 0);
        } else {
          setUserRole(null);
          setLoading(false);
        }
      }
    );

    // LUEGO verificar si hay una sesión existente
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserRole(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId: string) => {
    try {
      // Obtener todos los roles del usuario y elegir el de mayor jerarquía
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      // Obtener username del perfil (IMPORTANTE: obtener username, no solo nombre)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('nombre, username')
        .eq('id', userId)
        .maybeSingle();

      if (profileData) {
        // Usar el username para el HospitalContext
        setUsername((profileData as any).username || (profileData as any).nombre);
      }

      if (error) {
        console.error('Error fetching user role:', error);
        setUserRole('auxiliar'); // Rol por defecto
      } else if (data && data.length > 0) {
        // Jerarquía de roles (mayor a menor) - incluir nuevos roles
        const roleHierarchy: UserRole[] = [
          'gerente_operaciones', 
          'gerente_almacen', 
          'cadena_suministros',
          'finanzas',
          'gerente', 
          'supervisor', 
          'lider', 
          'almacenista', 
          'auxiliar'
        ];
        
        // Encontrar el rol con mayor jerarquía
        const highestRole = roleHierarchy.find(role => 
          data.some(r => r.role === role)
        );
        
        setUserRole(highestRole || 'auxiliar');
      } else {
        setUserRole('auxiliar');
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
      setUserRole('auxiliar');
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRole(null);
    setUsername(null);
  };

  return {
    user,
    session,
    userRole,
    username,
    loading,
    signOut,
  };
};
