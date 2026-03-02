import { useState, useEffect } from 'react';
import { Bell, Settings, Building2, User, Lock, Moon, Sun, LogOut } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useHospital } from '@/contexts/HospitalContext';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Notification {
  id: string;
  type: 'alerta' | 'transferencia' | 'documento' | 'pedido';
  title: string;
  message: string;
  created_at: string;
  read: boolean;
}

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedHospital } = useHospital();
  const { userRole, user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Check current theme
    const savedTheme = localStorage.getItem('theme');
    const isDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setIsDarkMode(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  useEffect(() => {
    fetchNotifications();
    
    // Set up realtime subscription for notifications
    const channel = supabase
      .channel('header-notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'alertas_transferencia'
      }, () => {
        fetchNotifications();
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'documentos_necesidades_agrupado'
      }, () => {
        fetchNotifications();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'pedidos_compra'
      }, () => {
        fetchNotifications();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userRole, selectedHospital]);

  const fetchNotifications = async () => {
    try {
      const notifs: Notification[] = [];
      
      // Fetch recent alerts based on role
      if (userRole === 'gerente_almacen' || userRole === 'cadena_suministros') {
        // Documents pending
        const { data: docs } = await supabase
          .from('documentos_necesidades_agrupado')
          .select('id, created_at, estado')
          .eq('estado', 'pendiente')
          .order('created_at', { ascending: false })
          .limit(5);
        
        docs?.forEach(doc => {
          notifs.push({
            id: `doc-${doc.id}`,
            type: 'documento',
            title: 'Documento de necesidades',
            message: 'Nuevo documento pendiente de procesar',
            created_at: doc.created_at,
            read: false
          });
        });

        // Orders pending payment
        const { data: orders } = await supabase
          .from('pedidos_compra')
          .select('id, numero_pedido, created_at, estado')
          .in('estado', ['pagado_espera_confirmacion'])
          .order('created_at', { ascending: false })
          .limit(5);
        
        orders?.forEach(order => {
          notifs.push({
            id: `order-${order.id}`,
            type: 'pedido',
            title: `Pedido ${order.numero_pedido}`,
            message: 'Pedido pagado listo para recepción',
            created_at: order.created_at,
            read: false
          });
        });
      }

      if (userRole === 'almacenista' || userRole === 'gerente_operaciones') {
        // Transfer alerts
        const { data: transfers } = await supabase
          .from('alertas_transferencia')
          .select('id, created_at, estado, hospital_id')
          .eq('estado', 'pendiente')
          .order('created_at', { ascending: false })
          .limit(5);
        
        transfers?.forEach(transfer => {
          notifs.push({
            id: `transfer-${transfer.id}`,
            type: 'transferencia',
            title: 'Transferencia pendiente',
            message: 'Nueva transferencia por recibir',
            created_at: transfer.created_at,
            read: false
          });
        });
      }

      if (userRole === 'finanzas') {
        // Orders pending payment
        const { data: orders } = await supabase
          .from('pedidos_compra')
          .select('id, numero_pedido, created_at, estado')
          .eq('estado', 'enviado_a_finanzas')
          .order('created_at', { ascending: false })
          .limit(5);
        
        orders?.forEach(order => {
          notifs.push({
            id: `order-${order.id}`,
            type: 'pedido',
            title: `Pedido ${order.numero_pedido}`,
            message: 'Pedido pendiente de aprobación de pago',
            created_at: order.created_at,
            read: false
          });
        });
      }

      // Sort by date
      notifs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      setNotifications(notifs.slice(0, 10));
      setUnreadCount(notifs.filter(n => !n.read).length);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

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
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      toast.success('Contraseña actualizada correctamente');
      setShowPasswordDialog(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar la contraseña');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleNotificationClick = (notif: Notification) => {
    // Mark as read and navigate
    switch (notif.type) {
      case 'documento':
        navigate('/almacen-central');
        break;
      case 'pedido':
        if (userRole === 'finanzas') {
          navigate('/finanzas');
        } else {
          navigate('/almacen-central');
        }
        break;
      case 'transferencia':
        navigate('/alertas-transferencia');
        break;
      case 'alerta':
        navigate('/alertas-operaciones');
        break;
    }
  };
  
  const getTitleFromPath = (path: string): string => {
    const titles: Record<string, string> = {
      '/dashboard': 'Dashboard',
      '/folios': 'Folios',
      '/insumos': 'Inventario de Insumos',
      '/medicos': 'Médicos',
      '/paquetes': 'Paquetes de Anestesia',
      '/reportes': 'Reportes',
      '/traspasos': 'Traspasos entre Unidades',
      '/usuarios': 'Gestión de Usuarios',
      '/setup': 'Configuración Inicial',
      '/alertas-operaciones': 'Alertas y Necesidades',
      '/almacen-central': 'LOAD',
      '/distribucion': 'Distribución',
      '/rutas-distribucion': 'Rutas de Distribución',
      '/almacenes-provisionales': 'Almacenes Provisionales',
      '/alertas-transferencia': 'Recepción de Insumos',
      '/finanzas': 'Finanzas',
      '/procedimientos-hospital': 'Procedimientos',
      '/supervisor-asignaciones': 'Asignación de Supervisores',
      '/registro-actividad': 'Registro de Actividad',
    };
    
    return titles[path] || 'Sistema de Anestesia';
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'documento': return '📄';
      case 'pedido': return '📦';
      case 'transferencia': return '🚚';
      case 'alerta': return '⚠️';
      default: return '🔔';
    }
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-semibold text-foreground">{getTitleFromPath(location.pathname)}</h2>
        {selectedHospital && (
          <Badge variant="outline" className="gap-2 px-3 py-1">
            <Building2 className="h-4 w-4" />
            <span className="font-medium">{selectedHospital.display_name || selectedHospital.nombre}</span>
          </Badge>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        {/* Notifications Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notificaciones</span>
              {unreadCount > 0 && (
                <Badge variant="secondary">{unreadCount} nuevas</Badge>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No hay notificaciones
              </div>
            ) : (
              notifications.map((notif) => (
                <DropdownMenuItem
                  key={notif.id}
                  className="flex flex-col items-start gap-1 p-3 cursor-pointer"
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="flex items-center gap-2 w-full">
                    <span>{getNotificationIcon(notif.type)}</span>
                    <span className="font-medium flex-1">{notif.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground pl-6">{notif.message}</span>
                  <span className="text-xs text-muted-foreground pl-6">
                    {format(new Date(notif.created_at), "d MMM, HH:mm", { locale: es })}
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Settings Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <span>{user?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
              {isDarkMode ? (
                <>
                  <Sun className="h-4 w-4 mr-2" />
                  <span>Tema Claro</span>
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4 mr-2" />
                  <span>Tema Oscuro</span>
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowPasswordDialog(true)} className="cursor-pointer">
              <Lock className="h-4 w-4 mr-2" />
              <span>Cambiar Contraseña</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Change Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Contraseña</DialogTitle>
            <DialogDescription>
              Ingresa tu nueva contraseña. Debe tener al menos 6 caracteres.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nueva Contraseña</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
              Cancelar
            </Button>
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