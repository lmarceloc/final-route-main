import { useState, useEffect } from "react";
import { SidebarProvider, Sidebar } from "@/components/ui/sidebar";
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

    const deliveriesToInsert = newDeliveries.map(d => ({
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

    setIsOptimizing(true);

    try {
      console.log('🚚 Entregas para otimização:', deliveries);

      // 🔥 FIX: Chama a Edge Function
      const { data, error } = await supabase.functions.invoke('optimize-route', {
        body: {
          deliveries: deliveries.map(d => ({
            id: d.id,
            address: d.address,
            coordinates: d.coordinates,
            type: d.type,
            isUrgent: d.isUrgent || d.is_urgent,
          })),
          profile: 'driving-traffic', // 🔥 FIX: removido selectedProfile não definido
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

      // 🔥 FIX: Cria um Map para lookup rápido por ID
      const deliveryMap = new Map(deliveries.map(d => [d.id, d]));
      console.log('📦 IDs disponíveis:', Array.from(deliveryMap.keys()));

      // 🔥 FIX: Reconstrói o array na ordem otimizada
      const reorderedDeliveries = data.optimizedOrder
        .map((id: string) => {
          const delivery = deliveryMap.get(id);
          if (!delivery) {
            console.error(`❌ Delivery não encontrada para ID: ${id}`);
          }
          return delivery;
        })
        .filter((d): d is Delivery => d !== undefined);

      console.log('📦 Entregas reordenadas:', reorderedDeliveries);
      console.log('📦 Quantidade antes:', deliveries.length, 'depois:', reorderedDeliveries.length);

      // Verifica se todas as entregas foram mapeadas
      if (reorderedDeliveries.length !== deliveries.length) {
        console.warn('⚠️ Algumas entregas não foram mapeadas corretamente');
        throw new Error('Erro ao mapear entregas otimizadas');
      }

      // 🔥 FIX: Atualiza o estado (NÃO usa sortDeliveries, mantém ordem otimizada)
      setDeliveries(reorderedDeliveries);
      
      // 🔥 FIX: setOptimizedRoute → setOptimizationResult
      setOptimizationResult({
        totalDistance: data.totalDistance,
        totalDuration: data.totalDuration,
        routeGeometry: data.routeGeometry,
      });

      toast.success('Rota otimizada com sucesso!', {
        description: `${(data.totalDistance / 1000).toFixed(1)} km • ${Math.round(data.totalDuration / 60)} min`,
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
      <div className="relative h-screen w-full">
        <main className="absolute inset-0">
          <MapboxMap deliveries={deliveries} route={optimizationResult} />
        </main>

        <Sidebar className="absolute top-0 left-0 h-full w-1/4 z-10 flex flex-col justify-between overflow-y-auto">
          <div className="p-4 space-y-4">
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
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm font-medium text-green-900 dark:text-green-100">
                  🤖 Rota Otimizada ✅
                </p>
                <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                  Distância: {(optimizationResult.totalDistance / 1000).toFixed(2)} km
                </p>
                <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                  Duração: {Math.round(optimizationResult.totalDuration / 60)} min
                </p>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-20">
            <DeliveryList
              deliveries={deliveries}
              onEdit={handleEdit}
              onRemove={handleRemove}
              onReorder={handleReorder}
            />
          </div>
        </Sidebar>

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