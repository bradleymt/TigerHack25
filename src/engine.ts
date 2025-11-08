import { Application, Container, Graphics, Ticker, Text, Sprite, Texture } from "pixi.js";
import { Renderer } from "./renderer";
import { GameSprite, GridCell, Grid, PlanetSprite, createSprite } from "./sprite";
import {
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_SPEED,
  NUM_ASTEROIDS,
  ASTEROID_RADIUS,
  PLANET_RADIUS,
  ASTEROID_ROTATION_MIN,
  ASTEROID_ROTATION_MAX,
  PLANET_ROTATION_MIN,
  PLANET_ROTATION_MAX,
  ASTEROID_TILES,
  PLANET_TILES,
  TILE_SIZE as CONST_TILE_SIZE,
} from "./constants";

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
  private zoom = MIN_ZOOM;
  private targetZoom = MIN_ZOOM;
  private readonly MIN_ZOOM = MIN_ZOOM;
  private readonly MAX_ZOOM = MAX_ZOOM;
  private readonly ZOOM_SPEED = ZOOM_SPEED;

  // panning
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  
  // UI elements
  private uiContainer!: Container;
  private toolbar!: Container;
  private tooltipText?: Text;
  private tooltipBg?: Graphics;
  private highlightGraphic!: Graphics;
  
  // Drag/drop state
  private previewSprite: Sprite | null = null;
  private isDraggingFromToolbar = false;
  private isDraggingSprite = false;
  private draggedSpriteGridPos: { x: number; y: number } | null = null;
  private isOverTrash = false;
  private selectedTexture: Texture | null = null;
  
  // Toolbar elements
  private trashCan!: Graphics;
  private bunnyTexture: Texture | null = null;
  private gridToggleButton!: Graphics;
  private gridToggleText!: Text;
  
  // Grid visibility toggle
  private showGrid = false;
  
  // Planets for tracking
  private planets: PlanetSprite[] = [];

  constructor(app: Application) {
    this.app = app;
    this.TILE_SIZE = CONST_TILE_SIZE;
    
    // Initialize grid dimensions based on screen size and min zoom
    this.GRID_WIDTH = Math.ceil(app.screen.width / (this.TILE_SIZE * MIN_ZOOM));
    this.GRID_HEIGHT = Math.ceil(app.screen.height / (this.TILE_SIZE * MIN_ZOOM));
    
    // Create stars FIRST (background layer)
    this.starArray = [];
    const NUM_STARS = 100;
    for (let i = 0; i < NUM_STARS; i++) {
      const g = new Graphics();
      const x = Math.random() * app.screen.width;
      const y = Math.random() * app.screen.height;
      const radius = Math.random() * 2 + 0.5;
      g.circle(0, 0, radius);
      g.fill(0xffffff);
      g.x = x;
      g.y = y;
      g.alpha = Math.random();
      app.stage.addChild(g);

      this.starArray.push({
        graphics: g,
        speed: Math.random() * 0.2 + 0.05,
        alphaDir: Math.random() < 0.5 ? 0.01 : -0.01,
      });
    }
    
    // Create world container (goes on top of stars)
    this.world = new Container();
    app.stage.addChild(this.world);
    
    // Initialize grid
    this.grid = [];
    for (let y = 0; y < this.GRID_HEIGHT; y++) {
      const row: GridCell[] = [];
      for (let x = 0; x < this.GRID_WIDTH; x++) {
        row.push({ gravity: 0, sprite: null, occupied: false });
      }
      this.grid.push(row);
    }
    
    // Create renderer
    const gridGraphics = new Graphics();
    this.world.addChild(gridGraphics);
    this.renderer = new Renderer(gridGraphics, this.TILE_SIZE, this.GRID_WIDTH, this.GRID_HEIGHT);

    // Create UI container (stays on top, doesn't zoom)
    this.uiContainer = new Container();
    app.stage.addChild(this.uiContainer);

    // Create highlight graphic for placement preview
    this.highlightGraphic = new Graphics();
    this.world.addChild(this.highlightGraphic);

    // initialize renderer zoom state (but don't draw grid - starts hidden)
    this.renderer.setZoom(this.zoom);
    this.renderer.hideGrid(); // Start with grid hidden
  }

  // Initialize toolbar with bunny sprite
  initToolbar(bunnyTexture: Texture) {
    this.bunnyTexture = bunnyTexture;
    const BUNNY_TILES = 1; // Import this if needed from constants

    this.toolbar = new Container();
    this.toolbar.position.set(10, this.app.screen.height - 100);
    this.uiContainer.addChild(this.toolbar);

    // Toolbar background
    const toolbarBg = new Graphics();
    toolbarBg.rect(0, 0, 200, 90);
    toolbarBg.fill({ color: 0x222222, alpha: 0.9 });
    toolbarBg.stroke({ width: 2, color: 0x666666 });
    this.toolbar.addChild(toolbarBg);

    // Bunny sprite button
    const bunnyScale = ((this.TILE_SIZE * BUNNY_TILES * 0.8) / Math.max(bunnyTexture.width, bunnyTexture.height));
    const toolbarBunny = new Sprite(bunnyTexture);
    toolbarBunny.anchor.set(0.5);
    toolbarBunny.position.set(45, 45);
    toolbarBunny.scale.set(bunnyScale * 0.8);
    toolbarBunny.eventMode = "static";
    toolbarBunny.cursor = "pointer";
    this.toolbar.addChild(toolbarBunny);

    // Trash can
    this.trashCan = new Graphics();
    this.trashCan.rect(0, 0, 80, 80);
    this.trashCan.fill({ color: 0x880000, alpha: 0.8 });
    this.trashCan.stroke({ width: 2, color: 0xff0000 });
    this.trashCan.position.set(110, 5);
    this.toolbar.addChild(this.trashCan);

    // Trash icon (X)
    const trashIcon = new Graphics();
    trashIcon.moveTo(20, 20);
    trashIcon.lineTo(60, 60);
    trashIcon.moveTo(60, 20);
    trashIcon.lineTo(20, 60);
    trashIcon.stroke({ width: 4, color: 0xffffff });
    trashIcon.position.set(110, 5);
    this.toolbar.addChild(trashIcon);

    // Grid toggle button (top-right corner)
    this.gridToggleButton = new Graphics();
    this.gridToggleButton.rect(0, 0, 120, 40);
    this.gridToggleButton.fill({ color: 0xaa0000, alpha: 0.8 });
    this.gridToggleButton.stroke({ width: 2, color: 0xff0000 });
    this.gridToggleButton.position.set(this.app.screen.width - 130, 10);
    this.gridToggleButton.eventMode = "static";
    this.gridToggleButton.cursor = "pointer";
    this.uiContainer.addChild(this.gridToggleButton);

    this.gridToggleText = new Text({
      text: "Grid: OFF",
      style: { fontSize: 14, fill: 0xffffff, fontWeight: "bold" },
    });
    this.gridToggleText.anchor.set(0.5);
    this.gridToggleText.position.set(60, 20);
    this.gridToggleButton.addChild(this.gridToggleText);

    // Grid toggle click handler
    this.gridToggleButton.on("pointerdown", (e: any) => {
      e.stopPropagation();
      this.showGrid = !this.showGrid;
      this.gridToggleText.text = this.showGrid ? "Grid: ON" : "Grid: OFF";
      
      // Update button color
      this.gridToggleButton.clear();
      this.gridToggleButton.rect(0, 0, 120, 40);
      if (this.showGrid) {
        this.gridToggleButton.fill({ color: 0x00aa00, alpha: 0.8 });
        this.gridToggleButton.stroke({ width: 2, color: 0x00ff00 });
      } else {
        this.gridToggleButton.fill({ color: 0xaa0000, alpha: 0.8 });
        this.gridToggleButton.stroke({ width: 2, color: 0xff0000 });
      }
      
      // Update grid visibility
      if (this.showGrid) {
        this.renderer.showGrid();
      } else {
        this.renderer.hideGrid();
      }
    });

    // Bunny click handler
    toolbarBunny.on("pointerdown", (e: any) => {
      e.stopPropagation();
      this.isDraggingFromToolbar = true;
      this.selectedTexture = bunnyTexture;

      this.previewSprite = new Sprite(bunnyTexture);
      this.previewSprite.anchor.set(0.5);
      this.previewSprite.alpha = 0.7;
      this.previewSprite.scale.set(bunnyScale);
      this.world.addChild(this.previewSprite);
    });
  }

  // Generate asteroids and planets
  generateWorld(asteroidTexture: Texture, planetTexture: Texture) {
    // Calculate scales based on TILE_SIZE
    const asteroidScale = (this.TILE_SIZE * ASTEROID_TILES) / asteroidTexture.width;
    const planetScale = (this.TILE_SIZE * PLANET_TILES) / planetTexture.width;

    // Generate asteroids
    let placed = 0;
    let attempts = 0;
    const maxAttempts = NUM_ASTEROIDS * 10;

    while (placed < NUM_ASTEROIDS && attempts < maxAttempts) {
      attempts++;
      const x = Math.floor(Math.random() * this.GRID_WIDTH);
      const y = Math.floor(Math.random() * this.GRID_HEIGHT);

      if (this.canPlaceInRadius(x, y, ASTEROID_RADIUS)) {
        const rotationSpeed =
          (Math.random() * (ASTEROID_ROTATION_MAX - ASTEROID_ROTATION_MIN) +
            ASTEROID_ROTATION_MIN) *
          (Math.random() < 0.5 ? 1 : -1);

        const asteroid = createSprite("asteroid", {
          texture: asteroidTexture,
          rotationSpeed,
        });
        (asteroid.getDisplay() as Sprite).scale.set(asteroidScale);

        this.placeSprite(x, y, asteroid);
        placed++;
      }
    }
    console.log(`Placed ${placed} asteroids`);

    // Generate planets with shared rotation speed for fairness
    const sharedRotationSpeed =
      (Math.random() * (PLANET_ROTATION_MAX - PLANET_ROTATION_MIN) +
        PLANET_ROTATION_MIN) *
      (Math.random() < 0.5 ? 1 : -1);

    // Planet 1 (left third)
    for (let attempt = 0; attempt < 100; attempt++) {
      const x = Math.floor(Math.random() * (this.GRID_WIDTH / 3));
      const y = Math.floor(Math.random() * this.GRID_HEIGHT);

      if (this.canPlaceInRadius(x, y, PLANET_RADIUS)) {
        const planet1 = createSprite("planet", {
          texture: planetTexture,
          rotationSpeed: sharedRotationSpeed,
          name: "Player 1 Base",
          centerX: x,
          centerY: y,
        });
        (planet1.getDisplay() as Sprite).scale.set(planetScale);

        this.placeSprite(x, y, planet1);
        console.log(`Placed Planet 1 at (${x}, ${y})`);
        break;
      }
    }

    // Planet 2 (right third)
    for (let attempt = 0; attempt < 100; attempt++) {
      const x = Math.floor((this.GRID_WIDTH * 2) / 3 + Math.random() * (this.GRID_WIDTH / 3));
      const y = Math.floor(Math.random() * this.GRID_HEIGHT);

      if (this.canPlaceInRadius(x, y, PLANET_RADIUS)) {
        const planet2 = createSprite("planet", {
          texture: planetTexture,
          rotationSpeed: sharedRotationSpeed,
          name: "Player 2 Base",
          centerX: x,
          centerY: y,
        });
        (planet2.getDisplay() as Sprite).scale.set(planetScale);

        this.placeSprite(x, y, planet2);
        console.log(`Placed Planet 2 at (${x}, ${y})`);
        break;
      }
    }
  }

  // Initialize tooltip UI
  initTooltip() {
    this.tooltipBg = new Graphics();
    this.tooltipBg.visible = false;
    this.app.stage.addChild(this.tooltipBg);

    this.tooltipText = new Text({
      text: "",
      style: { fontSize: 12, fill: 0xffffff },
    });
    this.tooltipText.visible = false;
    this.app.stage.addChild(this.tooltipText);
  }

  // Show tooltip at cursor position with sprite info
  showTooltip(x: number, y: number, sprite: GameSprite) {
    if (!this.tooltipBg || !this.tooltipText) return;

    const lines = [
      `Name: ${sprite.name}`,
      `Health: ${sprite.health}`,
      `Type: ${sprite.type}`,
    ];

    this.tooltipText.text = lines.join("\n");

    const padding = 5;
    const bgWidth = this.tooltipText.width + padding * 2;
    const bgHeight = this.tooltipText.height + padding * 2;

    this.tooltipBg.clear();
    this.tooltipBg.rect(0, 0, bgWidth, bgHeight);
    this.tooltipBg.fill({ color: 0x000000, alpha: 0.8 });

    this.tooltipBg.position.set(x + 10, y + 10);
    this.tooltipText.position.set(x + 10 + padding, y + 10 + padding);

    this.tooltipBg.visible = true;
    this.tooltipText.visible = true;
  }

  // Hide tooltip
  hideTooltip() {
    if (this.tooltipBg) this.tooltipBg.visible = false;
    if (this.tooltipText) this.tooltipText.visible = false;
  }

  // Draw orange highlights for occupied cells (development)
  drawOccupiedCells() {
    this.highlightGraphic.clear();
    
    if (!this.showGrid) return; // Only draw when grid is visible
    
    for (let y = 0; y < this.GRID_HEIGHT; y++) {
      for (let x = 0; x < this.GRID_WIDTH; x++) {
        const cell = this.grid[y][x];
        if (cell.occupied) {
          this.highlightGraphic.rect(
            x * this.TILE_SIZE,
            y * this.TILE_SIZE,
            this.TILE_SIZE,
            this.TILE_SIZE
          );
          this.highlightGraphic.fill({ color: 0xff8800, alpha: 0.3 });
        }
      }
    }
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
      if (!this.isDraggingFromToolbar) {
        const { gridX, gridY } = this.screenToGrid(e.clientX, e.clientY);

        if (gridX >= 0 && gridX < this.GRID_WIDTH && gridY >= 0 && gridY < this.GRID_HEIGHT) {
          const cell = this.grid[gridY][gridX];
          if (cell.occupied) {
            // For multi-tile sprites, get sprite from center cell
            let sprite = cell.sprite;
            let centerX = gridX;
            let centerY = gridY;
            
            if (!sprite && cell.centerX !== undefined && cell.centerY !== undefined) {
              centerX = cell.centerX;
              centerY = cell.centerY;
              sprite = this.grid[centerY][centerX].sprite;
            }

            if (sprite) {
              if (sprite.immutable) {
                console.log(`Cannot move ${sprite.name} - it's immutable`);
                this.isDragging = true;
                this.dragStart.x = e.clientX - this.world.x;
                this.dragStart.y = e.clientY - this.world.y;
              } else {
                // Start dragging a sprite (use center position)
                this.isDraggingSprite = true;
                this.draggedSpriteGridPos = { x: centerX, y: centerY };
                this.previewSprite = sprite.getDisplay() as Sprite;
                this.previewSprite.alpha = 0.7;
              }
            } else {
              // Start panning
              this.isDragging = true;
              this.dragStart.x = e.clientX - this.world.x;
              this.dragStart.y = e.clientY - this.world.y;
            }
          } else {
            // Start panning
            this.isDragging = true;
            this.dragStart.x = e.clientX - this.world.x;
            this.dragStart.y = e.clientY - this.world.y;
          }
        } else {
          // Start panning
          this.isDragging = true;
          this.dragStart.x = e.clientX - this.world.x;
          this.dragStart.y = e.clientY - this.world.y;
        }
      }
    });

    canvas.addEventListener("mouseup", (e: MouseEvent) => {
      if (this.isDraggingFromToolbar && this.previewSprite && this.selectedTexture) {
        const { gridX, gridY } = this.screenToGrid(e.clientX, e.clientY);

        if (gridX >= 0 && gridX < this.GRID_WIDTH && gridY >= 0 && gridY < this.GRID_HEIGHT) {
          if (this.canPlaceInRadius(gridX, gridY, 0)) {
            // Place a bunny building
            const bunnySprite = createSprite("bunny", {
              texture: this.selectedTexture,
              name: "Building",
            });
            const BUNNY_TILES = 1;
            const bunnyScale = ((this.TILE_SIZE * BUNNY_TILES * 0.8) / Math.max(this.selectedTexture.width, this.selectedTexture.height));
            (bunnySprite.getDisplay() as Sprite).scale.set(bunnyScale);

            this.placeSprite(gridX, gridY, bunnySprite);
            console.log(`Placed building at grid (${gridX}, ${gridY})`);
          } else {
            console.log("Cannot place - cells occupied or out of bounds");
          }
        }

        this.world.removeChild(this.previewSprite);
        this.previewSprite = null;
        this.highlightGraphic.clear();
        this.selectedTexture = null;
      } else if (this.isDraggingSprite && this.draggedSpriteGridPos && this.previewSprite) {
        if (this.isOverTrash) {
          console.log(`Deleted sprite from (${this.draggedSpriteGridPos.x}, ${this.draggedSpriteGridPos.y})`);
          this.removeSprite(this.draggedSpriteGridPos.x, this.draggedSpriteGridPos.y);
          this.previewSprite = null;
        } else {
          const { gridX, gridY } = this.screenToGrid(e.clientX, e.clientY);

          if (gridX >= 0 && gridX < this.GRID_WIDTH && gridY >= 0 && gridY < this.GRID_HEIGHT) {
            if (gridX === this.draggedSpriteGridPos.x && gridY === this.draggedSpriteGridPos.y) {
              this.previewSprite.alpha = 1;
            } else {
              const success = this.moveSprite(this.draggedSpriteGridPos.x, this.draggedSpriteGridPos.y, gridX, gridY);
              if (success) {
                console.log(`Moved sprite from (${this.draggedSpriteGridPos.x}, ${this.draggedSpriteGridPos.y}) to (${gridX}, ${gridY})`);
              } else {
                console.log("Can't move there - returning to original position");
                const worldPos = this.gridToWorld(this.draggedSpriteGridPos.x, this.draggedSpriteGridPos.y);
                this.previewSprite.position.set(worldPos.x, worldPos.y);
              }
              this.previewSprite.alpha = 1;
            }
          } else {
            console.log("Outside grid - returning to original position");
            const worldPos = this.gridToWorld(this.draggedSpriteGridPos.x, this.draggedSpriteGridPos.y);
            this.previewSprite.position.set(worldPos.x, worldPos.y);
            this.previewSprite.alpha = 1;
          }
        }

        this.highlightGraphic.clear();
        this.draggedSpriteGridPos = null;
        this.previewSprite = null;
      }

      this.isDraggingFromToolbar = false;
      this.isDraggingSprite = false;
      this.isDragging = false;
      this.isOverTrash = false;
    });

    canvas.addEventListener("mousemove", (e: MouseEvent) => {
      if (this.isDraggingFromToolbar && this.previewSprite) {
        const { gridX, gridY } = this.screenToGrid(e.clientX, e.clientY);

        if (gridX >= 0 && gridX < this.GRID_WIDTH && gridY >= 0 && gridY < this.GRID_HEIGHT) {
          const worldPos = this.gridToWorld(gridX, gridY);
          this.previewSprite.position.set(worldPos.x, worldPos.y);

          this.highlightGraphic.clear();
          const canPlace = this.canPlaceInRadius(gridX, gridY, 0);
          const color = canPlace ? 0x00ff00 : 0xff0000;

          this.highlightGraphic.rect(gridX * this.TILE_SIZE, gridY * this.TILE_SIZE, this.TILE_SIZE, this.TILE_SIZE);
          this.highlightGraphic.fill({ color, alpha: 0.3 });
        }
      } else if (this.isDraggingSprite && this.previewSprite && this.draggedSpriteGridPos) {
        const { gridX, gridY } = this.screenToGrid(e.clientX, e.clientY);

        const trashBounds = {
          x: this.toolbar.x + 110,
          y: this.toolbar.y + 5,
          width: 80,
          height: 80
        };

        this.isOverTrash =
          e.clientX >= trashBounds.x &&
          e.clientX <= trashBounds.x + trashBounds.width &&
          e.clientY >= trashBounds.y &&
          e.clientY <= trashBounds.y + trashBounds.height;

        if (this.isOverTrash) {
          this.highlightGraphic.clear();
          this.trashCan.clear();
          this.trashCan.rect(0, 0, 80, 80);
          this.trashCan.fill({ color: 0xff0000, alpha: 0.9 });
          this.trashCan.stroke({ width: 3, color: 0xffff00 });
          this.trashCan.position.set(110, 5);
        } else {
          this.trashCan.clear();
          this.trashCan.rect(0, 0, 80, 80);
          this.trashCan.fill({ color: 0x880000, alpha: 0.8 });
          this.trashCan.stroke({ width: 2, color: 0xff0000 });
          this.trashCan.position.set(110, 5);

          if (gridX >= 0 && gridX < this.GRID_WIDTH && gridY >= 0 && gridY < this.GRID_HEIGHT) {
            const worldPos = this.gridToWorld(gridX, gridY);
            this.previewSprite.position.set(worldPos.x, worldPos.y);

            const cell = this.grid[this.draggedSpriteGridPos.y][this.draggedSpriteGridPos.x];
            if (cell.sprite) {
              const radius = cell.sprite.radius;
              this.highlightGraphic.clear();
              const canPlace = this.canPlaceInRadius(gridX, gridY, radius);
              const color = canPlace ? 0x00ff00 : 0xff0000;

              const cells = this.getCellsInRadius(gridX, gridY, radius);
              for (const cellPos of cells) {
                if (cellPos.x >= 0 && cellPos.x < this.GRID_WIDTH && cellPos.y >= 0 && cellPos.y < this.GRID_HEIGHT) {
                  this.highlightGraphic.rect(cellPos.x * this.TILE_SIZE, cellPos.y * this.TILE_SIZE, this.TILE_SIZE, this.TILE_SIZE);
                  this.highlightGraphic.fill({ color, alpha: 0.3 });
                }
              }
            }
          }
        }
      } else if (this.isDragging) {
        this.world.x = e.clientX - this.dragStart.x;
        this.world.y = e.clientY - this.dragStart.y;
        this.hideTooltip();
      } else {
        // Show tooltip on hover
        const { gridX, gridY } = this.screenToGrid(e.clientX, e.clientY);
        if (
          gridX >= 0 &&
          gridX < this.GRID_WIDTH &&
          gridY >= 0 &&
          gridY < this.GRID_HEIGHT
        ) {
          const cell = this.grid[gridY][gridX];
          if (cell.occupied) {
            // For multi-tile sprites, get sprite from center cell
            let sprite = cell.sprite;
            if (!sprite && cell.centerX !== undefined && cell.centerY !== undefined) {
              sprite = this.grid[cell.centerY][cell.centerX].sprite;
            }
            if (sprite) {
              this.showTooltip(e.clientX, e.clientY, sprite);
              return;
            }
          }
        }
        this.hideTooltip();
      }
    });

    // click -> grid conversion example
    canvas.addEventListener("click", (e: MouseEvent) => {
      if (!this.isDraggingFromToolbar && !this.isDraggingSprite) {
        const { gridX, gridY } = this.screenToGrid(e.clientX, e.clientY);
        if (
          gridX >= 0 &&
          gridX < this.GRID_WIDTH &&
          gridY >= 0 &&
          gridY < this.GRID_HEIGHT
        ) {
          const cell = this.grid[gridY][gridX];
          if (cell.occupied) {
            // For multi-tile sprites, get sprite from center cell
            let sprite = cell.sprite;
            if (!sprite && cell.centerX !== undefined && cell.centerY !== undefined) {
              sprite = this.grid[cell.centerY][cell.centerX].sprite;
            }
            if (sprite) {
              console.log(`Cell (${gridX}, ${gridY}) contains: ${sprite.name} (Type: ${sprite.type}, Health: ${sprite.health}, Radius: ${sprite.radius} tiles)`);
            } else {
              console.log(`Cell (${gridX}, ${gridY}) is occupied but sprite reference missing`);
            }
          } else {
            console.log(`Cell (${gridX}, ${gridY}) is empty - valid for placement: ${this.canPlaceInRadius(gridX, gridY, 0)}`);
          }
        }
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

      // Update toolbar position
      if (this.toolbar) {
        this.toolbar.position.set(10, this.app.screen.height - 100);
      }
      
      // Update grid toggle button position
      if (this.gridToggleButton) {
        this.gridToggleButton.position.set(this.app.screen.width - 130, 10);
      }
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

    // Constrain panning to grid boundaries
    const gridPixelWidth = this.GRID_WIDTH * this.TILE_SIZE * this.zoom;
    const gridPixelHeight = this.GRID_HEIGHT * this.TILE_SIZE * this.zoom;

    const minX = this.app.screen.width - gridPixelWidth;
    const maxX = 0;
    const minY = this.app.screen.height - gridPixelHeight;
    const maxY = 0;

    this.world.x = Math.max(minX, Math.min(maxX, this.world.x));
    this.world.y = Math.max(minY, Math.min(maxY, this.world.y));

    if (prevZoom !== this.zoom) this.renderer.setZoom(this.zoom);

    // Draw orange highlights for occupied cells
    this.drawOccupiedCells();

    // Update all sprites (only update center cells to avoid duplicates)
    for (let y = 0; y < this.GRID_HEIGHT; y++) {
      for (let x = 0; x < this.GRID_WIDTH; x++) {
        const cell = this.grid[y][x];
        // Only update if this is the center cell (has the sprite reference)
        if (cell.sprite && (!cell.centerX || (cell.centerX === x && cell.centerY === y))) {
          cell.sprite.update(time.deltaTime);
        }
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

  // Helper to get all cells within a circular radius
  getCellsInRadius(centerX: number, centerY: number, radius: number): { x: number; y: number }[] {
    const cells: { x: number; y: number }[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          cells.push({ x: centerX + dx, y: centerY + dy });
        }
      }
    }
    return cells;
  }

  // Check if all cells in radius are available
  canPlaceInRadius(centerX: number, centerY: number, radius: number): boolean {
    const cells = this.getCellsInRadius(centerX, centerY, radius);
    for (const cell of cells) {
      if (
        cell.x < 0 ||
        cell.x >= this.GRID_WIDTH ||
        cell.y < 0 ||
        cell.y >= this.GRID_HEIGHT
      ) {
        return false;
      }
      if (this.grid[cell.y][cell.x].occupied) {
        return false;
      }
    }
    return true;
  }

  // Place sprite with radius occupation
  placeSprite(gridX: number, gridY: number, sprite: GameSprite): boolean {
    if (!this.canPlaceInRadius(gridX, gridY, sprite.radius)) {
      console.log("Cannot place - cells occupied or out of bounds");
      return false;
    }

    // Occupy all cells in radius
    const cells = this.getCellsInRadius(gridX, gridY, sprite.radius);
    for (const cell of cells) {
      this.grid[cell.y][cell.x].occupied = true;
      this.grid[cell.y][cell.x].centerX = gridX;
      this.grid[cell.y][cell.x].centerY = gridY;
      // Only add sprite reference to the center cell
      if (cell.x === gridX && cell.y === gridY) {
        this.grid[cell.y][cell.x].sprite = sprite;
      }
    }

    // Position sprite
    const worldPos = this.gridToWorld(gridX, gridY);
    sprite.getDisplay().position.set(worldPos.x, worldPos.y);
    this.world.addChild(sprite.getDisplay());

    // Track planets
    if (sprite instanceof PlanetSprite) {
      this.planets.push(sprite);
    }

    return true;
  }

  // Remove sprite from grid
  removeSprite(gridX: number, gridY: number): boolean {
    const cell = this.grid[gridY][gridX];
    if (!cell.sprite) {
      console.log("No sprite at that position");
      return false;
    }

    const sprite = cell.sprite;
    const radius = sprite.radius;

    // Clear all cells in radius
    const cells = this.getCellsInRadius(gridX, gridY, radius);
    for (const cellPos of cells) {
      this.grid[cellPos.y][cellPos.x].occupied = false;
      this.grid[cellPos.y][cellPos.x].sprite = null;
      this.grid[cellPos.y][cellPos.x].centerX = undefined;
      this.grid[cellPos.y][cellPos.x].centerY = undefined;
    }

    // Remove from world
    this.world.removeChild(sprite.getDisplay());

    // Remove from planets array if it's a planet
    if (sprite instanceof PlanetSprite) {
      const index = this.planets.indexOf(sprite);
      if (index > -1) {
        this.planets.splice(index, 1);
      }
    }

    return true;
  }

  // Move sprite from one position to another
  moveSprite(fromX: number, fromY: number, toX: number, toY: number): boolean {
    const fromCell = this.grid[fromY][fromX];
    if (!fromCell.sprite) {
      console.log("No sprite at source position");
      return false;
    }

    const sprite = fromCell.sprite;
    const radius = sprite.radius;

    // Check if we can place at destination (temporarily clear source cells for check)
    const sourceCells = this.getCellsInRadius(fromX, fromY, radius);
    for (const cell of sourceCells) {
      this.grid[cell.y][cell.x].occupied = false;
    }

    const canPlace = this.canPlaceInRadius(toX, toY, radius);

    // Restore source cells
    for (const cell of sourceCells) {
      this.grid[cell.y][cell.x].occupied = true;
    }

    if (!canPlace) {
      console.log("Cannot move to that position");
      return false;
    }

    // Remove from old position
    for (const cell of sourceCells) {
      this.grid[cell.y][cell.x].occupied = false;
      this.grid[cell.y][cell.x].sprite = null;
      this.grid[cell.y][cell.x].centerX = undefined;
      this.grid[cell.y][cell.x].centerY = undefined;
    }

    // Place at new position
    const destCells = this.getCellsInRadius(toX, toY, radius);
    for (const cell of destCells) {
      this.grid[cell.y][cell.x].occupied = true;
      this.grid[cell.y][cell.x].centerX = toX;
      this.grid[cell.y][cell.x].centerY = toY;
      if (cell.x === toX && cell.y === toY) {
        this.grid[cell.y][cell.x].sprite = sprite;
      }
    }

    // Update sprite position
    const worldPos = this.gridToWorld(toX, toY);
    sprite.getDisplay().position.set(worldPos.x, worldPos.y);

    return true;
  }
}
