'use strict';
// Model projektu: kondygnacje, ściany, pokoje, otwory, obiekty + historia zmian.
// Jednostki: centymetry. Plan: x w prawo, y w dół.
window.App = window.App || {};
(function (App) {
  App.uid = () => Math.random().toString(36).slice(2, 10);

  const listeners = {};
  App.on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  App.emit = (ev, ...args) => { (listeners[ev] || []).forEach(fn => fn(...args)); };

  // ---------- Domyślne parametry narzędzi ----------
  App.defaults = {
    wall: { thickness: 24, height: 0 },
    room: { name: 'Pokój', makeWalls: true, thickness: 24 },
    door: { width: 90, height: 210 },
    window: { width: 120, height: 150, sill: 90, gable: false },
    roofwin: { width: 78, length: 118 },
    dormer: { width: 300, height: 140, roof: 'shed', pitch: 12, windows: 2, flush: false },
    stairs: { shape: 'straight', width: 100, length: 300, steps: 16 },
    chimney: { width: 60, depth: 60, above: 100 },
    furniture: { type: 'sofa' },
    garden: { type: 'treeLeaf' },
    plot: { color: '#9fc46f' },
    path: { kind: 'chodnik', mode: 'strip', width: 120 },
    fence: { style: 'panel', h: 150, base: 20, span: 250, color: '#3a3d42' },
    install: { type: 'socket' },
    roof: { type: 'gable', pitch: 35, overhang: 50, raise: 0, color: '#8f3b2c' },
  };
  try {
    const d = JSON.parse(localStorage.getItem('planer.defaults'));
    if (d) for (const k in App.defaults) Object.assign(App.defaults[k], d[k] || {});
  } catch (e) { /* brak zapisanych ustawień */ }
  App.saveDefaults = () => {
    try { localStorage.setItem('planer.defaults', JSON.stringify(App.defaults)); } catch (e) { /* ignoruj */ }
  };

  App.ROOM_COLORS = ['#f1e4c8', '#dbe7f3', '#e3efd9', '#f5dede', '#ece3f3', '#f6ecd0', '#dff0ee', '#e8e8e8'];

  // ---------- Projekt ----------
  // attic – poddasze: dachy tej kondygnacji opierają się na jej podłodze (+ ścianka kolankowa), ściany ścina połać.
  App.newLevel = (name, height) => ({
    id: App.uid(), name, height, attic: false, walls: [], rooms: [], openings: [], objects: [], roofs: [], installs: [],
    plots: [], paths: [], fences: [],
  });
  // plots – działki, paths – nawierzchnie (chodnik, podjazd, taras…), fences – ogrodzenia; leżą na terenie,
  // zapisywane na kondygnacji na poziomie terenu (parter).
  const LISTS = ['walls', 'rooms', 'openings', 'objects', 'roofs', 'installs', 'plots', 'paths', 'fences'];
  App.LISTS = LISTS;

  App.newProject = () => ({
    version: 1,
    name: 'Nowy projekt',
    current: 0,
    ground: 0, // indeks kondygnacji na poziomie terenu – niższe to piwnice
    lift: 0, // podniesienie parteru nad teren [cm]
    settings: {
      grid: 10, dims: true, show3d: 'all', roofs3d: true, wallColor: '#f2eee6',
    },
    levels: [App.newLevel('Parter', 270)],
  });

  function normalize(p) {
    const base = App.newProject();
    const old = p.settings || {};
    p.settings = Object.assign(base.settings, old);
    if ('hideAbove' in old) {
      if (!old.show3d) p.settings.show3d = old.hideAbove ? 'upto' : 'all';
      delete p.settings.hideAbove;
    }
    if (!Array.isArray(p.levels) || !p.levels.length) p.levels = base.levels;
    p.levels.forEach(l => {
      LISTS.forEach(k => { l[k] = Array.isArray(l[k]) ? l[k] : []; });
      l.id = l.id || App.uid();
      l.height = +l.height || 270;
      l.attic = !!l.attic;
    });
    // Starsze projekty miały jeden globalny dach – zamień go na dach nad najwyższą kondygnacją.
    if ('roof' in old) {
      const top = [...p.levels].reverse().find(l => l.walls.length);
      if (old.roof !== 'none' && top && !p.levels.some(l => l.roofs.length)) {
        const r = App.roofOverWalls(top, top.walls, { type: old.roof, pitch: old.roofPitch, overhang: old.roofOverhang, color: old.roofColor });
        if (r) top.roofs.push(r);
      }
      ['roof', 'roofPitch', 'roofOverhang', 'roofColor'].forEach(k => delete p.settings[k]);
    }
    p.current = Math.min(Math.max(0, p.current | 0), p.levels.length - 1);
    p.ground = Math.min(Math.max(0, p.ground | 0), p.levels.length - 1);
    p.lift = +p.lift || 0;
    p.textures = Array.isArray(p.textures) ? p.textures : [];
    p.models = Array.isArray(p.models) ? p.models : [];
    p.name = p.name || base.name;
    return p;
  }

  App.project = null;
  App.selection = null;

  App.level = () => App.project.levels[App.project.current];
  // Rzędna podłogi kondygnacji i względem terenu (0): kondygnacja ground (parter) leży na wysokości lift nad terenem,
  // niższe (piwnice) pod nią – przy podniesionym parterze piwnica częściowo wystaje ponad teren.
  App.elevation = (i) => {
    const p = App.project, g = p.ground || 0;
    let e = 0;
    for (let k = Math.min(i, g); k < Math.max(i, g); k++) e += p.levels[k].height;
    return (i < g ? -e : e) + (p.lift || 0);
  };

  // Obniżenie podłogi pokoju względem kondygnacji i: „na poziomie terenu” śledzi podniesienie parteru,
  // inaczej stała wartość drop.
  App.roomDrop = (r, i) => r.atGround ? Math.max(0, App.elevation(i)) : r.drop || 0;

  // Podłoga przy ścianie w miejscu t (cm od początku), względem podłogi kondygnacji:
  // base – najniższa podłoga pokoi przylegających w tym miejscu (pokój obniżony, np. garaż na poziomie terenu),
  // od niej liczą się otwory; foot – spód ściany: na parterze, gdy pod spodem nie ma piwnicy, ściana schodzi do
  // terenu (cokół).
  App.wallFloorAt = (lv, i, w, t) => {
    const f = App.wallFrame(w), c = { x: w.x1 + f.ux * t, y: w.y1 + f.uy * t }, off = w.t / 2 + 2;
    const sides = [-1, 1].map(sd => ({ x: c.x + f.nx * sd * off, y: c.y + f.ny * sd * off }));
    const drop = Math.max(0, ...lv.rooms.filter(r => sides.some(p => G.inside(p, r.pts))).map(r => App.roomDrop(r, i)));
    const elev = App.elevation(i), lower = App.project.levels[i - 1];
    const covered = !!lower && (lower.rooms.some(r => G.inside(c, r.pts)) ||
      lower.walls.some(x => G.project(c, { x: x.x1, y: x.y1 }, { x: x.x2, y: x.y2 }).d < x.t / 2 + 1));
    const toGround = i === (App.project.ground || 0) && elev - drop > 0 && !covered;
    return { base: -drop, foot: toGround ? -elev : -drop };
  };
  // Miejsca wzdłuż ściany, w których może się zmienić podłoga lub cokół (narożniki pokoi, końce ścian niżej).
  App.wallFloorBreaks = (lv, i, w) => {
    const f = App.wallFrame(w), lower = App.project.levels[i - 1];
    const pts = lv.rooms.flatMap(r => r.pts).concat(lower ? lower.rooms.flatMap(r => r.pts).concat(lower.walls.flatMap(x => [{ x: x.x1, y: x.y1 }, { x: x.x2, y: x.y2 }])) : []);
    return pts.filter(p => Math.abs((p.x - w.x1) * f.nx + (p.y - w.y1) * f.ny) < w.t + 30)
      .map(p => (p.x - w.x1) * f.ux + (p.y - w.y1) * f.uy).filter(t => t > 0.5 && t < f.L - 0.5);
  };
  // Podłoga pokoju: obniżenie i grubość płyty – na parterze bez piwnicy pod spodem płyta sięga do terenu.
  App.roomFloor = (i, r) => {
    const drop = App.roomDrop(r, i), elev = App.elevation(i), lower = App.project.levels[i - 1], c = G.centroid(r.pts);
    const onSoil = i === (App.project.ground || 0) && !(lower && lower.rooms.some(x => G.inside(c, x.pts)));
    const thick = onSoil && elev - drop > 10 ? elev - drop : i === 0 ? 10 : 22;
    return { drop, thick };
  };
  App.setLevel = (i) => {
    App.project.current = i;
    App.selection = null;
    App.save();
    App.emit('select');
    App.emit('change');
  };

  App.select = (id) => { App.selection = id; App.emit('select'); };

  App.find = (id, lv = App.level()) => {
    if (!id) return null;
    for (const kind of LISTS) {
      const obj = lv[kind].find(o => o.id === id);
      if (obj) return { kind: kind.slice(0, -1), obj };
    }
    return null;
  };

  App.removeById = (id) => {
    const lv = App.level();
    lv.walls = lv.walls.filter(w => w.id !== id);
    lv.rooms = lv.rooms.filter(r => r.id !== id);
    lv.objects = lv.objects.filter(o => o.id !== id);
    lv.roofs = lv.roofs.filter(o => o.id !== id);
    lv.openings = lv.openings.filter(o => o.id !== id && lv.walls.some(w => w.id === o.wallId));
    lv.installs = lv.installs.filter(o => o.id !== id && (!o.wallId || lv.walls.some(w => w.id === o.wallId)));
    ['plots', 'paths', 'fences'].forEach(k => { lv[k] = lv[k].filter(o => o.id !== id); });
  };

  // ---------- Historia (cofnij / ponów) i zapis ----------
  const undoStack = [], redoStack = [];
  // Snapshot do historii cofania – bez bibliotek tekstur i modeli 3D (duże dane; zmiany bibliotek nie są cofane).
  const LIBS = ['textures', 'models'];
  const noTextures = (k, v) => (LIBS.includes(k) ? undefined : v);
  App.snapshot = () => JSON.stringify(App.project, noTextures);
  App.commit = (before) => {
    if (before === App.snapshot()) return false;
    undoStack.push(before);
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
    App.changed();
    return true;
  };
  App.edit = (fn) => { const before = App.snapshot(); fn(); App.commit(before); };
  function restore(json) {
    const old = App.project;
    App.project = JSON.parse(json);
    LIBS.forEach(k => { App.project[k] = old[k]; });
    if (App.selection && !App.find(App.selection)) App.selection = null;
    App.changed();
    App.emit('select');
  }
  App.undo = () => { if (!undoStack.length) return; redoStack.push(App.snapshot()); restore(undoStack.pop()); };
  App.redo = () => { if (!redoStack.length) return; undoStack.push(App.snapshot()); restore(redoStack.pop()); };
  App.canUndo = () => undoStack.length > 0;
  App.canRedo = () => redoStack.length > 0;

  // Biblioteki tekstur i modeli 3D w IndexedDB (localStorage ma tylko ~5 MB) – zapisywane po zmianie biblioteki.
  let quotaWarned = false, libsReady = false;
  App.save = () => {
    try { localStorage.setItem('planer.project', App.snapshot()); } catch (e) { /* ignoruj */ }
  };
  const openDB = () => new Promise((res, rej) => {
    const r = indexedDB.open('planer', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('libs');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const warnQuota = () => {
    if (!quotaWarned) alert('Tekstury i modele 3D nie mieszczą się w pamięci przeglądarki – zapisz projekt do pliku (Zapisz), żeby ich nie stracić.');
    quotaWarned = true;
  };
  App.saveTextures = () => {
    if (!libsReady) return;
    const data = {};
    LIBS.forEach(k => { data[k] = App.project[k] || []; });
    openDB().then(db => {
      const tx = db.transaction('libs', 'readwrite');
      tx.objectStore('libs').put(data, 'current');
      tx.onerror = tx.onabort = warnQuota;
      // Stary zapis w localStorage już niepotrzebny.
      tx.oncomplete = () => { try { LIBS.forEach(k => localStorage.removeItem('planer.' + k)); } catch (e) { /* ignoruj */ } };
    }).catch(warnQuota);
  };
  // Wczytanie bibliotek po starcie; gdy w IndexedDB jeszcze nic nie ma, zostają te z localStorage (i są przenoszone).
  App.loadLibs = () => openDB().then(db => new Promise(res => {
    const r = db.transaction('libs').objectStore('libs').get('current');
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  })).catch(() => null).then(data => {
    libsReady = true;
    if (data) LIBS.forEach(k => { if (Array.isArray(data[k])) App.project[k] = data[k]; });
    else App.saveTextures();
    App.emit('change');
  });
  App.changed = () => { App.save(); App.emit('change'); };
  App.setProject = (p) => {
    App.project = normalize(p);
    App.saveTextures();
    undoStack.length = redoStack.length = 0;
    App.selection = null;
    App.changed();
    App.emit('select');
    App.emit('load');
  };
  App.loadSaved = () => {
    try {
      const s = localStorage.getItem('planer.project');
      if (s) {
        const p = JSON.parse(s);
        LIBS.forEach(k => { try { p[k] = JSON.parse(localStorage.getItem('planer.' + k)) || []; } catch (e) { p[k] = []; } });
        return normalize(p);
      }
    } catch (e) { /* uszkodzony zapis */ }
    return null;
  };

  // ---------- Geometria ----------
  const G = App.geom = {
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    project(p, a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      const t = L2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
      const tc = Math.max(0, Math.min(1, t));
      const x = a.x + dx * tc, y = a.y + dy * tc;
      return { t, tc, x, y, d: Math.hypot(p.x - x, p.y - y) };
    },
    area(pts) {
      let s = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        s += a.x * b.y - b.x * a.y;
      }
      return s / 2;
    },
    perimeter(pts) {
      let s = 0;
      for (let i = 0; i < pts.length; i++) s += G.dist(pts[i], pts[(i + 1) % pts.length]);
      return s;
    },
    centroid(pts) {
      const A = G.area(pts);
      if (Math.abs(A) < 1e-6) {
        return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
      }
      let cx = 0, cy = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], f = a.x * b.y - b.x * a.y;
        cx += (a.x + b.x) * f; cy += (a.y + b.y) * f;
      }
      return { x: cx / (6 * A), y: cy / (6 * A) };
    },
    inside(p, pts) {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c;
      }
      return c;
    },
    // Obiekt prostokątny: środek (x,y), l – wymiar wzdłuż lokalnej osi x, w – wzdłuż lokalnej osi y, rot w stopniach.
    local(o, a, b) {
      const r = o.rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
      return { x: o.x + c * a - s * b, y: o.y + s * a + c * b };
    },
    toLocal(o, p) {
      const r = o.rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), dx = p.x - o.x, dy = p.y - o.y;
      return { a: c * dx + s * dy, b: -s * dx + c * dy };
    },
    rectCorners(o) {
      const hl = o.l / 2, hw = o.w / 2;
      return [G.local(o, -hl, -hw), G.local(o, hl, -hw), G.local(o, hl, hw), G.local(o, -hl, hw)];
    },
  };

  const near = (x1, y1, x2, y2, eps = 0.5) => Math.abs(x1 - x2) <= eps && Math.abs(y1 - y2) <= eps;
  App.near = near;

  App.wallFrame = (w) => {
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L = Math.hypot(dx, dy) || 1e-6;
    const ux = dx / L, uy = dy / L;
    return { L, ux, uy, nx: -uy, ny: ux };
  };
  App.wallHeight = (lv, w) => w.h || lv.height;
  App.wallEndConnected = (lv, w, end) => {
    const x = end ? w.x2 : w.x1, y = end ? w.y2 : w.y1;
    return lv.walls.some(o => o !== w && (near(o.x1, o.y1, x, y, 1) || near(o.x2, o.y2, x, y, 1)));
  };
  App.wallPolygon = (lv, w) => {
    const f = App.wallFrame(w), h = w.t / 2;
    const e0 = App.wallEndConnected(lv, w, 0) ? h : 0, e1 = App.wallEndConnected(lv, w, 1) ? h : 0;
    const ax = w.x1 - f.ux * e0, ay = w.y1 - f.uy * e0, bx = w.x2 + f.ux * e1, by = w.y2 + f.uy * e1;
    return [
      { x: ax + f.nx * h, y: ay + f.ny * h }, { x: bx + f.nx * h, y: by + f.ny * h },
      { x: bx - f.nx * h, y: by - f.ny * h }, { x: ax - f.nx * h, y: ay - f.ny * h },
    ];
  };
  // ---------- Tekstury ----------
  // Biblioteka: project.textures = [{ id, name, src (dataURL), size – szerokość wzoru [cm], aspect – wys./szer. }].
  // Przypisanie na elemencie: { id, mode: 'tile' (powielanie) | 'stretch' (rozciągnięcie), scale [%],
  //   joint – szerokość spoin [cm] (0 = wzór ciągły), jointColor }.
  App.texture = (id) => (App.project.textures || []).find(t => t.id === id) || null;
  App.addTexture = (t) => {
    App.project.textures.push(Object.assign({ id: App.uid() }, t));
    App.saveTextures();
    App.emit('change');
  };
  App.removeTexture = (id) => {
    const p = App.project;
    p.textures = p.textures.filter(t => t.id !== id);
    // Przypisania do usuniętej tekstury znikają z elementów.
    const clean = (o) => ['tex', 'texFloor', 'texCeil', 'front'].forEach(k => { if (o[k] && o[k].id === id) delete o[k]; });
    p.levels.forEach(l => LISTS.forEach(k => l[k].forEach(clean)));
    App.saveTextures();
    App.changed();
  };

  // Obraz wzoru do powielania: zdjęcie bez 2-px brzegu (rozmyte krawędzie dawały kreski na łączeniach)
  // i opcjonalne spoiny – pas koloru assign.jointColor o szerokości assign.joint [cm] z prawej i u dołu.
  // Zwraca { canvas, key, tw, th } (tw × th – okres wzoru w cm) albo null, dopóki zdjęcie się wczytuje.
  const texImgs = {}, texTiles = {};
  App.texTile = (assign) => {
    const t = assign && App.texture(assign.id);
    if (!t) return null;
    let img = texImgs[t.id];
    if (!img || img.srcKey !== t.src) {
      img = texImgs[t.id] = new Image();
      img.srcKey = t.src;
      img.onload = () => App.emit('texload');
      img.src = t.src;
    }
    if (!img.complete || !img.naturalWidth) return null;
    const tw = t.size * (assign.scale || 100) / 100, th = tw * (t.aspect || 1);
    const W = img.naturalWidth, H = img.naturalHeight, cut = Math.min(W, H) > 32 ? 2 : 0;
    const j = assign.mode !== 'stretch' ? Math.max(0, assign.joint || 0) : 0, color = assign.jointColor || '#d8d2c8';
    const jx = j ? Math.max(1, Math.round(W * j / tw)) : 0, jy = j ? Math.max(1, Math.round(H * j / th)) : 0;
    const key = [t.id, img.naturalWidth, jx, jy, j ? color : ''].join('|');
    if (!texTiles[key]) {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const x = c.getContext('2d');
      x.fillStyle = color;
      x.fillRect(0, 0, W, H);
      x.drawImage(img, cut, cut, W - 2 * cut, H - 2 * cut, 0, 0, W - jx, H - jy);
      texTiles[key] = c;
    }
    return { canvas: texTiles[key], key, tw, th };
  };

  App.addModel = (m) => {
    App.project.models.push(Object.assign({ id: App.uid() }, m));
    App.saveTextures();
    App.emit('change');
    return App.project.models[App.project.models.length - 1];
  };
  App.removeModel = (id) => {
    const p = App.project;
    p.models = p.models.filter(m => m.id !== id);
    p.levels.forEach(l => { l.objects = l.objects.filter(o => o.model !== id); });
    App.saveTextures();
    App.changed();
  };

  // Spód otworu nad podłogą: parapet okna albo próg drzwi (może być ujemny – drzwi obniżone poniżej podłogi).
  App.openingSill = (o) => o.kind === 'door' ? (o.sill || 0) : Math.max(0, o.sill || 0);

  // Pozycja środka otworu przycięta do długości ściany.
  // Okno w szczycie (parapet ponad ścianą) nie musi mieścić się w swojej ścianie – ściana szczytowa bywa podzielona
  // ścianami działowymi, a okno wypada np. pod kalenicą na ich styku.
  App.openingFree = (w, o) => {
    if (o.kind !== 'window') return false;
    const lv = App.project.levels.find(l => l.walls.includes(w));
    return !!lv && o.sill >= App.wallHeight(lv, w);
  };
  App.openingPos = (w, o) => {
    const L = App.wallFrame(w).L;
    if (App.openingFree(w, o)) return G.clamp(o.pos, -L, 2 * L);
    if (o.width >= L) return L / 2;
    return G.clamp(o.pos, o.width / 2, L - o.width / 2);
  };

  // Wszystkie punkty (końce ścian, wierzchołki pokoi) leżące w danym miejscu.
  App.pointRefs = (lv, x, y, eps = 0.5) => {
    const refs = [];
    lv.walls.forEach(w => {
      if (near(w.x1, w.y1, x, y, eps)) refs.push({ o: w, kx: 'x1', ky: 'y1' });
      if (near(w.x2, w.y2, x, y, eps)) refs.push({ o: w, kx: 'x2', ky: 'y2' });
    });
    lv.rooms.forEach(r => r.pts.forEach(p => {
      if (near(p.x, p.y, x, y, eps)) refs.push({ o: p, kx: 'x', ky: 'y' });
    }));
    return refs;
  };

  // Ściana pokrywająca odcinek a-b (oba końce leżą na osi ściany).
  App.edgeWall = (lv, a, b) => lv.walls.find(w => {
    const p1 = { x: w.x1, y: w.y1 }, p2 = { x: w.x2, y: w.y2 };
    const pa = G.project(a, p1, p2), pb = G.project(b, p1, p2);
    return pa.d < 1 && pb.d < 1 && pa.t > -0.001 && pa.t < 1.001 && pb.t > -0.001 && pb.t < 1.001;
  });

  // Czy krawędź pokoju a-b i ściana o leżą na jednej prostej i zachodzą na siebie?
  App.edgeOnWall = (o, a, b) => {
    const p1 = { x: o.x1, y: o.y1 }, p2 = { x: o.x2, y: o.y2 }, L = App.wallFrame(o).L;
    const pa = G.project(a, p1, p2), pb = G.project(b, p1, p2);
    if (pa.d > 1 || pb.d > 1) return false;
    const t0 = Math.max(0, Math.min(pa.t, pb.t)), t1 = Math.min(1, Math.max(pa.t, pb.t));
    return (t1 - t0) * L > 1;
  };
  // Pokoje, których krawędź leży na ścianie o.
  App.wallRooms = (lv, o) => lv.rooms.filter(r => r.pts.some((a, k) => App.edgeOnWall(o, a, r.pts[(k + 1) % r.pts.length])));

  // Obrys pokoju pomniejszony o połowy grubości ścian leżących na jego krawędziach (powierzchnia netto).
  App.roomNetPolygon = (lv, room) => {
    const pts = room.pts, n = pts.length;
    if (n < 3) return pts;
    const sign = G.area(pts) > 0 ? 1 : -1;
    const lines = pts.map((a, i) => {
      const b = pts[(i + 1) % n], L = G.dist(a, b) || 1e-6;
      const dx = (b.x - a.x) / L, dy = (b.y - a.y) / L;
      const w = App.edgeWall(lv, a, b), off = w ? w.t / 2 : 0;
      const nx = -dy * sign, ny = dx * sign;
      return { px: a.x + nx * off, py: a.y + ny * off, dx, dy };
    });
    return pts.map((p, i) => {
      const l1 = lines[(i - 1 + n) % n], l2 = lines[i];
      const cr = l1.dx * l2.dy - l1.dy * l2.dx;
      if (Math.abs(cr) < 1e-9) return { x: l2.px, y: l2.py };
      const s = ((l2.px - l1.px) * l2.dy - (l2.py - l1.py) * l2.dx) / cr;
      return { x: l1.px + l1.dx * s, y: l1.py + l1.dy * s };
    });
  };
  App.roomNetArea = (lv, room) => Math.abs(G.area(App.roomNetPolygon(lv, room))) / 10000;

  // ---------- Schody ----------
  App.STAIR_SHAPES = [['straight', 'proste'], ['U', 'dwubiegowe U (zawracające)'], ['L', 'zabiegowe L (z podestem)']];

  // Rozkład schodów w układzie lokalnym (a – wzdłuż l, b – wzdłuż w, środek w 0,0).
  // parts: prostokąty stopni/podestów z numerem k (wysokość = k * wysokość stopnia),
  // path: linia biegu do strzałki, rails: odcinki poręczy {a0,b0,k0,a1,b1,k1}.
  App.stairLayout = (o) => {
    const shape = o.shape || 'straight', hl = o.l / 2, hw = o.w / 2;
    let N = Math.max(2, o.steps | 0);
    const parts = [], rails = [];
    let path;
    if (shape === 'U') {
      N = Math.max(4, N);
      // Spocznik na całą szerokość, głębokość land (domyślnie równa szerokości biegu).
      const fw = Math.min(o.fw || o.w / 2, o.w / 2), land = G.clamp(o.land || fw, 20, o.l - 40);
      const n1 = Math.floor((N - 1) / 2), n2 = N - 1 - n1, L = o.l - land, r1 = L / n1, r2 = L / n2;
      for (let k = 0; k < n1; k++) parts.push({ a0: -hl + k * r1, a1: -hl + (k + 1) * r1, b0: -hw, b1: -hw + fw, k: k + 1 });
      parts.push({ a0: hl - land, a1: hl, b0: -hw, b1: hw, k: n1 + 1, landing: true });
      for (let k = 0; k < n2; k++) parts.push({ a0: hl - land - (k + 1) * r2, a1: hl - land - k * r2, b0: hw - fw, b1: hw, k: n1 + 2 + k });
      path = [[-hl + r1 / 2, -hw + fw / 2], [hl - land / 2, -hw + fw / 2], [hl - land / 2, hw - fw / 2], [-hl, hw - fw / 2]];
      rails.push({ a0: -hl, b0: -hw + fw, k0: 0, a1: hl - land, b1: -hw + fw, k1: n1 });
      rails.push({ a0: hl - land, b0: hw - fw, k0: n1 + 1, a1: -hl, b1: hw - fw, k1: N });
    } else if (shape === 'L') {
      N = Math.max(4, N);
      // Podest w narożniku: land – długość (wzdłuż pierwszego biegu), landW – szerokość (wzdłuż drugiego);
      // domyślnie kwadrat o boku szerokości biegu.
      const fw = Math.min(o.fw || o.w / 2, o.w - 20, o.l - 20);
      const land = G.clamp(o.land || fw, fw, o.l - 20), landW = G.clamp(o.landW || fw, fw, o.w - 20);
      const L1 = o.l - land, L2 = o.w - landW;
      const n1 = G.clamp(Math.round((N - 1) * L1 / (L1 + L2)), 1, N - 2), n2 = N - 1 - n1, r1 = L1 / n1, r2 = L2 / n2;
      for (let k = 0; k < n1; k++) parts.push({ a0: -hl + k * r1, a1: -hl + (k + 1) * r1, b0: -hw, b1: -hw + fw, k: k + 1 });
      parts.push({ a0: hl - land, a1: hl, b0: -hw, b1: -hw + landW, k: n1 + 1, landing: true });
      for (let k = 0; k < n2; k++) parts.push({ a0: hl - fw, a1: hl, b0: -hw + landW + k * r2, b1: -hw + landW + (k + 1) * r2, k: n1 + 2 + k });
      path = [[-hl + r1 / 2, -hw + fw / 2], [hl - fw / 2, -hw + fw / 2], [hl - fw / 2, hw]];
      rails.push({ a0: -hl, b0: -hw + fw, k0: 0, a1: hl - land, b1: -hw + fw, k1: n1 });
      rails.push({ a0: hl - fw, b0: -hw + landW, k0: n1 + 1, a1: hl - fw, b1: hw, k1: N });
    } else {
      const run = o.l / N;
      for (let k = 0; k < N; k++) parts.push({ a0: -hl + k * run, a1: -hl + (k + 1) * run, b0: -hw, b1: hw, k: k + 1 });
      path = [[-hl + run / 2, 0], [hl, 0]];
      rails.push({ a0: -hl, b0: hw - 3, k0: 0, a1: hl, b1: hw - 3, k1: N });
    }
    if (o.flip) {
      parts.forEach(q => { [q.b0, q.b1] = [-q.b1, -q.b0]; });
      path.forEach(q => { q[1] = -q[1]; });
      rails.forEach(q => { q.b0 = -q.b0; q.b1 = -q.b1; });
    }
    return { N, parts, path, rails };
  };

  // Przy zmianie kształtu dopasuj szerokość całkowitą do szerokości biegu.
  App.setStairShape = (o, shape) => {
    const fw = o.fw || (o.shape === 'U' ? o.w / 2 : o.shape === 'L' ? 100 : o.w);
    o.shape = shape;
    o.fw = fw;
    if (shape === 'U') o.w = Math.max(o.w, 2 * fw + 10);
    else if (shape === 'L') o.w = Math.max(o.w, fw + 150);
    else o.w = fw;
  };

  // ---------- Dachy ----------
  // Dach: prostokąt (x, y – środek, l – wzdłuż kalenicy, w – w poprzek, rot) leżący na ścianach swojej kondygnacji.
  App.ROOF_TYPES = [['gable', 'dwuspadowy'], ['hip', 'czterospadowy'], ['shed', 'jednospadowy'], ['flat', 'płaski']];
  App.makeRoof = (x, y, l, w, rot, opts = {}) => Object.assign({ id: App.uid(), x, y, l, w, rot }, App.defaults.roof, opts);

  // Dach dopasowany do zewnętrznego obrysu podanych ścian (kalenica wzdłuż dłuższego boku).
  App.roofOverWalls = (lv, walls, opts) => {
    if (!walls.length) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    walls.forEach(w => App.wallPolygon(lv, w).forEach(q => {
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
    }));
    return App.roofFromRect(x0, y0, x1, y1, opts);
  };
  App.roofFromRect = (x0, y0, x1, y1, opts) => {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return dx >= dy ? App.makeRoof(cx, cy, dx, dy, 0, opts) : App.makeRoof(cx, cy, dy, dx, 90, opts);
  };

  // Dach poddasza leży na podłodze (+ ścianka kolankowa); zwykły – na najwyższej ze ścian pod jego obrysem
  // (ściany obniżone ręcznie, np. garaż, obniżają też dach), a gdy pod nim nie ma ścian – na wysokości kondygnacji.
  App.roofBase = (i, r) => {
    const lv = App.project.levels[i];
    if (lv.attic) return App.elevation(i) + (r.raise || 0);
    const inside = (p) => { const q = G.toLocal(r, p); return Math.abs(q.a) <= r.l / 2 + 1 && Math.abs(q.b) <= r.w / 2 + 1; };
    const hs = lv.walls.filter(w => inside({ x: w.x1, y: w.y1 }) && inside({ x: w.x2, y: w.y2 })).map(w => App.wallHeight(lv, w));
    return App.elevation(i) + (hs.length ? Math.max(...hs) : lv.height) + (r.raise || 0);
  };

  // Poddasze: dachy kondygnacji ścinają jej ściany – domyślnie od połowy wysokości. Wyłączenie kładzie dach z powrotem
  // na ścianach (bez ścianki kolankowej), żeby nie zawisł nad nimi.
  App.setAttic = (lv, on) => {
    if (!!lv.attic === on) return;
    lv.attic = on;
    lv.roofs.forEach(r => { r.raise = on ? Math.round(lv.height / 2 / 5) * 5 : 0; });
  };

  // Poziomy odcinek od okapu do kalenicy (w rzucie) – z niego i spadku wynika wysokość kalenicy.
  App.roofSpan = (r) => r.type === 'flat' ? 0 : r.type === 'shed' ? r.w : r.type === 'hip' ? Math.min(r.w, r.l) / 2 : r.w / 2;

  // Wysokość ścian kondygnacji: na poddaszu to ścianka kolankowa (pod dachem), na zwykłej – wysokość kondygnacji.
  // Czy dach r z kondygnacji k ścina elementy kondygnacji i leżące w punktach pts?
  // Dach poddasza ścina wszystko pod sobą (od swojej kondygnacji w górę). Dach zwykłej kondygnacji ścina tylko
  // wyższe kondygnacje i tylko to, co leży w całości w jego obrysie – dach garażu nie tnie ściany piętra obok.
  App.roofCovers = (r, k, i, pts) => {
    if (k > i) return false;
    if (App.project.levels[k].attic) return pts.some(p => App.roofHeightAt(r, k, p) != null);
    if (k === i) return false;
    return pts.every(p => { const q = G.toLocal(r, p); return Math.abs(q.a) <= r.l / 2 + 1 && Math.abs(q.b) <= r.w / 2 + 1; });
  };
  const levelPoints = (lv) => lv.walls.length ? lv.walls.flatMap(w => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]) : lv.rooms.flatMap(r => r.pts);
  // Dachy z niższych kondygnacji przykrywające kondygnację i (strych / piętro pod dachem z dołu).
  App.roofsOver = (i) => {
    const pts = levelPoints(App.project.levels[i]), out = [];
    if (!pts.length) return out;
    for (let k = 0; k < i; k++) App.project.levels[k].roofs.forEach(r => { if (App.roofCovers(r, k, i, pts)) out.push({ r, k }); });
    return out;
  };

  // Dachy, które idą w górę razem ze ścianami kondygnacji, i bieżąca wysokość ścian:
  // poddasze – własne dachy, wysokość = ścianka kolankowa; strych – dach poddasza poniżej, wysokość = od podłogi
  // strychu do okapu; zwykła kondygnacja – wysokość kondygnacji (jej dachy i tak leżą na ścianach).
  function wallHeightInfo(lv) {
    const i = App.project.levels.indexOf(lv);
    if (lv.attic && lv.roofs.length) return { kind: 'attic', roofs: lv.roofs, h: Math.min(...lv.roofs.map(r => r.raise || 0)) };
    const over = App.roofsOver(i);
    if (over.length) return { kind: 'loft', roofs: over.map(o => o.r), h: Math.min(...over.map(({ r, k }) => App.roofBase(k, r))) - App.elevation(i) };
    return { kind: 'level', roofs: null, h: lv.height };
  }
  App.levelWallHeight = (lv) => Math.round(wallHeightInfo(lv).h);

  // Zmienia wysokość ścian kondygnacji; wyższe kondygnacje i dachy, które ścinają lub przykrywają te ściany, idą w górę.
  // keepRidge – kalenica zostaje na miejscu, a zmienia się spadek dachu.
  App.setLevelWallHeight = (lv, v, keepRidge) => {
    const info = wallHeightInfo(lv), delta = v - info.h;
    if (!delta && !lv.walls.some(w => w.h)) return;
    const moved = info.roofs || lv.roofs;
    if (keepRidge) {
      moved.forEach(r => {
        const span = App.roofSpan(r);
        if (!span) return;
        const rise = span * Math.tan(r.pitch * Math.PI / 180) - delta;
        r.pitch = Math.round(G.clamp(Math.atan2(rise, span) * 180 / Math.PI, 5, 75) * 10) / 10;
      });
    }
    // Dotyczy wszystkich ścian kondygnacji – własne wysokości pojedynczych ścian wracają na „auto”.
    lv.walls.forEach(w => { w.h = 0; });
    if (info.roofs) info.roofs.forEach(r => { r.raise = Math.max(0, (r.raise || 0) + delta); });
    // Strych zachowuje swoją wysokość (rośnie tylko, gdy ścianka kolankowa ją przewyższy).
    lv.height = G.clamp(info.kind === 'loft' ? Math.max(lv.height, v) : lv.height + delta, 150, 800);
  };

  // Najniższa połać nad punktem spośród dachów poddaszy na kondygnacji i lub niższych (Infinity, gdy brak).
  // Tylko dachy poddaszy ścinają ściany – dach garażu przy ścianie piętra jej nie ścina.
  // Najniższa połać nad punktem p ściany w spośród dachów, które ścinają ściany kondygnacji i (Infinity – brak).
  App.roofClipTop = (i, p, w) => {
    let top = Infinity;
    const ends = [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }];
    for (let k = 0; k <= i; k++) {
      const lv = App.project.levels[k];
      const dormers = lv.objects.filter(o => o.kind === 'dormer').map(o => App.dormerShape(o, k)).filter(Boolean);
      lv.roofs.forEach(r => {
        if (!App.roofCovers(r, k, i, lv.attic ? [p] : ends)) return;
        let h = App.roofHeightAt(r, k, p);
        if (h == null) return;
        // Pod lukarną ściana sięga do spodu jej dachu.
        dormers.forEach(ds => { if (ds.roof === r) { const dh = ds.heightAt(p); if (dh != null) h = Math.max(h, dh); } });
        top = Math.min(top, h);
      });
    }
    return top;
  };

  // Wysokość połaci dachu nad punktem planu (null, jeśli punkt jest poza dachem).
  // Dach dwuspadowy z załamaniem połaci (r.kink = -1 / 1 – strona b<0 / b>0): dolna część połaci o szerokości
  // kinkW ma łagodniejszy kąt kinkPitch, wyżej dach idzie pod kątem pitch. Kalenica przesuwa się tak, żeby obie
  // połacie zaczynały się na tej samej wysokości (wspólna wysokość okapów).
  App.roofKinked = (r) => r.type === 'gable' && !!r.kink && r.kinkW > 0;
  // Profil w poprzek dachu: [[b, wysokość nad base], ...] od b = -hw - okap do hw + okap (wysokość względem base).
  App.roofProfile = (r) => {
    const hw = r.w / 2, ov = r.overhang || 0, t = Math.tan(r.pitch * Math.PI / 180);
    if (!App.roofKinked(r)) return [[-hw - ov, -ov * t], [0, hw * t], [hw + ov, -ov * t]];
    const tl = Math.tan(G.clamp(r.kinkPitch || 15, 1, r.pitch) * Math.PI / 180), kw = G.clamp(r.kinkW, 1, r.w * 0.8);
    // Profil dla załamania po stronie b<0; strona b>0 – odbicie.
    const bR = G.clamp(kw * (t - tl) / (2 * t), -hw + kw, hw - 1), hK = kw * tl, hR = hK + (bR + hw - kw) * t;
    const pts = [[-hw - ov, -ov * tl], [-hw + kw, hK], [bR, hR], [hw + ov, -ov * t]];
    return r.kink > 0 ? pts.map(([b, h]) => [-b, h]).reverse() : pts;
  };
  const profileAt = (pts, b) => {
    for (let k = 1; k < pts.length; k++) {
      const [b0, h0] = pts[k - 1], [b1, h1] = pts[k];
      if (b <= b1 || k === pts.length - 1) return h0 + (h1 - h0) * (b - b0) / (b1 - b0 || 1);
    }
    return 0;
  };
  App.roofProfileAt = profileAt;

  App.roofHeightAt = (r, i, p) => {
    const q = G.toLocal(r, p), ov = r.overhang || 0, hl = r.l / 2, hw = r.w / 2;
    if (Math.abs(q.a) > hl + ov || Math.abs(q.b) > hw + ov) return null;
    const base = App.roofBase(i, r), tan = Math.tan(r.pitch * Math.PI / 180);
    if (r.type === 'flat') return base + 20;
    if (r.type === 'shed') return base + (q.b + hw) * tan;
    if (r.type === 'hip') return base + Math.min(hw - Math.abs(q.b), hl - Math.abs(q.a)) * tan;
    if (App.roofKinked(r)) return base + profileAt(App.roofProfile(r), q.b);
    return base + (hw - Math.abs(q.b)) * tan;
  };

  // Najwyższy dach kondygnacji i nad punktem planu: { r, h } albo null.
  App.roofAt = (i, p) => {
    let best = null;
    App.project.levels[i].roofs.forEach(r => {
      const h = App.roofHeightAt(r, i, p);
      if (h != null && (!best || h > best.h)) best = { r, h };
    });
    return best;
  };

  // Okno dachowe leży na połaci: obrót tak, by oś b szła w górę spadku, oraz kąt nachylenia.
  App.roofWinFrame = (o, i) => {
    const hit = App.roofAt(i, o);
    if (!hit) return null;
    const hAt = (x, y) => { const v = App.roofHeightAt(hit.r, i, { x, y }); return v == null ? hit.h : v; };
    const gx = (hAt(o.x + 1, o.y) - hAt(o.x - 1, o.y)) / 2, gy = (hAt(o.x, o.y + 1) - hAt(o.x, o.y - 1)) / 2;
    const m = Math.hypot(gx, gy);
    const rot = m < 1e-3 ? hit.r.rot : Math.atan2(gy, gx) * 180 / Math.PI - 90;
    return { roof: hit.r, h: hit.h, rot, slope: Math.atan(m) };
  };

  // Lukarna: z wysokości ścianki czołowej i spadków wynika jej głębokość (tam, gdzie jej dach wchodzi w połać).
  App.DORMER_ROOFS = [['shed', 'jednospadowy (pulpitowy)'], ['gable', 'dwuspadowy']];
  App.dormerFrame = (o, i) => {
    const fr = App.roofWinFrame(o, i);
    if (!fr || fr.slope < 0.1) return null;
    const tm = Math.tan(fr.slope), h = o.h || 140, hl = o.l / 2;
    let td = Math.tan((o.pitch || 0) * Math.PI / 180);
    if (o.roof !== 'gable') td = Math.min(td, tm * 0.7);
    const tdSide = o.roof === 'gable' ? 0 : td;
    const dEave = h / (tm - tdSide);
    const depth = o.roof === 'gable' ? (h + hl * td) / tm : dEave;
    // Czoło w licu ściany: czoło stoi na zewnętrznej płaszczyźnie najbliższej ściany poniżej lukarny.
    // cut – dach ścina tę ścianę (poddasze / kondygnacja pod dachem z dołu): ściana sama podnosi się pod lukarną
    // i jest jej czołem. W przeciwnym razie lukarna stawia czoło na górze ściany, w jej płaszczyźnie.
    let bF = -depth / 2;
    const wf = o.flush ? dormerWallFace(o, i, fr.rot, hl) : null;
    if (wf) bF = wf.z;
    const hF = fr.h + bF * tm;
    return { rot: fr.rot, tm, td, tdSide, dEave, depth, bF, hF, eH: hF + h, flush: !!wf, cut: !!wf && wf.cut, wallTop: wf ? wf.top : null };
  };
  // Lokalne z (w górę spadku) zewnętrznego lica ściany równoległej do czoła lukarny, leżącej pod nią lub przed nią (do 5 m).
  // Szukane na kondygnacji dachu i na wyższych, których ściany ten dach ścina.
  function dormerWallFace(o, i, rot, hl) {
    const f0 = { x: o.x, y: o.y, rot }, ra = rot * Math.PI / 180, ax = Math.cos(ra), ay = Math.sin(ra);
    const roof = App.roofAt(i, o).r, levels = App.project.levels;
    const walls = levels[i].walls.map(w => ({ w, j: i, cut: levels[i].attic })).concat(...levels.slice(i + 1).map((l, j) =>
      l.walls.filter(w => App.roofCovers(roof, i, i + 1 + j, [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }])).map(w => ({ w, j: i + 1 + j, cut: true }))));
    let best = null;
    walls.forEach(({ w, j, cut }) => {
      const f = App.wallFrame(w);
      if (Math.abs(f.ux * ax + f.uy * ay) < 0.99) return;
      const q = G.toLocal(f0, { x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 });
      if (Math.abs(q.a) > f.L / 2 + hl || q.b > 150 || q.b < -500) return;
      const z = q.b - w.t / 2;
      // Najniżej na połaci – czyli ściana zewnętrzna, a nie działowa wyżej pod lukarną.
      if (!best || z < best.z) best = { z, cut, top: App.elevation(j) + App.wallHeight(levels[j], w) };
    });
    return best;
  }

  // Obrys lukarny w rzucie (otwór w połaci) i wysokość spodu jej dachu nad punktem.
  // Przy czole w licu ściany okap biegnie dalej pod lukarną, chyba że ma być przerwany (cutEave) – wtedy otwór
  // sięga do okapu. Obrys do ścinania ścian sięga kawałek przed czoło, żeby objąć zewnętrzne lico ściany.
  App.dormerShape = (o, i) => {
    const d = App.dormerFrame(o, i);
    if (!d) return null;
    const f0 = { x: o.x, y: o.y, rot: d.rot }, hl = o.l / 2, zE = d.bF + d.dEave;
    const outline = (zF) => (o.roof === 'gable'
      ? [[-hl, zF], [hl, zF], [hl, zE], [0, d.bF + d.depth], [-hl, zE]]
      : [[-hl, zF], [hl, zF], [hl, zE], [-hl, zE]]).map(([a, b]) => G.local(f0, a, b));
    const poly = outline(d.flush && o.cutEave ? d.bF - 2000 : d.bF);
    const clip = d.flush ? outline(d.bF - 5) : poly;
    const heightAt = (p) => {
      if (!G.inside(p, clip)) return null;
      const q = G.toLocal(f0, p);
      return o.roof === 'gable' ? d.eH + (hl - Math.abs(q.a)) * d.td : d.eH + Math.max(0, q.b - d.bF) * d.td;
    };
    return { d, poly, heightAt, roof: App.roofAt(i, o).r };
  };

  // Okno wychodzące ponad ścianę – w ścianie szczytowej pod dachem.
  App.isGableWindow = (lv, o) => {
    const w = lv.walls.find(x => x.id === o.wallId);
    return !!w && o.kind === 'window' && o.sill >= App.wallHeight(lv, w);
  };

  // Przekrój dachu na wysokości y: wielokąt rzutu, nad którym połać jest wyżej niż y (null – brak).
  App.roofSection = (r, k, y) => {
    const base = App.roofBase(k, r), hl = r.l / 2, hw = r.w / 2;
    let a0 = -hl, a1 = hl, b0 = -hw, b1 = hw;
    if (r.type === 'flat') {
      if (y >= base + 20) return null;
    } else if (App.roofKinked(r)) {
      // Przekrój profilu z załamaniem: część rosnąca do kalenicy i opadająca za nią.
      const pts = App.roofProfile(r), h = y - base, top = pts.reduce((m, q) => (q[1] > m[1] ? q : m));
      if (h >= top[1]) return null;
      const cross = (from, to) => {
        for (let k = from; k !== to; k += Math.sign(to - from)) {
          const [ba, ha] = pts[k], [bb, hb] = pts[k + Math.sign(to - from)];
          if ((ha - h) * (hb - h) <= 0 && ha !== hb) return ba + (bb - ba) * (h - ha) / (hb - ha);
        }
        return pts[from][0];
      };
      const ir = pts.indexOf(top);
      b0 = Math.max(b0, cross(0, ir));
      b1 = Math.min(b1, cross(pts.length - 1, ir));
    } else {
      const d = Math.max(0, (y - base) / Math.tan(r.pitch * Math.PI / 180));
      if (r.type === 'shed') b0 += d;
      else { b0 += d; b1 -= d; }
      if (r.type === 'hip') { a0 += d; a1 -= d; }
    }
    if (a1 - a0 < 1 || b1 - b0 < 1) return null;
    return [G.local(r, a0, b0), G.local(r, a1, b0), G.local(r, a1, b1), G.local(r, a0, b1)];
  };
  // Wielokąt przycięty do wnętrza wielokąta wypukłego (Sutherland–Hodgman).
  G.clipConvex = (poly, clip) => {
    const sign = G.area(clip) > 0 ? 1 : -1;
    let out = poly;
    clip.forEach((a, k) => {
      const b = clip[(k + 1) % clip.length], inp = out;
      const side = (p) => ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) * sign >= 0;
      out = [];
      inp.forEach((p, j) => {
        const q = inp[(j + 1) % inp.length], ip = side(p), iq = side(q);
        if (ip) out.push(p);
        if (ip !== iq) {
          const dx = q.x - p.x, dy = q.y - p.y, ex = b.x - a.x, ey = b.y - a.y;
          const t = (ex * (a.y - p.y) - ey * (a.x - p.x)) / (ex * dy - ey * dx);
          out.push({ x: p.x + dx * t, y: p.y + dy * t });
        }
      });
    });
    return out;
  };

  // Wierzch komina z kondygnacji i: ponad najwyższą połacią nad nim albo ponad najwyższe ściany.
  App.chimneyTop = (o, i) => {
    const levels = App.project.levels;
    let top = -Infinity;
    levels.forEach((lv, k) => {
      if (k < i) return;
      lv.roofs.forEach(r => { const y = App.roofHeightAt(r, k, o); if (y != null) top = Math.max(top, y); });
    });
    if (top === -Infinity) {
      let k = i;
      levels.forEach((lv, j) => { if (j > i && lv.walls.length) k = j; });
      top = App.elevation(k) + levels[k].height;
    }
    return top + (o.above || 0);
  };

  // ---------- Przykładowy projekt ----------
  App.sampleProject = () => {
    const p = App.newProject();
    p.name = 'Dom przykładowy';
    const mk = (lv, x1, y1, x2, y2, t) => {
      const w = { id: App.uid(), x1, y1, x2, y2, t, h: 0 };
      lv.walls.push(w);
      return w;
    };
    const room = (lv, name, color, x0, y0, x1, y1) => lv.rooms.push({
      id: App.uid(), name, color, pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
    });
    const op = (lv, w, kind, pos, width, height, sill, extra) => lv.openings.push(Object.assign({
      id: App.uid(), kind, wallId: w.id, pos, width, height, sill, flip: false, side: false,
    }, extra || {}));
    const shell = (lv) => ({
      top: mk(lv, 0, 0, 1000, 0, 30), right: mk(lv, 1000, 0, 1000, 800, 30),
      bottom: mk(lv, 1000, 800, 0, 800, 30), left: mk(lv, 0, 800, 0, 0, 30),
      mid: mk(lv, 550, 0, 550, 800, 12), hl: mk(lv, 0, 500, 550, 500, 12), hr: mk(lv, 550, 350, 1000, 350, 12),
    });

    const g = p.levels[0];
    const a = shell(g);
    room(g, 'Salon', '#f1e4c8', 0, 0, 550, 500);
    room(g, 'Kuchnia', '#dbe7f3', 550, 0, 1000, 350);
    room(g, 'Hol', '#e8e8e8', 550, 350, 1000, 800);
    room(g, 'Pokój', '#e3efd9', 0, 500, 550, 800);
    op(g, a.bottom, 'door', 225, 100, 215, 0, { side: true });
    op(g, a.mid, 'door', 425, 90, 210, 0, { side: true });
    op(g, a.hr, 'door', 100, 90, 210, 0, { side: true });
    op(g, a.mid, 'door', 650, 90, 210, 0, { side: false, flip: true });
    op(g, a.top, 'window', 150, 150, 150, 90);
    op(g, a.top, 'window', 380, 150, 150, 90);
    op(g, a.left, 'window', 550, 200, 220, 0);
    op(g, a.top, 'window', 775, 120, 120, 100);
    op(g, a.right, 'window', 175, 120, 120, 100);
    op(g, a.left, 'window', 150, 120, 150, 90);
    g.objects.push({ id: App.uid(), kind: 'stairs', x: 935, y: 600, l: 360, w: 100, steps: 16, rot: -90 });
    g.objects.push({ id: App.uid(), kind: 'chimney', x: 515, y: 45, l: 50, w: 50, above: 100, rot: 0 });
    // Dobudowany garaż z osobnym, niższym dachem obróconym o 90°.
    mk(g, 1000, 300, 1360, 300, 24);
    const gr = mk(g, 1360, 300, 1360, 800, 24);
    const gb = mk(g, 1360, 800, 1000, 800, 24);
    room(g, 'Garaż', '#e5e7eb', 1000, 300, 1360, 800);
    op(g, gb, 'door', 180, 250, 215, 0, { gate: true });
    op(g, gr, 'window', 250, 100, 60, 150);
    g.roofs.push(App.makeRoof(1186, 550, 524, 372, 90, { type: 'gable', pitch: 30, overhang: 40 }));

    const u = App.newLevel('Piętro', 260);
    p.levels.push(u);
    const b = shell(u);
    room(u, 'Sypialnia', '#f5dede', 0, 0, 550, 500);
    room(u, 'Pokój dziecka', '#ece3f3', 550, 0, 1000, 350);
    room(u, 'Korytarz', '#e8e8e8', 550, 350, 1000, 800);
    room(u, 'Łazienka', '#dff0ee', 0, 500, 550, 800);
    op(u, b.mid, 'door', 425, 90, 205, 0, { side: true });
    op(u, b.hr, 'door', 100, 90, 205, 0, { side: true });
    op(u, b.mid, 'door', 650, 80, 205, 0, { side: true, flip: true });
    op(u, b.top, 'window', 275, 180, 140, 90);
    op(u, b.left, 'window', 550, 120, 140, 90);
    op(u, b.top, 'window', 775, 120, 140, 90);
    op(u, b.left, 'window', 150, 80, 80, 130);
    op(u, b.bottom, 'window', 225, 100, 120, 100);
    u.roofs.push(App.roofOverWalls(u, u.walls, { type: 'gable', pitch: 35, overhang: 50 }));
    return p;
  };
})(window.App);
