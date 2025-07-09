import {
  CircleFactory,
  LineFactory,
  RectangleFactory,
  TriangleFactory,
} from "./shape-factories";
import { Menu, MenuEntry, SeparatorEntry, RadioOption } from "../context";
import {
  EventBus,
  EventTypes,
  DomainEvent,
  AddShapePayload,
  Point2D as EventPoint2D,
} from "./events";
import {
  AbstractShape,
  Circle,
  Line,
  Point2D,
  Rectangle,
  Shape,
  Triangle,
} from "./shapes";
import { WSocketEvent } from "./wsocket-event";
import { getUser } from "../auth";
import { navigateTo } from "../router";

export const MARKED_WIDTH = 4;
const canvasWidth = 1024,
  canvasHeight = 500;

export interface CanvasTool {
  label?: string;
  handleMouseDown(e: MouseEvent): void;
  handleMouseUp(e: MouseEvent): void;
  handleMouseMove(e: MouseEvent): void;
}
export type DrawOptions = (
  | {
      marked?: false;
    }
  | {
      marked: true;
      markedColor: string;
    }
) & {
  backgroundColor?: string;
  borderColor?: string;
};
type MouseEvents = "handleMouseUp" | "handleMouseMove" | "handleMouseDown";

class SelectionManager {
  private selectedShapes: Shape[] = [];
  private altStepper = 0;
  // Drag&Drop State
  private dragging = false;
  private firstDrag = false;
  private lastMousePos: { x: number; y: number } | undefined;

  constructor(
    private readonly localShapeManager: ShapeManager,
    private readonly eventBus: EventBus
  ) {}

  private _getShapeToSelectFromClick(e: MouseEvent): Shape | undefined {
    if (e.altKey) {
      this.altStepper++;
    } else {
      this.altStepper = 0;
    }

    const shapesInMouseClick = this.localShapeManager
      .getShapes()
      .filter((shape) => shape.isSelected(e));

    if (shapesInMouseClick.length > 0) {
      if (this.altStepper >= shapesInMouseClick.length) {
        this.altStepper = 0;
      }
      return shapesInMouseClick[this.altStepper];
    }
    return undefined;
  }

  private _selectShapeAtClick(e: MouseEvent): void {
    const clickedShape = this._getShapeToSelectFromClick(e);

    if (!clickedShape) {
      if (!e.ctrlKey) {
        this.clearSelection();
      }
      // If Ctrl is held and no shape is clicked, selection remains unchanged.
    } else {
      if (e.ctrlKey) {
        const isAlreadySelected = this.selectedShapes.some(
          (entry) => entry.id === clickedShape.id
        );
        if (isAlreadySelected) {
          this.selectedShapes = this.selectedShapes.filter(
            (entry) => entry.id !== clickedShape.id
          );
        } else {
          this.selectedShapes.push(clickedShape);
        }
      } else {
        this.selectedShapes = [clickedShape];
      }
    }
  }

  private _showContextMenu(e: MouseEvent): void {
    if (this.selectedShapes.length === 0) return;

    const menuItems: (MenuEntry | SeparatorEntry | RadioOption)[] = [];
    let menu: Menu;

    const hideMenu = () => {
      if (menu) menu.hide();
    };

    const firstSelectedShape = this.selectedShapes[0];

    const backgroundColorOptions = {
      transparent: "Transparent",
      red: "Rot",
      green: "Grün",
      yellow: "Gelb",
      blue: "Blau",
      black: "Schwarz",
    };
    menuItems.push(
      new RadioOption(
        "Hintergrundfarbe",
        backgroundColorOptions,
        firstSelectedShape.getBackgroundColor(),
        (value) => {
          this.selectedShapes.forEach((shape) => {
            this.eventBus.dispatch({
              type: EventTypes.SET_BACKGROUND_COLOR_EVENT,
              payload: { shapeId: shape.id, color: value },
            });
          });
        }
      )
    );

    menuItems.push(new SeparatorEntry());

    const borderColorOptions = {
      red: "Rot",
      green: "Grün",
      yellow: "Gelb",
      blue: "Blau",
      black: "Schwarz",
    };
    menuItems.push(
      new RadioOption(
        "Randfarbe",
        borderColorOptions,
        firstSelectedShape.getBorderColor(),
        (value) => {
          this.selectedShapes.forEach((shape) => {
            this.eventBus.dispatch({
              type: EventTypes.SET_BORDER_COLOR_EVENT,
              payload: { shapeId: shape.id, color: value },
            });
          });
        }
      )
    );

    menuItems.push(new SeparatorEntry());

    menuItems.push(
      new MenuEntry("Löschen", () => {
        this.selectedShapes.forEach((shape) => {
          this.eventBus.dispatch({
            type: EventTypes.REMOVE_SHAPE_EVENT,
            payload: { shapeId: shape.id },
          });
        });
        hideMenu();
        this.clearSelection();
      })
    );

    if (this.selectedShapes.length === 1) {
      const shapeId = this.selectedShapes[0].id;

      menuItems.push(new SeparatorEntry());

      menuItems.push(
        new MenuEntry("In den Vordergrund", () => {
          this.eventBus.dispatch({
            type: EventTypes.MOVE_TO_FRONT_EVENT,
            payload: { shapeId },
          });
          hideMenu();
        })
      );

      menuItems.push(
        new MenuEntry("In den Hintergrund", () => {
          this.eventBus.dispatch({
            type: EventTypes.MOVE_TO_BACK_EVENT,
            payload: { shapeId },
          });
          hideMenu();
        })
      );
    }

    menu = new Menu(menuItems);
    menu.show(e.pageX, e.pageY);
  }

