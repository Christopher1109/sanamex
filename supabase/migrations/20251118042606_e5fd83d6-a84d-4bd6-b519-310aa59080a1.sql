-- Cambiar las columnas tipo_anestesia de ENUM a TEXT para permitir cualquier valor
ALTER TABLE folios ALTER COLUMN tipo_anestesia TYPE text;
ALTER TABLE paquetes_anestesia ALTER COLUMN tipo TYPE text;

-- Eliminar el enum antiguo si existe
DROP TYPE IF EXISTS tipo_anestesia CASCADE;