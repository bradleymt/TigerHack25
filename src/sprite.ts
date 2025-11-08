import { Sprite, Container, Texture } from "pixi.js";

/**
 * Base game sprite interface/wrapper.
 * Subclasses should implement update(delta)
 */
export abstract class GameSprite {
  display: Sprite | Container;
  name: string;
  type: string;
  health: number;
  maxHealth: number;
  radius: number;
  immutable: boolean;

  constructor(
    display: Sprite | Container,
    name: string = "Unknown",
    type: string = "Unknown",
    health: number = 100,
    maxHealth: number = 100,
    radius: number = 0,
    immutable: boolean = false
  ) {
    this.display = display;
    this.name = name;
    this.type = type;
    this.health = health;
    this.maxHealth = maxHealth;
    this.radius = radius;
    this.immutable = immutable;
  }

  // Called each engine tick with delta time
  abstract update(delta: number): void;

  // Return the underlying display object so the renderer can add it to the stage
  getDisplay(): Sprite | Container {
    return this.display;
  }
}

export class BunnySprite extends GameSprite {
  constructor(texture: Texture) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    super(sprite, "Building", "Building", 100, 100, 0, false);
  }

  update(_delta: number) {
    // Buildings don't animate
    void _delta;
  }
}

export class AsteroidSprite extends GameSprite {
  private rotationSpeed: number;

  constructor(texture: Texture, rotationSpeed: number) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    super(sprite, "Asteroid", "Debris", 500, 500, 6, true);
    this.rotationSpeed = rotationSpeed;
  }

  update(delta: number) {
    (this.display as Sprite).rotation += this.rotationSpeed * delta;
  }
}

export class PlanetSprite extends GameSprite {
  private rotationSpeed: number;
  centerX: number;
  centerY: number;
  currentRotation: number = 0;

  constructor(
    texture: Texture,
    name: string,
    rotationSpeed: number,
    centerX: number,
    centerY: number
  ) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    super(sprite, name, "Planet", 1000, 1000, 15, true);
    this.rotationSpeed = rotationSpeed;
    this.centerX = centerX;
    this.centerY = centerY;
  }

  update(delta: number) {
    (this.display as Sprite).rotation += this.rotationSpeed * delta;
    this.currentRotation += this.rotationSpeed * delta;
  }
}

/**
 * A simple generic sprite wrapper. If a texture is provided it uses a PIXI.Sprite,
 * otherwise it uses a PIXI.Container (useful for grouping or placeholder objects).
 */
export class GenericSprite extends GameSprite {
  constructor(texture?: Texture) {
    const display = texture ? new Sprite(texture) : new Container();
    super(display);
  }

  update(_delta: number) {
    // default no-op update; mark parameter used to satisfy linter
    void _delta;
  }
}

export type SpriteKind = "bunny" | "asteroid" | "planet" | "generic";

/**
 * Factory to create sprites of different kinds.
 */
export function createSprite(
  kind: SpriteKind,
  options?: {
    texture?: Texture;
    rotationSpeed?: number;
    name?: string;
    centerX?: number;
    centerY?: number;
  }
): GameSprite {
  if (kind === "bunny") {
    if (!options || !options.texture) {
      throw new Error('createSprite("bunny") requires options.texture');
    }
    return new BunnySprite(options.texture);
  }

  if (kind === "asteroid") {
    if (!options || !options.texture) {
      throw new Error('createSprite("asteroid") requires options.texture');
    }
    return new AsteroidSprite(
      options.texture,
      options.rotationSpeed || 0.005
    );
  }

  if (kind === "planet") {
    if (!options || !options.texture) {
      throw new Error('createSprite("planet") requires options.texture');
    }
    return new PlanetSprite(
      options.texture,
      options.name || "Planet",
      options.rotationSpeed || 0.0005,
      options.centerX || 0,
      options.centerY || 0
    );
  }

  // default: generic
  return new GenericSprite(options?.texture);
}

/**
 * Grid cell type for a 2D gameplay grid.
 * Extended to support multi-tile sprites with radius
 */
export interface GridCell {
  gravity: number;
  sprite: GameSprite | null; // Single sprite reference (centermost cell)
  // Reference to center cell if this is part of a multi-tile sprite
  centerX?: number;
  centerY?: number;
  occupied: boolean;
}

export type Grid = GridCell[][];

/**
 * Helper to create an empty grid initialized to given width/height.
 */
export function createGrid(width: number, height: number): Grid {
  const grid: Grid = [];
  for (let y = 0; y < height; y++) {
    const row: GridCell[] = [];
    for (let x = 0; x < width; x++) {
      row.push({ gravity: 0, sprite: null, occupied: false });
    }
    grid.push(row);
  }
  return grid;
}
