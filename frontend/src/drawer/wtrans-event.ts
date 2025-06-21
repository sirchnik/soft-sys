import { createWT } from "../services/wtransport";
import { DomainEvent, EventBus, EventHandler } from "./events";

export class WTransEvent {
  private readonly wt: WebTransport;
  constructor(private readonly eventBus: EventBus, private readonly canvas_id) {
    this.wt = createWT();
  }

  public async disconnect(): Promise<void> {
    if (this.wt) {
      await this.wt.close();
      console.log("WebTransport connection closed");
    } else {
      console.warn("No WebTransport connection to close");
    }
  }

  public async connect(): Promise<unknown> {
    await this.wt.ready;
    this.wt.closed.then(() => {
      console.log("WebTransport connection closed");
    });
    const stream = await this.wt.createBidirectionalStream();
    const writer = stream.writable.getWriter();
    await writer.write(
      new TextEncoder().encode(
        JSON.stringify({
          command: "register",
          canvas_id: this.canvas_id,
        })
      )
    );
    writer.releaseLock();
    const receive = this.receiveForward(stream);
    const send = this.sendForward(stream);
    return Promise.all([receive, send]);
  }

  private sendForward(stream: WebTransportBidirectionalStream): void {
    const writer = stream.writable.getWriter();
    this.eventBus.subscribeToAll((event: DomainEvent) => {
      if (event.payload.temporary || event.payload.from_wtrans) {
        return;
      }
      const data = new TextEncoder().encode(JSON.stringify(event) + "\n");
      void writer.write(data).catch((error) => {
        console.error("Error writing to WebTransport stream:", error);
      });
      console.log("send msg");
    });
  }

  private async receiveForward(stream: WebTransportBidirectionalStream) {
    const reader = stream.readable.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log("done");
        break;
      }

      const decodedValue = new TextDecoder().decode(value);
      let parsed: unknown;
      try {
        parsed = JSON.parse(decodedValue);
      } catch (error) {
        console.error("Error parsing received data:", decodedValue, error);
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
          payload: { ...event.payload, from_wtrans: true },
        });
      });
    }
  }
}
