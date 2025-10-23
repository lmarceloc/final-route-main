// supabase/functions/optimize-route/index.ts
// 🔹 Versão melhorada: usa a API Mapbox Optimized Trips para otimização

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }
    
    // 🔑 Pega a chave da Mapbox das variáveis de ambiente
    const MAPBOX_API_KEY = Deno.env.get("MAPBOX_API_KEY");
    if (!MAPBOX_API_KEY) {
      throw new Error("MAPBOX_API_KEY is not configured in Supabase environment variables.");
    }
    
    const body = await req.json();
    // Adiciona 'profile' para escolher o modo de transporte (ex: 'mapbox/driving-traffic')
    const { deliveries, profile = 'mapbox/driving-traffic' } = body;
    
    if (!Array.isArray(deliveries) || deliveries.length === 0) {
      return new Response(JSON.stringify({ error: "deliveries must be a non-empty array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    if (deliveries.length < 2 || deliveries.length > 12) {
      return new Response(JSON.stringify({ error: "Mapbox API requires between 2 and 12 waypoints." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // 🗺️ Monta a lista de coordenadas para a API da Mapbox
    const coordinates = deliveries.map((d: any) => {
      if (!Array.isArray(d.coordinates) || d.coordinates.length !== 2) {
        throw new Error(`Invalid coordinates for delivery ID ${d.id}`);
      }
      // 💡 CORREÇÃO: A API da Mapbox espera "longitude,latitude"
      return `${d.coordinates[1]},${d.coordinates[0]}`;
    }).join(";");
    
    const mapboxUrl = `https://api.mapbox.com/optimized-trips/v2/${profile}/${coordinates}`;
    
    const params = new URLSearchParams({
      access_token: MAPBOX_API_KEY,
      source: 'first', // A primeira coordenada é a origem
      destination: 'last', // A última é o destino
      roundtrip: 'false', // Não retorna à origem
      geometries: 'geojson', // Para desenhar a rota no mapa
      overview: 'full', // Detalhes completos da geometria
    });
    
    console.log(`🧭 Otimizando rota via Mapbox API com perfil: ${profile}`);
    
    const mapboxResponse = await fetch(`${mapboxUrl}?${params.toString()}`, {
      method: "GET",
    });
    
    const mapboxData = await mapboxResponse.json();
    
    if (!mapboxResponse.ok) {
      console.error("❌ Erro da API Mapbox:", mapboxData);
      throw new Error(mapboxData.message || "Failed to fetch optimized route from Mapbox.");
    }
    
    if (mapboxData.code !== "Ok" || !mapboxData.trips || mapboxData.trips.length === 0) {
      throw new Error("Mapbox API did not return a valid trip.");
    }
    
    const trip = mapboxData.trips[0];
    
    // Mapeia a ordem otimizada de volta para os IDs originais
    const originalWaypoints = mapboxData.waypoints;
    const optimizedOrder = originalWaypoints
      .sort((a: any, b: any) => a.waypoint_index - b.waypoint_index)
      .map((waypoint: any) => deliveries[waypoint.input_index].id);
      
    const result = {
      optimizedOrder,
      totalDistance: Math.round(trip.distance), // em metros
      totalDuration: Math.round(trip.duration), // em segundos
      routeGeometry: trip.geometry, // Geometria para desenhar no mapa
    };
    
    console.log(`✅ Rota otimizada pela Mapbox: ${(result.totalDistance / 1000).toFixed(2)} km, ${(result.totalDuration / 60).toFixed(0)} min.`);
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("❌ Erro fatal em optimize-route:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error", stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});