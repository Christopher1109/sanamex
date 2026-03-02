import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
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

export default function SetupData() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    users: UserResult[];
    summary: {
      empresa: string;
      estados: number;
      hospitales: number;
      usuarios: number;
    };
  } | null>(null);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
        setFile(selectedFile);
        setResult(null);
      } else {
        toast({
          title: "Archivo inválido",
          description: "Por favor selecciona un archivo Excel (.xlsx o .xls)",
          variant: "destructive"
        });
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({ title: "Error", description: "Por favor selecciona un archivo Excel", variant: "destructive" });
      return;
    }

    setLoading(true);
    
    try {
      // Read Excel in frontend
      const XLSX = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const excelData = XLSX.utils.sheet_to_json(worksheet);

      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
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

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al procesar');

      setResult(data);
      toast({ title: "¡Éxito!", description: data.message });
    } catch (error: any) {
      console.error('Error:', error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Configuración Inicial del Sistema</h1>
        <p className="text-muted-foreground mb-8">
          Sube un archivo Excel con la estructura de Estados y Hospitales para generar automáticamente todo el sistema multitenancy.
        </p>

        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Cargar Datos desde Excel</h2>
          <p className="text-sm text-muted-foreground mb-4">
            El archivo debe contener las columnas: Nombre_Usuario, Rol, Estado, Hospital, Hospitales_Asignados
          </p>
          
          <div className="space-y-4">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-primary file:text-primary-foreground
                hover:file:bg-primary/90"
            />
            
            <Button 
              onClick={handleUpload} 
              disabled={!file || loading}
              className="w-full"
            >
              {loading ? 'Procesando...' : 'Cargar y Generar Sistema'}
            </Button>
          </div>
        </Card>

        {result && (
          <>
            <Card className="p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4 text-green-600">¡Sistema Configurado Exitosamente!</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
                  <div className="text-2xl font-bold">{result.summary.usuarios}</div>
                  <div className="text-sm text-muted-foreground">Usuarios</div>
                </div>
              </div>
            </Card>

            <Card className="p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Usuarios Generados</h2>
              <div className="overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre Usuario</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Password</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Hospital</TableHead>
                      <TableHead>Hospitales Asignados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.users.map((user, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{user.nombre}</TableCell>
                        <TableCell className="text-sm">{user.email}</TableCell>
                        <TableCell className="text-sm font-mono">{user.password}</TableCell>
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
                        <TableCell className="text-sm">{user.estado}</TableCell>
                        <TableCell className="text-sm">{user.hospital}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{user.hospitales_asignados}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )}

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Credenciales de Acceso</h2>
          <div className="space-y-4">
            <div className="border-l-4 border-blue-500 pl-4">
              <h3 className="font-semibold">Gerente de Operaciones</h3>
              <p className="text-sm text-muted-foreground">Email: gerente.operaciones@imss.mx</p>
              <p className="text-sm text-muted-foreground">Password: imss2024</p>
              <p className="text-xs text-muted-foreground mt-1">Acceso completo a todos los estados y hospitales</p>
            </div>
            
            <div className="border-l-4 border-purple-500 pl-4">
              <h3 className="font-semibold">Supervisores</h3>
              <p className="text-sm text-muted-foreground">Email: supervisor.[estado].[numero]@imss.mx</p>
              <p className="text-sm text-muted-foreground">Password: imss2024</p>
              <p className="text-xs text-muted-foreground mt-1">Ejemplo: supervisor.chihuahua.1@imss.mx</p>
            </div>
            
            <div className="border-l-4 border-green-500 pl-4">
              <h3 className="font-semibold">Líderes</h3>
              <p className="text-sm text-muted-foreground">Email: lider.[estado].[hospital]@imss.mx</p>
              <p className="text-sm text-muted-foreground">Password: imss2024</p>
              <p className="text-xs text-muted-foreground mt-1">Acceso a su hospital específico</p>
            </div>
            
            <div className="border-l-4 border-orange-500 pl-4">
              <h3 className="font-semibold">Auxiliares</h3>
              <p className="text-sm text-muted-foreground">Email: auxiliar.[estado].[hospital]@imss.mx</p>
              <p className="text-sm text-muted-foreground">Password: imss2024</p>
            </div>
            
            <div className="border-l-4 border-yellow-500 pl-4">
              <h3 className="font-semibold">Almacenistas</h3>
              <p className="text-sm text-muted-foreground">Email: almacenista.[estado].[hospital]@imss.mx</p>
              <p className="text-sm text-muted-foreground">Password: imss2024</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
