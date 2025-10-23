import { Card } from '@/components/ui/card';
import { Clock, Navigation } from 'lucide-react';

interface TripSummaryProps {
  duration: number; // em segundos
  distance: number; // em metros
}

export const TripSummary = ({ duration, distance }: TripSummaryProps) => {
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes}min`;
  };

  const formatDistance = (meters: number) => {
    const km = meters / 1000;
    return `${km.toFixed(1)} km`;
  };

  return (
    <Card className="p-4 bg-primary/10 border-primary/20 animate-fade-in">
      <h3 className="font-semibold text-foreground mb-3">Resumo da Viagem</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Duração</p>
            <p className="text-lg font-bold text-foreground">{formatDuration(duration)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <Navigation className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Distância</p>
            <p className="text-lg font-bold text-foreground">{formatDistance(distance)}</p>
          </div>
        </div>
      </div>
    </Card>
  );
};
