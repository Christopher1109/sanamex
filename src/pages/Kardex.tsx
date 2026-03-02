import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useHospital } from '@/contexts/HospitalContext';
import { toast } from 'sonner';
import { Search, AlertCircle, TrendingUp, TrendingDown, RefreshCw, FileText, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MovimientoKardex {
  id: string;
  tipo_movimiento: string;
  cantidad: number;
  cantidad_anterior: number;
  cantidad_nueva: number;
  observaciones: string;
  created_at: string;
  folio_id: string;
  // Datos del lote desde inventario_lotes
  inventario_lotes?: {
    lote: string;
    inventario_consolidado?: {
      insumos_catalogo?: {
        nombre: string;
        clave: string;
      };
    };
  };
  // Fallback para registros antiguos
  inventario_hospital?: {
    lote: string;
    insumos_catalogo?: {
      nombre: string;
      clave: string;
    };
  };
  folios: {
    numero_folio: string;
  } | null;
}

const Kardex = () => {
  const { user } = useAuth();
  const { selectedHospital } = useHospital();
  const [searchTerm, setSearchTerm] = useState('');
  const [movimientos, setMovimientos] = useState<MovimientoKardex[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState<string>('todos');

  useEffect(() => {
    if (user && selectedHospital) {
      fetchMovimientos();
    }
  }, [user, selectedHospital, tipoFiltro]);

  const fetchMovimientos = async () => {
    try {
      if (!selectedHospital) return;
      
      setLoading(true);
      
      let query = supabase
        .from('movimientos_inventario')
        .select(`
          *,
          inventario_hospital (
            lote,
            insumos_catalogo (
              nombre,
              clave
            )
          ),
          folios (
            numero_folio
          )
        `)
        .eq('hospital_id', selectedHospital.id)
        .order('created_at', { ascending: false })
        .limit(200);

      // Aplicar filtro de tipo
      if (tipoFiltro !== 'todos') {
        query = query.eq('tipo_movimiento', tipoFiltro);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      setMovimientos(data || []);
    } catch (error: any) {
      toast.error('Error al cargar movimientos', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const getTipoMovimientoLabel = (tipo: string) => {
    const labels: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
      'entrada': { label: 'Entrada', variant: 'default' },
      'salida_por_folio': { label: 'Salida por Folio', variant: 'destructive' },
      'ajuste': { label: 'Ajuste', variant: 'secondary' },
      'traspaso_entrada': { label: 'Traspaso Entrada', variant: 'default' },
      'traspaso_salida': { label: 'Traspaso Salida', variant: 'destructive' },
    };
    return labels[tipo] || { label: tipo, variant: 'outline' };
  };

  const getMovimientoIcon = (tipo: string) => {
    if (tipo === 'entrada' || tipo === 'traspaso_entrada') {
      return <TrendingUp className="h-4 w-4 text-green-600" />;
    } else if (tipo === 'salida_por_folio' || tipo === 'traspaso_salida') {
      return <TrendingDown className="h-4 w-4 text-red-600" />;
    } else {
      return <RefreshCw className="h-4 w-4 text-blue-600" />;
    }
  };

  // Helper para obtener datos del insumo (compatible con ambos sistemas)
  const getInsumoData = (mov: MovimientoKardex) => {
    // Intentar primero con nuevo sistema (inventario_lotes)
    if (mov.inventario_lotes?.inventario_consolidado?.insumos_catalogo) {
      return mov.inventario_lotes.inventario_consolidado.insumos_catalogo;
    }
    // Fallback a sistema antiguo (inventario_hospital)
    return mov.inventario_hospital?.insumos_catalogo;
  };

  const getLote = (mov: MovimientoKardex) => {
    return mov.inventario_lotes?.lote || mov.inventario_hospital?.lote;
  };

  const filteredMovimientos = movimientos.filter(mov => {
    const insumoData = getInsumoData(mov);
    const lote = getLote(mov);
    return insumoData?.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      insumoData?.clave?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lote?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mov.folios?.numero_folio?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const totalEntradas = movimientos.filter(m => 
    m.tipo_movimiento === 'entrada' || m.tipo_movimiento === 'traspaso_entrada'
  ).reduce((sum, m) => sum + m.cantidad, 0);

  const totalSalidas = movimientos.filter(m => 
    m.tipo_movimiento === 'salida_por_folio' || m.tipo_movimiento === 'traspaso_salida'
  ).reduce((sum, m) => sum + m.cantidad, 0);

  const totalAjustes = movimientos.filter(m => 
    m.tipo_movimiento === 'ajuste'
  ).length;

  return (
    <div className="space-y-6">
      {!selectedHospital && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Debes seleccionar un hospital para ver el kardex de movimientos.
          </AlertDescription>
        </Alert>
      )}

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Kardex de Inventario</h1>
        <p className="text-muted-foreground mt-1">
          Registro de todos los movimientos de inventario del hospital
        </p>
      </div>

      {selectedHospital && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  Total Entradas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{totalEntradas}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Unidades ingresadas
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  Total Salidas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{totalSalidas}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Unidades consumidas
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-blue-600" />
                  Total Ajustes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{totalAjustes}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Ajustes registrados
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle>Movimientos Recientes</CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Tipo de movimiento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los movimientos</SelectItem>
                      <SelectItem value="entrada">Entradas</SelectItem>
                      <SelectItem value="salida_por_folio">Salidas por Folio</SelectItem>
                      <SelectItem value="ajuste">Ajustes</SelectItem>
                      <SelectItem value="traspaso_entrada">Traspasos Entrada</SelectItem>
                      <SelectItem value="traspaso_salida">Traspasos Salida</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por insumo, lote o folio..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
              </div>
              <CardDescription>
                Últimos 200 movimientos registrados
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Cargando movimientos...
                </div>
              ) : filteredMovimientos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No se encontraron movimientos
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[140px]">Fecha y Hora</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Insumo</TableHead>
                        <TableHead>Lote</TableHead>
                        <TableHead className="text-right">Anterior</TableHead>
                        <TableHead className="text-center">Cantidad</TableHead>
                        <TableHead className="text-right">Nuevo</TableHead>
                        <TableHead>Folio</TableHead>
                        <TableHead className="max-w-[200px]">Observaciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMovimientos.map((mov) => {
                        const tipoInfo = getTipoMovimientoLabel(mov.tipo_movimiento);
                        return (
                          <TableRow key={mov.id}>
                            <TableCell className="font-mono text-xs">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(mov.created_at), 'dd/MM/yy HH:mm', { locale: es })}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getMovimientoIcon(mov.tipo_movimiento)}
                                <Badge variant={tipoInfo.variant} className="text-xs">
                                  {tipoInfo.label}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">
                              <div>
                                {getInsumoData(mov)?.nombre}
                              </div>
                              {getInsumoData(mov)?.clave && (
                                <div className="text-xs text-muted-foreground">
                                  {getInsumoData(mov)?.clave}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {getLote(mov)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {mov.cantidad_anterior}
                            </TableCell>
                            <TableCell className="text-center">
                              <span className={`font-bold ${
                                mov.tipo_movimiento === 'entrada' || mov.tipo_movimiento === 'traspaso_entrada'
                                  ? 'text-green-600'
                                  : mov.tipo_movimiento === 'salida_por_folio' || mov.tipo_movimiento === 'traspaso_salida'
                                  ? 'text-red-600'
                                  : 'text-blue-600'
                              }`}>
                                {mov.tipo_movimiento === 'entrada' || mov.tipo_movimiento === 'traspaso_entrada' ? '+' : '-'}
                                {mov.cantidad}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {mov.cantidad_nueva}
                            </TableCell>
                            <TableCell>
                              {mov.folios?.numero_folio && (
                                <div className="flex items-center gap-1 text-xs">
                                  <FileText className="h-3 w-3" />
                                  {mov.folios.numero_folio}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                              {mov.observaciones}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default Kardex;
