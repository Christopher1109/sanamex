#!/bin/bash
# ============================================================
# Script de Exportación Completa - CB Médica Anestesia
# ============================================================

echo "=== Exportación del Sistema CB Médica ==="
echo ""

# Configuración - MODIFICAR ESTOS VALORES
SUPABASE_PROJECT_ID="nkwoiqlddngzvtrpmetu"
SUPABASE_DB_PASSWORD="TU_PASSWORD_AQUI"

# URL de conexión
DB_URL="postgresql://postgres.${SUPABASE_PROJECT_ID}:${SUPABASE_DB_PASSWORD}@aws-0-us-west-1.pooler.supabase.com:6543/postgres"

# Crear directorio de exportación
EXPORT_DIR="./export_$(date +%Y%m%d_%H%M%S)"
mkdir -p $EXPORT_DIR

echo "Directorio de exportación: $EXPORT_DIR"
echo ""

# 1. Exportar schema
echo "1. Exportando schema..."
pg_dump "$DB_URL" --schema-only --no-owner --no-privileges > "$EXPORT_DIR/schema.sql"

# 2. Exportar datos de tablas de configuración
echo "2. Exportando datos de configuración..."

TABLES=(
  "states"
  "hospitales" 
  "insumos_catalogo"
  "insumo_configuracion"
  "anestesia_insumos"
  "almacenes"
  "users"
  "rutas_distribucion"
  "rutas_hospitales"
  "hospital_procedimientos"
)

for table in "${TABLES[@]}"; do
  echo "   - $table"
  psql "$DB_URL" -c "\COPY public.$table TO '$EXPORT_DIR/$table.csv' WITH CSV HEADER"
done

# 3. Exportar datos operativos (opcional)
echo ""
echo "3. ¿Exportar datos operativos? (inventario, alertas, folios)"
read -p "   (s/n): " EXPORT_OPERATIONAL

if [ "$EXPORT_OPERATIONAL" = "s" ]; then
  OPERATIONAL_TABLES=(
    "inventario_hospital"
    "insumos_alertas"
    "folios"
    "folios_insumos"
    "movimientos_inventario"
    "almacen_central"
  )
  
  for table in "${OPERATIONAL_TABLES[@]}"; do
    echo "   - $table"
    psql "$DB_URL" -c "\COPY public.$table TO '$EXPORT_DIR/$table.csv' WITH CSV HEADER"
  done
fi

# 4. Copiar código fuente
echo ""
echo "4. Copiando código fuente..."
cp -r ../src "$EXPORT_DIR/src"
cp -r ../public "$EXPORT_DIR/public"
cp -r ../supabase "$EXPORT_DIR/supabase"
cp ../package.json "$EXPORT_DIR/"
cp ../vite.config.ts "$EXPORT_DIR/"
cp ../tailwind.config.ts "$EXPORT_DIR/"
cp ../index.html "$EXPORT_DIR/"

# 5. Crear archivo de instrucciones
echo ""
echo "5. Generando instrucciones..."
cat > "$EXPORT_DIR/INSTRUCCIONES.txt" << 'EOF'
=== INSTRUCCIONES DE IMPORTACIÓN ===

1. Crear nuevo proyecto en Supabase
2. Ejecutar schema.sql en SQL Editor
3. Importar CSVs via Table Editor o psql
4. Configurar variables de entorno
5. Deployar Edge Functions
6. Crear usuarios en Authentication

Ver EXPORTACION_COMPLETA.md para detalles.
EOF

echo ""
echo "=== Exportación completada ==="
echo "Archivos en: $EXPORT_DIR"
echo ""
echo "Comprimir con: tar -czvf export.tar.gz $EXPORT_DIR"
