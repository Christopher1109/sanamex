import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Wrench, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface FixResult {
  success: boolean;
  fixed: number;
  errors: number;
  total: number;
}

const FixUsers = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FixResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFix = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('fix-users');

      if (error) throw error;

      setResult(data);
      toast.success('Usuarios reparados exitosamente');
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message);
      toast.error('Error al reparar usuarios');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Reparar Usuarios</CardTitle>
            <CardDescription>
              Este proceso completará los perfiles y roles de usuarios que fueron creados sin completar el proceso
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Button onClick={handleFix} disabled={loading} size="lg">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Reparando...
                  </>
                ) : (
                  <>
                    <Wrench className="mr-2 h-4 w-4" />
                    Reparar Usuarios
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
                  <div className="space-y-2">
                    <p className="font-medium">Proceso completado</p>
                    <div className="text-sm space-y-1">
                      <p>✓ <strong>{result.fixed}</strong> usuarios reparados</p>
                      <p>✗ <strong>{result.errors}</strong> errores</p>
                      <p>📊 <strong>{result.total}</strong> usuarios totales procesados</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">Ahora puedes iniciar sesión con:</p>
                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Gerente de Operaciones:</p>
                      <p className="font-mono">gerente.operaciones@imss.mx / Gerente2025!</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">O cualquier otro usuario del sistema</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FixUsers;
