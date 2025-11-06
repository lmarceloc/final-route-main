import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Plus, Loader2 } from 'lucide-react';
import { Delivery } from '@/types/delivery';
import { toast } from 'sonner';
import { geocodeAddress } from '@/components/geocode';

interface AddDeliveryFormProps {
  onAdd: (delivery: Omit<Delivery, 'id' | 'priority'> | Omit<Delivery, 'id' | 'priority'>[], isUrgent?: boolean) => void;
}

export const AddDeliveryForm = ({ onAdd }: AddDeliveryFormProps) => {
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [type, setType] = useState<Delivery['type']>('stop');
  const [isUrgent, setIsUrgent] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!address) return;

    let coordinates: [number, number] | undefined =
      lat && lng ? [parseFloat(lat), parseFloat(lng)] : undefined;

    // If no coordinates, try to geocode the address
    if (!coordinates && address) {
      setIsGeocoding(true);
      try {
        const geocoded = await geocodeAddress(address);
        if (geocoded) {
          coordinates = [geocoded.lat, geocoded.lng];
          toast.info('Endereço localizado no mapa!');
        }
      } finally {
        setIsGeocoding(false);
      }
    }

    onAdd({
      address,
      coordinates,
      type,
      isUrgent,
    }, isUrgent);

    setAddress('');
    setLat('');
    setLng('');
    setType('stop');
    setIsUrgent(false);
  };

    return (
      <Card className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address">Endereço Completo</Label>
            <Input
              id="address"
              placeholder="Ex: R. Cel. Francisco Ribas, 1012 - Centro, Ponta Grossa - PR, 84010-260"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lat">Latitude (opcional)</Label>
              <Input
                id="lat"
                type="number"
                step="any"
                placeholder="-23.550520"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lng">Longitude (opcional)</Label>
              <Input
                id="lng"
                type="number"
                step="any"
                placeholder="-46.633308"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Se não informar, usaremos o endereço para localizar no mapa
          </p>

          <div className="space-y-2">
            <Label htmlFor="type">Tipo</Label>
            <Select value={type} onValueChange={(value: Delivery['type']) => setType(value)}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="origin" className="focus:bg-blue-100 dark:focus:bg-blue-800">Origem</SelectItem>
                <SelectItem value="stop" className="focus:bg-blue-100 dark:focus:bg-blue-800">Parada</SelectItem>
                <SelectItem value="destination" className="focus:bg-blue-100 dark:focus:bg-blue-800">Destino Final</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === 'stop' && (
            <div className="flex items-center space-x-2">
              <Checkbox id="urgent" checked={isUrgent} onCheckedChange={(checked) => setIsUrgent(!!checked)} />
              <label
                htmlFor="urgent"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Marcar como entrega urgente (fixar após a origem)
              </label>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isGeocoding}>
            {isGeocoding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Geocodificando...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Entrega
              </>
            )}
          </Button>
        </form>
      </Card>
    );
  };
