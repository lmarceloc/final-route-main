import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Delivery } from '@/types/delivery';
import { toast } from 'sonner';
import { Copy, MapPin } from 'lucide-react';

interface EditDeliveryDialogProps {
  delivery: Delivery | null;
  onUpdate: (updatedDelivery: Delivery) => void;
  onOpenChange: (open: boolean) => void;
}

export const EditDeliveryDialog = ({ delivery, onUpdate, onOpenChange }: EditDeliveryDialogProps) => {
  const [address, setAddress] = useState('');
  const [orderType, setOrderType] = useState('');
  const [stopType, setStopType] = useState('Entrega');
  const [timeAtStop, setTimeAtStop] = useState(5);

  useEffect(() => {
    if (delivery) {
      setAddress(delivery.address || '');
      setOrderType(delivery.order_type || 'Automática');
      setStopType(delivery.stop_type || 'Entrega');
      setTimeAtStop(delivery.time_at_stop || 5);
    }
  }, [delivery]);

  if (!delivery) return null;

  const handleUpdate = async () => {
    onUpdate({
      ...delivery,
      address,
      order_type: orderType as any,
      stop_type: stopType as any,
      time_at_stop: timeAtStop,
    });
    toast.success('Parada atualizada com sucesso!');
    onOpenChange(false);
  };

  return (
    <Dialog open={!!delivery} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader className="flex flex-row justify-between items-center">
          <DialogTitle>Editar parada</DialogTitle>
          <Button variant="ghost" onClick={handleUpdate}>Concluído</Button>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <p className="font-semibold">{delivery.address}</p>
          </div>

          <div className="space-y-2">
            <Label>Ordem</Label>
            <ToggleGroup type="single" value={orderType} onValueChange={setOrderType}>
              <ToggleGroupItem value="Primeira">Primeira</ToggleGroupItem>
              <ToggleGroupItem value="Automática">Automática</ToggleGroupItem>
              <ToggleGroupItem value="Última">Última</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-2">
            <Label>Tipo</Label>
            <ToggleGroup type="single" value={stopType} onValueChange={setStopType}>
              <ToggleGroupItem value="Entrega">Entrega</ToggleGroupItem>
              <ToggleGroupItem value="Coleta">Coleta</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-2">
            <Label>Tempo na parada (minutos)</Label>
            <Input type="number" value={timeAtStop} onChange={(e) => setTimeAtStop(Number(e.target.value))} />
          </div>

        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
            <Button variant="outline">
                <MapPin className="mr-2 h-4 w-4" />
                Mudar endereço
            </Button>
            <Button variant="outline">
                <Copy className="mr-2 h-4 w-4" />
                Duplicar parada
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditDeliveryDialog;
