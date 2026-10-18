// Runs inside the game page (see coverage.cjs): simulates the guard patrols and cameras for two
// minutes, then works out, for every walkable spot on a 1 m grid, how long a crouched, motionless
// player there would last before being spotted, using the same formulas as GuardManager. Returns
// per-floor heat maps (data URLs) and summary stats as JSON.
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  localStorage.removeItem('gungame.campaign.mansion.checkpoint');
  void game.startMatch({ mode: 'campaign', difficulty: window.DIFFICULTY || 'normal', missionId: 'mansion' });
  for (let i = 0; i < 100; i++) { await wait(150); if (document.getElementById('missionLoading').classList.contains('ready')) break; }
  await wait(300); dispatchEvent(new MouseEvent('mousedown')); await wait(400);
  game.cutsceneTime = 999; await wait(1000);
  game.state = 'paused';
  const m = game.mode.script, gm = m.guards, w = game.world, nav = w.nav;
  const V = game.gfx.camera.position.constructor;
  const t0 = performance.now();
  // Simulate patrols with simulated time (head scans read performance.now()).
  const realNow = performance.now.bind(performance); let simT = 0;
  performance.now = () => simT * 1000;
  gm.perceive = () => {}; gm.cameras = () => {};
  game.gfx.camera.position.set(0, 8, -6);
  const FR = 120, STEP = 0.1;
  const frames = [];
  const sec = w.security;
  const cams = sec.cams.map((c, i) => ({ c, i })).filter(({ c }) => !sec.ignored.has(c.def.id));
  for (let f = 0; f < FR; f++) {
    for (let s = 0; s < 10; s++) { simT += STEP; gm.update(STEP); sec.update(STEP); w.doors.update(STEP); }
    frames.push({
      guards: gm.guards.filter(g => g.alive).map(g => { const e = g.eye, fc = g.facing; return [e.x, e.y, e.z, fc.x, fc.z, g.seated ? 1 : 0]; }),
      cams: cams.map(({ c }) => { c.view.updateMatrixWorld(); return [c.view.getWorldPosition(new V()), c.view.matrixWorldInverse.clone(), c.view.projectionMatrix.clone()]; }),
    });
  }
  performance.now = realNow;
  const tSim = realNow() - t0;
  // Sample points: nav nodes on a 1 m grid.
  const pts = [];
  for (let n = 0; n < nav.nodeCount; n++) {
    const x = nav.pos[n * 3], y = nav.pos[n * 3 + 1], z = nav.pos[n * 3 + 2];
    if (Math.round((x - nav.minX) / nav.cell) % 2 || Math.round((z - nav.minZ) / nav.cell) % 2) continue;
    pts.push([x, y, z]);
  }
  const VIEW = 58 * Math.PI / 180, RANGE = 19, chestH = 0.75, CAM_RANGE = 26;
  const ttd = new Float32Array(pts.length).fill(Infinity);
  const watched = new Float32Array(pts.length);
  const from = new V(), to = new V(), ndc = new V();
  const nG = frames[0].guards.length;
  for (let p = 0; p < pts.length; p++) {
    const [x, y, z] = pts[p];
    to.set(x, y + chestH, z);
    const aw = new Float32Array(nG); let camM = new Float32Array(cams.length);
    let seenFrames = 0;
    for (let f = 0; f < FR && ttd[p] === Infinity; f++) {
      const fr = frames[f]; let seen = false;
      for (let g = 0; g < fr.guards.length; g++) {
        const [ex, ey, ez, fx, fz, seated] = fr.guards[g];
        const dx = x - ex, dy = to.y - ey, dz = z - ez;
        const d = Math.hypot(dx, dy, dz);
        let rate = 0;
        if (d < RANGE) {
          const fl = Math.hypot(dx, dz) || 1;
          const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / fl)));
          const vert = Math.abs(Math.atan2(dy, fl));
          if ((ang < VIEW && vert < 1.0) || d < 2.2) {
            from.set(ex, ey, ez);
            if (w.clearLine(from, to)) {
              const centre = 1 - (ang / VIEW) * 0.5;
              rate = 2.2 / (0.3 + (d / 6) ** 2) * centre * 0.55 * 0.85 * (seated ? 0.6 : 1) * 0.7 * gm.diff.stealth.perception;
            }
          }
        }
        if (rate > 0) { seen = true; aw[g] += rate; if (aw[g] >= 1) { ttd[p] = f + 1 - (aw[g] - 1) / rate; break; } }
        else aw[g] = Math.max(0, aw[g] - 0.12);
      }
      for (let c = 0; c < cams.length && ttd[p] === Infinity; c++) {
        const [cp, inv, proj] = fr.cams[c];
        const d = cp.distanceTo(to);
        let rate = 0;
        if (d < CAM_RANGE) {
          ndc.copy(to).applyMatrix4(inv).applyMatrix4(proj);
          if (Math.abs(ndc.x) < 0.9 && Math.abs(ndc.y) < 0.9 && ndc.z > -1 && ndc.z < 1 && w.clearLine(cp, to)) rate = 0.95 / (0.6 + d * 0.09) * 0.6 * gm.diff.stealth.perception;
        }
        if (rate > 0) { seen = true; camM[c] += rate; if (camM[c] >= 1) { ttd[p] = f + 1; } }
        else camM[c] = Math.max(0, camM[c] - 0.25);
      }
      if (seen) seenFrames++;
    }
    watched[p] = seenFrames;
  }
  const tAn = realNow() - t0 - tSim;
  // Draw a map per floor.
  const floors = [['basement', 0], ['ground', 4.2], ['second', 8.4], ['third', 12.6], ['roof', 16.8]];
  const PX = 8, X0 = -50, Z0 = -50, W = 100 * PX, H = 108 * PX;
  const out = {};
  const stats = {};
  const routes = gm.guards.map(g => ({ id: g.id, def: g.def }));
  for (const [name, fy] of floors) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
    const P = (x, z) => [(x - X0) * PX, (z - Z0) * PX];
    const onFloor = y => y >= fy - 0.6 && y < fy + 3.9;
    let n = 0, red = 0, safe = 0;
    for (let p = 0; p < pts.length; p++) {
      const [x, y, z] = pts[p]; if (!onFloor(y)) continue;
      n++;
      const t = ttd[p];
      let col;
      if (t <= 3) { col = '#e0302a'; red++; } else if (t <= 8) col = '#f08a24'; else if (t <= 20) col = '#e8d23a'; else if (t < Infinity) col = '#4f9e4a';
      else if (watched[p] > 0) col = '#2d6b4f'; else { col = '#22324a'; safe++; }
      g.fillStyle = col; const [px, pz] = P(x, z); g.fillRect(px - 4, pz - 4, 8, 8);
    }
    // Walls at chest height on this floor.
    g.fillStyle = 'rgba(220,220,220,0.85)';
    for (const b of w.colliders) {
      const h = fy + 1.2;
      if (b.min.y > h || b.max.y < h) continue;
      if (b.max.x - b.min.x > 40 && b.max.z - b.min.z > 40) continue;
      const [ax, az] = P(b.min.x, b.min.z), [bx, bz] = P(b.max.x, b.max.z);
      g.fillRect(ax, az, Math.max(1, bx - ax), Math.max(1, bz - az));
    }
    // Guards: routes and posts.
    g.font = 'bold 12px sans-serif';
    for (const r of routes) {
      const d = r.def; if (!onFloor(d.y)) continue;
      g.strokeStyle = '#ff6bff'; g.lineWidth = 2;
      if (d.route?.length) { g.beginPath(); d.route.forEach((q, i) => { const [px, pz] = P(q.x, q.z); i ? g.lineTo(px, pz) : g.moveTo(px, pz); }); g.closePath(); g.stroke(); }
      const [px, pz] = P(d.x, d.z); g.fillStyle = '#ff6bff'; g.beginPath(); g.arc(px, pz, 5, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.fillText(r.id, px + 7, pz - 6);
    }
    for (const { c } of cams) {
      const cp = c.view.getWorldPosition(new V()); if (!onFloor(cp.y - 2.5)) continue;
      const [px, pz] = P(cp.x, cp.z); g.fillStyle = '#5ad1ff'; g.fillRect(px - 5, pz - 5, 10, 10);
      g.fillStyle = '#5ad1ff'; g.fillText('cam ' + c.def.id, px + 7, pz + 14);
    }
    for (const pr of w.map.props) {
      if (!['clue', 'hostage', 'marker', 'door', 'weaponPickup'].includes(pr.kind) || !onFloor(pr.y - (pr.kind === 'marker' && pr.id === 'terminal' ? 1 : 0))) continue;
      const [px, pz] = P(pr.x, pr.z); g.fillStyle = pr.kind === 'clue' ? '#ffffff' : pr.kind === 'hostage' ? '#00ff9c' : pr.kind === 'door' ? '#c08040' : pr.kind === 'weaponPickup' ? '#ffd166' : '#9cf';
      g.beginPath(); g.arc(px, pz, 7, 0, 7); g.fill(); g.fillStyle = '#000'; g.fillText((pr.id ?? pr.weapon ?? '').slice(0, 3), px - 9, pz + 4);
      g.fillStyle = '#fff'; g.fillText(pr.id ?? pr.weapon ?? '', px + 9, pz + 16);
    }
    g.fillStyle = '#fff'; g.font = 'bold 22px sans-serif'; g.fillText(`${name}  (red ≤3s, orange ≤8s, yellow ≤20s, green slow/glimpsed, blue never seen)`, 12, 28);
    out[name] = cv.toDataURL('image/png');
    stats[name] = { points: n, red: +(red / n).toFixed(2), unseen: +(safe / n).toFixed(2) };
  }
  return JSON.stringify({ tSim: Math.round(tSim), tAn: Math.round(tAn), pts: pts.length, stats, images: out });
})()
