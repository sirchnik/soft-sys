export enum EventTypes {
  ADD_SHAPE_EVENT = "ADD_SHAPE",
  REMOVE_SHAPE_EVENT = "REMOVE_SHAPE",
  MOVE_TO_FRONT_EVENT = "MOVE_TO_FRONT",
  MOVE_TO_BACK_EVENT = "MOVE_TO_BACK",
  SET_BACKGROUND_COLOR_EVENT = "SET_BACKGROUND_COLOR",
  SET_BORDER_COLOR_EVENT = "SET_BORDER_COLOR",
  CLEAR_CANVAS_EVENT = "CLEAR_CANVAS_EVENT",
  // SELECTION_CLEARED_EVENT = "SELECTION_CLEARED", // Example if needed
}

// Define Point2D structure for event payloads
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

// Define a base payload for shape properties
export interface BaseShapePayload {
  id: number; // ID is mandatory for an existing shape being added/recreated
  shapeType: "Line" | "Circle" | "Rectangle" | "Triangle";
  backgroundColor?: string;
  borderColor?: string;
  temporary?: boolean; // For temporary shapes like rubber bands
  forTriangleFactory?: boolean; // Special flag for triangle factory's temp lines
}

export type AddShapePayload = BaseShapePayload &
  (
    | { shapeType: "Line"; from: Point2D; to: Point2D }
    | { shapeType: "Circle"; center: Point2D; radius: number }
    | { shapeType: "Rectangle"; from: Point2D; to: Point2D }
    | { shapeType: "Triangle"; p1: Point2D; p2: Point2D; p3: Point2D }
  );

export type DomainEvent = {
  timestamp?: number; // Timestamp will be set by EventBus dispatch
} & (
  | {
      type: EventTypes.ADD_SHAPE_EVENT;
      payload: AddShapePayload;
    }
  | {
      type: EventTypes.REMOVE_SHAPE_EVENT;
      payload: {
        shapeId: number;
        temporary?: boolean;
        forTriangleFactory?: boolean;
      };
    }
  | {
      type: EventTypes.MOVE_TO_FRONT_EVENT;
      payload: {
        shapeId: number;
      };
    }
  | {
      type: EventTypes.MOVE_TO_BACK_EVENT;
      payload: {
        shapeId: number;
      };
    }
  | {
      type: EventTypes.SET_BACKGROUND_COLOR_EVENT;
      payload: {
        shapeId: number;
        color: string;
      };
    }
  | {
      type: EventTypes.SET_BORDER_COLOR_EVENT;
      payload: {
        shapeId: number;
        color: string;
      };
    }
  | {
      type: EventTypes.CLEAR_CANVAS_EVENT;
      payload: {}; // No specific payload needed
    }
);
// | { type: EventTypes.SELECTION_CLEARED_EVENT; payload: {} }

export type EventHandler<E extends DomainEvent> = (event: E) => void;

// New type for storing subscribers in a typesafe way
type TypedSubscribers = {
  [T in EventTypes]?: Array<EventHandler<Extract<DomainEvent, { type: T }>>>;
};

export class EventBus {
  // Changed subscribers to use TypedSubscribers for better type safety
  private subscribers: TypedSubscribers = {};
  private allEventsSubscribers: EventHandler<DomainEvent>[] = [];

  subscribe<T extends EventTypes>(
    eventType: T,
    handler: EventHandler<Extract<DomainEvent, { type: T }>>
  ): void {
    if (!this.subscribers[eventType]) {
      this.subscribers[eventType] = [];
    }
    // The type assertion is no longer needed due to the improved signature
    this.subscribers[eventType]!.push(handler);
  }

  subscribeToAll(handler: EventHandler<DomainEvent>): void {
    this.allEventsSubscribers.push(handler);
  }

  dispatch<E extends DomainEvent>(event: E): void {
    const completeEvent = {
      ...event,
      timestamp: event.timestamp || Date.now(),
    };

    // Retrieve handlers in a typesafe manner
    const handlers = this.subscribers[completeEvent.type];
    if (handlers) {
      // Call each handler with the correctly typed event
      handlers.forEach((handlerCallback) => {
        // Renamed 'handler' to 'handlerCallback' to avoid shadowing
        try {
          handlerCallback(completeEvent);
        } catch (error) {
          console.error(
            `Error in event handler for ${completeEvent.type}:`,
            error
          );
        }
      });
    }
    this.allEventsSubscribers.forEach((handler) => {
      try {
        handler(completeEvent);
      } catch (error) {
        console.error("Error in all-event subscriber:", error);
      }
    });
  }
}
