import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { normalMapFrom } from '../../world/normalMaps';
import { canvasTexture } from '../../world/textures';
import { DEFAULT_LOOK, lookKey, lookOption, type CharacterLook } from '@gungame/shared';
import { buildHead, humanMaterials, type AddPart, type HumanMaterials } from '../human';
import { FACIAL_HAIR, facialHairGeometry } from './facialHair';
import { bone, boneName, worldPos, type BoneMap } from './rig';

/**
 * Dresses a Mixamo-rigged character as a regular soldier in the player's chosen look (see
 * shared/src/character.ts): camouflage combat shirt and trousers, a plate carrier or chest rig, a
 * battle belt with a holster, knee pads, gloves, boots, headgear, and a face with the chosen skin
 * tone, hair and facial hair. Everything is generated as
 * skinned meshes on the character's own skeleton (sleeves and trouser legs bend smoothly at the
 * joints, fingers follow the finger bones), so all its animations, the IK and the first-person arms
 * keep working. The model's original meshes are removed.
 *
 * Call right after cloning and scaling the model, while it's in its rest (T) pose.
 */
/**
 * Party clothes instead of a uniform (the guests): what they wear on top and below, colours, shoes and
 * hair style. Skin tone, hair colour and facial hair come from the CharacterLook.
 */
export interface CivilianStyle {
  top: 'shirt' | 'tee' | 'blazer' | 'dress';
  topColor: number;
  bottomColor: number;
  /** Shirt under a blazer, or a dress's sash. */
  accent?: number;
  shoes: number;
  hairStyle: 'short' | 'long' | 'bun' | 'buzz';
  /** A high-visibility vest over the top, in the accent colour, with reflective bands. */
  hiVis?: boolean;
  /** A white hard hat. */
  hardHat?: boolean;
}

export function dressSoldier(model: THREE.Object3D, look: CharacterLook = DEFAULT_LOOK, civ?: CivilianStyle): void {
  const originals: THREE.SkinnedMesh[] = [];
  model.traverse(o => { if (o instanceof THREE.SkinnedMesh) originals.push(o); });
  const main = originals.reduce((a, b) => (b.skeleton.bones.length > a.skeleton.bones.length ? b : a));
  const boneList = main.skeleton.bones;
  model.updateMatrixWorld(true);
  let parts = outfit(model, boneList, civ ? { ...look, vest: 'none', headgear: look.headgear === 'cap' ? 'cap' : 'none', gloves: 'none' } : look, civ);
  // Guests are many and seen at party distance: one mesh with per-vertex colours draws each in a
  // single call (instead of one per material), which keeps a crowd cheap.
  if (civ) parts = [singleMesh(parts)];
  for (const o of originals) o.removeFromParent();

  const skeleton = new THREE.Skeleton(boneList);
  for (const { geometry, material } of parts) {
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = 'soldier';
    model.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(skeleton, mesh.matrixWorld);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
  }
}

/** Geometry is generated once per look (every copy of the model has the same rest pose) and shared. */
const cache = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material }[]>();

