import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Download,
  Upload,
  Package,
  ShoppingCart,
  CheckCircle,
  RefreshCw,
  Warehouse,
  Send,
  Clock,
  FileText,
  DollarSign,
  Truck,
  Building2,
  Percent,
} from "lucide-react";
import * as XLSX from "xlsx";
import { StatusTimeline } from "@/components/StatusTimeline";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";

interface DocumentoAgrupado {
  id: string;
  fecha_generacion: string;
  estado: string;
  enviado_a_gerente_almacen: boolean;
  procesado_por_almacen: boolean;
  procesado_at: string | null;
  detalles?: DetalleAgrupado[];
}

interface DetalleAgrupado {
  id: string;
  insumo_catalogo_id: string;
  total_faltante_requerido: number;
  cantidad_cubierta?: number;
  cantidad_pendiente?: number;
  insumo?: { id: string; nombre: string; clave: string };
}

interface OrdenCompra {
  id: string;
  numero_pedido: string;
  estado: string;
  proveedor: string;
  proveedor_id: string | null;
  total_items: number;
  created_at: string;
  documento_origen_id: string | null;
  enviado_a_cadena: boolean;
  aprobado_at: string | null;
  subtotal: number | null;
  total_impuestos: number | null;
  total_retenciones: number | null;
  total: number | null;
  items?: OrdenCompraItem[];
}

interface OrdenCompraItem {
  id: string;
  insumo_catalogo_id: string;
  cantidad_solicitada: number;
  cantidad_recibida: number;
  precio_unitario: number | null;
  estado: string;
  insumo?: { id: string; nombre: string; clave: string };
}

interface AlmacenCentralItem {
  id: string;
  insumo_catalogo_id: string;
  cantidad_disponible: number;
  lote: string;
  fecha_caducidad: string;
  insumo?: { id: string; nombre: string; clave: string };
}

interface Proveedor {
  id: string;
  nombre: string;
  rfc: string | null;
  categoria_productos: string | null;
}

interface Impuesto {
  id: string;
  nombre: string;
  tasa: number;
  tipo: string;
  descripcion: string | null;
}

/** Helpers */
const toNumberOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim().replace(/,/g, "");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const clampMin0 = (n: number) => (n < 0 ? 0 : n);

const isValidNonNegNumber = (n: number | null) => typeof n === "number" && Number.isFinite(n) && n >= 0;

