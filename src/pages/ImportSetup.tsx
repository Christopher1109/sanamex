import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface UserCredentials {
  nombre: string;
  email: string;
  password: string;
  rol: string;
  hospital?: string;
  estado?: string;
  hospitales_asignados?: string[];
}

interface ImportResult {
  success: boolean;
  summary: {
    estados: number;
    hospitales: number;
    procedimientos: number;
    usuarios: number;
  };
  usuarios: UserCredentials[];
}

const ImportSetup = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  // Hardcoded data from PDF
  const hospitalData = [
    // Baja California
    { estado: "Baja California", clave: "020115182151", tipo: "HGPMF", numero: "31", localidad: "Mexicali", procedimiento: "Anestesia General Balanceada Adulto" },
    { estado: "Baja California", clave: "020115182151", tipo: "HGPMF", numero: "31", localidad: "Mexicali", procedimiento: "Anestesia General de Alta Especialidad" },
    { estado: "Baja California", clave: "020115182151", tipo: "HGPMF", numero: "31", localidad: "Mexicali", procedimiento: "Anestesia General Endovenosa" },
    { estado: "Baja California", clave: "020115182151", tipo: "HGPMF", numero: "31", localidad: "Mexicali", procedimiento: "Anestesia General Balanceada Pediátrica" },
    { estado: "Baja California", clave: "020115182151", tipo: "HGPMF", numero: "31", localidad: "Mexicali", procedimiento: "Anestesia Loco Regional" },
    { estado: "Baja California", clave: "020115182151", tipo: "HGPMF", numero: "31", localidad: "Mexicali", procedimiento: "Sedación" },
    { estado: "Baja California", clave: "020532062151", tipo: "HGR", numero: "1", localidad: "Tijuana", procedimiento: "Anestesia General Balanceada Adulto" },
    { estado: "Baja California", clave: "020532062151", tipo: "HGR", numero: "1", localidad: "Tijuana", procedimiento: "Anestesia General de Alta Especialidad" },
    { estado: "Baja California", clave: "020532062151", tipo: "HGR", numero: "1", localidad: "Tijuana", procedimiento: "Anestesia General Endovenosa" },
    { estado: "Baja California", clave: "020532062151", tipo: "HGR", numero: "1", localidad: "Tijuana", procedimiento: "Anestesia General Balanceada Pediátrica" },
    { estado: "Baja California", clave: "020532062151", tipo: "HGR", numero: "1", localidad: "Tijuana", procedimiento: "Anestesia Loco Regional" },
    { estado: "Baja California", clave: "020532062151", tipo: "HGR", numero: "1", localidad: "Tijuana", procedimiento: "Sedación" },
    { estado: "Baja California", clave: "020507062151", tipo: "HGR", numero: "20", localidad: "Tijuana", procedimiento: "Anestesia General Balanceada Adulto" },
    { estado: "Baja California", clave: "020507062151", tipo: "HGR", numero: "20", localidad: "Tijuana", procedimiento: "Anestesia General de Alta Especialidad" },
    { estado: "Baja California", clave: "020507062151", tipo: "HGR", numero: "20", localidad: "Tijuana", procedimiento: "Anestesia General Endovenosa" },
    { estado: "Baja California", clave: "020507062151", tipo: "HGR", numero: "20", localidad: "Tijuana", procedimiento: "Anestesia General Balanceada Pediátrica" },
    { estado: "Baja California", clave: "020507062151", tipo: "HGR", numero: "20", localidad: "Tijuana", procedimiento: "Anestesia Loco Regional" },
    { estado: "Baja California", clave: "020507062151", tipo: "HGR", numero: "20", localidad: "Tijuana", procedimiento: "Sedación" },
    { estado: "Baja California", clave: "020101012151", tipo: "HGZ", numero: "30", localidad: "Mexicali", procedimiento: "Anestesia General Balanceada Adulto" },
    { estado: "Baja California", clave: "020101012151", tipo: "HGZ", numero: "30", localidad: "Mexicali", procedimiento: "Anestesia General de Alta Especialidad" },
    { estado: "Baja California", clave: "020101012151", tipo: "HGZ", numero: "30", localidad: "Mexicali", procedimiento: "Anestesia General Endovenosa" },
    { estado: "Baja California", clave: "020101012151", tipo: "HGZ", numero: "30", localidad: "Mexicali", procedimiento: "Anestesia General Balanceada Pediátrica" },
    { estado: "Baja California", clave: "020101012151", tipo: "HGZ", numero: "30", localidad: "Mexicali", procedimiento: "Anestesia Loco Regional" },
    { estado: "Baja California", clave: "020101012151", tipo: "HGZ", numero: "30", localidad: "Mexicali", procedimiento: "Sedación" },
    { estado: "Baja California", clave: "020301022151", tipo: "HGZMF", numero: "8", localidad: "Ensenada", procedimiento: "Anestesia General Balanceada Adulto" },
    { estado: "Baja California", clave: "020301022151", tipo: "HGZMF", numero: "8", localidad: "Ensenada", procedimiento: "Anestesia General de Alta Especialidad" },
    { estado: "Baja California", clave: "020301022151", tipo: "HGZMF", numero: "8", localidad: "Ensenada", procedimiento: "Anestesia General Endovenosa" },
    { estado: "Baja California", clave: "020301022151", tipo: "HGZMF", numero: "8", localidad: "Ensenada", procedimiento: "Anestesia General Balanceada Pediátrica" },
    { estado: "Baja California", clave: "020301022151", tipo: "HGZMF", numero: "8", localidad: "Ensenada", procedimiento: "Anestesia Loco Regional" },
    { estado: "Baja California", clave: "020301022151", tipo: "HGZMF", numero: "8", localidad: "Ensenada", procedimiento: "Sedación" },
    
    // Baja California Sur
    { estado: "Baja California Sur", clave: "030103022151", tipo: "HGZMF", numero: "1", localidad: "La Paz", procedimiento: "Anestesia General Balanceada Adulto" },
    { estado: "Baja California Sur", clave: "030103022151", tipo: "HGZMF", numero: "1", localidad: "La Paz", procedimiento: "Anestesia General de Alta Especialidad" },
    { estado: "Baja California Sur", clave: "030103022151", tipo: "HGZMF", numero: "1", localidad: "La Paz", procedimiento: "Anestesia General Endovenosa" },
    { estado: "Baja California Sur", clave: "030103022151", tipo: "HGZMF", numero: "1", localidad: "La Paz", procedimiento: "Anestesia General Balanceada Pediátrica" },
    { estado: "Baja California Sur", clave: "030103022151", tipo: "HGZMF", numero: "1", localidad: "La Paz", procedimiento: "Anestesia Loco Regional" },
    { estado: "Baja California Sur", clave: "030103022151", tipo: "HGZMF", numero: "1", localidad: "La Paz", procedimiento: "Sedación" },
    
    // Coahuila
    { estado: "Coahuila", clave: "051201012151", tipo: "HGZ", numero: "11", localidad: "Piedras Negras", procedimiento: "Anestesia General Balanceada Adulto" },
    { estado: "Coahuila", clave: "051201012151", tipo: "HGZ", numero: "11", localidad: "Piedras Negras", procedimiento: "Anestesia General de Alta Especialidad" },
    { estado: "Coahuila", clave: "051201012151", tipo: "HGZ", numero: "11", localidad: "Piedras Negras", procedimiento: "Anestesia General Endovenosa" },
    { estado: "Coahuila", clave: "051201012151", tipo: "HGZ", numero: "11", localidad: "Piedras Negras", procedimiento: "Anestesia General Balanceada Pediátrica" },
    { estado: "Coahuila", clave: "051201012151", tipo: "HGZ", numero: "11", localidad: "Piedras Negras", procedimiento: "Anestesia Loco Regional" },
    { estado: "Coahuila", clave: "051201012151", tipo: "HGZ", numero: "11", localidad: "Piedras Negras", procedimiento: "Sedación" },
    
    // Chihuahua
    { estado: "Chihuahua", clave: "080601012151", tipo: "HGZ", numero: "6", localidad: "Ciudad Juárez", procedimiento: "Anestesia General Balanceada Adulto" },
    { estado: "Chihuahua", clave: "080601012151", tipo: "HGZ", numero: "6", localidad: "Ciudad Juárez", procedimiento: "Anestesia General de Alta Especialidad" },
    { estado: "Chihuahua", clave: "080601012151", tipo: "HGZ", numero: "6", localidad: "Ciudad Juárez", procedimiento: "Anestesia General Endovenosa" },
    { estado: "Chihuahua", clave: "080601012151", tipo: "HGZ", numero: "6", localidad: "Ciudad Juárez", procedimiento: "Anestesia General Balanceada Pediátrica" },
    { estado: "Chihuahua", clave: "080601012151", tipo: "HGZ", numero: "6", localidad: "Ciudad Juárez", procedimiento: "Anestesia Loco Regional" },
    { estado: "Chihuahua", clave: "080601012151", tipo: "HGZ", numero: "6", localidad: "Ciudad Juárez", procedimiento: "Sedación" },
    
    // Nuevo León
    { estado: "Nuevo León", clave: "190101012151", tipo: "HGZ", numero: "33", localidad: "Monterrey", procedimiento: "Anestesia General Balanceada Adulto" },
    { estado: "Nuevo León", clave: "190101012151", tipo: "HGZ", numero: "33", localidad: "Monterrey", procedimiento: "Anestesia General de Alta Especialidad" },
    { estado: "Nuevo León", clave: "190101012151", tipo: "HGZ", numero: "33", localidad: "Monterrey", procedimiento: "Anestesia General Endovenosa" },
    { estado: "Nuevo León", clave: "190101012151", tipo: "HGZ", numero: "33", localidad: "Monterrey", procedimiento: "Anestesia General Balanceada Pediátrica" },
    { estado: "Nuevo León", clave: "190101012151", tipo: "HGZ", numero: "33", localidad: "Monterrey", procedimiento: "Anestesia Loco Regional" },
    { estado: "Nuevo León", clave: "190101012151", tipo: "HGZ", numero: "33", localidad: "Monterrey", procedimiento: "Sedación" },
    { estado: "Nuevo León", clave: "191509062151", tipo: "HGR", numero: "67", localidad: "Guadalupe", procedimiento: "Anestesia General Balanceada Adulto" },
    { estado: "Nuevo León", clave: "191509062151", tipo: "HGR", numero: "67", localidad: "Guadalupe", procedimiento: "Anestesia General de Alta Especialidad" },
    { estado: "Nuevo León", clave: "191509062151", tipo: "HGR", numero: "67", localidad: "Guadalupe", procedimiento: "Anestesia General Endovenosa" },
    { estado: "Nuevo León", clave: "191509062151", tipo: "HGR", numero: "67", localidad: "Guadalupe", procedimiento: "Anestesia General Balanceada Pediátrica" },
    { estado: "Nuevo León", clave: "191509062151", tipo: "HGR", numero: "67", localidad: "Guadalupe", procedimiento: "Anestesia Loco Regional" },
    { estado: "Nuevo León", clave: "191509062151", tipo: "HGR", numero: "67", localidad: "Guadalupe", procedimiento: "Sedación" },
  ];

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('import-and-setup', {
        body: { data: hospitalData }
      });

      if (error) throw error;

      setResult(data);
      toast.success('Sistema generado exitosamente');
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message);
      toast.error('Error al generar el sistema');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('¿Estás seguro de eliminar TODOS los datos del sistema?')) {
      return;
    }

    setResetting(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke('reset-system');

      if (error) throw error;

      toast.success('Sistema limpiado exitosamente');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message);
      toast.error('Error al limpiar el sistema');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Importar Datos y Generar Sistema</CardTitle>
            <CardDescription>
              Este proceso importará estados, hospitales, procedimientos y generará usuarios automáticamente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-destructive/10 border border-destructive rounded-lg space-y-3">
              <p className="font-medium text-destructive">⚠️ Primero debes limpiar el sistema</p>
              <p className="text-sm">Elimina todos los usuarios y datos viejos antes de importar.</p>
              <Button 
                onClick={handleReset} 
                disabled={resetting}
                variant="destructive"
              >
                {resetting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Limpiando...
                  </>
                ) : (
                  'Limpiar Sistema Completo'
                )}
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <Button onClick={handleImport} disabled={loading} size="lg">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Generar Sistema
                  </>
                )}
              </Button>
            </div>

            {error && (
              <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive rounded-lg">
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">Error</p>
                  <p className="text-sm text-muted-foreground">{error}</p>
                </div>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-primary/10 border border-primary rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Sistema generado exitosamente</p>
                  </div>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Resumen</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Estados</p>
                      <p className="text-2xl font-bold">{result.summary.estados}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Hospitales</p>
                      <p className="text-2xl font-bold">{result.summary.hospitales}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Procedimientos</p>
                      <p className="text-2xl font-bold">{result.summary.procedimientos}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Usuarios</p>
                      <p className="text-2xl font-bold">{result.summary.usuarios}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Usuarios Generados</CardTitle>
                    <CardDescription>Credenciales de acceso</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {result.usuarios.map((user, index) => (
                        <div key={index} className="p-3 border rounded-lg space-y-1 bg-card">
                          <div className="flex items-center justify-between">
                            <p className="font-medium">{user.nombre}</p>
                            <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded">
                              {user.rol}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Email:</span>{" "}
                              <span className="font-mono">{user.email}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Password:</span>{" "}
                              <span className="font-mono">{user.password}</span>
                            </div>
                          </div>
                          {user.hospital && (
                            <p className="text-xs text-muted-foreground">Hospital: {user.hospital}</p>
                          )}
                          {user.hospitales_asignados && (
                            <p className="text-xs text-muted-foreground">
                              Hospitales: {user.hospitales_asignados.join(", ")}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ImportSetup;
