import { Application, Assets, Sprite, Graphics, Container } from "pixi.js";
import type { GridCell, Star, RotatingObject, Planet, ObjectType } from "./types";
import {
  TILE_SIZE,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_SPEED,
  NUM_STARS,
  NUM_ASTEROIDS,
  BUNNY_TILES
} from "./constants";
import {
  initializeGridDimensions,
  gridToWorld,
  screenToGrid,
  getCellsInRadius,
  canPlaceInRadius,
  GRID_WIDTH,
  GRID_HEIGHT
} from "./utils";
import { placeSprite, placeBuildingOnPlanet, moveSprite, removeSprite } from "./grid";
import { generateAsteroids, generateBasePlanets } from "./worldGen";

(async () => {
  // Create and initialize application
  const app = new Application();
  await app.init({ width: window.innerWidth, height: window.innerHeight, background: "#000000ff" });
  document.getElementById("pixi-container")!.appendChild(app.canvas);

  // Initialize grid dimensions
  initializeGridDimensions(app.screen.width, app.screen.height, MIN_ZOOM);

  // Create moving stars background
  const starArray: Star[] = [];
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

    starArray.push({
      graphics: g,
      speed: Math.random() * 0.2 + 0.05,
      alphaDir: Math.random() < 0.5 ? 0.01 : -0.01
    });
  }

  // Create world container
  const world = new Container();
  app.stage.addChild(world);

  // Initialize grid
  const grid: GridCell[][] = [];
  for (let y = 0; y < GRID_HEIGHT; y++) {
    grid[y] = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
      grid[y][x] = null;
    }
  }

  // Track rotating objects and planets
  const rotatingObjects: RotatingObject[] = [];
  const planets: Planet[] = [];

  // Load textures
  const texture = await Assets.load("/assets/bunny.png");
  const planetTexture = await Assets.load("/assets/planet.jpg");
  const asteroidTexture = await Assets.load("/assets/asteroid.png");

  console.log("Image dimensions:");
  console.log("Bunny:", texture.width, "x", texture.height);
  console.log("Planet:", planetTexture.width, "x", planetTexture.height);
  console.log("Asteroid:", asteroidTexture.width, "x", asteroidTexture.height);

  // Calculate sprite scales
  const bunnyScale = ((TILE_SIZE * BUNNY_TILES * 0.8) / Math.max(texture.width, texture.height));

  console.log("Bunny scale:", bunnyScale.toFixed(2));

  // Generate world
  generateAsteroids(grid, world, rotatingObjects, asteroidTexture, NUM_ASTEROIDS);
  generateBasePlanets(grid, world, rotatingObjects, planets, planetTexture);

  // Draw grid
  const gridGraphics = new Graphics();
  world.addChild(gridGraphics);

  let zoom = MIN_ZOOM;
  let targetZoom = MIN_ZOOM;

  function drawGrid() {
    gridGraphics.clear();
    const lineWidth = 1 / zoom;

    for (let x = 0; x <= GRID_WIDTH; x++) {
      gridGraphics.moveTo(x * TILE_SIZE, 0);
      gridGraphics.lineTo(x * TILE_SIZE, GRID_HEIGHT * TILE_SIZE);
    }

    for (let y = 0; y <= GRID_HEIGHT; y++) {
      gridGraphics.moveTo(0, y * TILE_SIZE);
      gridGraphics.lineTo(GRID_WIDTH * TILE_SIZE, y * TILE_SIZE);
    }

    gridGraphics.stroke({ width: lineWidth, color: 0x333333, alpha: 0.5 });
  }

  drawGrid();

  // Zoom and panning
  window.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      targetZoom += -event.deltaY * 0.001;
      targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom));
    },
    { passive: false }
  );

  let isPanning = false;
  let panStart = { x: 0, y: 0 };

  // Create UI
  const uiContainer = new Container();
  app.stage.addChild(uiContainer);

  const toolbar = new Container();
  toolbar.position.set(10, app.screen.height - 100);
  uiContainer.addChild(toolbar);

  const toolbarBg = new Graphics();
  toolbarBg.rect(0, 0, 200, 90);
  toolbarBg.fill({ color: 0x222222, alpha: 0.9 });
  toolbarBg.stroke({ width: 2, color: 0x666666 });
  toolbar.addChild(toolbarBg);

  let selectedObjectType: ObjectType | null = null;

  const toolbarBunny = new Sprite(texture);
  toolbarBunny.anchor.set(0.5);
  toolbarBunny.position.set(45, 45);
  toolbarBunny.scale.set(bunnyScale * 0.8);
  toolbarBunny.eventMode = "static";
  toolbarBunny.cursor = "pointer";
  toolbar.addChild(toolbarBunny);

  const trashCan = new Graphics();
  trashCan.rect(0, 0, 80, 80);
  trashCan.fill({ color: 0x880000, alpha: 0.8 });
  trashCan.stroke({ width: 2, color: 0xff0000 });
  trashCan.position.set(110, 5);
  toolbar.addChild(trashCan);

  const trashIcon = new Graphics();
  trashIcon.moveTo(20, 20);
  trashIcon.lineTo(60, 60);
  trashIcon.moveTo(60, 20);
  trashIcon.lineTo(20, 60);
  trashIcon.stroke({ width: 4, color: 0xffffff });
  trashIcon.position.set(110, 5);
  toolbar.addChild(trashIcon);

  // Dragging state
  let previewSprite: Sprite | null = null;
  let isDraggingFromToolbar = false;
  let isDraggingSprite = false;
  let draggedSpriteGridPos: { x: number; y: number } | null = null;
  let isOverTrash = false;

  const highlightGraphic = new Graphics();
  world.addChild(highlightGraphic);

  // Toolbar bunny click
  toolbarBunny.on("pointerdown", (e) => {
    e.stopPropagation();
    isDraggingFromToolbar = true;
    selectedObjectType = { texture, type: "bunny", radius: 0 };

    previewSprite = new Sprite(texture);
    previewSprite.anchor.set(0.5);
    previewSprite.alpha = 0.7;
    previewSprite.scale.set(bunnyScale);
    world.addChild(previewSprite);
  });

  // Mouse handlers
  app.canvas.addEventListener("mousedown", (e) => {
    if (!isDraggingFromToolbar) {
      const { gridX, gridY } = screenToGrid(e.clientX, e.clientY, world.x, world.y, zoom);

      if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
        const cell = grid[gridY][gridX];
        if (cell !== null) {
          if (cell.immutable) {
            console.log(`Cannot move ${cell.type} - it's immutable`);
            isPanning = true;
            panStart.x = e.clientX - world.x;
            panStart.y = e.clientY - world.y;
          } else {
            isDraggingSprite = true;
            draggedSpriteGridPos = { x: gridX, y: gridY };
            previewSprite = cell.sprite;
            previewSprite.alpha = 0.7;
          }
        } else {
          isPanning = true;
          panStart.x = e.clientX - world.x;
          panStart.y = e.clientY - world.y;
        }
      } else {
        isPanning = true;
        panStart.x = e.clientX - world.x;
        panStart.y = e.clientY - world.y;
      }
    }
  });

  app.canvas.addEventListener("mouseup", (e) => {
    if (isDraggingFromToolbar && previewSprite && selectedObjectType) {
      const { gridX, gridY } = screenToGrid(e.clientX, e.clientY, world.x, world.y, zoom);

      if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
        if (canPlaceInRadius(grid, gridX, gridY, selectedObjectType.radius)) {
          const newSprite = new Sprite(selectedObjectType.texture);
          newSprite.anchor.set(0.5);

          if (selectedObjectType.type === "bunny") {
            newSprite.scale.set(bunnyScale);
          }

          if (selectedObjectType.type === "bunny") {
            placeBuildingOnPlanet(grid, world, planets, gridX, gridY, newSprite, selectedObjectType.type, selectedObjectType.radius);
          } else {
            placeSprite(grid, world, rotatingObjects, gridX, gridY, newSprite, selectedObjectType.type, selectedObjectType.radius);
          }
          console.log(`Placed ${selectedObjectType.type} at grid (${gridX}, ${gridY})`);
        } else {
          console.log("Cannot place - cells occupied or out of bounds");
        }
      }

      world.removeChild(previewSprite);
      previewSprite = null;
      highlightGraphic.clear();
      selectedObjectType = null;
    } else if (isDraggingSprite && draggedSpriteGridPos && previewSprite) {
      if (isOverTrash) {
        console.log(`Deleted sprite from (${draggedSpriteGridPos.x}, ${draggedSpriteGridPos.y})`);
        removeSprite(grid, world, draggedSpriteGridPos.x, draggedSpriteGridPos.y);
        previewSprite = null;
      } else {
        const { gridX, gridY } = screenToGrid(e.clientX, e.clientY, world.x, world.y, zoom);

        if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
          if (gridX === draggedSpriteGridPos.x && gridY === draggedSpriteGridPos.y) {
            previewSprite.alpha = 1;
          } else {
            const success = moveSprite(grid, draggedSpriteGridPos.x, draggedSpriteGridPos.y, gridX, gridY);
            if (success) {
              console.log(`Moved sprite from (${draggedSpriteGridPos.x}, ${draggedSpriteGridPos.y}) to (${gridX}, ${gridY})`);
            } else {
              console.log("Can't move there - returning to original position");
              const worldPos = gridToWorld(draggedSpriteGridPos.x, draggedSpriteGridPos.y);
              previewSprite.position.set(worldPos.x, worldPos.y);
            }
            previewSprite.alpha = 1;
          }
        } else {
          console.log("Outside grid - returning to original position");
          const worldPos = gridToWorld(draggedSpriteGridPos.x, draggedSpriteGridPos.y);
          previewSprite.position.set(worldPos.x, worldPos.y);
          previewSprite.alpha = 1;
        }
      }

      highlightGraphic.clear();
      draggedSpriteGridPos = null;
      previewSprite = null;
    }

    isDraggingFromToolbar = false;
    isDraggingSprite = false;
    isPanning = false;
    isOverTrash = false;
  });

  app.canvas.addEventListener("click", (e) => {
    if (!isDraggingFromToolbar) {
      const { gridX, gridY } = screenToGrid(e.clientX, e.clientY, world.x, world.y, zoom);
      console.log("Clicked grid cell:", gridX, gridY);

      if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
        const cell = grid[gridY][gridX];
        if (cell !== null) {
          console.log(`Cell (${gridX}, ${gridY}) contains: ${cell.type}`);
        } else {
          console.log(`Cell (${gridX}, ${gridY}) is empty`);
        }
      }
    }
  });

  app.canvas.addEventListener("mousemove", (e) => {
    if (isDraggingFromToolbar && previewSprite && selectedObjectType) {
      const { gridX, gridY } = screenToGrid(e.clientX, e.clientY, world.x, world.y, zoom);

      if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
        const worldPos = gridToWorld(gridX, gridY);
        previewSprite.position.set(worldPos.x, worldPos.y);

        highlightGraphic.clear();
        const canPlace = canPlaceInRadius(grid, gridX, gridY, selectedObjectType.radius);
        const color = canPlace ? 0x00ff00 : 0xff0000;

        const cells = getCellsInRadius(gridX, gridY, selectedObjectType.radius);
        for (const cell of cells) {
          if (cell.x >= 0 && cell.x < GRID_WIDTH && cell.y >= 0 && cell.y < GRID_HEIGHT) {
            highlightGraphic.rect(cell.x * TILE_SIZE, cell.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            highlightGraphic.fill({ color, alpha: 0.3 });
          }
        }
      }
    } else if (isDraggingSprite && previewSprite && draggedSpriteGridPos) {
      const { gridX, gridY } = screenToGrid(e.clientX, e.clientY, world.x, world.y, zoom);

      const trashBounds = {
        x: toolbar.x + 110,
        y: toolbar.y + 5,
        width: 80,
        height: 80
      };

      isOverTrash =
        e.clientX >= trashBounds.x &&
        e.clientX <= trashBounds.x + trashBounds.width &&
        e.clientY >= trashBounds.y &&
        e.clientY <= trashBounds.y + trashBounds.height;

      if (isOverTrash) {
        highlightGraphic.clear();
        trashCan.clear();
        trashCan.rect(0, 0, 80, 80);
        trashCan.fill({ color: 0xff0000, alpha: 0.9 });
        trashCan.stroke({ width: 3, color: 0xffff00 });
        trashCan.position.set(110, 5);
      } else {
        trashCan.clear();
        trashCan.rect(0, 0, 80, 80);
        trashCan.fill({ color: 0x880000, alpha: 0.8 });
        trashCan.stroke({ width: 2, color: 0xff0000 });
        trashCan.position.set(110, 5);

        if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
          const worldPos = gridToWorld(gridX, gridY);
          previewSprite.position.set(worldPos.x, worldPos.y);

          const cell = grid[draggedSpriteGridPos.y][draggedSpriteGridPos.x];
          if (cell) {
            const radius = cell.radius;
            highlightGraphic.clear();
            const canPlace = canPlaceInRadius(grid, gridX, gridY, radius);
            const color = canPlace ? 0x00ff00 : 0xff0000;

            const cells = getCellsInRadius(gridX, gridY, radius);
            for (const cellPos of cells) {
              if (cellPos.x >= 0 && cellPos.x < GRID_WIDTH && cellPos.y >= 0 && cellPos.y < GRID_HEIGHT) {
                highlightGraphic.rect(cellPos.x * TILE_SIZE, cellPos.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                highlightGraphic.fill({ color, alpha: 0.3 });
              }
            }
          }
        }
      }
    } else if (isPanning) {
      world.x = e.clientX - panStart.x;
      world.y = e.clientY - panStart.y;
    }
  });

  // Game loop
  app.ticker.add((time) => {
    // Smooth zoom
    const prevZoom = zoom;
    zoom += (targetZoom - zoom) * ZOOM_SPEED;

    const centerX = app.screen.width / 2;
    const centerY = app.screen.height / 2;

    world.x = centerX - ((centerX - world.x) * (zoom / prevZoom));
    world.y = centerY - ((centerY - world.y) * (zoom / prevZoom));
    world.scale.set(zoom);

    // Constrain panning to grid boundaries
    const gridPixelWidth = GRID_WIDTH * TILE_SIZE * zoom;
    const gridPixelHeight = GRID_HEIGHT * TILE_SIZE * zoom;

    const minX = app.screen.width - gridPixelWidth;
    const maxX = 0;
    const minY = app.screen.height - gridPixelHeight;
    const maxY = 0;

    world.x = Math.max(minX, Math.min(maxX, world.x));
    world.y = Math.max(minY, Math.min(maxY, world.y));

    if (prevZoom !== zoom) {
      drawGrid();
    }

    // Rotate objects
    rotatingObjects.forEach((obj) => {
      obj.sprite.rotation += obj.speed * time.deltaTime;
    });

    // Update planet rotations
    planets.forEach((planet) => {
      planet.currentRotation += planet.rotationSpeed * time.deltaTime;
    });

    // Update orbital buildings
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const cell = grid[y][x];
        if (cell && cell.parentPlanet && cell.orbitalAngle !== undefined && cell.orbitalDistance !== undefined) {
          const planet = planets.find(
            (p) => p.centerX === cell.parentPlanet!.centerX && p.centerY === cell.parentPlanet!.centerY
          );

          if (planet) {
            const currentAngle = cell.orbitalAngle + planet.currentRotation;
            const planetWorldPos = gridToWorld(planet.centerX, planet.centerY);
            const newX = planetWorldPos.x + Math.cos(currentAngle) * cell.orbitalDistance;
            const newY = planetWorldPos.y + Math.sin(currentAngle) * cell.orbitalDistance;

            cell.sprite.position.set(newX, newY);
            cell.sprite.rotation = currentAngle + Math.PI / 2;
          }
        }
      }
    }

    // Update stars
    starArray.forEach((star) => {
      star.graphics.y += star.speed;
      if (star.graphics.y > app.screen.height) star.graphics.y = 0;

      star.graphics.alpha += star.alphaDir;
      if (star.graphics.alpha > 1) star.alphaDir = -star.alphaDir;
      if (star.graphics.alpha < 0.2) star.alphaDir = -star.alphaDir;
    });
  });

  // Window resize
  window.addEventListener("resize", () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    toolbar.position.set(10, app.screen.height - 100);
  });

  // Center view
  const gridCenterX = (GRID_WIDTH * TILE_SIZE) / 2;
  const gridCenterY = (GRID_HEIGHT * TILE_SIZE) / 2;
  world.x = app.screen.width / 2 - gridCenterX * zoom;
  world.y = app.screen.height / 2 - gridCenterY * zoom;
})();
