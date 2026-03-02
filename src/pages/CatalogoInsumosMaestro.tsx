import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Plus, Search, Edit, Package, Pill, Filter, Download, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PaginationControls } from '@/components/ui/pagination-controls';

interface InsumoCatalogo {
  id: string;
  clave: string | null;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  tipo: string | null;
  unidad: string | null;
  presentacion: string | null;
  familia_insumo: string | null;
  activo: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

const CATEGORIAS = [
  'Soluciones',
  'Material médico',
  'Medicamento',
  'Anestésicos',
  'Analgésicos',
  'Antibióticos',
  'Sutura',
  'Equipo quirúrgico',
  'Consumibles',
  'Otro'
];

const TIPOS = [
  { value: 'insumo', label: 'Insumo' },
  { value: 'medicamento', label: 'Medicamento' }
];

const UNIDADES = [
  'pieza',
  'caja',
  'frasco',
  'ampolleta',
  'sobre',
  'ml',
  'mg',
  'g',
  'unidad'
];

const CatalogoInsumosMaestro = () => {
  const [insumos, setInsumos] = useState<InsumoCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState<string>('todos');
  const [filterCategoria, setFilterCategoria] = useState<string>('todos');
  const [filterActivo, setFilterActivo] = useState<string>('todos');
  const [showForm, setShowForm] = useState(false);
  const [editingInsumo, setEditingInsumo] = useState<InsumoCatalogo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;

  // Form state
  const [formData, setFormData] = useState({
    clave: '',
    nombre: '',
    descripcion: '',
    categoria: '',
    tipo: 'insumo',
    unidad: 'pieza',
    presentacion: '',
    familia_insumo: '',
    activo: true
  });

  useEffect(() => {
    fetchInsumos();
  }, [currentPage, searchTerm, filterTipo, filterCategoria, filterActivo]);

  const fetchInsumos = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('insumos_catalogo')
        .select('*', { count: 'exact' });

      // Aplicar filtros
      if (searchTerm) {
        query = query.or(`nombre.ilike.%${searchTerm}%,clave.ilike.%${searchTerm}%,descripcion.ilike.%${searchTerm}%`);
      }
      
      if (filterTipo !== 'todos') {
        query = query.eq('tipo', filterTipo);
      }
      
      if (filterCategoria !== 'todos') {
        query = query.eq('categoria', filterCategoria);
      }
      
      if (filterActivo !== 'todos') {
        query = query.eq('activo', filterActivo === 'activo');
      }

      // Paginación
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      
      const { data, error, count } = await query
        .order('nombre', { ascending: true })
        .range(from, to);

      if (error) throw error;
      
      setInsumos(data || []);
      setTotalCount(count || 0);
    } catch (error: any) {
      toast.error('Error al cargar catálogo', { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      if (!formData.nombre.trim()) {
        toast.error('El nombre es requerido');
        return;
      }

      if (editingInsumo) {
        // Actualizar
        const { error } = await supabase
          .from('insumos_catalogo')
          .update({
            clave: formData.clave || null,
            nombre: formData.nombre,
            descripcion: formData.descripcion || null,
            categoria: formData.categoria || null,
            tipo: formData.tipo,
            unidad: formData.unidad,
            presentacion: formData.presentacion || null,
            familia_insumo: formData.familia_insumo || null,
            activo: formData.activo,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingInsumo.id);

        if (error) throw error;
        toast.success('Insumo actualizado correctamente');
      } else {
        // Crear nuevo
        const { error } = await supabase
          .from('insumos_catalogo')
          .insert({
            clave: formData.clave || null,
            nombre: formData.nombre,
            descripcion: formData.descripcion || null,
            categoria: formData.categoria || null,
            tipo: formData.tipo,
            unidad: formData.unidad,
            presentacion: formData.presentacion || null,
            familia_insumo: formData.familia_insumo || null,
            activo: formData.activo
          });

        if (error) throw error;
        toast.success('Insumo creado correctamente');
      }

      setShowForm(false);
      setEditingInsumo(null);
      resetForm();
      fetchInsumos();
    } catch (error: any) {
      toast.error('Error al guardar', { description: error.message });
    }
  };

  const resetForm = () => {
    setFormData({
      clave: '',
      nombre: '',
      descripcion: '',
      categoria: '',
      tipo: 'insumo',
      unidad: 'pieza',
      presentacion: '',
      familia_insumo: '',
      activo: true
    });
  };

  const openEditForm = (insumo: InsumoCatalogo) => {
    setEditingInsumo(insumo);
    setFormData({
      clave: insumo.clave || '',
      nombre: insumo.nombre,
      descripcion: insumo.descripcion || '',
      categoria: insumo.categoria || '',
      tipo: insumo.tipo || 'insumo',
      unidad: insumo.unidad || 'pieza',
      presentacion: insumo.presentacion || '',
      familia_insumo: insumo.familia_insumo || '',
      activo: insumo.activo ?? true
    });
    setShowForm(true);
  };

  const toggleActivo = async (insumo: InsumoCatalogo) => {
    try {
      const { error } = await supabase
        .from('insumos_catalogo')
        .update({ activo: !insumo.activo })
        .eq('id', insumo.id);

      if (error) throw error;
      
      toast.success(insumo.activo ? 'Insumo desactivado' : 'Insumo activado');
      fetchInsumos();
    } catch (error: any) {
      toast.error('Error al cambiar estado', { description: error.message });
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  // Obtener categorías únicas de los datos
  const categoriasUnicas = useMemo(() => {
    const cats = new Set(insumos.map(i => i.categoria).filter(Boolean));
    return [...CATEGORIAS, ...Array.from(cats).filter(c => !CATEGORIAS.includes(c as string))];
  }, [insumos]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Catálogo Maestro de Insumos</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona el catálogo general de insumos y medicamentos
          </p>
        </div>
        <Button onClick={() => { resetForm(); setEditingInsumo(null); setShowForm(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Insumo
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total en Catálogo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Insumos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">
                {insumos.filter(i => i.tipo === 'insumo').length}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Medicamentos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Pill className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">
                {insumos.filter(i => i.tipo === 'medicamento').length}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Activos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {insumos.filter(i => i.activo).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[250px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, clave BCB o descripción..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={filterTipo} onValueChange={(v) => { setFilterTipo(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los tipos</SelectItem>
                {TIPOS.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterCategoria} onValueChange={(v) => { setFilterCategoria(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas las categorías</SelectItem>
                {categoriasUnicas.map(cat => (
                  <SelectItem key={cat} value={cat as string}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterActivo} onValueChange={(v) => { setFilterActivo(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="activo">Activos</SelectItem>
                <SelectItem value="inactivo">Inactivos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Clave BCB</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="w-[100px]">Tipo</TableHead>
                  <TableHead className="w-[100px]">Unidad</TableHead>
                  <TableHead className="w-[100px]">Estado</TableHead>
                  <TableHead className="w-[80px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Cargando...
                    </TableCell>
                  </TableRow>
                ) : insumos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No se encontraron insumos
                    </TableCell>
                  </TableRow>
                ) : (
                  insumos.map((insumo) => (
                    <TableRow key={insumo.id}>
                      <TableCell className="font-mono text-sm">
                        {insumo.clave || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{insumo.nombre}</p>
                          {insumo.descripcion && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {insumo.descripcion}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{insumo.categoria || 'Sin categoría'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={insumo.tipo === 'medicamento' ? 'default' : 'secondary'}>
                          {insumo.tipo === 'medicamento' ? (
                            <><Pill className="h-3 w-3 mr-1" /> Med</>
                          ) : (
                            <><Package className="h-3 w-3 mr-1" /> Ins</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{insumo.unidad || 'pieza'}</TableCell>
                      <TableCell>
                        <Switch
                          checked={insumo.activo ?? true}
                          onCheckedChange={() => toggleActivo(insumo)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditForm(insumo)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Paginación */}
      {totalPages > 1 && (
        <PaginationControls
          page={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          hasNextPage={currentPage < totalPages}
          hasPreviousPage={currentPage > 1}
          onPageChange={setCurrentPage}
        />
      )}

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingInsumo ? 'Editar Insumo' : 'Nuevo Insumo'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clave">Clave BCB</Label>
                <Input
                  id="clave"
                  placeholder="Ej: bcb2.6.0.7, bcb25.1.0"
                  value={formData.clave}
                  onChange={(e) => setFormData({ ...formData, clave: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo *</Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(v) => setFormData({ ...formData, tipo: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                placeholder="Nombre del insumo o medicamento"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <Textarea
                id="descripcion"
                placeholder="Descripción detallada..."
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="categoria">Categoría</Label>
                <Select
                  value={formData.categoria}
                  onValueChange={(v) => setFormData({ ...formData, categoria: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="unidad">Unidad</Label>
                <Select
                  value={formData.unidad}
                  onValueChange={(v) => setFormData({ ...formData, unidad: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="presentacion">Presentación</Label>
                <Input
                  id="presentacion"
                  placeholder="Ej: Caja con 10 piezas"
                  value={formData.presentacion}
                  onChange={(e) => setFormData({ ...formData, presentacion: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="familia">Familia</Label>
                <Input
                  id="familia"
                  placeholder="Familia del insumo"
                  value={formData.familia_insumo}
                  onChange={(e) => setFormData({ ...formData, familia_insumo: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="activo"
                checked={formData.activo}
                onCheckedChange={(checked) => setFormData({ ...formData, activo: checked })}
              />
              <Label htmlFor="activo">Insumo activo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>
              {editingInsumo ? 'Guardar Cambios' : 'Crear Insumo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CatalogoInsumosMaestro;
