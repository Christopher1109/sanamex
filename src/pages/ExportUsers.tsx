import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2, Users, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ExportUsers = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [states, setStates] = useState<Array<{ name: string }>>([]);
  const [selectedState, setSelectedState] = useState<string>("");

  useEffect(() => {
    const fetchStates = async () => {
      const { data } = await supabase
        .from('states')
        .select('name')
        .order('name');
      if (data) setStates(data);
    };
    fetchStates();
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      console.log("Iniciando descarga de Excel...");
      
      // Obtener el token de sesión
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("No hay sesión activa");
      }

      // Hacer la petición directa al edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-users-excel`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ state_name: selectedState || undefined }),
        }
      );

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      // Convertir la respuesta a blob
      const blob = await response.blob();
      
      // Crear URL temporal y descargar
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const fileName = selectedState 
        ? `usuarios_${selectedState.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`
        : `usuarios_sistema_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(`Excel descargado exitosamente${selectedState ? ` - ${selectedState}` : ''}`);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al exportar usuarios");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-2xl">Exportar Usuarios</CardTitle>
                <CardDescription>
                  Descarga un archivo Excel con todos los usuarios del sistema
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filtrar por estado (opcional)
              </label>
              <Select value={selectedState} onValueChange={setSelectedState}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos los estados</SelectItem>
                  {states.map((state) => (
                    <SelectItem key={state.name} value={state.name}>
                      {state.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Download className="h-4 w-4" />
                Información incluida en el Excel:
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1.5 ml-6 list-disc">
                <li>Nombre de usuario (username)</li>
                <li>Correo electrónico</li>
                <li>Rol asignado</li>
                <li>Hospital asignado</li>
                <li>Código de presupuesto del hospital</li>
                <li>Estado</li>
                <li>Hospitales asignados (para supervisores)</li>
                <li>Grupo de supervisor</li>
                <li>Fecha de creación</li>
              </ul>
            </div>

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
              <p className="text-sm text-amber-900 dark:text-amber-200">
                <strong>Nota importante:</strong> Por razones de seguridad, las contraseñas no se pueden exportar 
                ya que están encriptadas en el sistema. Si necesitas resetear contraseñas, contacta al administrador.
              </p>
            </div>

            <Button 
              onClick={handleExport}
              disabled={isExporting}
              size="lg"
              className="w-full"
            >
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Generando Excel...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-5 w-5" />
                  Descargar Excel de Usuarios
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              El archivo se descargará automáticamente con el nombre: 
              <br />
              <code className="bg-muted px-2 py-1 rounded mt-1 inline-block">
                usuarios_sistema_[fecha].xlsx
              </code>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ExportUsers;
