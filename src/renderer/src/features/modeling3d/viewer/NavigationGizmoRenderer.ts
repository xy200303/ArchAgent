/** Draws the legacy high-frequency navigation ball without another WebGL context. */
import { Color, Quaternion, Vector3 } from "three";
import type { EditorCameraPreset } from "./R3FCameraControls";

const AXES: ReadonlyArray<{ vector: Vector3; color: Color; label: string; preset: EditorCameraPreset }> = [
  { vector: new Vector3(1, 0, 0), color: new Color("#d13438"), label: "X", preset: "right" },
  { vector: new Vector3(-1, 0, 0), color: new Color("#d13438"), label: "−X", preset: "left" },
  { vector: new Vector3(0, 1, 0), color: new Color("#107c10"), label: "Y", preset: "top" },
  { vector: new Vector3(0, -1, 0), color: new Color("#107c10"), label: "−Y", preset: "bottom" },
  { vector: new Vector3(0, 0, 1), color: new Color("#0078d4"), label: "Z", preset: "front" },
  { vector: new Vector3(0, 0, -1), color: new Color("#0078d4"), label: "−Z", preset: "back" }
];

interface ProjectedAxis {
  x: number;
  y: number;
  depth: number;
  axis: (typeof AXES)[number];
}

/** Exact legacy drawing model: a canvas ball that follows the main R3F camera. */
export class NavigationGizmoRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly inverseOrientation = new Quaternion();
  private readonly projectedAxes: ProjectedAxis[] = [];
  private width = 1;
  private height = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建导航球绘图画布");
    this.context = context;
    this.resize();
  }

  syncOrientation(quaternion: Quaternion): void {
    this.inverseOrientation.copy(quaternion).invert();
    this.render();
  }

  pick(clientX: number, clientY: number): EditorCameraPreset | undefined {
    const bounds = this.canvas.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    return this.projectedAxes
      .filter((axis) => Math.hypot(axis.x - x, axis.y - y) <= 18)
      .sort((left, right) => right.depth - left.depth)[0]
      ?.axis.preset;
  }

  resize(): void {
    const bounds = this.canvas.getBoundingClientRect();
    this.width = Math.max(bounds.width, 1);
    this.height = Math.max(bounds.height, 1);
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = Math.round(this.width * pixelRatio);
    this.canvas.height = Math.round(this.height * pixelRatio);
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.render();
  }

  dispose(): void {
    this.projectedAxes.length = 0;
    this.context.clearRect(0, 0, this.width, this.height);
  }

  private render(): void {
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const radius = Math.min(this.width, this.height) * 0.27;
    this.context.clearRect(0, 0, this.width, this.height);
    this.drawSphere(centerX, centerY, radius);
    this.projectAxes(centerX, centerY, radius * 1.34);
    this.drawAxes(centerX, centerY);
  }

  private drawSphere(centerX: number, centerY: number, radius: number): void {
    const fill = this.context.createRadialGradient(centerX - radius * 0.36, centerY - radius * 0.42, radius * 0.06, centerX, centerY, radius);
    fill.addColorStop(0, "#ffffff");
    fill.addColorStop(0.62, "#edf2f7");
    fill.addColorStop(1, "#cbd5e1");
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.context.fillStyle = fill;
    this.context.fill();
    this.context.lineWidth = 1;
    this.context.strokeStyle = "#94a3b8";
    this.context.stroke();

    this.context.save();
    this.context.beginPath();
    this.context.arc(centerX, centerY, radius - 1, 0, Math.PI * 2);
    this.context.clip();
    this.context.strokeStyle = "rgb(100 116 139 / 32%)";
    this.context.lineWidth = 1;
    [0.45, 0.78].forEach((scale) => {
      this.context.beginPath();
      this.context.ellipse(centerX, centerY, radius * scale, radius * 0.27, 0, 0, Math.PI * 2);
      this.context.stroke();
      this.context.beginPath();
      this.context.ellipse(centerX, centerY, radius * 0.27, radius * scale, 0, 0, Math.PI * 2);
      this.context.stroke();
    });
    this.context.restore();
  }

  private projectAxes(centerX: number, centerY: number, axisRadius: number): void {
    this.projectedAxes.length = 0;
    AXES.forEach((axis) => {
      const projected = axis.vector.clone().applyQuaternion(this.inverseOrientation);
      this.projectedAxes.push({ x: centerX + projected.x * axisRadius, y: centerY - projected.y * axisRadius, depth: projected.z, axis });
    });
  }

  private drawAxes(centerX: number, centerY: number): void {
    [...this.projectedAxes].sort((left, right) => left.depth - right.depth).forEach((projected) => {
      const opacity = 0.32 + ((projected.depth + 1) / 2) * 0.68;
      const scale = 0.75 + ((projected.depth + 1) / 2) * 0.25;
      const color = `#${projected.axis.color.getHexString()}`;
      this.context.save();
      this.context.globalAlpha = opacity;
      this.context.strokeStyle = color;
      this.context.lineWidth = 2.5 * scale;
      this.context.beginPath();
      this.context.moveTo(centerX, centerY);
      this.context.lineTo(centerX + (projected.x - centerX) * 0.8, centerY + (projected.y - centerY) * 0.8);
      this.context.stroke();
      this.context.fillStyle = color;
      this.context.beginPath();
      this.context.arc(projected.x, projected.y, 8 * scale, 0, Math.PI * 2);
      this.context.fill();
      this.context.fillStyle = "#ffffff";
      this.context.font = `700 ${Math.round(9 * scale)}px Segoe UI, Microsoft YaHei, sans-serif`;
      this.context.textAlign = "center";
      this.context.textBaseline = "middle";
      this.context.fillText(projected.axis.label, projected.x, projected.y + 0.5);
      this.context.restore();
    });
  }
}
