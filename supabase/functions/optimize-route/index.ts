// supabase/functions/optimize-route/index.ts
// 🔹 Versão com suporte a entregas urgentes

// Helper para fazer a chamada à API da Mapbox
async function optimizeTrip(deliveries, profile, MAPBOX_API_KEY) {
  if (deliveries.length < 2) {
    // Se tivermos apenas um ponto, não há rota para otimizar, retornamos um resultado "vazio"
    const singleDelivery = deliveries[0];
    return {
      optimizedOrder: [singleDelivery.id],
      totalDistance: 0,
      totalDuration: 0,
      routeGeometry: {
        type: "LineString",
        coordinates: [singleDelivery.coordinates.slice().reverse()], // [lng, lat]
      },
    };
  }

  const coordinates = deliveries
    .map((d) => {
      if (!d.coordinates || d.coordinates.length !== 2) {
        throw new Error(`Coordenadas inválidas para ${d.address}`);
      }
      const [lat, lng] = d.coordinates;
      return `${lng},${lat}`;
    })
    .join(";");

  const mapboxUrl = `https://api.mapbox.com/optimized-trips/v1/mapbox/${profile}/${coordinates}`;
  const params = new URLSearchParams({
    access_token: MAPBOX_API_KEY,
    source: "first",
    destination: "last",
    roundtrip: "false",
    geometries: "geojson",
    overview: "full",
  });

  const mapboxResponse = await fetch(`${mapboxUrl}?${params.toString()}`);

  if (!mapboxResponse.ok) {
    const errorText = await mapboxResponse.text();
    console.error("❌ Erro da API Mapbox:", errorText);
    throw new Error(`Mapbox API error (${mapboxResponse.status}): ${errorText}`);
  }

  const mapboxData = await mapboxResponse.json();

  if (mapboxData.code !== "Ok" || !mapboxData.trips || mapboxData.trips.length === 0) {
    console.error("❌ Resposta inválida da Mapbox:", mapboxData);
    throw new Error(`Mapbox retornou: ${mapboxData.code}`);
  }

  const trip = mapboxData.trips[0];
  const waypoints = mapboxData.waypoints;

  const sortedWaypoints = [...waypoints].sort((a, b) => a.waypoint_index - b.waypoint_index);
  
  const optimizedOrder = sortedWaypoints.map((wp) => {
    const originalPosition = waypoints.indexOf(wp);
    return deliveries[originalPosition].id;
  });

  return {
    optimizedOrder,
    totalDistance: Math.round(trip.distance),
    totalDuration: Math.round(trip.duration),
    routeGeometry: trip.geometry,
    waypoints: sortedWaypoints.map(wp => ({
      ...wp,
      // Adiciona o delivery original para referência futura
      delivery: deliveries[waypoints.indexOf(wp)]
    }))
  };
}

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
      throw new Error("Method Not Allowed");
    }

    const MAPBOX_API_KEY = Deno.env.get("MAPBOX_API_KEY");
    if (!MAPBOX_API_KEY) {
      throw new Error("MAPBOX_API_KEY não está configurada");
    }

    const body = await req.json();
    let { deliveries, profile = "driving-traffic" } = body;

    // Geocodifica endereços se necessário
    for (const delivery of deliveries) {
      if (!delivery.coordinates || delivery.coordinates.length !== 2) {
        const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(delivery.address)}.json?access_token=${MAPBOX_API_KEY}&limit=1`;
        const geoRes = await fetch(geoUrl);
        if (!geoRes.ok) throw new Error(`Erro ao geocodificar ${delivery.address}`);
        const geoData = await geoRes.json();
        if (!geoData.features || geoData.features.length === 0) throw new Error(`Endereço não encontrado: ${delivery.address}`);
        const [lng, lat] = geoData.features[0].center;
        delivery.coordinates = [lat, lng];
      }
    }

    // Separa as entregas por tipo
    const origin = deliveries.find(d => d.type === 'origin');
    const destination = deliveries.find(d => d.type === 'destination');
    const urgentStops = deliveries.filter(d => d.type === 'stop' && d.isUrgent);
    const normalStops = deliveries.filter(d => d.type === 'stop' && !d.isUrgent);

    if (!origin) {
      throw new Error("É necessário definir uma origem.");
    }

    let finalResult = {
      optimizedOrder: [],
      totalDistance: 0,
      totalDuration: 0,
      routeGeometry: { type: "LineString", coordinates: [] },
    };

    let lastWaypoint = origin;

    // 1. Otimiza rota com paradas urgentes (se houver)
    if (urgentStops.length > 0) {
      console.log(`➡️ Otimizando ${urgentStops.length} paradas urgentes...`);
      const urgentTripResult = await optimizeTrip([lastWaypoint, ...urgentStops], profile, MAPBOX_API_KEY);
      
      finalResult.totalDistance += urgentTripResult.totalDistance;
      finalResult.totalDuration += urgentTripResult.totalDuration;
      finalResult.routeGeometry.coordinates.push(...urgentTripResult.routeGeometry.coordinates);
      
      // Remove o ponto de partida da lista de ordem otimizada
      finalResult.optimizedOrder.push(...urgentTripResult.optimizedOrder.slice(1));
      
      // O último waypoint da rota urgente se torna a nova "origem"
      const lastUrgentWp = urgentTripResult.waypoints[urgentTripResult.waypoints.length - 1];
      lastWaypoint = lastUrgentWp.delivery;
    }

    // 2. Otimiza rota com paradas normais (e destino, se houver)
    const normalAndDest = [...normalStops];
    if (destination) {
      normalAndDest.push(destination);
    }

    if (normalAndDest.length > 0) {
      console.log(`➡️ Otimizando ${normalStops.length} paradas normais e ${destination ? 1 : 0} destino...`);
      const normalTripResult = await optimizeTrip([lastWaypoint, ...normalAndDest], profile, MAPBOX_API_KEY);
      
      finalResult.totalDistance += normalTripResult.totalDistance;
      finalResult.totalDuration += normalTripResult.totalDuration;
      
      // Concatena a geometria, removendo o primeiro ponto para evitar duplicata
      finalResult.routeGeometry.coordinates.push(...normalTripResult.routeGeometry.coordinates.slice(1));
      
      // Remove o ponto de partida da lista de ordem otimizada
      finalResult.optimizedOrder.push(...normalTripResult.optimizedOrder.slice(1));
    }

    // Adiciona a origem no início da ordem final
    finalResult.optimizedOrder.unshift(origin.id);

    console.log("📊 Resultado final combinado:", {
      order: finalResult.optimizedOrder,
      distance: finalResult.totalDistance,
      duration: finalResult.totalDuration,
    });

    return new Response(JSON.stringify(finalResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("❌ Erro fatal:", error);
    return new Response(
      JSON.stringify({ error: error.message, details: error.stack }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});