  private _startDragging(e: MouseEvent): void {
    this.dragging = true;
    this.firstDrag = true;
    this.lastMousePos = { x: e.offsetX, y: e.offsetY };
  }

  public handleMouseDown(e: MouseEvent): void {
    switch (e.button) {
      case 0: // Left click
        if (e.shiftKey) {
          this._startDragging(e);
        } else {
          this._selectShapeAtClick(e);
        }
        break;
      case 2: // Right click
        if (this.selectedShapes.length > 0) {
          this._showContextMenu(e);
        }
        break;
    }
    this.localShapeManager.redraw();
  }

  public handleMouseMove(e: MouseEvent): void {
    if (this.dragging) {
      const dx = e.offsetX - this.lastMousePos.x;
      const dy = e.offsetY - this.lastMousePos.y;
      this.lastMousePos = { x: e.offsetX, y: e.offsetY };
      this.selectedShapes = this.selectedShapes.map((shape) => {
        this.eventBus.dispatch({
          type: EventTypes.REMOVE_SHAPE_EVENT,
          payload: {
            shapeId: shape.id,
            temporary: !this.firstDrag,
            noRedraw: true,
          },
        });
        const newShape = shape.moveBy(dx, dy);
        this.eventBus.dispatch({
          type: EventTypes.ADD_SHAPE_EVENT,
          payload: {
            ...newShape.toSerializable(),
            temporary: true,
            noRedraw: true,
          },
        });
        return newShape;
      });
      this.eventBus.dispatch({
        type: EventTypes.REDRAW_EVENT,
        payload: {},
      });
    }
    this.firstDrag = false;
  }

  public handleMouseUp(e: MouseEvent): void {
    if (this.dragging) {
      this.dragging = false;
      this.firstDrag = false;
      this.lastMousePos = undefined;
      this.selectedShapes = this.selectedShapes.map((shape) => {
        this.eventBus.dispatch({
          type: EventTypes.REMOVE_SHAPE_EVENT,
          payload: { shapeId: shape.id, temporary: true, noRedraw: true },
        });
        this.eventBus.dispatch({
          type: EventTypes.ADD_SHAPE_EVENT,
          payload: { ...shape.toSerializable(), noRedraw: true },
        });
        return shape;
      });
      this.eventBus.dispatch({
        type: EventTypes.REDRAW_EVENT,
        payload: {},
      });
    }
  }

  getSelectedShapes(): { [id: number]: Shape | undefined } {
    return Object.fromEntries(
      this.selectedShapes.map((shape) => [shape.id, shape])
    );
  }

  clearSelection(): void {
    this.selectedShapes = [];
    this.altStepper = 0;
    // Redraw is needed to remove selection highlights
    this.localShapeManager.redraw();
  }
}

class ToolArea {
  private selectedShape: CanvasTool = undefined;
  private selectionMode = false;

