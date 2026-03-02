import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const loginSchema = z.object({
  username: z.string()
    .trim()
    .min(3, { message: "El usuario debe tener al menos 3 caracteres" })
    .max(50, { message: "Máximo 50 caracteres" })
    .regex(/^[a-zA-Z0-9_]+$/, { message: "Solo letras, números y guiones bajos" }),
  password: z.string()
    .min(6, { message: "La contraseña debe tener al menos 6 caracteres" })
    .max(100, { message: "Máximo 100 caracteres" }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const Auth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const handleLogin = async (data: LoginFormValues) => {
    setIsLoading(true);
    
    try {
      // Convert username to email format for Supabase auth
      const email = `${data.username.toLowerCase()}@sistema.local`;
      
      const { error } = await supabase.auth.signInWithPassword({
        email: email,
        password: data.password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast.error('Credenciales inválidas', {
            description: 'Verifica tu usuario y contraseña',
          });
        } else if (error.message.includes('Email not confirmed')) {
          toast.error('Usuario no confirmado', {
            description: 'Contacta al administrador',
          });
        } else {
          toast.error('Error al iniciar sesión', {
            description: error.message,
          });
        }
        return;
      }

      toast.success('¡Bienvenido!');
      navigate('/dashboard');
    } catch (error) {
      toast.error('Error inesperado', {
        description: 'Por favor intenta nuevamente',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Sistema de Gestión de Anestesia</CardTitle>
            <CardDescription>
              Ingresa tu usuario y contraseña
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-username">Usuario</Label>
                <Input
                  id="login-username"
                  type="text"
                  placeholder="Ej: auxiliar01, lider05, operaciones01"
                  autoComplete="username"
                  {...loginForm.register('username')}
                />
                {loginForm.formState.errors.username && (
                  <p className="text-sm text-destructive">
                    {loginForm.formState.errors.username.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">Contraseña</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...loginForm.register('password')}
                />
                {loginForm.formState.errors.password && (
                  <p className="text-sm text-destructive">
                    {loginForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-2">Usuarios de ejemplo:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li><code className="bg-background px-1 rounded">auxiliar01</code> - Auxiliar Hospital 1</li>
                <li><code className="bg-background px-1 rounded">lider01</code> - Líder Hospital 1</li>
                <li><code className="bg-background px-1 rounded">almacenista01</code> - Almacenista Hospital 1</li>
                <li><code className="bg-background px-1 rounded">supervisor01</code> - Supervisor Zona 1</li>
                <li><code className="bg-background px-1 rounded">operaciones01</code> - Gerente Operaciones</li>
                <li><code className="bg-background px-1 rounded">almacen_gral01</code> - Gerente Almacén</li>
                <li><code className="bg-background px-1 rounded">suministros01</code> - Cadena Suministros</li>
                <li><code className="bg-background px-1 rounded">finanzas</code> - Finanzas</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">Contraseña: <code className="bg-background px-1 rounded">Imss2024!</code></p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