function outfit(model: THREE.Object3D, boneList: THREE.Bone[], look: CharacterLook, civ?: CivilianStyle): { geometry: THREE.BufferGeometry; material: THREE.Material }[] {
  // A guest's geometry depends only on its shape (cut, hair style, facial hair); colours come from a
  // per-guest palette (see crowdMaterial), so many guests share one generated body.
  const key = civ ? `civ:${civ.top}:${civ.hairStyle}:${look.face}:${look.headgear}:${civ.accent !== undefined}:${!!civ.hiVis}:${!!civ.hardHat}` : lookKey(look);
  const cached = cache.get(key);
  if (cached) return cached;
  const bones: BoneMap = new Map();
  model.traverse(o => {
    const name = boneName(o.name);
    if (o instanceof THREE.Bone || !bones.has(name)) bones.set(name, o);
  });
  const index = new Map(boneList.map((b, i) => [b, i]));
  /** Skin index of a bone, or of its nearest skinned parent (end and tip bones often aren't skinned). */
  const bi = (name: string) => {
    let o: THREE.Object3D | null = bone(bones, name);
    while (o && index.get(o as THREE.Bone) === undefined) o = o.parent;
    const i = o ? index.get(o as THREE.Bone) : undefined;
    if (i === undefined) throw new Error(`Bone ${name} isn't skinned`);
    return i;
  };
  const toLocal = (v: THREE.Vector3) => model.worldToLocal(v.clone());
  const unit = 1 / model.getWorldScale(new THREE.Vector3()).x;
  const mats = civ ? { ...soldierMaterials(look), ...ROLE_MATS_SOLDIER } : soldierMaterials(look);
  const bareHands = look.gloves === 'none';
  // Clothing materials: camouflage for the soldier, the chosen colours for a guest.
  const cm = civ ? ROLE_MATS_CIV : null;
  const topMat = cm?.top ?? mats.camo;
  const legMat = civ?.top === 'dress' ? mats.skin : cm?.bottom ?? mats.camo;
  const shortSleeves = civ?.top === 'tee' || civ?.top === 'dress';
  const builder = new OutfitBuilder();
  builder.toModel.copy(model.matrixWorld).invert();

  // Everything below is measured in world meters on the scaled model, converted to model space.
  const W = (name: string) => worldPos(bone(bones, name));
  const L = (name: string) => bi(name);

  // ---- Torso: combat shirt from the pelvis up to the collar.
  const hips = W('Hips');
  const spine = W('Spine');
  const spine1 = W('Spine1');
  const spine2 = W('Spine2');
  const neck = W('Neck');
  const head = W('Head');
  const torso: Ring[] = [
    { p: hips.clone().add(new THREE.Vector3(0, -0.1, 0)), rx: 0.155, rz: 0.115, bone: L('Hips') },
    { p: hips, rx: 0.16, rz: 0.115, bone: L('Hips') },
    { p: spine, rx: 0.15, rz: 0.11, bone: L('Spine') },
    { p: spine1, rx: 0.16, rz: 0.115, bone: L('Spine1') },
    { p: spine2, rx: 0.18, rz: 0.125, bone: L('Spine2') },
    { p: spine2.clone().lerp(neck, 0.6), rx: 0.17, rz: 0.11, bone: L('Spine2') },
    { p: neck.clone().add(new THREE.Vector3(0, -0.015, 0)), rx: 0.08, rz: 0.075, bone: L('Neck') },
  ];
  builder.tube(torso, new THREE.Vector3(0, 0, -1), topMat, { capStart: true });
  // Collar and neck.
  builder.tube([
    { p: neck.clone().add(new THREE.Vector3(0, -0.03, 0.005)), rx: 0.068, rz: 0.064, bone: L('Neck') },
    { p: head.clone().add(new THREE.Vector3(0, 0.04, 0)), rx: 0.052, rz: 0.054, bone: L('Head') },
  ], new THREE.Vector3(0, 0, -1), mats.skin);
  builder.tube([
    { p: neck.clone().add(new THREE.Vector3(0, -0.045, 0.01)), rx: 0.085, rz: 0.08, bone: L('Neck') },
    { p: neck.clone().add(new THREE.Vector3(0, 0.0, 0.015)), rx: 0.075, rz: 0.072, bone: L('Neck') },
  ], new THREE.Vector3(0, 0, -1), civ?.top === 'blazer' ? cm!.accent : topMat);
  if (civ) civilianDetails(builder, civ, cm!, { hips, spine1, spine2, neck }, L, mats);

  // ---- Arms: sleeves (rolled at the wrist) and gloved hands with jointed fingers.
  for (const side of ['Left', 'Right'] as const) {
    const sx = side === 'Left' ? -1 : 1;
    const arm = W(`${side}Arm`);
    const fore = W(`${side}ForeArm`);
    const hand = W(`${side}Hand`);
    const along = fore.clone().sub(arm).normalize();
    const sleeve: Ring[] = [
      { p: arm.clone().addScaledVector(along, -0.07).add(new THREE.Vector3(0, -0.01, 0)), rx: 0.07, rz: 0.075, bone: L(`${side}Shoulder`) },
      { p: arm, rx: 0.068, rz: 0.07, bone: L(`${side}Arm`) },
      { p: arm.clone().lerp(fore, 0.5), rx: 0.056, rz: 0.06, bone: L(`${side}Arm`) },
      { p: fore, rx: 0.05, rz: 0.052, bone: L(`${side}ForeArm`) },
      { p: fore.clone().lerp(hand, 0.55), rx: 0.046, rz: 0.044, bone: L(`${side}ForeArm`) },
      { p: fore.clone().lerp(hand, 0.88), rx: 0.04, rz: 0.038, bone: L(`${side}ForeArm`) },
    ];
    if (shortSleeves) {
      // Short sleeve to mid upper arm, bare arm below.
      builder.tube([...sleeve.slice(0, 2), { ...sleeve[2], rx: 0.06, rz: 0.064 }], new THREE.Vector3(0, 1, 0), topMat, { blend: 0.06 });
      builder.tube([{ ...sleeve[2], rx: 0.048, rz: 0.05 }, { ...sleeve[3], rx: 0.044, rz: 0.046 }, ...sleeve.slice(4).map(r => ({ ...r, rx: r.rx * 0.85, rz: r.rz * 0.85 }))],
        new THREE.Vector3(0, 1, 0), mats.skin, { blend: 0.06 });
    } else builder.tube(sleeve, new THREE.Vector3(0, 1, 0), topMat, { blend: 0.06 });
    // Bare wrist between cuff and glove.
    builder.tube([
      { p: fore.clone().lerp(hand, 0.86), rx: 0.034, rz: 0.03, bone: L(`${side}ForeArm`) },
      { p: hand.clone().addScaledVector(along, 0.01), rx: 0.032, rz: 0.026, bone: L(`${side}Hand`) },
    ], new THREE.Vector3(0, 1, 0), mats.skin);
    // Glove: palm block and fingers along the finger bones.
    const knuckle = W(`${side}HandMiddle1`);
    const palmLen = hand.distanceTo(knuckle) + 0.01;
    builder.rigid(new RoundedBoxGeometry(palmLen, 0.032, 0.09, 2, 0.012), mats.glove,
      new THREE.Matrix4().makeTranslation(hand.clone().lerp(knuckle, 0.5)), L(`${side}Hand`));
    for (const finger of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) {
      const radius = finger === 'Thumb' ? 0.011 : finger === 'Pinky' ? 0.0085 : 0.0098;
      const chain: Ring[] = [];
      for (let k = 1; k <= 4; k++) {
        const nm = `${side}Hand${finger}${k}`;
        if (!bones.has(nm)) continue;
        const own = k < 4 ? L(nm) : L(`${side}Hand${finger}3`);
        chain.push({ p: W(nm), rx: radius * (k === 4 ? 0.8 : 1), rz: radius * (k === 4 ? 0.8 : 1), bone: own });
      }
      if (finger === 'Thumb') chain.unshift({ p: hand.clone().lerp(W(`${side}HandThumb1`), 0.4), rx: 0.016, rz: 0.014, bone: L(`${side}Hand`) });
      builder.tube(chain, new THREE.Vector3(0, 1, 0), mats.glove, { capEnd: true, blend: 0.006, sides: 10 });
    }
    // Knuckle armour on the back of the glove.
    if (!bareHands) builder.rigid(new RoundedBoxGeometry(0.03, 0.012, 0.075, 2, 0.005), mats.gloveArmor,
      new THREE.Matrix4().makeTranslation(knuckle.clone().add(new THREE.Vector3(-sx * 0.012, 0.018, 0))), L(`${side}Hand`));
  }

  // ---- Legs: trousers with cargo pockets, knee pads, tan boots.
  for (const side of ['Left', 'Right'] as const) {
    const sx = side === 'Left' ? -1 : 1;
    const up = W(`${side}UpLeg`);
    const knee = W(`${side}Leg`);
    const ankle = W(`${side}Foot`);
    builder.tube([
      { p: up.clone().add(new THREE.Vector3(-sx * 0.02, 0.07, 0)), rx: 0.105, rz: 0.11, bone: L('Hips') },
      { p: up, rx: 0.1, rz: 0.105, bone: L(`${side}UpLeg`) },
      { p: up.clone().lerp(knee, 0.5), rx: 0.08, rz: 0.085, bone: L(`${side}UpLeg`) },
      { p: knee, rx: 0.062, rz: 0.066, bone: L(`${side}Leg`) },
      { p: knee.clone().lerp(ankle, 0.45), rx: 0.058, rz: 0.062, bone: L(`${side}Leg`) },
      { p: ankle.clone().add(new THREE.Vector3(0, 0.12, 0)), rx: 0.056, rz: 0.06, bone: L(`${side}Leg`) },
    ].map(r => (civ?.top === 'dress' ? { ...r, rx: r.rx * 0.8, rz: r.rz * 0.8 } : r)), new THREE.Vector3(0, 0, -1), legMat, { blend: 0.07 });
    if (civ) {
      // Down to the shoe: trouser hem (or bare ankle under a dress) over the top of the foot.
      const thin = civ.top === 'dress' ? 0.8 : 1;
      builder.tube([
        { p: ankle.clone().add(new THREE.Vector3(0, 0.14, 0)), rx: 0.055 * thin, rz: 0.058 * thin, bone: L(`${side}Leg`) },
        { p: ankle.clone().add(new THREE.Vector3(0, 0.02, 0)), rx: 0.05 * thin, rz: 0.055 * thin, bone: L(`${side}Leg`) },
        { p: ankle.clone().add(new THREE.Vector3(0, -0.04, 0.0)), rx: 0.042 * thin, rz: 0.05 * thin, bone: L(`${side}Foot`) },
      ], new THREE.Vector3(0, 0, -1), legMat, { blend: 0.05, capEnd: true });
      // Party shoes: a low leather shoe (or a slim heel under a dress).
      const toe = W(`${side}ToeBase`);
      const toeEnd = W(`${side}Toe_End`);
      const len = ankle.z + 0.06 - toeEnd.z;
      const mid = new THREE.Vector3(ankle.x, 0.04, (ankle.z + 0.06 + toeEnd.z) / 2);
      builder.rigid(new RoundedBoxGeometry(0.085, 0.07, len, 3, 0.03), cm!.shoes, new THREE.Matrix4().makeTranslation(mid), L(`${side}Foot`));
      builder.rigid(new RoundedBoxGeometry(0.09, 0.018, len, 2, 0.008), mats.sole, new THREE.Matrix4().makeTranslation(mid.clone().setY(0.009)), L(`${side}Foot`));
      void toe;
      continue;
    }
    // Cargo pocket on the outer thigh.
    const pocketAt = up.clone().lerp(knee, 0.45).add(new THREE.Vector3(sx * 0.085, 0, 0.0));
    builder.rigid(new RoundedBoxGeometry(0.035, 0.17, 0.13, 2, 0.012), mats.camo, new THREE.Matrix4().makeTranslation(pocketAt), L(`${side}UpLeg`));
    builder.rigid(new RoundedBoxGeometry(0.04, 0.04, 0.135, 2, 0.01), mats.camo, new THREE.Matrix4().makeTranslation(pocketAt.clone().add(new THREE.Vector3(sx * 0.003, 0.085, 0))), L(`${side}UpLeg`));
    // Knee pad.
    const padAt = knee.clone().add(new THREE.Vector3(0, -0.01, -0.06));
    builder.rigid(new RoundedBoxGeometry(0.11, 0.14, 0.04, 3, 0.018), mats.pad, new THREE.Matrix4().makeTranslation(padAt), L(`${side}Leg`));
    builder.rigid(new THREE.BoxGeometry(0.135, 0.02, 0.1), mats.strap, new THREE.Matrix4().makeTranslation(padAt.clone().add(new THREE.Vector3(0, 0.05, 0.035))), L(`${side}Leg`));
    builder.rigid(new THREE.BoxGeometry(0.135, 0.02, 0.1), mats.strap, new THREE.Matrix4().makeTranslation(padAt.clone().add(new THREE.Vector3(0, -0.05, 0.035))), L(`${side}Leg`));
    // Boot: shaft round the ankle, the foot, a toe cap, a lugged sole.
    const toe = W(`${side}ToeBase`);
    const toeEnd = W(`${side}Toe_End`);
    builder.tube([
      { p: ankle.clone().add(new THREE.Vector3(0, 0.16, 0)), rx: 0.06, rz: 0.064, bone: L(`${side}Leg`) },
      { p: ankle.clone().add(new THREE.Vector3(0, 0.02, 0.005)), rx: 0.058, rz: 0.066, bone: L(`${side}Foot`) },
    ], new THREE.Vector3(0, 0, -1), mats.boot, { blend: 0.05 });
    const footMid = new THREE.Vector3(ankle.x, 0.055, (ankle.z + 0.05 + toe.z) / 2);
    const footLen = ankle.z + 0.06 - toe.z;
    builder.rigid(new RoundedBoxGeometry(0.1, 0.1, footLen, 3, 0.035), mats.boot, new THREE.Matrix4().makeTranslation(footMid), L(`${side}Foot`));
    const capLen = toe.z - toeEnd.z + 0.04;
    builder.rigid(new RoundedBoxGeometry(0.098, 0.075, capLen, 3, 0.035), mats.boot,
      new THREE.Matrix4().makeTranslation(new THREE.Vector3(toe.x, 0.045, (toe.z + toeEnd.z) / 2 - 0.01)), L(`${side}ToeBase`));
    builder.rigid(new RoundedBoxGeometry(0.108, 0.025, footLen - 0.01, 2, 0.01), mats.sole,
      new THREE.Matrix4().makeTranslation(new THREE.Vector3(ankle.x, 0.0125, footMid.z)), L(`${side}Foot`));
    builder.rigid(new RoundedBoxGeometry(0.106, 0.025, capLen, 2, 0.01), mats.sole,
      new THREE.Matrix4().makeTranslation(new THREE.Vector3(toe.x, 0.0125, (toe.z + toeEnd.z) / 2 - 0.01)), L(`${side}ToeBase`));
    // Laces.
    for (let i = 0; i < 4; i++) {
      builder.rigid(new THREE.BoxGeometry(0.05, 0.006, 0.008), mats.strap,
        new THREE.Matrix4().makeTranslation(new THREE.Vector3(ankle.x, 0.1 + i * 0.03, ankle.z - 0.065 + i * 0.006)), L(i < 2 ? `${side}Foot` : `${side}Leg`));
    }
  }

  // ---- Plate carrier: front and back plates, cummerbund, shoulder straps, pouches, radio.
  const chestFront = spine2.z - 0.125;
  const carrierY = (spine1.y + spine2.y) / 2 + 0.02;
  const S2 = L('Spine2');
  const S1 = L('Spine1');
  const m4 = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  if (look.vest === 'plate') {
    builder.rigid(new RoundedBoxGeometry(0.29, 0.33, 0.05, 3, 0.02), mats.carrier, m4(0, carrierY, chestFront - 0.01, -0.06), S2);
    builder.rigid(new RoundedBoxGeometry(0.3, 0.36, 0.05, 3, 0.02), mats.carrier, m4(0, carrierY + 0.01, spine2.z + 0.13, 0.05), S2);
    // Cummerbund round the ribs (a flattened ring), bound to the lower spine so it twists with it.
    const band = new THREE.CylinderGeometry(1, 1, 0.16, 28, 1, true);
    band.scale(0.168, 1, 0.128);
    builder.rigid(band, mats.carrier, m4(0, spine1.y + 0.02, spine1.z + 0.0), S1, true);
    for (const sx of [-1, 1]) {
      // Shoulder straps over the trapezius.
      builder.rigid(new RoundedBoxGeometry(0.06, 0.03, 0.3, 2, 0.01), mats.carrier, m4(sx * 0.1, neck.y - 0.03, spine2.z, 0, 0, sx * 0.25), S2);
      // Side radio pouch and antenna on the left; IFAK on the right.
      if (sx < 0) {
        builder.rigid(new RoundedBoxGeometry(0.06, 0.15, 0.08, 2, 0.012), mats.carrier, m4(-0.19, carrierY - 0.04, spine2.z + 0.02), S1);
        builder.rigid(new THREE.CylinderGeometry(0.006, 0.008, 0.32, 6), mats.strap, m4(-0.19, carrierY + 0.2, spine2.z + 0.04, 0.12, 0, 0.05), S2);
      } else {
        builder.rigid(new RoundedBoxGeometry(0.06, 0.13, 0.1, 2, 0.012), mats.carrier, m4(0.19, carrierY - 0.05, spine2.z + 0.02), S1);
        builder.rigid(new THREE.BoxGeometry(0.062, 0.03, 0.03), mats.red, m4(0.19, carrierY + 0.025, spine2.z - 0.02), S1);
      }
    }
    // Triple magazine pouch with mags poking out, admin pouch above, a light and a tourniquet.
    for (let i = -1; i <= 1; i++) {
      const x = i * 0.085;
      builder.rigid(new RoundedBoxGeometry(0.075, 0.12, 0.045, 2, 0.01), mats.carrier, m4(x, carrierY - 0.1, chestFront - 0.055), S2);
      builder.rigid(new RoundedBoxGeometry(0.06, 0.035, 0.028, 2, 0.006), mats.mag, m4(x, carrierY - 0.025, chestFront - 0.058), S2);
    }
    builder.rigid(new RoundedBoxGeometry(0.17, 0.09, 0.03, 2, 0.01), mats.carrier, m4(0, carrierY + 0.07, chestFront - 0.045), S2);
    builder.rigid(new THREE.BoxGeometry(0.06, 0.035, 0.004), mats.patch, m4(0.05, carrierY + 0.08, chestFront - 0.062), S2);
    builder.rigid(new THREE.CylinderGeometry(0.014, 0.014, 0.08, 10), mats.metal, m4(-0.12, carrierY + 0.05, chestFront - 0.05), S2);
    // Webbing (MOLLE) rows across the back plate.
    for (let r = 0; r < 4; r++) builder.rigid(new THREE.BoxGeometry(0.28, 0.012, 0.006), mats.strap, m4(0, carrierY - 0.1 + r * 0.06, spine2.z + 0.157, 0.05), S2);
  } else if (look.vest === 'rig') {
    // Chest rig: a low panel of four rifle mag pouches on the belly, X harness over the back.
    const rigY = spine1.y - 0.02;
    const rigZ = spine1.z - 0.122;
    builder.rigid(new RoundedBoxGeometry(0.3, 0.17, 0.04, 3, 0.015), mats.carrier, m4(0, rigY, rigZ, -0.05), S1);
    for (let i = 0; i < 4; i++) {
      const x = -0.105 + i * 0.07;
      builder.rigid(new RoundedBoxGeometry(0.062, 0.13, 0.045, 2, 0.01), mats.carrier, m4(x, rigY - 0.01, rigZ - 0.04, -0.05), S1);
      builder.rigid(new RoundedBoxGeometry(0.05, 0.03, 0.025, 2, 0.006), mats.mag, m4(x, rigY + 0.07, rigZ - 0.042, -0.05), S1);
    }
    for (const sx of [-1, 1]) {
      builder.rigid(new RoundedBoxGeometry(0.045, 0.025, 0.3, 2, 0.008), mats.strap, m4(sx * 0.1, neck.y - 0.03, spine2.z, 0, 0, sx * 0.25), S2);
      builder.rigid(new THREE.BoxGeometry(0.035, 0.36, 0.01), mats.strap, m4(sx * 0.05, carrierY, spine2.z + 0.128, 0.05, 0, sx * 0.5), S2);
      builder.rigid(new THREE.BoxGeometry(0.035, 0.24, 0.01), mats.strap, m4(sx * 0.1, carrierY + 0.06, chestFront + 0.012, -0.06), S2);
    }
    builder.rigid(new THREE.CylinderGeometry(0.014, 0.014, 0.08, 10), mats.metal, m4(-0.1, carrierY + 0.07, chestFront + 0.002), S2);
  }

  // ---- Battle belt with pouches, holster on the right thigh (soldiers only).
  if (!civ) {
  const beltY = hips.y + 0.02;
  const belt = new THREE.CylinderGeometry(1, 1, 0.06, 28, 1, true);
  belt.scale(0.168, 1, 0.128);
  builder.rigid(belt, mats.belt, m4(0, beltY, hips.z), L('Hips'), true);
  builder.rigid(new RoundedBoxGeometry(0.05, 0.035, 0.012, 2, 0.004), mats.metal, m4(0, beltY, hips.z - 0.13), L('Hips'));
  for (const [x, z] of [[-0.15, -0.06], [-0.16, 0.05], [0.12, 0.11], [-0.08, 0.13]]) {
    builder.rigid(new RoundedBoxGeometry(0.07, 0.1, 0.05, 2, 0.012), mats.carrier, m4(x, beltY - 0.03, hips.z + z, 0, Math.atan2(x, -z), 0), L('Hips'));
  }
  const rThigh = W('RightUpLeg').lerp(W('RightLeg'), 0.22).add(new THREE.Vector3(0.095, 0, -0.01));
  builder.rigid(new RoundedBoxGeometry(0.05, 0.2, 0.11, 2, 0.015), mats.holster, m4(rThigh.x, rThigh.y, rThigh.z, 0.08), L('RightUpLeg'));
  builder.rigid(new RoundedBoxGeometry(0.04, 0.06, 0.07, 2, 0.01), mats.mag, m4(rThigh.x, rThigh.y + 0.11, rThigh.z + 0.02), L('RightUpLeg'));
  }

  // ---- Head: face with the chosen skin, hair and facial hair, then the headgear.
  const headGroup = new THREE.Group();
  const headScale = 1.02;
  headGroup.position.copy(head).add(new THREE.Vector3(0, 0.0, -0.02));
  model.add(headGroup);
  const base = humanMaterials();
  const hm: HumanMaterials = civ
    ? { ...base, skin: mats.skin, hair: mats.hair, brow: mats.brow, lips: mats.lips, eyeWhite: ROLE.eyeWhite, iris: ROLE.iris, pupil: ROLE.pupil }
    : { ...base, skin: mats.skin, hair: mats.hair, brow: mats.brow, lips: mats.lips };
  // Hats and helmets cover the hair (it would poke through).
  const hideHair = look.headgear !== 'none' || !!civ?.hardHat;
  const addHead: AddPart = (parent, geo, mat, x, y, z, rot, scale) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(...rot);
    if (scale) mesh.scale.set(...scale);
    parent.add(mesh);
    return mesh;
  };
  headGroup.position.copy(toLocal(headGroup.position));
  headGroup.scale.setScalar(headScale * unit);
  buildHead(headGroup, addHead, hm, civ ? 'low' : 'high');
  // Facial hair grows off the face (facialHair.ts); it shows under headgear too.
  const beard = facialHairGeometry(look.face, civ ? 'low' : 'high');
  if (beard) {
    const mesh = addHead(headGroup, beard, FACIAL_HAIR[look.face]!.material === 'stubble' ? mats.stubble : mats.hair, 0, 0.11, 0);
    mesh.userData.facialHair = true;
  }
  headGroup.updateMatrixWorld(true);
  const H = L('Head');
  const modelInv = model.matrixWorld.clone().invert();
  for (const child of [...headGroup.children]) {
    if (!(child instanceof THREE.Mesh)) continue;
    // (Sideburns, at ear height, still show.)
    if (hideHair && child.material === mats.hair && !child.userData.facialHair && Math.abs(child.position.y - 0.122) > 0.004) continue;
    // A buzz cut: the hair cap only, no tufts.
    if (civ?.hairStyle === 'buzz' && child.material === mats.hair && !child.userData.facialHair && child.position.y > 0.15) continue;
    const local = modelInv.clone().multiply(child.matrixWorld);
    builder.rigidLocal(child.geometry, child.material as THREE.Material, local, H);
  }
  headGroup.removeFromParent();

  if (civ?.hairStyle === 'long' || civ?.hairStyle === 'bun') {
    const back = head.clone().add(new THREE.Vector3(0, 0.1, 0.03));
    if (civ.hairStyle === 'long') {
      // Hair falling to the shoulders behind the head.
      const fall = new THREE.SphereGeometry(0.11, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.75);
      fall.scale(1.05, 1.55, 0.9);
      builder.rigid(fall, mats.hair, m4(back.x, back.y + 0.02, back.z + 0.012), L('Head'));
    } else {
      builder.rigid(new THREE.SphereGeometry(0.045, 16, 12), mats.hair, m4(back.x, back.y + 0.1, back.z + 0.07), L('Head'));
    }
  }

  // Headgear, sized to the head: the scalp tops out about 0.23 m above the head bone.
  const crown = head.clone().add(new THREE.Vector3(0, 0.15, -0.018));
  /** A dome from `cut` (radians below the equator, 0 = equator) up, squashed to a head shape. */
  const dome = (r: number, below: number) => {
    const g = new THREE.SphereGeometry(r, 32, 18, 0, Math.PI * 2, 0, Math.PI * (0.5 + below));
    g.scale(0.95, 1, 1.08);
    return g;
  };
  if (civ?.hardHat) {
    // Hard hat: a ribbed shell over the crown, a peak at the front, a narrow brim round the rest.
    const hat = ROLE.eyeWhite;
    builder.rigid(dome(0.122, 0.02), hat, m4(crown.x, crown.y - 0.028, crown.z + 0.006), H);
    builder.rigid(new THREE.BoxGeometry(0.018, 0.012, 0.2).translate(0, 0, 0), hat, m4(crown.x, crown.y + 0.085, crown.z + 0.006), H);
    const brim = new THREE.CylinderGeometry(0.135, 0.135, 0.01, 32);
    brim.scale(0.95, 1, 1.08);
    builder.rigid(brim, hat, m4(crown.x, crown.y - 0.03, crown.z + 0.006), H);
    const peak = new THREE.CylinderGeometry(0.11, 0.11, 0.009, 24, 1, false, -Math.PI * 0.3 + Math.PI, Math.PI * 0.6);
    builder.rigid(peak, hat, m4(crown.x, crown.y - 0.025, crown.z - 0.06, 0.12), H);
  } else if (look.headgear === 'helmet') {
    // FAST helmet: shell cut high over the ears, rim, side rails, NVG shroud, counterweight, headset.
    const shell = new THREE.SphereGeometry(0.128, 32, 18, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const sp = shell.getAttribute('position');
    const v = new THREE.Vector3();
    for (let i = 0; i < sp.count; i++) {
      v.fromBufferAttribute(sp, i);
      const sideness = Math.abs(v.x) / 0.128;
      const back = v.z > 0 ? v.z / 0.128 : 0;
      const lift = sideness > 0.7 && back < 0.6 ? 0.035 * (sideness - 0.7) / 0.3 : 0;
      if (v.y < 0.03) v.y = Math.max(v.y, -0.012 + lift - back * 0.02);
      sp.setXYZ(i, v.x * 0.95, v.y * 1.02, v.z * 1.08);
    }
    shell.computeVertexNormals();
    builder.rigid(shell, mats.helmet, m4(crown.x, crown.y - 0.005, crown.z + 0.004), H);
    const rim = new THREE.TorusGeometry(0.124, 0.006, 6, 40);
    rim.rotateX(Math.PI / 2);
    rim.scale(0.95, 1, 1.08);
    builder.rigid(rim, mats.helmetEdge, m4(crown.x, crown.y - 0.012, crown.z + 0.004), H);
    for (const sx of [-1, 1]) {
      builder.rigid(new RoundedBoxGeometry(0.012, 0.022, 0.1, 2, 0.004), mats.helmetEdge, m4(crown.x + sx * 0.118, crown.y + 0.012, crown.z, 0, 0, sx * -0.25), H);
      builder.rigid(new THREE.CylinderGeometry(0.042, 0.042, 0.035, 18).rotateZ(Math.PI / 2), mats.headset, m4(crown.x + sx * 0.098, crown.y - 0.04, crown.z + 0.015), H);
      builder.rigid(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 14).rotateZ(Math.PI / 2), mats.strap, m4(crown.x + sx * 0.12, crown.y - 0.04, crown.z + 0.015), H);
      builder.rigid(new THREE.BoxGeometry(0.008, 0.12, 0.016), mats.strap, m4(crown.x + sx * 0.078, crown.y - 0.13, crown.z - 0.02, 0, 0, sx * 0.22), H);
    }
    builder.rigid(new THREE.TorusGeometry(0.104, 0.006, 4, 24, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI / 2), mats.headset, m4(crown.x, crown.y + 0.025, crown.z + 0.015), H);
    builder.rigid(new RoundedBoxGeometry(0.06, 0.04, 0.02, 2, 0.006), mats.helmetEdge, m4(crown.x, crown.y + 0.035, crown.z - 0.137, -0.35), H);
    builder.rigid(new RoundedBoxGeometry(0.1, 0.06, 0.035, 2, 0.01), mats.carrier, m4(crown.x, crown.y - 0.0, crown.z + 0.13, 0.4), H);
    builder.rigid(new THREE.BoxGeometry(0.03, 0.02, 0.004), mats.patch, m4(crown.x + 0.07, crown.y + 0.06, crown.z + 0.085, 0.4, 0.6, 0), H);
  } else if (look.headgear === 'boonie') {
    // Boonie hat in the uniform's camo: soft crown, band, wide floppy brim.
    builder.rigid(dome(0.118, 0.04), mats.camo, m4(crown.x, crown.y - 0.025, crown.z + 0.004), H);
    builder.rigid(new THREE.CylinderGeometry(0.115, 0.115, 0.025, 32, 1, true).scale(0.95, 1, 1.08), mats.strap, m4(crown.x, crown.y - 0.02, crown.z + 0.004), H, true);
    const brim = new THREE.RingGeometry(0.11, 0.2, 40, 2);
    const bp = brim.getAttribute('position');
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i);
      const y = bp.getY(i);
      const r = Math.hypot(x, y);
      // Droops at the edge, a little more at the sides.
      bp.setXYZ(i, x * 0.95, y * 1.08, -Math.max(0, r - 0.11) * (0.35 + 0.25 * Math.abs(x / r)));
    }
    brim.rotateX(Math.PI / 2);
    brim.computeVertexNormals();
    builder.rigid(brim, mats.camo, m4(crown.x, crown.y - 0.035, crown.z + 0.004), H, true);
  } else if (look.headgear === 'cap') {
    // Ball cap: six-panel crown, button, stiff curved bill.
    builder.rigid(dome(0.112, 0.02), mats.capColor, m4(crown.x, crown.y - 0.03, crown.z + 0.01), H);
    builder.rigid(new THREE.SphereGeometry(0.009, 8, 6), mats.capColor, m4(crown.x, crown.y + 0.083, crown.z + 0.01), H);
    const bill = new THREE.CylinderGeometry(0.1, 0.1, 0.008, 24, 1, false, -Math.PI * 0.42 + Math.PI, Math.PI * 0.84);
    bill.scale(0.95, 1, 1.0);
    builder.rigid(bill, mats.capColor, m4(crown.x, crown.y - 0.03, crown.z - 0.075, 0.18), H);
    builder.rigid(new THREE.BoxGeometry(0.04, 0.026, 0.004), mats.patch, m4(crown.x, crown.y + 0.02, crown.z - 0.115, -0.35), H);
  } else if (look.headgear === 'beanie') {
    // Knit watch cap, rolled cuff.
    builder.rigid(dome(0.112, 0.06), mats.knit, m4(crown.x, crown.y - 0.025, crown.z + 0.008), H);
    const cuff = new THREE.TorusGeometry(0.105, 0.016, 8, 36);
    cuff.rotateX(Math.PI / 2);
    cuff.scale(0.95, 1, 1.08);
    builder.rigid(cuff, mats.knit, m4(crown.x, crown.y - 0.045, crown.z + 0.008), H);
  }

  const built = builder.build();
  cache.set(key, built);
  return built;
}

