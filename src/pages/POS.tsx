import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Barcode, Plus } from 'lucide-react';
import { useSucursal } from '@/contexts/SucursalContext';

interface LineaVenta {
  id: string;
  producto_nombre: string;
  sku: string;
  lote: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

const POS = () => {
  const { selectedSucursal } = useSucursal();
  const [codigoBusqueda, setCodigoBusqueda] = useState('');
  const [lineas, setLineas] = useState<LineaVenta[]>([]);

  const total = lineas.reduce((sum, l) => sum + l.subtotal, 0);

  const handleRemoveLine = (id: string) => {
    setLineas(prev => prev.filter(l => l.id !== id));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
      {/* Left: Product search & lines */}
      <div className="lg:col-span-2 flex flex-col gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Barcode className="h-5 w-5" /> Punto de Venta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Escanear código de barras o buscar producto..."
                value={codigoBusqueda}
                onChange={(e) => setCodigoBusqueda(e.target.value)}
                className="text-lg"
                autoFocus
              />
              <Button><Plus className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>

        <Card className="flex-1 overflow-auto">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead className="text-center">Cant.</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                      Escanee un producto o búsquelo para comenzar la venta
                    </TableCell>
                  </TableRow>
                ) : (
                  lineas.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{l.producto_nombre}</p>
                          <p className="text-xs text-muted-foreground">{l.sku}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{l.lote}</TableCell>
                      <TableCell className="text-center">{l.cantidad}</TableCell>
                      <TableCell className="text-right">${l.precio_unitario.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-bold">${l.subtotal.toFixed(2)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveLine(l.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Right: Payment summary */}
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Artículos</span>
                <span>{lineas.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${total.toFixed(2)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">${total.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Button className="w-full h-12 text-lg" disabled={lineas.length === 0}>
                💵 Cobrar
              </Button>
              <Button variant="outline" className="w-full" disabled={lineas.length === 0}>
                Cancelar Venta
              </Button>
            </div>

            <div className="text-xs text-muted-foreground text-center">
              Sucursal: {selectedSucursal?.nombre || 'Sin seleccionar'}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default POS;