const GerenteAlmacenDashboard = () => {
  const [documentos, setDocumentos] = useState<DocumentoAgrupado[]>([]);
  const [ordenesCompra, setOrdenesCompra] = useState<OrdenCompra[]>([]);
  const [almacenCentral, setAlmacenCentral] = useState<AlmacenCentralItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processingDoc, setProcessingDoc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Dialog for setting prices
  const [preciosDialogOpen, setPreciosDialogOpen] = useState(false);
  const [ordenEditando, setOrdenEditando] = useState<OrdenCompra | null>(null);
  const [precios, setPrecios] = useState<Record<string, number>>({});
  
  // Proveedores e Impuestos
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [impuestos, setImpuestos] = useState<Impuesto[]>([]);
  const [selectedProveedor, setSelectedProveedor] = useState<string>("");
  const [selectedImpuestos, setSelectedImpuestos] = useState<string[]>([]);

  const fetchDataCallback = useCallback(() => {
    fetchData();
  }, []);

  // Realtime notifications
  useRealtimeNotifications({
    userRole: "gerente_almacen",
    onDocumentoAgrupado: fetchDataCallback,
    onPedidoActualizado: fetchDataCallback,
  });

  useEffect(() => {
    fetchData();
    fetchProveedoresYImpuestos();
  }, []);

  const fetchProveedoresYImpuestos = async () => {
    const [provRes, impRes] = await Promise.all([
      supabase.from("proveedores").select("id, nombre, rfc, categoria_productos").eq("activo", true),
      supabase.from("catalogo_impuestos").select("*").eq("activo", true)
    ]);
    
    if (provRes.data) setProveedores(provRes.data);
    if (impRes.data) setImpuestos(impRes.data);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: docsData, error: docsError } = await supabase
        .from("documentos_necesidades_agrupado")
        .select(
          `
          *,
          detalles:documento_agrupado_detalle(
            *,
            insumo:insumos_catalogo(id, nombre, clave)
          )
        `,
        )
        .eq("enviado_a_gerente_almacen", true)
        .order("fecha_generacion", { ascending: false })
        .limit(20);

      if (docsError) throw docsError;
      setDocumentos(docsData || []);

      const { data: ordenesData, error: ordenesError } = await supabase
        .from("pedidos_compra")
        .select(
          `
          *,
          items:pedido_items(
            *,
            insumo:insumos_catalogo(id, nombre, clave)
          )
        `,
        )
        .order("created_at", { ascending: false });

      if (ordenesError) throw ordenesError;
      setOrdenesCompra(ordenesData || []);

      const { data: almacenData, error: almacenError } = await supabase
        .from("almacen_central")
        .select(
          `
          *,
          insumo:insumos_catalogo(id, nombre, clave)
        `,
        )
        .order("cantidad_disponible", { ascending: false });

      if (almacenError) throw almacenError;
      setAlmacenCentral(almacenData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const descargarExcelParaProveedor = async (documento: DocumentoAgrupado) => {
    const { data: freshDetalles, error } = await supabase
      .from("documento_agrupado_detalle")
      .select(
        `
        *,
        insumo:insumos_catalogo(id, nombre, clave)
      `,
      )
      .eq("documento_id", documento.id);

    if (error || !freshDetalles || freshDetalles.length === 0) {
      toast.error("Error al obtener datos actualizados del documento");
      return;
    }

    const detallesConPendiente = freshDetalles
      .map((d: any) => {
        const pendienteDB = toNumberOrNull(d.cantidad_pendiente);
        const cubierta = toNumberOrNull(d.cantidad_cubierta) ?? 0;
        const total = toNumberOrNull(d.total_faltante_requerido) ?? 0;

        const pendienteCalculado = clampMin0(total - cubierta);
        const pendienteFinal = isValidNonNegNumber(pendienteDB) ? (pendienteDB as number) : pendienteCalculado;

        return { ...d, _pendienteFinal: pendienteFinal };
      })
      .filter((d: any) => (toNumberOrNull(d._pendienteFinal) ?? 0) > 0);

    if (detallesConPendiente.length === 0) {
      toast.info("Todos los insumos de este documento ya están cubiertos");
      return;
    }

    const data = detallesConPendiente.map((d: any, index: number) => ({
      "No.": index + 1,
      Clave: d.insumo?.clave || "N/A",
      "Nombre del Insumo": d.insumo?.nombre || "N/A",
      "Cantidad Pendiente Requerida": d._pendienteFinal,
      "Cantidad Proveedor": "",
      "Precio Unitario ($)": "",
      "Cantidad Faltante": "",
      "ID Sistema": d.insumo_catalogo_id,
    }));

    const ws = XLSX.utils.json_to_sheet(data);

    ws["!cols"] = [
      { wch: 6 },
      { wch: 18 },
      { wch: 50 },
      { wch: 26 },
      { wch: 22 },
      { wch: 20 },
      { wch: 22 },
      { wch: 40 },
    ];

    for (let i = 0; i < data.length; i++) {
      const rowNum = i + 2;
      ws[`G${rowNum}`] = { t: "n", f: `D${rowNum}-E${rowNum}`, z: "0" };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Solicitud Proveedor");

    XLSX.writeFile(
      wb,
      `Solicitud_Proveedor_${new Date().toISOString().split("T")[0]}_${documento.id.slice(0, 8)}.xlsx`,
    );

    toast.success("Excel descargado con cantidad pendiente actualizada");
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedDocId) return;

    setUploading(true);
    
    const reader = new FileReader();
    
    reader.onerror = () => {
      console.error("Error reading file");
      toast.error("Error al leer el archivo");
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    
    reader.onload = async (e) => {
      try {
        const bytes = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(bytes, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as Array<{
          "No.": number;
          Clave: string;
          "Nombre del Insumo": string;
          "Cantidad Pendiente Requerida": any;
          "Cantidad Proveedor": any;
          "Precio Unitario ($)": any;
          "Cantidad Faltante": any;
          "ID Sistema": string;
        }>;

        if (!jsonData || jsonData.length === 0) {
          toast.error("El Excel no tiene filas válidas");
          setUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }

        const { data: allDetalles, error: detallesError } = await supabase
          .from("documento_agrupado_detalle")
          .select("id, insumo_catalogo_id, cantidad_cubierta, total_faltante_requerido")
          .eq("documento_id", selectedDocId);

        if (detallesError) {
          console.error("Error cargando detalles:", detallesError);
          toast.error("Error al cargar detalles del documento");
          setUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }

        const detallesMap = new Map(
          (allDetalles || []).map((d) => [d.insumo_catalogo_id, d])
        );

        const itemsParaOC: Array<{
          insumoId: string;
          cantProveedor: number;
          precio: number | null;
        }> = [];

        const updates: Array<{ 
          id: string; 
          cantidad_cubierta: number;
          cantidad_pendiente: number;
          total_faltante: number;
        }> = [];

        for (const row of jsonData) {
          const insumoId = row["ID Sistema"];
          if (!insumoId) continue;

          const det = detallesMap.get(insumoId);
          if (!det) continue;

          const cantProveedor = toNumberOrNull(row["Cantidad Proveedor"]) ?? 0;
          const precio = toNumberOrNull(row["Precio Unitario ($)"]);
          const cantidadFaltanteExcel = toNumberOrNull(row["Cantidad Faltante"]);
          
          const cubiertaActual = toNumberOrNull(det.cantidad_cubierta) ?? 0;
          const total = toNumberOrNull(det.total_faltante_requerido) ?? 0;
          const nuevaCubierta = cubiertaActual + cantProveedor;
          
          let nuevoPendiente: number;
          if (isValidNonNegNumber(cantidadFaltanteExcel)) {
            nuevoPendiente = cantidadFaltanteExcel as number;
          } else {
            nuevoPendiente = clampMin0(total - nuevaCubierta);
          }
          
          updates.push({ 
            id: det.id, 
            cantidad_cubierta: nuevaCubierta,
            cantidad_pendiente: nuevoPendiente,
            total_faltante: total
          });
          
          if (cantProveedor > 0) {
            itemsParaOC.push({ insumoId, cantProveedor, precio });
          }
        }

        if (updates.length > 0) {
          const BATCH_SIZE = 50;
          for (let i = 0; i < updates.length; i += BATCH_SIZE) {
            const batch = updates.slice(i, i + BATCH_SIZE);
            await Promise.all(
              batch.map((u) =>
                supabase
                  .from("documento_agrupado_detalle")
                  .update({ 
                    cantidad_cubierta: u.cantidad_cubierta,
                    cantidad_pendiente: u.cantidad_pendiente
                  })
                  .eq("id", u.id)
              )
            );
          }
        }

        let numeroPedidoCreado: string | null = null;

        if (itemsParaOC.length > 0) {
          const { data: auth } = await supabase.auth.getUser();
          const user = auth.user;

          const numeroPedido = `OC-${Date.now().toString(36).toUpperCase()}`;

          const { data: orden, error: ordenError } = await supabase
            .from("pedidos_compra")
            .insert({
              numero_pedido: numeroPedido,
              creado_por: user?.id,
              total_items: itemsParaOC.length,
              estado: "pendiente",
              proveedor: "Por definir",
              documento_origen_id: selectedDocId,
            })
            .select()
            .single();

          if (ordenError) throw ordenError;

          const items = itemsParaOC.map((item) => ({
            pedido_id: orden.id,
            insumo_catalogo_id: item.insumoId,
            cantidad_solicitada: item.cantProveedor,
            cantidad_recibida: 0,
            precio_unitario: item.precio,
            estado: "pendiente",
          }));

          const { error: itemsError } = await supabase.from("pedido_items").insert(items);
          if (itemsError) throw itemsError;

          numeroPedidoCreado = numeroPedido;
        }

        const { data: allDetails, error: allDetailsErr } = await supabase
          .from("documento_agrupado_detalle")
          .select("cantidad_pendiente, total_faltante_requerido, cantidad_cubierta")
          .eq("documento_id", selectedDocId);

        if (!allDetailsErr && allDetails) {
          const allCovered = allDetails.every((d: any) => {
            const pendDB = toNumberOrNull(d.cantidad_pendiente);
            const total = toNumberOrNull(d.total_faltante_requerido) ?? 0;
            const cub = toNumberOrNull(d.cantidad_cubierta) ?? 0;

            const pend = isValidNonNegNumber(pendDB) ? (pendDB as number) : clampMin0(total - cub);
            return pend <= 0;
          });

          if (allCovered) {
            await supabase
              .from("documentos_necesidades_agrupado")
              .update({
                procesado_por_almacen: true,
                procesado_at: new Date().toISOString(),
              })
              .eq("id", selectedDocId);
          }
        }

        if (numeroPedidoCreado) {
          toast.success(`OC ${numeroPedidoCreado} creada con ${itemsParaOC.length} items`);
        } else {
          toast.info("No se creó OC porque el proveedor no indicó cantidades");
        }

        setSelectedDocId(null);
        await fetchData();
        
      } catch (error) {
        console.error("Error processing file:", error);
        toast.error("Error al procesar archivo");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const abrirPreciosDialog = (orden: OrdenCompra) => {
    setOrdenEditando(orden);
    const initialPrecios: Record<string, number> = {};
    orden.items?.forEach((item) => {
      initialPrecios[item.id] = item.precio_unitario || 100;
    });
    setPrecios(initialPrecios);
    setSelectedProveedor(orden.proveedor_id || "");
    setSelectedImpuestos([]);
    setPreciosDialogOpen(true);
  };

  const calcularSubtotal = () => {
    if (!ordenEditando?.items) return 0;
    return ordenEditando.items.reduce((sum, item) => 
      sum + (precios[item.id] || 100) * item.cantidad_solicitada, 0
    );
  };

  const calcularImpuestosTotal = () => {
    const subtotal = calcularSubtotal();
    let totalImpuestos = 0;
    let totalRetenciones = 0;

    selectedImpuestos.forEach(impId => {
      const imp = impuestos.find(i => i.id === impId);
      if (imp) {
        // tasa está en decimal (ej: 0.16 para 16%)
        const monto = subtotal * Number(imp.tasa);
        if (imp.tipo === 'cargo') {
          totalImpuestos += monto;
        } else {
          totalRetenciones += monto;
        }
      }
    });

    return { totalImpuestos, totalRetenciones };
  };

  const calcularTotalConImpuestos = () => {
    const subtotal = calcularSubtotal();
    const { totalImpuestos, totalRetenciones } = calcularImpuestosTotal();
    return subtotal + totalImpuestos - totalRetenciones;
  };

  const guardarPreciosYEnviarAFinanzas = async () => {
    if (!ordenEditando) return;

    setProcessingDoc(ordenEditando.id);
    try {
      // Update item prices
      for (const item of ordenEditando.items || []) {
        await supabase
          .from("pedido_items")
          .update({ precio_unitario: precios[item.id] || 100 })
          .eq("id", item.id);
      }

      const subtotal = calcularSubtotal();
      const { totalImpuestos, totalRetenciones } = calcularImpuestosTotal();
      const total = calcularTotalConImpuestos();

      // Update order with totals and provider
      await supabase
        .from("pedidos_compra")
        .update({
          estado: "enviado_a_finanzas",
          proveedor_id: selectedProveedor || null,
          proveedor: proveedores.find(p => p.id === selectedProveedor)?.nombre || ordenEditando.proveedor,
          subtotal,
          total_impuestos: totalImpuestos,
          total_retenciones: totalRetenciones,
          total,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ordenEditando.id);

      // Insert tax records
      if (selectedImpuestos.length > 0) {
        const taxRecords = selectedImpuestos.map(impId => {
          const imp = impuestos.find(i => i.id === impId)!;
          return {
            pedido_compra_id: ordenEditando.id,
            impuesto_id: impId,
            tasa_aplicada: Number(imp.tasa),
            tipo: imp.tipo,
            monto: subtotal * Number(imp.tasa)
          };
        });

        await supabase.from("orden_compra_impuestos").insert(taxRecords);
      }

      toast.success(`Orden ${ordenEditando.numero_pedido} enviada a Finanzas para pago`);
      setPreciosDialogOpen(false);
      setOrdenEditando(null);
      fetchData();
    } catch (error) {
      console.error("Error sending to finance:", error);
      toast.error("Error al enviar a finanzas");
    } finally {
      setProcessingDoc(null);
    }
  };

  const calcularTotalOrden = (orden: OrdenCompra) => {
    if (orden.total) return orden.total;
    if (!orden.items) return 0;
    return orden.items.reduce((sum, item) => {
      const precio = item.precio_unitario || 100;
      return sum + precio * item.cantidad_solicitada;
    }, 0);
  };

  const getEstadoBadge = (estado: string) => {
    return <StatusTimeline currentStatus={estado} tipo="pedido" />;
  };

  const documentosPendientes = documentos.filter((d) => !d.procesado_por_almacen);
  const ordenesPendientes = ordenesCompra.filter((o) => o.estado === "pendiente");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">LOAD</h1>
          <p className="text-muted-foreground">Logística y Operaciones de Almacén y Distribución</p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documentos Pendientes</CardTitle>
            <FileText className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documentosPendientes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Órdenes por Enviar</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ordenesPendientes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Items en Almacén</CardTitle>
            <Warehouse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{almacenCentral.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Total Central</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {almacenCentral.reduce((sum, item) => sum + item.cantidad_disponible, 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="almacen" className="space-y-4">
        <TabsList>
          <TabsTrigger value="almacen">Almacén Central</TabsTrigger>
          <TabsTrigger value="documentos">
            Documentos Recibidos
            {documentosPendientes.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {documentosPendientes.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ordenes">Órdenes de Compra</TabsTrigger>
        </TabsList>

        <TabsContent value="almacen" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Stock del Almacén Central México</CardTitle>
            </CardHeader>
            <CardContent>
              {almacenCentral.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No hay stock en el almacén central</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clave</TableHead>
                      <TableHead>Insumo</TableHead>
                      <TableHead>Lote</TableHead>
                      <TableHead className="text-right">Cantidad Disponible</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {almacenCentral.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">{item.insumo?.clave}</TableCell>
                        <TableCell className="font-medium">{item.insumo?.nombre}</TableCell>
                        <TableCell className="font-mono text-sm">{item.lote}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-green-600">
                          {item.cantidad_disponible.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documentos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Documentos de Necesidades Recibidos</CardTitle>
              <p className="text-sm text-muted-foreground">
                Descarga el Excel, consulta con proveedores, y sube la respuesta con precios.
              </p>
            </CardHeader>
            <CardContent>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx,.xls"
                className="hidden"
              />

              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Cargando...</div>
              ) : documentos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No hay documentos recibidos</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha Recibido</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Total Requerido</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documentos.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          {new Date(doc.fecha_generacion).toLocaleDateString("es-MX", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-right">{doc.detalles?.length || 0}</TableCell>
                        <TableCell className="text-right font-mono">
                          {doc.detalles?.reduce((sum, d) => sum + d.total_faltante_requerido, 0).toLocaleString() || 0}
                        </TableCell>
                        <TableCell>
                          {doc.procesado_por_almacen ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Procesado
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <Clock className="mr-1 h-3 w-3" />
                              Pendiente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => descargarExcelParaProveedor(doc)}>
                              <Download className="mr-2 h-4 w-4" />
                              Descargar Excel
                            </Button>

                            {!doc.procesado_por_almacen && (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => {
                                  setSelectedDocId(doc.id);
                                  fileInputRef.current?.click();
                                }}
                                disabled={uploading}
                              >
                                <Upload className="mr-2 h-4 w-4" />
                                {uploading ? "Procesando..." : "Subir Respuesta"}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Órdenes de Compra</CardTitle>
              <p className="text-sm text-muted-foreground">
                Revisa las órdenes, ajusta precios, selecciona proveedor e impuestos, y envía a Finanzas.
              </p>
            </CardHeader>
            <CardContent>
              {ordenesCompra.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No hay órdenes de compra</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordenesCompra.map((orden) => (
                      <TableRow key={orden.id}>
                        <TableCell className="font-mono font-bold">{orden.numero_pedido}</TableCell>
                        <TableCell>{new Date(orden.created_at).toLocaleDateString("es-MX")}</TableCell>
                        <TableCell className="text-right">{orden.total_items}</TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          ${calcularTotalOrden(orden).toLocaleString()}
                        </TableCell>
                        <TableCell>{getEstadoBadge(orden.estado)}</TableCell>
                        <TableCell>
                          {orden.estado === "pendiente" && (
                            <Button
                              size="sm"
                              onClick={() => abrirPreciosDialog(orden)}
                              disabled={processingDoc === orden.id}
                            >
                              <DollarSign className="mr-2 h-4 w-4" />
                              Enviar a Finanzas
                            </Button>
                          )}
                          {orden.estado === "enviado_a_finanzas" && (
                            <Badge className="bg-amber-100 text-amber-800">
                              <Clock className="mr-1 h-3 w-3" />
                              Pendiente de Pago
                            </Badge>
                          )}
                          {orden.estado === "pagado_espera_confirmacion" && (
                            <Badge className="bg-cyan-100 text-cyan-800">
                              <Truck className="mr-1 h-3 w-3" />
                              Esperando recepción
                            </Badge>
                          )}
                          {orden.estado === "recibido" && (
                            <Badge variant="outline" className="bg-green-50 text-green-700">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Completado
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={preciosDialogOpen} onOpenChange={setPreciosDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Enviar a Finanzas - Orden {ordenEditando?.numero_pedido}
            </DialogTitle>
          </DialogHeader>

          {ordenEditando && (
            <div className="space-y-6">
              {/* Proveedor Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Proveedor
                </Label>
                <Select value={selectedProveedor} onValueChange={setSelectedProveedor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar proveedor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {proveedores.map(prov => (
                      <SelectItem key={prov.id} value={prov.id}>
                        {prov.nombre} {prov.rfc && `(${prov.rfc})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Items Table */}
              <div className="space-y-2">
                <Label>Insumos y Precios</Label>
                <ScrollArea className="max-h-[30vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Clave</TableHead>
                        <TableHead>Insumo</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Precio Unit.</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordenEditando.items?.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm">{item.insumo?.clave}</TableCell>
                          <TableCell>{item.insumo?.nombre}</TableCell>
                          <TableCell className="text-right font-mono">{item.cantidad_solicitada}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              value={precios[item.id] || 100}
                              onChange={(e) =>
                                setPrecios({
                                  ...precios,
                                  [item.id]: Number(e.target.value),
                                })
                              }
                              className="w-24 h-8 text-right"
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            ${((precios[item.id] || 100) * item.cantidad_solicitada).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>

              <Separator />

              {/* Impuestos Section */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  Impuestos y Retenciones
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  {impuestos.map(imp => (
                    <div key={imp.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={imp.id}
                        checked={selectedImpuestos.includes(imp.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedImpuestos([...selectedImpuestos, imp.id]);
                          } else {
                            setSelectedImpuestos(selectedImpuestos.filter(id => id !== imp.id));
                          }
                        }}
                      />
                      <label htmlFor={imp.id} className="text-sm cursor-pointer flex-1">
                        <span className="font-medium">{imp.nombre}</span>
                        <span className={`ml-2 ${imp.tipo === 'cargo' ? 'text-amber-600' : 'text-green-600'}`}>
                          {imp.tipo === 'cargo' ? '+' : '-'}{imp.tasa}%
                        </span>
                        {imp.descripcion && (
                          <span className="block text-xs text-muted-foreground">{imp.descripcion}</span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
                {impuestos.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No hay impuestos configurados. Puede agregarlos desde el catálogo de impuestos.
                  </p>
                )}
              </div>

              <Separator />

              {/* Totals */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-mono">${calcularSubtotal().toLocaleString()}</span>
                </div>
                {calcularImpuestosTotal().totalImpuestos > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Impuestos:</span>
                    <span className="font-mono text-amber-600">+${calcularImpuestosTotal().totalImpuestos.toLocaleString()}</span>
                  </div>
                )}
                {calcularImpuestosTotal().totalRetenciones > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Retenciones:</span>
                    <span className="font-mono text-green-600">-${calcularImpuestosTotal().totalRetenciones.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-medium">Total de la Orden:</span>
                  <span className="text-2xl font-bold">${calcularTotalConImpuestos().toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreciosDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardarPreciosYEnviarAFinanzas} disabled={processingDoc === ordenEditando?.id}>
              <Send className="mr-2 h-4 w-4" />
              {processingDoc === ordenEditando?.id ? "Enviando..." : "Enviar a Finanzas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GerenteAlmacenDashboard;