/** One cross-section of a tube, at a point, with radii across (x) and front-back (z), and its bone. */
interface Ring {
  p: THREE.Vector3;
  rx: number;
  rz: number;
  bone: number;
}

interface Piece {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/** Collects skinned pieces (in the model's local space) and merges them per material. */
class OutfitBuilder {
  private readonly pieces: Piece[] = [];
  /** World -> model local (set from the model at build time). */
  readonly toModel = new THREE.Matrix4();

  /**
   * A smooth tube through rings (a sleeve, a trouser leg, a torso). Vertices near a ring between two
   * bones are weighted to both, blending over `blend` meters, so it bends smoothly at the joints.
   * `front` is the direction the rz radius faces (forward for the body, up for arms).
   */
  tube(rings: Ring[], front: THREE.Vector3, material: THREE.Material, o: { capStart?: boolean; capEnd?: boolean; blend?: number; sides?: number } = {}): void {
    const sides = o.sides ?? 20;
    const blend = o.blend ?? 0.05;
    // Resample along the chain for smooth bends.
    const samples: { p: THREE.Vector3; rx: number; rz: number; t: THREE.Vector3; w: [number, number, number] }[] = [];
    const lens = [0];
    for (let i = 1; i < rings.length; i++) lens.push(lens[i - 1] + rings[i].p.distanceTo(rings[i - 1].p));
    const total = lens[lens.length - 1];
    const steps = Math.max(rings.length, Math.ceil(total / 0.025));
    for (let s = 0; s <= steps; s++) {
      const d = (s / steps) * total;
      let k = 1;
      while (k < rings.length - 1 && lens[k] < d) k++;
      const a = rings[k - 1];
      const b = rings[k];
      const seg = lens[k] - lens[k - 1] || 1;
      const u = THREE.MathUtils.clamp((d - lens[k - 1]) / seg, 0, 1);
      const su = u * u * (3 - 2 * u);
      const p = a.p.clone().lerp(b.p, u);
      const t = b.p.clone().sub(a.p).normalize();
      // Weight: ring a's bone, crossing to b's bone around b (the joint), within the blend distance.
      const toB = lens[k] - d;
      const fromA = d - lens[k - 1];
      let w: [number, number, number] = [a.bone, b.bone, 0];
      if (a.bone === b.bone) w = [a.bone, a.bone, 0];
      else if (toB < blend) w = [a.bone, b.bone, 0.5 * (1 - toB / blend)];
      else w = [a.bone, b.bone, 0];
      if (k > 1 && fromA < blend && rings[k - 2].bone !== a.bone) {
        // Just past the previous joint: still partly on the previous bone.
        w = [rings[k - 2].bone, a.bone, 0.5 + 0.5 * (fromA / blend)];
      }
      samples.push({ p, rx: THREE.MathUtils.lerp(a.rx, b.rx, su), rz: THREE.MathUtils.lerp(a.rz, b.rz, su), t, w });
    }
    const pos: number[] = [];
    const uv: number[] = [];
    const si: number[] = [];
    const sw: number[] = [];
    const idx: number[] = [];
    for (let s = 0; s < samples.length; s++) {
      const { p, rx, rz, t, w } = samples[s];
      const F = front.clone().addScaledVector(t, -front.dot(t)).normalize();
      const S = new THREE.Vector3().crossVectors(t, F).normalize();
      for (let j = 0; j <= sides; j++) {
        const a = (j / sides) * Math.PI * 2;
        const q = p.clone().addScaledVector(S, Math.cos(a) * rx).addScaledVector(F, Math.sin(a) * rz);
        pos.push(q.x, q.y, q.z);
        uv.push(j / sides * 2, s * 0.025 * 3);
        // Weight w[2] is how much of the second bone applies.
        si.push(w[0], w[1], 0, 0);
        sw.push(1 - w[2], w[2], 0, 0);
      }
    }
    const row = sides + 1;
    for (let s = 0; s < samples.length - 1; s++) {
      for (let j = 0; j < sides; j++) {
        const a = s * row + j;
        const b = a + 1;
        const c = a + row + 1;
        const d = a + row;
        idx.push(a, b, d, b, c, d);
      }
    }
    const cap = (s: number, flip: boolean) => {
      const { p, w } = samples[s];
      const center = pos.length / 3;
      pos.push(p.x, p.y, p.z);
      uv.push(0.5, 0.5);
      si.push(w[0], w[1], 0, 0);
      sw.push(1 - w[2], w[2], 0, 0);
      for (let j = 0; j < sides; j++) {
        const a = s * row + j;
        if (flip) idx.push(center, a + 1, a);
        else idx.push(center, a, a + 1);
      }
    };
    if (o.capStart) cap(0, false);
    if (o.capEnd) cap(samples.length - 1, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    // Faces wind inward or outward depending on the frame; make normals point away from the axis.
    this.pieces.push({ geometry: orientOutward(g, samples.map(s => s.p), row), material });
  }

  /** A rigid part placed by a world-space matrix, fully on one bone. `doubleSided` for open shells. */
  rigid(geo: THREE.BufferGeometry, material: THREE.Material, world: THREE.Matrix4, bone: number, doubleSided = false): void {
    const g = geo.clone().applyMatrix4(world);
    this.add(g, material, bone, doubleSided);
  }

  /** A rigid part already in model-local space. */
  rigidLocal(geo: THREE.BufferGeometry, material: THREE.Material, local: THREE.Matrix4, bone: number): void {
    const g = geo.clone().applyMatrix4(local);
    this.add(g, material, bone, false, true);
  }

  private add(g: THREE.BufferGeometry, material: THREE.Material, bone: number, doubleSided: boolean, local = false): void {
    if (g.index) g = g.toNonIndexed();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const n = g.getAttribute('position').count;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((_, i) => (i % 4 === 0 ? bone : 0)), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    if (doubleSided) {
      // Add the back faces too.
      const back = g.clone();
      const bp = back.getAttribute('position');
      const bn = back.getAttribute('normal');
      for (let i = 0; i < bp.count; i += 3) {
        for (const attr of [bp, bn, back.getAttribute('uv'), back.getAttribute('skinIndex'), back.getAttribute('skinWeight')] as THREE.BufferAttribute[]) {
          const size = attr.itemSize;
          const arr = attr.array;
          for (let c = 0; c < size; c++) {
            const a = arr[i * size + c];
            arr[i * size + c] = arr[(i + 2) * size + c];
            arr[(i + 2) * size + c] = a;
          }
        }
      }
      for (let i = 0; i < bn.count; i++) bn.setXYZ(i, -bn.getX(i), -bn.getY(i), -bn.getZ(i));
      this.pieces.push({ geometry: g, material, local } as Piece & { local: boolean });
      this.pieces.push({ geometry: back, material, local } as Piece & { local: boolean });
      return;
    }
    this.pieces.push({ geometry: g, material, local } as Piece & { local: boolean });
  }

  /** Merges by material. Pieces built in world space are converted to model space first. */
  build(): Piece[] {
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const p of this.pieces as (Piece & { local?: boolean })[]) {
      let g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry;
      if (!p.local) g = g.applyMatrix4(this.toModel);
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(name)) g.deleteAttribute(name);
      byMat.set(p.material, [...(byMat.get(p.material) ?? []), g]);
    }
    const out: Piece[] = [];
    for (const [material, geos] of byMat) {
      const merged = mergeGeometries(geos);
      // Share corners again (the pieces were split into separate triangles to merge them), which
      // cuts the vertex count, and so the skinning work, several times over.
      if (merged) out.push({ geometry: mergeVertices(merged, 1e-4), material });
    }
    return out;
  }
}

