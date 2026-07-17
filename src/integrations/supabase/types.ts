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
      admin_permisos_matriz: {
        Row: {
          area: string
          autorizar_dispersion: boolean
          autorizar_pagos: boolean
          capturar: boolean
          consultar: boolean
          created_at: string
          dispersar: boolean
          id: string
          puesto_asociado: string | null
          rol: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          area: string
          autorizar_dispersion?: boolean
          autorizar_pagos?: boolean
          capturar?: boolean
          consultar?: boolean
          created_at?: string
          dispersar?: boolean
          id?: string
          puesto_asociado?: string | null
          rol: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          area?: string
          autorizar_dispersion?: boolean
          autorizar_pagos?: boolean
          capturar?: boolean
          consultar?: boolean
          created_at?: string
          dispersar?: boolean
          id?: string
          puesto_asociado?: string | null
          rol?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
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
      asistencia: {
        Row: {
          created_at: string
          empleado_id: string
          entrada: string | null
          fecha: string
          horas_extra: number | null
          id: string
          incidencia: string | null
          notas: string | null
          origen: string
          salida: string | null
        }
        Insert: {
          created_at?: string
          empleado_id: string
          entrada?: string | null
          fecha: string
          horas_extra?: number | null
          id?: string
          incidencia?: string | null
          notas?: string | null
          origen?: string
          salida?: string | null
        }
        Update: {
          created_at?: string
          empleado_id?: string
          entrada?: string | null
          fecha?: string
          horas_extra?: number | null
          id?: string
          incidencia?: string | null
          notas?: string | null
          origen?: string
          salida?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asistencia_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
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
      auditoria_accesos: {
        Row: {
          created_at: string
          id: string
          modificable: boolean
          modo: string
          perfil: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          modificable?: boolean
          modo?: string
          perfil: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          modificable?: boolean
          modo?: string
          perfil?: string
          updated_at?: string
        }
        Relationships: []
      }
      bancos: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
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
      catalogo_cuentas: {
        Row: {
          activo: boolean
          afectable: boolean
          codigo: string
          codigo_agrupador_sat: string | null
          created_at: string
          cuenta_padre_id: string | null
          id: string
          naturaleza: string
          nivel: number
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          afectable?: boolean
          codigo: string
          codigo_agrupador_sat?: string | null
          created_at?: string
          cuenta_padre_id?: string | null
          id?: string
          naturaleza: string
          nivel?: number
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          afectable?: boolean
          codigo?: string
          codigo_agrupador_sat?: string | null
          created_at?: string
          cuenta_padre_id?: string | null
          id?: string
          naturaleza?: string
          nivel?: number
          nombre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_cuentas_cuenta_padre_id_fkey"
            columns: ["cuenta_padre_id"]
            isOneToOne: false
            referencedRelation: "catalogo_cuentas"
            referencedColumns: ["id"]
          },
        ]
      }
      cfdi_emitidos: {
        Row: {
          created_at: string
          created_by: string | null
          es_demo: boolean
          estado: string
          facturapi_id: string | null
          folio: number | null
          id: string
          pac_response: Json | null
          pdf_storage_path: string | null
          pdf_url: string | null
          pedido_id: string | null
          relacionado_uuid: string | null
          rfc_receptor: string | null
          serie: string | null
          sucursal_id: string
          timbrado_at: string | null
          tipo_comprobante: string
          tipo_relacion: string | null
          total: number
          uuid_sat: string | null
          venta_id: string | null
          xml_storage_path: string | null
          xml_url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          es_demo?: boolean
          estado?: string
          facturapi_id?: string | null
          folio?: number | null
          id?: string
          pac_response?: Json | null
          pdf_storage_path?: string | null
          pdf_url?: string | null
          pedido_id?: string | null
          relacionado_uuid?: string | null
          rfc_receptor?: string | null
          serie?: string | null
          sucursal_id: string
          timbrado_at?: string | null
          tipo_comprobante?: string
          tipo_relacion?: string | null
          total?: number
          uuid_sat?: string | null
          venta_id?: string | null
          xml_storage_path?: string | null
          xml_url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          es_demo?: boolean
          estado?: string
          facturapi_id?: string | null
          folio?: number | null
          id?: string
          pac_response?: Json | null
          pdf_storage_path?: string | null
          pdf_url?: string | null
          pedido_id?: string | null
          relacionado_uuid?: string | null
          rfc_receptor?: string | null
          serie?: string | null
          sucursal_id?: string
          timbrado_at?: string | null
          tipo_comprobante?: string
          tipo_relacion?: string | null
          total?: number
          uuid_sat?: string | null
          venta_id?: string | null
          xml_storage_path?: string | null
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
      comisiones: {
        Row: {
          base_calculo: number
          created_at: string
          empleado_id: string
          grava: boolean
          id: string
          monto: number
          notas: string | null
          periodo_fin: string
          periodo_inicio: string
          porcentaje: number
        }
        Insert: {
          base_calculo?: number
          created_at?: string
          empleado_id: string
          grava?: boolean
          id?: string
          monto?: number
          notas?: string | null
          periodo_fin: string
          periodo_inicio: string
          porcentaje?: number
        }
        Update: {
          base_calculo?: number
          created_at?: string
          empleado_id?: string
          grava?: boolean
          id?: string
          monto?: number
          notas?: string | null
          periodo_fin?: string
          periodo_inicio?: string
          porcentaje?: number
        }
        Relationships: [
          {
            foreignKeyName: "comisiones_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
        ]
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
          cfdi_proveedor_uuid: string | null
          comprobante_pago_url: string | null
          creado_por: string | null
          created_at: string | null
          dias_credito: number | null
          estado: string
          fecha_factura: string | null
          fecha_pago_limite: string | null
          fecha_pago_real: string | null
          fecha_programada: string | null
          folio_factura: string | null
          id: string
          impuestos: number
          metodo_pago: string | null
          notas: string | null
          notas_pago: string | null
          numero_compra: string
          pagada: boolean
          prioridad: string | null
          proveedor_id: string
          rfc_emisor: string | null
          subtotal: number
          sucursal_id: string
          total: number
          updated_at: string | null
          uuid_cfdi: string | null
          xml_url: string | null
        }
        Insert: {
          almacen_id?: string | null
          cfdi_proveedor_uuid?: string | null
          comprobante_pago_url?: string | null
          creado_por?: string | null
          created_at?: string | null
          dias_credito?: number | null
          estado?: string
          fecha_factura?: string | null
          fecha_pago_limite?: string | null
          fecha_pago_real?: string | null
          fecha_programada?: string | null
          folio_factura?: string | null
          id?: string
          impuestos?: number
          metodo_pago?: string | null
          notas?: string | null
          notas_pago?: string | null
          numero_compra: string
          pagada?: boolean
          prioridad?: string | null
          proveedor_id: string
          rfc_emisor?: string | null
          subtotal?: number
          sucursal_id: string
          total?: number
          updated_at?: string | null
          uuid_cfdi?: string | null
          xml_url?: string | null
        }
        Update: {
          almacen_id?: string | null
          cfdi_proveedor_uuid?: string | null
          comprobante_pago_url?: string | null
          creado_por?: string | null
          created_at?: string | null
          dias_credito?: number | null
          estado?: string
          fecha_factura?: string | null
          fecha_pago_limite?: string | null
          fecha_pago_real?: string | null
          fecha_programada?: string | null
          folio_factura?: string | null
          id?: string
          impuestos?: number
          metodo_pago?: string | null
          notas?: string | null
          notas_pago?: string | null
          numero_compra?: string
          pagada?: boolean
          prioridad?: string | null
          proveedor_id?: string
          rfc_emisor?: string | null
          subtotal?: number
          sucursal_id?: string
          total?: number
          updated_at?: string | null
          uuid_cfdi?: string | null
          xml_url?: string | null
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
            foreignKeyName: "compras_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "vista_fill_rate_proveedores"
            referencedColumns: ["proveedor_id"]
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
      conceptos_nomina: {
        Row: {
          activo: boolean
          clave: string
          codigo_sat: string | null
          created_at: string
          descripcion: string
          es_base: boolean
          formula: string | null
          grava_imss: boolean
          grava_isr: boolean
          id: string
          tipo: string
        }
        Insert: {
          activo?: boolean
          clave: string
          codigo_sat?: string | null
          created_at?: string
          descripcion: string
          es_base?: boolean
          formula?: string | null
          grava_imss?: boolean
          grava_isr?: boolean
          id?: string
          tipo: string
        }
        Update: {
          activo?: boolean
          clave?: string
          codigo_sat?: string | null
          created_at?: string
          descripcion?: string
          es_base?: boolean
          formula?: string | null
          grava_imss?: boolean
          grava_isr?: boolean
          id?: string
          tipo?: string
        }
        Relationships: []
      }
      conciliacion_bancaria: {
        Row: {
          bolsa_id: string | null
          conciliado_at: string | null
          conciliado_por: string | null
          created_at: string | null
          documento_id: string | null
          documento_tipo: string | null
          estado: string
          fecha_estado_cuenta: string | null
          id: string
          monto: number
          movimiento_id: string | null
          notas: string | null
          referencia: string | null
        }
        Insert: {
          bolsa_id?: string | null
          conciliado_at?: string | null
          conciliado_por?: string | null
          created_at?: string | null
          documento_id?: string | null
          documento_tipo?: string | null
          estado?: string
          fecha_estado_cuenta?: string | null
          id?: string
          monto: number
          movimiento_id?: string | null
          notas?: string | null
          referencia?: string | null
        }
        Update: {
          bolsa_id?: string | null
          conciliado_at?: string | null
          conciliado_por?: string | null
          created_at?: string | null
          documento_id?: string | null
          documento_tipo?: string | null
          estado?: string
          fecha_estado_cuenta?: string | null
          id?: string
          monto?: number
          movimiento_id?: string | null
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
          {
            foreignKeyName: "conciliacion_bancaria_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos_bancarios"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_alertas: {
        Row: {
          activo: boolean
          clave: string
          created_at: string
          descripcion: string | null
          id: string
          updated_at: string
          valor_numero: number | null
          valor_texto: string | null
          vigencia_desde: string
        }
        Insert: {
          activo?: boolean
          clave: string
          created_at?: string
          descripcion?: string | null
          id?: string
          updated_at?: string
          valor_numero?: number | null
          valor_texto?: string | null
          vigencia_desde?: string
        }
        Update: {
          activo?: boolean
          clave?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          updated_at?: string
          valor_numero?: number | null
          valor_texto?: string | null
          vigencia_desde?: string
        }
        Relationships: []
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
      contabilidad_parametros: {
        Row: {
          consolidacion_activa: boolean
          fecha_corte_automatico: string
          fecha_inicio_contable: string
          id: number
          modo_prorrateo_cedis: string
          prorrateo_cedis_pct: number
          sucursales_contables: number
          sucursales_fiscales: number
          updated_at: string
        }
        Insert: {
          consolidacion_activa?: boolean
          fecha_corte_automatico?: string
          fecha_inicio_contable?: string
          id?: number
          modo_prorrateo_cedis?: string
          prorrateo_cedis_pct?: number
          sucursales_contables?: number
          sucursales_fiscales?: number
          updated_at?: string
        }
        Update: {
          consolidacion_activa?: boolean
          fecha_corte_automatico?: string
          fecha_inicio_contable?: string
          id?: number
          modo_prorrateo_cedis?: string
          prorrateo_cedis_pct?: number
          sucursales_contables?: number
          sucursales_fiscales?: number
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
      cotizaciones_carrito: {
        Row: {
          agregado_at: string | null
          cantidad: number
          id: string
          notas: string | null
          precio_unitario: number
          producto_id: string
          proveedor_id: string
          usuario_id: string
        }
        Insert: {
          agregado_at?: string | null
          cantidad: number
          id?: string
          notas?: string | null
          precio_unitario: number
          producto_id: string
          proveedor_id: string
          usuario_id: string
        }
        Update: {
          agregado_at?: string | null
          cantidad?: number
          id?: string
          notas?: string | null
          precio_unitario?: number
          producto_id?: string
          proveedor_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cotizaciones_carrito_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizaciones_carrito_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizaciones_carrito_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "vista_fill_rate_proveedores"
            referencedColumns: ["proveedor_id"]
          },
        ]
      }
      cotizador_config: {
        Row: {
          activo: boolean | null
          id: string
          modificado_por: string | null
          monto_aprobacion_oc: number
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          id?: string
          modificado_por?: string | null
          monto_aprobacion_oc?: number
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          id?: string
          modificado_por?: string | null
          monto_aprobacion_oc?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      cuentas_bancarias: {
        Row: {
          activo: boolean
          alias: string
          banco_id: string
          clabe: string | null
          created_at: string
          cuenta_contable_id: string | null
          id: string
          moneda: string
          no_cuenta: string | null
          notas: string | null
          parent_id: string | null
          saldo_inicial: number
          sucursal_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          alias: string
          banco_id: string
          clabe?: string | null
          created_at?: string
          cuenta_contable_id?: string | null
          id?: string
          moneda?: string
          no_cuenta?: string | null
          notas?: string | null
          parent_id?: string | null
          saldo_inicial?: number
          sucursal_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          alias?: string
          banco_id?: string
          clabe?: string | null
          created_at?: string
          cuenta_contable_id?: string | null
          id?: string
          moneda?: string
          no_cuenta?: string | null
          notas?: string | null
          parent_id?: string | null
          saldo_inicial?: number
          sucursal_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_bancarias_banco_id_fkey"
            columns: ["banco_id"]
            isOneToOne: false
            referencedRelation: "bancos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_bancarias_cuenta_contable_id_fkey"
            columns: ["cuenta_contable_id"]
            isOneToOne: false
            referencedRelation: "catalogo_cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_bancarias_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_bancarias_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      cuentas_por_pagar: {
        Row: {
          compra_id: string | null
          created_at: string
          estado: string
          fecha_emision: string
          fecha_vencimiento: string
          id: string
          monto: number
          monto_pagado: number
          notas: string | null
          proveedor_id: string
          updated_at: string
        }
        Insert: {
          compra_id?: string | null
          created_at?: string
          estado?: string
          fecha_emision?: string
          fecha_vencimiento: string
          id?: string
          monto: number
          monto_pagado?: number
          notas?: string | null
          proveedor_id: string
          updated_at?: string
        }
        Update: {
          compra_id?: string | null
          created_at?: string
          estado?: string
          fecha_emision?: string
          fecha_vencimiento?: string
          id?: string
          monto?: number
          monto_pagado?: number
          notas?: string | null
          proveedor_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_por_pagar_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_por_pagar_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_por_pagar_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "vista_fill_rate_proveedores"
            referencedColumns: ["proveedor_id"]
          },
        ]
      }
      declaraciones: {
        Row: {
          a_cargo_o_favor: number
          base: number
          causado: number
          created_at: string
          created_by: string | null
          detalle: Json | null
          estatus: string
          id: string
          impuesto: string
          pagado_previo: number
          periodo_anio: number
          periodo_mes: number | null
          presentada_at: string | null
          retenido: number
          tipo: string
          updated_at: string
        }
        Insert: {
          a_cargo_o_favor?: number
          base?: number
          causado?: number
          created_at?: string
          created_by?: string | null
          detalle?: Json | null
          estatus?: string
          id?: string
          impuesto: string
          pagado_previo?: number
          periodo_anio: number
          periodo_mes?: number | null
          presentada_at?: string | null
          retenido?: number
          tipo: string
          updated_at?: string
        }
        Update: {
          a_cargo_o_favor?: number
          base?: number
          causado?: number
          created_at?: string
          created_by?: string | null
          detalle?: Json | null
          estatus?: string
          id?: string
          impuesto?: string
          pagado_previo?: number
          periodo_anio?: number
          periodo_mes?: number | null
          presentada_at?: string | null
          retenido?: number
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      devolucion_proveedor_lineas: {
        Row: {
          cantidad: number
          costo_unitario: number
          created_at: string | null
          devolucion_id: string
          id: string
          importe: number
          lote_id: string
          producto_id: string
        }
        Insert: {
          cantidad: number
          costo_unitario?: number
          created_at?: string | null
          devolucion_id: string
          id?: string
          importe?: number
          lote_id: string
          producto_id: string
        }
        Update: {
          cantidad?: number
          costo_unitario?: number
          created_at?: string | null
          devolucion_id?: string
          id?: string
          importe?: number
          lote_id?: string
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devolucion_proveedor_lineas_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "devoluciones_proveedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_proveedor_lineas_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_proveedor_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      devoluciones_proveedor: {
        Row: {
          almacen_id: string
          created_at: string | null
          created_by: string | null
          estado: string
          fecha: string
          id: string
          motivo: string
          notas: string | null
          numero_devolucion: string | null
          proveedor_id: string
          sucursal_id: string
          total: number
          updated_at: string | null
        }
        Insert: {
          almacen_id: string
          created_at?: string | null
          created_by?: string | null
          estado?: string
          fecha?: string
          id?: string
          motivo: string
          notas?: string | null
          numero_devolucion?: string | null
          proveedor_id: string
          sucursal_id: string
          total?: number
          updated_at?: string | null
        }
        Update: {
          almacen_id?: string
          created_at?: string | null
          created_by?: string | null
          estado?: string
          fecha?: string
          id?: string
          motivo?: string
          notas?: string | null
          numero_devolucion?: string | null
          proveedor_id?: string
          sucursal_id?: string
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devoluciones_proveedor_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "vista_fill_rate_proveedores"
            referencedColumns: ["proveedor_id"]
          },
          {
            foreignKeyName: "devoluciones_proveedor_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      empleados: {
        Row: {
          activo: boolean
          banco: string | null
          clabe: string | null
          clave_sistema: string | null
          created_at: string
          curp: string | null
          departamento: string | null
          email: string | null
          entidad_federativa: string | null
          fecha_alta: string | null
          fecha_baja: string | null
          id: string
          nombre: string
          nss: string | null
          numero_cuenta: string | null
          numero_empleado: string | null
          periodicidad_pago: string | null
          puesto: string | null
          regimen: string | null
          registro_patronal: string | null
          rfc: string | null
          riesgo_puesto: number | null
          salario_diario: number
          sbc: number
          sucursal_id: string | null
          tipo_contrato: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          banco?: string | null
          clabe?: string | null
          clave_sistema?: string | null
          created_at?: string
          curp?: string | null
          departamento?: string | null
          email?: string | null
          entidad_federativa?: string | null
          fecha_alta?: string | null
          fecha_baja?: string | null
          id?: string
          nombre: string
          nss?: string | null
          numero_cuenta?: string | null
          numero_empleado?: string | null
          periodicidad_pago?: string | null
          puesto?: string | null
          regimen?: string | null
          registro_patronal?: string | null
          rfc?: string | null
          riesgo_puesto?: number | null
          salario_diario?: number
          sbc?: number
          sucursal_id?: string | null
          tipo_contrato?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          banco?: string | null
          clabe?: string | null
          clave_sistema?: string | null
          created_at?: string
          curp?: string | null
          departamento?: string | null
          email?: string | null
          entidad_federativa?: string | null
          fecha_alta?: string | null
          fecha_baja?: string | null
          id?: string
          nombre?: string
          nss?: string | null
          numero_cuenta?: string | null
          numero_empleado?: string | null
          periodicidad_pago?: string | null
          puesto?: string | null
          regimen?: string | null
          registro_patronal?: string | null
          rfc?: string | null
          riesgo_puesto?: number | null
          salario_diario?: number
          sbc?: number
          sucursal_id?: string | null
          tipo_contrato?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "empleados_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      historicos_referencia: {
        Row: {
          categoria: string
          created_at: string
          descripcion: string | null
          id: string
          metadata: Json | null
          nombre_archivo: string
          periodo: string
          updated_at: string
        }
        Insert: {
          categoria: string
          created_at?: string
          descripcion?: string | null
          id?: string
          metadata?: Json | null
          nombre_archivo: string
          periodo: string
          updated_at?: string
        }
        Update: {
          categoria?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          metadata?: Json | null
          nombre_archivo?: string
          periodo?: string
          updated_at?: string
        }
        Relationships: []
      }
      impuestos_parametros: {
        Row: {
          anio_vigente: number
          coeficiente_utilidad: number
          id: number
          ieps_activo: boolean
          isn_entidad: string
          isn_tasa_pct: number
          isn_vigencia_desde: string
          periodicidad_nomina: string
          retencion_isr_pct: number
          retencion_iva_pct: number
          salario_minimo_diario: number
          uma_diaria: number
          updated_at: string
        }
        Insert: {
          anio_vigente?: number
          coeficiente_utilidad?: number
          id?: number
          ieps_activo?: boolean
          isn_entidad?: string
          isn_tasa_pct?: number
          isn_vigencia_desde?: string
          periodicidad_nomina?: string
          retencion_isr_pct?: number
          retencion_iva_pct?: number
          salario_minimo_diario?: number
          uma_diaria?: number
          updated_at?: string
        }
        Update: {
          anio_vigente?: number
          coeficiente_utilidad?: number
          id?: number
          ieps_activo?: boolean
          isn_entidad?: string
          isn_tasa_pct?: number
          isn_vigencia_desde?: string
          periodicidad_nomina?: string
          retencion_isr_pct?: number
          retencion_iva_pct?: number
          salario_minimo_diario?: number
          uma_diaria?: number
          updated_at?: string
        }
        Relationships: []
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
      lista_precio_cargas: {
        Row: {
          archivo_nombre: string
          cargado_por: string | null
          created_at: string
          fecha_vigencia_desde: string
          fecha_vigencia_hasta: string | null
          id: string
          iva_tasa_default: number
          precio_incluye_iva: boolean
          productos_actualizados: number
          productos_autocreados: number
          productos_cargados: number
          productos_omitidos: number
          proveedor_id: string
          reemplaza_carga_anterior: boolean
        }
        Insert: {
          archivo_nombre: string
          cargado_por?: string | null
          created_at?: string
          fecha_vigencia_desde: string
          fecha_vigencia_hasta?: string | null
          id?: string
          iva_tasa_default?: number
          precio_incluye_iva?: boolean
          productos_actualizados?: number
          productos_autocreados?: number
          productos_cargados?: number
          productos_omitidos?: number
          proveedor_id: string
          reemplaza_carga_anterior?: boolean
        }
        Update: {
          archivo_nombre?: string
          cargado_por?: string | null
          created_at?: string
          fecha_vigencia_desde?: string
          fecha_vigencia_hasta?: string | null
          id?: string
          iva_tasa_default?: number
          precio_incluye_iva?: boolean
          productos_actualizados?: number
          productos_autocreados?: number
          productos_cargados?: number
          productos_omitidos?: number
          proveedor_id?: string
          reemplaza_carga_anterior?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "lista_precio_cargas_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_precio_cargas_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "vista_fill_rate_proveedores"
            referencedColumns: ["proveedor_id"]
          },
        ]
      }
      lista_precio_proveedor: {
        Row: {
          activo: boolean
          cantidad_min: number
          carga_id: string | null
          created_at: string
          existencia_proveedor: number | null
          fecha_vigencia_desde: string
          fecha_vigencia_hasta: string | null
          id: string
          observaciones: string | null
          precio: number
          precio_con_iva: number | null
          producto_id: string
          proveedor_id: string
        }
        Insert: {
          activo?: boolean
          cantidad_min?: number
          carga_id?: string | null
          created_at?: string
          existencia_proveedor?: number | null
          fecha_vigencia_desde: string
          fecha_vigencia_hasta?: string | null
          id?: string
          observaciones?: string | null
          precio: number
          precio_con_iva?: number | null
          producto_id: string
          proveedor_id: string
        }
        Update: {
          activo?: boolean
          cantidad_min?: number
          carga_id?: string | null
          created_at?: string
          existencia_proveedor?: number | null
          fecha_vigencia_desde?: string
          fecha_vigencia_hasta?: string | null
          id?: string
          observaciones?: string | null
          precio?: number
          precio_con_iva?: number | null
          producto_id?: string
          proveedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lista_precio_proveedor_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "lista_precio_cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_precio_proveedor_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_precio_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_precio_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "vista_fill_rate_proveedores"
            referencedColumns: ["proveedor_id"]
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
          {
            foreignKeyName: "lotes_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "vista_fill_rate_proveedores"
            referencedColumns: ["proveedor_id"]
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
      movimientos_bancarios: {
        Row: {
          abono: number
          cargo: number
          cliente_sugerido_id: string | null
          concepto: string | null
          conciliado: boolean
          contraparte_clabe: string | null
          contraparte_nombre: string | null
          created_at: string
          cuenta_id: string
          fecha: string
          id: string
          notas: string | null
          origen: string
          proveedor_sugerido_id: string | null
          referencia: string | null
          saldo: number | null
          updated_at: string
        }
        Insert: {
          abono?: number
          cargo?: number
          cliente_sugerido_id?: string | null
          concepto?: string | null
          conciliado?: boolean
          contraparte_clabe?: string | null
          contraparte_nombre?: string | null
          created_at?: string
          cuenta_id: string
          fecha: string
          id?: string
          notas?: string | null
          origen?: string
          proveedor_sugerido_id?: string | null
          referencia?: string | null
          saldo?: number | null
          updated_at?: string
        }
        Update: {
          abono?: number
          cargo?: number
          cliente_sugerido_id?: string | null
          concepto?: string | null
          conciliado?: boolean
          contraparte_clabe?: string | null
          contraparte_nombre?: string | null
          created_at?: string
          cuenta_id?: string
          fecha?: string
          id?: string
          notas?: string | null
          origen?: string
          proveedor_sugerido_id?: string | null
          referencia?: string | null
          saldo?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_bancarios_cliente_sugerido_id_fkey"
            columns: ["cliente_sugerido_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_bancarios_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_bancarios_proveedor_sugerido_id_fkey"
            columns: ["proveedor_sugerido_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_bancarios_proveedor_sugerido_id_fkey"
            columns: ["proveedor_sugerido_id"]
            isOneToOne: false
            referencedRelation: "vista_fill_rate_proveedores"
            referencedColumns: ["proveedor_id"]
          },
        ]
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
      ofertas_proveedor: {
        Row: {
          activo: boolean
          cantidad_minima: number | null
          created_at: string
          descuento_pct: number | null
          fecha_fin: string
          fecha_inicio: string
          id: string
          notas: string | null
          precio_oferta: number
          producto_id: string
          proveedor_id: string
        }
        Insert: {
          activo?: boolean
          cantidad_minima?: number | null
          created_at?: string
          descuento_pct?: number | null
          fecha_fin: string
          fecha_inicio: string
          id?: string
          notas?: string | null
          precio_oferta: number
          producto_id: string
          proveedor_id: string
        }
        Update: {
          activo?: boolean
          cantidad_minima?: number | null
          created_at?: string
          descuento_pct?: number | null
          fecha_fin?: string
          fecha_inicio?: string
          id?: string
          notas?: string | null
          precio_oferta?: number
          producto_id?: string
          proveedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ofertas_proveedor_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofertas_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofertas_proveedor_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "vista_fill_rate_proveedores"
            referencedColumns: ["proveedor_id"]
          },
        ]
      }
      orden_compra_lineas: {
        Row: {
          cantidad_recibida: number
          cantidad_solicitada: number
          created_at: string | null
          id: string
          notas_linea: string | null
          orden_id: string
          precio_con_iva: number | null
          precio_unitario: number
          producto_id: string
          subtotal: number | null
        }
        Insert: {
          cantidad_recibida?: number
          cantidad_solicitada: number
          created_at?: string | null
          id?: string
          notas_linea?: string | null
          orden_id: string
          precio_con_iva?: number | null
          precio_unitario: number
          producto_id: string
          subtotal?: number | null
        }
        Update: {
          cantidad_recibida?: number
          cantidad_solicitada?: number
          created_at?: string | null
          id?: string
          notas_linea?: string | null
          orden_id?: string
          precio_con_iva?: number | null
          precio_unitario?: number
          producto_id?: string
          subtotal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orden_compra_lineas_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_compra_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_compra: {
        Row: {
          aprobada_por: string | null
          creada_por: string | null
          created_at: string | null
          enviada_por: string | null
          estado: string
          fecha_aprobacion: string | null
          fecha_creacion: string | null
          fecha_envio: string | null
          fecha_recepcion_esperada: string | null
          fecha_recepcion_real: string | null
          folio: string
          id: string
          iva: number
          notas: string | null
          proveedor_id: string
          razon_aprobacion: string | null
          recibida_por: string | null
          subtotal: number
          sucursal_destino_id: string | null
          total: number
          updated_at: string | null
        }
        Insert: {
          aprobada_por?: string | null
          creada_por?: string | null
          created_at?: string | null
          enviada_por?: string | null
          estado?: string
          fecha_aprobacion?: string | null
          fecha_creacion?: string | null
          fecha_envio?: string | null
          fecha_recepcion_esperada?: string | null
          fecha_recepcion_real?: string | null
          folio?: string
          id?: string
          iva?: number
          notas?: string | null
          proveedor_id: string
          razon_aprobacion?: string | null
          recibida_por?: string | null
          subtotal?: number
          sucursal_destino_id?: string | null
          total?: number
          updated_at?: string | null
        }
        Update: {
          aprobada_por?: string | null
          creada_por?: string | null
          created_at?: string | null
          enviada_por?: string | null
          estado?: string
          fecha_aprobacion?: string | null
          fecha_creacion?: string | null
          fecha_envio?: string | null
          fecha_recepcion_esperada?: string | null
          fecha_recepcion_real?: string | null
          folio?: string
          id?: string
          iva?: number
          notas?: string | null
          proveedor_id?: string
          razon_aprobacion?: string | null
          recibida_por?: string | null
          subtotal?: number
          sucursal_destino_id?: string | null
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "vista_fill_rate_proveedores"
            referencedColumns: ["proveedor_id"]
          },
          {
            foreignKeyName: "ordenes_compra_sucursal_destino_id_fkey"
            columns: ["sucursal_destino_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_cxp: {
        Row: {
          banco_cuenta_id: string | null
          compra_id: string
          comprobante_url: string | null
          creado_por: string | null
          created_at: string
          fecha: string
          forma_pago: string
          id: string
          monto: number
          notas: string | null
          referencia: string | null
          updated_at: string
        }
        Insert: {
          banco_cuenta_id?: string | null
          compra_id: string
          comprobante_url?: string | null
          creado_por?: string | null
          created_at?: string
          fecha?: string
          forma_pago?: string
          id?: string
          monto: number
          notas?: string | null
          referencia?: string | null
          updated_at?: string
        }
        Update: {
          banco_cuenta_id?: string | null
          compra_id?: string
          comprobante_url?: string | null
          creado_por?: string | null
          created_at?: string
          fecha?: string
          forma_pago?: string
          id?: string
          monto?: number
          notas?: string | null
          referencia?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_cxp_banco_cuenta_fkey"
            columns: ["banco_cuenta_id"]
            isOneToOne: false
            referencedRelation: "cuentas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_cxp_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_recibidos: {
        Row: {
          created_at: string
          created_by: string | null
          estado: string
          factura_id: string
          fecha_pago: string
          forma_pago: string
          id: string
          moneda: string
          monto: number
          num_parcialidad: number
          rep_cfdi_id: string | null
          rep_facturapi_id: string | null
          rep_uuid_sat: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          estado?: string
          factura_id: string
          fecha_pago?: string
          forma_pago: string
          id?: string
          moneda?: string
          monto: number
          num_parcialidad?: number
          rep_cfdi_id?: string | null
          rep_facturapi_id?: string | null
          rep_uuid_sat?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          estado?: string
          factura_id?: string
          fecha_pago?: string
          forma_pago?: string
          id?: string
          moneda?: string
          monto?: number
          num_parcialidad?: number
          rep_cfdi_id?: string | null
          rep_facturapi_id?: string | null
          rep_uuid_sat?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_recibidos_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "cfdi_emitidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_recibidos_rep_cfdi_id_fkey"
            columns: ["rep_cfdi_id"]
            isOneToOne: false
            referencedRelation: "cfdi_emitidos"
            referencedColumns: ["id"]
          },
        ]
      }
      password_resets_log: {
        Row: {
          created_at: string
          id: string
          notas: string | null
          reset_by: string
          target_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notas?: string | null
          reset_by: string
          target_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notas?: string | null
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
      poliza_movimientos: {
        Row: {
          abono: number
          cargo: number
          concepto: string | null
          created_at: string
          cuenta_id: string
          id: string
          poliza_id: string
        }
        Insert: {
          abono?: number
          cargo?: number
          concepto?: string | null
          created_at?: string
          cuenta_id: string
          id?: string
          poliza_id: string
        }
        Update: {
          abono?: number
          cargo?: number
          concepto?: string | null
          created_at?: string
          cuenta_id?: string
          id?: string
          poliza_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poliza_movimientos_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "catalogo_cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poliza_movimientos_poliza_id_fkey"
            columns: ["poliza_id"]
            isOneToOne: false
            referencedRelation: "polizas"
            referencedColumns: ["id"]
          },
        ]
      }
      polizas: {
        Row: {
          concepto: string | null
          created_at: string
          created_by: string | null
          estatus: string
          fecha: string
          folio: string | null
          id: string
          origen: string
          origen_referencia_id: string | null
          origen_referencia_tipo: string | null
          sucursal_id: string | null
          tipo: string
          total_abono: number
          total_cargo: number
          updated_at: string
        }
        Insert: {
          concepto?: string | null
          created_at?: string
          created_by?: string | null
          estatus?: string
          fecha?: string
          folio?: string | null
          id?: string
          origen?: string
          origen_referencia_id?: string | null
          origen_referencia_tipo?: string | null
          sucursal_id?: string | null
          tipo: string
          total_abono?: number
          total_cargo?: number
          updated_at?: string
        }
        Update: {
          concepto?: string | null
          created_at?: string
          created_by?: string | null
          estatus?: string
          fecha?: string
          folio?: string | null
          id?: string
          origen?: string
          origen_referencia_id?: string | null
          origen_referencia_tipo?: string | null
          sucursal_id?: string | null
          tipo?: string
          total_abono?: number
          total_cargo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "polizas_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuesto_ventas: {
        Row: {
          anio: number
          created_at: string
          created_by: string | null
          dia: number | null
          id: string
          margen_presupuestado: number | null
          mes: number
          notas: string | null
          sucursal_id: string
          updated_at: string
          utilidad_presupuestada: number | null
          venta_presupuestada: number
        }
        Insert: {
          anio: number
          created_at?: string
          created_by?: string | null
          dia?: number | null
          id?: string
          margen_presupuestado?: number | null
          mes: number
          notas?: string | null
          sucursal_id: string
          updated_at?: string
          utilidad_presupuestada?: number | null
          venta_presupuestada?: number
        }
        Update: {
          anio?: number
          created_at?: string
          created_by?: string | null
          dia?: number | null
          id?: string
          margen_presupuestado?: number | null
          mes?: number
          notas?: string | null
          sucursal_id?: string
          updated_at?: string
          utilidad_presupuestada?: number | null
          venta_presupuestada?: number
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_ventas_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      primas_riesgo_patronal: {
        Row: {
          activo: boolean
          clase_rt: number | null
          created_at: string
          id: string
          notas: string | null
          prima_rt: number
          registro_patronal: string
          updated_at: string
          vigencia_desde: string
          vigencia_hasta: string | null
        }
        Insert: {
          activo?: boolean
          clase_rt?: number | null
          created_at?: string
          id?: string
          notas?: string | null
          prima_rt: number
          registro_patronal: string
          updated_at?: string
          vigencia_desde?: string
          vigencia_hasta?: string | null
        }
        Update: {
          activo?: boolean
          clase_rt?: number | null
          created_at?: string
          id?: string
          notas?: string | null
          prima_rt?: number
          registro_patronal?: string
          updated_at?: string
          vigencia_desde?: string
          vigencia_hasta?: string | null
        }
        Relationships: []
      }
      producto_corrugado: {
        Row: {
          created_at: string
          id: string
          notas: string | null
          piezas_por_caja_master: number | null
          piezas_por_corrugado: number
          producto_id: string
          proveedor_id: string | null
          unidad_minima_compra: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notas?: string | null
          piezas_por_caja_master?: number | null
          piezas_por_corrugado: number
          producto_id: string
          proveedor_id?: string | null
          unidad_minima_compra?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notas?: string | null
          piezas_por_caja_master?: number | null
          piezas_por_corrugado?: number
          producto_id?: string
          proveedor_id?: string | null
          unidad_minima_compra?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_corrugado_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_corrugado_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_corrugado_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "vista_fill_rate_proveedores"
            referencedColumns: ["proveedor_id"]
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
      producto_sucursal_estatus: {
        Row: {
          created_at: string
          estatus: string
          fecha_cambio: string
          id: string
          motivo: string | null
          producto_id: string
          sucursal_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          estatus: string
          fecha_cambio?: string
          id?: string
          motivo?: string | null
          producto_id: string
          sucursal_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          estatus?: string
          fecha_cambio?: string
          id?: string
          motivo?: string | null
          producto_id?: string
          sucursal_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_sucursal_estatus_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_sucursal_estatus_sucursal_id_fkey"
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
          clasificacion: string | null
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
          clasificacion?: string | null
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
          clasificacion?: string | null
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
        Relationships: [
          {
            foreignKeyName: "fk_productos_estatus"
            columns: ["estatus"]
            isOneToOne: false
            referencedRelation: "productos_status"
            referencedColumns: ["codigo"]
          },
        ]
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
          acepta_devoluciones: boolean | null
          activo: boolean | null
          aviso_funcionamiento_url: string | null
          banco: string | null
          codigo: string | null
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
          monto_minimo_pedido: number | null
          nombre: string
          notas: string | null
          notas_credito: boolean | null
          pago_contra_entrega: boolean | null
          plazo_pago_dias: number
          razon_social: string | null
          rfc: string | null
          telefono: string | null
          updated_at: string | null
        }
        Insert: {
          acepta_devoluciones?: boolean | null
          activo?: boolean | null
          aviso_funcionamiento_url?: string | null
          banco?: string | null
          codigo?: string | null
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
          monto_minimo_pedido?: number | null
          nombre: string
          notas?: string | null
          notas_credito?: boolean | null
          pago_contra_entrega?: boolean | null
          plazo_pago_dias?: number
          razon_social?: string | null
          rfc?: string | null
          telefono?: string | null
          updated_at?: string | null
        }
        Update: {
          acepta_devoluciones?: boolean | null
          activo?: boolean | null
          aviso_funcionamiento_url?: string | null
          banco?: string | null
          codigo?: string | null
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
          monto_minimo_pedido?: number | null
          nombre?: string
          notas?: string | null
          notas_credito?: boolean | null
          pago_contra_entrega?: boolean | null
          plazo_pago_dias?: number
          razon_social?: string | null
          rfc?: string | null
          telefono?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      recibo_conceptos: {
        Row: {
          clave: string
          concepto_id: string | null
          descripcion: string
          id: string
          importe_exento: number
          importe_gravado: number
          importe_total: number
          recibo_id: string
          tipo: string
        }
        Insert: {
          clave: string
          concepto_id?: string | null
          descripcion: string
          id?: string
          importe_exento?: number
          importe_gravado?: number
          importe_total?: number
          recibo_id: string
          tipo: string
        }
        Update: {
          clave?: string
          concepto_id?: string | null
          descripcion?: string
          id?: string
          importe_exento?: number
          importe_gravado?: number
          importe_total?: number
          recibo_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "recibo_conceptos_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "conceptos_nomina"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recibo_conceptos_recibo_id_fkey"
            columns: ["recibo_id"]
            isOneToOne: false
            referencedRelation: "recibos_nomina"
            referencedColumns: ["id"]
          },
        ]
      }
      recibos_nomina: {
        Row: {
          cfdi_id: string | null
          created_at: string
          dias_pagados: number
          empleado_id: string
          es_prueba: boolean
          estatus: string
          folio: string | null
          id: string
          neto_pagado: number
          pdf_storage_path: string | null
          periodo_fin: string
          periodo_inicio: string
          total_deducciones: number
          total_otros_pagos: number
          total_percepciones: number
          updated_at: string
          xml_storage_path: string | null
        }
        Insert: {
          cfdi_id?: string | null
          created_at?: string
          dias_pagados?: number
          empleado_id: string
          es_prueba?: boolean
          estatus?: string
          folio?: string | null
          id?: string
          neto_pagado?: number
          pdf_storage_path?: string | null
          periodo_fin: string
          periodo_inicio: string
          total_deducciones?: number
          total_otros_pagos?: number
          total_percepciones?: number
          updated_at?: string
          xml_storage_path?: string | null
        }
        Update: {
          cfdi_id?: string | null
          created_at?: string
          dias_pagados?: number
          empleado_id?: string
          es_prueba?: boolean
          estatus?: string
          folio?: string | null
          id?: string
          neto_pagado?: number
          pdf_storage_path?: string | null
          periodo_fin?: string
          periodo_inicio?: string
          total_deducciones?: number
          total_otros_pagos?: number
          total_percepciones?: number
          updated_at?: string
          xml_storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recibos_nomina_cfdi_id_fkey"
            columns: ["cfdi_id"]
            isOneToOne: false
            referencedRelation: "cfdi_emitidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recibos_nomina_empleado_id_fkey"
            columns: ["empleado_id"]
            isOneToOne: false
            referencedRelation: "empleados"
            referencedColumns: ["id"]
          },
        ]
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
      reglas_contabilizacion: {
        Row: {
          activo: boolean
          created_at: string
          cuenta_abono_id: string | null
          cuenta_cargo_id: string | null
          descripcion: string | null
          id: string
          origen: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          cuenta_abono_id?: string | null
          cuenta_cargo_id?: string | null
          descripcion?: string | null
          id?: string
          origen: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          cuenta_abono_id?: string | null
          cuenta_cargo_id?: string | null
          descripcion?: string | null
          id?: string
          origen?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reglas_contabilizacion_cuenta_abono_id_fkey"
            columns: ["cuenta_abono_id"]
            isOneToOne: false
            referencedRelation: "catalogo_cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reglas_contabilizacion_cuenta_cargo_id_fkey"
            columns: ["cuenta_cargo_id"]
            isOneToOne: false
            referencedRelation: "catalogo_cuentas"
            referencedColumns: ["id"]
          },
        ]
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
      saldos_apertura: {
        Row: {
          created_at: string
          cuenta_id: string
          fecha_corte: string
          id: string
          notas: string | null
          origen: string
          saldo_acreedor: number
          saldo_deudor: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          cuenta_id: string
          fecha_corte: string
          id?: string
          notas?: string | null
          origen?: string
          saldo_acreedor?: number
          saldo_deudor?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          cuenta_id?: string
          fecha_corte?: string
          id?: string
          notas?: string | null
          origen?: string
          saldo_acreedor?: number
          saldo_deudor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saldos_apertura_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "catalogo_cuentas"
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
          es_cedis: boolean
          es_fiscal: boolean
          id: string
          nombre: string
          telefono: string | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          codigo: string
          created_at?: string | null
          direccion?: string | null
          es_cedis?: boolean
          es_fiscal?: boolean
          id?: string
          nombre: string
          telefono?: string | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          codigo?: string
          created_at?: string | null
          direccion?: string | null
          es_cedis?: boolean
          es_fiscal?: boolean
          id?: string
          nombre?: string
          telefono?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sugeridos_decisiones: {
        Row: {
          comentario_gerente: string | null
          created_at: string
          decidido_por: string | null
          fecha_decision: string
          id: string
          periodo_referencia: number
          producto_id: string
          pz_solicitadas: number
          sucursal_id: string | null
          sugerido_sistema: number
          updated_at: string
        }
        Insert: {
          comentario_gerente?: string | null
          created_at?: string
          decidido_por?: string | null
          fecha_decision?: string
          id?: string
          periodo_referencia: number
          producto_id: string
          pz_solicitadas?: number
          sucursal_id?: string | null
          sugerido_sistema?: number
          updated_at?: string
        }
        Update: {
          comentario_gerente?: string | null
          created_at?: string
          decidido_por?: string | null
          fecha_decision?: string
          id?: string
          periodo_referencia?: number
          producto_id?: string
          pz_solicitadas?: number
          sucursal_id?: string | null
          sugerido_sistema?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sugeridos_decisiones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sugeridos_decisiones_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      tablas_isr: {
        Row: {
          activo: boolean
          anio: number
          cuota_fija: number
          id: string
          limite_inferior: number
          limite_superior: number | null
          periodicidad: string
          tasa_excedente: number
          tipo: string
        }
        Insert: {
          activo?: boolean
          anio: number
          cuota_fija: number
          id?: string
          limite_inferior: number
          limite_superior?: number | null
          periodicidad: string
          tasa_excedente: number
          tipo?: string
        }
        Update: {
          activo?: boolean
          anio?: number
          cuota_fija?: number
          id?: string
          limite_inferior?: number
          limite_superior?: number | null
          periodicidad?: string
          tasa_excedente?: number
          tipo?: string
        }
        Relationships: []
      }
      traspaso_lineas: {
        Row: {
          cantidad: number
          cantidad_recibida: number | null
          created_at: string | null
          id: string
          lote_id: string
          merma_recepcion: number
          notas_recepcion: string | null
          traspaso_id: string
        }
        Insert: {
          cantidad: number
          cantidad_recibida?: number | null
          created_at?: string | null
          id?: string
          lote_id: string
          merma_recepcion?: number
          notas_recepcion?: string | null
          traspaso_id: string
        }
        Update: {
          cantidad?: number
          cantidad_recibida?: number | null
          created_at?: string | null
          id?: string
          lote_id?: string
          merma_recepcion?: number
          notas_recepcion?: string | null
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
          fecha_envio: string | null
          fecha_recepcion: string | null
          id: string
          motivo_cancelacion: string | null
          notas: string | null
          numero_traspaso: string | null
          recibido_por: string | null
          solicitado_por: string | null
          sucursal_destino_id: string | null
          sucursal_origen_id: string | null
          updated_at: string | null
        }
        Insert: {
          almacen_destino_id: string
          almacen_origen_id: string
          created_at?: string | null
          estado?: string
          fecha_envio?: string | null
          fecha_recepcion?: string | null
          id?: string
          motivo_cancelacion?: string | null
          notas?: string | null
          numero_traspaso?: string | null
          recibido_por?: string | null
          solicitado_por?: string | null
          sucursal_destino_id?: string | null
          sucursal_origen_id?: string | null
          updated_at?: string | null
        }
        Update: {
          almacen_destino_id?: string
          almacen_origen_id?: string
          created_at?: string | null
          estado?: string
          fecha_envio?: string | null
          fecha_recepcion?: string | null
          id?: string
          motivo_cancelacion?: string | null
          notas?: string | null
          numero_traspaso?: string | null
          recibido_por?: string | null
          solicitado_por?: string | null
          sucursal_destino_id?: string | null
          sucursal_origen_id?: string | null
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
          {
            foreignKeyName: "traspasos_sucursal_destino_id_fkey"
            columns: ["sucursal_destino_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traspasos_sucursal_origen_id_fkey"
            columns: ["sucursal_origen_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
        ]
      }
      user_module_access: {
        Row: {
          created_at: string
          id: string
          modulo: string
          nivel_acceso: string
          otorgado_por: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          modulo: string
          nivel_acceso?: string
          otorgado_por?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          modulo?: string
          nivel_acceso?: string
          otorgado_por?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          costo_unitario: number | null
          created_at: string | null
          id: string
          lote_id: string | null
          precio_unitario: number
          producto_id: string
          subtotal: number
          venta_id: string
        }
        Insert: {
          cantidad: number
          costo_unitario?: number | null
          created_at?: string | null
          id?: string
          lote_id?: string | null
          precio_unitario: number
          producto_id: string
          subtotal: number
          venta_id: string
        }
        Update: {
          cantidad?: number
          costo_unitario?: number | null
          created_at?: string | null
          id?: string
          lote_id?: string | null
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
          caja: string | null
          cajero_id: string | null
          cliente_id: string | null
          cliente_nombre_libre: string | null
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
          usuario_libre: string | null
          vendedor_id: string | null
          vendedor_libre: string | null
        }
        Insert: {
          caja?: string | null
          cajero_id?: string | null
          cliente_id?: string | null
          cliente_nombre_libre?: string | null
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
          usuario_libre?: string | null
          vendedor_id?: string | null
          vendedor_libre?: string | null
        }
        Update: {
          caja?: string | null
          cajero_id?: string | null
          cliente_id?: string | null
          cliente_nombre_libre?: string | null
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
          usuario_libre?: string | null
          vendedor_id?: string | null
          vendedor_libre?: string | null
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
      vista_fill_rate_proveedores: {
        Row: {
          fill_rate_pct: number | null
          lead_time_promedio_real: number | null
          proveedor_codigo: string | null
          proveedor_id: string | null
          proveedor_nombre: string | null
          total_lineas: number | null
          total_ocs: number | null
          total_recibido: number | null
          total_solicitado: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      balanza_comprobacion: {
        Args: {
          p_desde?: string
          p_hasta?: string
          p_solo_autorizadas?: boolean
        }
        Returns: {
          abonos: number
          cargos: number
          codigo: string
          cuenta_id: string
          naturaleza: string
          nombre: string
          saldo: number
        }[]
      }
      cancelar_traspaso: {
        Args: { p_motivo: string; p_traspaso_id: string }
        Returns: Json
      }
      clasificacion_abc_productos: {
        Args: { p_dias_ventana?: number }
        Returns: undefined
      }
      enviar_traspaso: {
        Args: {
          p_almacen_destino_id: string
          p_almacen_origen_id: string
          p_lineas: Json
          p_notas?: string
          p_sucursal_destino_id: string
          p_sucursal_origen_id: string
        }
        Returns: Json
      }
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
      generar_folio_compra: { Args: never; Returns: string }
      generar_folio_devolucion: { Args: never; Returns: string }
      generar_folio_oc: { Args: never; Returns: string }
      generar_folio_traspaso: { Args: never; Returns: string }
      has_module_access: {
        Args: { _min_nivel: string; _modulo: string; _user_id: string }
        Returns: boolean
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
        Args: { p_fecha?: string; p_incluir_cedis?: boolean }
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
          sucursal_tipo: string
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
      precio_vigente_proveedor: {
        Args: {
          p_fecha?: string
          p_producto_id: string
          p_proveedor_id: string
        }
        Returns: {
          cantidad_minima_oferta: number
          con_oferta: boolean
          existencia: number
          precio: number
          precio_oferta: number
          vigencia_desde: string
          vigencia_hasta: string
        }[]
      }
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
      productos_pendientes_compra: {
        Args: {
          p_fecha_corte?: string
          p_periodo_referencia?: number
          p_sucursal_codigo?: string
        }
        Returns: {
          cantidad_sugerida: number
          clasificacion: string
          clave: string
          comentario_resumen: string
          ddi_periodo: number
          departamento: string
          descripcion: string
          mejor_existencia: number
          mejor_precio: number
          mejor_proveedor_id: string
          mejor_proveedor_nombre: string
          producto_id: string
          proveedores_disponibles: number
          total_estimado: number
          ventas_periodo: number
        }[]
      }
      recalc_costo_promedio: {
        Args: { _producto_id: string }
        Returns: undefined
      }
      recalc_total_oc: { Args: { p_orden_id: string }; Returns: undefined }
      recibir_oc: {
        Args: { p_almacen_id: string; p_orden_id: string; p_recepciones: Json }
        Returns: Json
      }
      recibir_traspaso: { Args: { p_traspaso_id: string }; Returns: Json }
      recibir_traspaso_confirmado: {
        Args: { p_lineas: Json; p_traspaso_id: string }
        Returns: Json
      }
      recomendar_proveedor: {
        Args: {
          p_cantidad_requerida: number
          p_fecha?: string
          p_producto_id: string
        }
        Returns: {
          acepta_devoluciones: boolean
          cantidad_sugerida: number
          con_oferta: boolean
          dias_credito: number
          existencia_proveedor: number
          lead_time_dias: number
          monto_total: number
          pago_contra_entrega: boolean
          piezas_corrugado: number
          precio_con_iva: number
          precio_unitario: number
          proveedor_codigo: string
          proveedor_id: string
          proveedor_nombre: string
          ranking: number
        }[]
      }
      registrar_compra: {
        Args: {
          p_almacen_id: string
          p_dias_credito?: number
          p_fecha_factura?: string
          p_folio_factura?: string
          p_lineas: Json
          p_metodo_pago?: string
          p_notas?: string
          p_proveedor_id: string
          p_rfc_emisor?: string
          p_sucursal_id: string
          p_uuid_cfdi?: string
          p_xml_url?: string
        }
        Returns: Json
      }
      registrar_devolucion_proveedor: {
        Args: {
          p_almacen_id: string
          p_lineas: Json
          p_motivo: string
          p_notas?: string
          p_proveedor_id: string
          p_sucursal_id: string
        }
        Returns: Json
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
      reporte_cortes_caja: {
        Args: {
          p_fecha_desde: string
          p_fecha_hasta: string
          p_sucursales?: string[]
        }
        Returns: {
          color: string
          diferencia: number
          estado_alerta: string
          fecha: string
          mensaje: string
          observaciones: string
          sucursal_codigo: string
          sucursal_id: string
          sucursal_nombre: string
        }[]
      }
      reporte_dashboard_mensual: {
        Args: { p_anios?: number[]; p_sucursales?: string[] }
        Returns: {
          anio: number
          costo: number
          margen_pct: number
          mes: number
          sucursal_codigo: string
          sucursal_nombre: string
          utilidad: number
          ventas: number
        }[]
      }
      reporte_margenes: {
        Args: { p_fecha?: string; p_incluir_cedis?: boolean }
        Returns: {
          clasificacion: string
          clasificacion_abc: string
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
      reporte_presupuesto_vs_real: {
        Args: { p_anio: number; p_mes?: number; p_sucursales?: string[] }
        Returns: {
          diferencia: number
          estatus: string
          fecha: string
          margen_presupuestado: number
          margen_real: number
          porcentaje_cumplimiento: number
          sucursal_codigo: string
          sucursal_id: string
          sucursal_nombre: string
          utilidad_presupuestada: number
          utilidad_real: number
          venta_presupuestada: number
          venta_real: number
        }[]
      }
      reporte_productividad_pivote: {
        Args: {
          p_anio: number
          p_mes: number
          p_metrica?: string
          p_sucursales?: string[]
        }
        Returns: {
          dia: number
          sucursal_codigo: string
          valor: number
          vendedor: string
        }[]
      }
      reporte_productividad_vendedores: {
        Args: {
          p_fecha_desde: string
          p_fecha_hasta: string
          p_sucursales?: string[]
        }
        Returns: {
          margen_pct: number
          num_tickets: number
          sucursal_codigo: string
          ticket_promedio: number
          utilidad_total: number
          vendedor: string
          venta_total: number
        }[]
      }
      reporte_sugeridos: {
        Args: {
          p_clasificacion?: string
          p_fecha_corte?: string
          p_solo_comprar?: boolean
          p_status?: string
          p_sucursal_codigo?: string
        }
        Returns: {
          clasificacion: string
          clave: string
          comentario_resumen: string
          ddi_120: number
          ddi_14: number
          ddi_30: number
          ddi_60: number
          ddi_7: number
          ddi_90: number
          departamento: string
          descripcion: string
          eval_120: string
          eval_14: string
          eval_30: string
          eval_60: string
          eval_7: string
          eval_90: string
          existencias: number
          max_dias: number
          min_dias: number
          producto_id: string
          status: string
          sugerido_120: number
          sugerido_14: number
          sugerido_30: number
          sugerido_60: number
          sugerido_7: number
          sugerido_90: number
          ventas_120: number
          ventas_14: number
          ventas_30: number
          ventas_60: number
          ventas_7: number
          ventas_90: number
        }[]
      }
      reporte_ventas_inventario_sanamex: {
        Args: {
          p_fecha_corte?: string
          p_incluir_cedis?: boolean
          p_sucursal_id?: string
        }
        Returns: {
          agrupador: string
          categoria: string
          clasif: string
          clasif_abc: string
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
          stock_minimo: number
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
      revertir_carga_lista_precios: {
        Args: { p_carga_id: string }
        Returns: Json
      }
      sugerido_min_max: {
        Args: { p_clasificacion: string }
        Returns: {
          max_dias: number
          min_dias: number
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
      verificar_productos_lista: {
        Args: { p_claves: string[] }
        Returns: {
          clave: string
          descripcion_actual: string
          estatus_actual: string
          existe: boolean
          producto_id: string
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
        | "compras"
        | "contador"
        | "contraloria"
        | "tesoreria"
        | "direccion"
        | "contabilidad"
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
        "compras",
        "contador",
        "contraloria",
        "tesoreria",
        "direccion",
        "contabilidad",
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
