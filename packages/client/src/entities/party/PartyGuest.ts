import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CharacterLook, GuestActivity } from '@gungame/shared';
import { PARTY_BPM } from '../../audio/PartyMusic';
import { bodyFrame, captureFootRest, dropHips, lookAt, placeHand, sit, type BodyFrame, type FootRest } from '../character/poseKit';
import { bone, boneName, curlFingers, findBones, rotateWorld, scaleToHeight, worldPos, type BoneMap } from '../character/rig';
import { crowdMaterial, crowdPalette, dressSoldier, type CivilianStyle } from '../character/soldierOutfit';

export interface GuestSetup {
  activity: GuestActivity;
  seed: number;
  height: number;
  look: CharacterLook;
  style: CivilianStyle;
  lookAt?: THREE.Vector3;
  /** Seat height above the feet, for sitting. */
  seat?: number;
  /** Dancers with the same crew pick the same moves at the same time (a group dancing together). */
  crew?: number;
  /** What's in their glass: 'flute' | 'wine' | 'tumbler', or none. */
  drink?: 'flute' | 'wine' | 'tumbler';
}

/** Small seeded random numbers, so each guest moves on their own rhythm, the same every time. */
function rng(seed: number): () => number {
  let s = (seed * 2654435761) % 4294967296 || 1;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const ease = (t: number) => t * t * (3 - 2 * t);
const hash = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

// ---------- Dance moves ----------
// Each move is a pose at a moment in the music, in body space (x right, y up, z forward); wrists are
// relative to their shoulder, written for the right arm (x is mirrored for the left).

interface ArmPose { wrist: THREE.Vector3; fist: number; elbowOut: number; elbowUp: number; elbowBack?: boolean; fingers?: THREE.Vector3; point?: boolean }
interface DancePose {
  hipSide: number; hipTwist: number; drop: number; lift: number; lean: number;
  stepL: THREE.Vector3; stepR: THREE.Vector3;
  spineTwist: number; spineSide: number; nod: number; headTurn: number; spin: number;
  armL: ArmPose; armR: ArmPose;
}
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Z = () => V3(0, 0, 0);
const loose = (swing: number): ArmPose => ({ wrist: V3(0.1, -0.42, 0.1 + 0.08 * swing), fist: 0.45, elbowOut: 0.6, elbowUp: 0, elbowBack: true });
const onHip = (): ArmPose => ({ wrist: V3(0.02, -0.4, -0.05), fist: 0.2, elbowOut: 1.4, elbowUp: 0.6, fingers: V3(-0.3, -1, 0.4) });
const base = (beat: number, e: number): DancePose => {
  const ph = beat * Math.PI * 2;
  const bounce = 0.5 + 0.5 * Math.cos(ph);
  return {
    hipSide: Math.sin(ph / 2) * 0.04 * e, hipTwist: Math.sin(ph / 2) * 0.08 * e, drop: 0.03 + 0.04 * bounce * e, lift: 0, lean: 0.05,
    stepL: Z(), stepR: Z(), spineTwist: -Math.sin(ph / 2) * 0.1 * e, spineSide: 0, nod: 0.08 * bounce * e, headTurn: 0, spin: 0,
    armL: loose(Math.sin(ph / 2)), armR: loose(-Math.sin(ph / 2)),
  };
};

const DANCE_MOVES = {
  /** Side-to-side two-step: step out and tap together, arms swinging loosely. */
  twoStep(beat: number, e: number): DancePose {
    const p = base(beat, e);
    const ph = beat * Math.PI * 2;
    const side = Math.sin(ph / 2);
    p.hipSide = side * 0.07 * e;
    // The trailing foot lifts and taps beside the other on each beat.
    const tapL = Math.max(0, -side) * Math.max(0, Math.sin(ph));
    const tapR = Math.max(0, side) * Math.max(0, Math.sin(ph));
    p.stepL = V3(-0.05 * side, 0.06 * tapR, 0);
    p.stepR = V3(-0.05 * side, 0.06 * tapL, 0);
    p.armL = { wrist: V3(0.12, -0.3, 0.2 + 0.1 * side), fist: 0.7, elbowOut: 0.7, elbowUp: 0.1 };
    p.armR = { wrist: V3(0.12, -0.3, 0.2 - 0.1 * side), fist: 0.7, elbowOut: 0.7, elbowUp: 0.1 };
    return p;
  },
  /** Both hands up, swaying over the head. */
  handsUp(beat: number, e: number): DancePose {
    const p = base(beat, e);
    const ph = beat * Math.PI * 2;
    p.armL = { wrist: V3(0.14 + 0.1 * Math.sin(ph / 2), 0.5 + 0.05 * Math.cos(ph), 0.08), fist: 0.25, elbowOut: 1, elbowUp: 0.7 };
    p.armR = { wrist: V3(0.14 - 0.1 * Math.sin(ph / 2), 0.5 + 0.05 * Math.cos(ph), 0.08), fist: 0.25, elbowOut: 1, elbowUp: 0.7 };
    p.nod = -0.12;
    return p;
  },
  /** Club: elbows bent, fists pumping alternately at chest height. */
  clubPump(beat: number, e: number): DancePose {
    const p = base(beat, e);
    const ph = beat * Math.PI * 2;
    p.armL = { wrist: V3(0.06, -0.1 + 0.09 * Math.sin(ph + Math.PI), 0.28), fist: 0.95, elbowOut: 1, elbowUp: 0 };
    p.armR = { wrist: V3(0.06, -0.1 + 0.09 * Math.sin(ph), 0.28), fist: 0.95, elbowOut: 1, elbowUp: 0 };
    p.drop += 0.02 * e;
    return p;
  },
  /** Fist pump on every beat, other hand loose. */
  fistPump(beat: number, e: number): DancePose {
    const p = base(beat, e);
    const ph = beat * Math.PI * 2;
    const hit = Math.pow(0.5 + 0.5 * Math.cos(ph), 2);
    p.armR = { wrist: V3(0.04, 0.3 + 0.18 * hit, 0.2), fist: 1, elbowOut: 1, elbowUp: 0.6 };
    p.lean = -0.05;
    p.nod = 0.15 * hit;
    return p;
  },
  /** Shoulder shimmy: quick alternating shoulders, elbows tight, small bounce. */
  shimmy(beat: number, e: number): DancePose {
    const p = base(beat, e);
    const ph = beat * Math.PI * 2;
    p.spineSide = Math.sin(ph * 2) * 0.08 * e;
    p.spineTwist = Math.sin(ph * 2) * 0.12 * e;
    p.drop = 0.06 + 0.02 * Math.cos(ph * 2);
    p.armL = { wrist: V3(0.14, -0.28, 0.22), fist: 0.6, elbowOut: 0.4, elbowUp: 0 };
    p.armR = { wrist: V3(0.14, -0.28, 0.22), fist: 0.6, elbowOut: 0.4, elbowUp: 0 };
    p.lean = 0.12;
    return p;
  },
  /** Arms out to the sides, a wave rolling through them. */
  wave(beat: number, e: number): DancePose {
    const p = base(beat, e);
    const ph = beat * Math.PI * 2;
    p.armL = { wrist: V3(0.5, 0.06 + 0.12 * Math.sin(ph / 2), 0.05), fist: 0.15, elbowOut: 1, elbowUp: 0.8, fingers: V3(1, 0.2 * Math.cos(ph / 2), 0) };
    p.armR = { wrist: V3(0.5, 0.06 + 0.12 * Math.sin(ph / 2 + 1.6), 0.05), fist: 0.15, elbowOut: 1, elbowUp: 0.8, fingers: V3(1, 0.2 * Math.cos(ph / 2 + 1.6), 0) };
    p.spineSide = Math.sin(ph / 2 + 0.8) * 0.06;
    return p;
  },
  /** Pointing at the sky on the beat, alternating hands every bar. */
  point(beat: number, e: number): DancePose {
    const p = base(beat, e);
    const ph = beat * Math.PI * 2;
    const right = Math.floor(beat / 4) % 2 === 0;
    const hit = Math.pow(0.5 + 0.5 * Math.cos(ph), 3);
    const up: ArmPose = { wrist: V3(0.12, 0.42 + 0.08 * hit, 0.2), fist: 0.95, elbowOut: 0.8, elbowUp: 0.7, point: true, fingers: V3(0.1, 1, 0.3) };
    if (right) { p.armR = up; p.armL = onHip(); } else { p.armL = up; p.armR = onHip(); }
    return p;
  },
  /** Hands on hips, big hip sway, head nodding. */
  hips(beat: number, e: number): DancePose {
    const p = base(beat, e);
    const ph = beat * Math.PI * 2;
    p.hipSide = Math.sin(ph / 2) * 0.1 * e;
    p.hipTwist = Math.sin(ph / 2) * 0.16 * e;
    p.armL = onHip();
    p.armR = onHip();
    p.nod = 0.14 * (0.5 + 0.5 * Math.cos(ph));
    return p;
  },
  /** Jumping on the beat with the crowd, both hands punching up. */
  jump(beat: number, e: number): DancePose {
    const p = base(beat, e);
    const ph = beat * Math.PI * 2;
    const air = Math.pow(Math.max(0, Math.sin(ph)), 1.5);
    p.lift = 0.12 * air * e;
    p.drop = 0.05 * (1 - air);
    p.armL = { wrist: V3(0.1, 0.38 + 0.1 * air, 0.12), fist: 0.95, elbowOut: 0.8, elbowUp: 0.7 };
    p.armR = { wrist: V3(0.1, 0.38 + 0.1 * air, 0.12), fist: 0.95, elbowOut: 0.8, elbowUp: 0.7 };
    return p;
  },
  /** Slow half-time sway with a turn every couple of bars. */
  sway(beat: number, e: number): DancePose {
    const p = base(beat / 2, e * 0.8);
    const bar = beat / 4;
    const turn = bar % 4;
    // A spin over the last bar of every four.
    p.spin = turn > 3 ? ease(turn - 3) * Math.PI * 2 : 0;
    p.armL = { wrist: V3(0.2, -0.18, 0.18), fist: 0.3, elbowOut: 0.9, elbowUp: 0.2 };
    p.armR = { wrist: V3(0.24, 0.05 + 0.05 * Math.sin(beat), 0.12), fist: 0.3, elbowOut: 1, elbowUp: 0.5 };
    return p;
  },
} satisfies Record<string, (beat: number, e: number) => DancePose>;
type MoveName = keyof typeof DANCE_MOVES;
const MOVE_NAMES = Object.keys(DANCE_MOVES) as MoveName[];

function lerpArm(a: ArmPose, b: ArmPose, k: number): ArmPose {
  return {
    wrist: a.wrist.clone().lerp(b.wrist, k), fist: a.fist + (b.fist - a.fist) * k,
    elbowOut: a.elbowOut + (b.elbowOut - a.elbowOut) * k, elbowUp: a.elbowUp + (b.elbowUp - a.elbowUp) * k,
    elbowBack: k < 0.5 ? a.elbowBack : b.elbowBack, point: k < 0.5 ? a.point : b.point,
    fingers: a.fingers && b.fingers ? a.fingers.clone().lerp(b.fingers, k) : k < 0.5 ? a.fingers : b.fingers,
  };
}

function blendPose(a: DancePose, b: DancePose, k: number): DancePose {
  if (k >= 1) return b;
  const n = (x: number, y: number) => x + (y - x) * k;
  return {
    hipSide: n(a.hipSide, b.hipSide), hipTwist: n(a.hipTwist, b.hipTwist), drop: n(a.drop, b.drop), lift: n(a.lift, b.lift), lean: n(a.lean, b.lean),
    stepL: a.stepL.clone().lerp(b.stepL, k), stepR: a.stepR.clone().lerp(b.stepR, k),
    spineTwist: n(a.spineTwist, b.spineTwist), spineSide: n(a.spineSide, b.spineSide), nod: n(a.nod, b.nod), headTurn: n(a.headTurn, b.headTurn),
    // Never blend a spin: finish it, then change.
    spin: a.spin > 0 && a.spin < Math.PI * 2 ? a.spin : b.spin,
    armL: lerpArm(a.armL, b.armL, k), armR: lerpArm(a.armR, b.armR, k),
  };
}

const glassMats = {
  glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.35, envMapIntensity: 1.2 }),
  champagne: new THREE.MeshStandardMaterial({ color: 0xf0cf6a, roughness: 0.2, transparent: true, opacity: 0.85 }),
  wine: new THREE.MeshStandardMaterial({ color: 0x5a0a1a, roughness: 0.2 }),
  cocktail: new THREE.MeshStandardMaterial({ color: 0x2bb8d8, roughness: 0.2, emissive: 0x0a3a44, emissiveIntensity: 0.4 }),
};

