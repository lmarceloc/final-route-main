import { useEffect, useRef } from 'react';
import L, { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Delivery } from '@/types/delivery';

// Garantir que o CSS do Leaflet seja carregado
const style = document.createElement('link');
style.rel = 'stylesheet';
style.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
if (!document.querySelector('link[href*="leaflet.css"]')) {
  document.head.appendChild(style);
}

// Correção essencial para que os ícones de marcador do Leaflet apareçam corretamente
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface DeliveryMapProps {
  deliveries: Delivery[];
}

export const DeliveryMap = ({ deliveries }: DeliveryMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const arrowMarkersRef = useRef<L.Marker[]>([]);

  // Inicialização do Mapa
  useEffect(() => {
    console.log('🗺️ Iniciando mapa...');

    if (!mapRef.current) {
      console.error('❌ mapRef.current é null!');
      return;
    }

    console.log('✅ mapRef.current existe:', mapRef.current);

    if (!mapInstanceRef.current) {
      try {
        console.log('🔧 Criando instância do mapa...');

        // Cria o mapa
        mapInstanceRef.current = L.map(mapRef.current, {
          center: [-25.0878184, -50.1196489], // Ponta Grossa
          zoom: 10,
        });

        console.log('✅ Mapa criado com sucesso!');

        // Adiciona o tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(mapInstanceRef.current);

        console.log('✅ Tiles adicionados!');

        // Força atualização do tamanho
        setTimeout(() => {
          if (mapInstanceRef.current) {
            mapInstanceRef.current.invalidateSize({ pan: false, animate: false }); // Adicione as opções para garantir
            console.log('✅ Tamanho do mapa forçado a invalidar');
          }
        }, 500);

      } catch (error) {
        console.error('❌ Erro ao criar mapa:', error);
      }
    }

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        console.log('🧹 Limpando mapa...');
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Atualização de Marcadores e Rota
  useEffect(() => {
    console.log('📍 Atualizando marcadores...', deliveries.length, 'entregas');

    if (!mapInstanceRef.current) {
      console.warn('⚠️ Mapa ainda não foi inicializado');
      return;
    }

    const map = mapInstanceRef.current;

    // Limpar camadas existentes
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    arrowMarkersRef.current.forEach(marker => marker.remove());
    arrowMarkersRef.current = [];
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }

    if (deliveries.length === 0) {
      console.log('ℹ️ Nenhuma entrega para exibir');
      return;
    }

    // Adicionar marcadores
    deliveries.forEach((delivery, index) => {
      if (!delivery.coordinates || delivery.coordinates.length !== 2) {
        console.warn('⚠️ Entrega sem coordenadas:', delivery.address);
        return;
      }

      console.log(`📍 Adicionando marcador ${index + 1}:`, delivery.coordinates);

      const isFirst = index === 0;
      const isLast = index === deliveries.length - 1;

      let backgroundColor;
      if (isFirst) {
        backgroundColor = 'hsl(142 76% 36%)'; // Verde
      } else if (isLast) {
        backgroundColor = 'hsl(0 84% 60%)'; // Vermelho
      } else {
        backgroundColor = 'hsl(38 92% 50%)'; // Laranja
      }

      const icon = L.divIcon({
        html: `<div style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; font-weight: bold; color: white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); background: ${backgroundColor}">${index + 1}</div>`,
        className: 'custom-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker(delivery.coordinates as LatLngExpression, { icon })
        .addTo(map)
        .bindPopup(`
          <div style="padding: 8px;">
            <h3 style="font-weight: bold; margin-bottom: 4px;">${delivery.address}</h3>
            <p style="font-size: 12px; color: #666;">${delivery.type === 'origin' ? 'Origem' : delivery.type === 'destination' ? 'Destino' : 'Parada'}</p>
          </div>
        `);

      markersRef.current.push(marker);
    });

    console.log(`✅ ${markersRef.current.length} marcadores adicionados`);

    // Criar rota
    const validCoords = deliveries
      .filter(d => d.coordinates && d.coordinates.length === 2)
      .map(d => d.coordinates as [number, number]);

    if (validCoords.length > 1) {
      console.log('🛣️ Criando rota com', validCoords.length, 'pontos');

      routeLineRef.current = L.polyline(validCoords as LatLngExpression[], {
        color: 'hsl(142 76% 36%)',
        weight: 5,
        opacity: 0.9,
        smoothFactor: 1,
        dashArray: '10, 5',
      }).addTo(map);

      // Adicionar setas
      for (let i = 0; i < validCoords.length - 1; i++) {
        const start = validCoords[i];
        const end = validCoords[i + 1];
        const midLat = (start[0] + end[0]) / 2;
        const midLng = (start[1] + end[1]) / 2;

        const angle = Math.atan2(end[1] - start[1], end[0] - start[0]) * (180 / Math.PI) + 90;

        const rotatedArrowIcon = L.divIcon({
          html: `<div style="font-size: 20px; color: hsl(142 76% 36%); transform: rotate(${angle}deg); transform-origin: center;">▲</div>`,
          className: 'arrow-icon',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        const arrowMarker = L.marker([midLat, midLng], { icon: rotatedArrowIcon }).addTo(map);
        arrowMarkersRef.current.push(arrowMarker);
      }

      // Ajustar visualização
      const bounds = L.latLngBounds(validCoords as LatLngExpression[]);
      map.fitBounds(bounds, { padding: [50, 50] });

      console.log('✅ Rota criada e mapa ajustado');

    } else if (validCoords.length === 1) {
      map.setView(validCoords[0] as LatLngExpression, 16);
      console.log('✅ Mapa centrado no único ponto');
    }

    // Força recálculo
    setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize({ pan: false, animate: false });
        console.log('✅ Tamanho do mapa forçado a invalidar após 500ms');
      }
    }, 500);

  }, [deliveries]);

  return (
    <div
      ref={mapRef}
      style={{
        height: '850px',
        width: '70%',
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '500px',
        position: 'absolute',
        zIndex: 0
      }}
    />
  );
};