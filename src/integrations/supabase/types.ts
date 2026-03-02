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
      alertas_transferencia: {
        Row: {
          aceptada_at: string | null
          aceptada_por: string | null
          cantidad_aceptada: number | null
          cantidad_enviada: number
          cantidad_merma: number | null
          created_at: string
          estado: string
          hospital_id: string
          id: string
          insumo_catalogo_id: string
          motivo_merma: string | null
          notas: string | null
          notificado: boolean | null
          tirada_id: string | null
          transferencia_id: string
        }
        Insert: {
          aceptada_at?: string | null
          aceptada_por?: string | null
          cantidad_aceptada?: number | null
          cantidad_enviada?: number
          cantidad_merma?: number | null
          created_at?: string
          estado?: string
          hospital_id: string
          id?: string
          insumo_catalogo_id: string
          motivo_merma?: string | null
          notas?: string | null
          notificado?: boolean | null
          tirada_id?: string | null
          transferencia_id: string
        }
        Update: {
          aceptada_at?: string | null
          aceptada_por?: string | null
          cantidad_aceptada?: number | null
          cantidad_enviada?: number
          cantidad_merma?: number | null
          created_at?: string
          estado?: string
          hospital_id?: string
          id?: string
          insumo_catalogo_id?: string
          motivo_merma?: string | null
          notas?: string | null
          notificado?: boolean | null
          tirada_id?: string | null
          transferencia_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_transferencia_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_transferencia_insumo_catalogo_id_fkey"
            columns: ["insumo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_transferencia_transferencia_id_fkey"
            columns: ["transferencia_id"]
            isOneToOne: false
            referencedRelation: "transferencias_central_hospital"
            referencedColumns: ["id"]
          },
        ]
      }
      almacen_central: {
        Row: {
          cantidad_disponible: number
          created_at: string
          fecha_caducidad: string | null
          id: string
          insumo_catalogo_id: string
          lote: string | null
          ubicacion: string | null
          updated_at: string
        }
        Insert: {
          cantidad_disponible?: number
          created_at?: string
          fecha_caducidad?: string | null
          id?: string
          insumo_catalogo_id: string
          lote?: string | null
          ubicacion?: string | null
          updated_at?: string
        }
        Update: {
          cantidad_disponible?: number
          created_at?: string
          fecha_caducidad?: string | null
          id?: string
          insumo_catalogo_id?: string
          lote?: string | null
          ubicacion?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "almacen_central_insumo_catalogo_id_fkey"
            columns: ["insumo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      almacen_provisional_inventario: {
        Row: {
          almacen_provisional_id: string
          cantidad_disponible: number | null
          created_at: string | null
          id: string
          insumo_catalogo_id: string
          updated_at: string | null
        }
        Insert: {
          almacen_provisional_id: string
          cantidad_disponible?: number | null
          created_at?: string | null
          id?: string
          insumo_catalogo_id: string
          updated_at?: string | null
        }
        Update: {
          almacen_provisional_id?: string
          cantidad_disponible?: number | null
          created_at?: string | null
          id?: string
          insumo_catalogo_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "almacen_provisional_inventario_almacen_provisional_id_fkey"
            columns: ["almacen_provisional_id"]
            isOneToOne: false
            referencedRelation: "almacenes_provisionales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "almacen_provisional_inventario_insumo_catalogo_id_fkey"
            columns: ["insumo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      almacenes: {
        Row: {
          activo: boolean | null
          created_at: string | null
          descripcion: string | null
          hospital_id: string
          id: string
          nombre: string
          ubicacion: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          descripcion?: string | null
          hospital_id: string
          id?: string
          nombre: string
          ubicacion?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          descripcion?: string | null
          hospital_id?: string
          id?: string
          nombre?: string
          ubicacion?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "almacenes_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: true
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
        ]
      }
      almacenes_provisionales: {
        Row: {
          activo: boolean | null
          created_at: string | null
          created_by: string | null
          descripcion: string | null
          es_principal: boolean | null
          hospital_id: string
          id: string
          nombre: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          es_principal?: boolean | null
          hospital_id: string
          id?: string
          nombre: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          created_by?: string | null
          descripcion?: string | null
          es_principal?: boolean | null
          hospital_id?: string
          id?: string
          nombre?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "almacenes_provisionales_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
        ]
      }
      anestesia_insumos: {
        Row: {
          activo: boolean | null
          cantidad_default: number | null
          cantidad_maxima: number | null
          cantidad_minima: number | null
          categoria: string | null
          condicionante: string | null
          created_at: string | null
          grupo_exclusivo: string | null
          id: string
          id_bcb: string | null
          insumo_id: string | null
          nota: string | null
          orden: number | null
          tipo_anestesia: string
          tipo_limite: string | null
          unidad: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          cantidad_default?: number | null
          cantidad_maxima?: number | null
          cantidad_minima?: number | null
          categoria?: string | null
          condicionante?: string | null
          created_at?: string | null
          grupo_exclusivo?: string | null
          id?: string
          id_bcb?: string | null
          insumo_id?: string | null
          nota?: string | null
          orden?: number | null
          tipo_anestesia: string
          tipo_limite?: string | null
          unidad?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          cantidad_default?: number | null
          cantidad_maxima?: number | null
          cantidad_minima?: number | null
          categoria?: string | null
          condicionante?: string | null
          created_at?: string | null
          grupo_exclusivo?: string | null
          id?: string
          id_bcb?: string | null
          insumo_id?: string | null
          nota?: string | null
          orden?: number | null
          tipo_anestesia?: string
          tipo_limite?: string | null
          unidad?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anestesia_insumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogo_impuestos: {
        Row: {
          activo: boolean | null
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          tasa: number
          tipo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean | null
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          tasa: number
          tipo?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean | null
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          tasa?: number
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      comprobantes_pago: {
        Row: {
          archivo_nombre: string | null
          archivo_url: string | null
          created_at: string
          fecha_pago: string
          id: string
          monto_pagado: number
          notas: string | null
          numero_referencia: string | null
          pedido_compra_id: string
          registrado_por: string | null
          tipo_comprobante: string
        }
        Insert: {
          archivo_nombre?: string | null
          archivo_url?: string | null
          created_at?: string
          fecha_pago?: string
          id?: string
          monto_pagado: number
          notas?: string | null
          numero_referencia?: string | null
          pedido_compra_id: string
          registrado_por?: string | null
          tipo_comprobante: string
        }
        Update: {
          archivo_nombre?: string | null
          archivo_url?: string | null
          created_at?: string
          fecha_pago?: string
          id?: string
          monto_pagado?: number
          notas?: string | null
          numero_referencia?: string | null
          pedido_compra_id?: string
          registrado_por?: string | null
          tipo_comprobante?: string
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_pago_pedido_compra_id_fkey"
            columns: ["pedido_compra_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_agrupado_detalle: {
        Row: {
          cantidad_cubierta: number | null
          cantidad_pendiente: number | null
          created_at: string
          documento_id: string
          id: string
          insumo_catalogo_id: string
          total_faltante_requerido: number
        }
        Insert: {
          cantidad_cubierta?: number | null
          cantidad_pendiente?: number | null
          created_at?: string
          documento_id: string
          id?: string
          insumo_catalogo_id: string
          total_faltante_requerido?: number
        }
        Update: {
          cantidad_cubierta?: number | null
          cantidad_pendiente?: number | null
          created_at?: string
          documento_id?: string
          id?: string
          insumo_catalogo_id?: string
          total_faltante_requerido?: number
        }
        Relationships: [
          {
            foreignKeyName: "documento_agrupado_detalle_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos_necesidades_agrupado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_agrupado_detalle_insumo_catalogo_id_fkey"
            columns: ["insumo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_segmentado_detalle: {
        Row: {
          created_at: string
          documento_id: string
          existencia_actual: number
          faltante_requerido: number
          hospital_id: string
          id: string
          insumo_catalogo_id: string
          minimo: number
        }
        Insert: {
          created_at?: string
          documento_id: string
          existencia_actual?: number
          faltante_requerido?: number
          hospital_id: string
          id?: string
          insumo_catalogo_id: string
          minimo?: number
        }
        Update: {
          created_at?: string
          documento_id?: string
          existencia_actual?: number
          faltante_requerido?: number
          hospital_id?: string
          id?: string
          insumo_catalogo_id?: string
          minimo?: number
        }
        Relationships: [
          {
            foreignKeyName: "documento_segmentado_detalle_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos_necesidades_segmentado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_segmentado_detalle_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_segmentado_detalle_insumo_catalogo_id_fkey"
            columns: ["insumo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_necesidades_agrupado: {
        Row: {
          created_at: string
          enviado_a_gerente_almacen: boolean | null
          enviado_at: string | null
          estado: string
          fecha_generacion: string
          generado_por: string | null
          id: string
          notas: string | null
          procesado_at: string | null
          procesado_por_almacen: boolean | null
        }
        Insert: {
          created_at?: string
          enviado_a_gerente_almacen?: boolean | null
          enviado_at?: string | null
          estado?: string
          fecha_generacion?: string
          generado_por?: string | null
          id?: string
          notas?: string | null
          procesado_at?: string | null
          procesado_por_almacen?: boolean | null
        }
        Update: {
          created_at?: string
          enviado_a_gerente_almacen?: boolean | null
          enviado_at?: string | null
          estado?: string
          fecha_generacion?: string
          generado_por?: string | null
          id?: string
          notas?: string | null
          procesado_at?: string | null
          procesado_por_almacen?: boolean | null
        }
        Relationships: []
      }
      documentos_necesidades_segmentado: {
        Row: {
          created_at: string
          enviado_a_cadena_suministros: boolean | null
          enviado_at: string | null
          estado: string
          fecha_generacion: string
          generado_por: string | null
          id: string
          notas: string | null
          procesado_at: string | null
          procesado_por_cadena: boolean | null
        }
        Insert: {
          created_at?: string
          enviado_a_cadena_suministros?: boolean | null
          enviado_at?: string | null
          estado?: string
          fecha_generacion?: string
          generado_por?: string | null
          id?: string
          notas?: string | null
          procesado_at?: string | null
          procesado_por_cadena?: boolean | null
        }
        Update: {
          created_at?: string
          enviado_a_cadena_suministros?: boolean | null
          enviado_at?: string | null
          estado?: string
          fecha_generacion?: string
          generado_por?: string | null
          id?: string
          notas?: string | null
          procesado_at?: string | null
          procesado_por_cadena?: boolean | null
        }
        Relationships: []
      }
      excel_insumo_config: {
        Row: {
          id: number
          id_bcb: string | null
          max_excel: number | null
          min_excel: number | null
          nombre_insumo: string
          observaciones: string | null
          tiene_valores_claros: boolean | null
          tipo_anestesia: string
        }
        Insert: {
          id?: number
          id_bcb?: string | null
          max_excel?: number | null
          min_excel?: number | null
          nombre_insumo: string
          observaciones?: string | null
          tiene_valores_claros?: boolean | null
          tipo_anestesia: string
        }
        Update: {
          id?: number
          id_bcb?: string | null
          max_excel?: number | null
          min_excel?: number | null
          nombre_insumo?: string
          observaciones?: string | null
          tiene_valores_claros?: boolean | null
          tipo_anestesia?: string
        }
        Relationships: []
      }
      folios: {
        Row: {
          almacen_provisional_id: string | null
          anestesia_principal: string | null
          anestesia_secundaria: string | null
          anestesiologo_id: string | null
          anestesiologo_nombre: string | null
          cancelado_por: string | null
          cirugia: string | null
          cirujano_id: string | null
          cirujano_nombre: string | null
          created_at: string | null
          especialidad_quirurgica: string | null
          estado: Database["public"]["Enums"]["estado_folio"] | null
          fecha: string | null
          hora_fin_anestesia: string | null
          hora_fin_procedimiento: string | null
          hora_inicio_anestesia: string | null
          hora_inicio_procedimiento: string | null
          hospital_budget_code: string | null
          hospital_display_name: string | null
          hospital_id: string | null
          id: string
          medico_id: string | null
          numero_folio: string
          numero_quirofano: string | null
          observaciones: string | null
          paciente_apellido_materno: string | null
          paciente_apellido_paterno: string | null
          paciente_edad: number | null
          paciente_edad_unidad: string | null
          paciente_edad_valor: number | null
          paciente_fecha_nacimiento: string | null
          paciente_genero: string | null
          paciente_nombre: string | null
          paciente_nss: string | null
          state_name: string | null
          tipo_anestesia: string | null
          tipo_cirugia: string | null
          tipo_evento: string | null
          unidad: string | null
          updated_at: string | null
        }
        Insert: {
          almacen_provisional_id?: string | null
          anestesia_principal?: string | null
          anestesia_secundaria?: string | null
          anestesiologo_id?: string | null
          anestesiologo_nombre?: string | null
          cancelado_por?: string | null
          cirugia?: string | null
          cirujano_id?: string | null
          cirujano_nombre?: string | null
          created_at?: string | null
          especialidad_quirurgica?: string | null
          estado?: Database["public"]["Enums"]["estado_folio"] | null
          fecha?: string | null
          hora_fin_anestesia?: string | null
          hora_fin_procedimiento?: string | null
          hora_inicio_anestesia?: string | null
          hora_inicio_procedimiento?: string | null
          hospital_budget_code?: string | null
          hospital_display_name?: string | null
          hospital_id?: string | null
          id?: string
          medico_id?: string | null
          numero_folio: string
          numero_quirofano?: string | null
          observaciones?: string | null
          paciente_apellido_materno?: string | null
          paciente_apellido_paterno?: string | null
          paciente_edad?: number | null
          paciente_edad_unidad?: string | null
          paciente_edad_valor?: number | null
          paciente_fecha_nacimiento?: string | null
          paciente_genero?: string | null
          paciente_nombre?: string | null
          paciente_nss?: string | null
          state_name?: string | null
          tipo_anestesia?: string | null
          tipo_cirugia?: string | null
          tipo_evento?: string | null
          unidad?: string | null
          updated_at?: string | null
        }
        Update: {
          almacen_provisional_id?: string | null
          anestesia_principal?: string | null
          anestesia_secundaria?: string | null
          anestesiologo_id?: string | null
          anestesiologo_nombre?: string | null
          cancelado_por?: string | null
          cirugia?: string | null
          cirujano_id?: string | null
          cirujano_nombre?: string | null
          created_at?: string | null
          especialidad_quirurgica?: string | null
          estado?: Database["public"]["Enums"]["estado_folio"] | null
          fecha?: string | null
          hora_fin_anestesia?: string | null
          hora_fin_procedimiento?: string | null
          hora_inicio_anestesia?: string | null
          hora_inicio_procedimiento?: string | null
          hospital_budget_code?: string | null
          hospital_display_name?: string | null
          hospital_id?: string | null
          id?: string
          medico_id?: string | null
          numero_folio?: string
          numero_quirofano?: string | null
          observaciones?: string | null
          paciente_apellido_materno?: string | null
          paciente_apellido_paterno?: string | null
          paciente_edad?: number | null
          paciente_edad_unidad?: string | null
          paciente_edad_valor?: number | null
          paciente_fecha_nacimiento?: string | null
          paciente_genero?: string | null
          paciente_nombre?: string | null
          paciente_nss?: string | null
          state_name?: string | null
          tipo_anestesia?: string | null
          tipo_cirugia?: string | null
          tipo_evento?: string | null
          unidad?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "folios_almacen_provisional_id_fkey"
            columns: ["almacen_provisional_id"]
            isOneToOne: false
            referencedRelation: "almacenes_provisionales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folios_anestesiologo_id_fkey"
            columns: ["anestesiologo_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folios_cirujano_id_fkey"
            columns: ["cirujano_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folios_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folios_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      folios_insumos: {
        Row: {
          cantidad: number
          created_at: string | null
          folio_id: string | null
          id: string
          insumo_id: string | null
        }
        Insert: {
          cantidad: number
          created_at?: string | null
          folio_id?: string | null
          id?: string
          insumo_id?: string | null
        }
        Update: {
          cantidad?: number
          created_at?: string | null
          folio_id?: string | null
          id?: string
          insumo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "folio_insumos_folio_id_fkey"
            columns: ["folio_id"]
            isOneToOne: false
            referencedRelation: "folios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folios_insumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      folios_insumos_adicionales: {
        Row: {
          cantidad: number
          created_at: string
          created_by: string | null
          folio_id: string
          id: string
          insumo_id: string
          motivo: string | null
        }
        Insert: {
          cantidad?: number
          created_at?: string
          created_by?: string | null
          folio_id: string
          id?: string
          insumo_id: string
          motivo?: string | null
        }
        Update: {
          cantidad?: number
          created_at?: string
          created_by?: string | null
          folio_id?: string
          id?: string
          insumo_id?: string
          motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "folios_insumos_adicionales_folio_id_fkey"
            columns: ["folio_id"]
            isOneToOne: false
            referencedRelation: "folios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folios_insumos_adicionales_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      folios_insumos_costos: {
        Row: {
          cantidad: number
          costo_total: number | null
          created_at: string
          folio_id: string
          id: string
          insumo_catalogo_id: string
          lote_id: string | null
          precio_unitario: number
        }
        Insert: {
          cantidad?: number
          costo_total?: number | null
          created_at?: string
          folio_id: string
          id?: string
          insumo_catalogo_id: string
          lote_id?: string | null
          precio_unitario: number
        }
        Update: {
          cantidad?: number
          costo_total?: number | null
          created_at?: string
          folio_id?: string
          id?: string
          insumo_catalogo_id?: string
          lote_id?: string | null
          precio_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "folios_insumos_costos_folio_id_fkey"
            columns: ["folio_id"]
            isOneToOne: false
            referencedRelation: "folios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folios_insumos_costos_insumo_catalogo_id_fkey"
            columns: ["insumo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folios_insumos_costos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "inventario_lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      formatos_generados: {
        Row: {
          created_at: string
          data_json: Json
          estado: string
          generado_por: string | null
          hospital_id: string | null
          id: string
          notas: string | null
          pdf_url: string | null
          tipo: string
        }
        Insert: {
          created_at?: string
          data_json?: Json
          estado?: string
          generado_por?: string | null
          hospital_id?: string | null
          id?: string
          notas?: string | null
          pdf_url?: string | null
          tipo: string
        }
        Update: {
          created_at?: string
          data_json?: Json
          estado?: string
          generado_por?: string | null
          hospital_id?: string | null
          id?: string
          notas?: string | null
          pdf_url?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "formatos_generados_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
        ]
      }
      hospital_procedimientos: {
        Row: {
          activo: boolean | null
          created_at: string | null
          created_by: string | null
          hospital_id: string
          id: string
          procedimiento_clave: string
          procedimiento_nombre: string
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          created_by?: string | null
          hospital_id: string
          id?: string
          procedimiento_clave: string
          procedimiento_nombre: string
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          created_by?: string | null
          hospital_id?: string
          id?: string
          procedimiento_clave?: string
          procedimiento_nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospital_procedimientos_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitales: {
        Row: {
          budget_code: string | null
          clinic_number: string | null
          codigo: string | null
          created_at: string | null
          display_name: string | null
          empresa_id: string | null
          estado_id: string | null
          hospital_type: string | null
          id: string
          locality: string | null
          nombre: string
          state_id: string | null
          updated_at: string | null
        }
        Insert: {
          budget_code?: string | null
          clinic_number?: string | null
          codigo?: string | null
          created_at?: string | null
          display_name?: string | null
          empresa_id?: string | null
          estado_id?: string | null
          hospital_type?: string | null
          id?: string
          locality?: string | null
          nombre: string
          state_id?: string | null
          updated_at?: string | null
        }
        Update: {
          budget_code?: string | null
          clinic_number?: string | null
          codigo?: string | null
          created_at?: string | null
          display_name?: string | null
          empresa_id?: string | null
          estado_id?: string | null
          hospital_type?: string | null
          id?: string
          locality?: string | null
          nombre?: string
          state_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hospitales_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      insumo_configuracion: {
        Row: {
          cantidad_default: number | null
          condicionante: string | null
          created_at: string | null
          grupo_exclusivo: string | null
          id: string
          insumo_catalogo_id: string
          max_anestesia: number | null
          max_global_inventario: number | null
          min_anestesia: number | null
          min_global_inventario: number | null
          nota: string | null
          tipo_anestesia: string | null
          tipo_limite: string | null
          updated_at: string | null
        }
        Insert: {
          cantidad_default?: number | null
          condicionante?: string | null
          created_at?: string | null
          grupo_exclusivo?: string | null
          id?: string
          insumo_catalogo_id: string
          max_anestesia?: number | null
          max_global_inventario?: number | null
          min_anestesia?: number | null
          min_global_inventario?: number | null
          nota?: string | null
          tipo_anestesia?: string | null
          tipo_limite?: string | null
          updated_at?: string | null
        }
        Update: {
          cantidad_default?: number | null
          condicionante?: string | null
          created_at?: string | null
          grupo_exclusivo?: string | null
          id?: string
          insumo_catalogo_id?: string
          max_anestesia?: number | null
          max_global_inventario?: number | null
          min_anestesia?: number | null
          min_global_inventario?: number | null
          nota?: string | null
          tipo_anestesia?: string | null
          tipo_limite?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insumo_configuracion_insumo_catalogo_id_fkey"
            columns: ["insumo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      insumos: {
        Row: {
          cantidad: number | null
          clave: string | null
          created_at: string | null
          descripcion: string | null
          fecha_caducidad: string | null
          fecha_entrada: string | null
          hospital_budget_code: string | null
          hospital_display_name: string | null
          hospital_id: string | null
          id: string
          lote: string | null
          nombre: string
          state_name: string | null
          updated_at: string | null
        }
        Insert: {
          cantidad?: number | null
          clave?: string | null
          created_at?: string | null
          descripcion?: string | null
          fecha_caducidad?: string | null
          fecha_entrada?: string | null
          hospital_budget_code?: string | null
          hospital_display_name?: string | null
          hospital_id?: string | null
          id?: string
          lote?: string | null
          nombre: string
          state_name?: string | null
          updated_at?: string | null
        }
        Update: {
          cantidad?: number | null
          clave?: string | null
          created_at?: string | null
          descripcion?: string | null
          fecha_caducidad?: string | null
          fecha_entrada?: string | null
          hospital_budget_code?: string | null
          hospital_display_name?: string | null
          hospital_id?: string | null
          id?: string
          lote?: string | null
          nombre?: string
          state_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insumos_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
        ]
      }
      insumos_alertas: {
        Row: {
          cantidad_actual: number
          consolidado_id: string | null
          created_at: string
          enviado_a_gerente_operaciones: boolean
          enviado_a_supervisor: boolean
          estado: string
          generado_por: string | null
          hospital_id: string
          id: string
          insumo_catalogo_id: string
          inventario_id: string | null
          minimo_permitido: number
          notas: string | null
          prioridad: string
          resuelto_at: string | null
          resuelto_por: string | null
          updated_at: string
        }
        Insert: {
          cantidad_actual?: number
          consolidado_id?: string | null
          created_at?: string
          enviado_a_gerente_operaciones?: boolean
          enviado_a_supervisor?: boolean
          estado?: string
          generado_por?: string | null
          hospital_id: string
          id?: string
          insumo_catalogo_id: string
          inventario_id?: string | null
          minimo_permitido?: number
          notas?: string | null
          prioridad?: string
          resuelto_at?: string | null
          resuelto_por?: string | null
          updated_at?: string
        }
        Update: {
          cantidad_actual?: number
          consolidado_id?: string | null
          created_at?: string
          enviado_a_gerente_operaciones?: boolean
          enviado_a_supervisor?: boolean
          estado?: string
          generado_por?: string | null
          hospital_id?: string
          id?: string
          insumo_catalogo_id?: string
          inventario_id?: string | null
          minimo_permitido?: number
          notas?: string | null
          prioridad?: string
          resuelto_at?: string | null
          resuelto_por?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insumos_alertas_consolidado_id_fkey"
            columns: ["consolidado_id"]
            isOneToOne: false
            referencedRelation: "inventario_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumos_alertas_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumos_alertas_insumo_catalogo_id_fkey"
            columns: ["insumo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumos_alertas_inventario_id_fkey"
            columns: ["inventario_id"]
            isOneToOne: false
            referencedRelation: "inventario_hospital"
            referencedColumns: ["id"]
          },
        ]
      }
      insumos_catalogo: {
        Row: {
          activo: boolean | null
          categoria: string | null
          clave: string | null
          created_at: string | null
          descripcion: string | null
          familia_insumo: string | null
          id: string
          nombre: string
          presentacion: string | null
          tipo: string | null
          unidad: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          categoria?: string | null
          clave?: string | null
          created_at?: string | null
          descripcion?: string | null
          familia_insumo?: string | null
          id?: string
          nombre: string
          presentacion?: string | null
          tipo?: string | null
          unidad?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          categoria?: string | null
          clave?: string | null
          created_at?: string | null
          descripcion?: string | null
          familia_insumo?: string | null
          id?: string
          nombre?: string
          presentacion?: string | null
          tipo?: string | null
          unidad?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      insumos_requerimientos: {
        Row: {
          alerta_origen_id: string | null
          aprobado_at: string | null
          aprobado_por: string | null
          cantidad_requerida: number
          created_at: string
          estado: string
          generado_por: string | null
          hospital_id: string
          id: string
          insumo_catalogo_id: string
          notas: string | null
          prioridad: string
          updated_at: string
        }
        Insert: {
          alerta_origen_id?: string | null
          aprobado_at?: string | null
          aprobado_por?: string | null
          cantidad_requerida?: number
          created_at?: string
          estado?: string
          generado_por?: string | null
          hospital_id: string
          id?: string
          insumo_catalogo_id: string
          notas?: string | null
          prioridad?: string
          updated_at?: string
        }
        Update: {
          alerta_origen_id?: string | null
          aprobado_at?: string | null
          aprobado_por?: string | null
          cantidad_requerida?: number
          created_at?: string
          estado?: string
          generado_por?: string | null
          hospital_id?: string
          id?: string
          insumo_catalogo_id?: string
          notas?: string | null
          prioridad?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insumos_requerimientos_alerta_origen_id_fkey"
            columns: ["alerta_origen_id"]
            isOneToOne: false
            referencedRelation: "insumos_alertas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumos_requerimientos_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumos_requerimientos_insumo_catalogo_id_fkey"
            columns: ["insumo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_consolidado: {
        Row: {
          almacen_id: string
          cantidad_minima: number | null
          cantidad_total: number
          created_at: string | null
          hospital_id: string
          id: string
          insumo_catalogo_id: string
          updated_at: string | null
        }
        Insert: {
          almacen_id: string
          cantidad_minima?: number | null
          cantidad_total?: number
          created_at?: string | null
          hospital_id: string
          id?: string
          insumo_catalogo_id: string
          updated_at?: string | null
        }
        Update: {
          almacen_id?: string
          cantidad_minima?: number | null
          cantidad_total?: number
          created_at?: string | null
          hospital_id?: string
          id?: string
          insumo_catalogo_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventario_consolidado_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_consolidado_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_consolidado_insumo_catalogo_id_fkey"
            columns: ["insumo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_hospital: {
        Row: {
          almacen_id: string
          cantidad_actual: number | null
          cantidad_inicial: number | null
          cantidad_maxima: number | null
          cantidad_minima: number | null
          created_at: string | null
          estatus: string | null
          fecha_caducidad: string | null
          hospital_id: string
          id: string
          insumo_catalogo_id: string
          lote: string | null
          ubicacion: string | null
          updated_at: string | null
        }
        Insert: {
          almacen_id: string
          cantidad_actual?: number | null
          cantidad_inicial?: number | null
          cantidad_maxima?: number | null
          cantidad_minima?: number | null
          created_at?: string | null
          estatus?: string | null
          fecha_caducidad?: string | null
          hospital_id: string
          id?: string
          insumo_catalogo_id: string
          lote?: string | null
          ubicacion?: string | null
          updated_at?: string | null
        }
        Update: {
          almacen_id?: string
          cantidad_actual?: number | null
          cantidad_inicial?: number | null
          cantidad_maxima?: number | null
          cantidad_minima?: number | null
          created_at?: string | null
          estatus?: string | null
          fecha_caducidad?: string | null
          hospital_id?: string
          id?: string
          insumo_catalogo_id?: string
          lote?: string | null
          ubicacion?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventario_hospital_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_hospital_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_hospital_insumo_catalogo_id_fkey"
            columns: ["insumo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_lotes: {
        Row: {
          cantidad: number
          consolidado_id: string
          created_at: string | null
          fecha_caducidad: string | null
          fecha_entrada: string | null
          id: string
          lote: string | null
          orden_compra_id: string | null
          precio_unitario: number | null
          ubicacion: string | null
          updated_at: string | null
        }
        Insert: {
          cantidad?: number
          consolidado_id: string
          created_at?: string | null
          fecha_caducidad?: string | null
          fecha_entrada?: string | null
          id?: string
          lote?: string | null
          orden_compra_id?: string | null
          precio_unitario?: number | null
          ubicacion?: string | null
          updated_at?: string | null
        }
        Update: {
          cantidad?: number
          consolidado_id?: string
          created_at?: string | null
          fecha_caducidad?: string | null
          fecha_entrada?: string | null
          id?: string
          lote?: string | null
          orden_compra_id?: string | null
          precio_unitario?: number | null
          ubicacion?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventario_lotes_consolidado_id_fkey"
            columns: ["consolidado_id"]
            isOneToOne: false
            referencedRelation: "inventario_consolidado"
            referencedColumns: ["id"]
          },
        ]
      }
      medicos: {
        Row: {
          activo: boolean | null
          created_at: string | null
          especialidad: Database["public"]["Enums"]["especialidad_medica"]
          hospital_budget_code: string | null
          hospital_display_name: string | null
          hospital_id: string | null
          id: string
          nombre: string
          state_name: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          especialidad: Database["public"]["Enums"]["especialidad_medica"]
          hospital_budget_code?: string | null
          hospital_display_name?: string | null
          hospital_id?: string | null
          id?: string
          nombre: string
          state_name?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          especialidad?: Database["public"]["Enums"]["especialidad_medica"]
          hospital_budget_code?: string | null
          hospital_display_name?: string | null
          hospital_id?: string | null
          id?: string
          nombre?: string
          state_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medicos_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
        ]
      }
      mermas_transferencia: {
        Row: {
          alerta_transferencia_id: string | null
          cantidad_enviada: number
          cantidad_merma: number
          cantidad_recibida: number
          created_at: string | null
          id: string
          insumo_catalogo_id: string
          motivo: string | null
          registrado_por: string | null
          transferencia_id: string | null
        }
        Insert: {
          alerta_transferencia_id?: string | null
          cantidad_enviada: number
          cantidad_merma: number
          cantidad_recibida: number
          created_at?: string | null
          id?: string
          insumo_catalogo_id: string
          motivo?: string | null
          registrado_por?: string | null
          transferencia_id?: string | null
        }
        Update: {
          alerta_transferencia_id?: string | null
          cantidad_enviada?: number
          cantidad_merma?: number
          cantidad_recibida?: number
          created_at?: string | null
          id?: string
          insumo_catalogo_id?: string
          motivo?: string | null
          registrado_por?: string | null
          transferencia_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mermas_transferencia_alerta_transferencia_id_fkey"
            columns: ["alerta_transferencia_id"]
            isOneToOne: false
            referencedRelation: "alertas_transferencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mermas_transferencia_insumo_catalogo_id_fkey"
            columns: ["insumo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mermas_transferencia_transferencia_id_fkey"
            columns: ["transferencia_id"]
            isOneToOne: false
            referencedRelation: "transferencias_central_hospital"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_almacen_provisional: {
        Row: {
          almacen_provisional_id: string
          cantidad: number
          created_at: string | null
          folio_id: string | null
          hospital_id: string
          id: string
          insumo_catalogo_id: string
          observaciones: string | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          almacen_provisional_id: string
          cantidad: number
          created_at?: string | null
          folio_id?: string | null
          hospital_id: string
          id?: string
          insumo_catalogo_id: string
          observaciones?: string | null
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          almacen_provisional_id?: string
          cantidad?: number
          created_at?: string | null
          folio_id?: string | null
          hospital_id?: string
          id?: string
          insumo_catalogo_id?: string
          observaciones?: string | null
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_almacen_provisional_almacen_provisional_id_fkey"
            columns: ["almacen_provisional_id"]
            isOneToOne: false
            referencedRelation: "almacenes_provisionales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_almacen_provisional_folio_id_fkey"
            columns: ["folio_id"]
            isOneToOne: false
            referencedRelation: "folios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_almacen_provisional_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_almacen_provisional_insumo_catalogo_id_fkey"
            columns: ["insumo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_inventario: {
        Row: {
          cantidad: number
          cantidad_anterior: number | null
          cantidad_nueva: number | null
          created_at: string | null
          folio_id: string | null
          hospital_id: string
          id: string
          inventario_id: string
          observaciones: string | null
          tipo_movimiento: string
          traspaso_id: string | null
          usuario_id: string | null
        }
        Insert: {
          cantidad: number
          cantidad_anterior?: number | null
          cantidad_nueva?: number | null
          created_at?: string | null
          folio_id?: string | null
          hospital_id: string
          id?: string
          inventario_id: string
          observaciones?: string | null
          tipo_movimiento: string
          traspaso_id?: string | null
          usuario_id?: string | null
        }
        Update: {
          cantidad?: number
          cantidad_anterior?: number | null
          cantidad_nueva?: number | null
          created_at?: string | null
          folio_id?: string | null
          hospital_id?: string
          id?: string
          inventario_id?: string
          observaciones?: string | null
          tipo_movimiento?: string
          traspaso_id?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_inventario_folio_id_fkey"
            columns: ["folio_id"]
            isOneToOne: false
            referencedRelation: "folios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_inventario_id_fkey"
            columns: ["inventario_id"]
            isOneToOne: false
            referencedRelation: "inventario_hospital"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_traspaso_id_fkey"
            columns: ["traspaso_id"]
            isOneToOne: false
            referencedRelation: "traspasos"
            referencedColumns: ["id"]
          },
        ]
      }
      orden_compra_impuestos: {
        Row: {
          created_at: string
          id: string
          impuesto_id: string
          monto: number
          pedido_compra_id: string
          tasa_aplicada: number
          tipo: string
        }
        Insert: {
          created_at?: string
          id?: string
          impuesto_id: string
          monto?: number
          pedido_compra_id: string
          tasa_aplicada: number
          tipo?: string
        }
        Update: {
          created_at?: string
          id?: string
          impuesto_id?: string
          monto?: number
          pedido_compra_id?: string
          tasa_aplicada?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "orden_compra_impuestos_impuesto_id_fkey"
            columns: ["impuesto_id"]
            isOneToOne: false
            referencedRelation: "catalogo_impuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orden_compra_impuestos_pedido_compra_id_fkey"
            columns: ["pedido_compra_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      paquete_insumos: {
        Row: {
          cantidad: number
          created_at: string | null
          id: string
          insumo_id: string | null
          paquete_id: string | null
        }
        Insert: {
          cantidad: number
          created_at?: string | null
          id?: string
          insumo_id?: string | null
          paquete_id?: string | null
        }
        Update: {
          cantidad?: number
          created_at?: string | null
          id?: string
          insumo_id?: string | null
          paquete_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paquete_insumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paquete_insumos_paquete_id_fkey"
            columns: ["paquete_id"]
            isOneToOne: false
            referencedRelation: "paquetes_anestesia"
            referencedColumns: ["id"]
          },
        ]
      }
      paquetes_anestesia: {
        Row: {
          created_at: string | null
          descripcion: string | null
          hospital_budget_code: string | null
          hospital_display_name: string | null
          id: string
          nombre: string
          state_name: string | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          descripcion?: string | null
          hospital_budget_code?: string | null
          hospital_display_name?: string | null
          id?: string
          nombre: string
          state_name?: string | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          descripcion?: string | null
          hospital_budget_code?: string | null
          hospital_display_name?: string | null
          id?: string
          nombre?: string
          state_name?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pedido_items: {
        Row: {
          cantidad_merma: number | null
          cantidad_recibida: number
          cantidad_solicitada: number
          created_at: string
          estado: string
          id: string
          insumo_catalogo_id: string
          motivo_merma: string | null
          notas: string | null
          pedido_id: string
          precio_recibido: number | null
          precio_unitario: number | null
        }
        Insert: {
          cantidad_merma?: number | null
          cantidad_recibida?: number
          cantidad_solicitada?: number
          created_at?: string
          estado?: string
          id?: string
          insumo_catalogo_id: string
          motivo_merma?: string | null
          notas?: string | null
          pedido_id: string
          precio_recibido?: number | null
          precio_unitario?: number | null
        }
        Update: {
          cantidad_merma?: number | null
          cantidad_recibida?: number
          cantidad_solicitada?: number
          created_at?: string
          estado?: string
          id?: string
          insumo_catalogo_id?: string
          motivo_merma?: string | null
          notas?: string | null
          pedido_id?: string
          precio_recibido?: number | null
          precio_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_items_insumo_catalogo_id_fkey"
            columns: ["insumo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_items_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_compra: {
        Row: {
          aprobado_at: string | null
          aprobado_por: string | null
          completado_at: string | null
          creado_por: string | null
          created_at: string
          documento_origen_id: string | null
          enviado_a_cadena: boolean | null
          enviado_a_cadena_at: string | null
          estado: string
          fecha_estimada_entrega: string | null
          formato_origen_id: string | null
          id: string
          notas: string | null
          numero_pedido: string
          pagado_at: string | null
          proveedor: string | null
          proveedor_id: string | null
          subtotal: number | null
          total: number | null
          total_impuestos: number | null
          total_items: number
          total_retenciones: number | null
          updated_at: string
        }
        Insert: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          completado_at?: string | null
          creado_por?: string | null
          created_at?: string
          documento_origen_id?: string | null
          enviado_a_cadena?: boolean | null
          enviado_a_cadena_at?: string | null
          estado?: string
          fecha_estimada_entrega?: string | null
          formato_origen_id?: string | null
          id?: string
          notas?: string | null
          numero_pedido: string
          pagado_at?: string | null
          proveedor?: string | null
          proveedor_id?: string | null
          subtotal?: number | null
          total?: number | null
          total_impuestos?: number | null
          total_items?: number
          total_retenciones?: number | null
          updated_at?: string
        }
        Update: {
          aprobado_at?: string | null
          aprobado_por?: string | null
          completado_at?: string | null
          creado_por?: string | null
          created_at?: string
          documento_origen_id?: string | null
          enviado_a_cadena?: boolean | null
          enviado_a_cadena_at?: string | null
          estado?: string
          fecha_estimada_entrega?: string | null
          formato_origen_id?: string | null
          id?: string
          notas?: string | null
          numero_pedido?: string
          pagado_at?: string | null
          proveedor?: string | null
          proveedor_id?: string | null
          subtotal?: number | null
          total?: number | null
          total_impuestos?: number | null
          total_items?: number
          total_retenciones?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_compra_documento_origen_id_fkey"
            columns: ["documento_origen_id"]
            isOneToOne: false
            referencedRelation: "documentos_necesidades_agrupado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_compra_formato_origen_id_fkey"
            columns: ["formato_origen_id"]
            isOneToOne: false
            referencedRelation: "formatos_generados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      precios_insumos: {
        Row: {
          activo: boolean | null
          created_at: string
          created_by: string | null
          id: string
          insumo_catalogo_id: string
          moneda: string | null
          precio_unitario: number
          updated_at: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string
          created_by?: string | null
          id?: string
          insumo_catalogo_id: string
          moneda?: string | null
          precio_unitario?: number
          updated_at?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string
          created_by?: string | null
          id?: string
          insumo_catalogo_id?: string
          moneda?: string | null
          precio_unitario?: number
          updated_at?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "precios_insumos_insumo_catalogo_id_fkey"
            columns: ["insumo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuestos_hospital: {
        Row: {
          anio: number
          created_at: string
          created_by: string | null
          es_extension: boolean | null
          hospital_id: string
          id: string
          limite_anual: number | null
          mes: number
          notas: string | null
          presupuesto_asignado: number
          presupuesto_ejecutado: number
          updated_at: string
        }
        Insert: {
          anio: number
          created_at?: string
          created_by?: string | null
          es_extension?: boolean | null
          hospital_id: string
          id?: string
          limite_anual?: number | null
          mes: number
          notas?: string | null
          presupuesto_asignado?: number
          presupuesto_ejecutado?: number
          updated_at?: string
        }
        Update: {
          anio?: number
          created_at?: string
          created_by?: string | null
          es_extension?: boolean | null
          hospital_id?: string
          id?: string
          limite_anual?: number | null
          mes?: number
          notas?: string | null
          presupuesto_asignado?: number
          presupuesto_ejecutado?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presupuestos_hospital_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
        ]
      }
      procedimiento_insumos_catalogo: {
        Row: {
          activo: boolean | null
          cantidad_maxima: number | null
          cantidad_minima: number | null
          cantidad_sugerida: number | null
          created_at: string | null
          created_by: string | null
          id: string
          insumo_catalogo_id: string
          notas: string | null
          procedimiento_clave: string
          procedimiento_nombre: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          cantidad_maxima?: number | null
          cantidad_minima?: number | null
          cantidad_sugerida?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          insumo_catalogo_id: string
          notas?: string | null
          procedimiento_clave: string
          procedimiento_nombre: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          cantidad_maxima?: number | null
          cantidad_minima?: number | null
          cantidad_sugerida?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          insumo_catalogo_id?: string
          notas?: string | null
          procedimiento_clave?: string
          procedimiento_nombre?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedimiento_insumos_catalogo_insumo_catalogo_id_fkey"
            columns: ["insumo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      procedimientos: {
        Row: {
          clave_procedimiento: string | null
          created_at: string | null
          descripcion: string | null
          hospital_id: string | null
          id: string
          nombre: string
          updated_at: string | null
        }
        Insert: {
          clave_procedimiento?: string | null
          created_at?: string | null
          descripcion?: string | null
          hospital_id?: string | null
          id?: string
          nombre: string
          updated_at?: string | null
        }
        Update: {
          clave_procedimiento?: string | null
          created_at?: string | null
          descripcion?: string | null
          hospital_id?: string | null
          id?: string
          nombre?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedimientos_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          departamento: string | null
          hospital_id: string | null
          id: string
          nombre: string
          updated_at: string | null
          username: string | null
        }
        Insert: {
          created_at?: string | null
          departamento?: string | null
          hospital_id?: string | null
          id: string
          nombre: string
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string | null
          departamento?: string | null
          hospital_id?: string | null
          id?: string
          nombre?: string
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      proveedores: {
        Row: {
          activo: boolean | null
          banco: string | null
          categoria_productos: string | null
          clabe: string | null
          condiciones_pago: string | null
          created_at: string
          cuenta_bancaria: string | null
          dias_credito: number | null
          direccion: string | null
          email: string | null
          id: string
          nombre: string
          rfc: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean | null
          banco?: string | null
          categoria_productos?: string | null
          clabe?: string | null
          condiciones_pago?: string | null
          created_at?: string
          cuenta_bancaria?: string | null
          dias_credito?: number | null
          direccion?: string | null
          email?: string | null
          id?: string
          nombre: string
          rfc?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean | null
          banco?: string | null
          categoria_productos?: string | null
          clabe?: string | null
          condiciones_pago?: string | null
          created_at?: string
          cuenta_bancaria?: string | null
          dias_credito?: number | null
          direccion?: string | null
          email?: string | null
          id?: string
          nombre?: string
          rfc?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      registro_actividad: {
        Row: {
          almacen_destino_id: string | null
          almacen_destino_nombre: string | null
          almacen_origen_id: string | null
          almacen_origen_nombre: string | null
          cantidad_total: number | null
          created_at: string
          descripcion: string
          detalles_adicionales: Json | null
          folio_id: string | null
          hospital_id: string
          id: string
          insumos_afectados: Json | null
          numero_folio: string | null
          tipo_actividad: Database["public"]["Enums"]["tipo_actividad"]
          usuario_id: string
          usuario_nombre: string
        }
        Insert: {
          almacen_destino_id?: string | null
          almacen_destino_nombre?: string | null
          almacen_origen_id?: string | null
          almacen_origen_nombre?: string | null
          cantidad_total?: number | null
          created_at?: string
          descripcion: string
          detalles_adicionales?: Json | null
          folio_id?: string | null
          hospital_id: string
          id?: string
          insumos_afectados?: Json | null
          numero_folio?: string | null
          tipo_actividad: Database["public"]["Enums"]["tipo_actividad"]
          usuario_id: string
          usuario_nombre: string
        }
        Update: {
          almacen_destino_id?: string | null
          almacen_destino_nombre?: string | null
          almacen_origen_id?: string | null
          almacen_origen_nombre?: string | null
          cantidad_total?: number | null
          created_at?: string
          descripcion?: string
          detalles_adicionales?: Json | null
          folio_id?: string | null
          hospital_id?: string
          id?: string
          insumos_afectados?: Json | null
          numero_folio?: string | null
          tipo_actividad?: Database["public"]["Enums"]["tipo_actividad"]
          usuario_id?: string
          usuario_nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "registro_actividad_folio_id_fkey"
            columns: ["folio_id"]
            isOneToOne: false
            referencedRelation: "folios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registro_actividad_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
        ]
      }
      rutas_distribucion: {
        Row: {
          activo: boolean | null
          created_at: string | null
          descripcion: string | null
          id: string
          nombre_ruta: string
          tipo: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          descripcion?: string | null
          id?: string
          nombre_ruta: string
          tipo: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          descripcion?: string | null
          id?: string
          nombre_ruta?: string
          tipo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      rutas_hospitales: {
        Row: {
          created_at: string | null
          hospital_id: string
          id: string
          ruta_id: string
        }
        Insert: {
          created_at?: string | null
          hospital_id: string
          id?: string
          ruta_id: string
        }
        Update: {
          created_at?: string | null
          hospital_id?: string
          id?: string
          ruta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rutas_hospitales_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rutas_hospitales_ruta_id_fkey"
            columns: ["ruta_id"]
            isOneToOne: false
            referencedRelation: "rutas_distribucion"
            referencedColumns: ["id"]
          },
        ]
      }
      states: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      supervisor_hospital_assignments: {
        Row: {
          created_at: string
          hospital_id: string
          id: string
          supervisor_user_id: string
        }
        Insert: {
          created_at?: string
          hospital_id: string
          id?: string
          supervisor_user_id: string
        }
        Update: {
          created_at?: string
          hospital_id?: string
          id?: string
          supervisor_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisor_hospital_assignments_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
        ]
      }
      tarifas_procedimientos: {
        Row: {
          activo: boolean | null
          created_at: string | null
          created_by: string | null
          hospital_id: string
          id: string
          moneda: string | null
          notas: string | null
          procedimiento_clave: string
          procedimiento_nombre: string
          tarifa_facturacion: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          created_by?: string | null
          hospital_id: string
          id?: string
          moneda?: string | null
          notas?: string | null
          procedimiento_clave: string
          procedimiento_nombre: string
          tarifa_facturacion?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          created_by?: string | null
          hospital_id?: string
          id?: string
          moneda?: string | null
          notas?: string | null
          procedimiento_clave?: string
          procedimiento_nombre?: string
          tarifa_facturacion?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tarifas_procedimientos_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencias_central_hospital: {
        Row: {
          alerta_creada: boolean | null
          cantidad_enviada: number
          created_at: string
          enviado_por: string | null
          estado: string
          fecha: string
          hospital_destino_id: string
          id: string
          insumo_catalogo_id: string
          notas: string | null
          recibido_at: string | null
          recibido_por: string | null
          ruta_id: string | null
          tirada_id: string | null
          updated_at: string
        }
        Insert: {
          alerta_creada?: boolean | null
          cantidad_enviada?: number
          created_at?: string
          enviado_por?: string | null
          estado?: string
          fecha?: string
          hospital_destino_id: string
          id?: string
          insumo_catalogo_id: string
          notas?: string | null
          recibido_at?: string | null
          recibido_por?: string | null
          ruta_id?: string | null
          tirada_id?: string | null
          updated_at?: string
        }
        Update: {
          alerta_creada?: boolean | null
          cantidad_enviada?: number
          created_at?: string
          enviado_por?: string | null
          estado?: string
          fecha?: string
          hospital_destino_id?: string
          id?: string
          insumo_catalogo_id?: string
          notas?: string | null
          recibido_at?: string | null
          recibido_por?: string | null
          ruta_id?: string | null
          tirada_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_central_hospital_hospital_destino_id_fkey"
            columns: ["hospital_destino_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_central_hospital_insumo_catalogo_id_fkey"
            columns: ["insumo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "insumos_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_central_hospital_ruta_id_fkey"
            columns: ["ruta_id"]
            isOneToOne: false
            referencedRelation: "rutas_distribucion"
            referencedColumns: ["id"]
          },
        ]
      }
      traspaso_insumos: {
        Row: {
          cantidad: number
          created_at: string | null
          id: string
          insumo_id: string | null
          traspaso_id: string | null
        }
        Insert: {
          cantidad: number
          created_at?: string | null
          id?: string
          insumo_id?: string | null
          traspaso_id?: string | null
        }
        Update: {
          cantidad?: number
          created_at?: string | null
          id?: string
          insumo_id?: string | null
          traspaso_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "traspaso_insumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traspaso_insumos_traspaso_id_fkey"
            columns: ["traspaso_id"]
            isOneToOne: false
            referencedRelation: "traspasos"
            referencedColumns: ["id"]
          },
        ]
      }
      traspasos: {
        Row: {
          created_at: string | null
          estado: Database["public"]["Enums"]["estado_traspaso"] | null
          fecha: string | null
          hospital_budget_code_destino: string | null
          hospital_budget_code_origen: string | null
          hospital_display_name_destino: string | null
          hospital_display_name_origen: string | null
          id: string
          numero_traspaso: string
          observaciones: string | null
          state_name_destino: string | null
          state_name_origen: string | null
          unidad_destino: string | null
          unidad_origen: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          estado?: Database["public"]["Enums"]["estado_traspaso"] | null
          fecha?: string | null
          hospital_budget_code_destino?: string | null
          hospital_budget_code_origen?: string | null
          hospital_display_name_destino?: string | null
          hospital_display_name_origen?: string | null
          id?: string
          numero_traspaso: string
          observaciones?: string | null
          state_name_destino?: string | null
          state_name_origen?: string | null
          unidad_destino?: string | null
          unidad_origen?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          estado?: Database["public"]["Enums"]["estado_traspaso"] | null
          fecha?: string | null
          hospital_budget_code_destino?: string | null
          hospital_budget_code_origen?: string | null
          hospital_display_name_destino?: string | null
          hospital_display_name_origen?: string | null
          id?: string
          numero_traspaso?: string
          observaciones?: string | null
          state_name_destino?: string | null
          state_name_origen?: string | null
          unidad_destino?: string | null
          unidad_origen?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      unidades: {
        Row: {
          created_at: string | null
          hospital_id: string | null
          id: string
          nombre: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          hospital_id?: string | null
          id?: string
          nombre: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          hospital_id?: string | null
          id?: string
          nombre?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unidades_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitales"
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
      users: {
        Row: {
          assigned_hospitals: string | null
          created_at: string | null
          hospital_budget_code: string | null
          hospital_display_name: string | null
          id: number
          role: string
          state_name: string | null
          supervisor_group: number | null
          updated_at: string | null
          username: string
        }
        Insert: {
          assigned_hospitals?: string | null
          created_at?: string | null
          hospital_budget_code?: string | null
          hospital_display_name?: string | null
          id?: number
          role: string
          state_name?: string | null
          supervisor_group?: number | null
          updated_at?: string | null
          username: string
        }
        Update: {
          assigned_hospitals?: string | null
          created_at?: string | null
          hospital_budget_code?: string | null
          hospital_display_name?: string | null
          id?: number
          role?: string
          state_name?: string | null
          supervisor_group?: number | null
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consumir_inventario_fifo: {
        Args: { p_cantidad: number; p_consolidado_id: string }
        Returns: {
          cantidad_consumida: number
          lote_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_gerente_almacen: { Args: { _user_id: string }; Returns: boolean }
      recalcular_alerta_consolidado: {
        Args: { p_consolidado_id: string }
        Returns: undefined
      }
      recalcular_alerta_insumo: {
        Args: { p_hospital_id: string; p_insumo_catalogo_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "gerente"
        | "supervisor"
        | "lider"
        | "almacenista"
        | "auxiliar"
        | "gerente_operaciones"
        | "gerente_almacen"
        | "cadena_suministros"
        | "finanzas"
      especialidad_medica:
        | "anestesiologia"
        | "cirugia_general"
        | "traumatologia"
        | "ginecologia"
        | "urologia"
        | "otra"
      estado_folio: "activo" | "cancelado" | "completado" | "borrador"
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
        "gerente",
        "supervisor",
        "lider",
        "almacenista",
        "auxiliar",
        "gerente_operaciones",
        "gerente_almacen",
        "cadena_suministros",
        "finanzas",
      ],
      especialidad_medica: [
        "anestesiologia",
        "cirugia_general",
        "traumatologia",
        "ginecologia",
        "urologia",
        "otra",
      ],
      estado_folio: ["activo", "cancelado", "completado", "borrador"],
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
