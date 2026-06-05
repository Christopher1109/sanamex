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
      cargas_masivas_historico: {
        Row: {
          cargado_por: string | null
          created_at: string
          errores: Json | null
          filas_error: number
          filas_ok: number
          id: string
          nombre_archivo: string | null
          resumen: Json | null
          sucursal_id: string | null
          tipo: string
          total_filas: number
        }
        Insert: {
          cargado_por?: string | null
          created_at?: string
          errores?: Json | null
          filas_error?: number
          filas_ok?: number
          id?: string
          nombre_archivo?: string | null
          resumen?: Json | null
          sucursal_id?: string | null
          tipo: string
          total_filas?: number
        }
        Update: {
          cargado_por?: string | null
          created_at?: string
          errores?: Json | null
          filas_error?: number
          filas_ok?: number
          id?: string
          nombre_archivo?: string | null
          resumen?: Json | null
          sucursal_id?: string | null
          tipo?: string
          total_filas?: number
        }
        Relationships: []
      }
      cfdi_emitidos: {
        Row: {
          created_at: string
          created_by: string | null
          estado: string
          folio: number | null
          id: string
          pac_response: Json | null
          pdf_url: string | null
          pedido_id: string | null
          rfc_receptor: string | null
          serie: string | null
          sucursal_id: string
          timbrado_at: string | null
          total: number
          uuid_sat: string | null
          venta_id: string | null
          xml_url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          estado?: string
          folio?: number | null
          id?: string
          pac_response?: Json | null
          pdf_url?: string | null
          pedido_id?: string | null
          rfc_receptor?: string | null
          serie?: string | null
          sucursal_id: string
          timbrado_at?: string | null
          total?: number
          uuid_sat?: string | null
          venta_id?: string | null
          xml_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          estado?: string
          folio?: number | null
          id?: string
          pac_response?: Json | null
          pdf_url?: string | null
          pedido_id?: string | null
          rfc_receptor?: string | null
          serie?: string | null
          sucursal_id?: string
          timbrado_at?: string | null
          total?: number
          uuid_sat?: string | null
          venta_id?: string | null
          xml_url?: string | null
        }
        Relationships: []
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
          fecha_factura: string | null
          fecha_pago_limite: string | null
          fecha_pago_real: string | null
          id: string
          impuestos: number
          notas: string | null
          notas_pago: string | null
          numero_compra: string
          pagada: boolean
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
          fecha_factura?: string | null
          fecha_pago_limite?: string | null
          fecha_pago_real?: string | null
          id?: string
          impuestos?: number
          notas?: string | null
          notas_pago?: string | null
          numero_compra: string
          pagada?: boolean
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
          fecha_factura?: string | null
          fecha_pago_limite?: string | null
          fecha_pago_real?: string | null
          id?: string
          impuestos?: number
          notas?: string | null
          notas_pago?: string | null
          numero_compra?: string
          pagada?: boolean
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
      configuracion_fiscal: {
        Row: {
          activo: boolean
          certificado_csd_url: string | null
          cp_emisor: string | null
          created_at: string
          csd_password_hint: string | null
          folio_actual: number | null
          id: string
          llave_csd_url: string | null
          pac_proveedor: string | null
          pac_usuario: string | null
          razon_social: string
          regimen_fiscal: string | null
          rfc: string
          serie_default: string | null
          sucursal_id: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          certificado_csd_url?: string | null
          cp_emisor?: string | null
          created_at?: string
          csd_password_hint?: string | null
          folio_actual?: number | null
          id?: string
          llave_csd_url?: string | null
          pac_proveedor?: string | null
          pac_usuario?: string | null
          razon_social: string
          regimen_fiscal?: string | null
          rfc: string
          serie_default?: string | null
          sucursal_id?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          certificado_csd_url?: string | null
          cp_emisor?: string | null
          created_at?: string
          csd_password_hint?: string | null
          folio_actual?: number | null
          id?: string
          llave_csd_url?: string | null
          pac_proveedor?: string | null
          pac_usuario?: string | null
          razon_social?: string
          regimen_fiscal?: string | null
          rfc?: string
          serie_default?: string | null
          sucursal_id?: string | null
          updated_at?: string
        }
        Relationships: []
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
          compra_id: string | null
          costo_unitario: number
          created_at: string | null
          fecha_caducidad: string | null
          fecha_pago_proveedor: string | null
          fecha_recepcion: string | null
          id: string
          numero_lote: string
          producto_id: string
          proveedor_id: string | null
        }
        Insert: {
          compra_id?: string | null
          costo_unitario?: number
          created_at?: string | null
          fecha_caducidad?: string | null
          fecha_pago_proveedor?: string | null
          fecha_recepcion?: string | null
          id?: string
          numero_lote: string
          producto_id: string
          proveedor_id?: string | null
        }
        Update: {
          compra_id?: string | null
          costo_unitario?: number
          created_at?: string | null
          fecha_caducidad?: string | null
          fecha_pago_proveedor?: string | null
          fecha_recepcion?: string | null
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
      notificaciones: {
        Row: {
          created_at: string
          id: string
          leida: boolean
          leida_at: string | null
          mensaje: string
          referencia_id: string | null
          referencia_tipo: string | null
          severidad: string
          sucursal_id: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          created_at?: string
          id?: string
          leida?: boolean
          leida_at?: string | null
          mensaje: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          severidad?: string
          sucursal_id?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          created_at?: string
          id?: string
          leida?: boolean
          leida_at?: string | null
          mensaje?: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          severidad?: string
          sucursal_id?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
      password_resets_log: {
        Row: {
          created_at: string
          id: string
          notas: string | null
          password_assigned: string
          reset_by: string
          target_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notas?: string | null
          password_assigned: string
          reset_by: string
          target_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notas?: string | null
          password_assigned?: string
          reset_by?: string
          target_user_id?: string
        }
        Relationships: []
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
      producto_precios_escalonados: {
        Row: {
          cantidad_minima: number
          created_at: string
          id: string
          nivel: number
          precio: number
          producto_id: string
          updated_at: string
        }
        Insert: {
          cantidad_minima?: number
          created_at?: string
          id?: string
          nivel: number
          precio?: number
          producto_id: string
          updated_at?: string
        }
        Update: {
          cantidad_minima?: number
          created_at?: string
          id?: string
          nivel?: number
          precio?: number
          producto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_precios_escalonados_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
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
          agrupador: string | null
          categoria: string | null
          clasificacion_80_20: string | null
          clave_sat: string | null
          codigo_barras: string | null
          codigo_interno: string | null
          costo: number | null
          costo_promedio: number
          created_at: string | null
          departamento: string | null
          descripcion: string | null
          estatus: string | null
          fecha_carga_erp: string | null
          forma_farmaceutica: string | null
          formula: string | null
          fraccion_arancelaria: string | null
          id: string
          ieps: number | null
          indice_terapeutico: string | null
          iva_incluido: boolean | null
          iva_tasa: number | null
          laboratorio: string | null
          nombre: string
          precio_base: number
          presentacion: string | null
          receta_medica: boolean | null
          registro_sanitario: string | null
          requiere_lote: boolean | null
          sku: string
          stock_minimo: number | null
          sustancia_activa: string | null
          unidad: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          agrupador?: string | null
          categoria?: string | null
          clasificacion_80_20?: string | null
          clave_sat?: string | null
          codigo_barras?: string | null
          codigo_interno?: string | null
          costo?: number | null
          costo_promedio?: number
          created_at?: string | null
          departamento?: string | null
          descripcion?: string | null
          estatus?: string | null
          fecha_carga_erp?: string | null
          forma_farmaceutica?: string | null
          formula?: string | null
          fraccion_arancelaria?: string | null
          id?: string
          ieps?: number | null
          indice_terapeutico?: string | null
          iva_incluido?: boolean | null
          iva_tasa?: number | null
          laboratorio?: string | null
          nombre: string
          precio_base?: number
          presentacion?: string | null
          receta_medica?: boolean | null
          registro_sanitario?: string | null
          requiere_lote?: boolean | null
          sku: string
          stock_minimo?: number | null
          sustancia_activa?: string | null
          unidad?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          agrupador?: string | null
          categoria?: string | null
          clasificacion_80_20?: string | null
          clave_sat?: string | null
          codigo_barras?: string | null
          codigo_interno?: string | null
          costo?: number | null
          costo_promedio?: number
          created_at?: string | null
          departamento?: string | null
          descripcion?: string | null
          estatus?: string | null
          fecha_carga_erp?: string | null
          forma_farmaceutica?: string | null
          formula?: string | null
          fraccion_arancelaria?: string | null
          id?: string
          ieps?: number | null
          indice_terapeutico?: string | null
          iva_incluido?: boolean | null
          iva_tasa?: number | null
          laboratorio?: string | null
          nombre?: string
          precio_base?: number
          presentacion?: string | null
          receta_medica?: boolean | null
          registro_sanitario?: string | null
          requiere_lote?: boolean | null
          sku?: string
          stock_minimo?: number | null
          sustancia_activa?: string | null
          unidad?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      productos_precios_lista: {
        Row: {
          created_at: string
          id: string
          lista: number
          precio: number
          producto_id: string
          updated_at: string
          vigente_desde: string
        }
        Insert: {
          created_at?: string
          id?: string
          lista: number
          precio: number
          producto_id: string
          updated_at?: string
          vigente_desde?: string
        }
        Update: {
          created_at?: string
          id?: string
          lista?: number
          precio?: number
          producto_id?: string
          updated_at?: string
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_precios_lista_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      productos_status: {
        Row: {
          codigo: string
          created_at: string
          nombre: string
          orden: number | null
        }
        Insert: {
          codigo: string
          created_at?: string
          nombre: string
          orden?: number | null
        }
        Update: {
          codigo?: string
          created_at?: string
          nombre?: string
          orden?: number | null
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
          aviso_funcionamiento_url: string | null
          banco: string | null
          comprobante_domicilio_url: string | null
          condiciones: string | null
          constancia_situacion_fiscal_url: string | null
          contacto: string | null
          correo_aux: string | null
          created_at: string | null
          cuenta_banco: string | null
          direccion_fiscal: string | null
          email: string | null
          id: string
          identificacion_oficial_url: string | null
          lead_time_prometido_dias: number | null
          nombre: string
          notas: string | null
          plazo_pago_dias: number
          rfc: string | null
          telefono: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          aviso_funcionamiento_url?: string | null
          banco?: string | null
          comprobante_domicilio_url?: string | null
          condiciones?: string | null
          constancia_situacion_fiscal_url?: string | null
          contacto?: string | null
          correo_aux?: string | null
          created_at?: string | null
          cuenta_banco?: string | null
          direccion_fiscal?: string | null
          email?: string | null
          id?: string
          identificacion_oficial_url?: string | null
          lead_time_prometido_dias?: number | null
          nombre: string
          notas?: string | null
          plazo_pago_dias?: number
          rfc?: string | null
          telefono?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          aviso_funcionamiento_url?: string | null
          banco?: string | null
          comprobante_domicilio_url?: string | null
          condiciones?: string | null
          constancia_situacion_fiscal_url?: string | null
          contacto?: string | null
          correo_aux?: string | null
          created_at?: string | null
          cuenta_banco?: string | null
          direccion_fiscal?: string | null
          email?: string | null
          id?: string
          identificacion_oficial_url?: string | null
          lead_time_prometido_dias?: number | null
          nombre?: string
          notas?: string | null
          plazo_pago_dias?: number
          rfc?: string | null
          telefono?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      recomendaciones: {
        Row: {
          expira_at: string
          generada_at: string
          generada_por: string | null
          id: string
          modelo: string | null
          payload: Json
          resumen_ia: string | null
          sucursal_id: string
          tipo: string
        }
        Insert: {
          expira_at?: string
          generada_at?: string
          generada_por?: string | null
          id?: string
          modelo?: string | null
          payload: Json
          resumen_ia?: string | null
          sucursal_id: string
          tipo?: string
        }
        Update: {
          expira_at?: string
          generada_at?: string
          generada_por?: string | null
          id?: string
          modelo?: string | null
          payload?: Json
          resumen_ia?: string | null
          sucursal_id?: string
          tipo?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          modulo: string
          permitido: boolean
          rol: string
          submodulo: string
        }
        Insert: {
          created_at?: string
          id?: string
          modulo: string
          permitido?: boolean
          rol: string
          submodulo?: string
        }
        Update: {
          created_at?: string
          id?: string
          modulo?: string
          permitido?: boolean
          rol?: string
          submodulo?: string
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
      user_sucursal_asignacion: {
        Row: {
          created_at: string
          es_principal: boolean
          id: string
          sucursal_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          es_principal?: boolean
          id?: string
          sucursal_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          es_principal?: boolean
          id?: string
          sucursal_id?: string | null
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
          cliente_uuid_local: string | null
          corte_id: string | null
          created_at: string | null
          estado: string
          fecha: string | null
          id: string
          impuestos: number
          lista_precio_aplicada: string | null
          motivo_revision: string | null
          notas: string | null
          numero_venta: string
          origen: string
          sincronizada_at: string | null
          subtotal: number
          sucursal_id: string
          total: number
        }
        Insert: {
          cajero_id: string
          cliente_id?: string | null
          cliente_uuid_local?: string | null
          corte_id?: string | null
          created_at?: string | null
          estado?: string
          fecha?: string | null
          id?: string
          impuestos?: number
          lista_precio_aplicada?: string | null
          motivo_revision?: string | null
          notas?: string | null
          numero_venta: string
          origen?: string
          sincronizada_at?: string | null
          subtotal?: number
          sucursal_id: string
          total?: number
        }
        Update: {
          cajero_id?: string
          cliente_id?: string | null
          cliente_uuid_local?: string | null
          corte_id?: string | null
          created_at?: string | null
          estado?: string
          fecha?: string | null
          id?: string
          impuestos?: number
          lista_precio_aplicada?: string | null
          motivo_revision?: string | null
          notas?: string | null
          numero_venta?: string
          origen?: string
          sincronizada_at?: string | null
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
      ventas_historicas: {
        Row: {
          cantidad: number
          carga_id: string | null
          created_at: string
          fecha: string
          id: string
          precio_unitario: number
          producto_nombre: string | null
          producto_sku: string | null
          proveedor_sugerido: string | null
          sucursal_id: string | null
        }
        Insert: {
          cantidad?: number
          carga_id?: string | null
          created_at?: string
          fecha: string
          id?: string
          precio_unitario?: number
          producto_nombre?: string | null
          producto_sku?: string | null
          proveedor_sugerido?: string | null
          sucursal_id?: string | null
        }
        Update: {
          cantidad?: number
          carga_id?: string | null
          created_at?: string
          fecha?: string
          id?: string
          precio_unitario?: number
          producto_nombre?: string | null
          producto_sku?: string | null
          proveedor_sugerido?: string | null
          sucursal_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clasificacion_abc_productos: { Args: never; Returns: undefined }
      fill_rate_proveedores: {
        Args: { p_desde?: string; p_hasta?: string }
        Returns: {
          fecha_emision: string
          fecha_recepcion: string
          fill_rate_items: number
          fill_rate_lead_time: number
          lead_time_dias: number
          nombre_proveedor: string
          numero_oc: string
          numero_proveedor: string
          total_items_entregados: number
          total_items_solicitados: number
          varianza_tiempo: number
        }[]
      }
      has_permission: {
        Args: { _modulo: string; _submodulo?: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      inventario_abc_por_sucursal: {
        Args: { p_fecha?: string }
        Returns: {
          clasificacion: string
          items: number
          pesos: number
          piezas: number
          sucursal_codigo: string
          sucursal_id: string
        }[]
      }
      inventario_resumen_por_sucursal: {
        Args: { p_fecha?: string }
        Returns: {
          ddi_30: number
          ddi_60: number
          ddi_90: number
          existencias_pesos: number
          existencias_pzs: number
          items: number
          sucursal_codigo: string
          sucursal_id: string
          sucursal_nombre: string
        }[]
      }
      inventario_status_por_sucursal: {
        Args: { p_fecha?: string }
        Returns: {
          cantidad: number
          items: number
          status: string
          sucursal_codigo: string
          sucursal_id: string
        }[]
      }
      mapear_sucursal_legacy: { Args: { p_codigo: string }; Returns: string }
      process_pos_sale:
        | {
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
        | {
            Args: {
              p_cajero_id: string
              p_cliente_id?: string
              p_cliente_uuid_local?: string
              p_efectivo_recibido?: number
              p_items: Json
              p_metodo_pago?: string
              p_nota?: string
              p_origen?: string
              p_sucursal_id: string
            }
            Returns: Json
          }
      recalc_costo_promedio: {
        Args: { _producto_id: string }
        Returns: undefined
      }
      rentabilidad_por_lote: {
        Args: {
          p_fecha_desde?: string
          p_fecha_hasta?: string
          p_sucursal_id?: string
        }
        Returns: {
          costo_total: number
          costo_unitario: number
          fecha_caducidad: string
          fecha_recepcion: string
          ganancia: number
          ingreso_total: number
          lote_id: string
          margen_pct: number
          numero_lote: string
          precio_promedio: number
          producto_id: string
          producto_nombre: string
          producto_sku: string
          stock_actual: number
          unidades_recibidas: number
          unidades_vendidas: number
        }[]
      }
      reporte_margenes: {
        Args: { p_fecha?: string }
        Returns: {
          clasificacion: string
          clave: string
          costo_total: number
          cp: number
          departamento: string
          descripcion: string
          existencias: number
          lp1: number
          lp2: number
          lp3: number
          lp4: number
          margen_lp1: number
          margen_lp2: number
          margen_lp3: number
          margen_lp4: number
          producto_id: string
          status: string
          util_lp1: number
          util_lp2: number
          util_lp3: number
          util_lp4: number
        }[]
      }
      reporte_ventas_inventario_sanamex: {
        Args: { p_fecha_corte?: string; p_sucursal_id?: string }
        Returns: {
          agrupador: string
          cantidad: number
          categoria: string
          clasif: string
          clave: string
          costo_total: number
          cpi: number
          cu_compra_2sem_ant: number
          cu_compra_30: number
          cu_compra_60: number
          cu_compra_90: number
          cu_compra_dia: number
          cu_compra_mes: number
          cu_compra_sem: number
          cu_compra_sem_ant: number
          ddi_14: number
          ddi_30: number
          ddi_60: number
          ddi_7: number
          ddi_90: number
          departamento: string
          descripcion: string
          iva: number
          lab: string
          margen_2sem_ant: number
          margen_30: number
          margen_60: number
          margen_90: number
          margen_dia: number
          margen_mes: number
          margen_sem: number
          margen_sem_ant: number
          pu_venta_2sem_ant: number
          pu_venta_30: number
          pu_venta_60: number
          pu_venta_90: number
          pu_venta_dia: number
          pu_venta_mes: number
          pu_venta_sem: number
          pu_venta_sem_ant: number
          status: string
          sustancia: string
          te: number
          un_v_2sem_ant: number
          un_v_30: number
          un_v_60: number
          un_v_90: number
          un_v_dia: number
          un_v_mes: number
          un_v_sem: number
          un_v_sem_ant: number
          utilidad_2sem_ant: number
          utilidad_30: number
          utilidad_60: number
          utilidad_90: number
          utilidad_dia: number
          utilidad_mes: number
          utilidad_sem: number
          utilidad_sem_ant: number
          venta_2sem_ant: number
          venta_30: number
          venta_60: number
          venta_90: number
          venta_dia: number
          venta_mes: number
          venta_sem: number
          venta_sem_ant: number
        }[]
      }
      ventas_por_lote: {
        Args: { p_lote_id: string }
        Returns: {
          cantidad: number
          cliente_nombre: string
          fecha: string
          lista_precio: string
          numero_venta: string
          precio_unitario: number
          subtotal: number
          sucursal_nombre: string
          venta_id: string
        }[]
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
        | "super_admin"
        | "supervisor"
        | "subgerente"
        | "auditoria"
        | "almacen_ventas"
        | "ventas"
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
        "super_admin",
        "supervisor",
        "subgerente",
        "auditoria",
        "almacen_ventas",
        "ventas",
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
