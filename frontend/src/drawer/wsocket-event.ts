import { DomainEvent, EventBus, EventHandler } from "./events";

export class WSocketEvent {
  private readonly ws: WebSocket;
  constructor(private readonly eventBus: EventBus, private readonly canvas_id) {
    this.ws = new WebSocket("ws://localhost:8001");
  }

  public async disconnect(): Promise<void> {
    this.ws.close();
  }

  public async connect(): Promise<unknown> {
    this.ws.onopen = () => {
      this.ws.send(
        JSON.stringify({
          command: "register",
          canvas_id: this.canvas_id,
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
      if (event.payload.temporary || event.payload.from_wsocket) {
        return;
      }
      const data = JSON.stringify(event);
      try {
        this.ws.send(data);
        console.log("send msg");
      } catch (error) {
        console.error("Error sending to WebSocket:", error);
      }
    });
  }

  private receiveForward(data: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch (error) {
      console.error("Error parsing received data:", data, error);
    }
    const events: DomainEvent[] = Array.isArray(parsed)
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
      });
    });
  }
}
