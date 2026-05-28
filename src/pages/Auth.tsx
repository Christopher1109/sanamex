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
  password: z.string().min(6, { message: "Mínimo 6 caracteres" }).max(100),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const SUC = [
  { code: 'sv', label: 'San Vicente' },
  { code: 'f36', label: 'Iztapalapa F36' },
  { code: 'h', label: 'Iztapalapa H' },
  { code: 'eca', label: 'Ecatepec' },
];

const ROLES = [
  { key: 'gerente', label: 'Gerente' },
  { key: 'subgerente', label: 'Subgerente' },
  { key: 'ventas1', label: 'Ventas 1' },
  { key: 'ventas2', label: 'Ventas 2' },
  { key: 'almacen', label: 'Almacenista' },
  { key: 'chofer', label: 'Chofer' },
];

const Auth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const loginForm = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const handleLogin = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      const email = `${data.username.toLowerCase()}@sanamex.local`;
      const { error } = await supabase.auth.signInWithPassword({ email, password: data.password });
      if (error) {
        toast.error('Credenciales inválidas', { description: error.message });
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl space-y-4">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Sanamex ERP</CardTitle>
            <CardDescription>Distribuidora Farmacéutica Sanamex</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4 max-w-sm mx-auto">
              <div className="space-y-2">
                <Label htmlFor="login-username">Usuario</Label>
                <Input
                  id="login-username" type="text"
                  placeholder="Ej: superadmin, gerente_sv"
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
                  id="login-password" type="password" placeholder="••••••••"
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
              <p className="text-sm font-medium mb-2">Usuarios del sistema</p>
              <p className="text-xs text-muted-foreground mb-3">
                Contraseña para todos: <code className="bg-background px-1.5 py-0.5 rounded">Sanamex2026!</code>
              </p>

              <div className="space-y-3 text-xs">
                <div>
                  <p className="font-semibold mb-1">Globales</p>
                  <ul className="text-muted-foreground space-y-0.5">
                    <li><code className="bg-background px-1 rounded">superadmin</code> — Super Administrador</li>
                    <li><code className="bg-background px-1 rounded">admin_general</code> — Administrador General</li>
                  </ul>
                </div>

                {SUC.map(s => (
                  <div key={s.code}>
                    <p className="font-semibold mb-1">Sucursal {s.label}</p>
                    <ul className="text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-0.5">
                      {ROLES.map(r => (
                        <li key={r.key}>
                          <code className="bg-background px-1 rounded">{r.key}_{s.code}</code> — {r.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
