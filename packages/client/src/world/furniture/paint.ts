/** Canvas painters for procedural furniture textures. Each draws a square tile of side `s`. */
type G = CanvasRenderingContext2D;

const rand = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const specks = (g: G, s: number, n: number, color: string, size = 1) => {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) g.fillRect(Math.random() * s, Math.random() * s, size, size);
};

export const paint = {
  weave(g: G, s: number) {
    g.fillStyle = '#e9e6e0';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 2) {
      g.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.05})`;
      g.fillRect(i, 0, 1, s);
      g.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.04})`;
      g.fillRect(0, i, s, 1);
    }
  },

  leather(g: G, s: number) {
    g.fillStyle = '#f2ece6';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(60,40,30,${Math.random() * 0.12})`;
      g.beginPath();
      g.arc(Math.random() * s, Math.random() * s, 0.5 + Math.random() * 1.8, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(60,40,30,.08)';
    for (let i = 0; i < 25; i++) {
      g.beginPath();
      const x = Math.random() * s, y = Math.random() * s;
      g.moveTo(x, y);
      g.quadraticCurveTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30, x + (Math.random() - 0.5) * 50, y + (Math.random() - 0.5) * 50);
      g.stroke();
    }
  },

  velvet(g: G, s: number) {
    g.fillStyle = '#efefef';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y++) {
      g.fillStyle = `rgba(0,0,0,${0.03 + Math.sin(y * 0.4) * 0.02 + Math.random() * 0.03})`;
      g.fillRect(0, y, s, 1);
    }
  },

  woodGrain(g: G, s: number) {
    g.fillStyle = '#b8875a';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${60 + Math.random() * 40},${30 + Math.random() * 20},10,${0.08 + Math.random() * 0.15})`;
      g.lineWidth = 0.5 + Math.random() * 1.5;
      const y = Math.random() * s;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(s * 0.3, y + (Math.random() - 0.5) * 8, s * 0.7, y + (Math.random() - 0.5) * 8, s, y);
      g.stroke();
    }
  },

  marble(g: G, s: number) {
    g.fillStyle = '#f3f0ea';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = `rgba(110,105,100,${0.1 + Math.random() * 0.2})`;
      g.lineWidth = Math.random() * 1.8 + 0.3;
      g.beginPath();
      g.moveTo(Math.random() * s, 0);
      g.bezierCurveTo(Math.random() * s, s * 0.3, Math.random() * s, s * 0.7, Math.random() * s, s);
      g.stroke();
    }
  },

  stone(g: G, s: number) {
    g.fillStyle = '#dcd4c4';
    g.fillRect(0, 0, s, s);
    specks(g, s, 1800, 'rgba(0,0,0,.08)', 2);
    specks(g, s, 600, 'rgba(255,255,255,.12)', 2);
  },

  frond(g: G, s: number) {
    g.clearRect(0, 0, s, s);
    // A central rib with leaflets angled outwards; the texture runs along v (base at the bottom).
    g.strokeStyle = '#5b6b2a';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(s / 2, s);
    g.lineTo(s / 2, 0);
    g.stroke();
    for (let y = 4; y < s; y += 5) {
      const len = (s / 2 - 4) * Math.sin((y / s) * Math.PI) + 6;
      for (const dir of [-1, 1]) {
        g.strokeStyle = `hsl(${95 + Math.random() * 20}, ${40 + Math.random() * 15}%, ${22 + Math.random() * 12}%)`;
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(s / 2, y + 3);
        g.lineTo(s / 2 + dir * len, y - 6);
        g.stroke();
      }
    }
  },

  foliage(g: G, s: number) {
    g.fillStyle = '#3d6b2d';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `hsla(${90 + Math.random() * 30}, 45%, ${18 + Math.random() * 25}%, .8)`;
      g.beginPath();
      g.arc(Math.random() * s, Math.random() * s, 1.5 + Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
  },

  bark(g: G, s: number) {
    g.fillStyle = '#8a6f4e';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 6) {
      g.fillStyle = `rgba(40,25,10,${0.25 + Math.random() * 0.2})`;
      g.fillRect(0, y, s, 2);
    }
    specks(g, s, 300, 'rgba(0,0,0,.15)', 2);
  },

  ripples(g: G, s: number) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(120,190,230,${0.2 + Math.random() * 0.3})`;
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      const x = Math.random() * s;
      const y = Math.random() * s;
      g.ellipse(x, y, 6 + Math.random() * 20, 3 + Math.random() * 8, Math.random() * Math.PI, 0, Math.PI * 2);
      g.stroke();
    }
  },

  streaks(g: G, s: number) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * s;
      const grd = g.createLinearGradient(0, 0, 0, s);
      const a = 0.4 + Math.random() * 0.6;
      grd.addColorStop(0, `rgba(255,255,255,${a})`);
      grd.addColorStop(Math.random(), 'rgba(255,255,255,0.1)');
      grd.addColorStop(1, `rgba(255,255,255,${a})`);
      g.fillStyle = grd;
      g.fillRect(x, 0, 1 + Math.random() * 2, s);
    }
  },

  books(g: G, s: number) {
    g.fillStyle = '#2a1a0e';
    g.fillRect(0, 0, s, s);
    const colors = ['#7b1e1e', '#1e3a7b', '#1e6b3a', '#a67c1e', '#5a1e6b', '#d9d0b8', '#2b2b2b', '#8a4a1e', '#3a5a6a', '#6a2a3a'];
    const shelf = s / 5;
    for (let r = 0; r < 5; r++) {
      let x = 3;
      while (x < s - 6) {
        const w = 4 + Math.random() * 8;
        const h = shelf * (0.62 + Math.random() * 0.3);
        const bottom = (r + 1) * shelf - 5;
        g.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        if (Math.random() < 0.06) {
          // a book leaning over
          g.save();
          g.translate(x, bottom);
          g.rotate(-0.35);
          g.fillRect(0, -h, w, h);
          g.restore();
          x += w + 6;
          continue;
        }
        g.fillRect(x, bottom - h, w, h);
        g.fillStyle = 'rgba(255,215,120,.5)';
        g.fillRect(x + 1, bottom - h * 0.8, w - 2, 1);
        g.fillRect(x + 1, bottom - h * 0.25, w - 2, 1);
        x += w + 0.5;
      }
      g.fillStyle = '#4a3020';
      g.fillRect(0, (r + 1) * shelf - 5, s, 5);
    }
  },

  bottles(g: G, s: number) {
    g.fillStyle = '#1d140c';
    g.fillRect(0, 0, s, s);
    const n = 8;
    const c = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = i * c + c / 2;
      const y = j * c + c / 2;
      g.fillStyle = '#3b2616';
      g.fillRect(i * c, j * c, c, 2);
      g.fillStyle = Math.random() < 0.7 ? '#2a0c10' : '#16301a';
      g.beginPath();
      g.arc(x, y, c * 0.36, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = Math.random() < 0.5 ? '#c9a24a' : '#8a1f1f';
      g.beginPath();
      g.arc(x, y, c * 0.14, 0, Math.PI * 2);
      g.fill();
    }
  },

  rug(g: G, s: number, style: number) {
    const palettes = [
      ['#7a1f24', '#e6d3a8', '#1f3a5a', '#c9a24a'],
      ['#e8e1d4', '#8c8577', '#c9bfae', '#5a5248'],
      ['#1f3a5a', '#d9c8a0', '#7a1f24', '#e8e1d4'],
      ['#3b4a3a', '#d8cfb8', '#8a6a3a', '#2a2a2a'],
    ];
    const [bg, fg, accent, edge] = palettes[style % palettes.length];
    g.fillStyle = edge;
    g.fillRect(0, 0, s, s);
    g.fillStyle = bg;
    g.fillRect(s * 0.06, s * 0.06, s * 0.88, s * 0.88);
    g.strokeStyle = fg;
    g.lineWidth = s * 0.012;
    g.strokeRect(s * 0.1, s * 0.1, s * 0.8, s * 0.8);
    g.strokeRect(s * 0.14, s * 0.14, s * 0.72, s * 0.72);
    if (style === 1) {
      // modern: soft stripes
      for (let i = 0; i < 9; i++) {
        g.fillStyle = i % 2 ? fg : accent;
        g.globalAlpha = 0.35;
        g.fillRect(s * 0.18, s * (0.18 + i * 0.07), s * 0.64, s * 0.03);
      }
      g.globalAlpha = 1;
      return;
    }
    // traditional: central medallion and repeating motifs
    g.fillStyle = accent;
    g.beginPath();
    g.ellipse(s / 2, s / 2, s * 0.18, s * 0.26, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = fg;
    g.beginPath();
    g.ellipse(s / 2, s / 2, s * 0.09, s * 0.14, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = accent;
    for (let i = 0; i < 4; i++) {
      const [x, y] = [[0.24, 0.24], [0.76, 0.24], [0.24, 0.76], [0.76, 0.76]][i];
      g.beginPath();
      g.arc(s * x, s * y, s * 0.05, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = fg;
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      g.fillRect(s * (0.08 + t * 0.84), s * 0.075, s * 0.012, s * 0.012);
      g.fillRect(s * (0.08 + t * 0.84), s * 0.915, s * 0.012, s * 0.012);
    }
  },

  medallion(g: G, s: number) {
    g.clearRect(0, 0, s, s);
    const c = s / 2;
    const rings: [number, string][] = [[0.49, '#2b2b2b'], [0.46, '#efe9df'], [0.42, '#8a6a3a'], [0.4, '#efe9df'], [0.3, '#2b2b2b'], [0.27, '#d9c39a']];
    for (const [r, col] of rings) {
      g.fillStyle = col;
      g.beginPath();
      g.arc(c, c, s * r, 0, Math.PI * 2);
      g.fill();
    }
    // compass star
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const long = i % 2 === 0;
      g.fillStyle = long ? '#2b2b2b' : '#8a6a3a';
      g.beginPath();
      g.moveTo(c + Math.cos(a) * s * (long ? 0.39 : 0.28), c + Math.sin(a) * s * (long ? 0.39 : 0.28));
      g.lineTo(c + Math.cos(a + 0.18) * s * 0.06, c + Math.sin(a + 0.18) * s * 0.06);
      g.lineTo(c + Math.cos(a - 0.18) * s * 0.06, c + Math.sin(a - 0.18) * s * 0.06);
      g.fill();
    }
    g.fillStyle = '#efe9df';
    g.beginPath();
    g.arc(c, c, s * 0.04, 0, Math.PI * 2);
    g.fill();
  },

  art(g: G, s: number, seed: number) {
    const r = rand(seed * 7919 + 13);
    const hue = Math.floor(r() * 360);
    const style = seed % 3;
    g.fillStyle = `hsl(${hue},35%,${style === 1 ? 85 : 22}%)`;
    g.fillRect(0, 0, s, s);
    if (style === 0) {
      for (let i = 0; i < 18; i++) {
        g.fillStyle = `hsla(${(hue + r() * 140) % 360},60%,${35 + r() * 45}%,.75)`;
        g.beginPath();
        g.arc(r() * s, r() * s, 8 + r() * 45, 0, Math.PI * 2);
        g.fill();
      }
    } else if (style === 1) {
      // color-field blocks
      for (let i = 0; i < 3; i++) {
        g.fillStyle = `hsl(${(hue + i * 40) % 360},55%,${40 + i * 12}%)`;
        g.fillRect(s * 0.1, s * (0.1 + i * 0.28), s * 0.8, s * 0.22);
      }
    } else {
      // landscape: sky, hills, sun
      const grd = g.createLinearGradient(0, 0, 0, s);
      grd.addColorStop(0, `hsl(${hue},55%,70%)`);
      grd.addColorStop(1, `hsl(${(hue + 30) % 360},45%,85%)`);
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
      g.fillStyle = `hsl(${(hue + 180) % 360},30%,35%)`;
      g.beginPath();
      g.moveTo(0, s * 0.7);
      for (let x = 0; x <= s; x += s / 8) g.lineTo(x, s * (0.55 + r() * 0.2));
      g.lineTo(s, s);
      g.lineTo(0, s);
      g.fill();
      g.fillStyle = '#fff3c4';
      g.beginPath();
      g.arc(s * 0.72, s * 0.3, s * 0.08, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#c9a24a';
    g.lineWidth = s * 0.06;
    g.strokeRect(0, 0, s, s);
    g.strokeStyle = '#7a5a20';
    g.lineWidth = 2;
    g.strokeRect(s * 0.03, s * 0.03, s * 0.94, s * 0.94);
  },

  serverFace(g: G, s: number) {
    g.fillStyle = '#1b1e23';
    g.fillRect(0, 0, s, s);
    for (let r = 0; r < 20; r++) {
      g.fillStyle = r % 4 === 0 ? '#2c3138' : '#24282e';
      g.fillRect(4, r * 6.4 + 1, s - 8, 5);
      g.fillStyle = '#111316';
      for (let k = 0; k < 12; k++) g.fillRect(40 + k * 6, r * 6.4 + 2, 4, 3);
    }
  },

  serverLeds(g: G, s: number) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    for (let r = 0; r < 20; r++) {
      for (let k = 0; k < 4; k++) {
        const v = Math.random();
        g.fillStyle = v < 0.6 ? '#2bff7a' : v < 0.85 ? '#3aa0ff' : '#ffb020';
        g.fillRect(10 + k * 6, r * 6.4 + 3, 2, 2);
      }
    }
  },

  money(g: G, s: number) {
    g.fillStyle = '#c9d6b8';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#5f7a4a';
    g.fillRect(0, s * 0.42, s, s * 0.16);
    g.fillStyle = 'rgba(40,70,40,.35)';
    for (let y = 0; y < s; y += 3) g.fillRect(0, y, s, 1);
  },

  net(g: G, s: number) {
    g.clearRect(0, 0, s, s);
    g.strokeStyle = '#111';
    g.lineWidth = 2;
    for (let i = 0; i <= s; i += 8) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke();
    }
  },
};
