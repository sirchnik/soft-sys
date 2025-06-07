import { init as initDrawer } from "./drawer/drawer";

export function canvas(pageContent: HTMLElement) {
  document.title = "Canvas";
  const content = `
      <p>
        Wählen Sie auf der linken Seite Ihr Zeichenwerkzeug aus. Haben Sie eines
        ausgewählt, können Sie mit der Maus die entsprechenden Figuren zeichnen.
        Typischerweise, indem Sie die Maus drücken, dann mit gedrückter
        Maustaste die Form bestimmen, und dann anschließend die Maustaste
        loslassen.
      </p>
      <p>Mit shift kann man die Shapes verschieben.</p>
      <ul class="tools"></ul>
      <canvas id="drawArea" width="1024" height="500"></canvas>
      <div class="event-stream-container">
        <textarea id="eventStream" rows="10" cols="130"></textarea>
        <button id="loadEventsButton">Load Events</button>
      </div>
    `;
  pageContent.innerHTML = content;
  return initDrawer();
}
