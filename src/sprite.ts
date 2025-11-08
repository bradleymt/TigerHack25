import { Sprite, Container, Texture, Rectangle } from "pixi.js";

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

export class TurretSprite extends GameSprite {
  constructor(texture: Texture) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    super(sprite, "Turret", "Building", 200, 200, 1, false);
  }

  update(_delta: number) {
    // Turrets don't animate (yet - could rotate to track targets)
    void _delta;
  }
}

export class AsteroidSprite extends GameSprite {
  private rotationSpeed: number;

  constructor(texture: Texture, rotationSpeed: number, scale: number = 1) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    // Scale to ASTEROID_TILES (12 tiles = 192px) then multiply by random scale
    const baseScale = (16 * 12) / texture.width; // TILE_SIZE * ASTEROID_TILES / texture.width
    sprite.scale.set(baseScale * scale);
    // Round radius to ensure it's always an integer
    super(sprite, "Asteroid", "Debris", 500, 500, Math.round(6 * scale), true);
    this.rotationSpeed = rotationSpeed;
  }

  update(delta: number) {
    (this.display as Sprite).rotation += this.rotationSpeed * delta;
  }
}

export class BlackHoleSprite extends GameSprite {
  private rotationSpeed: number;

  constructor(texture: Texture, rotationSpeed: number) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    super(sprite, "Black Hole", "???", 0, 0, 24, true);
    this.rotationSpeed = rotationSpeed;
  }

  update(delta: number) {
    (this.display as Sprite).rotation += this.rotationSpeed * delta;
  }
}

export class PlanetSprite extends GameSprite {
  private rotationSpeed: number;
  private shield: Sprite | null;
  centerX: number;
  centerY: number;
  currentRotation: number;

  constructor(
    texture: Texture,
    name: string,
    rotationSpeed: number,
    centerX: number,
    centerY: number,
    shieldTexture?: Texture,
    initialRotation: number = 0
  ) {
    // Use a container to hold both planet and shield
    const container = new Container();
    const planetSprite = new Sprite(texture);
    planetSprite.anchor.set(0.5);
    planetSprite.rotation = initialRotation; // Set initial rotation
    container.addChild(planetSprite);
    
    let shield: Sprite | null = null;
    
    // Add shield if provided
    if (shieldTexture) {
      shield = new Sprite(shieldTexture);
      shield.anchor.set(0.5);
      shield.alpha = 0.3; // Make it transparent (30% opacity)
      // Scale shield larger to encompass structures between planet and shield
      const shieldScale = (texture.width * 1.4) / shieldTexture.width;
      shield.scale.set(shieldScale);
      shield.rotation = -initialRotation * 0.5; // Set initial shield rotation (opposite direction)
      container.addChild(shield);
    }
    
    super(container, name, "Planet", 1000, 1000, 25, true);
    
    this.shield = shield;
    this.rotationSpeed = rotationSpeed;
    this.centerX = centerX;
    this.centerY = centerY;
    this.currentRotation = initialRotation;
  }

  update(delta: number) {
    // Rotate the planet sprite inside the container
    const container = this.display as Container;
    const planetSprite = container.children[0] as Sprite;
    planetSprite.rotation += this.rotationSpeed * delta;
    this.currentRotation += this.rotationSpeed * delta;
    
    // Optionally rotate shield slowly for effect
    if (this.shield) {
      this.shield.rotation -= this.rotationSpeed * delta * 0.5;
    }
  }
}

export class ExplosionSprite extends GameSprite {
  private currentFrame: number = 0;
  private totalFrames: number;
  private frameWidth: number;
  private frameHeight: number;
  private framesPerRow: number;
  private animationSpeed: number;
  private sprite: Sprite;

  constructor(
    texture: Texture,
    x: number,
    y: number,
    scale: number = 1,
    totalFrames: number = 8,
    frameWidth: number = 64,
    frameHeight: number = 64,
    framesPerRow: number = 8,
    animationSpeed: number = 0.5
  ) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    super(sprite, "Explosion", "Effect", 1, 1, 0, false);
    
    this.sprite = sprite;
    this.totalFrames = totalFrames;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    this.framesPerRow = framesPerRow;
    this.animationSpeed = animationSpeed;
    
    // Set initial frame
    this.updateFrame(0);
    
    sprite.position.set(x, y);
    sprite.scale.set(scale);
    
    this.display = sprite;
  }

  private updateFrame(frameIndex: number) {
    const row = Math.floor(frameIndex / this.framesPerRow);
    const col = frameIndex % this.framesPerRow;
    
    const x = col * this.frameWidth;
    const y = row * this.frameHeight;
    
    // Create a new texture from a region of the sprite sheet
    this.sprite.texture = new Texture({
      source: this.sprite.texture.source,
      frame: new Rectangle(x, y, this.frameWidth, this.frameHeight),
    });
  }

  update(delta: number) {
    this.currentFrame += this.animationSpeed * delta;
    
    const frameIndex = Math.floor(this.currentFrame);
    
    if (frameIndex < this.totalFrames) {
      this.updateFrame(frameIndex);
    } else {
      // Animation finished - make invisible
      this.sprite.alpha = 0;
    }
  }

  isFinished(): boolean {
    return Math.floor(this.currentFrame) >= this.totalFrames;
  }
}

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

export type SpriteKind = "bunny" | "turret" | "asteroid" | "blackhole" | "planet" | "generic";

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
    shieldTexture?: Texture;
    initialRotation?: number;
    scale?: number;
  }
): GameSprite {
  if (kind === "bunny") {
    if (!options || !options.texture) {
      throw new Error('createSprite("bunny") requires options.texture');
    }
    return new BunnySprite(options.texture);
  }

  if (kind === "turret") {
    if (!options || !options.texture) {
      throw new Error('createSprite("turret") requires options.texture');
    }
    return new TurretSprite(options.texture);
  }

  if (kind === "asteroid") {
    if (!options || !options.texture) {
      throw new Error('createSprite("asteroid") requires options.texture');
    }
    return new AsteroidSprite(
      options.texture,
      options.rotationSpeed || 0.005,
      options.scale || 1
    );
  }

  if (kind === "blackhole") {
    if (!options || !options.texture) {
      throw new Error('createSprite("blackhole") requires options.texture');
    }
    return new BlackHoleSprite(
      options.texture,
      options.rotationSpeed || 0.002
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
      options.centerY || 0,
      options.shieldTexture,
      options.initialRotation || 0
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
