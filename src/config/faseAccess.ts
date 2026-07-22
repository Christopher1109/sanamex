// Control de acceso Fase 2 (operativa) basado en rol.
//
// Reemplaza al flag global FASE_2_VISIBLE — ese flag queda como
// fallback documental por 1 sprint (no se usa para ocultar rutas).
//
// Fase 2 = módulos operativos (productos, inventario, POS, compras,
// pedidos, traspasos, mermas, catálogos comerciales, reportes ops...).
// Se expone a roles operativos y administradores. Se OCULTA a los
// roles puramente financieros (contador, contraloría, tesorería) que
// solo trabajan sobre Fase 1 administrativa.
import { UserRole } from '@/types';

const FASE2_ROLES: UserRole[] = [
  'super_admin',
  'admin',
  'gerente',
  'subgerente',
  'supervisor',
  'ventas',
  'almacen',
  'almacen_ventas',
  'repartidor',
  'auditoria',
];

export const canAccessFase2 = (role: UserRole | null | undefined): boolean => {
  if (!role) return false;
  return FASE2_ROLES.includes(role);
};

// Nivel gerencial hacia arriba: puede modificar precios de venta (ej. precio
// especial por lote en Caducidades). Vendedores y almacenistas NO — solo
// operan el sistema con lo que ya está definido. Pedido de Alejandro,
// sesión 21-jul-2026.
const ROLES_GERENCIA_O_SUPERIOR: UserRole[] = [
  'super_admin',
  'admin',
  'gerente',
  'subgerente',
];

export const canEditarPreciosLote = (role: UserRole | null | undefined): boolean => {
  if (!role) return false;
  return ROLES_GERENCIA_O_SUPERIOR.includes(role);
};
