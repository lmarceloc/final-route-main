import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Delivery } from '@/types/delivery';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface MapboxMapProps {
    deliveries: Delivery[];
    route?: any;
}

export const MapboxMap = ({ deliveries, route }: MapboxMapProps) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const markersRef = useRef<mapboxgl.Marker[]>([]);
    const [mapboxToken, setMapboxToken] = useState(localStorage.getItem('mapboxPublicToken') || '');
    const [tokenInput, setTokenInput] = useState('');
    const [isTokenSet, setIsTokenSet] = useState(!!localStorage.getItem('mapboxPublicToken'));

    const handleSaveToken = () => {
        if (!tokenInput.trim()) return;
        localStorage.setItem('mapboxPublicToken', tokenInput.trim());
        setMapboxToken(tokenInput.trim());
        setIsTokenSet(true);
    };

    // Initialize map
    useEffect(() => {
        if (!mapContainer.current || map.current || !isTokenSet || !mapboxToken) return;

        mapboxgl.accessToken = mapboxToken;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [-46.633308, -23.550520],
            zoom: 12,
        });

        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, [isTokenSet, mapboxToken]);

    // Update markers
    useEffect(() => {
        if (!map.current) return;

        // Remove existing markers
        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];

        // Add markers for each delivery
        deliveries.forEach((delivery, index) => {
            if (!delivery.coordinates) return;

            const isFirst = index === 0;
            const isLast = index === deliveries.length - 1;

            let backgroundColor;
            if (isFirst) {
                backgroundColor = '#22c55e'; // Verde
            } else if (isLast) {
                backgroundColor = '#ef4444'; // Vermelho
            } else {
                backgroundColor = '#f97316'; // Laranja
            }

            const el = document.createElement('div');
            el.className = 'custom-marker';
            el.style.cssText = `
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: ${backgroundColor};
        color: white;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer;
      `;
            el.textContent = (index + 1).toString();

            const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div style="padding: 8px; color: #000;">
          <h3 style="font-weight: bold; margin-bottom: 4px;">#${index + 1}</h3>
          <p style="margin: 0;">${delivery.address}</p>
        </div>
      `);

            const marker = new mapboxgl.Marker(el)
                .setLngLat([delivery.coordinates[1], delivery.coordinates[0]])
                .setPopup(popup)
                .addTo(map.current!);

            markersRef.current.push(marker);
        });

        // Fit bounds to show all markers
        if (deliveries.length > 0) {
            const validCoords = deliveries
                .filter(d => d.coordinates)
                .map(d => d.coordinates as [number, number]);

            if (validCoords.length > 0) {
                const bounds = new mapboxgl.LngLatBounds();
                validCoords.forEach(coord => {
                    bounds.extend([coord[1], coord[0]]);
                });
                map.current!.fitBounds(bounds, { padding: 50 });
            }
        }
    }, [deliveries]);

    // Update route
    useEffect(() => {
        if (!map.current || !route) return;

        const addRoute = () => {
            if (!map.current) return;

            // Remove existing route layer and source
            if (map.current.getLayer('route')) {
                map.current.removeLayer('route');
            }
            if (map.current.getSource('route')) {
                map.current.removeSource('route');
            }

            // Add route if available
            if (route && route.routeGeometry) {
                map.current.addSource('route', {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        properties: {},
                        geometry: route.routeGeometry,
                    },
                });

                map.current.addLayer({
                    id: 'route',
                    type: 'line',
                    source: 'route',
                    layout: {
                        'line-join': 'round',
                        'line-cap': 'round',
                    },
                    paint: {
                        'line-color': '#22c55e',
                        'line-width': 5,
                        'line-opacity': 0.9,
                    },
                });
            }
        }

        // Wait for map to be loaded
        if (!map.current.isStyleLoaded()) {
            map.current.once('load', addRoute);
        } else {
            addRoute();
        }
    }, [route]);

    return (
        <div className="w-full h-full relative">
            {!isTokenSet ? (
                <Card className="absolute inset-0 flex items-center justify-center p-6 z-10 bg-background/95">
                    <div className="max-w-md w-full space-y-4">
                        <div className="space-y-2 text-center">
                            <h3 className="text-lg font-semibold">Token Público Mapbox Necessário</h3>
                            <p className="text-sm text-muted-foreground">
                                Para exibir o mapa, você precisa fornecer um token público do Mapbox (começa com "pk.").
                                Obtenha seu token em: <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noopener noreferrer" className="text-primary underline">mapbox.com</a>
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Input
                                type="text"
                                placeholder="pk.ey..."
                                value={tokenInput}
                                onChange={(e) => setTokenInput(e.target.value)}
                                className="flex-1"
                            />
                            <Button onClick={handleSaveToken}>Salvar</Button>
                        </div>
                    </div>
                </Card>
            ) : (
                <div className="w-full h-[calc(100vh-80px)] relative">
                    <div ref={mapContainer} className="absolute inset-0" />
                </div>

            )}
        </div>
    );
};