/** A glass with something in it, standing on +y from its base. */
function glassMesh(kind: 'flute' | 'wine' | 'tumbler'): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = false;
    g.add(m);
  };
  if (kind === 'flute') {
    add(new THREE.LatheGeometry([[0.028, 0], [0.003, 0.008], [0.003, 0.09], [0.018, 0.1], [0.022, 0.2]].map(([x, y]) => new THREE.Vector2(x, y)), 14), glassMats.glass, 0);
    add(new THREE.CylinderGeometry(0.02, 0.016, 0.08, 12), glassMats.champagne, 0.14);
  } else if (kind === 'wine') {
    add(new THREE.LatheGeometry([[0.032, 0], [0.003, 0.008], [0.003, 0.07], [0.035, 0.1], [0.04, 0.14], [0.034, 0.18]].map(([x, y]) => new THREE.Vector2(x, y)), 16), glassMats.glass, 0);
    add(new THREE.SphereGeometry(0.034, 14, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), glassMats.wine, 0.115);
  } else {
    add(new THREE.CylinderGeometry(0.036, 0.032, 0.1, 16, 1, true), glassMats.glass, 0.05);
    add(new THREE.CylinderGeometry(0.032, 0.03, 0.07, 14), glassMats.cocktail, 0.037);
  }
  return g;
}

