import { useState, useEffect } from "react";
import { SidebarProvider, Sidebar } from "@/components/ui/sidebar";
import { AddDeliveryForm } from "@/components/AddDeliveryForm";
import { DeliveryList } from "@/components/DeliveryList";
import { DeliveryMap } from "@/components/DeliveryMap";
import EditDeliveryDialog from "@/components/EditDeliveryDialog";
import { Delivery } from "@/types/delivery";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Zap, Loader2 } from "lucide-react";
import { DropResult } from "react-beautiful-dnd";
import { toast } from "sonner";
import { Database } from "@/integrations/supabase/types";

interface RouteSummary {
  stops: number;
  distance: number;
  city: string;
}

type SupabaseDelivery = Database['public']['Tables']['deliveries']['Row'];

const mapSupabaseToDelivery = (supabaseDelivery: SupabaseDelivery): Delivery => {
  const { coordinates, ...rest } = supabaseDelivery;

  let parsedCoords: [number, number] | undefined = undefined;

  if (Array.isArray(coordinates) && coordinates.length === 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    // Caso 1: Formato ideal -> [lat, lng]
    parsedCoords = [coordinates[0], coordinates[1]];
  } else if (typeof coordinates === 'string') {
    try {
      // Caso 2: String JSON -> "[-23.55, -46.63]"
      const parsed = JSON.parse(coordinates);
      if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === 'number' && typeof parsed[1] === 'number') {
        parsedCoords = [parsed[0], parsed[1]];
      }
    } catch (e) {
      // Não faz nada, apenas ignora o erro de parsing
    }
  } else if (typeof coordinates === 'object' && coordinates !== null) {
    // Caso 3: Objeto -> { lat: number, lng: number } ou { latitude: number, longitude: number }
    const lat = (coordinates as any).lat ?? (coordinates as any).latitude;
    const lng = (coordinates as any).lng ?? (coordinates as any).lon ?? (coordinates as any).longitude;
    if (typeof lat === 'number' && typeof lng === 'number') {
      parsedCoords = [lat, lng];
    }
  }

  return {
    ...rest,
    coordinates: parsedCoords,
  };
};

const Index = () => {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [editingDelivery, setEditingDelivery] = useState<Delivery | null>(null);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  useEffect(() => {
    const fetchDeliveries = async () => {
      const { data, error } = await supabase.from("deliveries").select("*");
      if (error) {
        console.error("Error fetching deliveries:", error);
      } else {
        const mappedData = (data || []).map(mapSupabaseToDelivery);
        console.log("Dados de entrega mapeados para o mapa:", mappedData);
        setDeliveries(mappedData); 
      }
    };

    fetchDeliveries();
  }, []);

  const handleAddDelivery = async (
    deliveryOrDeliveries: Omit<Delivery, 'id' | 'priority'> | Omit<Delivery, 'id' | 'priority'>[],
  ) => {
    const newDeliveries = Array.isArray(deliveryOrDeliveries)
      ? deliveryOrDeliveries
      : [deliveryOrDeliveries];

    // Prepara os dados para inserção no Supabase
    const deliveriesToInsert = newDeliveries.map(d => ({
      address: d.address,
      coordinates: d.coordinates,
      type: d.type,
      is_urgent: Boolean((d as any).isUrgent), 
    }));

    const { data: insertedDeliveries, error } = await supabase
      .from('deliveries')
      .insert(deliveriesToInsert)
      .select();

    if (error) {
      toast.error("Falha ao adicionar entrega.", { description: error.message });
    } else if (insertedDeliveries) {
      const newMappedDeliveries = insertedDeliveries.map(mapSupabaseToDelivery);
      setDeliveries(prevDeliveries => [...prevDeliveries, ...newMappedDeliveries]);
      toast.success("Entrega adicionada com sucesso!");
    }
  };

  const handleEdit = (delivery: Delivery) => {
    setEditingDelivery(delivery);
  };

  const handleUpdate = (updatedDelivery: Delivery) => {
    setDeliveries(
      deliveries.map((d) => (d.id === updatedDelivery.id ? updatedDelivery : d))
    );
    setEditingDelivery(null);
  };

  const handleRemove = async (id: string) => {
    const { error } = await supabase.from("deliveries").delete().eq("id", id);
    if (error) {
      console.error("Error deleting delivery:", error);
    } else {
      setDeliveries(deliveries.filter((d) => d.id !== id));
    }
  };

  const handleReorder = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(deliveries);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setDeliveries(items);
  };

  const handleOptimizeRoute = async () => {
    if (deliveries.length < 2) {
      toast.error("Adicione pelo menos 2 entregas para otimizar a rota.");
      return;
    }
    setIsOptimizing(true);
    setRouteSummary(null);

    try {
      const { data, error } = await supabase.functions.invoke('optimize-route', {
        body: { deliveries, fixDestinationAtEnd: true },
      });

      if (error) throw error;

      const { optimizedOrder } = data;
      const reorderedDeliveries = optimizedOrder.map((id: string) =>
        deliveries.find((d) => d.id === id)
      ).filter(Boolean) as Delivery[]; // Garantindo a tipagem aqui

      setDeliveries(reorderedDeliveries);

      const cities = new Set(
        reorderedDeliveries
          .map(d => {
            const parts = d.address.split(',').map(p => p.trim());
            // Assumindo que a cidade é a penúltima parte do endereço
            return parts.length > 1 ? parts[parts.length - 2] : null;
          })
          .filter((city): city is string => city !== null)
      );

      setRouteSummary({
        stops: reorderedDeliveries.length,
        // Simula o cálculo da distância
        distance: Math.round(Math.random() * 50 * 10) / 10,
        city: cities.size === 1 ? [...cities][0] : "Rotas Brasil",
      });

      toast.success("Rota otimizada com sucesso!");
    } catch (error: any) {
      console.error("Error optimizing route:", error);
      toast.error("Falha ao otimizar a rota.", {
        description: error.message,
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
        <Sidebar />
        <main className="flex-1 flex flex-col">
          <div className="flex-1 flex overflow-hidden">
            {/* Left Panel */}
            <div className="w-[32rem] flex-shrink-0 flex flex-col p-4 overflow-y-auto space-y-4">
              <h1 className="text-2xl font-bold">Otimize</h1>

              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Adicione ou busque" className="pl-8" />
              </div>

              <Button onClick={handleOptimizeRoute} disabled={isOptimizing || deliveries.length < 2}>
                {isOptimizing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Otimizando...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Otimizar Rota
                  </>
                )}
              </Button>

              {routeSummary && (
                <Card>
                  <CardHeader className="p-4">
                    <CardTitle className="text-sm font-normal">Resumo da Rota</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 text-sm">
                    <p>{routeSummary.stops} paradas • {routeSummary.distance} km</p>
                    <p className="text-muted-foreground">{routeSummary.city}</p>
                  </CardContent>
                </Card>
              )}

              <AddDeliveryForm onAdd={handleAddDelivery} />
              <DeliveryList
                deliveries={deliveries}
                onEdit={handleEdit}
                onRemove={handleRemove}
                onReorder={handleReorder}
              />
            </div>

            {/* Right Panel (Map) */}
            <div className="flex-1 min-w-0">
              <DeliveryMap deliveries={deliveries} />
            </div>          
          </div>
        </main>
        {editingDelivery && (
          <EditDeliveryDialog
            delivery={editingDelivery}
            onUpdate={handleUpdate}
            onOpenChange={(open) => !open && setEditingDelivery(null)}
          />
        )}
      </div>
    </SidebarProvider>
  );
};

export default Index;