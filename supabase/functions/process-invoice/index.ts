// @noAuth
// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

console.log("📦 Process Invoice Function Initialized");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// 🔹 Monta endereço legível
function buildAddress(addressData: { [key: string]: string | undefined }): string | null {
  const { logradouro, numero, complemento, bairro, municipio, uf, cep } = addressData;
  if (!logradouro && !municipio) return null;
  return `${logradouro || ''}${numero ? ', ' + numero : ''}${complemento ? ' - ' + complemento : ''}${bairro ? ' - ' + bairro : ''}, ${municipio || ''}${uf ? ' - ' + uf : ''}${cep ? ', ' + cep : ''}`.trim();
}

// 🔹 Extrai origem e destino de um XML NF-e/CT-e
function processXMLInvoice(xmlData: string) {
  try {
    // Remove namespaces padrão e prefixados
    const xml = xmlData
      .replace(/xmlns(:\w+)?="[^"]*"/g, "")
      .replace(/<\w+:(\w+)/g, "<$1")
      .replace(/<\/\w+:(\w+)/g, "</$1");

    const isNFe = xml.includes("<NFe") || xml.includes("<nfeProc");
    const isCTe = xml.includes("<CTe") || xml.includes("<cteProc");

    let origin = null;
    let destination = null;

    if (isNFe) {
      const emit = xml.match(/<emit>[\s\S]*?<enderEmit>([\s\S]*?)<\/enderEmit>[\s\S]*?<\/emit>/i);
      if (emit) {
        const data = emit[1];
        origin = {
          name: xml.match(/<emit>[\s\S]*?<xNome>([^<]+)<\/xNome>/i)?.[1]?.trim(),
          cnpj: xml.match(/<emit>[\s\S]*?<CNPJ>([^<]+)<\/CNPJ>/i)?.[1]?.trim(),
          address: buildAddress({
            logradouro: data.match(/<xLgr>([^<]+)<\/xLgr>/i)?.[1]?.trim(),
            numero: data.match(/<nro>([^<]+)<\/nro>/i)?.[1]?.trim(),
            complemento: data.match(/<xCpl>([^<]+)<\/xCpl>/i)?.[1]?.trim(),
            bairro: data.match(/<xBairro>([^<]+)<\/xBairro>/i)?.[1]?.trim(),
            municipio: data.match(/<xMun>([^<]+)<\/xMun>/i)?.[1]?.trim(),
            uf: data.match(/<UF>([^<]+)<\/UF>/i)?.[1]?.trim(),
            cep: data.match(/<CEP>([^<]+)<\/CEP>/i)?.[1]?.trim(),
          }),
        };
      }

      const dest = xml.match(/<dest>[\s\S]*?<enderDest>([\s\S]*?)<\/enderDest>[\s\S]*?<\/dest>/i);
      if (dest) {
        const data = dest[1];
        destination = {
          name: xml.match(/<dest>[\s\S]*?<xNome>([^<]+)<\/xNome>/i)?.[1]?.trim(),
          cnpj: xml.match(/<dest>[\s\S]*?<CNPJ>([^<]+)<\/CNPJ>/i)?.[1]?.trim(),
          address: buildAddress({
            logradouro: data.match(/<xLgr>([^<]+)<\/xLgr>/i)?.[1]?.trim(),
            numero: data.match(/<nro>([^<]+)<\/nro>/i)?.[1]?.trim(),
            complemento: data.match(/<xCpl>([^<]+)<\/xCpl>/i)?.[1]?.trim(),
            bairro: data.match(/<xBairro>([^<]+)<\/xBairro>/i)?.[1]?.trim(),
            municipio: data.match(/<xMun>([^<]+)<\/xMun>/i)?.[1]?.trim(),
            uf: data.match(/<UF>([^<]+)<\/UF>/i)?.[1]?.trim(),
            cep: data.match(/<CEP>([^<]+)<\/CEP>/i)?.[1]?.trim(),
          }),
        };
      }
    }

    if (isCTe) {
      const ideMatch = xml.match(/<ide>([\s\S]*?)<\/ide>/i);
      const municipioOrigem = ideMatch?.[1]?.match(/<xMunIni>([^<]+)<\/xMunIni>/i)?.[1];
      const ufOrigem = ideMatch?.[1]?.match(/<UFIni>([^<]+)<\/UFIni>/i)?.[1];
      const municipioDestino = ideMatch?.[1]?.match(/<xMunFim>([^<]+)<\/xMunFim>/i)?.[1];
      const ufDestino = ideMatch?.[1]?.match(/<UFFim>([^<]+)<\/UFFim>/i)?.[1];
      origin = { address: `${municipioOrigem}, ${ufOrigem}` };
      destination = { address: `${municipioDestino}, ${ufDestino}` };
    }

    return { origin, destination };
  } catch (err) {
    console.error("Erro ao processar XML:", err);
    throw err;
  }
}

// 🔹 Main handler
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { files } = await req.json();

    if (!Array.isArray(files) || files.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhum arquivo XML enviado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = files.map(f => processXMLInvoice(f.fileData));
    const origins = results.map(r => r.origin).filter(Boolean);
    const destinations = results.map(r => r.destination).filter(Boolean);

    const sameOrigin = origins.length > 0 && origins.every(o =>
      o?.address === origins[0]?.address && o?.cnpj === origins[0]?.cnpj
    );

    return new Response(JSON.stringify({
      sameOrigin,
      origin: sameOrigin ? origins[0] : origins,
      destinations,
      totalFiles: files.length,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ Erro geral:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
