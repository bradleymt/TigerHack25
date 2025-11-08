import { Sprite, Texture } from "pixi.js";
import type { GridCell, RotatingObject, Planet } from "./types";
import { placeSprite } from "./grid";
import { canPlaceInRadius, GRID_WIDTH, GRID_HEIGHT } from "./utils";
import {
  ASTEROID_RADIUS,
  PLANET_RADIUS,
  ASTEROID_ROTATION_MIN,
  ASTEROID_ROTATION_MAX,
  PLANET_ROTATION_MIN,
  PLANET_ROTATION_MAX,
  ASTEROID_TILES,
  PLANET_TILES,
  TILE_SIZE
} from "./constants";

// Generate random asteroids across the grid
export function generateAsteroids(
  grid: GridCell[][],
  world: any,
  rotatingObjects: RotatingObject[],
  asteroidTexture: Texture,
  count: number
) {
  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 10; // Prevent infinite loop

  const asteroidScale = (TILE_SIZE * ASTEROID_TILES) / asteroidTexture.width;

  while (placed < count && attempts < maxAttempts) {
    attempts++;

    // Random position in grid
    const x = Math.floor(Math.random() * GRID_WIDTH);
    const y = Math.floor(Math.random() * GRID_HEIGHT);

    // Try to place asteroid (immutable) with random rotation
    if (canPlaceInRadius(grid, x, y, ASTEROID_RADIUS)) {
      const asteroid = new Sprite(asteroidTexture);
      asteroid.anchor.set(0.5);
      asteroid.scale.set(asteroidScale);

      // Random rotation speed for asteroids
      const rotationSpeed = (Math.random() * (ASTEROID_ROTATION_MAX - ASTEROID_ROTATION_MIN) + ASTEROID_ROTATION_MIN) * 
                           (Math.random() < 0.5 ? 1 : -1);

      placeSprite(grid, world, rotatingObjects, x, y, asteroid, "asteroid", ASTEROID_RADIUS, true, rotationSpeed);
      placed++;
    }
  }

  console.log(`Placed ${placed} asteroids (${attempts} attempts)`);
}

// Generate two base planets for players
export function generateBasePlanets(
  grid: GridCell[][],
  world: any,
  rotatingObjects: RotatingObject[],
  planets: Planet[],
  planetTexture: Texture
) {
  const basePlanetScale = (TILE_SIZE * PLANET_TILES) / planetTexture.width;

  // Generate one random rotation speed for BOTH planets (fairness)
  const sharedRotationSpeed = (Math.random() * (PLANET_ROTATION_MAX - PLANET_ROTATION_MIN) + PLANET_ROTATION_MIN) * 
                               (Math.random() < 0.5 ? 1 : -1);

  // Place first planet in left third of grid (immutable) with shared rotation
  let planet1Placed = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const x = Math.floor(Math.random() * (GRID_WIDTH / 3));
    const y = Math.floor(Math.random() * GRID_HEIGHT);

    if (canPlaceInRadius(grid, x, y, PLANET_RADIUS)) {
      const planet1 = new Sprite(planetTexture);
      planet1.anchor.set(0.5);
      planet1.scale.set(basePlanetScale);

      placeSprite(grid, world, rotatingObjects, x, y, planet1, "base_planet_1", PLANET_RADIUS, true, sharedRotationSpeed);
      console.log(`Placed Base Planet 1 at (${x}, ${y}) with rotation speed ${sharedRotationSpeed.toFixed(5)}`);

      // Register planet for orbital tracking
      planets.push({
        centerX: x,
        centerY: y,
        rotationSpeed: sharedRotationSpeed,
        currentRotation: 0
      });

      planet1Placed = true;
      break;
    }
  }

  // Place second planet in right third of grid (immutable) with SAME rotation
  let planet2Placed = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const x = Math.floor((GRID_WIDTH * 2 / 3) + Math.random() * (GRID_WIDTH / 3));
    const y = Math.floor(Math.random() * GRID_HEIGHT);

    if (canPlaceInRadius(grid, x, y, PLANET_RADIUS)) {
      const planet2 = new Sprite(planetTexture);
      planet2.anchor.set(0.5);
      planet2.scale.set(basePlanetScale);

      placeSprite(grid, world, rotatingObjects, x, y, planet2, "base_planet_2", PLANET_RADIUS, true, sharedRotationSpeed);
      console.log(`Placed Base Planet 2 at (${x}, ${y}) with rotation speed ${sharedRotationSpeed.toFixed(5)}`);

      // Register planet for orbital tracking
      planets.push({
        centerX: x,
        centerY: y,
        rotationSpeed: sharedRotationSpeed,
        currentRotation: 0
      });

      planet2Placed = true;
      break;
    }
  }

  if (!planet1Placed || !planet2Placed) {
    console.warn("Failed to place both base planets!");
  }
}
