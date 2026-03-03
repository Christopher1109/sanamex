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
  const [isSettingUp, setIsSettingUp] = useState(false);
  const navigate = useNavigate();

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const handleLogin = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      const email = `${data.username.toLowerCase()}@sistema.local`;
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: data.password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast.error('Credenciales inválidas', { description: 'Verifica tu usuario y contraseña' });
        } else {
          toast.error('Error al iniciar sesión', { description: error.message });
        }
        return;
      }

      toast.success('¡Bienvenido!');
      navigate('/dashboard');
    } catch {
      toast.error('Error inesperado');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetup = async () => {
    setIsSettingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke('setup-initial-admin');
      if (error) throw error;
      toast.success('Usuarios creados exitosamente', { description: 'Ya puedes iniciar sesión' });
      console.log('Setup results:', data);
    } catch (err: any) {
      toast.error('Error al crear usuarios', { description: err.message });
    } finally {
      setIsSettingUp(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">MedDistributor</CardTitle>
            <CardDescription>
              ERP para Distribuidora de Medicamentos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-username">Usuario</Label>
                <Input
                  id="login-username"
                  type="text"
                  placeholder="Ej: admin, gerente01, cajero01"
                  autoComplete="username"
                  {...loginForm.register('username')}
                />
                {loginForm.formState.errors.username && (
                  <p className="text-sm text-destructive">{loginForm.formState.errors.username.message}</p>
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
                  <p className="text-sm text-destructive">{loginForm.formState.errors.password.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </Button>
            </form>

            <div className="mt-6 p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-2">Usuarios del sistema:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li><code className="bg-background px-1 rounded">admin</code> — Administrador General</li>
                <li><code className="bg-background px-1 rounded">gerente01</code> — Gerente Sucursal</li>
                <li><code className="bg-background px-1 rounded">cajero01</code> — Cajero</li>
                <li><code className="bg-background px-1 rounded">almacen01</code> — Almacenista</li>
                <li><code className="bg-background px-1 rounded">repartidor01</code> — Repartidor</li>
                <li><code className="bg-background px-1 rounded">auditor01</code> — Auditor</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">Contraseña: <code className="bg-background px-1 rounded">[Rol]2024!</code> (ej: Admin2024!)</p>
              
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full mt-3" 
                onClick={handleSetup}
                disabled={isSettingUp}
              >
                {isSettingUp ? 'Creando usuarios...' : '⚡ Crear usuarios iniciales'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
