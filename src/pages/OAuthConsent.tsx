import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

// Beta auth.oauth typed wrapper
type OauthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};
const authOauth = (): OauthApi => (supabase.auth as any).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Falta el parámetro authorization_id.");
        setLoading(false);
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        navigate(`/auth?next=${encodeURIComponent(next)}`, { replace: true });
        return;
      }
      const api = authOauth();
      if (!api?.getAuthorizationDetails) {
        setError("El servidor OAuth no está disponible en este proyecto.");
        setLoading(false);
        return;
      }
      const { data, error } = await api.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message ?? "No se pudo cargar la solicitud.");
        setLoading(false);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [authorizationId, navigate]);

  async function decide(approve: boolean) {
    setBusy(true);
    const api = authOauth();
    const { data, error } = approve
      ? await api.approveAuthorization(authorizationId)
      : await api.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message ?? "Error procesando la autorización.");
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("El servidor no devolvió una URL de redirección.");
      return;
    }
    window.location.href = target;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando solicitud…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>No se pudo cargar la autorización</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const clientName = details?.client?.name ?? details?.client?.client_name ?? "una aplicación externa";
  const scopes: string[] = details?.scopes ?? details?.requested_scopes ?? [];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Conectar {clientName} a tu cuenta de Sanamex ERP</CardTitle>
          <CardDescription>
            Esta aplicación podrá usar las herramientas del ERP actuando como tú.
            Se respetarán todos tus permisos por módulo y las políticas de seguridad (RLS) del sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {scopes.length > 0 && (
            <div className="text-sm">
              <p className="font-medium mb-1">Permisos solicitados:</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {scopes.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            No estás compartiendo tu contraseña. Puedes revocar el acceso en cualquier momento
            cerrando la conexión desde la aplicación externa.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => decide(false)} disabled={busy}>
              Cancelar conexión
            </Button>
            <Button onClick={() => decide(true)} disabled={busy}>
              {busy ? "Procesando…" : "Aprobar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
