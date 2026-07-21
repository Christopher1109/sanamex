import { useNavigate } from 'react-router-dom';
import { Building2, Monitor, Warehouse } from 'lucide-react';
import sanamexLogo from '@/assets/sanamex-logo.png.asset.json';
import { UserRole } from '@/types';

interface AreaSelectorPageProps {
  userRole: UserRole;
  onSelect: () => void;
}

interface AreaCard {
  key: 'administrativo' | 'operativo' | 'almacen';
  label: string;
  description: string;
  icon: typeof Building2;
  path: string;
}

const AREAS: AreaCard[] = [
  {
    key: 'administrativo',
    label: 'Administrativo',
    description: 'Contabilidad, cuentas por pagar, facturación, nómina y reportes.',
    icon: Building2,
    path: '/dashboard',
  },
  {
    key: 'operativo',
    label: 'Operativo',
    description: 'Punto de venta — entra directo a cobrar y facturar.',
    icon: Monitor,
    path: '/pos',
  },
  {
    key: 'almacen',
    label: 'Almacén',
    description: 'Inventario, traspasos, recepción de mercancía y kardex.',
    icon: Warehouse,
    path: '/inventario',
  },
];

// Pantalla de entrada tras el login: acceso rápido a las 3 zonas del sistema.
// NO es un candado de permisos — el sidebar completo sigue disponible después
// y los permisos reales por módulo se siguen aplicando vía useModuleAccess.
// Pendiente (cliente): definir si algunas áreas se ocultan según rol una vez
// que Alejandro confirme qué necesita ver administración del lado operativo.
export default function AreaSelectorPage({ onSelect }: AreaSelectorPageProps) {
  const navigate = useNavigate();

  const handleSelect = (area: AreaCard) => {
    onSelect();
    navigate(area.path, { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <img
        src={sanamexLogo.url}
        alt="Sanamex"
        className="mb-8 h-16 w-auto rounded-xl object-contain shadow-sm"
      />
      <h1 className="mb-2 text-center text-2xl font-bold text-foreground">
        ¿A qué área quieres entrar?
      </h1>
      <p className="mb-10 text-center text-sm text-muted-foreground">
        Puedes cambiar de área o abrir cualquier módulo desde el menú lateral en cualquier momento.
      </p>
      <div className="grid w-full max-w-4xl grid-cols-1 gap-5 sm:grid-cols-3">
        {AREAS.map((area) => {
          const Icon = area.icon;
          return (
            <button
              key={area.key}
              onClick={() => handleSelect(area)}
              className="group flex flex-col items-center rounded-2xl border border-border bg-card p-8 text-center shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                <Icon className="h-8 w-8 text-primary" />
              </div>
              <h2 className="mb-1 text-lg font-semibold text-foreground">{area.label}</h2>
              <p className="text-sm text-muted-foreground">{area.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
