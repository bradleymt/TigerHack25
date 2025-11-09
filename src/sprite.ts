import { Sprite, Container, Texture, Rectangle } from "pixi.js";

export const MAX_VELOCITY = 8;

/**
 * Base game sprite interface/wrapper.
 * Subclasses should implement update(delta, ax, ay) for physics
 */
export abstract class GameSprite {
  display: Sprite | Container;
  name: string;
  type: string;
  health: number;
  maxHealth: number;
  radius: number;
  immutable: boolean;
  
  // Physics properties
  vx: number = 0;
  vy: number = 0;

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

  // Called each engine tick with delta time and acceleration from gravity
  abstract update(delta: number, ax?: number, ay?: number): void;

  // Apply physics movement (called by sprites that should move)
  protected applyPhysics(delta: number, ax: number = 0, ay: number = 0) {
    // Apply acceleration from gravity (scaled by delta time)
    this.vx += ax * delta;
    this.vy += ay * delta;

    // Clamp speed to MAX_VELOCITY
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > MAX_VELOCITY) {
      const scale = MAX_VELOCITY / speed;
      this.vx *= scale;
      this.vy *= scale;
    }

    // Move sprite
    this.display.x += this.vx * delta;
    this.display.y += this.vy * delta;
  }

  // Take damage and return true if sprite is destroyed
  takeDamage(amount: number): boolean {
    this.health -= amount;
    return this.health <= 0;
  }

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

  update(delta: number, ax: number = 0, ay: number = 0) {
    // Bunny responds to gravity/physics
    this.applyPhysics(delta, ax, ay);
  }
}

export class TurretSprite extends GameSprite {
  constructor(texture: Texture) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    super(sprite, "Turret", "Building", 200, 200, 1, false);
  }

  update(delta: number, ax: number = 0, ay: number = 0) {
    // Turrets respond to gravity but don't rotate
    this.applyPhysics(delta, ax, ay);
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
    // Scale health based on size: base 500 HP, multiplied by scale (0.5-1.5x = 250-750 HP)
    const scaledHealth = Math.round(500 * scale);
    super(sprite, "Asteroid", "Debris", scaledHealth, scaledHealth, Math.round(6 * scale), true);
    this.rotationSpeed = rotationSpeed;
  }

  update(delta: number, _ax: number = 0, _ay: number = 0) {
    // Asteroids are immutable - only rotate, don't respond to gravity
    (this.display as Sprite).rotation += this.rotationSpeed * delta;
  }
}

export class BlackHoleSprite extends GameSprite {
  private rotationSpeed: number;

  constructor(texture: Texture, rotationSpeed: number) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    super(sprite, "Black Hole", "???", 0, 0, 20, true);
    this.rotationSpeed = rotationSpeed;
  }

  update(delta: number, ax: number = 0, ay: number = 0) {
    // Black holes don't move (immutable) but they rotate
    (this.display as Sprite).rotation += this.rotationSpeed * delta;
    // Note: Black holes don't respond to physics themselves (immutable)
    void ax; void ay; // Suppress unused parameter warnings
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

  update(delta: number, ax: number = 0, ay: number = 0) {
    // Planets don't move (immutable) but they rotate
    void ax; void ay; // Suppress unused parameter warnings
    
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

  update(delta: number, ax: number = 0, ay: number = 0) {
    // Explosions don't respond to physics
    void ax; void ay;
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

  update(delta: number, ax: number = 0, ay: number = 0) {
    // Generic sprites can optionally respond to physics
    void delta; void ax; void ay;
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
 * Extended to support multi-tile sprites with radius and gravity acceleration
 */
export interface GridCell {
  gravity: { ax: number; ay: number }; // Acceleration from gravity wells
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
      row.push({ 
        gravity: { ax: 0, ay: 0 }, 
        sprite: null, 
        occupied: false 
      });
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Apply a gravity field to the grid centered at (gx, gy) with given radius and strength
 * This is used by planets and black holes to create gravitational attraction
 */
export function applyGravityField(
  grid: Grid,
  centerX: number,
  centerY: number,
  radius: number,
  strength: number
): void {
  const gridWidth = grid[0]?.length || 0;
  const gridHeight = grid.length;

  for (let y = centerY - radius; y <= centerY + radius; y++) {
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      // Skip out of bounds
      if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) continue;

      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Skip if outside radius or at center
      if (dist === 0 || dist > radius) continue;

      // Compute falloff (linearly decreasing to 0 at radius)
      const force = strength * (1 - dist / radius);

      // Apply acceleration (normalized vector pointing toward center)
      const ax = (-dx / dist) * force;
      const ay = (-dy / dist) * force;

      grid[y][x].gravity.ax += ax;
      grid[y][x].gravity.ay += ay;
    }
  }
}
