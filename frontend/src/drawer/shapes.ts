import { getUser } from "../auth";
import { DrawOptions } from "./drawer";
import { AddShapePayload, Point2D as EventPoint2D } from "./events";

const MARKED_WIDTH = 4;
export class Point2D implements EventPoint2D {
  /* Ensure compatibility with EventPoint2D */
  constructor(readonly x: number, readonly y: number) {}
}
export class AbstractShape {
  private static counter: number = 0;
  readonly id: string;
  backgroundColor: string;
  borderColor: string;

  constructor(options?: {
    id?: string;
    backgroundColor?: string;
    borderColor?: string;
  }) {
    const [argUser, argNumStr] = options?.id?.split(":") ?? [];
    const argNum = Number(argNumStr);
    const user = getUser();
    if (options?.id) {
      this.id = options.id;
      if (user.id === argUser && argNum >= AbstractShape.counter) {
        AbstractShape.counter = Number(argNumStr) + 1;
      }
    } else {
      this.id = `${user.id}:${AbstractShape.counter}`;
      AbstractShape.counter++;
    }
    this.backgroundColor = options?.backgroundColor ?? "transparent";
    this.borderColor = options?.borderColor ?? "black";
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
export class Line extends AbstractShape implements Shape {
  constructor(
    readonly from: Point2D,
    readonly to: Point2D,
    options?: { id?: string; backgroundColor?: string; borderColor?: string }
  ) {
    super(options);
  }
  moveBy(dx: number, dy: number): Line {
    return new Line(
      new Point2D(this.from.x + dx, this.from.y + dy),
      new Point2D(this.to.x + dx, this.to.y + dy),
      { backgroundColor: this.backgroundColor, borderColor: this.borderColor }
    );
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
export class Circle extends AbstractShape implements Shape {
  constructor(
    readonly center: Point2D,
    readonly radius: number,
    options?: { id?: string; backgroundColor?: string; borderColor?: string }
  ) {
    super(options);
  }
  moveBy(dx: number, dy: number): Circle {
    return new Circle(
      new Point2D(this.center.x + dx, this.center.y + dy),
      this.radius,
      { backgroundColor: this.backgroundColor, borderColor: this.borderColor }
    );
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
export class Rectangle extends AbstractShape implements Shape {
  constructor(
    readonly from: Point2D,
    readonly to: Point2D,
    options?: { id?: string; backgroundColor?: string; borderColor?: string }
  ) {
    super(options);
  }
  moveBy(dx: number, dy: number): Rectangle {
    return new Rectangle(
      new Point2D(this.from.x + dx, this.from.y + dy),
      new Point2D(this.to.x + dx, this.to.y + dy),
      { backgroundColor: this.backgroundColor, borderColor: this.borderColor }
    );
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
export class Triangle extends AbstractShape implements Shape {
  constructor(
    readonly p1: Point2D,
    readonly p2: Point2D,
    readonly p3: Point2D,
    options?: { id?: string; backgroundColor?: string; borderColor?: string }
  ) {
    super(options);
  }
  moveBy(dx: number, dy: number): Triangle {
    return new Triangle(
      new Point2D(this.p1.x + dx, this.p1.y + dy),
      new Point2D(this.p2.x + dx, this.p2.y + dy),
      new Point2D(this.p3.x + dx, this.p3.y + dy),
      { backgroundColor: this.backgroundColor, borderColor: this.borderColor }
    );
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
export interface Shape {
  setBorderColor(value: string): unknown;
  getBorderColor(): string;
  setBackgroundColor(value: string): unknown;
  getBackgroundColor(): string;
  readonly id: string;
  draw(ctx: CanvasRenderingContext2D, drawOptions?: DrawOptions): void;
  isSelected(e: MouseEvent): boolean;
  toSerializable(): AddShapePayload;
  moveBy(dx: number, dy: number): Shape;
}
