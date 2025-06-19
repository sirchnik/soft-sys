import { createWT } from "../services/wtransport";
import { DomainEvent, EventBus, EventHandler } from "./events";

export class WTransEvent {
  private readonly wt: WebTransport;
  constructor(private readonly eventBus: EventBus) {
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
    const receive = this.receiveForward(stream);
    const send = this.sendForward(stream);
    return Promise.all([receive, send]);
  }

  private sendForward(stream: WebTransportBidirectionalStream): void {
    const writer = stream.writable.getWriter();
    this.eventBus.subscribeToAll((event: DomainEvent) => {
      if (event.payload.temporary) {
        return;
      }
      const data = new TextEncoder().encode(JSON.stringify(event));
      writer.write(data).catch((error) => {
        console.error("Error writing to WebTransport stream:", error);
      });
    });
  }

  private async receiveForward(stream: WebTransportBidirectionalStream) {
    const reader = stream.readable.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const event: DomainEvent = JSON.parse(new TextDecoder().decode(value));
      this.eventBus.dispatch(event);
    }
  }
}
