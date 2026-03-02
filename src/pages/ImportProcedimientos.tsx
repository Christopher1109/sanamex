import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";

export default function ImportProcedimientos() {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<{
    processed: number;
    created: number;
    skipped: number;
    errors: number;
  } | null>(null);

  const handleImport = async (file: File) => {
    setLoading(true);
    setSummary(null);

    try {
      // Leer el archivo Excel
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);

      console.log("Datos del Excel:", rawData);

      // Transformar los datos al formato esperado
      const data = rawData.map((row) => ({
        estado: row["ESTADO"],
        tipo: row["Tipo"],
        numero: String(row["Número DE CLINICA"]),
        localidad: row["Localidad"],
        procedimientos: row["Procedimiento"],
      }));

      console.log("Datos transformados:", data);

      // Llamar a la edge function
      const { data: result, error } = await supabase.functions.invoke("import-procedimientos-hospital", {
        body: { data },
      });

      if (error) throw error;

      console.log("Resultado:", result);

      if (result.success) {
        setSummary({
          processed: result.processed,
          created: result.created,
          skipped: result.skipped,
          errors: result.errors,
        });
        toast.success(`Procedimientos importados correctamente`);
      } else {
        throw new Error(result.error || "Error desconocido");
      }
    } catch (error) {
      console.error("Error al importar:", error);
      toast.error(error instanceof Error ? error.message : "Error al importar procedimientos");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImport(file);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-6 w-6" />
            Importar Procedimientos por Hospital
          </CardTitle>
          <CardDescription>
            Carga el archivo Excel con la tabla de procedimientos asignados a cada hospital.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="border-2 border-dashed border-muted rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                disabled={loading}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-md ${
                  loading
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Seleccionar archivo Excel
                  </>
                )}
              </label>
              <p className="text-sm text-muted-foreground mt-4">
                Formatos soportados: .xlsx, .xls
              </p>
            </div>

            {summary && (
              <Card className="bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-lg">Resumen de Importación</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Filas procesadas:</span>
                    <span className="font-medium">{summary.processed}</span>
                  </div>
                  <div className="flex items-center justify-between text-green-600">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Procedimientos creados:
                    </span>
                    <span className="font-medium">{summary.created}</span>
                  </div>
                  <div className="flex items-center justify-between text-yellow-600">
                    <span className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Hospitales omitidos:
                    </span>
                    <span className="font-medium">{summary.skipped}</span>
                  </div>
                  {summary.errors > 0 && (
                    <div className="flex items-center justify-between text-red-600">
                      <span className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Errores:
                      </span>
                      <span className="font-medium">{summary.errors}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-medium">Formato esperado del Excel:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Columna "ESTADO": Nombre del estado</li>
              <li>Columna "Tipo": Tipo de hospital (HGO, HGR, HGZ, etc.)</li>
              <li>Columna "Número DE CLINICA": Número de clínica</li>
              <li>Columna "Localidad": Localidad del hospital</li>
              <li>Columna "Procedimiento": Lista de procedimientos separados por comas</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
