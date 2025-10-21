import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para processar XML de nota fiscal
function processXMLInvoice(xmlData: string, corsHeaders: Record<string, string>) {
  try {
    console.log('Iniciando parse do XML...');
    
    // Remover namespaces para simplificar o matching com regex
    const xmlWithoutNamespaces = xmlData.replace(/<(\/)?([a-zA-Z0-9:]+)/g, "<$1$2");

    // Extrair endereço do emitente (origem)
    const emitMatch = xmlWithoutNamespaces.match(/<enderEmit>([\s\S]*?)<\/enderEmit>/);
    let originAddress = null;
    
    if (emitMatch) {
      const emitData = emitMatch[1];
      const logradouro = emitData.match(/<xLgr>([^<]+)<\/xLgr>/)?.[1] || '';
      const numero = emitData.match(/<nro>([^<]+)<\/nro>/)?.[1] || '';
      const complemento = emitData.match(/<xCpl>([^<]+)<\/xCpl>/)?.[1] || '';
      const bairro = emitData.match(/<xBairro>([^<]+)<\/xBairro>/)?.[1] || '';
      const municipio = emitData.match(/<xMun>([^<]+)<\/xMun>/)?.[1] || '';
      const uf = emitData.match(/<UF>([^<]+)<\/UF>/)?.[1] || '';
      const cep = emitData.match(/<CEP>([^<]+)<\/CEP>/)?.[1] || '';
      
      if (logradouro && municipio) {
        originAddress = `${logradouro}${numero ? ', ' + numero : ''}${complemento ? ' - ' + complemento : ''}${bairro ? ' - ' + bairro : ''}, ${municipio}${uf ? ' - ' + uf : ''}${cep ? ', ' + cep : ''}`;
      }
    }
    
    // Extrair endereço do destinatário (destino)
    const destMatch = xmlWithoutNamespaces.match(/<enderDest>([\s\S]*?)<\/enderDest>/);
    let destinationAddress = null;
    
    if (destMatch) {
      const destData = destMatch[1];
      const logradouro = destData.match(/<xLgr>([^<]+)<\/xLgr>/)?.[1] || '';
      const numero = destData.match(/<nro>([^<]+)<\/nro>/)?.[1] || '';
      const complemento = destData.match(/<xCpl>([^<]+)<\/xCpl>/)?.[1] || '';
      const bairro = destData.match(/<xBairro>([^<]+)<\/xBairro>/)?.[1] || '';
      const municipio = destData.match(/<xMun>([^<]+)<\/xMun>/)?.[1] || '';
      const uf = destData.match(/<UF>([^<]+)<\/UF>/)?.[1] || '';
      const cep = destData.match(/<CEP>([^<]+)<\/CEP>/)?.[1] || '';
      
      if (logradouro && municipio) {
        destinationAddress = `${logradouro}${numero ? ', ' + numero : ''}${complemento ? ' - ' + complemento : ''}${bairro ? ' - ' + bairro : ''}, ${municipio}${uf ? ' - ' + uf : ''}${cep ? ', ' + cep : ''}`;
      }
    }
    
    console.log('Endereços extraídos do XML:', { originAddress, destinationAddress });
    
    const extractedData = {
      origin: { address: originAddress },
      destination: { address: destinationAddress }
    };
    
    return new Response(
      JSON.stringify(extractedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Erro ao processar XML:', error);
    return new Response(
      JSON.stringify({ error: 'Erro ao processar arquivo XML' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileData, fileType } = await req.json();
    
    if (!fileData) {
      return new Response(
        JSON.stringify({ error: 'Arquivo não fornecido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Se for XML, processar diretamente
    if (fileType === 'xml') {
      console.log('Processando arquivo XML...');
      return processXMLInvoice(fileData, corsHeaders);
    }

    // Se não for XML, retorna erro pois a API da Groq não suporta imagens/PDFs
    console.log('Tipo de arquivo não suportado para extração automática:', fileType);
    return new Response(
      JSON.stringify({ error: 'Apenas arquivos XML são suportados para extração automática no momento.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro ao processar nota fiscal:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
