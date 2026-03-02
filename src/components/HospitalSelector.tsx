import { Building2, ChevronDown } from 'lucide-react';
import { useHospital } from '@/contexts/HospitalContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const HospitalSelector = () => {
  const { 
    selectedHospital, 
    availableHospitals, 
    setSelectedHospital, 
    loading,
    canSelectHospital 
  } = useHospital();

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <Building2 className="h-4 w-4 animate-pulse" />
        <span className="text-sm text-muted-foreground">Cargando...</span>
      </div>
    );
  }

  // Usuario de un solo hospital: mostrar solo info, no selector
  if (!canSelectHospital) {
    if (!selectedHospital) {
      return (
        <Alert variant="destructive" className="mx-4 my-2">
          <AlertDescription>
            No se ha asignado un hospital a tu usuario. Contacta al administrador.
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent p-3">
        <Building2 className="h-4 w-4 text-sidebar-accent-foreground" />
        <div className="flex flex-col">
          <span className="text-xs text-sidebar-accent-foreground/70">Hospital:</span>
          <span className="text-sm font-medium truncate text-sidebar-accent-foreground">{selectedHospital.display_name}</span>
        </div>
      </div>
    );
  }

  // Gerente o supervisor: mostrar selector
  if (availableHospitals.length === 0) {
    return (
      <Alert variant="destructive" className="mx-4 my-2">
        <AlertDescription>
          No hay hospitales disponibles para tu rol.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="rounded-lg bg-sidebar-accent p-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full justify-between hover:bg-sidebar-accent/50"
            size="sm"
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <Building2 className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm truncate">
                {selectedHospital 
                  ? selectedHospital.display_name 
                  : 'Seleccionar hospital'
                }
              </span>
            </div>
            <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[300px] max-h-[400px] overflow-y-auto" align="start">
          <DropdownMenuLabel>Selecciona un hospital</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {availableHospitals.map((hospital) => (
            <DropdownMenuItem
              key={hospital.budget_code}
              onClick={() => setSelectedHospital(hospital)}
              className="flex flex-col items-start cursor-pointer"
            >
              <span className="font-medium">{hospital.display_name}</span>
              <span className="text-xs text-muted-foreground">
                {hospital.state_name} • {hospital.budget_code}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {!selectedHospital && (
        <p className="text-xs text-sidebar-accent-foreground/70 mt-2">
          Debes seleccionar un hospital para continuar
        </p>
      )}
    </div>
  );
};
