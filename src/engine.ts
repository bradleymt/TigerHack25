import { Application, Container, Graphics, Ticker } from "pixi.js";
import { Renderer } from "./renderer";
import { GameSprite, GridCell, Grid } from "./sprite";

type Star = { graphics: Graphics; speed: number; alphaDir: number };

export class Engine {
  private app: Application;
  private world: Container;
  private renderer: Renderer;
  private starArray: Star[];
  private TILE_SIZE: number;
  private GRID_WIDTH: number;
  private GRID_HEIGHT: number;
  private grid: Grid;
  private zoom = 1;
  private targetZoom = 0.35;
  private readonly MIN_ZOOM = 0.2;
  private readonly MAX_ZOOM = 3;
  private readonly ZOOM_SPEED = 0.1;

  // panning
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };

  constructor(opts: {
    app: Application;
    world: Container;
    renderer: Renderer;
    starArray: Star[];
    TILE_SIZE: number;
    GRID_WIDTH: number;
    GRID_HEIGHT: number;
    grid: Grid;
  }) {
    this.app = opts.app;
    this.world = opts.world;
    this.renderer = opts.renderer;
    this.starArray = opts.starArray;
    this.TILE_SIZE = opts.TILE_SIZE;
    this.GRID_WIDTH = opts.GRID_WIDTH;
    this.GRID_HEIGHT = opts.GRID_HEIGHT;
    this.grid = opts.grid;

    // initialize renderer zoom state
    this.renderer.setZoom(this.zoom);
  }

  start() {
    // wheel for zoom
    window.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.targetZoom += -event.deltaY * 0.001;
        this.targetZoom = Math.max(
          this.MIN_ZOOM,
          Math.min(this.MAX_ZOOM, this.targetZoom),
        );
      },
      { passive: false },
    );

    // panning via mouse on canvas
    const canvas =
      (this.app as any).canvas ?? (this.app.renderer as any).view ?? (this.app as any).view;

    canvas.addEventListener("mousedown", (e: MouseEvent) => {
      this.isDragging = true;
      this.dragStart.x = e.clientX - this.world.x;
      this.dragStart.y = e.clientY - this.world.y;
    });

    canvas.addEventListener("mouseup", () => (this.isDragging = false));
    canvas.addEventListener("mousemove", (e: MouseEvent) => {
      if (this.isDragging) {
        this.world.x = e.clientX - this.dragStart.x;
        this.world.y = e.clientY - this.dragStart.y;
      }
    });

    // click -> grid conversion example
    canvas.addEventListener("click", (e: MouseEvent) => {
      const { gridX, gridY } = this.screenToGrid(e.clientX, e.clientY);
      if (
        gridX >= 0 &&
        gridX < this.GRID_WIDTH &&
        gridY >= 0 &&
        gridY < this.GRID_HEIGHT
      ) {
        console.log("Clicked grid cell:", gridX, gridY);
      }
    });

    // ticker
    this.app.ticker.add((time) => this.tick(time));

    const resizeWindow = (_ev?: UIEvent) => {
      this.app.renderer.resize(window.innerWidth, window.innerHeight);

      // Get the center point of the grid in world coordinates
      const gridCenterX = (this.GRID_WIDTH * this.TILE_SIZE) / 2;
      const gridCenterY = (this.GRID_HEIGHT * this.TILE_SIZE) / 2;

      // Center the world container on the screen, accounting for zoom
      this.world.x = this.app.screen.width / 2 - gridCenterX * this.zoom;
      this.world.y = this.app.screen.height / 2 - gridCenterY * this.zoom;
    }

    // resize handling
    window.addEventListener("resize", resizeWindow);
    resizeWindow();
  }

  private tick(time: Ticker) {
    const prevZoom = this.zoom;
    this.zoom += (this.targetZoom - this.zoom) * this.ZOOM_SPEED;

    const centerX = this.app.screen.width / 2;
    const centerY = this.app.screen.height / 2;

    this.world.x = centerX - (centerX - this.world.x) * (this.zoom / prevZoom);
    this.world.y = centerY - (centerY - this.world.y) * (this.zoom / prevZoom);
    this.world.scale.set(this.zoom);

    if (prevZoom !== this.zoom) this.renderer.setZoom(this.zoom);

    // TODO: only update grids with sprites in them, kinda inefficient rn
    for (let i = 0; i < this.GRID_WIDTH; i++) {
      for (let j = 0; j < this.GRID_HEIGHT; j++) {
        this.grid[i][j].sprites.forEach((sprite: GameSprite) => {
          sprite.update(time.deltaTime);
        });
      }
    }

    // update stars
    this.starArray.forEach((star) => {
      star.graphics.y += star.speed;
      if (star.graphics.y > this.app.screen.height) star.graphics.y = 0;

      // twinkle
      star.graphics.alpha += star.alphaDir;
      if (star.graphics.alpha > 1) star.alphaDir = -star.alphaDir;
      if (star.graphics.alpha < 0.2) star.alphaDir = -star.alphaDir;
    });
  }

  screenToGrid(screenX: number, screenY: number) {
    const local = this.world.toLocal({ x: screenX, y: screenY });
    const gridX = Math.floor(local.x / this.TILE_SIZE);
    const gridY = Math.floor(local.y / this.TILE_SIZE);
    return { gridX, gridY };
  }

  gridToWorld(gridX: number, gridY: number) {
    return {
      x: gridX * this.TILE_SIZE + this.TILE_SIZE / 2,
      y: gridY * this.TILE_SIZE + this.TILE_SIZE / 2,
    };
  }
}
