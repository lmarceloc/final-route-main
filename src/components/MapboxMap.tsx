import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Delivery } from '@/types/delivery';

interface MapboxMapProps {
    deliveries: Delivery[];
    route?: any;
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export const MapboxMap = ({ deliveries, route }: MapboxMapProps) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const markersRef = useRef<mapboxgl.Marker[]>([]);

    // Initialize map
    useEffect(() => {
        if (!mapContainer.current || map.current) return;
        if (!MAPBOX_TOKEN) {
            console.error('Mapbox token ausente. Defina VITE_MAPBOX_TOKEN no ambiente.');
            return;
        }

        mapboxgl.accessToken = MAPBOX_TOKEN;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/mapbox/light-v11',
            center: [-46.633308, -23.550520],
            zoom: 11,
        });

        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, []);

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
            <div ref={mapContainer} className="absolute inset-0" />
        </div>
    );
};
