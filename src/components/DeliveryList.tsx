import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { Delivery } from '@/types/delivery';
import { GripVertical, MapPin, Trash2, Pencil, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface DeliveryListProps {
  deliveries: Delivery[];
  onReorder: (result: DropResult) => void;
  onRemove: (deliveryId: string) => void;
  onEdit: (id: string) => void;
}

export const DeliveryList = ({ deliveries, onReorder, onRemove, onEdit }: DeliveryListProps) => {
  const getTypeLabel = (type: Delivery['type']) => {
    const labels = {
      origin: 'Origem',
      stop: 'Parada',
      destination: 'Destino Final'
    };
    return labels[type];
  };

  const getTypeColor = (type: Delivery['type']) => {
    const colors = {
      origin: 'bg-primary/10 text-primary border-primary/20',
      stop: 'bg-accent/10 text-accent border-accent/20',
      destination: 'bg-secondary/10 text-secondary border-secondary/20'
    };
    return colors[type];
  };

  return (
    <DragDropContext onDragEnd={onReorder}>
      <Droppable droppableId="deliveries">
        {(provided, snapshot) => (
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
            className={`space-y-3 p-4 rounded-lg transition-colors ${
              snapshot.isDraggingOver ? 'bg-muted/50' : ''
            }`}
          >
            {deliveries.length === 0 ? (
              <Card className="p-8 text-center">
                <MapPin className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  Nenhuma entrega adicionada ainda
                </p>
              </Card>
            ) : (
              deliveries.map((delivery, index) => (
                <Draggable
                  key={delivery.id}
                  draggableId={delivery.id}
                  index={index}
                  isDragDisabled={delivery.type === 'origin' || delivery.type === 'destination' || !!delivery.isUrgent}
                >
                  {(provided, snapshot) => (
                    <Card
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`p-4 transition-all ${
                        snapshot.isDragging 
                          ? 'shadow-elevated rotate-1 scale-105' 
                          : 'shadow-sm hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          {...provided.dragHandleProps}
                          className={`flex-shrink-0 pt-1 ${
                            delivery.type === 'origin' || delivery.type === 'destination'
                              ? 'opacity-30 cursor-not-allowed'
                              : 'cursor-grab active:cursor-grabbing'
                          }`}
                        >
                          <GripVertical className="h-5 w-5 text-muted-foreground" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex items-center gap-1">
                              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-sm">
                                {index + 1}
                              </span>
                              {index < deliveries.length - 1 && (
                                <span className="text-secondary text-lg font-bold">→</span>
                              )}
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getTypeColor(delivery.type)}`}>
                              {getTypeLabel(delivery.type)}
                            </span>
                            {delivery.isUrgent && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-destructive/10 text-destructive border-destructive/20"><Pin className="h-3 w-3" /> Urgente</span>
                            )}
                          </div>
                          <p className="font-medium text-foreground truncate">
                            {delivery.address}
                          </p>
                          {delivery.coordinates && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {delivery.coordinates[0].toFixed(6)}, {delivery.coordinates[1].toFixed(6)}
                            </p>
                          )}
                        </div>

                        <div className="flex-shrink-0 flex flex-col -my-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEdit(delivery.id)}
                            className="h-8 w-8 hover:bg-accent/10 hover:text-accent-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onRemove(delivery.id)}
                            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )}
                </Draggable>
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};
