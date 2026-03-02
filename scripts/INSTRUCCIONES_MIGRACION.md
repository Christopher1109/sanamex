# 🚀 Guía de Migración Completa a Supabase Propio

## Requisitos Previos

1. Crear cuenta en [Supabase](https://supabase.com)
2. Crear un nuevo proyecto
3. Obtener las credenciales:
   - Project URL
   - Anon Key
   - Service Role Key

---

## Paso 1: Exportar Datos desde Lovable Cloud

### Método Automático (Recomendado)

Llamar al Edge Function de exportación:

```bash
curl -X POST "https://nkwoiqlddngzvtrpmetu.supabase.co/functions/v1/export-database" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rd29pcWxkZG5nenZ0cnBtZXR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTYxODEsImV4cCI6MjA3ODAzMjE4MX0.OH4j3Bw7NacxIiIEmhDHeLcVLA36_4qlFhY__o-xuAk" \
  -o database_export.json
```

Esto descargará un archivo JSON con TODOS los datos (~30MB).

---

## Paso 2: Ejecutar Schema en tu Supabase

1. Ve al **SQL Editor** de tu proyecto Supabase
2. Copia y pega el contenido de `scripts/migracion_completa.sql`
3. Ejecuta el script

---

## Paso 3: Importar Datos

### Opción A: Usando Edge Function (tu Supabase)

1. Copia `supabase/functions/import-database/index.ts` a tu proyecto
2. Despliega la función
3. Ejecuta:

```bash
curl -X POST "https://TU-PROYECTO.supabase.co/functions/v1/import-database" \
  -H "Authorization: Bearer TU_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d @database_export.json
```

### Opción B: Manualmente via SQL Editor

El archivo `database_export.json` contiene arrays por tabla. Puedes convertirlos a INSERTs con cualquier herramienta JSON-to-SQL.

---

## Paso 4: Crear Usuarios de Auth

Los usuarios en `auth.users` NO se pueden exportar (contraseñas hasheadas).

**Opciones:**

1. **Usar el Edge Function `setup-all-users`**: Recrea todos los usuarios con contraseñas estándar
2. **Reset de passwords**: Los usuarios harán "Olvidé mi contraseña"

Credenciales estándar generadas por setup-all-users:
- Email: `{username}@cbmedica.com`
- Password: `{role}.{hospital_code}2024`

---

## Paso 5: Configurar tu App

Actualiza las variables de entorno:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=tu-anon-key
```

---

## Paso 6: Verificar

1. Abre tu app con las nuevas credenciales
2. Intenta iniciar sesión
3. Verifica que los datos aparecen correctamente

---

## Estructura de Datos Exportados

| Tabla | Registros Aprox |
|-------|-----------------|
| inventario_lotes | 9,262 |
| inventario_consolidado | 4,452 |
| documento_segmentado_detalle | 3,261 |
| documento_agrupado_detalle | 1,398 |
| movimientos_almacen_provisional | 964 |
| insumos_alertas | 934 |
| anestesia_insumos | 765 |
| profiles | 243 |
| user_roles | 243 |
| insumos_catalogo | 213 |
| hospitales | 21 |
| states | 30 |

---

## Solución de Problemas

| Error | Solución |
|-------|----------|
| "duplicate key" | Trunca la tabla primero |
| "violates foreign key" | Importa tablas padre antes |
| "RLS violation" | Desactiva RLS temporalmente |

```sql
-- Desactivar RLS temporalmente
ALTER TABLE nombre_tabla DISABLE ROW LEVEL SECURITY;
-- Importar datos...
-- Reactivar RLS
ALTER TABLE nombre_tabla ENABLE ROW LEVEL SECURITY;
```