  constructor(
    shapesSelector: CanvasTool[],
    menue: Element,
    private selectionManager: SelectionManager
  ) {
    const domElms = [];
    shapesSelector.forEach((sl) => {
      const domSelElement = document.createElement("li");
      domSelElement.innerText = sl.label;
      menue.appendChild(domSelElement);
      domElms.push(domSelElement);

      domSelElement.addEventListener("click", () => {
        this.selectionManager.clearSelection();
        selectFactory.call(this, sl, domSelElement);
      });
    });

    function selectFactory(sl: CanvasTool, domElm: HTMLElement) {
      // remove class from all elements
      for (let j = 0; j < domElms.length; j++) {
        domElms[j].classList.remove("marked");
      }
      this.selectedShape = sl;
      // add class to the one that is selected currently
      domElm.classList.add("marked");
      this.selectionMode = false;
    }

    const domSelElement = document.createElement("li");
    domSelElement.innerText = "Select";
    menue.appendChild(domSelElement);
    domElms.push(domSelElement);

    domSelElement.addEventListener("click", () => {
      this.selectionManager.clearSelection();
      for (let j = 0; j < domElms.length; j++) {
        domElms[j].classList.remove("marked");
      }
      domSelElement.classList.add("marked");
      this.selectedShape = undefined;
      this.selectionMode = true;
    });
  }

  selectionModeActive() {
    return this.selectionMode;
  }

  getSelectedShape(): CanvasTool {
    return this.selectedShape;
  }

  getSelectionManager(): SelectionManager {
    return this.selectionManager;
  }
}

interface ShapeManager {
  addShape(shape: Shape, redraw?: boolean, temporary?: boolean): this;
  removeShape(shape: Shape, redraw?: boolean, temporary?: boolean): this;
  removeShapeWithId(id: string, redraw?: boolean, temporary?: boolean): this;
  redraw(): this;
  getShapes(): Shape[];
  moveToFront(shape: Shape): void;
  moveToBack(shape: Shape): void;
  getShapeById(id: string): Shape | undefined;
  recreateShape(payload: AddShapePayload): Shape | undefined;
  clearAllShapes(): void;
}
class Canvas implements ShapeManager, CanvasTool {
  private ctx: CanvasRenderingContext2D;
  private shapes: Shape[] = [];
  private temporaryShapes: Shape[] = [];

  constructor(canvasDomElement: HTMLCanvasElement, private toolarea: ToolArea) {
    this.ctx = canvasDomElement.getContext("2d")!;
    canvasDomElement.oncontextmenu = (e) => e.preventDefault();
    canvasDomElement.addEventListener(
      "mousemove",
      this.handleMouseMove.bind(this)
    );
    canvasDomElement.addEventListener(
      "mousedown",
      this.handleMouseDown.bind(this)
    );
    canvasDomElement.addEventListener("mouseup", this.handleMouseUp.bind(this));
  }

  // --- Mouse Event Handlers ---
  handleMouseMove(e: MouseEvent): void {
    this.handleMouse("handleMouseMove", e);
  }

  handleMouseDown(e: MouseEvent): void {
    this.handleMouse("handleMouseDown", e);
  }

  handleMouseUp(e: MouseEvent): void {
    this.handleMouse("handleMouseUp", e);
  }

  private handleMouse(methodName: MouseEvents, e: MouseEvent): void {
    const manager = this.toolarea.getSelectionManager();
    if (this.toolarea.selectionModeActive()) {
      manager[methodName]?.(e);
      return;
    }

    const currentTool = this.toolarea.getSelectedShape();
    if (
      e.button === 0 &&
      currentTool &&
      typeof currentTool[methodName] === "function"
    ) {
      currentTool[methodName](e);
    }
  }
  // --- End Mouse Event Handlers ---

  getShapeById(id: string): Shape | undefined {
    return (
      this.shapes.find((s) => s.id === id) ||
      this.temporaryShapes.find((s) => s.id === id)
    );
  }

  clearAllShapes(): void {
    this.shapes = [];
    this.temporaryShapes = [];
    AbstractShape["counter"] = 0; // Reset static counter for shape IDs
    this.redraw();
  }

