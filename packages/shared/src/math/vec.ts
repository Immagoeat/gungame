/** Minimal 3D vector shape. THREE.Vector3 satisfies it, so shared code never depends on three. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Axis = 'x' | 'y' | 'z';

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
