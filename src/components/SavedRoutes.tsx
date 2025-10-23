import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Delivery } from '@/types/delivery';

interface SavedRoute {
  name: string;
  deliveries: Delivery[];
  profile: string;
  timestamp: number;
}

interface SavedRoutesProps {
  onLoad: (route: SavedRoute) => void;
}

export const SavedRoutes = ({ onLoad }: SavedRoutesProps) => {
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);

  useEffect(() => {
    loadSavedRoutes();
  }, []);

  const loadSavedRoutes = () => {
    const routes = localStorage.getItem('savedRoutes');
    if (routes) {
      setSavedRoutes(JSON.parse(routes));
    }
  };

  const handleDelete = (name: string) => {
    const updatedRoutes = savedRoutes.filter(r => r.name !== name);
    localStorage.setItem('savedRoutes', JSON.stringify(updatedRoutes));
    setSavedRoutes(updatedRoutes);
    toast.info('Rota deletada');
  };

  const handleLoad = (route: SavedRoute) => {
    onLoad(route);
    toast.success(`Rota "${route.name}" carregada!`);
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">
        Rotas Salvas ({savedRoutes.length})
      </h3>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {savedRoutes.length === 0 ? (
          <Card className="p-4">
            <p className="text-sm text-muted-foreground text-center">
              Nenhuma rota salva
            </p>
          </Card>
        ) : (
          savedRoutes.map((route) => (
            <Card key={route.name} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm truncate">{route.name}</h4>
                  <p className="text-xs text-muted-foreground">
                    {route.deliveries.length} paradas • {route.profile}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleLoad(route)}
                    className="h-7 w-7 p-0"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(route.name)}
                    className="h-7 w-7 p-0 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
