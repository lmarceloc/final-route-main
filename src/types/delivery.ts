export interface Delivery {
  id: string;
  address: string;
  coordinates?: [number, number];
  type: 'origin' | 'stop' | 'destination';
  priority: number;
  isUrgent?: boolean;
  gate_code?: string;
  notes?: string;
  package_locator?: string;
  package_count?: number;
  order_type?: 'Primeira' | 'Automática' | 'Última';
  stop_type?: 'Entrega' | 'Coleta';
  arrival_time?: string;
  time_at_stop?: number; // in minutes
}