const MARKED = { width: 4, style: "green" };
const canvasWidth = 1024,
  canvasHeight = 768;
interface ShapeFactory {
  label: string;
  handleMouseDown(x: number, y: number): void;
  handleMouseUp(x: number, y: number): void;
  handleMouseMove(x: number, y: number): void;
}
type DrawOptions = { marked?: boolean };
interface Shape {
  readonly id: number;
  draw(ctx: CanvasRenderingContext2D, drawOptions?: DrawOptions): void;
  isSelected(e: MouseEvent): boolean;
}
class Point2D {
  constructor(readonly x: number, readonly y: number) {}
}
class AbstractShape {
  private static counter: number = 0;
  readonly id: number;
  constructor() {
    this.id = AbstractShape.counter++;
  }
}
abstract class AbstractFactory<T extends Shape> {
  private from: Point2D;
  private tmpTo: Point2D;
  private tmpShape: T;

  constructor(readonly shapeManager: ShapeManager) {}

  abstract createShape(from: Point2D, to: Point2D): T;

  handleMouseDown(x: number, y: number) {
    this.from = new Point2D(x, y);
  }

  handleMouseUp(x: number, y: number) {
    // remove the temp line, if there was one
    if (this.tmpShape) {
      this.shapeManager.removeShapeWithId(this.tmpShape.id, false);
    }
    this.shapeManager.addShape(this.createShape(this.from, new Point2D(x, y)));
    this.from = undefined;
  }

