import { Menu, MenuEntry, SeparatorEntry, RadioOption } from "./context.js";
import {
  EventBus,
  EventTypes,
  DomainEvent,
  AddShapePayload,
  Point2D as EventPoint2D,
} from "./events.js";

const MARKED_WIDTH = 4;
const canvasWidth = 1024,
  canvasHeight = 768;

const eventBus = new EventBus();
let eventStreamTextArea: HTMLTextAreaElement;
let loadEventsButton: HTMLButtonElement;

interface ShapeFactory {
  label: string;
  handleMouseDown(x: number, y: number): void;
  handleMouseUp(x: number, y: number): void;
  handleMouseMove(x: number, y: number): void;
}
type DrawOptions = (
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
interface Shape {
  setBorderColor(value: string): unknown;
  getBorderColor(): string;
  setBackgroundColor(value: string): unknown;
  getBackgroundColor(): string;
  readonly id: number;
  draw(ctx: CanvasRenderingContext2D, drawOptions?: DrawOptions): void;
  isSelected(e: MouseEvent): boolean;
  toSerializable(): AddShapePayload;
}
class Point2D implements EventPoint2D {
  /* Ensure compatibility with EventPoint2D */
  constructor(readonly x: number, readonly y: number) {}
}
class AbstractShape {
  private static counter: number = 0;
  readonly id: number;
  backgroundColor: string = "transparent";
  borderColor: string = "black";

  constructor(id?: number) {
    this.id = id === undefined ? AbstractShape.counter++ : id;
    if (id !== undefined && id >= AbstractShape.counter) {
      AbstractShape.counter = id + 1;
    }
  }

  setBorderColor(color: string): void {
    this.borderColor = color;
  }

  getBorderColor(): string {
    return this.borderColor;
  }

  setBackgroundColor(color: string): void {
    this.backgroundColor = color;
  }

  getBackgroundColor(): string {
    return this.backgroundColor;
  }
}
abstract class AbstractFactory<T extends Shape> {
  private from: Point2D;
  private tmpTo: Point2D;
  private tmpShape: T;

  constructor(readonly shapeManager: ShapeManager) {}

  abstract createShape(from: Point2D, to: Point2D, id?: number): T;

  handleMouseDown(x: number, y: number) {
    this.from = new Point2D(x, y);
  }

  handleMouseUp(x: number, y: number) {
    if (this.tmpShape) {
      eventBus.dispatch({
        type: EventTypes.REMOVE_SHAPE_EVENT,
        payload: { shapeId: this.tmpShape.id, temporary: true },
      });
    }
    const newShape = this.createShape(this.from, new Point2D(x, y));
    eventBus.dispatch({
      type: EventTypes.ADD_SHAPE_EVENT,
      payload: newShape.toSerializable(),
    });
    this.from = undefined;
    this.tmpShape = undefined;
    this.tmpTo = undefined;
  }

  handleMouseMove(x: number, y: number) {
    if (!this.from) {
      return;
    }
    if (!this.tmpTo || this.tmpTo.x !== x || this.tmpTo.y !== y) {
      this.tmpTo = new Point2D(x, y);
      if (this.tmpShape) {
        eventBus.dispatch({
          type: EventTypes.REMOVE_SHAPE_EVENT,
          payload: { shapeId: this.tmpShape.id, temporary: true },
        });
      }
      this.tmpShape = this.createShape(this.from, this.tmpTo);
      eventBus.dispatch({
        type: EventTypes.ADD_SHAPE_EVENT,
        payload: { ...this.tmpShape.toSerializable(), temporary: true },
      });
    }
  }
}
class Line extends AbstractShape implements Shape {
  constructor(readonly from: Point2D, readonly to: Point2D, id?: number) {
    super(id);
  }
  toSerializable(): AddShapePayload {
    return {
      shapeType: "Line",
      from: this.from,
      to: this.to,
      id: this.id,
      backgroundColor: this.backgroundColor,
      borderColor: this.borderColor,
    };
  }
  isSelected(e: MouseEvent): boolean {
    const dx1 = e.offsetX - this.from.x;
    const dy1 = e.offsetY - this.from.y;
    const dx2 = e.offsetX - this.to.x;
    const dy2 = e.offsetY - this.to.y;

    const distanceFromStart = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const distanceFromEnd = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    const lineLength = Math.sqrt(
      Math.pow(this.to.x - this.from.x, 2) +
        Math.pow(this.to.y - this.from.y, 2)
    );

    const buffer = 5;
    return Math.abs(distanceFromStart + distanceFromEnd - lineLength) <= buffer;
  }

  draw(ctx: CanvasRenderingContext2D, drawOptions: DrawOptions = {}) {
    ctx.strokeStyle = drawOptions.borderColor || this.borderColor;
    if (drawOptions.marked) {
      ctx.beginPath();
      const oldStyle = ctx.strokeStyle;
      ctx.strokeStyle = drawOptions.markedColor;
      ctx.strokeRect(
        this.from.x - MARKED_WIDTH,
        this.from.y - MARKED_WIDTH,
        MARKED_WIDTH * 2,
        MARKED_WIDTH * 2
      );
      ctx.strokeRect(
        this.to.x - MARKED_WIDTH,
        this.to.y - MARKED_WIDTH,
        MARKED_WIDTH * 2,
        MARKED_WIDTH * 2
      );
      ctx.stroke();
      ctx.strokeStyle = oldStyle;
    }
    ctx.beginPath();
    ctx.moveTo(this.from.x, this.from.y);
    ctx.lineTo(this.to.x, this.to.y);
    ctx.stroke();
  }
}
class LineFactory extends AbstractFactory<Line> implements ShapeFactory {
  public label: string = "Linie";

  constructor(shapeManager: ShapeManager) {
    super(shapeManager);
  }

  createShape(from: Point2D, to: Point2D, id?: number): Line {
    return new Line(from, to, id);
  }
}
class Circle extends AbstractShape implements Shape {
  constructor(readonly center: Point2D, readonly radius: number, id?: number) {
    super(id);
  }
  toSerializable(): AddShapePayload {
    return {
      shapeType: "Circle",
      center: this.center,
      radius: this.radius,
      id: this.id,
      backgroundColor: this.backgroundColor,
      borderColor: this.borderColor,
    };
  }
  isSelected(e: MouseEvent): boolean {
    const dx = e.offsetX - this.center.x;
    const dy = e.offsetY - this.center.y;
    return Math.sqrt(dx * dx + dy * dy) <= this.radius;
  }

  draw(ctx: CanvasRenderingContext2D, drawOptions: DrawOptions = {}) {
    if (drawOptions.marked) {
      ctx.beginPath();
      const oldStyle = ctx.strokeStyle;
      ctx.strokeStyle = drawOptions.markedColor;
      ctx.rect(
        this.center.x - this.radius - MARKED_WIDTH,
        this.center.y - this.radius - MARKED_WIDTH,
        this.radius * 2 + MARKED_WIDTH * 2,
        this.radius * 2 + MARKED_WIDTH * 2
      );
      ctx.stroke();
      ctx.strokeStyle = oldStyle;
    }
    ctx.beginPath();
    ctx.fillStyle = drawOptions.backgroundColor || this.backgroundColor;
    ctx.strokeStyle = drawOptions.borderColor || this.borderColor;
    ctx.arc(this.center.x, this.center.y, this.radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
}
class CircleFactory extends AbstractFactory<Circle> implements ShapeFactory {
  public label: string = "Kreis";

  constructor(shapeManager: ShapeManager) {
    super(shapeManager);
  }

  createShape(from: Point2D, to: Point2D, id?: number): Circle {
    return new Circle(from, CircleFactory.computeRadius(from, to.x, to.y), id);
  }

  private static computeRadius(from: Point2D, x: number, y: number): number {
    const xDiff = from.x - x,
      yDiff = from.y - y;
    return Math.sqrt(xDiff * xDiff + yDiff * yDiff);
  }
}
class Rectangle extends AbstractShape implements Shape {
  constructor(readonly from: Point2D, readonly to: Point2D, id?: number) {
    super(id);
  }
  toSerializable(): AddShapePayload {
    return {
      shapeType: "Rectangle",
      from: this.from,
      to: this.to,
      id: this.id,
      backgroundColor: this.backgroundColor,
      borderColor: this.borderColor,
    };
  }
  isSelected(e: MouseEvent): boolean {
    const minX = Math.min(this.from.x, this.to.x);
    const maxX = Math.max(this.from.x, this.to.x);
    const minY = Math.min(this.from.y, this.to.y);
    const maxY = Math.max(this.from.y, this.to.y);

    const mouseX = e.offsetX;
    const mouseY = e.offsetY;

    return mouseX >= minX && mouseX <= maxX && mouseY >= minY && mouseY <= maxY;
  }

  draw(ctx: CanvasRenderingContext2D, drawOptions: DrawOptions = {}) {
    const width = this.to.x - this.from.x;
    const height = this.to.y - this.from.y;

    if (drawOptions.marked) {
      const oldStyle = ctx.strokeStyle;
      ctx.strokeStyle = drawOptions.markedColor;
      ctx.strokeRect(
        this.from.x - MARKED_WIDTH * Math.sign(width),
        this.from.y - MARKED_WIDTH * Math.sign(height),
        width + MARKED_WIDTH * 2 * Math.sign(width),
        height + MARKED_WIDTH * 2 * Math.sign(height)
      );
      ctx.strokeStyle = oldStyle;
    }

    ctx.beginPath();
    ctx.fillStyle = drawOptions.backgroundColor || this.backgroundColor;
    ctx.strokeStyle = drawOptions.borderColor || this.borderColor;

    ctx.fillRect(this.from.x, this.from.y, width, height);
    ctx.strokeRect(this.from.x, this.from.y, width, height);
    ctx.stroke();
  }
}
class RectangleFactory
  extends AbstractFactory<Rectangle>
  implements ShapeFactory
{
  public label: string = "Rechteck";
  constructor(shapeManager: ShapeManager) {
    super(shapeManager);
  }

  createShape(from: Point2D, to: Point2D, id?: number): Rectangle {
    return new Rectangle(from, to, id);
  }
}
class Triangle extends AbstractShape implements Shape {
  constructor(
    readonly p1: Point2D,
    readonly p2: Point2D,
    readonly p3: Point2D,
    id?: number
  ) {
    super(id);
  }
  toSerializable(): AddShapePayload {
    return {
      shapeType: "Triangle",
      p1: this.p1,
      p2: this.p2,
      p3: this.p3,
      id: this.id,
      backgroundColor: this.backgroundColor,
      borderColor: this.borderColor,
    };
  }
  isSelected(e: MouseEvent): boolean {
    const { offsetX: x, offsetY: y } = e;

    // Helper function to calculate the area of a triangle
    const calculateArea = (p1: Point2D, p2: Point2D, p3: Point2D): number =>
      Math.abs(
        (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y)) / 2
      );

    const totalArea = calculateArea(this.p1, this.p2, this.p3);
    const area1 = calculateArea(new Point2D(x, y), this.p2, this.p3);
    const area2 = calculateArea(this.p1, new Point2D(x, y), this.p3);
    const area3 = calculateArea(this.p1, this.p2, new Point2D(x, y));

    // Check if the sum of the sub-triangle areas equals the total area
    return Math.abs(totalArea - (area1 + area2 + area3)) < 0.01;
  }

  draw(ctx: CanvasRenderingContext2D, drawOptions: DrawOptions = {}) {
    if (drawOptions.marked) {
      ctx.beginPath();
      const oldStyle = ctx.strokeStyle;
      ctx.strokeStyle = drawOptions.markedColor;
      const minX = Math.min(this.p1.x, this.p2.x, this.p3.x);
      const minY = Math.min(this.p1.y, this.p2.y, this.p3.y);
      const maxX = Math.max(this.p1.x, this.p2.x, this.p3.x);
      const maxY = Math.max(this.p1.y, this.p2.y, this.p3.y);
      ctx.strokeRect(
        minX - MARKED_WIDTH,
        minY - MARKED_WIDTH,
        maxX - minX + MARKED_WIDTH * 2,
        maxY - minY + MARKED_WIDTH * 2
      );
      ctx.strokeStyle = oldStyle;
    }
    ctx.beginPath();
    ctx.fillStyle = drawOptions.backgroundColor || this.backgroundColor;
    ctx.strokeStyle = drawOptions.borderColor || this.borderColor;
    ctx.moveTo(this.p1.x, this.p1.y);
    ctx.lineTo(this.p2.x, this.p2.y);
    ctx.lineTo(this.p3.x, this.p3.y);
    ctx.lineTo(this.p1.x, this.p1.y);
    ctx.fill();
    ctx.stroke();
  }
}
class TriangleFactory implements ShapeFactory {
  public label: string = "Dreieck";

  private from: Point2D; // First point
  private tmpTo: Point2D; // Second point (becomes p2 of triangle)
  private tmpLine: Line; // Visual feedback for the first segment
  private thirdPoint: Point2D; // Third point for the triangle (mouse move)
  private tmpShape: Triangle; // Temporary triangle for visual feedback

  constructor(readonly shapeManager: ShapeManager) {}

  handleMouseDown(x: number, y: number) {
    if (!this.from) {
      // First click: define p1
      this.from = new Point2D(x, y);
      // No tmpLine or tmpShape created yet, waiting for mouse move for tmpLine
    } else if (!this.tmpTo) {
      // Second click: define p2
      this.tmpTo = new Point2D(x, y);
      if (this.tmpLine) {
        // Remove the temporary line used for the first segment
        eventBus.dispatch({
          type: EventTypes.REMOVE_SHAPE_EVENT,
          payload: {
            shapeId: this.tmpLine.id,
            temporary: true,
            forTriangleFactory: true,
          },
        });
        this.tmpLine = undefined;
      }
      // Now we start showing a temporary triangle
      this.thirdPoint = new Point2D(x, y); // Initially, third point is same as second
      this.tmpShape = new Triangle(this.from, this.tmpTo, this.thirdPoint); // id will be auto-generated
      eventBus.dispatch({
        type: EventTypes.ADD_SHAPE_EVENT,
        payload: { ...this.tmpShape.toSerializable(), temporary: true },
      });
    } else {
      // Third click: define p3 and finalize triangle
      if (this.tmpShape) {
        eventBus.dispatch({
          type: EventTypes.REMOVE_SHAPE_EVENT,
          payload: { shapeId: this.tmpShape.id, temporary: true },
        });
      }
      const finalP3 = new Point2D(x, y);
      const finalTriangle = new Triangle(this.from, this.tmpTo, finalP3); // id will be auto-generated
      eventBus.dispatch({
        type: EventTypes.ADD_SHAPE_EVENT,
        payload: finalTriangle.toSerializable(),
      });

      // Reset for next triangle
      this.from = undefined;
      this.tmpTo = undefined;
      this.tmpLine = undefined;
      this.thirdPoint = undefined;
      this.tmpShape = undefined;
    }
  }

  handleMouseUp(x: number, y: number) {
    // Not strictly needed if mousedown defines points for triangle.
    // If a click is missed, this could be a fallback, but current logic relies on 3 mousedowns.
  }

  handleMouseMove(x: number, y: number) {
    if (!this.from) return;

    if (this.from && !this.tmpTo) {
      // Drawing the first leg (temporary line)
      const currentMoveTo = new Point2D(x, y);
      if (this.tmpLine) {
        eventBus.dispatch({
          type: EventTypes.REMOVE_SHAPE_EVENT,
          payload: {
            shapeId: this.tmpLine.id,
            temporary: true,
            forTriangleFactory: true,
          },
        });
      }
      // Create a new temporary line. ID will be auto-generated.
      this.tmpLine = new Line(this.from, currentMoveTo);
      eventBus.dispatch({
        type: EventTypes.ADD_SHAPE_EVENT,
        payload: {
          ...this.tmpLine.toSerializable(),
          temporary: true,
          forTriangleFactory: true,
        },
      });
    } else if (this.tmpTo) {
      // Drawing the temporary triangle (after second point is set)
      if (
        !this.thirdPoint ||
        this.thirdPoint.x !== x ||
        this.thirdPoint.y !== y
      ) {
        this.thirdPoint = new Point2D(x, y);
        if (this.tmpShape) {
          eventBus.dispatch({
            type: EventTypes.REMOVE_SHAPE_EVENT,
            payload: { shapeId: this.tmpShape.id, temporary: true },
          });
        }
        // Create new temporary triangle. ID will be auto-generated.
        this.tmpShape = new Triangle(this.from, this.tmpTo, this.thirdPoint);
        eventBus.dispatch({
          type: EventTypes.ADD_SHAPE_EVENT,
          payload: { ...this.tmpShape.toSerializable(), temporary: true },
        });
      }
    }
  }
}

class SelectionManager {
  private selectedShapes: Shape[] = [];
  private altStepper = 0;

  constructor(private shapeManager: ShapeManager) {}

  private _getShapeToSelectFromClick(e: MouseEvent): Shape | undefined {
    if (e.altKey) {
      this.altStepper++;
    } else {
      this.altStepper = 0;
    }

    const shapesInMouseClick = this.shapeManager
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
            eventBus.dispatch({
              type: EventTypes.SET_BACKGROUND_COLOR_EVENT,
              payload: { shapeId: shape.id, color: value },
            });
          });
        }
      )
    );

    menuItems.push(new SeparatorEntry());

    // Inline Border Color Option
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
            eventBus.dispatch({
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
          eventBus.dispatch({
            type: EventTypes.REMOVE_SHAPE_EVENT,
            payload: { shapeId: Number(shape.id) },
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
          eventBus.dispatch({
            type: EventTypes.MOVE_TO_FRONT_EVENT,
            payload: { shapeId },
          });
          hideMenu();
        })
      );

      menuItems.push(
        new MenuEntry("In den Hintergrund", () => {
          eventBus.dispatch({
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

  public handleMouseDown(e: MouseEvent): void {
    switch (e.button) {
      case 0: // Left click
        this._selectShapeAtClick(e);
        return;
      case 2: // Right click
        if (this.selectedShapes.length > 0) {
          this._showContextMenu(e);
        }
        return;
    }
    this.shapeManager.redraw();
  }

  getSelectedShapes(): { [id: number]: Shape | undefined } {
    const selectedMap: { [id: number]: Shape | undefined } = {};
    this.selectedShapes.forEach((entry) => {
      selectedMap[Number(entry[0])] = entry[1];
    });
    return selectedMap;
  }

  clearSelection(): void {
    this.selectedShapes = [];
    this.altStepper = 0;
    // Redraw is needed to remove selection highlights
    this.shapeManager.redraw();
  }
}

class ToolArea {
  private selectedShape: ShapeFactory = undefined;
  private selectionMode = false;
  private selectionManager: SelectionManager;

  constructor(
    shapesSelector: ShapeFactory[],
    menue: Element,
    shapeManager: ShapeManager
  ) {
    this.selectionManager = new SelectionManager(shapeManager);
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

    function selectFactory(sl: ShapeFactory, domElm: HTMLElement) {
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

  getSelectedShape(): ShapeFactory {
    return this.selectedShape;
  }

  getSelectionManager(): SelectionManager {
    return this.selectionManager;
  }
}

interface ShapeManager {
  addShape(shape: Shape, redraw?: boolean, temporary?: boolean): this;
  removeShape(shape: Shape, redraw?: boolean, temporary?: boolean): this;
  removeShapeWithId(id: number, redraw?: boolean, temporary?: boolean): this;
  redraw(): this;
  getShapes(): Shape[];
  moveToFront(shape: Shape): void;
  moveToBack(shape: Shape): void;
  getShapeById(id: number): Shape | undefined;
  recreateShape(payload: AddShapePayload): Shape | undefined;
  clearAllShapes(): void;
}
class Canvas implements ShapeManager {
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
  private handleMouseMove(e: MouseEvent): void {
    this.handleMouse("handleMouseMove", e);
  }

  private handleMouseDown(e: MouseEvent): void {
    this.handleMouse("handleMouseDown", e);
  }

  private handleMouseUp(e: MouseEvent): void {
    this.handleMouse("handleMouseUp", e);
  }

  private handleMouse(methodName: MouseEvents, e: MouseEvent): void {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

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
      currentTool[methodName](x, y);
    }
  }
  // --- End Mouse Event Handlers ---

  getShapeById(id: number): Shape | undefined {
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
        shape = new Line(p(payload.from)!, p(payload.to)!, id);
        break;
      case "Circle":
        shape = new Circle(p(payload.center)!, payload.radius, id);
        break;
      case "Rectangle":
        shape = new Rectangle(p(payload.from)!, p(payload.to)!, id);
        break;
      case "Triangle":
        shape = new Triangle(
          p(payload.p1)!,
          p(payload.p2)!,
          p(payload.p3)!,
          id
        );
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
    id: number,
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

function init() {
  const canvasDomElm = document.getElementById("drawArea") as HTMLCanvasElement;
  const menu = document.getElementsByClassName("tools");
  eventStreamTextArea = document.getElementById(
    "eventStream"
  ) as HTMLTextAreaElement;
  loadEventsButton = document.getElementById(
    "loadEventsButton"
  ) as HTMLButtonElement;

  if (!eventStreamTextArea || !loadEventsButton) {
    console.error("Event stream textarea or load button not found!");
    return;
  }

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
  const shapesSelector: ShapeFactory[] = [
    new LineFactory(sm),
    new CircleFactory(sm),
    new RectangleFactory(sm),
    new TriangleFactory(sm),
  ];
  const toolArea = new ToolArea(shapesSelector, menu[0], sm);
  canvas = new Canvas(canvasDomElm, toolArea);

  // --- Event Handlers ---
  eventBus.subscribeToAll((event: DomainEvent) => {
    if ("temporary" in event.payload && event.payload.temporary) {
      return;
    }
    eventStreamTextArea.value += JSON.stringify(event) + "\n";
    eventStreamTextArea.scrollTop = eventStreamTextArea.scrollHeight;
  });

  eventBus.subscribe(EventTypes.ADD_SHAPE_EVENT, (event) => {
    const shape = sm.recreateShape(event.payload);
    if (shape) {
      sm.addShape(shape, true, event.payload.temporary);
    } else {
      console.warn("Could not recreate shape from ADD_SHAPE_EVENT:", event);
    }
  });

  eventBus.subscribe(EventTypes.REMOVE_SHAPE_EVENT, (event) => {
    sm.removeShapeWithId(event.payload.shapeId, true, event.payload.temporary);
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

  canvas.draw();
}

let canvasEle = document.getElementById("drawArea");
if (canvasEle === null) {
  document.addEventListener("DOMContentLoaded", () => {
    canvasEle = document.getElementById("drawArea");
    if (canvasEle === null) {
      throw "App could not be loaded!";
    }
    init();
  });
} else {
  init();
}
