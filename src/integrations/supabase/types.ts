export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      almacenes: {
        Row: {
          activo: boolean | null
          created_at: string | null
          id: string
          nombre: string
          sucursal_id: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre?: string
          sucursal_id: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre?: string
          sucursal_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "almacenes_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          accion: string
          created_at: string | null
          datos_antes: Json | null
          datos_despues: Json | null
          entidad: string
          entidad_id: string | null
          id: string
          ip: string | null
          sucursal_id: string | null
          usuario_id: string | null
          usuario_nombre: string | null
        }
        Insert: {
          accion: string
          created_at?: string | null
          datos_antes?: Json | null
          datos_despues?: Json | null
          entidad: string
          entidad_id?: string | null
          id?: string
          ip?: string | null
          sucursal_id?: string | null
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Update: {
          accion?: string
          created_at?: string | null
          datos_antes?: Json | null
          datos_despues?: Json | null
          entidad?: string
          entidad_id?: string | null
          id?: string
          ip?: string | null
          sucursal_id?: string | null
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      bolsas_valores: {
        Row: {
          corte_id: string | null
          created_at: string | null
          depositado_at: string | null
          estado: string
          id: string
          monto: number
          notas: string | null
          numero_bolsa: string
          recolectado_at: string | null
          recolectado_por: string | null
          sucursal_id: string
        }
        Insert: {
          corte_id?: string | null
          created_at?: string | null
          depositado_at?: string | null
          estado?: string
          id?: string
          monto: number
          notas?: string | null
          numero_bolsa: string
          recolectado_at?: string | null
          recolectado_por?: string | null
          sucursal_id: string
        }
        Update: {
          corte_id?: string | null
          created_at?: string | null
          depositado_at?: string | null
          estado?: string
          id?: string
          monto?: number
          notas?: string | null
          numero_bolsa?: string
          recolectado_at?: string | null
          recolectado_por?: string | null
          sucursal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bolsas_valores_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "cortes_caja"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bolsas_valores_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          activo: boolean | null
          created_at: string | null
          direccion: string | null
          email: string | null
          id: string
          nombre: string
          rfc: string | null
          telefono: string | null
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          nombre: string
          rfc?: string | null
          telefono?: string | null
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          nombre?: string
          rfc?: string | null
          telefono?: string | null
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      compra_lineas: {
        Row: {
          cantidad_ordenada: number
          cantidad_recibida: number | null
          compra_id: string
          created_at: string | null
          fecha_caducidad: string | null
          id: string
          lote_asignado: string | null
          merma_recepcion: number | null
          notas: string | null
          precio_unitario_estimado: number
          precio_unitario_real: number | null
          producto_id: string
        }
        Insert: {
          cantidad_ordenada: number
          cantidad_recibida?: number | null
          compra_id: string
          created_at?: string | null
          fecha_caducidad?: string | null
          id?: string
          lote_asignado?: string | null
          merma_recepcion?: number | null
          notas?: string | null
          precio_unitario_estimado?: number
          precio_unitario_real?: number | null
          producto_id: string
        }
        Update: {
          cantidad_ordenada?: number
          cantidad_recibida?: number | null
          compra_id?: string
          created_at?: string | null
          fecha_caducidad?: string | null
          id?: string
          lote_asignado?: string | null
          merma_recepcion?: number | null
          notas?: string | null
          precio_unitario_estimado?: number
          precio_unitario_real?: number | null
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compra_lineas_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      compras: {
        Row: {
          almacen_id: string | null
          comprobante_pago_url: string | null
          creado_por: string | null
          created_at: string | null
          estado: string
          id: string
          impuestos: number
          notas: string | null
          numero_compra: string
          proveedor_id: string
          subtotal: number
          sucursal_id: string
          total: number
          updated_at: string | null
        }
        Insert: {
          almacen_id?: string | null
          comprobante_pago_url?: string | null
          creado_por?: string | null
          created_at?: string | null
          estado?: string
          id?: string
          impuestos?: number
          notas?: string | null
          numero_compra: string
          proveedor_id: string
          subtotal?: number
          sucursal_id: string
          total?: number
          updated_at?: string | null
        }
        Update: {
          almacen_id?: string | null
          comprobante_pago_url?: string | null
          creado_por?: string | null
          created_at?: string | null
          estado?: string
          id?: string
          impuestos?: number
          notas?: string | null
          numero_compra?: string
          proveedor_id?: string
          subtotal?: number
          sucursal_id?: string
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliacion_bancaria: {
        Row: {
          bolsa_id: string | null
          created_at: string | null
          estado: string
          fecha_estado_cuenta: string | null
          id: string
          monto: number
          notas: string | null
          referencia: string | null
        }
        Insert: {
          bolsa_id?: string | null
          created_at?: string | null
          estado?: string
          fecha_estado_cuenta?: string | null
          id?: string
          monto: number
          notas?: string | null
          referencia?: string | null
        }
        Update: {
          bolsa_id?: string | null
          created_at?: string | null
          estado?: string
          fecha_estado_cuenta?: string | null
          id?: string
          monto?: number
          notas?: string | null
          referencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conciliacion_bancaria_bolsa_id_fkey"
            columns: ["bolsa_id"]
            isOneToOne: false
            referencedRelation: "bolsas_valores"
            referencedColumns: ["id"]
          },
        ]
      }
      cortes_caja: {
        Row: {
          cajero_id: string
          cerrado_at: string | null
          cerrado_por: string | null
          created_at: string | null
          diferencia: number | null
          efectivo_esperado: number | null
          efectivo_recibido: number | null
          estado: string
          fecha: string
          id: string
          notas: string | null
          sucursal_id: string
        }
        Insert: {
          cajero_id: string
          cerrado_at?: string | null
          cerrado_por?: string | null
          created_at?: string | null
          diferencia?: number | null
          efectivo_esperado?: number | null
          efectivo_recibido?: number | null
          estado?: string
          fecha?: string
          id?: string
          notas?: string | null
          sucursal_id: string
        }
        Update: {
          cajero_id?: string
          cerrado_at?: string | null
          cerrado_por?: string | null
          created_at?: string | null
          diferencia?: number | null
          efectivo_esperado?: number | null
          efectivo_recibido?: number | null
          estado?: string
          fecha?: string
          id?: string
          notas?: string | null
          sucursal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cortes_caja_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario: {
        Row: {
          almacen_id: string
          cantidad: number
          created_at: string | null
          id: string
          lote_id: string
          updated_at: string | null
        }
        Insert: {
          almacen_id: string
          cantidad?: number
          created_at?: string | null
          id?: string
          lote_id: string
          updated_at?: string | null
        }
        Update: {
          almacen_id?: string
          cantidad?: number
          created_at?: string | null
          id?: string
          lote_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventario_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes: {
        Row: {
          costo_unitario: number
          created_at: string | null
          fecha_caducidad: string | null
          id: string
          numero_lote: string
          producto_id: string
          proveedor_id: string | null
        }
        Insert: {
          costo_unitario?: number
          created_at?: string | null
          fecha_caducidad?: string | null
          id?: string
          numero_lote: string
          producto_id: string
          proveedor_id?: string | null
        }
        Update: {
          costo_unitario?: number
          created_at?: string | null
          fecha_caducidad?: string | null
          id?: string
          numero_lote?: string
          producto_id?: string
          proveedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lotes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      metodos_pago: {
        Row: {
          activo: boolean | null
          created_at: string | null
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      motivos_ajuste: {
        Row: {
          activo: boolean | null
          created_at: string | null
          id: string
          nombre: string
          tipo: string
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre: string
          tipo?: string
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre?: string
          tipo?: string
        }
        Relationships: []
      }
      movimientos_inventario: {
        Row: {
          almacen_id: string
          cantidad: number
          costo_unitario: number | null
          created_at: string | null
          id: string
          lote_id: string
          motivo_id: string | null
          notas: string | null
          referencia_id: string | null
          referencia_tipo: string | null
          sucursal_id: string | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          almacen_id: string
          cantidad: number
          costo_unitario?: number | null
          created_at?: string | null
          id?: string
          lote_id: string
          motivo_id?: string | null
          notas?: string | null
          referencia_id?: string | null
          referencia_tipo?: string | null
          sucursal_id?: string | null
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          almacen_id?: string
          cantidad?: number
          costo_unitario?: number | null
          created_at?: string | null
          id?: string
          lote_id?: string
          motivo_id?: string | null
          notas?: string | null
          referencia_id?: string | null
          referencia_tipo?: string | null
          sucursal_id?: string | null
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_inventario_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_motivo_id_fkey"
            columns: ["motivo_id"]
            isOneToOne: false
            referencedRelation: "motivos_ajuste"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_lineas: {
        Row: {
          cantidad: number
          created_at: string | null
          id: string
          lote_id: string
          pedido_id: string
          precio_unitario: number
          producto_id: string
          subtotal: number
        }
        Insert: {
          cantidad: number
          created_at?: string | null
          id?: string
          lote_id: string
          pedido_id: string
          precio_unitario?: number
          producto_id: string
          subtotal?: number
        }
        Update: {
          cantidad?: number
          created_at?: string | null
          id?: string
          lote_id?: string
          pedido_id?: string
          precio_unitario?: number
          producto_id?: string
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedido_lineas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_lineas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          cliente_id: string | null
          creado_por: string | null
          created_at: string | null
          estado: string
          id: string
          notas: string | null
          numero_pedido: string
          ruta_id: string | null
          sucursal_id: string
          updated_at: string | null
        }
        Insert: {
          cliente_id?: string | null
          creado_por?: string | null
          created_at?: string | null
          estado?: string
          id?: string
          notas?: string | null
          numero_pedido: string
          ruta_id?: string | null
          sucursal_id: string
          updated_at?: string | null
        }
        Update: {
          cliente_id?: string | null
          creado_por?: string | null
          created_at?: string | null
          estado?: string
          id?: string
          notas?: string | null
          numero_pedido?: string
          ruta_id?: string | null
          sucursal_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_ruta_id_fkey"
            columns: ["ruta_id"]
            isOneToOne: false
            referencedRelation: "rutas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_precios_sucursal: {
        Row: {
          activo: boolean | null
          created_at: string | null
          id: string
          precio: number
          producto_id: string
          sucursal_id: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          precio: number
          producto_id: string
          sucursal_id: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          precio?: number
          producto_id?: string
          sucursal_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producto_precios_sucursal_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_precios_sucursal_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean | null
          categoria: string | null
          codigo_barras: string | null
          created_at: string | null
          descripcion: string | null
          id: string
          iva_incluido: boolean | null
          nombre: string
          precio_base: number
          requiere_lote: boolean | null
          sku: string
          stock_minimo: number | null
          unidad: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          categoria?: string | null
          codigo_barras?: string | null
          created_at?: string | null
          descripcion?: string | null
          id?: string
          iva_incluido?: boolean | null
          nombre: string
          precio_base?: number
          requiere_lote?: boolean | null
          sku: string
          stock_minimo?: number | null
          unidad?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          categoria?: string | null
          codigo_barras?: string | null
          created_at?: string | null
          descripcion?: string | null
          id?: string
          iva_incluido?: boolean | null
          nombre?: string
          precio_base?: number
          requiere_lote?: boolean | null
          sku?: string
          stock_minimo?: number | null
          unidad?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activo: boolean | null
          created_at: string | null
          email: string | null
          id: string
          nombre: string
          telefono: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          email?: string | null
          id: string
          nombre?: string
          telefono?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          email?: string | null
          id?: string
          nombre?: string
          telefono?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      proveedores: {
        Row: {
          activo: boolean | null
          contacto: string | null
          created_at: string | null
          email: string | null
          id: string
          nombre: string
          rfc: string | null
          telefono: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          contacto?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nombre: string
          rfc?: string | null
          telefono?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          contacto?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nombre?: string
          rfc?: string | null
          telefono?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ruta_entregas: {
        Row: {
          cantidad_devuelta: number | null
          cantidad_entregada: number | null
          cantidad_enviada: number
          cantidad_merma: number | null
          cliente_id: string | null
          created_at: string | null
          estado: string | null
          id: string
          lote_id: string
          notas: string | null
          producto_id: string
          ruta_id: string
        }
        Insert: {
          cantidad_devuelta?: number | null
          cantidad_entregada?: number | null
          cantidad_enviada: number
          cantidad_merma?: number | null
          cliente_id?: string | null
          created_at?: string | null
          estado?: string | null
          id?: string
          lote_id: string
          notas?: string | null
          producto_id: string
          ruta_id: string
        }
        Update: {
          cantidad_devuelta?: number | null
          cantidad_entregada?: number | null
          cantidad_enviada?: number
          cantidad_merma?: number | null
          cliente_id?: string | null
          created_at?: string | null
          estado?: string | null
          id?: string
          lote_id?: string
          notas?: string | null
          producto_id?: string
          ruta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ruta_entregas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruta_entregas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruta_entregas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruta_entregas_ruta_id_fkey"
            columns: ["ruta_id"]
            isOneToOne: false
            referencedRelation: "rutas"
            referencedColumns: ["id"]
          },
        ]
      }
      rutas: {
        Row: {
          created_at: string | null
          estado: string
          fecha: string
          id: string
          notas: string | null
          repartidor_id: string
          sucursal_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          estado?: string
          fecha?: string
          id?: string
          notas?: string | null
          repartidor_id: string
          sucursal_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          estado?: string
          fecha?: string
          id?: string
          notas?: string | null
          repartidor_id?: string
          sucursal_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rutas_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      sucursales: {
        Row: {
          activo: boolean | null
          codigo: string
          created_at: string | null
          direccion: string | null
          id: string
          nombre: string
          telefono: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          codigo: string
          created_at?: string | null
          direccion?: string | null
          id?: string
          nombre: string
          telefono?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          codigo?: string
          created_at?: string | null
          direccion?: string | null
          id?: string
          nombre?: string
          telefono?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      traspaso_lineas: {
        Row: {
          cantidad: number
          created_at: string | null
          id: string
          lote_id: string
          traspaso_id: string
        }
        Insert: {
          cantidad: number
          created_at?: string | null
          id?: string
          lote_id: string
          traspaso_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string | null
          id?: string
          lote_id?: string
          traspaso_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "traspaso_lineas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traspaso_lineas_traspaso_id_fkey"
            columns: ["traspaso_id"]
            isOneToOne: false
            referencedRelation: "traspasos"
            referencedColumns: ["id"]
          },
        ]
      }
      traspasos: {
        Row: {
          almacen_destino_id: string
          almacen_origen_id: string
          created_at: string | null
          estado: string
          id: string
          notas: string | null
          recibido_por: string | null
          solicitado_por: string | null
          updated_at: string | null
        }
        Insert: {
          almacen_destino_id: string
          almacen_origen_id: string
          created_at?: string | null
          estado?: string
          id?: string
          notas?: string | null
          recibido_por?: string | null
          solicitado_por?: string | null
          updated_at?: string | null
        }
        Update: {
          almacen_destino_id?: string
          almacen_origen_id?: string
          created_at?: string | null
          estado?: string
          id?: string
          notas?: string | null
          recibido_por?: string | null
          solicitado_por?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "traspasos_almacen_destino_id_fkey"
            columns: ["almacen_destino_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traspasos_almacen_origen_id_fkey"
            columns: ["almacen_origen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      venta_lineas: {
        Row: {
          cantidad: number
          created_at: string | null
          id: string
          lote_id: string
          precio_unitario: number
          producto_id: string
          subtotal: number
          venta_id: string
        }
        Insert: {
          cantidad: number
          created_at?: string | null
          id?: string
          lote_id: string
          precio_unitario: number
          producto_id: string
          subtotal: number
          venta_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string | null
          id?: string
          lote_id?: string
          precio_unitario?: number
          producto_id?: string
          subtotal?: number
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_lineas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_lineas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_pagos: {
        Row: {
          created_at: string | null
          id: string
          metodo_pago_id: string
          monto: number
          referencia: string | null
          venta_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          metodo_pago_id: string
          monto: number
          referencia?: string | null
          venta_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          metodo_pago_id?: string
          monto?: number
          referencia?: string | null
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_pagos_metodo_pago_id_fkey"
            columns: ["metodo_pago_id"]
            isOneToOne: false
            referencedRelation: "metodos_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_pagos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas: {
        Row: {
          cajero_id: string
          cliente_id: string | null
          corte_id: string | null
          created_at: string | null
          estado: string
          fecha: string | null
          id: string
          impuestos: number
          notas: string | null
          numero_venta: string
          subtotal: number
          sucursal_id: string
          total: number
        }
        Insert: {
          cajero_id: string
          cliente_id?: string | null
          corte_id?: string | null
          created_at?: string | null
          estado?: string
          fecha?: string | null
          id?: string
          impuestos?: number
          notas?: string | null
          numero_venta: string
          subtotal?: number
          sucursal_id: string
          total?: number
        }
        Update: {
          cajero_id?: string
          cliente_id?: string | null
          corte_id?: string | null
          created_at?: string | null
          estado?: string
          fecha?: string | null
          id?: string
          impuestos?: number
          notas?: string | null
          numero_venta?: string
          subtotal?: number
          sucursal_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "ventas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_corte_id_fkey"
            columns: ["corte_id"]
            isOneToOne: false
            referencedRelation: "cortes_caja"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      process_pos_sale: {
        Args: {
          p_cajero_id: string
          p_cliente_id?: string
          p_efectivo_recibido?: number
          p_items: Json
          p_metodo_pago?: string
          p_nota?: string
          p_sucursal_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "gerente"
        | "cajero"
        | "almacen"
        | "repartidor"
        | "auditor"
      estado_traspaso: "pendiente" | "aprobado" | "rechazado" | "completado"
      genero: "masculino" | "femenino"
      tipo_actividad:
        | "folio_creado"
        | "folio_cancelado"
        | "folio_borrador_creado"
        | "folio_borrador_eliminado"
        | "traspaso_almacen_provisional"
        | "devolucion_almacen_principal"
        | "recepcion_almacen_central"
        | "ajuste_inventario"
        | "almacen_provisional_creado"
        | "almacen_provisional_eliminado"
        | "insumo_agregado"
        | "insumo_modificado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "gerente",
        "cajero",
        "almacen",
        "repartidor",
        "auditor",
      ],
      estado_traspaso: ["pendiente", "aprobado", "rechazado", "completado"],
      genero: ["masculino", "femenino"],
      tipo_actividad: [
        "folio_creado",
        "folio_cancelado",
        "folio_borrador_creado",
        "folio_borrador_eliminado",
        "traspaso_almacen_provisional",
        "devolucion_almacen_principal",
        "recepcion_almacen_central",
        "ajuste_inventario",
        "almacen_provisional_creado",
        "almacen_provisional_eliminado",
        "insumo_agregado",
        "insumo_modificado",
      ],
    },
  },
} as const
