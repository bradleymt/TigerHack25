import { Application, Container, Graphics, Ticker, Text, Sprite, Texture } from "pixi.js";
import { Renderer } from "./renderer";
import { GameSprite, GridCell, Grid, PlanetSprite, ExplosionSprite, createSprite, applyGravityField } from "./sprite";
import { SoundManager } from "./soundManager";
import {
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_SPEED,
  NUM_ASTEROIDS,
  NUM_BLACK_HOLES,
  ASTEROID_RADIUS,
  BLACK_HOLE_RADIUS,
  PLANET_RADIUS,
  ASTEROID_ROTATION_MIN,
  ASTEROID_ROTATION_MAX,
  PLANET_ROTATION_MIN,
  PLANET_ROTATION_MAX,
  BLACK_HOLE_TILES,
  PLANET_TILES,
  TURRET_TILES,
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
  private selectedTexture: Texture | null = null;
  
  // Toolbar elements
  private trashCan!: Graphics;
  private turretTexture: Texture | null = null;
  private explosionTexture: Texture | null = null;
  private gridToggleButton!: Graphics;
  private gridToggleText!: Text;
  
  // Grid visibility toggle
  private showGrid = false;
  private needsOccupiedCellsRedraw = false;
  
  // Bunny launch system
  private isLaunching = false;
  private launchStartPos: { x: number; y: number } | null = null;
  private launchSprite: GameSprite | null = null;
  private aimerGraphics!: Graphics;
  
  // Planets for tracking
  private planets: PlanetSprite[] = [];
  
  // Active explosions
  private explosions: GameSprite[] = [];

  // Sound manager
  private soundManager: SoundManager;

  constructor(app: Application) {
    this.soundManager = new SoundManager();
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
        row.push({ gravity: { ax: 0, ay: 0 }, sprite: null, occupied: false });
      }
      this.grid.push(row);
    }
    
    // Create renderer
    const gridGraphics = new Graphics();
    this.world.addChild(gridGraphics);
    this.renderer = new Renderer(gridGraphics, this.TILE_SIZE, this.GRID_WIDTH, this.GRID_HEIGHT);

    // Create aimer graphics for trajectory preview
    this.aimerGraphics = new Graphics();
    this.world.addChild(this.aimerGraphics);

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

  // Initialize toolbar with bunny and turret sprites
  initToolbar(bunnyTexture: Texture, turretTexture: Texture) {
    this.turretTexture = turretTexture;
    const BUNNY_TILES = 1;

    this.toolbar = new Container();
    this.toolbar.position.set(10, this.app.screen.height - 100);
    this.uiContainer.addChild(this.toolbar);

    // Toolbar background (wider to fit both sprites and trash)
    const toolbarBg = new Graphics();
    toolbarBg.rect(0, 0, 310, 90);
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

    // Turret sprite button (bigger, not rotated)
    const turretScale = ((this.TILE_SIZE * TURRET_TILES) / Math.max(turretTexture.width, turretTexture.height));
    const toolbarTurret = new Sprite(turretTexture);
    toolbarTurret.anchor.set(0.5);
    toolbarTurret.position.set(125, 45);
    toolbarTurret.scale.set(turretScale * 0.8);
    toolbarTurret.eventMode = "static";
    toolbarTurret.cursor = "pointer";
    this.toolbar.addChild(toolbarTurret);

    // Trash can
    this.trashCan = new Graphics();
    this.trashCan.rect(0, 0, 80, 80);
    this.trashCan.fill({ color: 0x880000, alpha: 0.8 });
    this.trashCan.stroke({ width: 2, color: 0xff0000 });
    this.trashCan.position.set(220, 5);
    this.toolbar.addChild(this.trashCan);

    // Trash icon (X)
    const trashIcon = new Graphics();
    trashIcon.moveTo(20, 20);
    trashIcon.lineTo(60, 60);
    trashIcon.moveTo(60, 20);
    trashIcon.lineTo(20, 60);
    trashIcon.stroke({ width: 4, color: 0xffffff });
    trashIcon.position.set(220, 5);
    this.toolbar.addChild(trashIcon);

    // Grid toggle button (top-right corner)
    this.gridToggleButton = new Graphics();
    this.gridToggleButton.rect(0, 0, 160, 40);
    this.gridToggleButton.fill({ color: 0xaa0000, alpha: 0.8 });
    this.gridToggleButton.stroke({ width: 2, color: 0xff0000 });
    this.gridToggleButton.position.set(this.app.screen.width - 170, 10);
    this.gridToggleButton.eventMode = "static";
    this.gridToggleButton.cursor = "pointer";
    this.uiContainer.addChild(this.gridToggleButton);

    this.gridToggleText = new Text({
      text: "Graphic Content: OFF",
      style: { fontSize: 14, fill: 0xffffff, fontWeight: "bold" },
    });
    this.gridToggleText.anchor.set(0.5);
    this.gridToggleText.position.set(80, 20);
    this.gridToggleButton.addChild(this.gridToggleText);

    // Grid toggle click handler
    this.gridToggleButton.on("pointerdown", (e: any) => {
      e.stopPropagation();
      this.showGrid = !this.showGrid;
      this.gridToggleText.text = this.showGrid ? "Graphic Content: ON" : "Graphic Content: OFF";
      
      // Update button color
      this.gridToggleButton.clear();
      this.gridToggleButton.rect(0, 0, 160, 40);
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
        this.needsOccupiedCellsRedraw = true;
      } else {
        this.renderer.hideGrid();
        this.needsOccupiedCellsRedraw = true;
      }
    });

    // Bunny click handler
    toolbarBunny.on("pointerdown", (e: any) => {
      e.stopPropagation();
      this.isDraggingFromToolbar = true;
      this.selectedTexture = bunnyTexture;
      this.soundManager.play('pickup');

      this.previewSprite = new Sprite(bunnyTexture);
      this.previewSprite.anchor.set(0.5);
      this.previewSprite.alpha = 0.7;
      this.previewSprite.scale.set(bunnyScale);
      this.world.addChild(this.previewSprite);
    });

    // Turret click handler
    toolbarTurret.on("pointerdown", (e: any) => {
      e.stopPropagation();
      this.isDraggingFromToolbar = true;
      this.selectedTexture = turretTexture;
      this.soundManager.play('pickup');

      this.previewSprite = new Sprite(turretTexture);
      this.previewSprite.anchor.set(0.5);
      this.previewSprite.alpha = 0.7;
      this.previewSprite.scale.set(turretScale);
      this.world.addChild(this.previewSprite);
    });
  }

  // Generate asteroids and planets
  generateWorld(asteroidTexture: Texture, planetTexture: Texture, shieldTexture?: Texture, blackHoleTexture?: Texture) {
    // Calculate scales based on TILE_SIZE
    const blackHoleScale = blackHoleTexture ? (this.TILE_SIZE * BLACK_HOLE_TILES) / blackHoleTexture.width : 1;
    const planetScale = (this.TILE_SIZE * PLANET_TILES) / planetTexture.width;

    // Shield radius is 1.4x the planet radius (to match visual scale)
    const shieldRadius = Math.round(PLANET_RADIUS * 1.4);

    // Generate planets FIRST (so asteroids can avoid them)
    const sharedRotationSpeed =
      (Math.random() * (PLANET_ROTATION_MAX - PLANET_ROTATION_MIN) +
        PLANET_ROTATION_MIN) *
      (Math.random() < 0.5 ? 1 : -1);
    
    // Random starting rotations for visual variety
    const planet1StartRotation = Math.random() * Math.PI * 2;
    const planet2StartRotation = Math.random() * Math.PI * 2;

    // Planet 1 (left side - close to edge, not in leftmost third)
    // Place in the range of 10-25% from left edge
    for (let attempt = 0; attempt < 100; attempt++) {
      const x = Math.floor(this.GRID_WIDTH * 0.1 + Math.random() * (this.GRID_WIDTH * 0.15));
      const y = Math.floor(Math.random() * this.GRID_HEIGHT);

      if (this.canPlaceInRadius(x, y, PLANET_RADIUS)) {
        const planet1 = createSprite("planet", {
          texture: planetTexture,
          rotationSpeed: sharedRotationSpeed,
          name: "Player 1 Base",
          centerX: x,
          centerY: y,
          shieldTexture: shieldTexture,
          initialRotation: planet1StartRotation,
        });
        (planet1.getDisplay() as Container).scale.set(planetScale);

        this.placeSprite(x, y, planet1);
        
        // Create gravity field for planet
        applyGravityField(this.grid, x, y, 35, 0.5);
        
        break;
      }
    }

    // Planet 2 (right side - close to edge, mirror of planet 1)
    // Place in the range of 75-90% from left edge
    for (let attempt = 0; attempt < 100; attempt++) {
      const x = Math.floor(this.GRID_WIDTH * 0.75 + Math.random() * (this.GRID_WIDTH * 0.15));
      const y = Math.floor(Math.random() * this.GRID_HEIGHT);

      if (this.canPlaceInRadius(x, y, PLANET_RADIUS)) {
        const planet2 = createSprite("planet", {
          texture: planetTexture,
          rotationSpeed: sharedRotationSpeed,
          name: "Player 2 Base",
          centerX: x,
          centerY: y,
          shieldTexture: shieldTexture,
          initialRotation: planet2StartRotation,
        });
        (planet2.getDisplay() as Container).scale.set(planetScale);

        this.placeSprite(x, y, planet2);
        
        // Create gravity field for planet
        applyGravityField(this.grid, x, y, 35, 0.5);
        
        break;
      }
    }

    // Generate asteroids (avoiding planet shields)
    let placed = 0;
    let attempts = 0;
    const maxAttempts = NUM_ASTEROIDS * 10;

    while (placed < NUM_ASTEROIDS && attempts < maxAttempts) {
      attempts++;
      const x = Math.floor(Math.random() * this.GRID_WIDTH);
      const y = Math.floor(Math.random() * this.GRID_HEIGHT);

      // Check if position is valid and not within shield radius of any planet
      let tooCloseToShield = false;
      for (const planet of this.planets) {
        const dx = x - planet.centerX;
        const dy = y - planet.centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < shieldRadius) {
          tooCloseToShield = true;
          break;
        }
      }

      if (!tooCloseToShield && this.canPlaceInRadius(x, y, ASTEROID_RADIUS)) {
        const rotationSpeed =
          (Math.random() * (ASTEROID_ROTATION_MAX - ASTEROID_ROTATION_MIN) +
            ASTEROID_ROTATION_MIN) *
          (Math.random() < 0.5 ? 1 : -1);

        // Random scale between 0.5 and 1.5
        const randomScale = 0.5 + Math.random();

        const asteroid = createSprite("asteroid", {
          texture: asteroidTexture,
          rotationSpeed,
          scale: randomScale,
        });

        this.placeSprite(x, y, asteroid);
        
        // Create weak gravity field for asteroid
        applyGravityField(this.grid, x, y, 10, 0.1);
        
        placed++;
      }
    }
    console.log(`Placed ${placed} asteroids out of ${NUM_ASTEROIDS} attempts`);

    // Generate black holes as large obstacles in the middle zone between planets
    if (blackHoleTexture) {
      let blackHolesPlaced = 0;
      for (let attempt = 0; attempt < 100 && blackHolesPlaced < NUM_BLACK_HOLES; attempt++) {
        // Bias black holes to spawn in the middle 60% of the map (20-80% from left edge)
        const x = Math.floor(this.GRID_WIDTH * 0.2 + Math.random() * (this.GRID_WIDTH * 0.6));
        const y = Math.floor(Math.random() * this.GRID_HEIGHT);

        if (this.canPlaceInRadius(x, y, BLACK_HOLE_RADIUS)) {
          const rotationSpeed = Math.random() * 0.003 + 0.001; // Slow rotation
          const blackHole = createSprite("blackhole", {
            texture: blackHoleTexture,
            rotationSpeed,
          });
          (blackHole.getDisplay() as Sprite).scale.set(blackHoleScale);

          this.placeSprite(x, y, blackHole);
          
          // Create stronger gravity field for black hole
          applyGravityField(this.grid, x, y, 30, 1.0);
          
          blackHolesPlaced++;
        }
      }
      console.log(`Placed ${blackHolesPlaced} black holes out of ${NUM_BLACK_HOLES} attempts`);
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

  // Set explosion texture for creating explosion sprites
  setExplosionTexture(texture: Texture) {
    this.explosionTexture = texture;
  }

  // Show tooltip at cursor position with sprite info
  showTooltip(x: number, y: number, sprite: GameSprite) {
    if (!this.tooltipBg || !this.tooltipText) return;

    const lines = [
      `Name: ${sprite.name}`,
      `Type: ${sprite.type}`,
    ];

    // Only show health if the sprite has health (not black holes)
    if (sprite.health > 0) {
      lines.splice(1, 0, `Health: ${sprite.health}`);
    }

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
    
    // Draw occupied cells
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
        }
      }
    }
    
    this.highlightGraphic.fill({ color: 0xff8800, alpha: 0.3 });
    
    // Draw gravity radius circles for objects with gravity
    for (let y = 0; y < this.GRID_HEIGHT; y++) {
      for (let x = 0; x < this.GRID_WIDTH; x++) {
        const cell = this.grid[y][x];
        // Only draw for center cells to avoid duplicates
        if (cell.sprite && (!cell.centerX || (cell.centerX === x && cell.centerY === y))) {
          const sprite = cell.sprite;
          const worldPos = this.gridToWorld(x, y);
          
          // Determine gravity radius based on sprite type
          let gravityRadius = 0;
          
          if (sprite.type === "Planet") {
            gravityRadius = 35; // tiles
          } else if (sprite.type === "Black Hole") {
            gravityRadius = 30; // tiles
          } else if (sprite.type === "Asteroid") {
            gravityRadius = 10; // tiles
          }
          
          if (gravityRadius > 0) {
            // Draw gravity radius circle (outer, lighter green)
            this.highlightGraphic.circle(worldPos.x, worldPos.y, gravityRadius * this.TILE_SIZE);
            this.highlightGraphic.stroke({ width: 3, color: 0x00ff00, alpha: 0.4 });
            
            // Draw physical radius circle (inner, brighter green)
            this.highlightGraphic.circle(worldPos.x, worldPos.y, sprite.radius * this.TILE_SIZE);
            this.highlightGraphic.stroke({ width: 3, color: 0x00ff00, alpha: 0.9 });
          }
        }
      }
    }
  }

  start() {
    // Start background music
    this.soundManager.playBackgroundMusic();

    // wheel for zoom
    window.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.targetZoom += -event.deltaY * 0.001;
        this.targetZoom = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, this.targetZoom),
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
                // Start launch mode for non-immutable sprites (bunnies, turrets)
                this.isLaunching = true;
                this.launchStartPos = { x: e.clientX, y: e.clientY };
                this.launchSprite = sprite;
                console.log(`Click and drag to launch ${sprite.name}`);
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
      if (this.isLaunching && this.launchStartPos && this.launchSprite) {
        // Calculate launch velocity based on drag distance
        const dx = this.launchStartPos.x - e.clientX;
        const dy = this.launchStartPos.y - e.clientY;
        
        // Scale factor for launch velocity (increased for faster projectiles)
        const velocityScale = 0.1;
        this.launchSprite.vx = dx * velocityScale;
        this.launchSprite.vy = dy * velocityScale;
        
        console.log(`Launched ${this.launchSprite.name} with velocity (${this.launchSprite.vx.toFixed(2)}, ${this.launchSprite.vy.toFixed(2)})`);
        
        // Reset launch state and clear aimer
        this.isLaunching = false;
        this.launchStartPos = null;
        this.launchSprite = null;
        this.aimerGraphics.clear();
      } else if (this.isDraggingFromToolbar && this.previewSprite && this.selectedTexture) {
        const { gridX, gridY } = this.screenToGrid(e.clientX, e.clientY);

        if (gridX >= 0 && gridX < this.GRID_WIDTH && gridY >= 0 && gridY < this.GRID_HEIGHT) {
          // Determine sprite type based on texture
          const isTurret = this.selectedTexture === this.turretTexture;
          const radius = isTurret ? 1 : 0;
          
          if (this.canPlaceInRadius(gridX, gridY, radius)) {
            // Create the appropriate sprite
            const sprite = createSprite(isTurret ? "turret" : "bunny", {
              texture: this.selectedTexture,
              name: isTurret ? "Turret" : "Building",
            });
            const SPRITE_TILES = isTurret ? TURRET_TILES : 1;
            const spriteScale = ((this.TILE_SIZE * SPRITE_TILES) / Math.max(this.selectedTexture.width, this.selectedTexture.height));
            (sprite.getDisplay() as Sprite).scale.set(spriteScale);

            this.placeSprite(gridX, gridY, sprite);
            this.soundManager.play('placeBuilding');
            console.log(`Placed ${isTurret ? 'turret' : 'building'} at grid (${gridX}, ${gridY})`);
          } else {
            this.soundManager.play('invalidPlacement');
            console.log("Cannot place - cells occupied or out of bounds");
          }
        }

        this.world.removeChild(this.previewSprite);
        this.previewSprite = null;
        this.highlightGraphic.clear();
        this.selectedTexture = null;
      }

      this.isDraggingFromToolbar = false;
      this.isDragging = false;
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
      } else if (this.isLaunching && this.launchStartPos && this.launchSprite) {
        // Draw aimer trajectory
        this.drawTrajectory(e.clientX, e.clientY);
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
      if (!this.isDraggingFromToolbar) {
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
        this.gridToggleButton.position.set(this.app.screen.width - 170, 10);
      }
    }

    // resize handling
    window.addEventListener("resize", resizeWindow);
    resizeWindow();
  }

  private tick(time: Ticker) {
    const prevZoom = this.zoom;
    this.zoom += (this.targetZoom - this.zoom) * ZOOM_SPEED;

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

    if (prevZoom !== this.zoom) {
      this.renderer.setZoom(this.zoom);
      this.needsOccupiedCellsRedraw = true;
    }

    // Draw orange highlights for occupied cells (only when needed)
    if (this.needsOccupiedCellsRedraw) {
      this.drawOccupiedCells();
      this.needsOccupiedCellsRedraw = false;
    }

    // Update all sprites (only update center cells to avoid duplicates)
    for (let y = 0; y < this.GRID_HEIGHT; y++) {
      for (let x = 0; x < this.GRID_WIDTH; x++) {
        const cell = this.grid[y][x];
        // Only update if this is the center cell (has the sprite reference)
        if (cell.sprite && (!cell.centerX || (cell.centerX === x && cell.centerY === y))) {
          const sprite = cell.sprite;
          
          // For moving sprites (with velocity), get gravity from current world position
          if (sprite.vx !== 0 || sprite.vy !== 0) {
            const worldPos = sprite.getDisplay().position;
            const currentGridX = Math.floor(worldPos.x / this.TILE_SIZE);
            const currentGridY = Math.floor(worldPos.y / this.TILE_SIZE);
            
            let ax = 0;
            let ay = 0;
            if (currentGridX >= 0 && currentGridX < this.GRID_WIDTH && 
                currentGridY >= 0 && currentGridY < this.GRID_HEIGHT) {
              ax = this.grid[currentGridY][currentGridX].gravity.ax;
              ay = this.grid[currentGridY][currentGridX].gravity.ay;
            }
            
            sprite.update(time.deltaTime, ax, ay);
            
            // Check for collision with immutable objects
            // Use worldPos already declared above
            let collision = false;
            
            // Check all grid cells for immutable sprites
            for (let checkY = 0; checkY < this.GRID_HEIGHT && !collision; checkY++) {
              for (let checkX = 0; checkX < this.GRID_WIDTH && !collision; checkX++) {
                const checkCell = this.grid[checkY][checkX];
                // Only check center cells with immutable sprites
                if (checkCell.sprite && checkCell.sprite.immutable && 
                    (!checkCell.centerX || (checkCell.centerX === checkX && checkCell.centerY === checkY))) {
                  const targetSprite = checkCell.sprite;
                  const targetPos = targetSprite.getDisplay().position;
                  
                  // Calculate distance between sprites
                  const dx = worldPos.x - targetPos.x;
                  const dy = worldPos.y - targetPos.y;
                  const distance = Math.sqrt(dx * dx + dy * dy);
                  
                  // Check if moving sprite is within target's radius
                  const collisionRadius = targetSprite.radius * this.TILE_SIZE;
                  if (distance < collisionRadius) {
                    collision = true;
                    
                    // Create explosion at collision point
                    this.createExplosion(worldPos.x, worldPos.y, 1.0);
                    this.soundManager.play('explosion');
                    
                    // Apply damage to the target (100 damage from bunny/turret projectile)
                    // Skip damage for black holes - they are invulnerable
                    let targetDestroyed = false;
                    if (targetSprite.name !== "Black Hole") {
                      targetDestroyed = targetSprite.takeDamage(100);
                    }
                    
                    // Remove the target if health reached 0
                    if (targetDestroyed) {
                      // Find the target's grid position
                      const targetCells = this.getCellsInRadius(checkX, checkY, targetSprite.radius);
                      for (const targetCell of targetCells) {
                        if (targetCell.x >= 0 && targetCell.x < this.GRID_WIDTH && 
                            targetCell.y >= 0 && targetCell.y < this.GRID_HEIGHT) {
                          const cell = this.grid[targetCell.y][targetCell.x];
                          // Only clear if this cell belongs to the target sprite
                          if (cell.centerX === checkX && cell.centerY === checkY) {
                            this.grid[targetCell.y][targetCell.x].occupied = false;
                            this.grid[targetCell.y][targetCell.x].sprite = null;
                            this.grid[targetCell.y][targetCell.x].centerX = undefined;
                            this.grid[targetCell.y][targetCell.x].centerY = undefined;
                          }
                        }
                      }
                      this.world.removeChild(targetSprite.getDisplay());
                      
                      // Remove from planets array if it was a planet
                      const planetIndex = this.planets.indexOf(targetSprite as any);
                      if (planetIndex > -1) {
                        this.planets.splice(planetIndex, 1);
                      }
                      
                      console.log(`${targetSprite.name} destroyed!`);
                    } else {
                      console.log(`${targetSprite.name} took 100 damage. Health: ${targetSprite.health}/${targetSprite.maxHealth}`);
                    }
                    
                    // Remove the moving sprite (projectile) - only clear cells that belong to this sprite
                    const oldCells = this.getCellsInRadius(x, y, sprite.radius);
                    for (const oldCell of oldCells) {
                      if (oldCell.x >= 0 && oldCell.x < this.GRID_WIDTH && 
                          oldCell.y >= 0 && oldCell.y < this.GRID_HEIGHT) {
                        const cell = this.grid[oldCell.y][oldCell.x];
                        // Only clear if this cell belongs to the moving sprite (not to an immutable object)
                        if (cell.centerX === x && cell.centerY === y) {
                          this.grid[oldCell.y][oldCell.x].occupied = false;
                          this.grid[oldCell.y][oldCell.x].sprite = null;
                          this.grid[oldCell.y][oldCell.x].centerX = undefined;
                          this.grid[oldCell.y][oldCell.x].centerY = undefined;
                        }
                      }
                    }
                    this.world.removeChild(sprite.getDisplay());
                    this.needsOccupiedCellsRedraw = true;
                    break;
                  }
                }
              }
            }
            
            // Only update grid position if no collision occurred
            if (!collision) {
              // Update grid position if sprite has moved to a new cell
              if (currentGridX !== x || currentGridY !== y) {
                // Clear old position
                const oldCells = this.getCellsInRadius(x, y, sprite.radius);
                for (const oldCell of oldCells) {
                  if (oldCell.x >= 0 && oldCell.x < this.GRID_WIDTH && 
                      oldCell.y >= 0 && oldCell.y < this.GRID_HEIGHT) {
                    this.grid[oldCell.y][oldCell.x].occupied = false;
                    this.grid[oldCell.y][oldCell.x].sprite = null;
                    this.grid[oldCell.y][oldCell.x].centerX = undefined;
                    this.grid[oldCell.y][oldCell.x].centerY = undefined;
                  }
                }
                
                // Set new position (only if still in bounds)
                if (currentGridX >= 0 && currentGridX < this.GRID_WIDTH && 
                    currentGridY >= 0 && currentGridY < this.GRID_HEIGHT) {
                  const newCells = this.getCellsInRadius(currentGridX, currentGridY, sprite.radius);
                  for (const newCell of newCells) {
                    if (newCell.x >= 0 && newCell.x < this.GRID_WIDTH && 
                        newCell.y >= 0 && newCell.y < this.GRID_HEIGHT) {
                      this.grid[newCell.y][newCell.x].occupied = true;
                      this.grid[newCell.y][newCell.x].centerX = currentGridX;
                      this.grid[newCell.y][newCell.x].centerY = currentGridY;
                      // Only add sprite reference to the center cell
                      if (newCell.x === currentGridX && newCell.y === currentGridY) {
                        this.grid[newCell.y][newCell.x].sprite = sprite;
                      }
                    }
                  }
                  this.needsOccupiedCellsRedraw = true;
                }
              }
            }
          } else {
            // Static sprites (no velocity) - don't apply gravity, just update
            sprite.update(time.deltaTime, 0, 0);
          }
        }
      }
    }

    // Update and clean up explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const explosion = this.explosions[i];
      explosion.update(time.deltaTime);
      
      // Remove finished explosions
      if ((explosion as ExplosionSprite).isFinished()) {
        this.world.removeChild(explosion.getDisplay());
        this.explosions.splice(i, 1);
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
      // Create gravity field for planet
      applyGravityField(this.grid, gridX, gridY, 35, 0.5);
    }
    
    // Create gravity field for black holes
    if (sprite.type === "blackhole") {
      applyGravityField(this.grid, gridX, gridY, 30, 1.0);
    }
    
    // Create gravity field for asteroids
    if (sprite.type === "Asteroid") {
      applyGravityField(this.grid, gridX, gridY, 10, 0.1);
    }

    // Mark that occupied cells need redrawing
    this.needsOccupiedCellsRedraw = true;

    return true;
  }

  // Remove sprite from grid
  removeSprite(gridX: number, gridY: number): boolean {
    const cell = this.grid[gridY][gridX];
    if (!cell.sprite) {
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

    // Create explosion at the sprite's position
    const worldPos = this.gridToWorld(gridX, gridY);
    this.createExplosion(worldPos.x, worldPos.y, Math.max(radius / 3, 1));
    this.soundManager.play('explosion');

    // Remove from planets array if it's a planet
    if (sprite instanceof PlanetSprite) {
      const index = this.planets.indexOf(sprite);
      if (index > -1) {
        this.planets.splice(index, 1);
      }
    }

    // Mark that occupied cells need redrawing
    this.needsOccupiedCellsRedraw = true;

    return true;
  }

  // Move sprite from one position to another
  moveSprite(fromX: number, fromY: number, toX: number, toY: number): boolean {
    const fromCell = this.grid[fromY][fromX];
    if (!fromCell.sprite) {
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

    // Mark that occupied cells need redrawing
    this.needsOccupiedCellsRedraw = true;

    return true;
  }

  // Create explosion effect
  createExplosion(x: number, y: number, scale: number = 1) {
    if (!this.explosionTexture) {
      console.warn("No explosion texture loaded");
      return;
    }
    
    // Sprite sheet layout: 8 columns × 6 rows = 48 frames
    const cols = 8;
    const rows = 6;
    const frameWidth = this.explosionTexture.width / cols;
    const frameHeight = this.explosionTexture.height / rows;
    
    // Parameters: texture, x, y, scale, totalFrames, frameWidth, frameHeight, framesPerRow, animationSpeed
    // 48 frames at 24 fps = animationSpeed of 24/60 = 0.4 (since game runs at 60 fps)
    const explosion = new ExplosionSprite(
      this.explosionTexture,
      x,
      y,
      scale,
      48,         // totalFrames - 48 frame sprite sheet
      frameWidth, // frameWidth - calculated from texture
      frameHeight, // frameHeight - calculated from texture
      cols,       // framesPerRow - 8 columns
      0.4         // animationSpeed - 24 fps (24 frames per second / 60 ticks per second = 0.4)
    );
    this.world.addChild(explosion.getDisplay());
    this.explosions.push(explosion);
  }

  /**
   * Draw trajectory prediction when launching a sprite
   */
  private drawTrajectory(mouseX: number, mouseY: number) {
    if (!this.launchStartPos || !this.launchSprite) return;

    this.aimerGraphics.clear();

    // Calculate initial velocity
    const dx = this.launchStartPos.x - mouseX;
    const dy = this.launchStartPos.y - mouseY;
    const velocityScale = 0.1;
    let vx = dx * velocityScale;
    let vy = dy * velocityScale;

    // Get sprite's current grid position
    const spriteWorldPos = this.launchSprite.getDisplay().position;
    let posX = spriteWorldPos.x;
    let posY = spriteWorldPos.y;

    // Simulate trajectory
    const maxSteps = 200;
    const deltaTime = 1.0; // Simulation delta
    const points: { x: number; y: number }[] = [{ x: posX, y: posY }];

    for (let i = 0; i < maxSteps; i++) {
      // Get grid position
      const gridX = Math.floor(posX / this.TILE_SIZE);
      const gridY = Math.floor(posY / this.TILE_SIZE);

      // Get gravity at this position
      let ax = 0;
      let ay = 0;
      if (gridX >= 0 && gridX < this.GRID_WIDTH && gridY >= 0 && gridY < this.GRID_HEIGHT) {
        ax = this.grid[gridY][gridX].gravity.ax;
        ay = this.grid[gridY][gridX].gravity.ay;
      }

      // Apply gravity
      vx += ax * deltaTime;
      vy += ay * deltaTime;

      // Clamp velocity
      const MAX_VELOCITY = 8;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > MAX_VELOCITY) {
        vx = (vx / speed) * MAX_VELOCITY;
        vy = (vy / speed) * MAX_VELOCITY;
      }

      // Update position
      posX += vx * deltaTime;
      posY += vy * deltaTime;

      // Stop if out of bounds
      if (posX < 0 || posX > this.GRID_WIDTH * this.TILE_SIZE || 
          posY < 0 || posY > this.GRID_HEIGHT * this.TILE_SIZE) {
        break;
      }

      points.push({ x: posX, y: posY });
    }

    // Draw trajectory line with dots
    this.aimerGraphics.moveTo(points[0].x, points[0].y);
    this.aimerGraphics.lineTo(points[0].x, points[0].y);
    this.aimerGraphics.stroke({ width: 2, color: 0x00ffff, alpha: 0.8 });

    for (let i = 0; i < points.length; i += 5) {
      const point = points[i];
      this.aimerGraphics.circle(point.x, point.y, 2);
      this.aimerGraphics.fill({ color: 0x00ffff, alpha: 0.6 });
    }

    // Draw line from sprite to mouse
    const { gridX: mouseGridX, gridY: mouseGridY } = this.screenToGrid(mouseX, mouseY);
    const mouseWorld = this.gridToWorld(mouseGridX, mouseGridY);
    this.aimerGraphics.moveTo(spriteWorldPos.x, spriteWorldPos.y);
    this.aimerGraphics.lineTo(mouseWorld.x, mouseWorld.y);
    this.aimerGraphics.stroke({ width: 1, color: 0xffff00, alpha: 0.5 });
  }
}