  recreateShape(payload: AddShapePayload): Shape | undefined {
    let shape: Shape | undefined = undefined;
    const id = payload.id;

    const p = (pt: EventPoint2D | undefined): Point2D | undefined =>
      pt ? new Point2D(pt.x, pt.y) : undefined;

    switch (payload.shapeType) {
      case "Line":
        shape = new Line(p(payload.from)!, p(payload.to)!, { id });
        break;
      case "Circle":
        shape = new Circle(p(payload.center)!, payload.radius, { id });
        break;
      case "Rectangle":
        shape = new Rectangle(p(payload.from)!, p(payload.to)!, { id });
        break;
      case "Triangle":
        shape = new Triangle(p(payload.p1)!, p(payload.p2)!, p(payload.p3)!, {
          id,
        });
        break;
    }
    if (shape) {
      if (payload.backgroundColor)
        shape.setBackgroundColor(payload.backgroundColor);
      if (payload.borderColor) shape.setBorderColor(payload.borderColor);
    }
    return shape;
  }

  draw(): this {
    this.ctx.beginPath();
    this.ctx.fillStyle = "lightgrey";
    this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    this.ctx.stroke();

    const selectedShapesMap = this.toolarea
      .getSelectionManager()
      .getSelectedShapes();

    // Draw non-temporary shapes first
    for (const shape of this.shapes) {
      shape.draw(this.ctx, {
        marked:
          this.toolarea.selectionModeActive() && !!selectedShapesMap[shape.id],
        markedColor: "green",
      });
    }
    // Draw temporary shapes on top
    for (const shape of this.temporaryShapes) {
      shape.draw(this.ctx, { marked: false });
    }
    return this;
  }

  redraw(): this {
    return this.draw();
  }

  addShape(
    shape: Shape,
    redraw: boolean = true,
    temporary: boolean = false
  ): this {
    // Ensure temporary shapes from TriangleFactory (tmpLine) are handled correctly
    if (temporary) {
      // Check if it's the special tmpLine from TriangleFactory
      const payload = shape.toSerializable();
      if (payload.forTriangleFactory) {
        // Add to temporaryShapes, but it might be removed quickly by TriangleFactory itself
        const existingIndex = this.temporaryShapes.findIndex(
          (s) => s.id === shape.id
        );
        if (existingIndex !== -1) this.temporaryShapes.splice(existingIndex, 1); // remove if exists
        this.temporaryShapes.push(shape);
      } else {
        // Standard temporary shape
        const existingIndex = this.temporaryShapes.findIndex(
          (s) => s.id === shape.id
        );
        if (existingIndex !== -1) this.temporaryShapes.splice(existingIndex, 1);
        this.temporaryShapes.push(shape);
      }
    } else {
      // Non-temporary shape
      const existingIndex = this.shapes.findIndex((s) => s.id === shape.id);
      if (existingIndex !== -1) this.shapes.splice(existingIndex, 1); // remove if exists (e.g. replaying an add event for an existing ID)
      this.shapes.push(shape);
    }
    return redraw ? this.draw() : this;
  }

  removeShape(
    _shape: Shape,
    redraw: boolean = true,
    temporary: boolean = false
  ): this {
    if (temporary) {
      this.temporaryShapes = this.temporaryShapes.filter(
        (s) => s.id !== _shape.id
      );
    } else {
      this.shapes = this.shapes.filter((s) => s.id !== _shape.id);
    }
    return redraw ? this.draw() : this;
  }

  removeShapeWithId(
    id: string,
    redraw: boolean = true,
    temporary: boolean = false
  ): this {
    if (temporary) {
      this.temporaryShapes = this.temporaryShapes.filter((s) => s.id !== id);
    } else {
      this.shapes = this.shapes.filter((s) => s.id !== id);
    }
    return redraw ? this.draw() : this;
  }

  moveToFront(shape: Shape): void {
    this.shapes = this.shapes.filter((s) => s.id !== shape.id);
    this.shapes.push(shape);
  }

  moveToBack(shape: Shape): void {
    this.shapes = this.shapes.filter((s) => s.id !== shape.id);
    // Umsortieren findet nicht bei jedem neuen Shape statt, sondern nur
    // beim in den Vordergrund oder Hintergrund verschieben
    this.shapes.unshift(shape);
  }

  getShapes() {
    return this.shapes;
  }
}

