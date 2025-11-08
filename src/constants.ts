// Tile and grid settings
export const TILE_SIZE = 16; // Grid tile size for placement and collision

// Zoom settings - grid will be sized for max zoom out
export const MIN_ZOOM = 0.2; // Max zoom out - shows entire grid
export const MAX_ZOOM = 2; // Max zoom in
export const ZOOM_SPEED = 0.1;

// World generation settings
export const NUM_STARS = 200;
export const NUM_ASTEROIDS = 50;

// Sprite sizes (in tiles)
export const BUNNY_TILES = 2;
export const ASTEROID_TILES = 12;
export const PLANET_TILES = 28;

// Collision radii (in tiles)
export const ASTEROID_RADIUS = 6;
export const PLANET_RADIUS = 12;
export const PLANET_DETECTION_DISTANCE = 14;

// Rotation speed ranges
export const ASTEROID_ROTATION_MIN = 0.002;
export const ASTEROID_ROTATION_MAX = 0.01;
export const PLANET_ROTATION_MIN = 0.0003;
export const PLANET_ROTATION_MAX = 0.001;
