import { useState, useEffect } from "react";
import { SidebarProvider, Sidebar } from "@/components/ui/sidebar";
import { AddDeliveryForm } from "@/components/AddDeliveryForm";
import { DeliveryList } from "@/components/DeliveryList";
import { DeliveryMap } from "@/components/DeliveryMap";
import EditDeliveryDialog from "@/components/EditDeliveryDialog";
import { Delivery } from "@/types/delivery";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { DropResult } from "react-beautiful-dnd";
import { toast } from "sonner";
import { Database } from "@/integrations/supabase/types";

interface RouteSummary {
  stops: number;
  distance: number;
  city: string;
}

type SupabaseDelivery = Database['public']['Tables']['deliveries']['Row'];

// 🔹 Mapeia campos do Supabase para o modelo Delivery
const mapSupabaseToDelivery = (supabaseDelivery: SupabaseDelivery): Delivery => {
  const { coordinates, ...rest } = supabaseDelivery;
  let parsedCoords: [number, number] | undefined = undefined;

  if (Array.isArray(coordinates) && coordinates.length === 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    parsedCoords = [coordinates[0], coordinates[1]];
  } else if (typeof coordinates === "string") {
    try {
      const parsed = JSON.parse(coordinates);
      if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === "number" && typeof parsed[1] === "number") {
        parsedCoords = [parsed[0], parsed[1]];
      }
    } catch (e) {
      // Ignora erro
    }
  } else if (typeof coordinates === "object" && coordinates !== null) {
    const lat = (coordinates as any).lat ?? (coordinates as any).latitude;
    const lng = (coordinates as any).lng ?? (coordinates as any).lon ?? (coordinates as any).longitude;
    if (typeof lat === "number" && typeof lng === "number") {
      parsedCoords = [lat, lng];
    }
  }

  return {
    ...rest,
    coordinates: parsedCoords,
    isUrgent: rest.is_urgent ?? false,
  };
};

// 🔹 Função de ordenação central
const sortDeliveries = (list: Delivery[]) => {
  return [
    ...list.filter(d => d.type === "origin"),
    ...list.filter(d => d.isUrgent && d.type !== "origin" && d.type !== "destination"),
    ...list.filter(d => !d.isUrgent && d.type === "stop"),
    ...list.filter(d => d.type === "destination"),
  ];
};

const Index = () => {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [editingDelivery, setEditingDelivery] = useState<Delivery | null>(null);
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // 🔹 Busca inicial
  useEffect(() => {
    const fetchDeliveries = async () => {
      const { data, error } = await supabase.from("deliveries").select("*");
      if (error) {
        console.error("Error fetching deliveries:", error);
      } else {
        const mappedData = (data || []).map(mapSupabaseToDelivery);
        const ordered = sortDeliveries(mappedData);
        console.log("🚚 Entregas ordenadas automaticamente:", ordered.map(d =>
          `${d.type.toUpperCase()} ${d.isUrgent ? "(URGENTE)" : ""} - ${d.address}`
        ));
        setDeliveries(ordered);
      }
    };
    fetchDeliveries();
  }, []);

  // 🔹 Mantém a lista sempre ordenada quando muda
  useEffect(() => {
    setDeliveries(prev => sortDeliveries([...prev]));
  }, [deliveries.length]);

  const handleAddDelivery = async (
    deliveryOrDeliveries: Omit<Delivery, "id" | "priority"> | Omit<Delivery, "id" | "priority">[],
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
    if (error) {
      console.error("Error deleting delivery:", error);
    } else {
      setDeliveries(prev => sortDeliveries(prev.filter(d => d.id !== id)));
    }
  };

  const handleReorder = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(deliveries);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setDeliveries(sortDeliveries(items));
  };

  // 🔹 Otimização com origem, urgentes, paradas e destino
  const handleOptimizeRoute = async () => {
    if (deliveries.length < 2) {
      toast.error("Adicione pelo menos 2 entregas para otimizar a rota.");
      return;
    }

    const origin = deliveries.find(d => d.type === "origin");
    const destination = deliveries.find(d => d.type === "destination");

    if (!origin) {
      toast.error("É necessário definir uma origem antes de otimizar a rota.");
      return;
    }

    setIsOptimizing(true);
    setRouteSummary(null);

    try {
      const urgentes = deliveries.filter(d => d.isUrgent && d.type !== "origin" && d.type !== "destination");
      const naoUrgentes = deliveries.filter(d => !d.isUrgent && d.type !== "origin" && d.type !== "destination");
      const ordered = [origin, ...urgentes, ...naoUrgentes, ...(destination ? [destination] : [])];

      const { data, error } = await supabase.functions.invoke("optimize-route", {
        body: { deliveries: ordered, fixDestinationAtEnd: !!destination },
      });

      if (error) throw error;

      const { optimizedOrder, totalDistance } = data;
      const optimizedDeliveries = optimizedOrder
        .map((id: string) => ordered.find(d => d.id === id))
        .filter(Boolean) as Delivery[];

      const finalOrder = [
        origin,
        ...optimizedDeliveries.filter(d => d.id !== origin.id && d.id !== destination?.id),
        ...(destination ? [destination] : []),
      ];

      setDeliveries(sortDeliveries(finalOrder));
      setRouteSummary({
        stops: finalOrder.length,
        distance: totalDistance || 0,
        city: "Rotas",
      });

      toast.success("Rota otimizada com sucesso!");
    } catch (error: any) {
      console.error("❌ Error optimizing route:", error);
      toast.error("Falha ao otimizar a rota.", {
        description: error.message || "Erro desconhecido",
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
        <Sidebar className="flex flex-col">
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
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

            {routeSummary && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm font-medium text-green-900 dark:text-green-100">
                  🤖 Rota Otimizada ✅
                </p>
                <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                  {routeSummary.stops} paradas • {routeSummary.distance} km
                </p>
              </div>
            )}

            <DeliveryList
              deliveries={deliveries}
              onEdit={handleEdit}
              onRemove={handleRemove}
              onReorder={handleReorder}
            />
          </div>
        </Sidebar>

        <main className="flex-1">
          <DeliveryMap key={JSON.stringify(deliveries.map(d => d.id))} deliveries={deliveries} />
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
