// Tile and grid settings
export const TILE_SIZE = 16; // Grid tile size for placement and collision

// Zoom settings - grid will be sized for max zoom out
export const MIN_ZOOM = 0.2; // Max zoom out - shows entire grid
export const MAX_ZOOM = 2; // Max zoom in
export const ZOOM_SPEED = 0.1;

// World generation settings
export const NUM_STARS = 200;
export const NUM_ASTEROIDS = 50;
export const NUM_BLACK_HOLES = 3;

// Sprite sizes (in tiles)
export const BUNNY_TILES = 2;
export const TURRET_TILES = 3;
export const ASTEROID_TILES = 12;
export const BLACK_HOLE_TILES = 40; // Reduced proportionally
export const PLANET_TILES = 50; // 1.25x black hole size

// Collision radii (in tiles)
export const ASTEROID_RADIUS = 6;
export const BLACK_HOLE_RADIUS = 20; // Reduced proportionally
export const PLANET_RADIUS = 25; // 1.25x black hole radius
export const PLANET_DETECTION_DISTANCE = 25;

// Rotation speed ranges
export const ASTEROID_ROTATION_MIN = 0.002;
export const ASTEROID_ROTATION_MAX = 0.01;
export const PLANET_ROTATION_MIN = 0.0003;
export const PLANET_ROTATION_MAX = 0.001;
