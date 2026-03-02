import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Package, Database, CheckCircle } from "lucide-react";

export default function SetupAlmacenes() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSetup = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('setup-almacenes');
      
      if (error) throw error;
      
      setResult(data);
      toast.success("Almacenes e inventarios configurados correctamente");
    } catch (error: any) {
      console.error('Error:', error);
      toast.error(error.message || "Error al configurar almacenes");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Configuración de Almacenes</h1>
          <p className="text-muted-foreground">
            Genera automáticamente almacenes e inventarios para todos los hospitales del sistema
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Setup Automático de Inventarios
            </CardTitle>
            <CardDescription>
              Este proceso creará:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Un almacén para cada hospital en el sistema</li>
                <li>Catálogo maestro de insumos basado en insumos reales</li>
                <li>Inventario inicial para cada hospital con cantidades diferentes</li>
                <li>Lotes y fechas de caducidad aleatorias para pruebas</li>
              </ul>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Package className="h-4 w-4" />
              <AlertDescription>
                Los insumos se obtienen del catálogo real del sistema (tabla de insumos existente).
                Cada hospital tendrá cantidades iniciales diferentes para validar la independencia del inventario.
              </AlertDescription>
            </Alert>

            <Button
              onClick={handleSetup}
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Configurando almacenes...
                </>
              ) : (
                <>
                  <Database className="mr-2 h-4 w-4" />
                  Iniciar Configuración
                </>
              )}
            </Button>

            {result && (
              <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
                    <CheckCircle className="h-5 w-5" />
                    Configuración Completada
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Almacenes creados</p>
                      <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                        {result.stats?.almacenesCreados || 0}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Registros de inventario</p>
                      <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                        {result.stats?.inventariosCreados || 0}
                      </p>
                    </div>
                  </div>

                  {result.stats?.hospitales && result.stats.hospitales.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Detalle por hospital:</p>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {result.stats.hospitales.map((h: any, i: number) => (
                          <div
                            key={i}
                            className="p-3 bg-background rounded-lg border text-sm"
                          >
                            <p className="font-medium">{h.nombre}</p>
                            <p className="text-muted-foreground">
                              {h.insumos} insumos • {h.rangoStock}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
