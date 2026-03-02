# Guía de Exportación Completa - Sistema CB Médica Anestesia

Esta guía te permitirá clonar el sistema completo a tu propio servidor Supabase.

## Contenido del Paquete

1. **Código fuente** - Todo el código React/TypeScript está en este repositorio
2. **Edge Functions** - En `/supabase/functions/`
3. **Archivos Excel/PDF** - En `/public/`
4. **Esquema de base de datos** - Script SQL generado
5. **Datos de configuración** - Insumos, hospitales, procedimientos, etc.

---

## PASO 1: Crear Proyecto Supabase

1. Ve a [https://supabase.com](https://supabase.com)
2. Crea un nuevo proyecto
3. Anota:
   - `SUPABASE_URL` (ej: https://xxxxx.supabase.co)
   - `SUPABASE_ANON_KEY` (clave pública)
   - `SUPABASE_SERVICE_ROLE_KEY` (clave de servicio - mantener secreta)

---

## PASO 2: Ejecutar Schema de Base de Datos

Ejecuta el archivo `database_schema_export.sql` en el SQL Editor de tu nuevo proyecto Supabase.

Este archivo contiene:
- Todos los tipos ENUM
- Todas las tablas con sus columnas y constraints
- Todas las políticas RLS
- Todas las funciones y triggers

---

## PASO 3: Importar Datos

Ejecuta el archivo `database_data_export.sql` para importar:
- Catálogo de hospitales (70 hospitales)
- Catálogo de insumos (213 productos)
- Configuración de procedimientos de anestesia
- Estados/regiones
- Configuración de mínimos/máximos

---

## PASO 4: Configurar Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=tu_anon_key_aqui
VITE_SUPABASE_PROJECT_ID=tu_project_id
```

---

## PASO 5: Deploy Edge Functions

### Opción A: Supabase CLI (recomendado)

```bash
# Instalar Supabase CLI
npm install -g supabase

# Login
supabase login

# Link proyecto
supabase link --project-ref TU_PROJECT_ID

# Deploy todas las funciones
supabase functions deploy
```

### Opción B: Manual
Copia cada carpeta de `/supabase/functions/` a tu proyecto.

---

## PASO 6: Crear Usuarios

⚠️ **IMPORTANTE**: Las contraseñas no se pueden exportar porque están hasheadas.

### Opción A: Regenerar credenciales
Ejecuta la edge function `setup-all-users` para crear todos los usuarios con nuevas contraseñas:

```bash
curl -X POST https://TU_PROYECTO.supabase.co/functions/v1/setup-all-users
```

Las credenciales se generarán así:
- Username: `auxiliar01`, `lider01`, `almacenista01`, etc.
- Password: `{username}2024!` (ej: `auxiliar012024!`)

### Opción B: Crear usuarios manualmente
Usa el dashboard de Supabase → Authentication → Users

---

## PASO 7: Deploy Frontend

### Opción A: Vercel/Netlify
```bash
npm install
npm run build
# Sube la carpeta `dist` a tu hosting
```

### Opción B: Servidor propio
```bash
npm install
npm run build
# Sirve la carpeta `dist` con nginx/apache
```

---

## Estructura de Roles

| Rol | Descripción |
|-----|-------------|
| `auxiliar` | Crea folios, consume insumos |
| `lider` | Auxiliar + gestiona almacén provisional |
| `almacenista` | Gestiona inventario, recibe transferencias |
| `supervisor` | Supervisar 4 hospitales, gestionar procedimientos |
| `gerente` | Gerente de hospital individual |
| `gerente_operaciones` | Ve todas las alertas, genera documentos consolidados |
| `gerente_almacen` | Gestiona almacén central, pedidos a proveedores |
| `cadena_suministros` | Distribuye de almacén central a hospitales |
| `finanzas` | Aprueba pagos de pedidos |

---

## Archivos Importantes

| Archivo | Contenido |
|---------|-----------|
| `/public/tabla_procedimientos_por_hospital.xlsx` | Procedimientos autorizados por hospital |
| `/public/usuarios_lovable_generados.xlsx` | Lista de usuarios del sistema |
| `/src/constants/procedimientosCatalog.ts` | Catálogo de procedimientos de anestesia |

---

## Troubleshooting

### Error: "RLS policy violation"
- Verifica que el usuario tenga el rol correcto en `user_roles`
- Verifica que el `hospital_id` del perfil sea correcto

### Error: "Duplicate key"
- La restricción `UNIQUE` en `insumos_catalogo.nombre` previene duplicados
- Limpia datos duplicados antes de importar

### Usuarios no pueden loguearse
- Verifica que existan en `auth.users`
- Verifica que tengan entrada en `profiles` y `user_roles`

---

## Soporte

Este sistema fue desarrollado para CB Médica.
Para soporte técnico, contacta al equipo de desarrollo.
