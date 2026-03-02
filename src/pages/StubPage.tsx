import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface StubPageProps {
  title: string;
  description: string;
}

const StubPage = ({ title, description }: StubPageProps) => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
    </div>
    <Card>
      <CardHeader><CardTitle>Módulo en desarrollo</CardTitle></CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Este módulo está listo para ser implementado. La estructura de base de datos ya está configurada.</p>
      </CardContent>
    </Card>
  </div>
);

export default StubPage;
