import { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types';

export interface TabDef {
  id: string;
  label: string;
  content: ReactNode;
  roles?: UserRole[];
}

interface Props {
  title?: string;
  tabs: TabDef[];
  defaultTab?: string;
}

export const TabShell = ({ title, tabs, defaultTab }: Props) => {
  const { userRole } = useAuth();
  const [params, setParams] = useSearchParams();
  const allowed = tabs.filter(t => !t.roles || (userRole && t.roles.includes(userRole)));

  if (allowed.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No tienes permisos para esta sección.
      </div>
    );
  }

  const current = params.get('tab');
  const active = allowed.find(t => t.id === current)?.id ?? defaultTab ?? allowed[0].id;

  const onChange = (v: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', v);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      {title && <h1 className="text-2xl font-bold tracking-tight">{title}</h1>}
      <Tabs value={active} onValueChange={onChange}>
        <TabsList className="h-auto flex-wrap justify-start">
          {allowed.map(t => (
            <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
        {allowed.map(t => (
          <TabsContent key={t.id} value={t.id} className="mt-4 focus-visible:ring-0">
            {t.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default TabShell;