/** Flips a tube's triangles if its normals point inward. */
function orientOutward(g: THREE.BufferGeometry, centers: THREE.Vector3[], row: number): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const mid = Math.floor(centers.length / 2) * row + Math.floor(row / 4);
  const c = centers[Math.floor(centers.length / 2)];
  const out = new THREE.Vector3().fromBufferAttribute(pos, mid).sub(c);
  const n = new THREE.Vector3().fromBufferAttribute(nor, mid);
  if (out.dot(n) >= 0) return g;
  const index = g.getIndex()!;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, a);
  }
  g.computeVertexNormals();
  return g;
}

interface SoldierMaterials {
  camo: THREE.MeshStandardMaterial;
  carrier: THREE.MeshStandardMaterial;
  strap: THREE.MeshStandardMaterial;
  belt: THREE.MeshStandardMaterial;
  glove: THREE.MeshStandardMaterial;
  gloveArmor: THREE.MeshStandardMaterial;
  pad: THREE.MeshStandardMaterial;
  boot: THREE.MeshStandardMaterial;
  sole: THREE.MeshStandardMaterial;
  helmet: THREE.MeshStandardMaterial;
  helmetEdge: THREE.MeshStandardMaterial;
  headset: THREE.MeshStandardMaterial;
  holster: THREE.MeshStandardMaterial;
  mag: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  patch: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  lips: THREE.MeshStandardMaterial;
  hair: THREE.MeshStandardMaterial;
  brow: THREE.MeshStandardMaterial;
  stubble: THREE.MeshStandardMaterial;
  capColor: THREE.MeshStandardMaterial;
  knit: THREE.MeshStandardMaterial;
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Camouflage from a palette: base colour with layered organic blotches, and a fabric weave. */
function camoTexture(colors: number[]): THREE.CanvasTexture {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = hex(colors[0]);
    g.fillRect(0, 0, s, s);
    const blob = (color: number, count: number, size: number) => {
      g.fillStyle = hex(color);
      for (let i = 0; i < count; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        // Draw each blob at its wrapped positions too, so the texture tiles seamlessly.
        for (const [ox, oy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) {
          g.beginPath();
          const pts = 8;
          for (let k = 0; k <= pts; k++) {
            const a = (k / pts) * Math.PI * 2;
            const r = size * (0.5 + Math.random() * 0.7);
            const px = x + ox + Math.cos(a) * r * 1.6;
            const py = y + oy + Math.sin(a) * r;
            if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
          }
          g.fill();
        }
      }
    };
    if (colors.length > 1) {
      blob(colors[1], 26, 18);
      blob(colors[2] ?? colors[1], 22, 14);
      blob(colors[3] ?? colors[1], 18, 10);
      blob(colors[4] ?? colors[0], 14, 8);
    }
    for (let y = 0; y < s; y += 2) {
      g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.03})`;
      g.fillRect(0, y, s, 1);
    }
  });
}

let shared: Omit<SoldierMaterials, 'camo' | 'skin' | 'lips' | 'hair' | 'brow' | 'stubble' | 'glove' | 'boot' | 'capColor'> | null = null;
let weaveNormal: THREE.Texture | null = null;
let leatherNormal: THREE.Texture | null = null;
let stubbleTex: THREE.Texture | null = null;
const perLook = new Map<string, SoldierMaterials>();

function soldierMaterials(look: CharacterLook): SoldierMaterials {
  const key = lookKey(look);
  const cached = perLook.get(key);
  if (cached) return cached;
  if (!shared) {
    const weave = canvasTexture(64, (g, s) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 2) for (let x = 0; x < s; x += 2) {
        const v = 110 + ((x + y) % 4 === 0 ? 30 : -10) + Math.random() * 20;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x, y, 2, 2);
      }
    }, 8);
    weaveNormal = normalMapFrom(weave, 1.2);
    // Stubble: dense short dark hairs over skin, so it reads as shadow up close rather than paint.
    stubbleTex = canvasTexture(128, (g, s) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.3})`;
        const x = Math.random() * s, y = Math.random() * s;
        g.fillRect(x, y, 1, 1 + Math.random() * 1.5);
      }
    }, 6);
    const molle = canvasTexture(128, (g, s) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, s, s);
      for (let y = 8; y < s; y += 24) {
        g.fillStyle = '#c8c8c8';
        g.fillRect(0, y, s, 10);
        g.fillStyle = '#404040';
        g.fillRect(0, y + 10, s, 2);
        for (let x = 0; x < s; x += 32) g.fillRect(x, y, 2, 10);
      }
    }, 3);
    const leather = canvasTexture(64, (g, s) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 700; i++) {
        const v = 100 + Math.random() * 60;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
      }
    }, 6);
    leatherNormal = normalMapFrom(leather, 1.0);
    const knit = canvasTexture(64, (g, s) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 4) {
        g.fillStyle = '#b0b0b0';
        g.fillRect(x, 0, 2, s);
      }
    }, 10);
    const cloth = (color: number) => new THREE.MeshStandardMaterial({ color, normalMap: weaveNormal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.9 });
    shared = {
      carrier: new THREE.MeshStandardMaterial({ color: 0x4f5440, roughness: 0.92, normalMap: normalMapFrom(molle, 1.4) }),
      strap: cloth(0x2c2e24),
      belt: cloth(0x3b3d30),
      gloveArmor: new THREE.MeshStandardMaterial({ color: 0x24251f, roughness: 0.5 }),
      pad: new THREE.MeshStandardMaterial({ color: 0x2a2b26, roughness: 0.55 }),
      sole: new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.95 }),
      helmet: new THREE.MeshStandardMaterial({ color: 0x8c7b5a, roughness: 0.8, normalMap: leatherNormal }),
      helmetEdge: new THREE.MeshStandardMaterial({ color: 0x2b2b26, roughness: 0.6 }),
      headset: new THREE.MeshStandardMaterial({ color: 0x3c4031, roughness: 0.6 }),
      holster: new THREE.MeshStandardMaterial({ color: 0x1d1e1b, roughness: 0.45 }),
      mag: new THREE.MeshStandardMaterial({ color: 0x1a1a1b, roughness: 0.5 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.35, metalness: 0.8 }),
      patch: new THREE.MeshStandardMaterial({ color: 0x5a6a45, roughness: 0.9 }),
      red: new THREE.MeshStandardMaterial({ color: 0x8a1a1a, roughness: 0.8 }),
      knit: new THREE.MeshStandardMaterial({ color: 0x2a2c2a, roughness: 1, normalMap: normalMapFrom(knit, 2) }),
    };
  }
  const camoOpt = lookOption('camo', look.camo);
  const colors = camoOpt.colors ?? [0xa89a78];
  const camoTex = camoTexture(colors);
  camoTex.repeat.set(2, 2);
  const skinTone = lookOption('skin', look.skin).colors![0];
  const hairColor = lookOption('hair', look.hair).colors![0];
  const base = humanMaterials();
  const skin = base.skin.clone();
  skin.color.setHex(skinTone);
  const lips = base.lips.clone();
  lips.color.setHex(skinTone).multiplyScalar(0.82).lerp(new THREE.Color(0x9a4a44), 0.35);
  const hair = base.hair.clone();
  hair.color.setHex(hairColor);
  // Stubble: skin darkened towards the hair colour.
  const stubble = new THREE.MeshStandardMaterial({ color: new THREE.Color(skinTone).multiplyScalar(0.9).lerp(new THREE.Color(hairColor), 0.22), map: stubbleTex, roughness: 0.9 });
  const gloveOpt = lookOption('gloves', look.gloves);
  const glove = look.gloves === 'none' ? skin
    : new THREE.MeshStandardMaterial({ color: gloveOpt.colors![0], roughness: 0.75, normalMap: leatherNormal, normalScale: new THREE.Vector2(0.8, 0.8) });
  const boot = new THREE.MeshStandardMaterial({ color: lookOption('boots', look.boots).colors![0], roughness: 0.85, normalMap: leatherNormal });
  const camo = new THREE.MeshStandardMaterial({ color: 0xffffff, map: camoTex, normalMap: weaveNormal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.9 });
  const capColor = new THREE.MeshStandardMaterial({ color: new THREE.Color(colors[0]).multiplyScalar(0.85), roughness: 0.85, normalMap: weaveNormal });
  const brow = hair.clone();
  const mats: SoldierMaterials = { ...shared, camo, skin, lips, hair, brow, stubble, glove, boot, capColor };
  perLook.set(key, mats);
  return mats;
}

