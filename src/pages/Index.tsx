import { useState, useEffect } from "react";
import { SidebarProvider, Sidebar, SidebarInset } from "@/components/ui/sidebar";
import { AddDeliveryForm } from "@/components/AddDeliveryForm";
import { DeliveryList } from "@/components/DeliveryList";
import { MapboxMap } from "@/components/MapboxMap";
import EditDeliveryDialog from "@/components/EditDeliveryDialog";
import { Delivery } from "@/types/delivery";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { DropResult } from "react-beautiful-dnd";
import { toast } from "sonner";
import { Database } from "@/integrations/supabase/types";

interface RouteSummary {
  totalDistance: number;
  totalDuration: number;
  routeGeometry?: any;
}

type SupabaseDelivery = Database["public"]["Tables"]["deliveries"]["Row"];

const mapSupabaseToDelivery = (supabaseDelivery: SupabaseDelivery): Delivery => {
  const { coordinates, ...rest } = supabaseDelivery;
  let parsedCoords: [number, number] | undefined = undefined;

  if (Array.isArray(coordinates) && coordinates.length === 2) {
    parsedCoords = [coordinates[0], coordinates[1]];
  } else if (typeof coordinates === "string") {
    try {
      const parsed = JSON.parse(coordinates);
      if (Array.isArray(parsed) && parsed.length === 2) parsedCoords = [parsed[0], parsed[1]];
    } catch { }
  } else if (typeof coordinates === "object" && coordinates !== null) {
    const lat = (coordinates as any).lat ?? (coordinates as any).latitude;
    const lng = (coordinates as any).lng ?? (coordinates as any).lon ?? (coordinates as any).longitude;
    if (typeof lat === "number" && typeof lng === "number") parsedCoords = [lat, lng];
  }

  return {
    ...rest,
    coordinates: parsedCoords,
    isUrgent: rest.is_urgent ?? false,
  };
};

const sortDeliveries = (list: Delivery[]) => [
  ...list.filter(d => d.type === "origin"),
  ...list.filter(d => d.isUrgent && d.type !== "origin" && d.type !== "destination"),
  ...list.filter(d => !d.isUrgent && d.type === "stop"),
  ...list.filter(d => d.type === "destination"),
];

