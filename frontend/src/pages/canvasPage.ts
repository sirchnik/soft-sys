export function canvasPage(pageContent: HTMLElement) {
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

  const canvasDomElm = document.getElementById("drawArea") as HTMLCanvasElement;
  const menu = document.getElementsByClassName("tools")[0];
  const eventStreamTextArea = document.getElementById(
    "eventStream"
  ) as HTMLTextAreaElement;
  const loadEventsButton = document.getElementById(
    "loadEventsButton"
  ) as HTMLButtonElement;

  if (!eventStreamTextArea || !loadEventsButton) {
    console.error("Event stream textarea or load button not found!");
    return;
  }

  const eventBus = new EventBus();

  let canvas: Canvas;
  const sm: ShapeManager = {
    addShape(s, rd, temp) {
      return canvas.addShape(s, rd, temp);
    },
    removeShape(s, rd, temp) {
      return canvas.removeShape(s, rd, temp);
    },
    removeShapeWithId(id, rd, temp) {
      return canvas.removeShapeWithId(id, rd, temp);
    },
    getShapes() {
      return canvas.getShapes();
    },
    redraw() {
      return canvas.redraw();
    },
    moveToFront(shape) {
      canvas.moveToFront(shape);
    },
    moveToBack(shape) {
      canvas.moveToBack(shape);
    },
    getShapeById(id) {
      return canvas.getShapeById(id);
    },
    recreateShape(payload) {
      return canvas.recreateShape(payload);
    },
    clearAllShapes() {
      canvas.clearAllShapes();
    },
  };
  const shapesSelector: CanvasTool[] = [
    new LineFactory(eventBus),
    new CircleFactory(eventBus),
    new RectangleFactory(eventBus),
    new TriangleFactory(eventBus),
  ];
  const toolArea = new ToolArea(
    shapesSelector,
    menu,
    new SelectionManager(sm, eventBus)
  );
  canvas = new Canvas(canvasDomElm, toolArea);

  // --- Event Handlers ---
  initEventBus(eventBus, eventStreamTextArea, sm);
  initEventLog(loadEventsButton, eventStreamTextArea, eventBus, canvas, sm);

  sm.redraw();
  return () => {};
}