type ClothMats = { top: THREE.Material; bottom: THREE.Material; accent: THREE.Material; shoes: THREE.Material };

/** Guest clothing details: a dress's skirt, a blazer's lapels, shirt front and tie, a belt. */
function civilianDetails(
  builder: OutfitBuilder, c: CivilianStyle, cm: ClothMats,
  at: { hips: THREE.Vector3; spine1: THREE.Vector3; spine2: THREE.Vector3; neck: THREE.Vector3 },
  L: (name: string) => number, mats: SoldierMaterials,
): void {
  const m4 = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  const { hips, spine1, spine2, neck } = at;
  if (c.top === 'dress') {
    // Skirt flaring from the hips to just above the knee.
    const H = L('Hips');
    builder.tube([
      { p: hips.clone().add(new THREE.Vector3(0, 0.05, 0)), rx: 0.165, rz: 0.12, bone: H },
      { p: hips.clone().add(new THREE.Vector3(0, -0.12, 0)), rx: 0.2, rz: 0.15, bone: H },
      { p: hips.clone().add(new THREE.Vector3(0, -0.36, 0.01)), rx: 0.24, rz: 0.19, bone: H },
    ], new THREE.Vector3(0, 0, -1), cm.top);
    const hem = new THREE.TorusGeometry(1, 0.012, 6, 32);
    hem.rotateX(Math.PI / 2);
    hem.scale(0.24, 1, 0.19);
    builder.rigid(hem, cm.top, m4(hips.x, hips.y - 0.36, hips.z + 0.01), H);
    if (c.accent) {
      const sash = new THREE.CylinderGeometry(1, 1, 0.04, 28, 1, true);
      sash.scale(0.162, 1, 0.12);
      builder.rigid(sash, cm.accent, m4(spine1.x, spine1.y - 0.04, spine1.z), L('Spine1'), true);
    }
    return;
  }
  // Belt with a buckle.
  const belt = new THREE.CylinderGeometry(1, 1, 0.035, 28, 1, true);
  belt.scale(0.163, 1, 0.122);
  builder.rigid(belt, mats.belt, m4(hips.x, hips.y + 0.03, hips.z), L('Hips'), true);
  builder.rigid(new RoundedBoxGeometry(0.04, 0.028, 0.01, 2, 0.003), mats.metal, m4(hips.x, hips.y + 0.03, hips.z - 0.125), L('Hips'));
  if (c.top === 'blazer') {
    // Open jacket: shirt front and tie down the middle, lapels either side, a pocket square.
    const S2 = L('Spine2');
    const front = spine2.z - 0.128;
    builder.rigid(new THREE.BoxGeometry(0.075, 0.3, 0.008), cm.accent, m4(spine2.x, (spine2.y + neck.y) / 2 - 0.05, front, -0.08), S2);
    builder.rigid(new THREE.BoxGeometry(0.03, 0.26, 0.01), mats.helmetEdge, m4(spine2.x, (spine2.y + neck.y) / 2 - 0.06, front - 0.006, -0.08), S2);
    for (const sx of [-1, 1]) {
      builder.rigid(new THREE.BoxGeometry(0.06, 0.24, 0.012), cm.top, m4(spine2.x + sx * 0.055, (spine2.y + neck.y) / 2 - 0.02, front - 0.004, -0.1, 0, sx * -0.25), S2);
    }
    builder.rigid(new THREE.BoxGeometry(0.035, 0.018, 0.006), cm.accent, m4(spine2.x - 0.09, spine2.y + 0.03, front - 0.008, -0.08), S2);
  } else if (c.top === 'shirt') {
    // Button placket.
    builder.rigid(new THREE.BoxGeometry(0.02, 0.4, 0.006), cm.top, m4(spine1.x, spine1.y + 0.08, spine2.z - 0.124, -0.05), L('Spine2'));
  }
  if (c.hiVis) {
    // A hi-vis vest just proud of the top, open at the arms, with two reflective bands and braces over the shoulders.
    const S1 = L('Spine1'), S2 = L('Spine2');
    builder.tube([
      { p: hips.clone().add(new THREE.Vector3(0, 0.02, 0)), rx: 0.172, rz: 0.13, bone: L('Hips') },
      { p: spine1, rx: 0.172, rz: 0.128, bone: S1 },
      { p: spine2, rx: 0.19, rz: 0.138, bone: S2 },
      { p: spine2.clone().lerp(neck, 0.45), rx: 0.165, rz: 0.12, bone: S2 },
    ], new THREE.Vector3(0, 0, -1), cm.accent);
    for (const [at, bone, rx, rz] of [[hips.clone().lerp(spine1, 0.55), L('Spine'), 0.174, 0.132], [spine1.clone().lerp(spine2, 0.55), S2, 0.184, 0.136]] as const) {
      const band = new THREE.CylinderGeometry(1, 1, 0.045, 28, 1, true);
      band.scale(rx + 0.003, 1, rz + 0.003);
      builder.rigid(band, mats.metal, m4(at.x, at.y, at.z), bone, true);
    }
    for (const sx of [-1, 1]) {
      builder.rigid(new THREE.BoxGeometry(0.035, 0.2, 0.28), mats.metal, m4(spine2.x + sx * 0.09, (spine2.y + neck.y) / 2 + 0.01, spine2.z), S2);
    }
  }
}

