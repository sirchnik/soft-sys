import { CanvasTool } from "./drawer.js";
import { EventBus, EventTypes } from "./events.js";
import { Shape, Point2D, Line, Circle, Rectangle, Triangle } from "./shapes.js";

export abstract class AbstractFactory<T extends Shape> implements CanvasTool {
  label?: string;
  private from: Point2D;
  private tmpTo: Point2D;
  private tmpShape: T;

  constructor(private readonly eventBus: EventBus) {}

  abstract createShape(from: Point2D, to: Point2D, id?: number): T;

  handleMouseDown(e: MouseEvent) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this.from = new Point2D(x, y);
  }

  handleMouseUp(e: MouseEvent) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (this.tmpShape) {
      this.eventBus.dispatch({
        type: EventTypes.REMOVE_SHAPE_EVENT,
        payload: { shapeId: this.tmpShape.id, temporary: true },
      });
    }
    const newShape = this.createShape(this.from, new Point2D(x, y));
    this.eventBus.dispatch({
      type: EventTypes.ADD_SHAPE_EVENT,
      payload: newShape.toSerializable(),
    });
    this.from = undefined;
    this.tmpShape = undefined;
    this.tmpTo = undefined;
  }

  handleMouseMove(e: MouseEvent) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (!this.from) {
      return;
    }
    if (!this.tmpTo || this.tmpTo.x !== x || this.tmpTo.y !== y) {
      this.tmpTo = new Point2D(x, y);
      if (this.tmpShape) {
        this.eventBus.dispatch({
          type: EventTypes.REMOVE_SHAPE_EVENT,
          payload: { shapeId: this.tmpShape.id, temporary: true },
        });
      }
      this.tmpShape = this.createShape(this.from, this.tmpTo);
      this.eventBus.dispatch({
        type: EventTypes.ADD_SHAPE_EVENT,
        payload: { ...this.tmpShape.toSerializable(), temporary: true },
      });
    }
  }
}
export class LineFactory extends AbstractFactory<Line> implements CanvasTool {
  public label: string = "Linie";

  constructor(eventBus: EventBus) {
    super(eventBus);
  }

  createShape(from: Point2D, to: Point2D, id?: number): Line {
    return new Line(from, to, id);
  }
}
export class CircleFactory
  extends AbstractFactory<Circle>
  implements CanvasTool
{
  public label: string = "Kreis";

  constructor(eventBus: EventBus) {
    super(eventBus);
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
export class RectangleFactory
  extends AbstractFactory<Rectangle>
  implements CanvasTool
{
  public label: string = "Rechteck";
  constructor(eventBus: EventBus) {
    super(eventBus);
  }

  createShape(from: Point2D, to: Point2D, id?: number): Rectangle {
    return new Rectangle(from, to, id);
  }
}
export class TriangleFactory implements CanvasTool {
  public label: string = "Dreieck";

  private from: Point2D; // First point
  private tmpTo: Point2D; // Second point (becomes p2 of triangle)
  private tmpLine: Line; // Visual feedback for the first segment
  private thirdPoint: Point2D; // Third point for the triangle (mouse move)
  private tmpShape: Triangle; // Temporary triangle for visual feedback

  constructor(private readonly eventBus: EventBus) {}

  handleMouseDown(e: MouseEvent) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (!this.from) {
      this.from = new Point2D(x, y);
    } else if (!this.tmpTo) {
      this.tmpTo = new Point2D(x, y);
      if (this.tmpLine) {
        this.eventBus.dispatch({
          type: EventTypes.REMOVE_SHAPE_EVENT,
          payload: {
            shapeId: this.tmpLine.id,
            temporary: true,
            forTriangleFactory: true,
          },
        });
        this.tmpLine = undefined;
      }
      this.thirdPoint = new Point2D(x, y);
      this.tmpShape = new Triangle(this.from, this.tmpTo, this.thirdPoint);
      this.eventBus.dispatch({
        type: EventTypes.ADD_SHAPE_EVENT,
        payload: { ...this.tmpShape.toSerializable(), temporary: true },
      });
    } else {
      if (this.tmpShape) {
        this.eventBus.dispatch({
          type: EventTypes.REMOVE_SHAPE_EVENT,
          payload: { shapeId: this.tmpShape.id, temporary: true },
        });
      }
      const finalP3 = new Point2D(x, y);
      const finalTriangle = new Triangle(this.from, this.tmpTo, finalP3);
      this.eventBus.dispatch({
        type: EventTypes.ADD_SHAPE_EVENT,
        payload: finalTriangle.toSerializable(),
      });
      this.from = undefined;
      this.tmpTo = undefined;
      this.tmpLine = undefined;
      this.thirdPoint = undefined;
      this.tmpShape = undefined;
    }
  }

  handleMouseUp(_e: MouseEvent) {
    // Not strictly needed
  }

  handleMouseMove(e: MouseEvent) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (!this.from) return;
    if (this.from && !this.tmpTo) {
      const currentMoveTo = new Point2D(x, y);
      if (this.tmpLine) {
        this.eventBus.dispatch({
          type: EventTypes.REMOVE_SHAPE_EVENT,
          payload: {
            shapeId: this.tmpLine.id,
            temporary: true,
            forTriangleFactory: true,
          },
        });
      }
      this.tmpLine = new Line(this.from, currentMoveTo);
      this.eventBus.dispatch({
        type: EventTypes.ADD_SHAPE_EVENT,
        payload: {
          ...this.tmpLine.toSerializable(),
          temporary: true,
          forTriangleFactory: true,
        },
      });
    } else if (this.tmpTo) {
      if (
        !this.thirdPoint ||
        this.thirdPoint.x !== x ||
        this.thirdPoint.y !== y
      ) {
        this.thirdPoint = new Point2D(x, y);
        if (this.tmpShape) {
          this.eventBus.dispatch({
            type: EventTypes.REMOVE_SHAPE_EVENT,
            payload: { shapeId: this.tmpShape.id, temporary: true },
          });
        }
        this.tmpShape = new Triangle(this.from, this.tmpTo, this.thirdPoint);
        this.eventBus.dispatch({
          type: EventTypes.ADD_SHAPE_EVENT,
          payload: { ...this.tmpShape.toSerializable(), temporary: true },
        });
      }
    }
  }
}
