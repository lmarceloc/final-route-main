import { useEffect, useRef } from 'react';
import L, { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Delivery } from '@/types/delivery';

// Correção essencial para que os ícones de marcador do Leaflet apareçam corretamente
// em ambientes bundlers modernos (como Webpack/Vite/Next.js)
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

  // ------------------------------------------------
// 1. Inicialização do Mapa (Apenas uma vez)
// ------------------------------------------------
useEffect(() => {
  if (!mapRef.current) return;

  if (!mapInstanceRef.current) {
    // Cria o mapa com fallback inicial
    mapInstanceRef.current = L.map(mapRef.current, {
      center: [-23.550520, -46.633308], // São Paulo (fallback)
      zoom: 12,
    });

    // Adiciona o tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(mapInstanceRef.current);

    // Chama invalidateSize quando o mapa estiver pronto
    mapInstanceRef.current.whenReady(() => {
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 0);
    });

    // 🚀 Tenta obter a localização do usuário
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          mapInstanceRef.current?.setView([latitude, longitude], 13);

          // Adiciona um marcador mostrando "Você está aqui"
          L.marker([latitude, longitude])
            .addTo(mapInstanceRef.current!)
            .bindPopup('Você está aqui')
            .openPopup();
        },
        (error) => {
          console.warn('Erro ao obter localização do usuário:', error.message);
          // Fallback automático para SP se o usuário negar
          mapInstanceRef.current?.setView([-23.550520, -46.633308], 12);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    } else {
      console.warn('Geolocalização não suportada neste navegador.');
    }
  }

  // Cleanup
  return () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
  };
}, []);

  // ------------------------------------------------
  // 2. Atualização de Marcadores e Rota (Sempre que 'deliveries' mudar)
  // ------------------------------------------------
  useEffect(() => {
    if (!mapInstanceRef.current) return;

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

    // Adicionar marcadores
    deliveries.forEach((delivery, index) => {
      if (!delivery.coordinates || delivery.coordinates.length !== 2) return; 

      const isFirst = index === 0;
      const isLast = index === deliveries.length - 1;
      
      let backgroundColor;
      if (isFirst) {
        backgroundColor = 'hsl(142 76% 36%)'; // Verde (Início)
      } else if (isLast) {
        backgroundColor = 'hsl(0 84% 60%)'; // Vermelho (Fim)
      } else {
        backgroundColor = 'hsl(38 92% 50%)'; // Laranja (Parada)
      }

      const icon = L.divIcon({
        html: `<div class="flex items-center justify-center w-8 h-8 rounded-full font-bold text-white shadow-lg" style="background: ${backgroundColor}">${index + 1}</div>`,
        className: 'custom-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker(delivery.coordinates as LatLngExpression, { icon })
        .addTo(map)
        .bindPopup(`
          <div class="p-2">
            <h3 class="font-bold">${delivery.address}</h3>
            <p class="text-sm text-muted-foreground">${delivery.type === 'origin' ? 'Origem' : delivery.type === 'destination' ? 'Destino' : 'Parada'}</p>
          </div>
        `);

      markersRef.current.push(marker);
    });

    // Criar rota
    const validCoords = deliveries
      .filter(d => d.coordinates && d.coordinates.length === 2)
      .map(d => d.coordinates as [number, number]);

    if (validCoords.length > 1) {
      routeLineRef.current = L.polyline(validCoords as LatLngExpression[], {
        color: 'hsl(142 76% 36%)',
        weight: 5,
        opacity: 0.9,
        smoothFactor: 1,
        dashArray: '10, 5',
      }).addTo(map);

      // Adicionar setas (direção)
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

      // Ajustar o mapa para mostrar tudo
      const bounds = L.latLngBounds(validCoords as LatLngExpression[]);
      map.fitBounds(bounds, { padding: [50, 50] });

    } else if (validCoords.length === 1) {
        map.setView(validCoords[0] as LatLngExpression, 16);
    }
    
    // Força o Leaflet a recalcular o tamanho após atualizar o conteúdo, garantindo que o mapa se ajuste.
    setTimeout(() => map.invalidateSize(), 0);
    
  }, [deliveries]); 

  return (
    <div style={{ height: '100vh' }}>
  <DeliveryMap deliveries={deliveries} />
</div>

  );
};