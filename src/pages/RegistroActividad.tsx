import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useHospital } from '@/contexts/HospitalContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  FileText, 
  PackageOpen, 
  ArrowLeftRight, 
  Warehouse, 
  AlertTriangle,
  Plus,
  Trash2,
  Edit,
  TruckIcon,
  RotateCcw,
  Search,
  Filter,
  Calendar,
  User,
  Building2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { UserRole } from '@/types';
import { HospitalSelector } from '@/components/HospitalSelector';

interface RegistroActividadProps {
  userRole: UserRole;
}

interface RegistroActividad {
  id: string;
  hospital_id: string;
  usuario_id: string;
  usuario_nombre: string;
  tipo_actividad: string;
  descripcion: string;
  folio_id: string | null;
  numero_folio: string | null;
  almacen_origen_id: string | null;
  almacen_origen_nombre: string | null;
  almacen_destino_id: string | null;
  almacen_destino_nombre: string | null;
  insumos_afectados: any;
  cantidad_total: number | null;
  detalles_adicionales: any;
  created_at: string;
  hospitales?: { nombre: string; display_name: string | null };
}

const tipoActividadConfig: Record<string, { label: string; icon: any; color: string }> = {
  // Operaciones hospitalarias
  folio_creado: { label: 'Folio Creado', icon: FileText, color: 'bg-green-500' },
  folio_completado: { label: 'Folio Completado', icon: FileText, color: 'bg-emerald-600' },
  folio_cancelado: { label: 'Folio Cancelado', icon: AlertTriangle, color: 'bg-red-500' },
  folio_borrador_creado: { label: 'Borrador Creado', icon: FileText, color: 'bg-yellow-500' },
  folio_borrador_eliminado: { label: 'Borrador Eliminado', icon: Trash2, color: 'bg-orange-500' },
  traspaso_almacen_provisional: { label: 'Traspaso a Provisional', icon: ArrowLeftRight, color: 'bg-blue-500' },
  devolucion_almacen_principal: { label: 'Devolución a Principal', icon: RotateCcw, color: 'bg-purple-500' },
  recepcion_almacen_central: { label: 'Recepción de Central', icon: TruckIcon, color: 'bg-teal-500' },
  ajuste_inventario: { label: 'Ajuste de Inventario', icon: Edit, color: 'bg-indigo-500' },
  almacen_provisional_creado: { label: 'Almacén Provisional Creado', icon: Plus, color: 'bg-emerald-500' },
  almacen_provisional_eliminado: { label: 'Almacén Provisional Eliminado', icon: Trash2, color: 'bg-rose-500' },
  insumo_agregado: { label: 'Insumo Agregado', icon: PackageOpen, color: 'bg-cyan-500' },
  insumo_modificado: { label: 'Insumo Modificado', icon: Edit, color: 'bg-amber-500' },
  // Gerente Almacén
  transferencia_enviada: { label: 'Transferencia Enviada', icon: TruckIcon, color: 'bg-blue-600' },
  pedido_compra_creado: { label: 'Pedido Compra Creado', icon: FileText, color: 'bg-violet-500' },
  pedido_enviado_finanzas: { label: 'Pedido Enviado a Finanzas', icon: FileText, color: 'bg-violet-600' },
  // Cadena de Suministros
  documento_segmentado_procesado: { label: 'Documento Segmentado', icon: FileText, color: 'bg-sky-500' },
  documento_agrupado_generado: { label: 'Documento Agrupado', icon: FileText, color: 'bg-sky-600' },
  distribucion_programada: { label: 'Distribución Programada', icon: TruckIcon, color: 'bg-cyan-600' },
  // Finanzas
  pago_registrado: { label: 'Pago Registrado', icon: FileText, color: 'bg-green-600' },
  orden_pagada: { label: 'Orden Pagada', icon: FileText, color: 'bg-emerald-600' },
  presupuesto_actualizado: { label: 'Presupuesto Actualizado', icon: Edit, color: 'bg-amber-600' },
};

