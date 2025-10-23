// supabase/functions/optimize-route/index.ts
// ✅ Versão FUNCIONAL usando Mapbox Optimization API v1

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

    const MAPBOX_API_KEY = Deno.env.get("MAPBOX_API_KEY");
    if (!MAPBOX_API_KEY) {
      throw new Error("MAPBOX_API_KEY não está configurada");
    }

    const body = await req.json();
    const { deliveries, profile = "driving-traffic" } = body;

    console.log(`📦 Recebidas ${deliveries.length} entregas`);

    if (!Array.isArray(deliveries) || deliveries.length === 0) {
      throw new Error("deliveries deve ser um array não vazio");
    }

    if (deliveries.length < 2) {
      throw new Error("São necessárias pelo menos 2 entregas");
    }

    if (deliveries.length > 12) {
      throw new Error("Máximo de 12 entregas permitidas pela API Mapbox");
    }

    // 🗺️ Geocodifica endereços sem coordenadas
    for (const delivery of deliveries) {
      if (!delivery.coordinates || delivery.coordinates.length !== 2) {
        console.log(`🔍 Geocodificando: ${delivery.address}`);
        
        const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          delivery.address
        )}.json?access_token=${MAPBOX_API_KEY}&limit=1`;
        
        const geoRes = await fetch(geoUrl);
        
        if (!geoRes.ok) {
          throw new Error(`Erro ao geocodificar ${delivery.address}: ${geoRes.statusText}`);
        }
        
        const geoData = await geoRes.json();

        if (!geoData.features || geoData.features.length === 0) {
          throw new Error(`Endereço não encontrado: ${delivery.address}`);
        }

        // Mapbox Geocoding retorna [longitude, latitude]
        const [lng, lat] = geoData.features[0].center;
        delivery.coordinates = [lat, lng]; // Armazena como [lat, lng]
        console.log(`✅ Geocodificado: [${lat}, ${lng}]`);
      }
    }

    // 🧭 Prepara coordenadas para a API v1
    // Formato: longitude,latitude;longitude,latitude;...
    const coordinates = deliveries
      .map((d) => {
        if (!d.coordinates || d.coordinates.length !== 2) {
          throw new Error(`Coordenadas inválidas para ${d.address}`);
        }
        const [lat, lng] = d.coordinates;
        return `${lng},${lat}`; // longitude,latitude
      })
      .join(";");

    console.log("🧭 Coordenadas formatadas:", coordinates);

    // 🚀 Chama a API v1 de Otimização da Mapbox
    const mapboxUrl = `https://api.mapbox.com/optimized-trips/v1/mapbox/${profile}/${coordinates}`;
    
    const params = new URLSearchParams({
      access_token: MAPBOX_API_KEY,
      source: "first",           // Primeiro ponto é a origem
      destination: "last",        // Último ponto é o destino
      roundtrip: "false",         // Não retorna à origem
      geometries: "geojson",      // Formato da geometria
      overview: "full",           // Geometria completa da rota
    });

    const fullUrl = `${mapboxUrl}?${params.toString()}`;
    console.log("📡 Chamando API Mapbox v1...");

    const mapboxResponse = await fetch(fullUrl);
    
    if (!mapboxResponse.ok) {
      const errorText = await mapboxResponse.text();
      console.error("❌ Erro da API Mapbox:", errorText);
      throw new Error(`Mapbox API error (${mapboxResponse.status}): ${errorText}`);
    }

    const mapboxData = await mapboxResponse.json();
    console.log("📨 Resposta completa da Mapbox:", JSON.stringify(mapboxData, null, 2));

    if (mapboxData.code !== "Ok") {
      console.error("❌ Código de erro Mapbox:", mapboxData);
      throw new Error(`Mapbox retornou código: ${mapboxData.code}`);
    }

    if (!mapboxData.trips || mapboxData.trips.length === 0) {
      throw new Error("Nenhuma rota foi retornada pela Mapbox");
    }

    const trip = mapboxData.trips[0];
    const waypoints = mapboxData.waypoints;

    console.log("🔍 Total de waypoints:", waypoints.length);
    console.log("🔍 Total de deliveries:", deliveries.length);
    console.log("🔍 Waypoints RAW:", JSON.stringify(waypoints, null, 2));
    
    // 🔥 FIX CRÍTICO: A API v1 NÃO retorna trips_index corretamente!
    // Na API v1, os waypoints vêm na MESMA ORDEM que você enviou as coordenadas
    // Mas o campo waypoint_index indica a ORDEM OTIMIZADA
    
    // Primeiro, criamos um mapa: posição original → delivery
    const deliveryByOriginalIndex = new Map(
      waypoints.map((wp, idx) => [idx, deliveries[idx]])
    );
    
    console.log("🗺️ Mapa de deliveries por índice original:");
    deliveryByOriginalIndex.forEach((delivery, idx) => {
      console.log(`  [${idx}] → ${delivery.id} - ${delivery.address}`);
    });
    
    // Agora ordenamos pelos waypoint_index (ordem otimizada)
    // e pegamos o delivery correspondente pela posição no array de waypoints
    const sortedWaypoints = [...waypoints].sort((a, b) => a.waypoint_index - b.waypoint_index);
    
    console.log("🔍 Waypoints ordenados por waypoint_index:");
    sortedWaypoints.forEach((wp, idx) => {
      console.log(`  [${idx}] waypoint_index=${wp.waypoint_index}, posição original no array=${waypoints.indexOf(wp)}`);
    });
    
    const optimizedOrder = sortedWaypoints.map((wp) => {
      // Encontra a posição original deste waypoint no array de waypoints
      const originalPosition = waypoints.indexOf(wp);
      const delivery = deliveries[originalPosition];
      
      if (!delivery) {
        console.error(`❌ Delivery não encontrada na posição ${originalPosition}`);
        return null;
      }
      
      console.log(`✅ Waypoint index ${wp.waypoint_index} → posição original ${originalPosition} → ${delivery.id}`);
      return delivery.id;
    }).filter(id => id !== null);

    const result = {
      optimizedOrder,
      totalDistance: Math.round(trip.distance),      // em metros
      totalDuration: Math.round(trip.duration),      // em segundos
      routeGeometry: trip.geometry,                  // GeoJSON
    };

    console.log("📊 Resultado final:");
    console.log("  - Ordem original:", deliveries.map(d => d.id));
    console.log("  - Ordem otimizada:", result.optimizedOrder);
    console.log(
      `  - Distância: ${(result.totalDistance / 1000).toFixed(1)} km, ` +
      `Duração: ${Math.round(result.totalDuration / 60)} min`
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("❌ Erro fatal:", error);
    
    return new Response(
      JSON.stringify({
        error: error.message || "Erro desconhecido",
        details: error.stack,
        hint: "Verifique os logs para mais detalhes"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});