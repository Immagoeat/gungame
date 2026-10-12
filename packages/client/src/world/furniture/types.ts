import type { Kit } from './kit';

export interface Params {
  w: number;
  h: number;
  d: number;
  color?: number;
  variant: number;
}

export type Builder = (k: Kit, p: Params) => void;