/**
 * Crowd colouring: a guest's body is built with placeholder "role" materials (skin, top, hair...),
 * merged into one mesh carrying each vertex's role, and drawn with a material that looks the role up
 * in that guest's own palette. One draw call per guest, and bodies shared between guests.
 */
const ROLE_NAMES = ['skin', 'hair', 'lips', 'top', 'bottom', 'accent', 'shoes', 'sole', 'belt', 'metal', 'dark', 'cap', 'eyeWhite', 'iris', 'pupil', 'stubble'] as const;
type Role = (typeof ROLE_NAMES)[number];
const ROLE = Object.fromEntries(ROLE_NAMES.map(n => [n, new THREE.MeshStandardMaterial({ name: `role:${n}` })])) as Record<Role, THREE.MeshStandardMaterial>;
const ROLE_MATS_SOLDIER = {
  skin: ROLE.skin, hair: ROLE.hair, brow: ROLE.hair, lips: ROLE.lips, stubble: ROLE.stubble, sole: ROLE.sole, belt: ROLE.belt,
  metal: ROLE.metal, helmetEdge: ROLE.dark, capColor: ROLE.cap,
};
const ROLE_MATS_CIV = { top: ROLE.top, bottom: ROLE.bottom, accent: ROLE.accent, shoes: ROLE.shoes };

