import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface UserResult {
  nombre: string;
  email: string;
  password: string;
  rol: string;
  estado: string;
  hospital: string;
  hospitales_asignados: string;
}

export default function AutoSetup() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [result, setResult] = useState<{
    users: UserResult[];
    skippedCount: number;
    totalInSystem: number;
    summary: {
      empresa: string;
      estados: number;
      hospitales: number;
      usuarios: number;
      usuariosExistentes: number;
      totalUsuarios: number;
    };
  } | null>(null);
  const [error, setError] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    const setupSystem = async () => {
      try {
        // Fetch the Excel file
        const response = await fetch('/usuarios_lovable_generados.xlsx');
        const blob = await response.blob();
        const file = new File([blob], 'usuarios_lovable_generados.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });

        // Read Excel in frontend
        const XLSX = await import('xlsx');
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const excelData = XLSX.utils.sheet_to_json(worksheet);

        console.log('Excel data loaded:', excelData.length, 'rows');

        // Call edge function
        const { data: { session } } = await supabase.auth.getSession();
        
        const apiResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/populate-from-excel`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: excelData }),
          }
        );

        const data = await apiResponse.json();
        
        if (!apiResponse.ok) {
          throw new Error(data.error || 'Error al procesar');
        }

        setResult(data);
        setStatus('success');
        
        toast({
          title: "¡Sistema Configurado!",
          description: data.summary.usuarios > 0
            ? `${data.summary.usuarios} usuarios creados en ${data.summary.estados} estados y ${data.summary.hospitales} hospitales`
            : `Sistema ya configurado. Total: ${data.summary.totalUsuarios} usuarios en ${data.summary.estados} estados y ${data.summary.hospitales} hospitales`,
        });
      } catch (err: any) {
        console.error('Error:', err);
        setError(err.message);
        setStatus('error');
        toast({
          title: "Error",
          description: err.message,
          variant: "destructive"
        });
      }
    };

    setupSystem();
  }, [toast]);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Configuración Automática del Sistema</h1>
        <p className="text-muted-foreground mb-8">
          Generando estructura completa de multitenancy desde el archivo Excel...
        </p>

        {status === 'loading' && (
          <Card className="p-8 text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
            <h2 className="text-xl font-semibold mb-2">Procesando...</h2>
            <p className="text-muted-foreground">
              Creando empresa, estados, hospitales, unidades y usuarios. Esto puede tomar algunos minutos.
            </p>
          </Card>
        )}

        {status === 'error' && (
          <Card className="p-8 text-center border-red-500">
            <XCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h2 className="text-xl font-semibold mb-2 text-red-600">Error en la Configuración</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
          </Card>
        )}

        {status === 'success' && result && (
          <>
            <Card className="p-6 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <h2 className="text-xl font-semibold text-green-600">¡Sistema Configurado Exitosamente!</h2>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{result.summary.empresa}</div>
                  <div className="text-sm text-muted-foreground">Empresa</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{result.summary.estados}</div>
                  <div className="text-sm text-muted-foreground">Estados</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{result.summary.hospitales}</div>
                  <div className="text-sm text-muted-foreground">Hospitales</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">
                    {result.summary.usuarios > 0 ? result.summary.usuarios : result.summary.totalUsuarios}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {result.summary.usuarios > 0 ? 'Nuevos Usuarios' : 'Total Usuarios'}
                  </div>
                  {result.summary.usuariosExistentes > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      ({result.summary.usuariosExistentes} ya existían)
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">
                {result.users.length > 0 ? 'Usuarios Generados' : 'Estado del Sistema'}
              </h2>
              
              {result.users.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-muted-foreground">
                    Todos los usuarios del archivo Excel ya existen en el sistema.
                    <br />
                    <span className="font-semibold">Total de usuarios en el sistema: {result.summary.totalUsuarios}</span>
                  </p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Password</TableHead>
                        <TableHead>Rol</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Hospital</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.users.map((user, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium text-sm">{user.nombre}</TableCell>
                          <TableCell className="text-xs">{user.email}</TableCell>
                          <TableCell className="text-xs font-mono">{user.password}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded text-xs ${
                              user.rol.includes('Gerente') ? 'bg-blue-100 text-blue-800' :
                              user.rol.includes('Supervisor') ? 'bg-purple-100 text-purple-800' :
                              user.rol.includes('Líder') ? 'bg-green-100 text-green-800' :
                              user.rol.includes('Auxiliar') ? 'bg-orange-100 text-orange-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {user.rol}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">{user.estado}</TableCell>
                          <TableCell className="text-xs">{user.hospital}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>

            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Próximos Pasos</h2>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Todos los usuarios han sido creados con la contraseña: <code className="font-mono bg-muted px-1 py-0.5 rounded">imss2024</code></span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Cada hospital tiene 2 unidades: Quirófano y Almacén</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>El acceso está restringido por alcance organizacional (empresa, estado, hospital)</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Puedes iniciar sesión con cualquiera de los usuarios generados</span>
                </li>
              </ul>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