function initEventLog(
  loadEventsButton: HTMLButtonElement,
  eventStreamTextArea: HTMLTextAreaElement,
  eventBus: EventBus,
  canvas: Canvas,
  sm: ShapeManager
) {
  loadEventsButton.addEventListener("click", () => {
    const eventLines = eventStreamTextArea.value.trim().split("\n");

    eventBus.dispatch({ type: EventTypes.CLEAR_CANVAS_EVENT, payload: {} });

    const originalAllSubscribers = eventBus["allEventsSubscribers"];
    eventBus["allEventsSubscribers"] = [];

    eventLines.forEach((line) => {
      if (line.trim() === "") return;
      try {
        const event = JSON.parse(line) as DomainEvent;
        eventBus.dispatch(event);
      } catch (e) {
        console.error("Error parsing or replaying event:", line, e);
      }
    });

    eventBus["allEventsSubscribers"] = originalAllSubscribers;

    eventStreamTextArea.value = "";
    const replayedEvents: DomainEvent[] = [];
    canvas["shapes"].forEach((s) => {
      replayedEvents.push({
        type: EventTypes.ADD_SHAPE_EVENT,
        payload: s.toSerializable(),
        timestamp: Date.now(),
      });
    });
    replayedEvents.sort((a, b) => a.timestamp - b.timestamp);
    replayedEvents.forEach((event) => {
      if ("temporary" in event.payload && event.payload?.temporary) {
        return;
      }
      eventStreamTextArea.value += JSON.stringify(event) + "\n";
    });
    eventStreamTextArea.scrollTop = eventStreamTextArea.scrollHeight;

    sm.redraw();
  });
}

function initEventBus(
  eventBus: EventBus,
  eventStreamTextArea: HTMLTextAreaElement,
  sm: ShapeManager,
  moderatedStatusElem: HTMLElement,
  instructionTextElem: HTMLElement
) {
  eventBus.subscribeToAll((event: DomainEvent) => {
    if (
      ("temporary" in event.payload && event.payload.temporary) ||
      event.type === EventTypes.REDRAW_EVENT
    ) {
      return;
    }
    eventStreamTextArea.value += JSON.stringify(event) + "\n";
    eventStreamTextArea.scrollTop = eventStreamTextArea.scrollHeight;
  });

  eventBus.subscribe(EventTypes.ADD_SHAPE_EVENT, (event) => {
    const shape = sm.recreateShape(event.payload);
    if (shape) {
      sm.addShape(shape, !event.payload.noRedraw, event.payload.temporary);
    } else {
      console.warn("Could not recreate shape from ADD_SHAPE_EVENT:", event);
    }
  });

  eventBus.subscribe(EventTypes.REMOVE_SHAPE_EVENT, (event) => {
    sm.removeShapeWithId(
      event.payload.shapeId,
      !event.payload.noRedraw,
      event.payload.temporary
    );
  });

  eventBus.subscribe(EventTypes.REDRAW_EVENT, (_event) => {
    sm.redraw();
  });

  eventBus.subscribe(EventTypes.MOVE_TO_FRONT_EVENT, (event) => {
    const shape = sm.getShapeById(event.payload.shapeId);
    const serializableShape = shape?.toSerializable();
    if (shape && serializableShape && !serializableShape.temporary) {
      sm.moveToFront(shape);
      sm.redraw();
    }
  });

  eventBus.subscribe(EventTypes.MOVE_TO_BACK_EVENT, (event) => {
    const shape = sm.getShapeById(event.payload.shapeId);
    const serializableShape = shape?.toSerializable();
    if (shape && serializableShape && !serializableShape.temporary) {
      sm.moveToBack(shape);
      sm.redraw();
    }
  });

  eventBus.subscribe(EventTypes.SET_BACKGROUND_COLOR_EVENT, (event) => {
    const shape = sm.getShapeById(event.payload.shapeId);
    const serializableShape = shape?.toSerializable();
    if (shape && serializableShape && !serializableShape.temporary) {
      shape.setBackgroundColor(event.payload.color);
      sm.redraw();
    }
  });

  eventBus.subscribe(EventTypes.SET_BORDER_COLOR_EVENT, (event) => {
    const shape = sm.getShapeById(event.payload.shapeId);
    const serializableShape = shape?.toSerializable();
    if (shape && serializableShape && !serializableShape.temporary) {
      shape.setBorderColor(event.payload.color);
      sm.redraw();
    }
  });

  eventBus.subscribe(EventTypes.CLEAR_CANVAS_EVENT, (_event) => {
    sm.clearAllShapes();
  });

  eventBus.subscribe(EventTypes.RIGHTS_CHANGED, (event) => {
    if (event.payload.right === "R") {
      moderatedStatusElem.textContent = "";
      instructionTextElem.innerHTML = `
          <p>
            Sie betrachten diese Zeichenfläche im Nur-Lesen-Modus. Sie können die vorhandenen Formen sehen, aber keine neuen zeichnen oder bestehende bearbeiten.
          </p>
        `;
      return;
    }
    if (event.payload.right === null) {
      navigateTo("/");
      return;
    }
    if (event.payload.moderated) {
      eventStreamTextArea.value +=
        "Die Rechte für diese Zeichenfläche wurden moderiert. Sie können keine neuen Formen zeichnen oder bestehende bearbeiten.\n";
      instructionTextElem.innerHTML = `
          <p>
            Sie betrachten diese Zeichenfläche im Nur-Lesen-Modus. Sie können die vorhandenen Formen sehen, aber keine neuen zeichnen oder bestehende bearbeiten.
          </p>
        `;
    } else {
      moderatedStatusElem.textContent = "";
      instructionTextElem.innerHTML = `
          <p>
            Wählen Sie auf der linken Seite Ihr Zeichenwerkzeug aus. Haben Sie eines
            ausgewählt, können Sie mit der Maus die entsprechenden Figuren zeichnen.
            Typischerweise, indem Sie die Maus drücken, dann mit gedrückter
            Maustaste die Form bestimmen, und dann anschließend die maustaste
            loslassen.
          </p>
          <p>Mit shift kann man die Shapes verschieben.</p>
        `;
    }
  });
}