/**
 * A party guest: the character model dressed for a party (see CivilianStyle), animated from its idle
 * clip with procedural behaviour on top, in time with the music (PARTY_BPM):
 * - dance: bouncing on the beat with the knees, swaying hips and shoulders, nodding, one of several
 *   arm styles (hands up, club elbows, fist pump, drink in hand)
 * - chat / drink: facing someone, drink in hand, sipping now and then, talking with the other hand
 *   in turns, nodding and the occasional laugh
 * - dj: hands on the decks, riding the mixer, a hand in the air on the drops
 * - bartender: shaking cocktails, wiping down the counter in between
 * - sit: sitting on a seat's edge, leaning in to chat
 */
export class PartyGuest {
  readonly group = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly bones: BoneMap;
  private readonly rest: { bone: THREE.Object3D; q: THREE.Quaternion; p: THREE.Vector3 }[] = [];
  private readonly mixer: THREE.AnimationMixer;
  private readonly feet: FootRest;
  private readonly legRest: { bone: THREE.Object3D; q: THREE.Quaternion; p: THREE.Vector3 }[];
  private readonly r: () => number;
  /** Per-guest variety. */
  private readonly style: number;
  private readonly crew: number;
  private readonly moves: MoveName[];
  private baseYaw: number | null = null;
  private panicked = false;
  private readonly offset: number;
  private readonly energy: number;
  private readonly talkPeriod: number;
  private readonly sipEvery: number;
  private readonly hasDrink: boolean;