const RegistroActividadPage = ({ userRole }: RegistroActividadProps) => {
  const { user } = useAuth();
  const { selectedHospital } = useHospital();
  const [registros, setRegistros] = useState<RegistroActividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<string>('todos');
  const [usuarioFiltro, setUsuarioFiltro] = useState<string>('todos');
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>(undefined);
  const [fechaFin, setFechaFin] = useState<Date | undefined>(undefined);
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string }[]>([]);
  const [selectedRegistro, setSelectedRegistro] = useState<RegistroActividad | null>(null);

  // Roles globales (finanzas, gerente_almacen, cadena_suministros, gerente_operaciones) pueden ver todo
  const isGlobalRole = userRole === 'finanzas' || userRole === 'gerente_almacen' || userRole === 'cadena_suministros' || userRole === 'gerente_operaciones';
  const canAccess = isGlobalRole || userRole === 'supervisor';

  useEffect(() => {
    if (user && canAccess) {
      fetchRegistros();
    }
  }, [user, selectedHospital, canAccess]);

  const fetchRegistros = async () => {
    // Roles globales pueden ver sin hospital seleccionado
    if (!isGlobalRole && !selectedHospital) {
      setRegistros([]);
      setUsuarios([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from('registro_actividad')
        .select(`
          *,
          hospitales:hospital_id (nombre, display_name)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      // Si hay hospital seleccionado, filtrar por él (a menos que sea rol global sin hospital)
      if (selectedHospital) {
        query = query.eq('hospital_id', selectedHospital.id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching registros:', error);
        return;
      }

      // Normalizar datos para asegurar que insumos_afectados sea siempre un array
      const normalizedData = (data || []).map(r => ({
        ...r,
        insumos_afectados: Array.isArray(r.insumos_afectados) ? r.insumos_afectados : [],
        detalles_adicionales: typeof r.detalles_adicionales === 'object' ? r.detalles_adicionales : {}
      }));

      setRegistros(normalizedData as RegistroActividad[]);

      // Extraer usuarios únicos para el filtro
      const uniqueUsers = Array.from(
        new Map((data || []).map(r => [r.usuario_id, { id: r.usuario_id, nombre: r.usuario_nombre }])).values()
      );
      setUsuarios(uniqueUsers);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredRegistros = registros.filter(registro => {
    // Filtro por búsqueda
    const matchesSearch = 
      registro.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
      registro.usuario_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (registro.numero_folio && registro.numero_folio.toLowerCase().includes(searchTerm.toLowerCase()));

    // Filtro por tipo
    const matchesTipo = tipoFiltro === 'todos' || registro.tipo_actividad === tipoFiltro;

    // Filtro por usuario
    const matchesUsuario = usuarioFiltro === 'todos' || registro.usuario_id === usuarioFiltro;

    // Filtro por fecha
    const registroDate = new Date(registro.created_at);
    const matchesFechaInicio = !fechaInicio || registroDate >= fechaInicio;
    const matchesFechaFin = !fechaFin || registroDate <= new Date(fechaFin.getTime() + 86400000);

    return matchesSearch && matchesTipo && matchesUsuario && matchesFechaInicio && matchesFechaFin;
  });

  const clearFilters = () => {
    setSearchTerm('');
    setTipoFiltro('todos');
    setUsuarioFiltro('todos');
    setFechaInicio(undefined);
    setFechaFin(undefined);
  };

  if (!canAccess) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No tienes permisos para acceder a esta sección. Solo Gerente de Operaciones y Supervisores pueden ver el registro de actividad.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const getIcon = (tipo: string) => {
    const config = tipoActividadConfig[tipo];
    if (!config) return <FileText className="h-4 w-4" />;
    const Icon = config.icon;
    return <Icon className="h-4 w-4" />;
  };

  const getHospitalName = (registro: RegistroActividad) => {
    if (registro.hospitales) {
      return registro.hospitales.display_name || registro.hospitales.nombre;
    }
    return 'Hospital desconocido';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Registro de Actividad</h1>
          <p className="text-muted-foreground">
            Historial completo de todas las operaciones realizadas en el sistema
          </p>
        </div>
      </div>

      {!selectedHospital && !isGlobalRole ? (
        <Alert>
          <Building2 className="h-4 w-4" />
          <AlertDescription>
            Selecciona un hospital para ver el registro de actividad.
          </AlertDescription>
        </Alert>
      ) : (
        <>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Búsqueda */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Tipo de actividad */}
            <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de actividad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los tipos</SelectItem>
                {Object.entries(tipoActividadConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Usuario */}
            <Select value={usuarioFiltro} onValueChange={(value) => setUsuarioFiltro(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Usuario" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los usuarios</SelectItem>
                {usuarios.length > 0 ? (
                  usuarios.map((usuario) => (
                    <SelectItem key={usuario.id} value={usuario.id}>
                      {usuario.nombre}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-users" disabled>No hay usuarios</SelectItem>
                )}
              </SelectContent>
            </Select>

            {/* Fecha inicio */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start text-left font-normal">
                  <Calendar className="mr-2 h-4 w-4" />
                  {fechaInicio ? format(fechaInicio, 'dd/MM/yyyy') : 'Desde'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={fechaInicio}
                  onSelect={setFechaInicio}
                  locale={es}
                />
              </PopoverContent>
            </Popover>

            {/* Fecha fin */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start text-left font-normal">
                  <Calendar className="mr-2 h-4 w-4" />
                  {fechaFin ? format(fechaFin, 'dd/MM/yyyy') : 'Hasta'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={fechaFin}
                  onSelect={setFechaFin}
                  locale={es}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex justify-end mt-4">
            <Button variant="ghost" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{filteredRegistros.length}</div>
            <p className="text-sm text-muted-foreground">Registros encontrados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {filteredRegistros.filter(r => r.tipo_actividad === 'folio_creado').length}
            </div>
            <p className="text-sm text-muted-foreground">Folios creados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {filteredRegistros.filter(r => r.tipo_actividad === 'traspaso_almacen_provisional').length}
            </div>
            <p className="text-sm text-muted-foreground">Traspasos realizados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {filteredRegistros.filter(r => r.tipo_actividad === 'recepcion_almacen_central').length}
            </div>
            <p className="text-sm text-muted-foreground">Recepciones</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla de registros */}
      <Card>
        <CardHeader>
          <CardTitle>Historial de Actividad</CardTitle>
          <CardDescription>
            Mostrando {filteredRegistros.length} de {registros.length} registros
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredRegistros.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No se encontraron registros con los filtros aplicados
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Hospital</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Folio</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRegistros.map((registro) => {
                    const config = tipoActividadConfig[registro.tipo_actividad] || {
                      label: registro.tipo_actividad,
                      color: 'bg-gray-500'
                    };
                    
                    return (
                      <TableRow key={registro.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(registro.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${config.color} text-white flex items-center gap-1 w-fit`}>
                            {getIcon(registro.tipo_actividad)}
                            <span className="hidden lg:inline">{config.label}</span>
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            {registro.usuario_nombre}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="truncate max-w-[150px]" title={getHospitalName(registro)}>
                              {getHospitalName(registro)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate" title={registro.descripcion}>
                          {registro.descripcion}
                        </TableCell>
                        <TableCell>
                          {registro.numero_folio ? (
                            <Badge variant="outline">{registro.numero_folio}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => setSelectedRegistro(registro)}
                              >
                                Ver detalles
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Detalle de Actividad</DialogTitle>
                              </DialogHeader>
                              {selectedRegistro && (
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <p className="text-sm font-medium text-muted-foreground">Fecha y hora</p>
                                      <p>{format(new Date(selectedRegistro.created_at), "dd/MM/yyyy HH:mm:ss", { locale: es })}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-muted-foreground">Tipo de actividad</p>
                                      <Badge className={`${tipoActividadConfig[selectedRegistro.tipo_actividad]?.color || 'bg-gray-500'} text-white`}>
                                        {tipoActividadConfig[selectedRegistro.tipo_actividad]?.label || selectedRegistro.tipo_actividad}
                                      </Badge>
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-muted-foreground">Usuario</p>
                                      <p>{selectedRegistro.usuario_nombre}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-muted-foreground">Hospital</p>
                                      <p>{getHospitalName(selectedRegistro)}</p>
                                    </div>
                                    {selectedRegistro.numero_folio && (
                                      <div>
                                        <p className="text-sm font-medium text-muted-foreground">Número de Folio</p>
                                        <p>{selectedRegistro.numero_folio}</p>
                                      </div>
                                    )}
                                    {selectedRegistro.cantidad_total && (
                                      <div>
                                        <p className="text-sm font-medium text-muted-foreground">Cantidad Total</p>
                                        <p>{selectedRegistro.cantidad_total}</p>
                                      </div>
                                    )}
                                  </div>

                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-1">Descripción</p>
                                    <p className="bg-muted p-3 rounded-md">{selectedRegistro.descripcion}</p>
                                  </div>

                                  {selectedRegistro.almacen_origen_nombre && (
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <p className="text-sm font-medium text-muted-foreground">Almacén Origen</p>
                                        <p>{selectedRegistro.almacen_origen_nombre}</p>
                                      </div>
                                      {selectedRegistro.almacen_destino_nombre && (
                                        <div>
                                          <p className="text-sm font-medium text-muted-foreground">Almacén Destino</p>
                                          <p>{selectedRegistro.almacen_destino_nombre}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {selectedRegistro.insumos_afectados && selectedRegistro.insumos_afectados.length > 0 && (
                                    <div>
                                      <p className="text-sm font-medium text-muted-foreground mb-2">Insumos Afectados</p>
                                      <ScrollArea className="h-[200px]">
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead>Clave</TableHead>
                                              <TableHead>Nombre</TableHead>
                                              <TableHead className="text-right">Cantidad</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {selectedRegistro.insumos_afectados.map((insumo: any, idx: number) => (
                                              <TableRow key={idx}>
                                                <TableCell>{insumo.clave || '-'}</TableCell>
                                                <TableCell>{insumo.nombre}</TableCell>
                                                <TableCell className="text-right">{insumo.cantidad}</TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </ScrollArea>
                                    </div>
                                  )}
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
};

export default RegistroActividadPage;
