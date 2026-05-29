import { useState, useEffect } from 'react';
import { Settings, User, Lock, Moon, Sun, Wifi, WifiOff, RefreshCw, CloudUpload } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useSucursal } from '@/contexts/SucursalContext';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { NotificacionesBell } from '@/components/NotificacionesBell';

const formatRelative = (iso: string | null) => {
  if (!iso) return 'nunca';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
};

const SyncIndicator = () => {
  const { status, lastSync, pendingCount, syncing, runSync } = useOfflineSync();
  const isOffline = status === 'offline';

  if (!isOffline && pendingCount === 0 && !syncing) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          {syncing ? (
            <RefreshCw className="h-5 w-5 animate-spin text-primary" />
          ) : isOffline ? (
            <WifiOff className="h-5 w-5 text-destructive" />
          ) : (
            <CloudUpload className="h-5 w-5 text-warning" />
          )}
          {pendingCount > 0 && !syncing && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {pendingCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          {syncing ? <RefreshCw className="h-4 w-4 animate-spin text-primary" /> : isOffline ? <WifiOff className="h-4 w-4 text-destructive" /> : <Wifi className="h-4 w-4 text-primary" />}
          <span>{syncing ? 'Sincronizando…' : isOffline ? 'Modo offline' : 'Conectado'}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-3 py-2 text-xs text-muted-foreground">
          Última sincronización: {formatRelative(lastSync)}
        </div>
        {pendingCount > 0 && (
          <div className="px-3 py-2 text-xs text-warning">
            {pendingCount} venta(s) pendiente(s) de subir
          </div>
        )}
        <DropdownMenuItem
          onClick={runSync}
          disabled={syncing || isOffline}
          className="cursor-pointer"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Sincronizar ahora
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const Header = () => {
  const location = useLocation();
  const { selectedSucursal } = useSucursal();
  const { user } = useAuth();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const isDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setIsDarkMode(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDarkMode;
    setIsDarkMode(newIsDark);
    localStorage.setItem('theme', newIsDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', newIsDark);
    toast.success(`Tema ${newIsDark ? 'oscuro' : 'claro'} activado`);
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Contraseña actualizada correctamente');
      setShowPasswordDialog(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar la contraseña');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const titles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/productos': 'Productos',
    '/proveedores': 'Proveedores',
    '/clientes': 'Clientes',
    '/inventario': 'Inventario',
    '/kardex': 'Kardex',
    '/traspasos': 'Traspasos',
    '/ajustes': 'Ajustes / Mermas',
    '/pos': 'Punto de Venta',
    '/ventas': 'Historial de Ventas',
    '/rutas': 'Rutas',
    '/cortes': 'Cortes de Caja',
    '/bolsas-valores': 'Bolsas de Valores',
    '/conciliacion': 'Conciliación Bancaria',
    '/reportes': 'Reportes',
    '/usuarios': 'Usuarios',
    '/auditoria': 'Auditoría',
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-semibold text-foreground">
          {titles[location.pathname] || 'Distribuidora'}
        </h2>
        {selectedSucursal && (
          <Badge variant="outline" className="gap-2 px-3 py-1">
            <span className="font-medium">{selectedSucursal.codigo} — {selectedSucursal.nombre}</span>
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        <NotificacionesBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span className="truncate">{user?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
              {isDarkMode ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
              <span>{isDarkMode ? 'Tema Claro' : 'Tema Oscuro'}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowPasswordDialog(true)} className="cursor-pointer">
              <Lock className="h-4 w-4 mr-2" />
              <span>Cambiar Contraseña</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Contraseña</DialogTitle>
            <DialogDescription>Ingresa tu nueva contraseña (mínimo 6 caracteres).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nueva Contraseña</Label>
              <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Contraseña</Label>
              <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>Cancelar</Button>
            <Button onClick={handleChangePassword} disabled={isChangingPassword}>
              {isChangingPassword ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
};

export default Header;