export function canvasPage(pageContent: HTMLElement) {
  document.title = "Zeichenfläche";
  const canvas_id = window.location.href.split("/").at(-1);
  const user = getUser();
  const readonly = user.canvases[canvas_id] === "R";

  // Add moderated status and instruction elements
  const moderatedStatusId = "moderatedStatus";
  const instructionTextId = "instructionText";
  const moderatedStatusHtml = `<div id="${moderatedStatusId}" style="color: red; font-weight: bold; margin-bottom: 8px;"></div>`;
  const instructionTextHtml = `<div id="${instructionTextId}" style="margin-bottom: 8px;"></div>`;

  const readonlyInstruction = `
    <p>
      Sie betrachten diese Zeichenfläche im Nur-Lesen-Modus. Sie können die vorhandenen Formen sehen, aber keine neuen zeichnen oder bestehende bearbeiten.
    </p>
  `;
  const editInstruction = `
    <p>
      Wählen Sie auf der linken Seite Ihr Zeichenwerkzeug aus. Haben Sie eines
      ausgewählt, können Sie mit der Maus die entsprechenden Figuren zeichnen.
      Typischerweise, indem Sie die Maus drücken, dann mit gedrückter
      Maustaste die Form bestimmen, und dann anschließend die maustaste
      loslassen.
    </p>
    <p>Mit shift kann man die Shapes verschieben.</p>
  `;

  const content =
    moderatedStatusHtml +
    instructionTextHtml +
    (readonly
      ? `
      <ul class="tools" style="display:none"></ul>
      <canvas id="drawArea" width="1024" height="500"></canvas>
      <div class="event-stream-container">
        <textarea id="eventStream" rows="10" cols="130"></textarea>
        <button id="loadEventsButton" style="display:none">Load Events</button>
      </div>
    `
      : `
      <ul class="tools"></ul>
      <canvas id="drawArea" width="1024" height="500"></canvas>
      <div class="event-stream-container">
        <textarea id="eventStream" rows="10" cols="130"></textarea>
        <button id="loadEventsButton">Load Events</button>
      </div>
    `);
  pageContent.innerHTML = content;

  // Set initial instruction text
  const instructionTextElem = document.getElementById(
    instructionTextId
  ) as HTMLElement;
  instructionTextElem.innerHTML = readonly
    ? readonlyInstruction
    : editInstruction;

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
  const wtransEvent = new WSocketEvent(eventBus, canvas_id);

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
  const moderatedStatusElem = document.getElementById(
    moderatedStatusId
  ) as HTMLElement;
  // Pass instructionTextElem to initEventBus
  initEventBus(
    eventBus,
    eventStreamTextArea,
    sm,
    moderatedStatusElem,
    instructionTextElem
  );
  initEventLog(loadEventsButton, eventStreamTextArea, eventBus, canvas, sm);

  sm.redraw();
  void wtransEvent.connect();
  return () => {
    void wtransEvent.disconnect();
  };
}
