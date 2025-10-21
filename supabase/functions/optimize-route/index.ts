import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { deliveries, fixDestinationAtEnd } = await req.json();
    console.log('Received deliveries for optimization:', deliveries);

    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    if (!GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not configured');
    }

    const urgentDelivery = deliveries.find((d: any) => d.isUrgent);

    // Prepare prompt for Gemini
    const prompt = `Você é um especialista em otimização de rotas de entrega. 
Analise as seguintes entregas e sugira a melhor ordem para visitá-las, minimizando a distância total percorrida.

Entregas:
${deliveries.map((d: any, i: number) => `${i + 1}. ${d.address} - Tipo: ${d.type}${d.isUrgent ? ' (URGENTE)' : ''} - Coordenadas: ${d.coordinates ? d.coordinates.join(', ') : 'não disponível'}`).join('\n')}

IMPORTANTE:
- A ORIGEM sempre deve ser a primeira parada
- ${urgentDelivery ? `A entrega URGENTE (${urgentDelivery.address}) deve ser a segunda parada, logo após a ORIGEM.` : ''}
- ${fixDestinationAtEnd ? 'O DESTINO FINAL sempre deve ser a última parada.' : 'O DESTINO FINAL pode ser reorganizado se isso otimizar a rota.'}
- Reorganize as PARADAS (e o DESTINO FINAL, se permitido) para otimizar a rota.
- Retorne APENAS um array JSON com os IDs na ordem otimizada
- Formato de resposta: {"optimizedOrder": ["id1", "id2", "id3", ...]}
- Considere a proximidade geográfica e o fluxo lógico das entregas

IDs das entregas: ${deliveries.map((d: any) => d.id).join(', ')}`;

    console.log('Sending request to Lovable AI Gateway...');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { 
            role: 'system', 
            content: 'Você é um especialista em otimização de rotas. Responda sempre em JSON válido.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();      
      console.error('Groq API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente mais tarde.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes. Adicione créditos à sua workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Groq API error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('AI response received:', data);

    const aiResponse = data.choices[0].message.content;
    console.log('AI content:', aiResponse);

    // Parse the JSON response from AI
    let optimizedOrder;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        optimizedOrder = parsed.optimizedOrder;
      } else {
        throw new Error('No JSON found in AI response');
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      console.log('Raw AI response:', aiResponse);
      // Fallback: return original order
      optimizedOrder = deliveries.map((d: any) => d.id);
    }

    console.log('Optimized order:', optimizedOrder);

    return new Response(
      JSON.stringify({ optimizedOrder }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in optimize-route function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
