import { Application, Assets, Sprite, Graphics, Container, Text } from "pixi.js";

(async () => {
  // Create a new application
  const app = new Application();

  // Initialize the application
  await app.init({width: window.innerWidth, height: window.innerHeight, background: "#000000ff"});

  // Append the application canvas to the document body
  document.getElementById("pixi-container")!.appendChild(app.canvas);

  //Create moving stars for our background
  type Star = { graphics: Graphics; speed: number; alphaDir: number };
  const starArray: Star[] = [];
  const numStars = 200;

  for (let i = 0; i < numStars; i++) {
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
      alphaDir: Math.random() < 0.5 ? 0.01 : -0.01,
    });
  }

  //Create world container for grid map
  const world = new Container();
  app.stage.addChild(world);

  const TILE_SIZE = 64;
  
  // Calculate grid dimensions based on screen size
  // Add extra buffer for panning beyond screen edges
  const BUFFER_MULTIPLIER = 2;
  const GRID_WIDTH = Math.ceil((app.screen.width * BUFFER_MULTIPLIER) / TILE_SIZE);
  const GRID_HEIGHT = Math.ceil((app.screen.height * BUFFER_MULTIPLIER) / TILE_SIZE);

  type GridCell = null | {type: string; sprite: Sprite};
  const grid: GridCell[][] = [];

  // Initialize grid
  for (let y = 0; y < GRID_HEIGHT; y++) {
    grid[y] = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
      grid[y][x] = null;
    }
  }

  // Load the bunny texture
  const texture = await Assets.load("/assets/bunny.png");
  const bunny = new Sprite(texture);
  bunny.anchor.set(0.5);
  
  // Position bunny in center of grid
  const centerGridX = Math.floor(GRID_WIDTH / 2);
  const centerGridY = Math.floor(GRID_HEIGHT / 2);
  bunny.position.set(
    centerGridX * TILE_SIZE + TILE_SIZE / 2,
    centerGridY * TILE_SIZE + TILE_SIZE / 2
  );
  
  world.addChild(bunny);

  // Track bunny in grid
  grid[centerGridY][centerGridX] = {
    type: "bunny",
    sprite: bunny
  };

  // Function to place sprite in grid
  function placeSprite(gridX: number, gridY: number, sprite: Sprite, type: string): boolean {
    // Check if position is valid and cell is empty
    if (gridX < 0 || gridX >= GRID_WIDTH || gridY < 0 || gridY >= GRID_HEIGHT) {
      console.log("Position out of bounds");
      return false;
    }
    
    if (grid[gridY][gridX] !== null) {
      console.log("Cell already occupied");
      return false;
    }
    
    // Place sprite
    grid[gridY][gridX] = { type, sprite };
    const worldPos = gridToWorld(gridX, gridY);
    sprite.position.set(worldPos.x, worldPos.y);
    world.addChild(sprite);
    
    return true;
  }

  // Function to move sprite from one grid cell to another
  function moveSprite(fromX: number, fromY: number, toX: number, toY: number): boolean {
    // Validate bounds
    if (fromX < 0 || fromX >= GRID_WIDTH || fromY < 0 || fromY >= GRID_HEIGHT ||
        toX < 0 || toX >= GRID_WIDTH || toY < 0 || toY >= GRID_HEIGHT) {
      return false;
    }
    
    const fromCell = grid[fromY][fromX];
    if (fromCell === null) {
      console.log("No sprite at source position");
      return false;
    }
    
    if (grid[toY][toX] !== null) {
      console.log("Destination cell occupied");
      return false;
    }
    
    // Move sprite
    grid[toY][toX] = fromCell;
    grid[fromY][fromX] = null;
    
    const worldPos = gridToWorld(toX, toY);
    fromCell.sprite.position.set(worldPos.x, worldPos.y);
    
    return true;
  }

  // Function to remove sprite from grid
  function removeSprite(gridX: number, gridY: number): boolean {
    if (gridX < 0 || gridX >= GRID_WIDTH || gridY < 0 || gridY >= GRID_HEIGHT) {
      return false;
    }
    
    const cell = grid[gridY][gridX];
    if (cell === null) {
      return false;
    }
    
    world.removeChild(cell.sprite);
    grid[gridY][gridX] = null;
    
    return true;
  }

  // Draw grid lines for visualization
  const gridGraphics = new Graphics();
  world.addChild(gridGraphics);
  
  //Zoom functionality
  let zoom = 1;
  let targetZoom = 1;
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 3;
  const ZOOM_SPEED = 0.1;
  
  // Function to redraw grid with appropriate line width for zoom level
  function drawGrid() {
    gridGraphics.clear();
    
    // Adjust line width inversely with zoom so it stays visually consistent
    const lineWidth = 1 / zoom;
    
    // Draw vertical lines
    for (let x = 0; x <= GRID_WIDTH; x++) {
      gridGraphics.moveTo(x * TILE_SIZE, 0);
      gridGraphics.lineTo(x * TILE_SIZE, GRID_HEIGHT * TILE_SIZE);
    }
    
    // Draw horizontal lines
    for (let y = 0; y <= GRID_HEIGHT; y++) {
      gridGraphics.moveTo(0, y * TILE_SIZE);
      gridGraphics.lineTo(GRID_WIDTH * TILE_SIZE, y * TILE_SIZE);
    }
    
    gridGraphics.stroke({ width: lineWidth, color: 0x333333, alpha: 0.5 });
  }
  
  drawGrid();

  window.addEventListener("wheel", (event) => {
    event.preventDefault();
    targetZoom += -event.deltaY * 0.001;
    targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom));
  }, {passive: false});

  //Panning functionality
  let isPanning = false;
  let panStart = {x: 0, y: 0};

  // Create UI container (not affected by world zoom/pan)
  const uiContainer = new Container();
  app.stage.addChild(uiContainer);

  // Create toolbar
  const toolbar = new Container();
  toolbar.position.set(10, app.screen.height - 100);
  uiContainer.addChild(toolbar);

  // Toolbar background
  const toolbarBg = new Graphics();
  toolbarBg.rect(0, 0, 200, 90);
  toolbarBg.fill({ color: 0x222222, alpha: 0.9 });
  toolbarBg.stroke({ width: 2, color: 0x666666 });
  toolbar.addChild(toolbarBg);

  // Create bunny button in toolbar
  const toolbarBunny = new Sprite(texture);
  toolbarBunny.anchor.set(0.5);
  toolbarBunny.position.set(45, 45);
  toolbarBunny.scale.set(0.5);
  toolbarBunny.eventMode = 'static';
  toolbarBunny.cursor = 'pointer';
  toolbar.addChild(toolbarBunny);

  // Create trash can
  const trashCan = new Graphics();
  trashCan.rect(0, 0, 80, 80);
  trashCan.fill({ color: 0x880000, alpha: 0.8 });
  trashCan.stroke({ width: 2, color: 0xff0000 });
  trashCan.position.set(110, 5);
  toolbar.addChild(trashCan);
  
  // Trash can icon (simple X)
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

  // Highlight graphic for valid/invalid placement
  const highlightGraphic = new Graphics();
  world.addChild(highlightGraphic);

  // Mouse down on toolbar bunny - start drag
  toolbarBunny.on('pointerdown', (e) => {
    e.stopPropagation();
    isDraggingFromToolbar = true;
    
    // Create preview sprite
    previewSprite = new Sprite(texture);
    previewSprite.anchor.set(0.5);
    previewSprite.alpha = 0.7;
    world.addChild(previewSprite);
  });

  // Global mouse handlers
  app.canvas.addEventListener("mousedown", (e) => {
    if (!isDraggingFromToolbar) {
      // Check if clicking on a sprite in the grid
      const { gridX, gridY } = screenToGrid(e.clientX, e.clientY);
      
      if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
        const cell = grid[gridY][gridX];
        if (cell !== null) {
          // Start dragging this sprite
          isDraggingSprite = true;
          draggedSpriteGridPos = { x: gridX, y: gridY };
          previewSprite = cell.sprite;
          previewSprite.alpha = 0.7;
          
          // Don't remove from grid yet, wait for drop
          console.log(`Picked up ${cell.type} from (${gridX}, ${gridY})`);
          return;
        }
      }
      
      // If not clicking a sprite, start panning
      isPanning = true;
      panStart.x = e.clientX - world.x;
      panStart.y = e.clientY - world.y;
    }
  });

  app.canvas.addEventListener("mouseup", (e) => {
    if (isDraggingFromToolbar && previewSprite) {
      // Try to place the sprite
      const { gridX, gridY } = screenToGrid(e.clientX, e.clientY);
      
      if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
        if (grid[gridY][gridX] === null) {
          // Place the sprite
          const newBunny = new Sprite(texture);
          newBunny.anchor.set(0.5);
          placeSprite(gridX, gridY, newBunny, "bunny");
          console.log(`Placed bunny at grid (${gridX}, ${gridY})`);
        } else {
          console.log("Cell already occupied");
        }
      }
      
      // Clean up preview
      world.removeChild(previewSprite);
      previewSprite = null;
      highlightGraphic.clear();
    } else if (isDraggingSprite && draggedSpriteGridPos && previewSprite) {
      // Check if over trash
      if (isOverTrash) {
        // Delete the sprite
        console.log(`Deleted sprite from (${draggedSpriteGridPos.x}, ${draggedSpriteGridPos.y})`);
        removeSprite(draggedSpriteGridPos.x, draggedSpriteGridPos.y);
        previewSprite = null;
      } else {
        // Try to move the sprite
        const { gridX, gridY } = screenToGrid(e.clientX, e.clientY);
        
        if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
          if (gridX === draggedSpriteGridPos.x && gridY === draggedSpriteGridPos.y) {
            // Dropped in same spot, just reset
            previewSprite.alpha = 1;
          } else if (grid[gridY][gridX] === null) {
            // Move to new position
            moveSprite(draggedSpriteGridPos.x, draggedSpriteGridPos.y, gridX, gridY);
            console.log(`Moved sprite from (${draggedSpriteGridPos.x}, ${draggedSpriteGridPos.y}) to (${gridX}, ${gridY})`);
            previewSprite.alpha = 1;
          } else {
            // Can't move there, return to original position
            console.log("Can't move there - cell occupied");
            previewSprite.alpha = 1;
          }
        } else {
          // Outside grid, return to original position
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

  // Click handler for grid info (only when not dragging)
  app.canvas.addEventListener("click", (e) => {
    if (!isDraggingFromToolbar) {
      const { gridX, gridY } = screenToGrid(e.clientX, e.clientY);
      console.log("Clicked grid cell:", gridX, gridY);
      
      // Check if click is within grid bounds
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
    if (isDraggingFromToolbar && previewSprite) {
      // Update preview position
      const { gridX, gridY } = screenToGrid(e.clientX, e.clientY);
      
      if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
        const worldPos = gridToWorld(gridX, gridY);
        previewSprite.position.set(worldPos.x, worldPos.y);
        
        // Draw highlight
        highlightGraphic.clear();
        const isOccupied = grid[gridY][gridX] !== null;
        const color = isOccupied ? 0xff0000 : 0x00ff00;
        highlightGraphic.rect(
          gridX * TILE_SIZE,
          gridY * TILE_SIZE,
          TILE_SIZE,
          TILE_SIZE
        );
        highlightGraphic.fill({ color, alpha: 0.3 });
      }
    } else if (isDraggingSprite && previewSprite && draggedSpriteGridPos) {
      // Update dragged sprite position
      const { gridX, gridY } = screenToGrid(e.clientX, e.clientY);
      
      // Check if over trash can
      const trashBounds = {
        x: toolbar.x + 110,
        y: toolbar.y + 5,
        width: 80,
        height: 80
      };
      
      isOverTrash = (
        e.clientX >= trashBounds.x &&
        e.clientX <= trashBounds.x + trashBounds.width &&
        e.clientY >= trashBounds.y &&
        e.clientY <= trashBounds.y + trashBounds.height
      );
      
      if (isOverTrash) {
        // Highlight trash can
        highlightGraphic.clear();
        trashCan.clear();
        trashCan.rect(0, 0, 80, 80);
        trashCan.fill({ color: 0xff0000, alpha: 0.9 });
        trashCan.stroke({ width: 3, color: 0xffff00 });
        trashCan.position.set(110, 5);
      } else {
        // Reset trash can
        trashCan.clear();
        trashCan.rect(0, 0, 80, 80);
        trashCan.fill({ color: 0x880000, alpha: 0.8 });
        trashCan.stroke({ width: 2, color: 0xff0000 });
        trashCan.position.set(110, 5);
        
        // Show grid highlight
        if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
          const worldPos = gridToWorld(gridX, gridY);
          previewSprite.position.set(worldPos.x, worldPos.y);
          
          highlightGraphic.clear();
          const isOccupied = grid[gridY][gridX] !== null && 
                            (gridX !== draggedSpriteGridPos.x || gridY !== draggedSpriteGridPos.y);
          const color = isOccupied ? 0xff0000 : 0x00ff00;
          highlightGraphic.rect(
            gridX * TILE_SIZE,
            gridY * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE
          );
          highlightGraphic.fill({ color, alpha: 0.3 });
        }
      }
    } else if (isPanning) {
      world.x = e.clientX - panStart.x;
      world.y = e.clientY - panStart.y;
    }
  });

  //Screen to grid coordinate conversion
  function screenToGrid(screenX: number, screenY: number) {
    const local = world.toLocal({ x: screenX, y: screenY });
    const gridX = Math.floor(local.x / TILE_SIZE);
    const gridY = Math.floor(local.y / TILE_SIZE);
    return { gridX, gridY };
  }

  //Grid to world coordinate conversion
  function gridToWorld(gridX: number, gridY: number) {
    return {
      x: gridX * TILE_SIZE + TILE_SIZE / 2,
      y: gridY * TILE_SIZE + TILE_SIZE / 2
    };
  }

  //Ticker
  app.ticker.add((time) => {
    // Smooth zoom
    const prevZoom = zoom;
    zoom += (targetZoom - zoom) * ZOOM_SPEED;

    const centerX = app.screen.width / 2;
    const centerY = app.screen.height / 2;

    world.x = centerX - ((centerX - world.x) * (zoom / prevZoom));
    world.y = centerY - ((centerY - world.y) * (zoom / prevZoom)); 
    world.scale.set(zoom);
    
    // Redraw grid when zoom changes
    if (prevZoom !== zoom) {
      drawGrid();
    }

    //Rotate bunny
    bunny.rotation += 0.1 * time.deltaTime;

    //Update the stars
    starArray.forEach((star) => {
      star.graphics.y += star.speed;
      if (star.graphics.y > app.screen.height) star.graphics.y = 0;

      //Twinkle
      star.graphics.alpha += star.alphaDir;
      if (star.graphics.alpha > 1) star.alphaDir = -star.alphaDir;
      if (star.graphics.alpha < 0.2) star.alphaDir = -star.alphaDir;
    });
  });

  //Window resize
  window.addEventListener("resize", () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    // Keep bunny at same grid position, just recenter view
    world.x = app.screen.width / 2 - bunny.x * zoom;
    world.y = app.screen.height / 2 - bunny.y * zoom;
    // Update toolbar position
    toolbar.position.set(10, app.screen.height - 100);
  });

  // Center the world view on the bunny at startup
  world.x = app.screen.width / 2 - bunny.x * zoom;
  world.y = app.screen.height / 2 - bunny.y * zoom;
})();