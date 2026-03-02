import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, Search, Package } from "lucide-react";

interface InsumoConPrecio {
  id: string;
  nombre: string;
  clave: string;
  categoria: string;
  precioActual: number;
  precioId: string | null;
}

const FinanzasPreciosInsumos = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [insumos, setInsumos] = useState<InsumoConPrecio[]>([]);
  const [precios, setPrecios] = useState<Map<string, number>>(new Map());
  const [preciosOriginales, setPreciosOriginales] = useState<Map<string, { id: string; precio: number }>>(new Map());

  useEffect(() => {
    fetchInsumos();
  }, []);

  const fetchInsumos = async () => {
    try {
      setLoading(true);

      // Obtener catálogo de insumos
      const { data: catalogo, error: catalogoError } = await supabase
        .from("insumos_catalogo")
        .select("id, nombre, clave, categoria")
        .eq("activo", true)
        .order("nombre");

      if (catalogoError) throw catalogoError;

      // Obtener precios actuales
      const { data: preciosActuales } = await supabase
        .from("precios_insumos")
        .select("id, insumo_catalogo_id, precio_unitario")
        .eq("activo", true);

      // Crear mapa de precios
      const preciosMap = new Map<string, { id: string; precio: number }>();
      preciosActuales?.forEach(p => {
        preciosMap.set(p.insumo_catalogo_id, { 
          id: p.id, 
          precio: Number(p.precio_unitario) 
        });
      });

      // Combinar datos
      const insumosArray: InsumoConPrecio[] = (catalogo || []).map(insumo => {
        const precioInfo = preciosMap.get(insumo.id);
        return {
          id: insumo.id,
          nombre: insumo.nombre,
          clave: insumo.clave || '',
          categoria: insumo.categoria || 'Sin categoría',
          precioActual: precioInfo?.precio || 0,
          precioId: precioInfo?.id || null
        };
      });

      // Inicializar mapa de precios editables
      const preciosEditables = new Map<string, number>();
      insumosArray.forEach(i => {
        preciosEditables.set(i.id, i.precioActual);
      });

      setInsumos(insumosArray);
      setPrecios(preciosEditables);
      setPreciosOriginales(preciosMap);

    } catch (error) {
      console.error("Error fetching insumos:", error);
      toast.error("Error al cargar insumos");
    } finally {
      setLoading(false);
    }
  };

  const handlePrecioChange = (insumoId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    const newPrecios = new Map(precios);
    newPrecios.set(insumoId, numValue);
    setPrecios(newPrecios);
  };

  const guardarPrecios = async () => {
    try {
      setSaving(true);

      // Identificar cambios
      const cambios: { insumoId: string; precio: number; precioIdExistente: string | null }[] = [];
      
      precios.forEach((precio, insumoId) => {
        const original = preciosOriginales.get(insumoId);
        if (!original || original.precio !== precio) {
          cambios.push({
            insumoId,
            precio,
            precioIdExistente: original?.id || null
          });
        }
      });

      if (cambios.length === 0) {
        toast.info("No hay cambios que guardar");
        return;
      }

      // Procesar cambios
      for (const cambio of cambios) {
        if (cambio.precioIdExistente) {
          // Actualizar precio existente
          const { error } = await supabase
            .from("precios_insumos")
            .update({ precio_unitario: cambio.precio, updated_at: new Date().toISOString() })
            .eq("id", cambio.precioIdExistente);
          
          if (error) throw error;
        } else if (cambio.precio > 0) {
          // Crear nuevo precio
          const { error } = await supabase
            .from("precios_insumos")
            .insert({
              insumo_catalogo_id: cambio.insumoId,
              precio_unitario: cambio.precio,
              activo: true
            });
          
          if (error) throw error;
        }
      }

      toast.success(`${cambios.length} precios actualizados`);
      fetchInsumos(); // Recargar datos

    } catch (error) {
      console.error("Error saving precios:", error);
      toast.error("Error al guardar precios");
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2
    }).format(value);
  };

  // Filtrar insumos por búsqueda
  const insumosFiltrados = insumos.filter(i => 
    i.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.clave.toLowerCase().includes(searchTerm.toLowerCase()) ||
    i.categoria.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Agrupar por categoría
  const categorias = [...new Set(insumosFiltrados.map(i => i.categoria))].sort();

  // Calcular estadísticas
  const totalInsumos = insumos.length;
  const insumosConPrecio = insumos.filter(i => i.precioActual > 0).length;
  const insumosSinPrecio = totalInsumos - insumosConPrecio;

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Configuración de Precios de Insumos</h1>
          <p className="text-muted-foreground">Asignar precios unitarios para cálculo de costos</p>
        </div>
        <Button onClick={guardarPrecios} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Insumos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalInsumos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Con Precio Asignado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{insumosConPrecio}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sin Precio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{insumosSinPrecio}</div>
          </CardContent>
        </Card>
      </div>

      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, clave o categoría..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Tabla de insumos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Lista de Insumos ({insumosFiltrados.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[600px] overflow-y-auto">
            {categorias.map(categoria => (
              <div key={categoria} className="mb-6">
                <h3 className="font-semibold text-lg mb-2 sticky top-0 bg-background py-2 border-b">
                  {categoria}
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Clave</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="w-[150px]">Precio Actual</TableHead>
                      <TableHead className="w-[180px]">Nuevo Precio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {insumosFiltrados
                      .filter(i => i.categoria === categoria)
                      .map((insumo) => (
                        <TableRow key={insumo.id}>
                          <TableCell>
                            <Badge variant="outline">{insumo.clave || 'S/C'}</Badge>
                          </TableCell>
                          <TableCell className="font-medium max-w-[400px] truncate" title={insumo.nombre}>
                            {insumo.nombre}
                          </TableCell>
                          <TableCell>
                            {insumo.precioActual > 0 ? (
                              <span className="text-green-600">{formatCurrency(insumo.precioActual)}</span>
                            ) : (
                              <span className="text-muted-foreground">Sin precio</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={precios.get(insumo.id) || ''}
                              onChange={(e) => handlePrecioChange(insumo.id, e.target.value)}
                              placeholder="0.00"
                              className="w-full"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FinanzasPreciosInsumos;
