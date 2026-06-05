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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchUserRole(session.user.id), 0);
        } else {
          setUserRole(null);
          setLoading(false);
        }
      }
    );

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
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('nombre, username')
        .eq('id', userId)
        .maybeSingle();

      if (profileData) {
        setUsername((profileData as any).username || (profileData as any).nombre);
      }

      if (error) {
        console.error('Error fetching user role:', error);
        setUserRole('ventas');
      } else if (data && data.length > 0) {
        const roleHierarchy: UserRole[] = [
          'super_admin', 'admin', 'gerente', 'subgerente', 'supervisor',
          'auditoria', 'almacen_ventas', 'almacen',
          'ventas', 'repartidor',
        ];
        const highestRole = roleHierarchy.find(role => data.some(r => r.role === role));
        setUserRole(highestRole || 'ventas');
      } else {
        setUserRole('ventas');
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
      setUserRole('ventas');
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

  return { user, session, userRole, username, loading, signOut };
};
