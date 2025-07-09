import { navigateTo } from "../router";
import { DomainEvent, EventBus, EventHandler } from "./events";

export class WSocketEvent {
  private readonly ws: WebSocket;
  constructor(private readonly eventBus: EventBus, private readonly canvas_id) {
    this.ws = new WebSocket("ws://localhost:8001");
  }

  public async disconnect(): Promise<void> {
    console.log("called disconnect");
    this.ws.close();
  }

  public async connect(): Promise<unknown> {
    this.ws.onopen = () => {
      this.ws.send(
        JSON.stringify({
          type: "register",
          canvas_id: this.canvas_id,
          payload: true,
          timestamp: Date.now(),
        })
      );
    };
    this.ws.onclose = () => {
      console.log("WebSocket connection closed");
    };
    this.ws.onerror = (err) => {
      console.error("WebSocket error:", err);
    };
    this.ws.onmessage = (event) => {
      this.receiveForward(event.data);
    };
    this.sendForward();
    return Promise.resolve();
  }

  private sendForward(): void {
    this.eventBus.subscribeToAll((event: DomainEvent) => {
      const wsEvent: WSDomainEvent = event as WSDomainEvent;
      if (wsEvent.payload.temporary || wsEvent.payload.from_wsocket) {
        return;
      }
      const data = JSON.stringify({ ...event, canvas_id: this.canvas_id });
      try {
        this.ws.send(data);
        console.log("send msg");
      } catch (error) {
        console.error("Error sending to WebSocket:", error);
      }
    });
  }

  private receiveForward(data: string) {
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch (error) {
      console.error("Error parsing received data:", data, error);
    }
    if (parsed.type === "PING") {
      this.ws.send(
        JSON.stringify({
          type: "PONG",
          timestamp: 0,
          canvas_id: this.canvas_id,
          payload: {},
        })
      );
      return;
    }
    const events: WSDomainEvent[] = Array.isArray(parsed)
      ? parsed
          .map((e) => {
            try {
              const parsed = JSON.parse(e);
              if (Array.isArray(parsed)) {
                return parsed.map((e) => JSON.parse(e));
              }
              return parsed;
            } catch (error) {
              console.error("Error parsing event:", e, error);
              return null;
            }
          })
          .flat()
      : [parsed];
    events.forEach((event) => {
      this.eventBus.dispatch({
        ...event,
        payload: { ...event.payload, from_wsocket: true },
      } as DomainEvent);
    });
  }
}

type WSDomainEvent = {
  type: string;
  payload: Record<string, unknown> & {
    from_wsocket?: boolean;
    temporary?: boolean;
  };
  canvas_id: string;
  timestamp?: number;
};
