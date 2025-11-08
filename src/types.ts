import { Sprite, Graphics } from "pixi.js";

export type GridCell = null | {
  type: string;
  sprite: Sprite;
  radius: number;
  centerX: number;
  centerY: number;
  immutable?: boolean;
  rotationSpeed?: number;
  // Orbital data for buildings on planets
  parentPlanet?: { centerX: number; centerY: number; rotationSpeed: number };
  orbitalAngle?: number; // Angle from planet center
  orbitalDistance?: number; // Distance from planet center
};

export type Star = {
  graphics: Graphics;
  speed: number;
  alphaDir: number;
};

export type RotatingObject = {
  sprite: Sprite;
  speed: number;
};

export type Planet = {
  centerX: number;
  centerY: number;
  rotationSpeed: number;
  currentRotation: number;
};

export type ObjectType = {
  texture: any;
  type: string;
  radius: number;
};
