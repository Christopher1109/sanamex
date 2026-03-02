import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { UserRole } from '@/types';
import { UserPlus } from 'lucide-react';

const createUserSchema = z.object({
  email: z.string()
    .trim()
    .email({ message: "Correo electrónico inválido" })
    .max(255, { message: "Máximo 255 caracteres" }),
  password: z.string()
    .min(6, { message: "La contraseña debe tener al menos 6 caracteres" })
    .max(100, { message: "Máximo 100 caracteres" }),
  nombreCompleto: z.string()
    .trim()
    .nonempty({ message: "El nombre completo es requerido" })
    .max(200, { message: "Máximo 200 caracteres" }),
  role: z.enum(['auxiliar', 'almacenista', 'lider', 'supervisor', 'gerente', 'gerente_operaciones', 'gerente_almacen', 'cadena_suministros', 'finanzas'], {
    message: "Selecciona un rol válido"
  }),
  unidad: z.string()
    .trim()
    .nonempty({ message: "Selecciona una unidad" }),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

const Usuarios = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [unidades, setUnidades] = useState<{ nombre: string; hospital: string }[]>([]);

  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      role: 'auxiliar',
      unidad: '',
    }
  });

  const roles: { value: UserRole; label: string; description: string }[] = [
    { 
      value: 'auxiliar', 
      label: 'Auxiliar de Anestesia',
      description: 'Registra folios e insumos'
    },
    { 
      value: 'almacenista', 
      label: 'Almacenista',
      description: 'Gestiona inventario'
    },
    { 
      value: 'lider', 
      label: 'Líder Hospitalario',
      description: 'Acceso a folios, insumos y reportes'
    },
    { 
      value: 'supervisor', 
      label: 'Supervisor Hospitalario',
      description: 'Gestión completa de unidades'
    },
    { 
      value: 'gerente', 
      label: 'Gerente de Operaciones',
      description: 'Control total del sistema'
    },
    { 
      value: 'gerente_operaciones', 
      label: 'Gerente de Operaciones',
      description: 'Control total del sistema'
    },
    { 
      value: 'gerente_almacen', 
      label: 'Gerente de Almacén',
      description: 'Gestión central de almacén'
    },
    { 
      value: 'cadena_suministros', 
      label: 'Cadena de Suministros',
      description: 'Planificación de suministros'
    },
    { 
      value: 'finanzas', 
      label: 'Finanzas',
      description: 'Aprobación de pagos'
    },
  ];

  useEffect(() => {
    const loadUnidades = async () => {
      // Primero cargar las unidades
      const { data: unidadesData } = await supabase
        .from('unidades')
        .select('nombre, hospital_id')
        .order('nombre');

      if (!unidadesData) return;

      // Luego cargar los hospitales por separado
      const { data: hospitalesData } = await supabase
        .from('hospitales')
        .select('id, nombre')
        .in('id', unidadesData.map(u => u.hospital_id));

      // Combinar los datos
      const hospitalesMap = new Map(
        hospitalesData?.map(h => [h.id, h.nombre]) || []
      );

      setUnidades(
        unidadesData.map((u: any) => ({
          nombre: u.nombre,
          hospital: hospitalesMap.get(u.hospital_id) || 'Sin hospital'
        }))
      );
    };

    loadUnidades();
  }, []);

  const handleCreateUser = async (data: CreateUserFormValues) => {
    setIsLoading(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('No autenticado', {
          description: 'Debes iniciar sesión primero',
        });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: data.email,
            password: data.password,
            nombre_completo: data.nombreCompleto,
            role: data.role,
            unidad: data.unidad,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al crear usuario');
      }

      toast.success('¡Usuario creado exitosamente!', {
        description: `Credenciales: ${data.email} / ${data.password}`,
      });
      
      form.reset();
    } catch (error: any) {
      toast.error('Error al crear usuario', {
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateAllUsers = async () => {
    setIsGeneratingAll(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('No autenticado', {
          description: 'Debes iniciar sesión primero',
        });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-all-users`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al crear usuarios');
      }

      toast.success('¡Usuarios generados exitosamente!', {
        description: `Gerentes: ${result.usuarios.gerente}, Líderes: ${result.usuarios.lideres}, Auxiliares: ${result.usuarios.auxiliares}, Almacenistas: ${result.usuarios.almacenistas}`,
        duration: 6000,
      });
      
    } catch (error: any) {
      toast.error('Error al generar usuarios', {
        description: error.message,
      });
    } finally {
      setIsGeneratingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gestión de Usuarios</h1>
        <p className="text-muted-foreground">
          Crea usuarios con credenciales personalizadas
        </p>
      </div>

      {/* Generación automática de usuarios */}
      <Card className="max-w-2xl border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Generar Usuarios Automáticamente
          </CardTitle>
          <CardDescription>
            Crea todos los usuarios del sistema (gerente, líderes, auxiliares y almacenistas) según la estructura organizacional
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2 text-sm">
              <p className="font-medium">Se crearán usuarios con este formato:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Gerente: gerente@imss.mx (contraseña: Gerente123!)</li>
                <li>Líderes: lider.chihuahua@imss.mx (contraseña: Lider123!)</li>
                <li>Auxiliares: auxiliar.durango.2@imss.mx (contraseña: Auxiliar123!)</li>
                <li>Almacenistas: almacenista.sonora@imss.mx (contraseña: Almacen123!)</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                * Los números indican múltiples usuarios del mismo rol en el mismo estado
              </p>
            </div>
            
            <Button 
              onClick={handleGenerateAllUsers} 
              disabled={isGeneratingAll}
              className="w-full"
              size="lg"
            >
              {isGeneratingAll ? 'Generando usuarios...' : 'Generar Todos los Usuarios'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Crear Nuevo Usuario
          </CardTitle>
          <CardDescription>
            Define las credenciales y el rol del nuevo usuario
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(handleCreateUser)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombreCompleto">Nombre Completo</Label>
              <Input
                id="nombreCompleto"
                type="text"
                placeholder="Juan Pérez García"
                {...form.register('nombreCompleto')}
              />
              {form.formState.errors.nombreCompleto && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.nombreCompleto.message}
                </p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="usuario@hospital.com"
                  {...form.register('email')}
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="text"
                  placeholder="Mínimo 6 caracteres"
                  {...form.register('password')}
                />
                {form.formState.errors.password && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="role">Rol en el Sistema</Label>
                <Select
                  onValueChange={(value) => form.setValue('role', value as UserRole)}
                  defaultValue="auxiliar"
                >
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {roles.find(r => r.value === form.watch('role'))?.description}
                </p>
                {form.formState.errors.role && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.role.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="unidad">Unidad</Label>
                <Select
                  onValueChange={(value) => form.setValue('unidad', value)}
                  defaultValue=""
                >
                  <SelectTrigger id="unidad">
                    <SelectValue placeholder="Selecciona una unidad" />
                  </SelectTrigger>
                  <SelectContent>
                    {unidades.map((unidad) => (
                      <SelectItem key={unidad.nombre} value={unidad.nombre}>
                        {unidad.nombre} - {unidad.hospital}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.unidad && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.unidad.message}
                  </p>
                )}
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Creando usuario...' : 'Crear Usuario'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="max-w-2xl bg-muted/50">
        <CardHeader>
          <CardTitle className="text-lg">Usuarios de Ejemplo</CardTitle>
          <CardDescription>
            Credenciales predefinidas para cada rol
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-background p-3">
              <p className="font-semibold">Gerente de Operaciones</p>
              <p className="text-muted-foreground">Email: gerente@hospital.com</p>
              <p className="text-muted-foreground">Contraseña: gerente123</p>
            </div>
            <div className="rounded-lg bg-background p-3">
              <p className="font-semibold">Supervisor Hospitalario</p>
              <p className="text-muted-foreground">Email: supervisor@hospital.com</p>
              <p className="text-muted-foreground">Contraseña: supervisor123</p>
            </div>
            <div className="rounded-lg bg-background p-3">
              <p className="font-semibold">Líder Hospitalario</p>
              <p className="text-muted-foreground">Email: lider@hospital.com</p>
              <p className="text-muted-foreground">Contraseña: lider123</p>
            </div>
            <div className="rounded-lg bg-background p-3">
              <p className="font-semibold">Almacenista</p>
              <p className="text-muted-foreground">Email: almacenista@hospital.com</p>
              <p className="text-muted-foreground">Contraseña: almacenista123</p>
            </div>
            <div className="rounded-lg bg-background p-3">
              <p className="font-semibold">Auxiliar de Anestesia</p>
              <p className="text-muted-foreground">Email: auxiliar@hospital.com</p>
              <p className="text-muted-foreground">Contraseña: auxiliar123</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Usuarios;