  handleMouseMove(x: number, y: number) {
    // show temp circle only, if the start point is defined;
    if (!this.from) {
      return;
    }
    if (!this.tmpTo || this.tmpTo.x !== x || this.tmpTo.y !== y) {
      this.tmpTo = new Point2D(x, y);
      if (this.tmpShape) {
        // remove the old temp line, if there was one
        this.shapeManager.removeShapeWithId(this.tmpShape.id, false);
      }
      // adds a new temp line
      this.tmpShape = this.createShape(this.from, new Point2D(x, y));
      this.shapeManager.addShape(this.tmpShape);
    }
  }
}
class Line extends AbstractShape implements Shape {
  constructor(readonly from: Point2D, readonly to: Point2D) {
    super();
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
    if (drawOptions.marked) {
      ctx.beginPath();
      const oldStyle = ctx.strokeStyle;
      ctx.strokeStyle = MARKED.style;
      ctx.strokeRect(
        this.from.x - MARKED.width,
        this.from.y - MARKED.width,
        MARKED.width * 2,
        MARKED.width * 2
      );
      ctx.strokeRect(
        this.to.x - MARKED.width,
        this.to.y - MARKED.width,
        MARKED.width * 2,
        MARKED.width * 2
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

  createShape(from: Point2D, to: Point2D): Line {
    return new Line(from, to);
  }
}
class Circle extends AbstractShape implements Shape {
  constructor(readonly center: Point2D, readonly radius: number) {
    super();
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
      ctx.strokeStyle = MARKED.style;
      ctx.rect(
        this.center.x - this.radius - MARKED.width,
        this.center.y - this.radius - MARKED.width,
        this.radius * 2 + MARKED.width * 2,
        this.radius * 2 + MARKED.width * 2
      );
      ctx.stroke();
      ctx.strokeStyle = oldStyle;
    }
    ctx.beginPath();
    ctx.arc(this.center.x, this.center.y, this.radius, 0, 2 * Math.PI);
    ctx.stroke();
  }
}
class CircleFactory extends AbstractFactory<Circle> implements ShapeFactory {
  public label: string = "Kreis";

  constructor(shapeManager: ShapeManager) {
    super(shapeManager);
  }

  createShape(from: Point2D, to: Point2D): Circle {
    return new Circle(from, CircleFactory.computeRadius(from, to.x, to.y));
  }

  private static computeRadius(from: Point2D, x: number, y: number): number {
    const xDiff = from.x - x,
      yDiff = from.y - y;
    return Math.sqrt(xDiff * xDiff + yDiff * yDiff);
  }
}
class Rectangle extends AbstractShape implements Shape {
  constructor(readonly from: Point2D, readonly to: Point2D) {
    super();
  }
  isSelected(e: MouseEvent): boolean {
    const minX = Math.min(this.from.x, this.to.x);
    const maxX = Math.max(this.from.x, this.to.x);
    const minY = Math.min(this.from.y, this.to.y);
    const maxY = Math.max(this.from.y, this.to.y);

    const mouseX = this.from.x;
    const mouseY = this.from.y;

    return mouseX >= minX && mouseX <= maxX && mouseY >= minY && mouseY <= maxY;
  }

  draw(ctx: CanvasRenderingContext2D, drawOptions: DrawOptions = {}) {
    const width = this.to.x - this.from.x;
    const height = this.to.y - this.from.y;
    if (drawOptions.marked) {
      const oldStyle = ctx.strokeStyle;
      ctx.strokeStyle = MARKED.style;
      ctx.beginPath();
      ctx.strokeRect(
        this.from.x - MARKED.width * Math.sign(width),
        this.from.y - MARKED.width * Math.sign(height),
        width + MARKED.width * 2 * Math.sign(width),
        height + MARKED.width * 2 * Math.sign(height)
      );
      ctx.strokeStyle = oldStyle;
    }
    ctx.beginPath();
    ctx.strokeRect(
      this.from.x,
      this.from.y,
      this.to.x - this.from.x,
      this.to.y - this.from.y
    );
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

  createShape(from: Point2D, to: Point2D): Rectangle {
    return new Rectangle(from, to);
  }
}
class Triangle extends AbstractShape implements Shape {
  constructor(
    readonly p1: Point2D,
    readonly p2: Point2D,
    readonly p3: Point2D
  ) {
    super();
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
      ctx.strokeStyle = MARKED.style;
      const minX = Math.min(this.p1.x, this.p2.x, this.p3.x);
      const minY = Math.min(this.p1.y, this.p2.y, this.p3.y);
      const maxX = Math.max(this.p1.x, this.p2.x, this.p3.x);
      const maxY = Math.max(this.p1.y, this.p2.y, this.p3.y);
      ctx.strokeRect(
        minX - MARKED.width,
        minY - MARKED.width,
        maxX - minX + MARKED.width * 2,
        maxY - minY + MARKED.width * 2
      );
      ctx.strokeStyle = oldStyle;
    }
    ctx.beginPath();
    ctx.moveTo(this.p1.x, this.p1.y);
    ctx.lineTo(this.p2.x, this.p2.y);
    ctx.lineTo(this.p3.x, this.p3.y);
    ctx.lineTo(this.p1.x, this.p1.y);
    ctx.stroke();
  }
}
class TriangleFactory implements ShapeFactory {
  public label: string = "Dreieck";

  private from: Point2D;
  private tmpTo: Point2D;
  private tmpLine: Line;
  private thirdPoint: Point2D;
  private tmpShape: Triangle;

  constructor(readonly shapeManager: ShapeManager) {}

  handleMouseDown(x: number, y: number) {
    if (this.tmpShape) {
      this.shapeManager.removeShapeWithId(this.tmpShape.id, false);
      this.shapeManager.addShape(
        new Triangle(this.from, this.tmpTo, new Point2D(x, y))
      );
      this.from = undefined;
      this.tmpTo = undefined;
      this.tmpLine = undefined;
      this.thirdPoint = undefined;
      this.tmpShape = undefined;
    } else {
      this.from = new Point2D(x, y);
    }
  }

  handleMouseUp(x: number, y: number) {
    // remove the temp line, if there was one
    if (this.tmpLine) {
      this.shapeManager.removeShapeWithId(this.tmpLine.id, false);
      this.tmpLine = undefined;
      this.tmpTo = new Point2D(x, y);
      this.thirdPoint = new Point2D(x, y);
      this.tmpShape = new Triangle(this.from, this.tmpTo, this.thirdPoint);
      this.shapeManager.addShape(this.tmpShape);
    }
  }

  handleMouseMove(x: number, y: number) {
    // show temp circle only, if the start point is defined;
    if (!this.from) {
      return;
    }

    if (this.tmpShape) {
      // second point already defined, update temp triangle
      if (
        !this.thirdPoint ||
        this.thirdPoint.x !== x ||
        this.thirdPoint.y !== y
      ) {
        this.thirdPoint = new Point2D(x, y);
        if (this.tmpShape) {
          // remove the old temp line, if there was one
          this.shapeManager.removeShapeWithId(this.tmpShape.id, false);
        }
        // adds a new temp triangle
        this.tmpShape = new Triangle(this.from, this.tmpTo, this.thirdPoint);
        this.shapeManager.addShape(this.tmpShape);
      }
    } else {
      // no second point fixed, update tmp line
      if (!this.tmpTo || this.tmpTo.x !== x || this.tmpTo.y !== y) {
        this.tmpTo = new Point2D(x, y);
        if (this.tmpLine) {
          // remove the old temp line, if there was one
          this.shapeManager.removeShapeWithId(this.tmpLine.id, false);
        }
        // adds a new temp line
        this.tmpLine = new Line(this.from, this.tmpTo);
        this.shapeManager.addShape(this.tmpLine);
      }
    }
  }
}

class Shapes {}

class SelectionManager {
  private selectedShapes: [id: number | string, Shape][] = [];
  private altStepper = 0;

  constructor(private shapeManager: ShapeManager) {}

  handleSelection(
    methodName: string,
    e: MouseEvent,
    shapes: { [id: number]: Shape }
  ) {
    if (methodName === "handleMouseUp") {
      if (e.altKey) {
        this.altStepper++;
      } else {
        this.altStepper = 0;
      }
      const shapesInMouseClick = Object.entries(shapes).filter(([_, v]) =>
        v.isSelected(e)
      );
      let altShape = shapesInMouseClick[this.altStepper];
      if (!altShape) {
        this.altStepper = 0;
        altShape = shapesInMouseClick[this.altStepper];
      }

      if (!altShape) {
        return;
      }

      if (e.ctrlKey) {
        this.selectedShapes.push(altShape);
      } else {
        this.selectedShapes = [altShape];
      }
    }
    this.shapeManager.redraw();
  }

  getSelectedShapes(): { [id: number]: Shape | undefined } {
    return Object.fromEntries(this.selectedShapes);
  }

  clearSelection(): void {
    this.selectedShapes = [];
    this.altStepper = 0;
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
  addShape(shape: Shape, redraw?: boolean): this;
  removeShape(shape: Shape, redraw?: boolean): this;
  removeShapeWithId(id: number, redraw?: boolean): this;
  redraw(): this;
}
class Canvas implements ShapeManager {
  private ctx: CanvasRenderingContext2D;
  private shapes: { [id: number]: Shape } = {};

  constructor(canvasDomElement: HTMLCanvasElement, private toolarea: ToolArea) {
    this.ctx = canvasDomElement.getContext("2d")!;

    canvasDomElement.addEventListener("mousemove", this.handleMouseMove);
    canvasDomElement.addEventListener("mousedown", this.handleMouseDown);
    canvasDomElement.addEventListener("mouseup", this.handleMouseUp);
  }
  redraw(): this {
    return this.draw();
  }

  private handleMouseMove = (e: MouseEvent) => {
    this.handleMouse("handleMouseMove", e);
  };

  private handleMouseDown = (e: MouseEvent) => {
    this.handleMouse("handleMouseDown", e);
  };

  private handleMouseUp = (e: MouseEvent) => {
    this.handleMouse("handleMouseUp", e);
  };

  private handleMouse(methodName: string, e: MouseEvent) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.toolarea.selectionModeActive()) {
      this.toolarea
        .getSelectionManager()
        .handleSelection(methodName, e, this.shapes);
    }

    const ss = this.toolarea.getSelectedShape();
    if (e.button === 0 && ss && typeof ss[methodName] === "function") {
      ss[methodName](x, y);
    }
  }

  draw(): this {
    // TODO: is there a better way to reset the canvas?
    this.ctx.beginPath();
    this.ctx.fillStyle = "lightgrey";
    this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    this.ctx.stroke();

    // draw shapes
    this.ctx.fillStyle = "black";
    const selectedShapes = this.toolarea
      .getSelectionManager()
      .getSelectedShapes();
    for (let id in this.shapes) {
      this.shapes[id].draw(this.ctx, {
        marked: this.toolarea.selectionModeActive() && !!selectedShapes[id],
      });
    }
    return this;
  }

  addShape(shape: Shape, redraw: boolean = true): this {
    this.shapes[shape.id] = shape;
    return redraw ? this.draw() : this;
  }

  removeShape(shape: Shape, redraw: boolean = true): this {
    const id = shape.id;
    delete this.shapes[id];
    return redraw ? this.draw() : this;
  }

  removeShapeWithId(id: number, redraw: boolean = true): this {
    delete this.shapes[id];
    return redraw ? this.draw() : this;
  }
}

function init() {
  const canvasDomElm = document.getElementById("drawArea") as HTMLCanvasElement;
  const menu = document.getElementsByClassName("tools");
  // Problem here: Factories needs a way to create new Shapes, so they
  // have to call a method of the canvas.
  // The canvas on the other side wants to call the event methods
  // on the toolbar, because the toolbar knows what tool is currently
  // selected.
  // Anyway, we do not want the two to have references on each other
  let canvas: Canvas;
  const sm: ShapeManager = {
    addShape(s, rd) {
      return canvas.addShape(s, rd);
    },
    removeShape(s, rd) {
      return canvas.removeShape(s, rd);
    },
    removeShapeWithId(id, rd) {
      return canvas.removeShapeWithId(id, rd);
    },
    redraw() {
      return canvas.redraw();
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
  canvas.draw();
}
