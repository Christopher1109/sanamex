import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle, FileSpreadsheet } from "lucide-react";

export default function PopulateInsumos() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePopulate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("populate-all-insumos", {
        body: {}
      });

      if (fnError) {
        throw fnError;
      }

      setResult(data);
    } catch (err) {
      console.error("Error al poblar insumos:", err);
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6" />
            Poblar Catálogo de Insumos desde Excel
          </CardTitle>
          <CardDescription>
            Este proceso poblará el catálogo completo de insumos y sus relaciones por tipo de anestesia
            usando los datos de los archivos Excel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg">
            <h3 className="font-semibold mb-2">7 Tipos de Anestesia a procesar:</h3>
            <ul className="text-sm space-y-1 ml-4 list-disc">
              <li>Anestesia General Balanceada Adulto</li>
              <li>Anestesia General Balanceada Pediátrica</li>
              <li>Anestesia General Endovenosa</li>
              <li>Anestesia General de Alta Especialidad</li>
              <li>Anestesia de Alta Especialidad en Trasplante Renal</li>
              <li>Sedación</li>
              <li>Loco Regional</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-3">
              El proceso creará los insumos que no existan y asociará cada uno con su tipo de anestesia correspondiente.
            </p>
          </div>

          <Button
            onClick={handlePopulate}
            disabled={loading}
            size="lg"
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Procesando...
              </>
            ) : (
              "Iniciar Poblado"
            )}
          </Button>

          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Error:</strong> {error}
              </AlertDescription>
            </Alert>
          )}

          {result && (
            <Alert className="border-green-500 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold text-green-800">¡Proceso completado exitosamente!</p>
                  
                  <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                    <div className="bg-white p-3 rounded border">
                      <p className="text-muted-foreground">Total Insumos en BD</p>
                      <p className="text-2xl font-bold text-green-600">{result.totalInsumosEnBD}</p>
                    </div>
                    <div className="bg-white p-3 rounded border">
                      <p className="text-muted-foreground">Total Relaciones</p>
                      <p className="text-2xl font-bold text-green-600">{result.totalRelacionesEnBD}</p>
                    </div>
                    <div className="bg-white p-3 rounded border">
                      <p className="text-muted-foreground">Insumos Creados</p>
                      <p className="text-2xl font-bold text-blue-600">{result.insumosCreados}</p>
                    </div>
                    <div className="bg-white p-3 rounded border">
                      <p className="text-muted-foreground">Relaciones Creadas</p>
                      <p className="text-2xl font-bold text-blue-600">{result.relacionesCreadas}</p>
                    </div>
                  </div>

                  {result.porTipoAnestesia && (
                    <div className="mt-4 bg-white p-4 rounded border">
                      <p className="font-semibold mb-2">Por Tipo de Anestesia:</p>
                      <div className="space-y-2">
                        {Object.entries(result.porTipoAnestesia).map(([tipo, data]: [string, any]) => (
                          <div key={tipo} className="flex justify-between items-start border-b pb-2">
                            <div>
                              <p className="font-medium capitalize">{tipo.replace(/_/g, " ")}</p>
                              {data.ejemplos && data.ejemplos.length > 0 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Ejemplos: {data.ejemplos.slice(0, 2).join(", ")}...
                                </p>
                              )}
                            </div>
                            <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-semibold">
                              {data.total} insumos
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
