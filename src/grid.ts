import { Sprite, Container } from "pixi.js";
import type { GridCell, RotatingObject, Planet } from "./types";
import { getCellsInRadius, canPlaceInRadius, gridToWorld, GRID_WIDTH, GRID_HEIGHT } from "./utils";
import { PLANET_DETECTION_DISTANCE } from "./constants";

// Function to place sprite in grid with radius
export function placeSprite(
  grid: GridCell[][],
  world: Container,
  rotatingObjects: RotatingObject[],
  gridX: number,
  gridY: number,
  sprite: Sprite,
  type: string,
  radius: number = 0,
  immutable: boolean = false,
  rotationSpeed?: number
): boolean {
  // Check if position is valid and all cells in radius are empty
  if (!canPlaceInRadius(grid, gridX, gridY, radius)) {
    console.log("Position out of bounds or cells occupied");
    return false;
  }

  // Create cell data
  const cellData = { type, sprite, radius, centerX: gridX, centerY: gridY, immutable, rotationSpeed };

  // If has rotation, add to rotating objects
  if (rotationSpeed !== undefined) {
    rotatingObjects.push({ sprite, speed: rotationSpeed });
  }

  // Occupy all cells in radius
  const cells = getCellsInRadius(gridX, gridY, radius);
  for (const cell of cells) {
    grid[cell.y][cell.x] = cellData;
  }

  // Position sprite at center
  const worldPos = gridToWorld(gridX, gridY);
  sprite.position.set(worldPos.x, worldPos.y);
  world.addChild(sprite);

  return true;
}

// Function to place building on a planet (with orbital mechanics)
export function placeBuildingOnPlanet(
  grid: GridCell[][],
  world: Container,
  planets: Planet[],
  gridX: number,
  gridY: number,
  sprite: Sprite,
  type: string,
  radius: number = 0
): boolean {
  // Check if position is valid and all cells in radius are empty
  if (!canPlaceInRadius(grid, gridX, gridY, radius)) {
    console.log("Position out of bounds or cells occupied");
    return false;
  }

  // Find if this position is on a planet
  let parentPlanet = null;
  for (const planet of planets) {
    const dx = gridX - planet.centerX;
    const dy = gridY - planet.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Check if within planet's radius
    if (distance <= PLANET_DETECTION_DISTANCE) {
      parentPlanet = planet;
      break;
    }
  }

  // Calculate orbital data if on a planet
  let orbitalAngle, orbitalDistance, parentPlanetData;
  if (parentPlanet) {
    const worldPos = gridToWorld(gridX, gridY);
    const planetWorldPos = gridToWorld(parentPlanet.centerX, parentPlanet.centerY);
    const dx = worldPos.x - planetWorldPos.x;
    const dy = worldPos.y - planetWorldPos.y;

    orbitalAngle = Math.atan2(dy, dx);
    orbitalDistance = Math.sqrt(dx * dx + dy * dy);
    parentPlanetData = {
      centerX: parentPlanet.centerX,
      centerY: parentPlanet.centerY,
      rotationSpeed: parentPlanet.rotationSpeed
    };
  }

  // Create cell data with orbital info
  const cellData = {
    type,
    sprite,
    radius,
    centerX: gridX,
    centerY: gridY,
    immutable: false,
    parentPlanet: parentPlanetData,
    orbitalAngle,
    orbitalDistance
  };

  // Occupy all cells in radius
  const cells = getCellsInRadius(gridX, gridY, radius);
  for (const cell of cells) {
    grid[cell.y][cell.x] = cellData;
  }

  // Position sprite at center
  const worldPos = gridToWorld(gridX, gridY);
  sprite.position.set(worldPos.x, worldPos.y);
  world.addChild(sprite);

  return true;
}

// Function to move sprite from one grid cell to another
export function moveSprite(grid: GridCell[][], fromX: number, fromY: number, toX: number, toY: number): boolean {
  // Validate bounds
  if (
    fromX < 0 ||
    fromX >= GRID_WIDTH ||
    fromY < 0 ||
    fromY >= GRID_HEIGHT ||
    toX < 0 ||
    toX >= GRID_WIDTH ||
    toY < 0 ||
    toY >= GRID_HEIGHT
  ) {
    return false;
  }

  const fromCell = grid[fromY][fromX];
  if (fromCell === null) {
    console.log("No sprite at source position");
    return false;
  }

  const radius = fromCell.radius;
  const sprite = fromCell.sprite;

  // Clear old cells first (so we don't conflict with ourselves)
  const oldCells = getCellsInRadius(fromX, fromY, radius);
  for (const cell of oldCells) {
    if (cell.x >= 0 && cell.x < GRID_WIDTH && cell.y >= 0 && cell.y < GRID_HEIGHT) {
      grid[cell.y][cell.x] = null;
    }
  }

  // Now check if destination is available
  if (!canPlaceInRadius(grid, toX, toY, radius)) {
    console.log("Destination cells occupied or out of bounds");
    // Restore old cells since we can't move
    const cellData = {
      type: fromCell.type,
      sprite: sprite,
      radius: radius,
      centerX: fromX,
      centerY: fromY
    };
    for (const cell of oldCells) {
      if (cell.x >= 0 && cell.x < GRID_WIDTH && cell.y >= 0 && cell.y < GRID_HEIGHT) {
        grid[cell.y][cell.x] = cellData;
      }
    }
    return false;
  }

  // Update cell data with new center
  const cellData = {
    type: fromCell.type,
    sprite: sprite,
    radius: radius,
    centerX: toX,
    centerY: toY
  };

  // Occupy new cells
  const newCells = getCellsInRadius(toX, toY, radius);
  for (const cell of newCells) {
    if (cell.x >= 0 && cell.x < GRID_WIDTH && cell.y >= 0 && cell.y < GRID_HEIGHT) {
      grid[cell.y][cell.x] = cellData;
    }
  }

  const worldPos = gridToWorld(toX, toY);
  sprite.position.set(worldPos.x, worldPos.y);

  return true;
}

// Function to remove sprite from grid
export function removeSprite(grid: GridCell[][], world: Container, gridX: number, gridY: number): boolean {
  if (gridX < 0 || gridX >= GRID_WIDTH || gridY < 0 || gridY >= GRID_HEIGHT) {
    return false;
  }

  const cell = grid[gridY][gridX];
  if (cell === null) {
    return false;
  }

  // Remove sprite from world
  world.removeChild(cell.sprite);

  // Clear all cells in radius
  const cells = getCellsInRadius(cell.centerX, cell.centerY, cell.radius);
  for (const cellPos of cells) {
    grid[cellPos.y][cellPos.x] = null;
  }

  return true;
}
