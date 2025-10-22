import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Plus, Upload, Loader2 } from 'lucide-react';
import { Delivery } from '@/types/delivery';
import { supabase } from '@/integrations/supabase/client';
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
  const [isProcessingInvoice, setIsProcessingInvoice] = useState(false);

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

  const handleInvoiceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  try {
    const xmlFiles = await Promise.all(
      Array.from(files).map(async file => ({
        name: file.name,
        fileData: await file.text(),
        fileType: "xml"
      }))
    );

    const { data, error } = await supabase.functions.invoke("process-invoice", {
      body: { files: xmlFiles }
    });

    if (error || data?.error) {
      toast.error("Erro ao processar nota fiscal", { description: error?.message || data?.error });
      return;
    }

    if (data.sameOrigin && data.origin && data.destinations.length > 0) {
      const deliveriesToAdd = [
        { type: "origin", address: data.origin.address },
        ...data.destinations.map((d: any) => ({
          type: "stop",
          address: d.address,
        })),
      ];
      onAdd(deliveriesToAdd);
      toast.success(`Foram adicionadas ${data.destinations.length} entregas com origem única.`);
    } else {
      toast.error("Não foi possível identificar origem única entre as notas.");
    }
  } catch (err: any) {
    console.error("Erro geral ao processar NFs:", err);
    toast.error("Erro ao processar notas fiscais", { description: err.message });
  }
};


    return (
      <Card className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Upload de Nota Fiscal */}
          <div className="space-y-2 pb-4 border-b border-border">
            <Label htmlFor="invoice" className="text-sm font-medium">
              Nota Fiscal (opcional)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="invoice"
                type="file"
                accept=".pdf,.xml,image/*"
                onChange={handleInvoiceUpload}
                disabled={isProcessingInvoice}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('invoice')?.click()}
                disabled={isProcessingInvoice}
                className="w-full"
              >
                {isProcessingInvoice ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processando nota fiscal...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload NF (extrai origem e destino)
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Envie uma nota fiscal ( XML ) para extrair origem e destino automaticamente
            </p>
          </div>

          <div className="space-y-2 pt-4 border-t border-border">
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