const Index = () => {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [editingDelivery, setEditingDelivery] = useState<Delivery | null>(null);
  const [optimizationResult, setOptimizationResult] = useState<RouteSummary | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  useEffect(() => {
    const fetchDeliveries = async () => {
      const { data, error } = await supabase.from("deliveries").select("*");
      if (error) {
        console.error("Error fetching deliveries:", error);
      } else {
        const mappedData = (data || []).map(mapSupabaseToDelivery);
        setDeliveries(sortDeliveries(mappedData));
      }
    };
    fetchDeliveries();
  }, []);

  const handleAddDelivery = async (
    deliveryOrDeliveries: Omit<Delivery, "id" | "priority"> | Omit<Delivery, "id" | "priority">[]
  ) => {
    const newDeliveries = Array.isArray(deliveryOrDeliveries)
      ? deliveryOrDeliveries
      : [deliveryOrDeliveries];

    let hasOrigin = deliveries.some(d => d.type === "origin");
    let hasDestination = deliveries.some(d => d.type === "destination");

    const filteredDeliveries = newDeliveries.filter(d => {
      if (d.type === "origin") {
        if (hasOrigin) {
          toast.error("Já existe uma origem cadastrada. Remova a atual antes de adicionar outra.");
          return false;
        }
        hasOrigin = true;
      }

      if (d.type === "destination") {
        if (hasDestination) {
          toast.error("Já existe um destino final cadastrado. Remova o atual antes de adicionar outro.");
          return false;
        }
        hasDestination = true;
      }

      return true;
    });

    if (filteredDeliveries.length === 0) {
      return;
    }

    const deliveriesToInsert = filteredDeliveries.map(d => ({
      address: d.address,
      coordinates: d.coordinates,
      type: d.type,
      is_urgent: Boolean((d as any).isUrgent || (d as any).is_urgent),
    }));

    const { data: insertedDeliveries, error } = await supabase
      .from("deliveries")
      .insert(deliveriesToInsert)
      .select();

    if (error) {
      toast.error("Falha ao adicionar entrega.", { description: error.message });
    } else if (insertedDeliveries) {
      const newMappedDeliveries = insertedDeliveries.map(mapSupabaseToDelivery);
      setDeliveries(prev => sortDeliveries([...prev, ...newMappedDeliveries]));
      toast.success("Entrega adicionada com sucesso!");
    }
  };

  const handleEdit = (deliveryId: string) => {
    const deliveryToEdit = deliveries.find(d => d.id === deliveryId);
    if (deliveryToEdit) setEditingDelivery(deliveryToEdit);
  };

  const handleUpdate = (updatedDelivery: Delivery) => {
    setDeliveries(prev =>
      sortDeliveries(prev.map(d => (d.id === updatedDelivery.id ? updatedDelivery : d)))
    );
    setEditingDelivery(null);
  };

  const handleRemove = async (id: string) => {
    const { error } = await supabase.from("deliveries").delete().eq("id", id);
    if (!error) setDeliveries(prev => sortDeliveries(prev.filter(d => d.id !== id)));
  };

  const handleReorder = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(deliveries);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setDeliveries(sortDeliveries(items));
  };

  const handleOptimizeRoute = async () => {
    if (deliveries.length < 2) {
      toast.error('Adicione pelo menos 2 entregas para otimizar a rota');
      return;
    }

    const origins = deliveries.filter(d => d.type === "origin");
    const destinations = deliveries.filter(d => d.type === "destination");

    if (origins.length === 0) {
      toast.error("Cadastre uma origem antes de otimizar a rota.");
      return;
    }

    if (destinations.length === 0) {
      toast.error("Cadastre um destino final antes de otimizar a rota.");
      return;
    }

    const primaryOriginId = origins[0].id;
    const primaryDestinationId = destinations[destinations.length - 1].id;

    if (origins.length > 1 || destinations.length > 1) {
      toast.warning("Somente a primeira origem e o primeiro destino serão considerados; os demais foram tratados como paradas.");
    }

    const normalizedDeliveries = deliveries.map(delivery => {
      if (delivery.type === "origin" && delivery.id !== primaryOriginId) {
        return { ...delivery, type: "stop" as Delivery["type"] };
      }

      if (delivery.type === "destination" && delivery.id !== primaryDestinationId) {
        return { ...delivery, type: "stop" as Delivery["type"] };
      }

      return delivery;
    });

    setIsOptimizing(true);

    try {
      console.log('🚚 Entregas para otimização:', deliveries);

      const { data, error } = await supabase.functions.invoke('optimize-route', {
        body: {
          deliveries: normalizedDeliveries.map(d => ({
            id: d.id,
            address: d.address,
            coordinates: d.coordinates,
            type: d.type,
            isUrgent: d.isUrgent || d.is_urgent,
          })),
          profile: 'driving-traffic',
        },
      });

      if (error) {
        console.error('❌ Erro ao otimizar:', error);
        throw error;
      }

      if (!data || !data.optimizedOrder) {
        throw new Error('Resposta inválida da API de otimização');
      }

      console.log('✅ Resposta da otimização:', data);
      console.log('📋 IDs retornados:', data.optimizedOrder);

      const deliveryMap = new Map(deliveries.map(d => [d.id, d]));
      console.log('📦 IDs disponíveis:', Array.from(deliveryMap.keys()));

      const reorderedDeliveries = data.optimizedOrder
        .map((id: string) => {
          const delivery = deliveryMap.get(id);
          if (!delivery) {
            console.error(`⚠️ Delivery não encontrada para ID: ${id}`);
          }
          return delivery;
        })
        .filter((d): d is Delivery => d !== undefined);

      console.log('📦 Entregas reordenadas:', reorderedDeliveries);
      console.log('📦 Quantidade antes:', deliveries.length, 'depois:', reorderedDeliveries.length);

      const optimizedIdSet = new Set<string>(data.optimizedOrder);
      const missingDeliveries = deliveries.filter(d => !optimizedIdSet.has(d.id));

      if (missingDeliveries.length > 0) {
        console.warn('⚠️ Entregas fora da resposta da otimização:', missingDeliveries.map(d => d.id));
        toast.warning('Algumas entregas não puderam ser incluídas na rota otimizada.');
      }

      const finalDeliveries = [...reorderedDeliveries, ...missingDeliveries];

      setDeliveries(finalDeliveries);

      setOptimizationResult({
        totalDistance: data.totalDistance,
        totalDuration: data.totalDuration,
        routeGeometry: data.routeGeometry,
      });

      toast.success('Rota otimizada com sucesso!', {
        description: `${(data.totalDistance / 1000).toFixed(1)} km · ${Math.round(data.totalDuration / 60)} min`,
      });

    } catch (error: any) {
      console.error('❌ Erro ao otimizar rota:', error);
      toast.error('Falha ao otimizar rota', {
        description: error.message || 'Erro desconhecido',
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar className="z-10 flex h-full min-h-svh w-full max-w-md flex-col justify-between overflow-y-auto border-r bg-background/90 p-4 shadow-lg backdrop-blur">
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <img
              src="https://cargon.com.br/wp-content/uploads/logo-azul.svg"
              alt="Logo Cargon"
              className="h-10 w-auto"
              loading="lazy"
            />
          </div>
          <AddDeliveryForm onAdd={handleAddDelivery} />
          <Button
            onClick={handleOptimizeRoute}
            disabled={isOptimizing || deliveries.length < 2}
            className="w-full bg-green-600 text-white hover:bg-green-700"
          >
            {isOptimizing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Otimizando...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Otimizar Rota
              </>
            )}
          </Button>

          {optimizationResult && optimizationResult.totalDistance > 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
              <p className="text-sm font-medium text-green-900 dark:text-green-100">
                Rota otimizada.
              </p>
              <p className="mt-1 text-xs text-green-700 dark:text-green-300">
                Distância: {(optimizationResult.totalDistance / 1000).toFixed(2)} km
              </p>
              <p className="mt-1 text-xs text-green-700 dark:text-green-300">
                Duração: {Math.round(optimizationResult.totalDuration / 60)} min
              </p>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto pb-20">
          <DeliveryList
            deliveries={deliveries}
            onEdit={handleEdit}
            onRemove={handleRemove}
            onReorder={handleReorder}
          />
        </div>
      </Sidebar>

      <SidebarInset className="flex-1 p-0">
        <div className="relative h-full min-h-svh w-full">
          <MapboxMap deliveries={deliveries} route={optimizationResult} />
        </div>

        {editingDelivery && (
          <EditDeliveryDialog
            delivery={editingDelivery}
            onUpdate={handleUpdate}
            onOpenChange={(open) => !open && setEditingDelivery(null)}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Index;
