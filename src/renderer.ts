import { Graphics } from "pixi.js";

export class Renderer {
  private gridGraphics: Graphics;
  private TILE_SIZE: number;
  private GRID_WIDTH: number;
  private GRID_HEIGHT: number;
  private zoom = 1;

  constructor(
    gridGraphics: Graphics,
    TILE_SIZE: number,
    GRID_WIDTH: number,
    GRID_HEIGHT: number,
  ) {
    this.gridGraphics = gridGraphics;
    this.TILE_SIZE = TILE_SIZE;
    this.GRID_WIDTH = GRID_WIDTH;
    this.GRID_HEIGHT = GRID_HEIGHT;
  }

  setZoom(z: number) {
    this.zoom = z;
    this.drawGrid();
  }

  drawGrid() {
    const g = this.gridGraphics;
    g.clear();

    const lineWidth = 1 / Math.max(this.zoom, 0.000001);

    // Draw vertical lines
    for (let x = 0; x <= this.GRID_WIDTH; x++) {
      g.moveTo(x * this.TILE_SIZE, 0);
      g.lineTo(x * this.TILE_SIZE, this.GRID_HEIGHT * this.TILE_SIZE);
    }

    // Draw horizontal lines
    for (let y = 0; y <= this.GRID_HEIGHT; y++) {
      g.moveTo(0, y * this.TILE_SIZE);
      g.lineTo(this.GRID_WIDTH * this.TILE_SIZE, y * this.TILE_SIZE);
    }

    g.stroke({ width: lineWidth, color: 0x333333, alpha: 0.5 });
  }
}
