// supabase/functions/optimize-route/index.ts
// 🔹 Versão melhorada: usa 2-opt para otimização mais eficiente

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

    const body = await req.json();
    const { deliveries, urgentDeliveryId, fixDestinationAtEnd } = body;

    if (!Array.isArray(deliveries) || deliveries.length === 0) {
      return new Response(JSON.stringify({ error: "deliveries must be a non-empty array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 🧭 Verifica se há coordenadas válidas
    const hasCoordinates = deliveries.every(
      (d: any) => Array.isArray(d.coordinates) && d.coordinates.length === 2
    );

    // 🧮 Se há coordenadas → usa algoritmo otimizado
    if (hasCoordinates) {
      console.log("🧭 Otimizando rota via Haversine + 2-opt");

      // Haversine distance
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const haversine = (a: number[], b: number[]) => {
        if (!a || !b || a.length !== 2 || b.length !== 2) return Infinity;
        const R = 6371;
        const dLat = toRad(b[0] - a[0]);
        const dLon = toRad(b[1] - a[1]);
        const lat1 = toRad(a[0]);
        const lat2 = toRad(b[0]);
        const sinDlat = Math.sin(dLat / 2);
        const sinDlon = Math.sin(dLon / 2);
        const c = 2 * Math.asin(
          Math.sqrt(sinDlat ** 2 + Math.cos(lat1) * Math.cos(lat2) * sinDlon ** 2)
        );
        return R * c;
      };

      const calculateTotalDistance = (route: any[]) => {
        let total = 0;
        for (let i = 0; i < route.length - 1; i++) {
          total += haversine(route[i].coordinates, route[i + 1].coordinates);
        }
        return total;
      };

      // Nearest Neighbor para rota inicial
      const nearestNeighbor = (stops: any[], startPoint: any) => {
        if (stops.length === 0) return [];
        if (stops.length === 1) return stops;
        
        const result: any[] = [];
        const remaining = [...stops];
        let current = startPoint;
        
        while (remaining.length > 0) {
          let bestIdx = 0;
          let bestDist = Infinity;
          
          for (let i = 0; i < remaining.length; i++) {
            const dist = haversine(current.coordinates, remaining[i].coordinates);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
            }
          }
          
          const next = remaining.splice(bestIdx, 1)[0];
          result.push(next);
          current = next;
        }
        
        return result;
      };

      // 2-opt optimization (melhora a rota removendo cruzamentos)
      const twoOpt = (route: any[], maxIterations = 100) => {
        let improved = true;
        let iterations = 0;
        let bestRoute = [...route];
        let bestDistance = calculateTotalDistance(bestRoute);

        while (improved && iterations < maxIterations) {
          improved = false;
          iterations++;

          for (let i = 1; i < bestRoute.length - 2; i++) {
            for (let j = i + 1; j < bestRoute.length - 1; j++) {
              // Testa reversão do segmento [i, j]
              const newRoute = [
                ...bestRoute.slice(0, i),
                ...bestRoute.slice(i, j + 1).reverse(),
                ...bestRoute.slice(j + 1)
              ];

              const newDistance = calculateTotalDistance(newRoute);

              if (newDistance < bestDistance) {
                bestRoute = newRoute;
                bestDistance = newDistance;
                improved = true;
              }
            }
          }
        }

        console.log(`✨ 2-opt convergiu em ${iterations} iterações`);
        return bestRoute;
      };

      // 🔧 Monta a rota
      const origin = deliveries[0];
      const destination = fixDestinationAtEnd ? deliveries[deliveries.length - 1] : null;
      const idMap = new Map(deliveries.map((d: any) => [d.id, d]));

      const finalRoute: any[] = [origin];
      const used = new Set([origin.id]);

      // Adiciona entrega urgente logo após origem
      if (urgentDeliveryId && idMap.has(urgentDeliveryId)) {
        const urgent = idMap.get(urgentDeliveryId);
        finalRoute.push(urgent);
        used.add(urgent.id);
      }

      // Filtra pontos intermediários
      const intermediate = deliveries.filter(
        (d: any) => !used.has(d.id) && (!destination || d.id !== destination.id)
      );

      // Otimiza pontos intermediários
      const lastPoint = finalRoute[finalRoute.length - 1];
      const optimizedIntermediate = nearestNeighbor(intermediate, lastPoint);
      
      // Aplica 2-opt para melhorar ainda mais
      const routeForOptimization = [...finalRoute, ...optimizedIntermediate];
      const finalOptimized = twoOpt(routeForOptimization);

      // Remove origem da otimização e readiciona
      const withoutOrigin = finalOptimized.slice(1);
      const finalRouteComplete = [origin, ...withoutOrigin];

      // Adiciona destino se necessário
      if (destination) finalRouteComplete.push(destination);

      const optimizedOrder = finalRouteComplete.map((d) => d.id);
      const totalDistance = calculateTotalDistance(finalRouteComplete);

      console.log(`✅ Rota otimizada: ${totalDistance.toFixed(2)} km`);
      
      return new Response(
        JSON.stringify({ 
          optimizedOrder, 
          totalDistance: Math.round(totalDistance * 100) / 100 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 🤖 Fallback pro Gemini AI
    console.log("⚙️ Coordenadas ausentes → roteirizando via Gemini AI");

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const GEMINI_MODEL = "gemini-1.5-flash";
    const prompt = `
Você é um especialista em logística. Analise as seguintes entregas e retorne a ordem ideal (otimizada).
Dados:
${deliveries
  .map(
    (d: any, i: number) =>
      `${i + 1}. ID: ${d.id} | Endereço: ${d.address} | Tipo: ${d.type} ${
        d.isUrgent ? "(URGENTE)" : ""
      }`
  )
  .join("\n")}

Regras:
1. A origem deve ser a primeira parada.
2. ${
      urgentDeliveryId
        ? `A entrega URGENTE (ID: ${urgentDeliveryId}) deve ser a segunda parada.`
        : "Não há entregas urgentes."
    }
3. ${
      fixDestinationAtEnd
        ? "O destino final deve ser a última parada."
        : "A última entrega pode ser reordenada."
    }

Saída esperada:
{"optimizedOrder": ["id_1", "id_2", "id_3", ...]}
`;

    const aiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        }),
      }
    );

    const data = await aiResponse.json();
    const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    let optimizedOrder = deliveries.map((d: any) => d.id);
    try {
      const parsed = JSON.parse(aiText);
      if (Array.isArray(parsed.optimizedOrder)) {
        optimizedOrder = parsed.optimizedOrder;
      }
    } catch {
      console.warn("⚠️ Resposta Gemini inválida. Usando ordem original.");
    }

    console.log("✅ Rota otimizada via Gemini.");
    return new Response(JSON.stringify({ optimizedOrder }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("❌ Erro fatal em optimize-route:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error", stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});