import { Sprite, Container, Texture } from "pixi.js";

/**
 * Base game sprite interface/wrapper.
 * Subclasses should implement update(delta)
 */
export abstract class GameSprite {
  display: Sprite | Container;

  constructor(display: Sprite | Container) {
    this.display = display;
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
    super(sprite);
  }

  update(delta: number) {
    // Keep previous behavior: rotate the bunny
    (this.display as Sprite).rotation += 0.1 * delta;
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

export type SpriteKind = "bunny" | "generic";

/**
 * Factory to create sprites of different kinds.
 * - "bunny" requires a texture in options.texture
 * - "generic" will create a GenericSprite (texture optional)
 */
export function createSprite(
  kind: SpriteKind,
  options?: { texture?: Texture },
): GameSprite {
  if (kind === "bunny") {
    if (!options || !options.texture) {
      throw new Error('createSprite("bunny") requires options.texture');
    }
    return new BunnySprite(options.texture);
  }

  // default: generic
  return new GenericSprite(options?.texture);
}

/**
 * Grid cell type for a 2D gameplay grid.
 * - gravity: number (default 0) which can represent a local gravity multiplier/constant
 * - sprites: array of GameSprite instances currently occupying the cell
 */
export interface GridCell {
  gravity: number;
  sprites: GameSprite[];
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
      row.push({ gravity: 0, sprites: [] });
    }
    grid.push(row);
  }
  return grid;
}