  constructor(gltf: GLTF, private readonly s: GuestSetup) {
    this.r = rng(s.seed);
    this.model = cloneSkinned(gltf.scene);
    this.bones = findBones(this.model);
    this.group.add(this.model);
    scaleToHeight(this.model, this.bones, s.height);
    dressSoldier(this.model, s.look, s.style);
    const material = crowdMaterial(crowdPalette(s.look, s.style));
    this.model.traverse(o => { if (o instanceof THREE.SkinnedMesh) o.material = material; });
    for (const b of this.bones.values()) if (b instanceof THREE.Bone) this.rest.push({ bone: b, q: b.quaternion.clone(), p: b.position.clone() });
    this.feet = captureFootRest(this.bones, this.model);
    this.legRest = this.rest.filter(r => /^(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase))$/.test(boneName(r.bone.name)));
    this.model.traverse(o => {
      if (o instanceof THREE.SkinnedMesh) {
        // No shadow casting: at night the moon's shadows are faint, and a crowd of skinned shadow
        // casters is expensive.
        o.castShadow = false;
        o.receiveShadow = true;
        // Cull off-screen guests with a sphere that covers any pose (arms up, sitting), in the
        // model's own (scaled) units.
        const unit = 1 / this.model.scale.x;
        o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95 * unit, 0), 1.5 * unit);
        o.frustumCulled = true;
      }
    });

    this.mixer = new THREE.AnimationMixer(this.model);
    const idle = this.mixer.clipAction(gltf.animations.find(a => a.name.toLowerCase() === 'idle') ?? gltf.animations[0]);
    idle.play();
    idle.time = this.r() * idle.getClip().duration;
    idle.timeScale = 0.85 + this.r() * 0.3;

    this.style = Math.floor(this.r() * 4);
    // Favourite moves: a crew (s.crew) shares one set so they dance together.
    this.crew = s.crew ?? s.seed;
    const order = [...MOVE_NAMES].sort((x, y) => hash(this.crew * 13 + MOVE_NAMES.indexOf(x)) - hash(this.crew * 13 + MOVE_NAMES.indexOf(y)));
    this.moves = order.slice(0, 3 + (this.crew % 2));
    this.offset = (this.r() - 0.5) * 0.08;
    this.energy = 0.7 + this.r() * 0.5;
    this.talkPeriod = 3 + this.r() * 3;
    this.sipEvery = 7 + this.r() * 8;
    this.hasDrink = !!s.drink && (s.activity !== 'dance' || this.style >= 2);
    if (this.hasDrink) this.attachGlass(s.drink!);
  }

  /** A glass in the right hand, held upright when the hand is posed thumb-up. */
  private attachGlass(kind: 'flute' | 'wine' | 'tumbler'): void {
    this.model.updateMatrixWorld(true);
    const hand = bone(this.bones, 'RightHand');
    const knuckle = worldPos(bone(this.bones, 'RightHandMiddle1'));
    const wrist = worldPos(hand);
    const index = worldPos(bone(this.bones, 'RightHandIndex1'));
    const pinky = worldPos(bone(this.bones, 'RightHandPinky1'));
    const thumb = worldPos(bone(this.bones, 'RightHandThumb2'));
    const fingers = knuckle.clone().sub(wrist).normalize();
    const up = index.clone().sub(pinky).normalize(); // pinky to index: up when the thumb is up
    const palmSide = thumb.clone().sub(wrist).addScaledVector(fingers, -thumb.clone().sub(wrist).dot(fingers)).addScaledVector(up, -thumb.clone().sub(wrist).dot(up)).normalize();
    // In the curled fingers, just in front of the palm, base a little below the hand.
    const centre = wrist.clone().lerp(knuckle, 0.75).addScaledVector(palmSide, 0.035).addScaledVector(up, -0.06);
    const glass = glassMesh(kind);
    const world = new THREE.Matrix4().compose(centre, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up), new THREE.Vector3(1, 1, 1));
    const local = hand.matrixWorld.clone().invert().multiply(world);
    // (The inverse bone matrix also undoes the model's scale, so the glass comes out real size.)
    local.decompose(glass.position, glass.quaternion, glass.scale);
    hand.add(glass);
  }

  update(dt: number, t: number): void {
    for (const r of this.rest) { r.bone.quaternion.copy(r.q); r.bone.position.copy(r.p); }
    this.mixer.update(dt);
    // The idle clip is a soldier's ready stance (knees bent, feet wide); guests keep only its upper
    // body (breathing, shifting shoulders) and stand on relaxed straight legs.
    for (const r of this.legRest) { r.bone.quaternion.copy(r.q); r.bone.position.copy(r.p); }
    this.group.updateMatrixWorld(true);
    const f = bodyFrame(this.group);
    const beat = (t + this.offset) * PARTY_BPM / 60;
    if (this.panicked) return this.cower(f, t);
    switch (this.s.activity) {
      case 'dance': this.dance(f, beat); break;
      case 'chat': case 'drink': this.chat(f, t, beat); break;
      case 'groove': this.chat(f, t, beat, true); break;
      case 'dj': this.dj(f, t, beat); break;
      case 'bartender': this.bartender(f, t); break;
      case 'sit': this.sitChat(f, t); break;
    }
  }

  /** Gunfire: drop low, hands over the head, glancing around. */
  panic(): void {
    this.panicked = true;
  }

  private cower(f: BodyFrame, t: number): void {
    const b = (n: string) => bone(this.bones, n);
    if (this.s.activity === 'sit') {
      sit(this.bones, f, this.feet, { seat: f.origin.y + (this.s.seat ?? 0.45), floor: f.origin.y, lean: 0.7, reach: 0.35 });
    } else {
      dropHips(this.bones, f, 0.55, 0.3, this.feet);
      rotateWorld(b('Spine'), f.right, -0.5);
      rotateWorld(b('Spine1'), f.right, -0.3);
    }
    rotateWorld(b('Head'), f.up, Math.sin(t * 1.7 + this.s.seed) * 0.5);
    const head = worldPos(b('Head'));
    for (const sd of ['Left', 'Right'] as const) {
      const sx = sd === 'Right' ? 1 : -1;
      const wrist = head.clone().add(new THREE.Vector3(0, 0.16, 0)).addScaledVector(f.right, sx * 0.08).addScaledVector(f.forward, 0.02);
      placeHand(this.bones, sd, wrist, f.right.clone().multiplyScalar(sx).add(new THREE.Vector3(0, 0, 0.6)), f.right.clone().multiplyScalar(-sx), new THREE.Vector3(0, -1, 0));
    }
  }

  // ---------- Activities ----------

  private dance(f: BodyFrame, beat: number): void {
    const b = (n: string) => bone(this.bones, n);
    // Which move: each dancer has a few favourites and changes at the start of every 8-bar phrase
    // (dancers in the same crew pick together), blending over half a bar.
    const phraseLen = 32;
    const phrase = Math.floor(beat / phraseLen);
    const into = beat - phrase * phraseLen;
    const pickFor = (n: number) => this.moves[Math.floor(hash(n * 31 + this.crew * 7) * this.moves.length)];
    const now = pickFor(phrase);
    const before = pickFor(phrase - 1);
    const mix = ease(Math.min(1, into / 2));
    const pose = blendPose(DANCE_MOVES[before](beat, this.energy), DANCE_MOVES[now](beat, this.energy), mix);

    // Spins turn the whole body.
    if (this.baseYaw === null) this.baseYaw = this.group.rotation.y;
    this.group.rotation.y = this.baseYaw + pose.spin;
    this.group.updateMatrixWorld(true);
    f = bodyFrame(this.group);
    const toWorld = (v: THREE.Vector3) => f.right.clone().multiplyScalar(v.x).addScaledVector(f.up, v.y).addScaledVector(f.forward, v.z);

    const hips = b('Hips');
    hips.position.copy(hips.parent!.worldToLocal(worldPos(hips).addScaledVector(f.right, pose.hipSide)));
    rotateWorld(hips, f.up, pose.hipTwist);
    rotateWorld(hips, f.forward, -pose.hipSide * 1.2);
    hips.updateMatrixWorld(true);
    dropHips(this.bones, f, pose.drop - pose.lift, 0.55, this.feet, {
      Left: toWorld(pose.stepL).add(new THREE.Vector3(0, pose.lift, 0)),
      Right: toWorld(pose.stepR).add(new THREE.Vector3(0, pose.lift, 0)),
    });
    rotateWorld(b('Spine1'), f.up, pose.spineTwist);
    rotateWorld(b('Spine1'), f.forward, pose.spineSide);
    rotateWorld(b('Spine1'), f.right, -pose.lean);
    if (this.s.lookAt) lookAt(this.bones, f, this.s.lookAt, 0.7);
    rotateWorld(b('Neck'), f.right, -pose.nod);
    rotateWorld(b('Head'), f.up, pose.headTurn + Math.sin(beat * Math.PI / 4 + this.s.seed) * 0.12);

    for (const sd of ['Left', 'Right'] as const) {
      const sx = sd === 'Right' ? 1 : -1;
      const sh = worldPos(b(`${sd}Arm`));
      if (this.hasDrink && sd === 'Right') {
        // Glass held up and out of the way, swaying with the body.
        const wrist = sh.clone().addScaledVector(f.forward, 0.24).addScaledVector(f.up, -0.22 + 0.03 * Math.cos(beat * Math.PI * 2)).addScaledVector(f.right, -0.02);
        placeHand(this.bones, sd, wrist, f.right.clone().add(new THREE.Vector3(0, -1, 0)), f.forward.clone().addScaledVector(f.right, -0.6), new THREE.Vector3(0, -1, 0));
        curlFingers(this.bones, sd, { Index: 1.2, Middle: 1.25, Ring: 1.3, Pinky: 1.3, Thumb: 0.5 });
        continue;
      }
      const arm = sd === 'Left' ? pose.armL : pose.armR;
      const local = arm.wrist.clone();
      local.x *= sx;
      const wrist = sh.clone().add(toWorld(local));
      const pole = toWorld(new THREE.Vector3(sx * arm.elbowOut, -1 + arm.elbowUp, arm.elbowBack ? -0.6 : 0.2));
      const fingers = arm.fingers ? toWorld(new THREE.Vector3(arm.fingers.x * sx, arm.fingers.y, arm.fingers.z)) : wrist.clone().sub(sh).normalize().addScaledVector(f.up, 0.3);
      placeHand(this.bones, sd, wrist, pole, fingers, f.right.clone().multiplyScalar(-sx));
      const c = arm.fist;
      curlFingers(this.bones, sd, { Index: arm.point ? 0.05 : c, Middle: c * 1.05, Ring: c * 1.1, Pinky: c * 1.1, Thumb: c * 0.5 });
    }
  }

  private chat(f: BodyFrame, t: number, beat: number, groove = false): void {
    const b = (n: string) => bone(this.bones, n);
    // Weight shifting and a gentle sway to the music; by the dance floor, properly moving to it.
    const ph = beat * Math.PI * 2;
    rotateWorld(b('Hips'), f.up, Math.sin(ph / 4 + this.s.seed) * (groove ? 0.1 : 0.05));
    if (groove) {
      const hips = b('Hips');
      hips.position.copy(hips.parent!.worldToLocal(worldPos(hips).addScaledVector(f.right, Math.sin(ph / 2) * 0.03)));
      hips.updateMatrixWorld(true);
      rotateWorld(b('Neck'), f.right, -0.07 * (0.5 + 0.5 * Math.cos(ph)));
    }
    dropHips(this.bones, f, groove ? 0.02 + 0.03 * (0.5 + 0.5 * Math.cos(ph)) : 0.005 + 0.008 * Math.sin(ph), 0.75, this.feet);
    const talking = Math.floor((t + this.s.seed * 1.7) / this.talkPeriod) % 2 === this.s.seed % 2;
    const laugh = Math.max(0, Math.sin((t + this.s.seed * 3.1) * 0.37)) > 0.985;
    if (this.s.lookAt) lookAt(this.bones, f, this.s.lookAt, 0.9);
    rotateWorld(b('Neck'), f.right, talking ? Math.sin(t * 2.3) * 0.04 : -Math.max(0, Math.sin(t * 1.6)) * 0.08);
    if (laugh) {
      rotateWorld(b('Head'), f.right, 0.25);
      rotateWorld(b('Spine2'), f.right, Math.sin(t * 22) * 0.02);
    }
    // Drink hand: at the chest, raised to the lips now and then.
    if (this.hasDrink) {
      const sh = worldPos(b('RightArm'));
      const cycle = ((t + this.s.seed * 2.3) % this.sipEvery) / 1.6;
      const sip = cycle < 1 ? Math.sin(cycle * Math.PI) : 0;
      const atChest = sh.clone().addScaledVector(f.forward, 0.2).addScaledVector(f.up, -0.3).addScaledVector(f.right, -0.03);
      const atMouth = worldPos(b('Head')).addScaledVector(f.forward, 0.12).addScaledVector(f.up, 0.0).addScaledVector(f.right, 0.03);
      const wrist = atChest.lerp(atMouth, ease(sip));
      placeHand(this.bones, 'Right', wrist, f.right.clone().add(new THREE.Vector3(0, -1, 0)),
        f.forward.clone().addScaledVector(f.right, -0.7), new THREE.Vector3(0, -1, 0).addScaledVector(f.forward, sip * 0.6));
      curlFingers(this.bones, 'Right', { Index: 1.2, Middle: 1.25, Ring: 1.3, Pinky: 1.3, Thumb: 0.5 });
      if (sip > 0.6) rotateWorld(b('Head'), f.right, 0.2 * sip);
    }
    // Free hand talks.
    if (talking) {
      const sh = worldPos(b('LeftArm'));
      const w = t * (2.1 + this.r() * 0.01);
      const wrist = sh.clone().addScaledVector(f.forward, 0.3 + 0.04 * Math.sin(w * 1.3)).addScaledVector(f.up, -0.3 + 0.07 * Math.sin(w)).addScaledVector(f.right, -0.06 + 0.06 * Math.cos(w * 0.8));
      placeHand(this.bones, 'Left', wrist, f.right.clone().multiplyScalar(-1).add(new THREE.Vector3(0, -1, 0)), f.forward.clone().addScaledVector(f.right, 0.4), f.right.clone());
      curlFingers(this.bones, 'Left', { Index: 0.25, Middle: 0.3, Ring: 0.4, Pinky: 0.45, Thumb: 0.15 });
    }
  }

  private dj(f: BodyFrame, t: number, beat: number): void {
    const b = (n: string) => bone(this.bones, n);
    const ph = beat * Math.PI * 2;
    dropHips(this.bones, f, 0.04 + 0.04 * (0.5 + 0.5 * Math.cos(ph)), 0.6, this.feet);
    rotateWorld(b('Spine1'), f.right, -0.22);
    rotateWorld(b('Neck'), f.right, -0.18 * (0.5 + 0.5 * Math.cos(ph)) - 0.1);
    // Decks are in front, at waist height, either side of the mixer.
    const deck = (sx: number) => f.origin.clone().addScaledVector(f.forward, 0.55).addScaledVector(f.right, sx).setY(f.origin.y + 1.24);
    const bar = Math.floor(beat / 4);
    const handUp = bar % 8 === 7; // a hand in the air going into each new phrase
    const riding = Math.sin(t * 1.3) > 0;
    for (const sd of ['Left', 'Right'] as const) {
      const sx = sd === 'Right' ? 1 : -1;
      let wrist: THREE.Vector3;
      if (handUp && sd === 'Right') {
        wrist = worldPos(b('RightArm')).addScaledVector(f.up, 0.45 + 0.05 * Math.cos(ph)).addScaledVector(f.forward, 0.1);
      } else {
        const onMixer = (sd === 'Right') === riding;
        const target = onMixer ? deck(sx * 0.08).addScaledVector(f.right, Math.sin(t * 3 + sx) * 0.04) : deck(sx * 0.46);
        // Scratching: the deck hand moves back and forth.
        if (!onMixer) target.addScaledVector(f.forward, Math.sin(t * 7) * 0.03);
        wrist = target.addScaledVector(f.forward, -0.08).add(new THREE.Vector3(0, 0.03, 0));
      }
      placeHand(this.bones, sd, wrist, f.right.clone().multiplyScalar(sx).add(new THREE.Vector3(0, -1, 0)), f.forward.clone().add(new THREE.Vector3(0, -0.3, 0)), f.right.clone().multiplyScalar(-sx));
      curlFingers(this.bones, sd, { Index: 0.4, Middle: 0.45, Ring: 0.5, Pinky: 0.5, Thumb: 0.2 });
    }
  }

  private bartender(f: BodyFrame, t: number): void {
    const b = (n: string) => bone(this.bones, n);
    const cycle = (t + this.s.seed) % 9;
    const shaking = cycle < 3;
    dropHips(this.bones, f, 0.01, 0.7, this.feet);
    if (this.s.lookAt) lookAt(this.bones, f, this.s.lookAt, 0.4);
    if (shaking) {
      // Both hands round a shaker over the shoulder, shaking hard.
      const shake = Math.sin(t * 18) * 0.06;
      const at = worldPos(b('RightArm')).addScaledVector(f.forward, 0.22).addScaledVector(f.up, 0.02 + shake).addScaledVector(f.right, -0.12);
      placeHand(this.bones, 'Right', at, f.right.clone().add(new THREE.Vector3(0, -1, 0)), f.up.clone(), f.right.clone().multiplyScalar(-1));
      placeHand(this.bones, 'Left', at.clone().addScaledVector(f.up, 0.12).addScaledVector(f.right, -0.02),
        f.right.clone().multiplyScalar(-1).add(new THREE.Vector3(0, -1, 0)), f.up.clone().multiplyScalar(-1), f.right.clone());
      for (const sd of ['Left', 'Right'] as const) curlFingers(this.bones, sd, { Index: 1, Middle: 1.05, Ring: 1.1, Pinky: 1.1, Thumb: 0.6 });
      rotateWorld(b('Spine2'), f.up, Math.sin(t * 18) * 0.03);
    } else {
      // Wiping down the counter in circles.
      rotateWorld(b('Spine1'), f.right, -0.2);
      const w = t * 2.4;
      const at = f.origin.clone().addScaledVector(f.forward, 0.5 + 0.06 * Math.sin(w)).addScaledVector(f.right, 0.12 + 0.12 * Math.cos(w)).setY(f.origin.y + 1.14);
      placeHand(this.bones, 'Right', at, f.right.clone().add(new THREE.Vector3(0, -1, 0)), f.forward.clone(), f.right.clone().multiplyScalar(-1).add(new THREE.Vector3(0, -2, 0)));
    }
  }

  private sitChat(f: BodyFrame, t: number): void {
    const b = (n: string) => bone(this.bones, n);
    sit(this.bones, f, this.feet, { seat: f.origin.y + (this.s.seat ?? 0.45), floor: f.origin.y, lean: 0.18, reach: 0.4, spread: 0.08 });
    if (this.s.lookAt) lookAt(this.bones, f, this.s.lookAt, 1);
    // Lean back on one hand; the other holds a drink on the knee, sipping now and then.
    const sh = worldPos(b('LeftArm'));
    placeHand(this.bones, 'Left', sh.clone().addScaledVector(f.forward, -0.22).addScaledVector(f.right, -0.12).setY(f.origin.y + (this.s.seat ?? 0.45) + 0.06),
      f.right.clone().multiplyScalar(-1).addScaledVector(f.forward, -1), f.forward.clone().multiplyScalar(-1), f.right.clone().multiplyScalar(-1));
    if (this.hasDrink) {
      const cycle = ((t + this.s.seed * 2.3) % this.sipEvery) / 1.6;
      const sip = cycle < 1 ? Math.sin(cycle * Math.PI) : 0;
      const knee = worldPos(b('RightLeg'));
      const onKnee = knee.clone().add(new THREE.Vector3(0, 0.1, 0)).addScaledVector(f.forward, -0.06);
      const atMouth = worldPos(b('Head')).addScaledVector(f.forward, 0.12).addScaledVector(f.right, 0.03);
      placeHand(this.bones, 'Right', onKnee.lerp(atMouth, ease(sip)), f.right.clone().add(new THREE.Vector3(0, -1, 0)),
        f.forward.clone().addScaledVector(f.right, -0.6), new THREE.Vector3(0, -1, 0));
      curlFingers(this.bones, 'Right', { Index: 1.2, Middle: 1.25, Ring: 1.3, Pinky: 1.3, Thumb: 0.5 });
    }
  }
}
