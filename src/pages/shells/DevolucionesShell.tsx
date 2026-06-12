import TabShell from '@/components/layout/TabShell';
import DevolucionesProveedorPage from '@/pages/DevolucionesProveedorPage';

const OPS = ['super_admin','admin','gerente','subgerente','almacen','almacen_ventas'] as any;

export default function DevolucionesShell() {
  return (
    <TabShell
      tabs={[
        { id: 'proveedor', label: 'A Proveedor', content: <DevolucionesProveedorPage />, roles: OPS },
        {
          id: 'cliente',
          label: 'De Cliente',
          roles: OPS,
          content: (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <p className="text-lg font-medium">Próximamente</p>
              <p className="text-sm text-muted-foreground mt-2">
                Devoluciones de cliente pendiente de implementar.
              </p>
            </div>
          ),
        },
      ]}
      defaultTab="proveedor"
    />
  );
}
