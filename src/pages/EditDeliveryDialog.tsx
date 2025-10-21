import { useState, useEffect } from 'react';
import { Delivery } from '@/types/delivery';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface EditDeliveryDialogProps {
  delivery: Delivery | null;
  onUpdate: (updatedDelivery: Delivery) => void;
  onOpenChange: (open: boolean) => void;
}

const EditDeliveryDialog = ({ delivery, onUpdate, onOpenChange }: EditDeliveryDialogProps) => {
  const [formData, setFormData] = useState<Partial<Delivery>>({});

  useEffect(() => {
    if (delivery) {
      setFormData({
        ...delivery,
        // Leaflet usa [lat, lng], então garantimos a ordem correta
        lat: delivery.coordinates?.[0],
        lng: delivery.coordinates?.[1],
      });
    }
  }, [delivery]);

  if (!delivery) return null;

  const handleChange = (field: keyof Delivery | 'lat' | 'lng', value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    const lat = parseFloat(formData.lat as any);
    const lng = parseFloat(formData.lng as any);

    const updatedDelivery: Delivery = {
      ...delivery,
      ...formData,
      coordinates: !isNaN(lat) && !isNaN(lng) ? [lat, lng] : delivery.coordinates,
    };

    // Salvar no Supabase
    const { error } = await supabase
      .from('deliveries')
      .update({
        address: updatedDelivery.address,
        type: updatedDelivery.type,
        is_urgent: updatedDelivery.is_urgent,
        coordinates: updatedDelivery.coordinates,
      })
      .eq('id', updatedDelivery.id);

    if (error) {
      toast.error('Falha ao atualizar entrega.', { description: error.message });
    } else {
      onUpdate(updatedDelivery);
      toast.success('Entrega atualizada com sucesso!');
    }
  };

  return (
    <Dialog open={!!delivery} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Entrega</DialogTitle>
          {/* 1. Correção do aviso de acessibilidade */}
          <DialogDescription>
            Edite os detalhes da entrega aqui. Clique em salvar quando terminar.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="address">Endereço</Label>
            <Input id="address" value={formData.address || ''} onChange={(e) => handleChange('address', e.target.value)} />
          </div>

          {/* 3. Adição dos campos de Latitude e Longitude */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lat">Latitude</Label>
              <Input id="lat" type="number" step="any" value={formData.lat || ''} onChange={(e) => handleChange('lat', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lng">Longitude</Label>
              <Input id="lng" type="number" step="any" value={formData.lng || ''} onChange={(e) => handleChange('lng', e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Tipo</Label>
            <Select value={formData.type} onValueChange={(value: Delivery['type']) => handleChange('type', value)}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* 2. Correção da cor de hover */}
                <SelectItem value="origin" className="focus:bg-blue-100 dark:focus:bg-blue-800">Origem</SelectItem>
                <SelectItem value="stop" className="focus:bg-blue-100 dark:focus:bg-blue-800">Parada</SelectItem>
                <SelectItem value="destination" className="focus:bg-blue-100 dark:focus:bg-blue-800">Destino Final</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.type === 'stop' && (
            <div className="flex items-center space-x-2">
              <Checkbox id="urgent" checked={formData.is_urgent} onCheckedChange={(checked) => handleChange('is_urgent', !!checked)} />
              <label htmlFor="urgent" className="text-sm font-medium">Marcar como entrega urgente</label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={handleSave}>Salvar Alterações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditDeliveryDialog;