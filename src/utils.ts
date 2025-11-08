import { TILE_SIZE } from "./constants";
import type { GridCell } from "./types";

export let GRID_WIDTH = 0;
export let GRID_HEIGHT = 0;

export function initializeGridDimensions(screenWidth: number, screenHeight: number, minZoom: number) {
  GRID_WIDTH = Math.ceil((screenWidth / minZoom) / TILE_SIZE);
  GRID_HEIGHT = Math.ceil((screenHeight / minZoom) / TILE_SIZE);
  console.log(`Grid size: ${GRID_WIDTH} x ${GRID_HEIGHT} tiles (${GRID_WIDTH * TILE_SIZE} x ${GRID_HEIGHT * TILE_SIZE} pixels)`);
}

// Convert grid coordinates to world coordinates
export function gridToWorld(gridX: number, gridY: number): { x: number; y: number } {
  return {
    x: gridX * TILE_SIZE + TILE_SIZE / 2,
    y: gridY * TILE_SIZE + TILE_SIZE / 2
  };
}

// Convert screen coordinates to grid coordinates
export function screenToGrid(screenX: number, screenY: number, worldX: number, worldY: number, zoom: number): { gridX: number; gridY: number } {
  const worldPosX = (screenX - worldX) / zoom;
  const worldPosY = (screenY - worldY) / zoom;
  return {
    gridX: Math.floor(worldPosX / TILE_SIZE),
    gridY: Math.floor(worldPosY / TILE_SIZE)
  };
}

// Helper function to get all cells within radius
export function getCellsInRadius(centerX: number, centerY: number, radius: number): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      // Use circular distance check
      if (dx * dx + dy * dy <= radius * radius) {
        cells.push({ x: centerX + dx, y: centerY + dy });
      }
    }
  }
  return cells;
}

// Function to check if all cells in radius are available
export function canPlaceInRadius(grid: GridCell[][], centerX: number, centerY: number, radius: number): boolean {
  const cells = getCellsInRadius(centerX, centerY, radius);
  for (const cell of cells) {
    if (cell.x < 0 || cell.x >= GRID_WIDTH || cell.y < 0 || cell.y >= GRID_HEIGHT) {
      return false;
    }
    if (grid[cell.y][cell.x] !== null) {
      return false;
    }
  }
  return true;
}
