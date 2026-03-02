import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import * as XLSX from 'xlsx';

interface UserCredential {
  username: string;
  email: string;
  password: string;
  role: string;
  state_name: string | null;
  hospital_display_name: string | null;
  assigned_hospitals: string | null;
}

const GenerateCredentials = () => {
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState<UserCredential[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setCredentials([]);
    setSummary(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-users-from-table');

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data.success) {
        setCredentials(data.credentials);
        setSummary(data.summary);
      } else {
        setError(data.error || 'Error desconocido');
      }
    } catch (err: any) {
      setError(err.message || 'Error al generar credenciales');
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    if (credentials.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(
      credentials.map(cred => ({
        'Usuario': cred.username,
        'Correo Electrónico': cred.email,
        'Contraseña': cred.password,
        'Rol': cred.role,
        'Estado': cred.state_name || 'N/A',
        'Hospital': cred.hospital_display_name || 'N/A',
        'Hospitales Asignados': cred.assigned_hospitals || 'N/A'
      }))
    );

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Credenciales');

    XLSX.writeFile(workbook, `credenciales_usuarios_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Generar Credenciales de Usuarios</h1>
        <p className="text-muted-foreground">
          Esta herramienta genera credenciales de autenticación para todos los usuarios registrados en la tabla users.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Instrucciones</CardTitle>
          <CardDescription>
            Al hacer clic en el botón, se crearán cuentas de autenticación para todos los usuarios de la tabla 'users':
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground mb-4">
            <li><strong>Email:</strong> {"{username}"}@hospital.imss.gob.mx</li>
            <li><strong>Contraseña:</strong> IMSS2025{"{rol}"}</li>
            <li>Se crearán perfiles y roles automáticamente</li>
            <li>Los usuarios existentes serán omitidos</li>
          </ul>

          <Button 
            onClick={handleGenerate} 
            disabled={loading}
            size="lg"
            className="w-full sm:w-auto"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generando...
              </>
            ) : (
              'Generar Credenciales'
            )}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {summary && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Proceso Completado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{summary.total}</div>
                <div className="text-sm text-muted-foreground">Total</div>
              </div>
              <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{summary.created}</div>
                <div className="text-sm text-muted-foreground">Creados</div>
              </div>
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{summary.skipped}</div>
                <div className="text-sm text-muted-foreground">Ya Existían</div>
              </div>
              <div className="text-center p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{summary.errors}</div>
                <div className="text-sm text-muted-foreground">Errores</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {credentials.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Credenciales Generadas</CardTitle>
                <CardDescription>
                  {credentials.length} usuarios procesados
                </CardDescription>
              </div>
              <Button onClick={exportToExcel} variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Exportar a Excel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Usuario</th>
                    <th className="text-left p-2">Email</th>
                    <th className="text-left p-2">Contraseña</th>
                    <th className="text-left p-2">Rol</th>
                    <th className="text-left p-2">Estado</th>
                    <th className="text-left p-2">Hospital</th>
                  </tr>
                </thead>
                <tbody>
                  {credentials.map((cred, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/50">
                      <td className="p-2 font-mono text-xs">{cred.username}</td>
                      <td className="p-2 font-mono text-xs">{cred.email}</td>
                      <td className="p-2 font-mono text-xs font-bold">{cred.password}</td>
                      <td className="p-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          {cred.role}
                        </span>
                      </td>
                      <td className="p-2 text-xs">{cred.state_name || '-'}</td>
                      <td className="p-2 text-xs">{cred.hospital_display_name || cred.assigned_hospitals?.split(',')[0] || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default GenerateCredentials;
