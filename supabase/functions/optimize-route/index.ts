// supabase/functions/optimize-route/index.ts
// Edge Function para otimizar rotas usando Gemini AI

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Trata requisições preflight (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: corsHeaders,
      });
    }

    const body = await req.json();
    const { deliveries, urgentDeliveryId, fixDestinationAtEnd } = body;

    if (!Array.isArray(deliveries) || deliveries.length === 0) {
      return new Response(
        JSON.stringify({ error: 'deliveries must be a non-empty array' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 🔹 Obtém a chave da API do Gemini das variáveis de ambiente
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const GEMINI_MODEL = 'gemini-2.0-flash-exp';

    const origin = deliveries[0];
    const destination = deliveries[deliveries.length - 1];
    const urgentDelivery = deliveries.find(
      (d: any, i: number) => d.isUrgent && i > 0 && i < deliveries.length - 1
    );

    // 🔹 Criação do Prompt para o Gemini
    const prompt = `Você é um especialista em otimização de rotas de entrega.
Analise as seguintes paradas de entrega e sugira a ordem ideal para visitá-las, minimizando a distância total percorrida.

Entregas (Paradas):
${deliveries.map((d: any, i: number) =>
  `${i + 1}. ID: ${d.id} | Endereço: ${d.address} | Tipo: ${d.type} ${d.isUrgent ? '(URGENTE)' : ''} | Coordenadas: ${d.coordinates ? d.coordinates.join(', ') : 'não disponível'}`
).join('\n')}

REGRAS DE ORDENAÇÃO:
1. O primeiro item na lista de entrada (${origin ? origin.address : 'a origem'}) DEVE ser sempre a primeira parada na sua ordem otimizada.
2. ${urgentDelivery
    ? `A entrega URGENTE (ID: ${urgentDelivery.id}) deve ser a segunda parada, logo após a ORIGEM (regra 1).`
    : 'Não há entregas urgentes.'}
3. ${fixDestinationAtEnd
    ? `A última entrega na lista de entrada (${destination ? destination.address : 'o destino final'}) DEVE ser sempre a última parada na sua ordem otimizada.`
    : 'O destino final pode ser reorganizado se isso otimizar a rota.'}
4. Reorganize as paradas restantes (que não são origem, urgente ou destino final) com base na proximidade das coordenadas fornecidas para otimizar o percurso.
5. Otimize o percurso entre os pontos fixos. Se não houver destino final fixo, otimize todas as paradas após os pontos fixos iniciais (origem e, se houver, a parada urgente). Se houver um destino final fixo, otimize apenas as paradas que estão entre os pontos fixos iniciais e o destino final.

SAÍDA OBRIGATÓRIA:
- Retorne APENAS um objeto JSON.
- O JSON deve conter um array chamado "optimizedOrder" com TODOS os IDs das entregas na ordem otimizada.

Exemplo de formato de resposta: {"optimizedOrder": ["${origin?.id}", "id_urgente", "id_3", "id_4", ..., "${destination?.id}"]}`;

    console.log('Sending request to Gemini API...');

    // 🔹 Chamada à API do Gemini
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: prompt }] }
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
          systemInstruction: {
            parts: [{
              text: 'Você é um especialista em otimização de rotas. Sua única saída é um objeto JSON que segue estritamente a estrutura solicitada. NUNCA inclua texto ou explicações fora do JSON.'
            }]
          }
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Gemini API error:', response.status, errorData);

      let errorMessage = `Erro na API do Gemini: ${response.statusText}`;
      if (errorData?.error?.message) {
        errorMessage = `Erro Gemini: ${errorData.error.message}`;
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('AI response received:', data);

    const aiResponseContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponseContent) {
      throw new Error('Resposta da IA vazia ou malformada.');
    }

    // 🔹 Parse da resposta do Gemini
    let optimizedOrder: string[];
    try {
      const parsed = JSON.parse(aiResponseContent);
      optimizedOrder = parsed.optimizedOrder;

      if (!Array.isArray(optimizedOrder)) {
        throw new Error("JSON retornado não contém o array 'optimizedOrder'.");
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      console.log('Raw AI response:', aiResponseContent);
      
      // Fallback: retorna ordem original
      optimizedOrder = deliveries.map((d: any) => d.id);
    }

    console.log('Optimized order:', optimizedOrder);

    return new Response(
      JSON.stringify({ optimizedOrder }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('Error in optimize-route function:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error',
        details: error.stack
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});