/** A guest's palette, indexed like ROLE_NAMES. */
export function crowdPalette(look: CharacterLook, civ: CivilianStyle): THREE.Color[] {
  const skin = new THREE.Color(lookOption('skin', look.skin).colors![0]);
  const hair = new THREE.Color(lookOption('hair', look.hair).colors![0]);
  const c = (hex: number) => new THREE.Color(hex);
  const byRole: Record<Role, THREE.Color> = {
    skin, hair, lips: skin.clone().multiplyScalar(0.82).lerp(c(0x9a4a44), 0.35), top: c(civ.topColor),
    bottom: c(civ.top === 'dress' ? civ.topColor : civ.bottomColor), accent: c(civ.accent ?? 0xf2f2f2), shoes: c(civ.shoes), sole: c(0x2a2620),
    belt: c(0x1d1a17), metal: c(0x9a9a9a), dark: c(0x141416), cap: c(civ.topColor).multiplyScalar(0.85), eyeWhite: c(0xf2eeea),
    iris: c(0x4a6b3a), pupil: c(0x050505), stubble: skin.clone().lerp(hair, 0.55),
  };
  return ROLE_NAMES.map(n => byRole[n]);
}

/** One material per guest: picks each vertex's colour from the guest's palette. */
export function crowdMaterial(palette: THREE.Color[]): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 });
  m.onBeforeCompile = shader => {
    shader.uniforms.palette = { value: palette };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float role;\nuniform vec3 palette[${ROLE_NAMES.length}];\nvarying vec3 vRoleColor;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoleColor = palette[int(role + 0.5)];');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoleColor;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vRoleColor, opacity );');
  };
  m.customProgramCacheKey = () => 'crowd-palette';
  return m;
}

const singleCache = new WeakMap<object, { geometry: THREE.BufferGeometry; material: THREE.Material }>();
const placeholder = crowdMaterial(ROLE_NAMES.map(() => new THREE.Color(0x888888)));

/** Merges a guest's role-material pieces into one geometry, tagging each vertex with its role. */
function singleMesh(parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[]): { geometry: THREE.BufferGeometry; material: THREE.Material } {
  const cached = singleCache.get(parts);
  if (cached) return cached;
  const geos = parts.map(({ geometry, material }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    const role = Math.max(0, ROLE_NAMES.indexOf((material.name.replace('role:', '') || 'dark') as Role));
    g.setAttribute('role', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(role < 0 ? 10 : role), 1));
    return g;
  });
  const merged = { geometry: mergeVertices(mergeGeometries(geos)!, 1e-4), material: placeholder };
  singleCache.set(parts, merged);
  return merged;
}
