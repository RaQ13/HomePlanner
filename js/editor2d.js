'use strict';
// Edytor rzutu 2D: rysowanie, narzędzia, zaznaczanie, przeciąganie.
(function (App) {
  const G = App.geom, near = App.near;
  const E = App.editor = {
    tool: 'select', scale: 0.6, ox: 80, oy: 80,
    mouse: { x: 0, y: 0 }, screen: { x: 0, y: 0 }, snap: null, inside: false,
    chain: null, rect: null, poly: null, objRot: 0, typed: '', drag: null, preview: null, hover: null,
    shift: false, space: false, run: null,
  };
  // Widok rzutu: rysunek techniczny i warstwa instalacji ('none' | 'all' | 'el' | 'wk') – ustawienia przeglądarki.
  try { E.tech = localStorage.getItem('planer.tech') === '1'; E.instLayer = localStorage.getItem('planer.inst2d') || 'none'; } catch (e) { E.tech = false; E.instLayer = 'none'; }
  E.setTech = (v) => { E.tech = !!v; try { localStorage.setItem('planer.tech', v ? '1' : '0'); } catch (e) { /* ignoruj */ } E.render(); App.emit('view2d'); };
  E.setInstLayer = (v) => { E.instLayer = v; try { localStorage.setItem('planer.inst2d', v); } catch (e) { /* ignoruj */ } E.render(); App.emit('view2d'); };
  // „Tylko instalacje”: rzut jako jasny podkład (ściany, otwory, pokoje) z instalacjami na wierzchu.
  try { E.instOnly = localStorage.getItem('planer.instonly') === '1'; } catch (e) { E.instOnly = false; }
  E.setInstOnly = (v) => { E.instOnly = !!v; try { localStorage.setItem('planer.instonly', v ? '1' : '0'); } catch (e) { /* ignoruj */ } E.render(); App.emit('view2d'); };
  // Wymiary instalacji: długości tras, odległości punktów od ścian, wysokość od podłogi / sufitu.
  try { E.instDims = localStorage.getItem('planer.instdims') !== '0'; } catch (e) { E.instDims = true; }
  E.setInstDims = (v) => { E.instDims = !!v; try { localStorage.setItem('planer.instdims', v ? '1' : '0'); } catch (e) { /* ignoruj */ } E.render(); App.emit('view2d'); };
  E.instOn = () => E.instLayer !== 'none' || E.instOnly;
  E.instVisible = (o) => E.instLayer === 'none' || E.instLayer === 'all' || E.instLayer === App.installGroup(o);
  const BG = '#fcfcfa';
  const SEL = '#2563eb';
  let canvas, ctx, dpr = 1, W = 0, H = 0, pending = false;

  const HINTS = {
    select: 'Kliknij element, aby go zaznaczyć i przeciągnij, aby przesunąć. Ścianę pokoju przeciągasz prostopadle – rozciąga tylko ten pokój. Narożniki ścian można przeciągać. Del – usuń, Ctrl+C / Ctrl+V – kopiuj i wklej pod kursorem, Ctrl+D – powiel. Puste tło – przesuwanie widoku.',
    wall: 'Klikaj kolejne punkty ściany. Wpisz długość w cm i Enter. Shift – kąty co 45°. Esc lub prawy klik – zakończ.',
    room: 'Przeciągnij (albo kliknij dwa przeciwległe narożniki), aby utworzyć prostokątny pokój ze ścianami.',
    poly: 'Klikaj narożniki pokoju. Kliknij pierwszy punkt lub Enter, aby zamknąć. Backspace – cofnij punkt.',
    door: 'Najedź na ścianę i kliknij, aby wstawić drzwi. Strona kursora wyznacza kierunek otwierania.',
    window: 'Najedź na ścianę i kliknij, aby wstawić okno. Opcja „W szczycie dachu” wstawia okno ponad ścianą, w trójkącie pod dachem.',
    dormer: 'Kliknij na połaci dachu bieżącej kondygnacji, aby wstawić lukarnę – ustawia się czołem w dół spadku.',
    roofwin: 'Kliknij na dachu bieżącej kondygnacji, aby wstawić okno dachowe – samo ustawia się zgodnie ze spadkiem połaci.',
    stairs: 'Kliknij, aby postawić schody. T – obrót o 90°, M – odbicie lustrzane (skręt w drugą stronę). Strzałka wskazuje kierunek wchodzenia.',
    chimney: 'Kliknij, aby postawić komin. T – obrót o 90°.',
    install: 'Wybierz element instalacji po prawej. Gniazdka, łączniki i podejścia – kliknij przy licu ściany (strona kursora wyznacza lico). Przewody i rury – klikaj kolejne punkty (przyciągają do osi ścian i punktów instalacji), Enter lub prawy klik – zakończ.',
    furniture: 'Wybierz mebel z katalogu po prawej i kliknij na rzucie. Przy ścianie mebel sam obraca się do niej tyłem (Shift – bez przyciągania). T – obrót o 90°, M – odbicie.',
    plot: 'Klikaj narożniki działki. Kliknij pierwszy punkt lub Enter, aby zamknąć. Wpisz długość boku w cm i Enter. Backspace – cofnij punkt.',
    path: 'Pas: klikaj kolejne punkty osi chodnika (szerokość po prawej), Enter lub prawy klik – zakończ. Obszar: klikaj narożniki, zamknij pierwszym punktem lub Enterem.',
    fence: 'Klikaj kolejne punkty ogrodzenia. Kliknięcie pierwszego punktu zamyka ogrodzenie dookoła, Enter lub prawy klik – kończy. Bramę i furtkę wstaw narzędziem Ogród w przerwie płotu.',
    garden: 'Wybierz roślinę lub wyposażenie ogrodu po prawej i kliknij na rzucie. T – obrót o 90°, M – odbicie.',
    roof: 'Kliknij w pokój, aby przykryć go dachem, albo przeciągnij prostokąt. Dach leży na ścianach bieżącej kondygnacji. T – obrót zaznaczonego dachu.',
  };
  E.hint = () => HINTS[E.tool];

  E.toWorld = (sx, sy) => ({ x: (sx - E.ox) / E.scale, y: (sy - E.oy) / E.scale });
  E.toScreen = (x, y) => ({ x: x * E.scale + E.ox, y: y * E.scale + E.oy });
  E.render = () => { if (!pending) { pending = true; requestAnimationFrame(draw); } };

  E.init = (el) => {
    canvas = el;
    ctx = canvas.getContext('2d');
    new ResizeObserver(resize).observe(canvas.parentElement);
    resize();
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('mouseenter', () => { E.inside = true; });
    canvas.addEventListener('mouseleave', () => { E.inside = false; E.hover = null; E.render(); });
    App.on('change', E.render);
    App.on('texload', E.render);
    App.on('furnitureType', () => { computeSnap(); E.render(); });
    App.on('select', E.render);
    App.on('walker', E.render);
  };

  function resize() {
    const r = canvas.parentElement.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    draw();
  }

  E.fit = () => {
    const pts = [];
    App.project.levels.forEach(l => {
      l.walls.forEach(w => pts.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }));
      l.rooms.forEach(r => pts.push(...r.pts));
      l.objects.forEach(o => pts.push(...G.rectCorners(o)));
      l.roofs.forEach(o => pts.push(...G.rectCorners(o)));
      [...(l.plots || []), ...(l.paths || []), ...(l.fences || [])].forEach(o => pts.push(...o.pts));
    });
    if (!W || !H) return;
    if (!pts.length) { E.scale = 0.6; E.ox = 80; E.oy = 80; E.render(); return; }
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = 70;
    E.scale = G.clamp(Math.min((W - 2 * pad) / Math.max(x1 - x0, 100), (H - 2 * pad) / Math.max(y1 - y0, 100)), 0.05, 5);
    E.ox = W / 2 - (x0 + x1) / 2 * E.scale;
    E.oy = H / 2 - (y0 + y1) / 2 * E.scale;
    E.render();
  };

  E.zoom = (factor, sx = W / 2, sy = H / 2) => {
    const before = E.toWorld(sx, sy);
    E.scale = G.clamp(E.scale * factor, 0.04, 8);
    E.ox = sx - before.x * E.scale;
    E.oy = sy - before.y * E.scale;
    E.render();
    App.emit('cursor');
  };

  // Narzędzia terenu działają na kondygnacji na poziomie terenu (parter).
  const SITE_TOOLS = ['plot', 'path', 'fence', 'garden'];
  const POLY_TOOLS = ['poly', 'plot', 'path', 'fence'];
  E.setTool = (id) => {
    E.cancel();
    const p = App.project;
    if (SITE_TOOLS.includes(id) && p.current !== (p.ground || 0)) App.setLevel(p.ground || 0);
    E.tool = id;
    E.objRot = 0;
    E.objFlip = false;
    if (id !== 'select') App.select(null);
    canvas.style.cursor = id === 'select' ? 'default' : 'crosshair';
    App.emit('tool');
    E.render();
  };

  // Przerywa bieżącą operację; zwraca true, jeśli było co przerwać.
  E.cancel = () => {
    const busy = !!(E.chain || E.rect || E.poly || E.typed || E.run);
    E.chain = E.rect = E.poly = E.run = null;
    E.typed = '';
    E.preview = null;
    App.emit('cursor');
    E.render();
    return busy;
  };

  // Zakończenie rysowania (prawy klik / Enter).
  E.finish = () => {
    if (POLY_TOOLS.includes(E.tool) && E.poly) {
      closePoly(false);
    } else if (E.tool === 'wall') {
      E.chain = null;
    } else if (E.tool === 'install' && E.run) {
      finishRun();
    }
    E.typed = '';
    E.render();
  };

  // ---------- Przyciąganie ----------
  E.snapPoint = (p, opt = {}) => {
    const lv = App.level(), tol = 10 / E.scale, ex = opt.exclude;
    let best = null, bd = tol;
    const cand = (x, y) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = { x, y, kind: 'point' }; }
    };
    lv.walls.forEach(w => { if (ex && ex.has(w)) return; cand(w.x1, w.y1); cand(w.x2, w.y2); });
    lv.rooms.forEach(r => r.pts.forEach(q => { if (!(ex && ex.has(q))) cand(q.x, q.y); }));
    [...lv.plots, ...lv.paths, ...lv.fences].forEach(o => o.pts.forEach(q => { if (!(ex && ex.has(q))) cand(q.x, q.y); }));
    const below = App.project.levels[App.project.current - 1];
    if (below) below.walls.forEach(w => { cand(w.x1, w.y1); cand(w.x2, w.y2); });
    (opt.extra || []).forEach(q => cand(q.x, q.y));
    if (best) return best;

    const g = App.project.settings.grid || 1;
    const from = opt.from;
    if (from && E.shift) {
      const ang = Math.atan2(p.y - from.y, p.x - from.x), q = Math.round(ang / (Math.PI / 4)) * Math.PI / 4;
      const len = Math.round(Math.hypot(p.x - from.x, p.y - from.y) / g) * g;
      return { x: round1(from.x + Math.cos(q) * len), y: round1(from.y + Math.sin(q) * len), kind: 'angle' };
    }

    let wb = null, wd = tol * 0.7;
    lv.walls.forEach(w => {
      if (ex && ex.has(w)) return;
      const pr = G.project(p, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
      if (pr.d < wd) { wd = pr.d; wb = pr; }
    });
    if (wb) return { x: round1(wb.x), y: round1(wb.y), kind: 'wall' };

    let x = Math.round(p.x / g) * g, y = Math.round(p.y / g) * g;
    // Wyrównanie do istniejących punktów (linie pomocnicze).
    const al = 7 / E.scale;
    let gx = null, gy = null, bx = al, by = al;
    const align = (q, weight = 1) => {
      const dx = Math.abs(p.x - q.x) / weight, dy = Math.abs(p.y - q.y) / weight;
      if (dx < bx) { bx = dx; gx = q; }
      if (dy < by) { by = dy; gy = q; }
    };
    if (from) align(from, 1.6);
    lv.walls.forEach(w => { if (ex && ex.has(w)) return; align({ x: w.x1, y: w.y1 }); align({ x: w.x2, y: w.y2 }); });
    lv.rooms.forEach(r => r.pts.forEach(q => { if (!(ex && ex.has(q))) align(q); }));
    [...lv.plots, ...lv.paths, ...lv.fences].forEach(o => o.pts.forEach(q => { if (!(ex && ex.has(q))) align(q); }));
    (opt.extra || []).forEach(q => align(q));
    if (gx) x = gx.x;
    if (gy) y = gy.y;
    return { x, y, kind: 'grid', gx, gy };
  };
  const round1 = v => Math.round(v * 10) / 10;

  function computeSnap() {
    let from = null, extra = null;
    if (E.tool === 'wall' && E.chain) { from = E.chain[E.chain.length - 1]; extra = E.chain; }
    if (E.poly) { from = E.poly[E.poly.length - 1]; extra = E.poly; }
    if ((E.tool === 'room' || E.tool === 'roof') && E.rect) from = E.rect.a;
    if (E.tool === 'install') {
      const d = App.installDef(App.defaults.install.type), g = App.project.settings.grid || 1;
      E.preview = d.shape === 'wall' ? App.installWallTarget(App.level(), E.mouse, 40) : null;
      E.snap = d.shape === 'run' ? runSnap(E.mouse) : { x: Math.round(E.mouse.x / g) * g, y: Math.round(E.mouse.y / g) * g, kind: 'grid' };
      return;
    }
    if (E.tool === 'furniture' || E.tool === 'garden') {
      const g = App.project.settings.grid || 1;
      E.snap = furnitureSnap() || { x: Math.round(E.mouse.x / g) * g, y: Math.round(E.mouse.y / g) * g, kind: 'grid' };
      return;
    }
    if (E.tool === 'stairs' || E.tool === 'chimney' || E.tool === 'roofwin' || E.tool === 'dormer') {
      const g = App.project.settings.grid || 1;
      E.snap = { x: Math.round(E.mouse.x / g) * g, y: Math.round(E.mouse.y / g) * g, kind: 'grid' };
      return;
    }
    E.snap = E.snapPoint(E.mouse, { from, extra });
  }

  // ---------- Zdarzenia myszy ----------
  function evPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function updateMouse(e) {
    E.screen = evPos(e);
    E.mouse = E.toWorld(E.screen.x, E.screen.y);
    E.shift = e.shiftKey;
  }
  const startPan = (e) => ({ type: 'pan', sx: e.clientX, sy: e.clientY, ox: E.ox, oy: E.oy, moved: false, button: e.button });

  function onDown(e) {
    canvas.focus();
    updateMouse(e);
    if (e.button === 1 || e.button === 2 || (e.button === 0 && E.space)) {
      e.preventDefault();
      E.drag = startPan(e);
      return;
    }
    if (e.button !== 0) return;
    computeSnap();
    tools[E.tool].down(e);
    E.render();
  }

  function onMove(e) {
    if (E.drag && E.drag.type === 'pan') {
      const dx = e.clientX - E.drag.sx, dy = e.clientY - E.drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) E.drag.moved = true;
      E.ox = E.drag.ox + dx;
      E.oy = E.drag.oy + dy;
      E.render();
      return;
    }
    if (e.target !== canvas && !E.drag) return;
    updateMouse(e);
    computeSnap();
    const t = tools[E.tool];
    if (t.move) t.move(e);
    App.emit('cursor');
    E.render();
  }

  function onUp(e) {
    if (E.drag && E.drag.type === 'pan') {
      const d = E.drag;
      E.drag = null;
      if (d.button === 2 && !d.moved) {
        if (E.tool === 'select') App.select(null); else E.finish();
      }
      return;
    }
    const t = tools[E.tool];
    if (t.up) { updateMouse(e); computeSnap(); t.up(e); }
    E.render();
  }

  function onWheel(e) {
    e.preventDefault();
    const s = evPos(e);
    E.zoom(Math.exp(-e.deltaY * 0.0015), s.x, s.y);
  }

  // ---------- Wybór elementów ----------
  function hitTest(p) {
    const lv = App.level(), tol = 8 / E.scale;
    const sel = App.find(App.selection);
    if (sel && sel.kind === 'room') {
      for (const q of sel.obj.pts) if (G.dist(p, q) < tol) return { type: 'vertex', x: q.x, y: q.y, select: sel.obj.id };
    }
    if (sel && sel.kind === 'roof') {
      const c = G.rectCorners(sel.obj);
      for (let k = 0; k < 4; k++) if (G.dist(p, c[k]) < tol) return { type: 'roofCorner', obj: sel.obj, corner: k, select: sel.obj.id };
    }
    // Wierzchołki zaznaczonej działki, nawierzchni lub ogrodzenia.
    if (sel && (sel.kind === 'plot' || sel.kind === 'path' || sel.kind === 'fence')) {
      for (let k = 0; k < sel.obj.pts.length; k++) if (G.dist(p, sel.obj.pts[k]) < tol) return { type: 'polyVertex', obj: sel.obj, k, select: sel.obj.id };
    }
    if (sel && sel.kind === 'install' && sel.obj.pts) {
      for (let k = 0; k < sel.obj.pts.length; k++) if (G.dist(p, sel.obj.pts[k]) < tol) return { type: 'runVertex', obj: sel.obj, k, select: sel.obj.id };
    }
    if (E.instOn()) {
      for (let i = lv.installs.length - 1; i >= 0; i--) {
        const o = lv.installs[i];
        if (!E.instVisible(o)) continue;
        if (o.pts) {
          for (let k = 1; k < o.pts.length; k++) if (G.project(p, o.pts[k - 1], o.pts[k]).d < tol * 0.7) return { type: 'run', obj: o, select: o.id };
        } else {
          const q = App.installHitPoint(lv, o, 1 / E.scale);
          if (q && G.dist(p, q) < (o.type === 'riser' ? Math.max(tol, 11) : tol)) return { type: o.wallId ? 'installWall' : 'object', obj: o, select: o.id };
        }
      }
      // W trybie „Tylko instalacje” pozostałe elementy są tylko podkładem – nie da się ich złapać.
      if (E.instOnly) return null;
    }
    for (const o of lv.objects) {
      if (o.kind !== 'roofwin' && o.kind !== 'dormer') continue;
      const q = G.toLocal(o, p);
      if (Math.abs(q.a) <= o.l / 2 && Math.abs(q.b) <= o.w / 2) return { type: 'object', obj: o, select: o.id };
    }
    // Dach łapany za krawędź okapu lub kalenicę, żeby nie zasłaniał pokoi.
    for (const r of lv.roofs) {
      if (roofLines(r).some(([a, b]) => G.project(p, a, b).d < tol * 0.7)) return { type: 'object', obj: r, select: r.id };
    }
    for (const w of lv.walls) {
      if (Math.hypot(p.x - w.x1, p.y - w.y1) < tol) return { type: 'vertex', x: w.x1, y: w.y1, select: w.id };
      if (Math.hypot(p.x - w.x2, p.y - w.y2) < tol) return { type: 'vertex', x: w.x2, y: w.y2, select: w.id };
    }
    for (const o of lv.openings) {
      const w = lv.walls.find(x => x.id === o.wallId);
      if (!w) continue;
      const f = App.wallFrame(w), pr = G.project(p, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
      if (pr.d < w.t / 2 + tol && Math.abs(pr.t * f.L - App.openingPos(w, o)) < o.width / 2) return { type: 'opening', obj: o, select: o.id };
    }
    for (let i = lv.objects.length - 1; i >= 0; i--) {
      const o = lv.objects[i], q = G.toLocal(o, p);
      if (Math.abs(q.a) <= o.l / 2 && Math.abs(q.b) <= o.w / 2) return { type: 'object', obj: o, select: o.id };
    }
    for (const o of lv.fences) {
      if (App.fenceSegments(o).some(([a, b]) => G.project(p, a, b).d < Math.max(tol * 0.8, 6))) return { type: 'polyMove', obj: o, select: o.id };
    }
    for (const w of lv.walls) {
      const pr = G.project(p, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
      if (pr.d < w.t / 2 + tol * 0.5) return { type: 'wall', obj: w, select: w.id };
    }
    let best = null, ba = Infinity;
    for (const r of lv.rooms) {
      if (!G.inside(p, r.pts)) continue;
      const a = Math.abs(G.area(r.pts));
      if (a < ba) { ba = a; best = r; }
    }
    if (best) return { type: 'room', obj: best, select: best.id };
    for (const r of lv.roofs) {
      const q = G.toLocal(r, p);
      if (Math.abs(q.a) <= r.l / 2 && Math.abs(q.b) <= r.w / 2) return { type: 'object', obj: r, select: r.id };
    }
    // Nawierzchnie i działki – najmniejsza pod kursorem (chodnik leży na działce).
    for (const list of [lv.paths, lv.plots]) {
      const hit = list.filter(o => G.inside(p, o.pts)).sort((x, y) => Math.abs(G.area(x.pts)) - Math.abs(G.area(y.pts)))[0];
      if (hit) return { type: 'polyMove', obj: hit, select: hit.id };
    }
    return null;
  }

  // Odcinki rysunku dachu: obrys okapu i kalenica / narożniki.
  function roofLines(r) {
    const ov = r.overhang || 0, hl = r.l / 2 + ov, hw = r.w / 2 + ov, L = (a, b) => G.local(r, a, b);
    const c = [L(-hl, -hw), L(hl, -hw), L(hl, hw), L(-hl, hw)];
    const lines = c.map((q, k) => [q, c[(k + 1) % 4]]);
    if (App.roofKinked(r)) {
      // Kalenica przesunięta, linia załamania połaci.
      App.roofProfile(r).slice(1, -1).forEach(([b]) => lines.push([L(-hl, b), L(hl, b)]));
    } else if (r.type === 'gable') lines.push([L(-hl, 0), L(hl, 0)]);
    if (r.type === 'hip') {
      const swap = r.l < r.w, d = Math.abs(r.l - r.w) / 2;
      const r0 = swap ? L(0, -d) : L(-d, 0), r1 = swap ? L(0, d) : L(d, 0);
      lines.push([r0, r1], [c[0], r0], [c[3], swap ? r1 : r0], [c[1], swap ? r0 : r1], [c[2], r1]);
    }
    return lines;
  }

  function addRefs(list, refs) {
    refs.forEach(r => { if (!list.some(q => q.o === r.o && q.kx === r.kx)) list.push(r); });
    return list;
  }
  const wallRooms = App.wallRooms;

  // Przesuwanie ściany pokoju prostopadle do niej. Rozciągają się tylko ściany pokoi, do których należy;
  // ściana wspólna z innym pokojem zostaje, a dochodzi do niej przedłużenie. Ściana leżąca w przedłużeniu odłącza się.
  function roomWallDrag(lv, w, before, start) {
    const R = wallRooms(lv, w);
    if (!R.length) return null;
    const f = App.wallFrame(w), refs = [], ext = [];
    [['x1', 'y1'], ['x2', 'y2']].forEach(([kx, ky]) => {
      const x = w[kx], y = w[ky];
      refs.push({ o: w, kx, ky });
      lv.walls.slice().forEach(o => {
        if (o === w) return;
        const end = near(o.x1, o.y1, x, y) ? ['x1', 'y1'] : near(o.x2, o.y2, x, y) ? ['x2', 'y2'] : null;
        if (!end) return;
        const g = App.wallFrame(o);
        if (Math.abs(g.ux * f.uy - g.uy * f.ux) < 0.02) return;
        const own = wallRooms(lv, o);
        if (own.length && own.every(r => R.includes(r))) {
          refs.push({ o, kx: end[0], ky: end[1] });
        } else if (own.some(r => R.includes(r))) {
          const nw = { id: App.uid(), x1: x, y1: y, x2: x, y2: y, t: o.t };
          if (o.h) nw.h = o.h;
          lv.walls.push(nw);
          ext.push({ w: nw, from: o });
          refs.push({ o: nw, kx: 'x2', ky: 'y2' });
        }
      });
      R.forEach(r => r.pts.forEach(p => { if (near(p.x, p.y, x, y)) refs.push({ o: p, kx: 'x', ky: 'y' }); }));
    });
    return { type: 'move', before, refs: withOrigin(refs), start, axis: { x: f.nx, y: f.ny }, ext };
  }
  // Usuwa przedłużenia zerowej długości albo nachodzące na ścianę, od której wyszły (pokój się zmniejszył).
  function cleanupExtensions(lv, ext) {
    ext.forEach(({ w, from }) => {
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      const pr = G.project({ x: w.x2, y: w.y2 }, { x: from.x1, y: from.y1 }, { x: from.x2, y: from.y2 });
      if (L < 1 || (pr.d < 1 && pr.t > -0.001 && pr.t < 1.001)) lv.walls = lv.walls.filter(o => o !== w);
    });
  }
  const withOrigin = refs => refs.map(r => Object.assign(r, { x0: r.o[r.kx], y0: r.o[r.ky] }));

  // ---------- Narzędzia ----------
  const tools = {};

  tools.select = {
    down(e) {
      const hit = hitTest(E.mouse);
      if (!hit) { App.select(null); E.drag = startPan(e); return; }
      App.select(hit.select);
      const before = App.snapshot(), lv = App.level(), start = { x: E.mouse.x, y: E.mouse.y };
      if (hit.type === 'vertex') {
        const refs = App.pointRefs(lv, hit.x, hit.y);
        E.drag = { type: 'vertex', before, refs, exclude: new Set(refs.map(r => r.o)) };
      } else if (hit.type === 'wall') {
        E.drag = roomWallDrag(lv, hit.obj, before, start);
        if (!E.drag) {
          const w = hit.obj, refs = addRefs(App.pointRefs(lv, w.x1, w.y1), App.pointRefs(lv, w.x2, w.y2));
          E.drag = { type: 'move', before, refs: withOrigin(refs), start };
        }
      } else if (hit.type === 'room') {
        const refs = [];
        hit.obj.pts.forEach(q => addRefs(refs, App.pointRefs(lv, q.x, q.y)));
        E.drag = { type: 'move', before, refs: withOrigin(refs), start };
      } else if (hit.type === 'opening') {
        E.drag = { type: 'opening', before, o: hit.obj };
      } else if (hit.type === 'object') {
        E.drag = { type: 'object', before, o: hit.obj, x0: hit.obj.x, y0: hit.obj.y, start };
      } else if (hit.type === 'installWall') {
        E.drag = { type: 'installWall', before, o: hit.obj };
      } else if (hit.type === 'run') {
        E.drag = { type: 'run', before, o: hit.obj, pts0: hit.obj.pts.map(q => ({ x: q.x, y: q.y })), start };
      } else if (hit.type === 'runVertex') {
        E.drag = { type: 'runVertex', before, o: hit.obj, k: hit.k };
      } else if (hit.type === 'polyVertex') {
        E.drag = { type: 'polyVertex', before, o: hit.obj, k: hit.k };
      } else if (hit.type === 'polyMove') {
        E.drag = { type: 'run', before, o: hit.obj, pts0: hit.obj.pts.map(q => ({ x: q.x, y: q.y })), start };
      } else if (hit.type === 'roofCorner') {
        const opp = G.rectCorners(hit.obj)[(hit.corner + 2) % 4];
        E.drag = { type: 'roofCorner', before, o: hit.obj, opp };
      }
    },
    move() {
      const d = E.drag;
      if (!d) {
        E.hover = hitTest(E.mouse);
        canvas.style.cursor = E.space ? 'grab' : E.hover ? (['vertex', 'roofCorner', 'runVertex', 'polyVertex'].includes(E.hover.type) ? 'move' : 'pointer') : 'default';
        return;
      }
      const g = App.project.settings.grid || 1, lv = App.level();
      if (d.type === 'vertex') {
        const s = E.snapPoint(E.mouse, { exclude: d.exclude });
        E.snap = s;
        d.refs.forEach(r => { r.o[r.kx] = s.x; r.o[r.ky] = s.y; });
      } else if (d.type === 'move') {
        let dx = Math.round((E.mouse.x - d.start.x) / g) * g, dy = Math.round((E.mouse.y - d.start.y) / g) * g;
        if (d.axis) {
          const t = Math.round(((E.mouse.x - d.start.x) * d.axis.x + (E.mouse.y - d.start.y) * d.axis.y) / g) * g;
          dx = d.axis.x * t; dy = d.axis.y * t;
        }
        d.refs.forEach(r => { r.o[r.kx] = r.x0 + dx; r.o[r.ky] = r.y0 + dy; });
      } else if (d.type === 'opening') {
        const w = lv.walls.find(x => x.id === d.o.wallId);
        if (!w) return;
        const f = App.wallFrame(w), pr = G.project(E.mouse, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
        d.o.pos = App.openingFree(w, d.o) ? Math.round(G.clamp(pr.t * f.L, -f.L, 2 * f.L)) : Math.round(G.clamp(pr.t * f.L, d.o.width / 2, f.L - d.o.width / 2));
      } else if (d.type === 'object') {
        d.o.x = Math.round((d.x0 + E.mouse.x - d.start.x) / g) * g;
        d.o.y = Math.round((d.y0 + E.mouse.y - d.start.y) / g) * g;
      } else if (d.type === 'installWall') {
        // Punkt instalacji przesuwa się wzdłuż ściany i może przejść na inną ścianę lub drugie lico.
        const t = App.installWallTarget(lv, E.mouse, 40);
        if (t) Object.assign(d.o, { wallId: t.wall.id, pos: t.pos, side: t.side });
      } else if (d.type === 'run') {
        const dx = Math.round((E.mouse.x - d.start.x) / g) * g, dy = Math.round((E.mouse.y - d.start.y) / g) * g;
        d.o.pts.forEach((q, k) => { q.x = d.pts0[k].x + dx; q.y = d.pts0[k].y + dy; });
      } else if (d.type === 'polyVertex') {
        const s = E.snapPoint(E.mouse, { exclude: new Set([d.o.pts[d.k]]), from: d.o.pts[(d.k + d.o.pts.length - 1) % d.o.pts.length] });
        E.snap = s;
        Object.assign(d.o.pts[d.k], { x: s.x, y: s.y });
      } else if (d.type === 'runVertex') {
        const s = runSnap(E.mouse);
        E.snap = s;
        Object.assign(d.o.pts[d.k], { x: s.x, y: s.y });
      } else if (d.type === 'roofCorner') {
        // Narożnik przeciwległy zostaje w miejscu, obrót dachu się nie zmienia.
        const s = E.snapPoint(E.mouse);
        E.snap = s;
        const q = G.toLocal({ x: d.opp.x, y: d.opp.y, rot: d.o.rot }, s);
        if (Math.abs(q.a) < 20 || Math.abs(q.b) < 20) return;
        d.o.l = Math.round(Math.abs(q.a));
        d.o.w = Math.round(Math.abs(q.b));
        d.o.x = (d.opp.x + s.x) / 2;
        d.o.y = (d.opp.y + s.y) / 2;
      }
    },
    up() {
      const d = E.drag;
      if (!d) return;
      E.drag = null;
      if (d.ext) cleanupExtensions(App.level(), d.ext);
      App.commit(d.before);
    },
  };

  tools.wall = {
    down() {
      const p = { x: E.snap.x, y: E.snap.y };
      if (!E.chain) { E.chain = [p]; return; }
      addChainPoint(p);
    },
  };
  function addChainPoint(p) {
    const last = E.chain[E.chain.length - 1];
    E.typed = '';
    if (G.dist(p, last) < 1) { E.chain = null; return; }
    const d = App.defaults.wall;
    App.edit(() => App.level().walls.push({ id: App.uid(), x1: last.x, y1: last.y, x2: p.x, y2: p.y, t: d.thickness, h: d.height || 0 }));
    if (E.chain.length >= 2 && G.dist(p, E.chain[0]) < 1) { E.chain = null; return; }
    E.chain.push(p);
  }

  tools.room = {
    down() {
      if (!E.rect) E.rect = { a: { x: E.snap.x, y: E.snap.y }, sx: E.screen.x, sy: E.screen.y };
      else finishRect();
    },
    up() {
      if (E.rect && Math.hypot(E.screen.x - E.rect.sx, E.screen.y - E.rect.sy) > 6) finishRect();
    },
  };
  function finishRect() {
    const a = E.rect.a, b = { x: E.snap.x, y: E.snap.y };
    E.rect = null;
    if (Math.abs(b.x - a.x) < 20 || Math.abs(b.y - a.y) < 20) return;
    createRoom([{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }]);
  }
  // Odcinki krawędzi a-b, których nie pokrywa żadna istniejąca ściana w tej samej linii (do 2 cm obok) –
  // pokój dobudowany do sąsiedniego nie dubluje wspólnej ściany.
  function uncoveredParts(lv, a, b) {
    const L = G.dist(a, b);
    if (L < 1) return [];
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, at = (t) => ({ x: a.x + ux * t, y: a.y + uy * t });
    const cover = [];
    lv.walls.forEach(w => {
      const d1 = Math.abs((w.x1 - a.x) * uy - (w.y1 - a.y) * ux), d2 = Math.abs((w.x2 - a.x) * uy - (w.y2 - a.y) * ux);
      if (d1 > 2 || d2 > 2) return;
      const t1 = (w.x1 - a.x) * ux + (w.y1 - a.y) * uy, t2 = (w.x2 - a.x) * ux + (w.y2 - a.y) * uy;
      cover.push([Math.min(t1, t2), Math.max(t1, t2)]);
    });
    cover.sort((p, q) => p[0] - q[0]);
    const parts = [];
    let t = 0;
    cover.forEach(([c0, c1]) => {
      if (c0 > t + 5) parts.push([t, Math.min(c0, L)]);
      t = Math.max(t, c1);
    });
    if (t < L - 5) parts.push([t, L]);
    return parts.filter(([p, q]) => q - p > 5).map(([p, q]) => [at(p), at(q)]);
  }

  function createRoom(pts) {
    const d = App.defaults.room, lv = App.level();
    const names = new Set(lv.rooms.map(r => r.name));
    let name = d.name || 'Pokój', n = 2;
    while (names.has(name)) name = `${d.name || 'Pokój'} ${n++}`;
    let id;
    App.edit(() => {
      const room = { id: App.uid(), name, color: App.ROOM_COLORS[lv.rooms.length % App.ROOM_COLORS.length], pts };
      lv.rooms.push(room);
      id = room.id;
      if (d.makeWalls) {
        pts.forEach((a, i) => {
          const b = pts[(i + 1) % pts.length];
          uncoveredParts(lv, a, b).forEach(([p, q]) => lv.walls.push({ id: App.uid(), x1: p.x, y1: p.y, x2: q.x, y2: q.y, t: d.thickness, h: 0 }));
        });
      }
    });
    App.select(id);
  }

  tools.roof = {
    down() { E.rect = { a: { x: E.snap.x, y: E.snap.y }, sx: E.screen.x, sy: E.screen.y }; },
    up() {
      if (!E.rect) return;
      const a = E.rect.a, b = E.snap, moved = Math.hypot(E.screen.x - E.rect.sx, E.screen.y - E.rect.sy) > 6;
      E.rect = null;
      const lv = App.level();
      let roof = null;
      if (moved) {
        if (Math.abs(b.x - a.x) >= 50 && Math.abs(b.y - a.y) >= 50) roof = App.roofFromRect(a.x, a.y, b.x, b.y);
      } else {
        // Kliknięcie: dach nad pokojem pod kursorem (po zewnętrznym licu ścian) albo nad całą kondygnacją.
        const rooms = lv.rooms.filter(r => G.inside(E.mouse, r.pts)).sort((x, y) => Math.abs(G.area(x.pts)) - Math.abs(G.area(y.pts)));
        if (rooms.length) {
          const pts = rooms[0].pts, walls = pts.map((q, k) => App.edgeWall(lv, q, pts[(k + 1) % pts.length])).filter(Boolean);
          const e = walls.reduce((m, w) => Math.max(m, w.t / 2), 0);
          const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
          roof = App.roofFromRect(Math.min(...xs) - e, Math.min(...ys) - e, Math.max(...xs) + e, Math.max(...ys) + e);
        } else if (lv.walls.length) {
          roof = App.roofOverWalls(lv, lv.walls);
        }
      }
      if (!roof) return;
      App.edit(() => lv.roofs.push(roof));
      E.setTool('select');
      App.select(roof.id);
    },
  };

  tools.poly = {
    down() {
      const p = { x: E.snap.x, y: E.snap.y };
      if (!E.poly) { E.poly = [p]; return; }
      addPolyPoint(p);
    },
  };
  function addPolyPoint(p) {
    E.typed = '';
    if (E.poly.length >= 3 && G.dist(p, E.poly[0]) < 1) { closePoly(); return; }
    if (G.dist(p, E.poly[E.poly.length - 1]) < 1) { if (E.tool === 'fence' || (E.tool === 'path' && App.defaults.path.mode === 'strip')) closePoly(false); else if (E.poly.length >= 3) closePoly(); return; }
    E.poly.push(p);
  }
  // Zamknięcie rysowanego wielokąta / łamanej: closed – kliknięto pierwszy punkt.
  function closePoly(closed = true) {
    const pts = E.poly, t = E.tool, lv = App.level();
    E.poly = null;
    if (!pts) return;
    const area = pts.length >= 3 && Math.abs(G.area(pts)) > 400;
    let obj = null;
    if (t === 'poly') { if (area) createRoom(pts); return; }
    if (t === 'plot' && area) obj = App.makePlot(pts, lv.plots.length + 1);
    if (t === 'path') {
      const d = App.defaults.path;
      if (d.mode === 'strip') { if (pts.length >= 2) obj = App.makePath(App.stripPolygon(closed ? [...pts, pts[0]] : pts, d.width), d.kind); }
      else if (area) obj = App.makePath(pts, d.kind);
    }
    if (t === 'fence' && pts.length >= 2) obj = App.makeFence(pts, closed && pts.length >= 3);
    if (!obj) return;
    App.edit(() => lv[obj.kind + 's'].push(obj));
    App.select(obj.id);
  }
  tools.plot = tools.path = tools.fence = tools.poly;
  tools.garden = { down() { tools.furniture.down(); } };

  function openingTarget(kind) {
    const lv = App.level(), p = E.mouse, d = App.defaults[kind];
    let best = null, bd = Infinity;
    lv.walls.forEach(w => {
      const pr = G.project(p, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
      if (pr.d < w.t / 2 + 14 / E.scale && pr.d < bd) { bd = pr.d; best = { w, pr }; }
    });
    if (!best) return null;
    const { w, pr } = best, f = App.wallFrame(w);
    const width = kind === 'window' && d.gable ? d.width : Math.min(d.width, f.L);
    // Okno w szczycie może wychodzić poza swoją ścianę (np. na styk dwóch ścian pod kalenicą).
    const pos = kind === 'window' && d.gable ? Math.round(pr.t * f.L / 5) * 5 : G.clamp(Math.round(pr.t * f.L / 5) * 5, width / 2, f.L - width / 2);
    const sill = kind !== 'window' ? 0 : d.gable ? App.wallHeight(lv, w) + 30 : d.sill, top = sill + d.height;
    // Otwory kolidują tylko wtedy, gdy nachodzą na siebie i w poziomie, i w pionie (okno szczytowe nad oknem garażu).
    const ok = !lv.openings.some(o => o.wallId === w.id && Math.abs(App.openingPos(w, o) - pos) < (o.width + width) / 2 - 0.5 &&
      App.openingSill(o) < top && sill < App.openingSill(o) + o.height);
    const side = (p.x - w.x1) * f.nx + (p.y - w.y1) * f.ny > 0;
    return { kind, wall: w, pos, width, sill, ok, side };
  }
  const openingTool = (kind) => ({
    move() { E.preview = openingTarget(kind); },
    down() {
      const t = openingTarget(kind);
      if (!t || !t.ok) return;
      const d = App.defaults[kind];
      App.edit(() => App.level().openings.push({
        id: App.uid(), kind, wallId: t.wall.id, pos: t.pos, width: t.width, height: d.height,
        sill: t.sill, flip: false, side: t.side,
      }));
      E.preview = openingTarget(kind);
    },
  });
  tools.door = openingTool('door');
  tools.window = openingTool('window');

  E.makeObject = (kind, x, y) => {
    const d = App.defaults[kind];
    if (kind === 'dormer') {
      const o = { id: App.uid(), kind, x, y, l: d.width, w: 100, rot: 0, h: d.height, roof: d.roof, pitch: d.pitch, windows: d.windows, flush: !!d.flush };
      syncDormer(o);
      return o;
    }
    if (kind === 'furniture') {
      const o = App.makeFurniture(E.furnType(), x, y, E.snap && E.snap.rot != null ? E.snap.rot : E.objRot);
      o.flip = E.objFlip;
      const md = App.furnitureDef(o.type).model && App.model3d(App.defaults.furniture.model);
      if (md) Object.assign(o, { model: md.id, l: md.l, w: md.w, h: md.h });
      return o;
    }
    if (kind === 'roofwin') {
      const fr = App.roofWinFrame({ x, y }, App.project.current);
      return { id: App.uid(), kind, x, y, l: d.width, w: d.length, rot: fr ? fr.rot : 0 };
    }
    if (kind !== 'stairs') return { id: App.uid(), kind, x, y, l: d.width, w: d.depth, above: d.above, rot: E.objRot };
    const o = { id: App.uid(), kind, x, y, l: d.length, w: d.width, fw: d.width, steps: d.steps, rot: E.objRot, flip: E.objFlip, shape: 'straight' };
    App.setStairShape(o, d.shape || 'straight');
    return o;
  };
  // Rodzaj stawianego mebla – narzędzie Ogród ma własny wybór (rośliny, wyposażenie ogrodu, bramy).
  E.furnType = () => (E.tool === 'garden' ? App.defaults.garden.type : App.defaults.furniture.type);
  // Mebel przy ścianie: tyłem do lica ściany, frontem do kursora (do wnętrza pokoju).
  function furnitureSnap() {
    const def = App.furnitureDef(E.furnType());
    if (E.shift || def.free) return null;
    let best = null;
    App.level().walls.forEach(w => {
      const a = { x: w.x1, y: w.y1 }, b = { x: w.x2, y: w.y2 }, pr = G.project(E.mouse, a, b);
      const face = pr.d - w.t / 2;
      if (pr.t < 0 || pr.t > 1 || face > def.w / 2 + 15) return;
      if (best && best.d <= face) return;
      const f = App.wallFrame(w), s = (E.mouse.x - pr.x) * f.nx + (E.mouse.y - pr.y) * f.ny >= 0 ? 1 : -1;
      const dx = f.nx * s, dy = f.ny * s, off = w.t / 2 + def.w / 2;
      best = { d: face, x: round1(pr.x + dx * off), y: round1(pr.y + dy * off), kind: 'wall', rot: Math.round(Math.atan2(-dx, dy) * 180 / Math.PI * 100) / 100 };
    });
    return best;
  }
  // ---------- Instalacje ----------
  // Punkt trasy: punkty instalacji i wierzchołki tras, potem oś najbliższej ściany, inaczej siatka (Shift – kąty co 45°).
  function runSnap(p) {
    const lv = App.level(), tol = 10 / E.scale;
    let best = null, bd = tol;
    const cand = (q, kind) => { const d = G.dist(p, q); if (d < bd) { bd = d; best = { x: q.x, y: q.y, kind }; } };
    lv.installs.forEach(o => {
      if (o.pts) o.pts.forEach(q => cand(q, 'point'));
      else { const at = App.installAt(lv, o); if (at) cand(at.a, 'point'); }
    });
    if (E.run) E.run.forEach(q => cand(q, 'point'));
    lv.walls.forEach(w => { cand({ x: w.x1, y: w.y1 }, 'point'); cand({ x: w.x2, y: w.y2 }, 'point'); });
    if (best) return best;
    const g = App.project.settings.grid || 1;
    let q = { x: p.x, y: p.y };
    const last = E.run && E.run[E.run.length - 1];
    if (last && E.shift) {
      const a = Math.round(Math.atan2(p.y - last.y, p.x - last.x) / (Math.PI / 4)) * Math.PI / 4, L = G.dist(p, last);
      q = { x: last.x + Math.cos(a) * L, y: last.y + Math.sin(a) * L };
    }
    let wb = null;
    lv.walls.forEach(w => {
      const pr = G.project(q, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
      if (pr.d < w.t / 2 + tol && (!wb || pr.d < wb.d)) wb = Object.assign(pr, { w });
    });
    if (wb) {
      // W osi ściany; przy prostym odcinku od poprzedniego punktu – zachowany kierunek.
      if (last && Math.abs(wb.x - last.x) < tol) return { x: round1(last.x), y: round1(wb.y), kind: 'axis' };
      if (last && Math.abs(wb.y - last.y) < tol) return { x: round1(wb.x), y: round1(last.y), kind: 'axis' };
      // Położenie wzdłuż ściany wyrównane do siatki (ponowny rzut na oś).
      const wl = wb.w, gp = G.project({ x: Math.round(wb.x / g) * g, y: Math.round(wb.y / g) * g }, { x: wl.x1, y: wl.y1 }, { x: wl.x2, y: wl.y2 });
      return { x: round1(gp.x), y: round1(gp.y), kind: 'axis' };
    }
    return { x: Math.round(q.x / g) * g, y: Math.round(q.y / g) * g, kind: 'grid' };
  }
  function finishRun() {
    const pts = E.run;
    E.run = null;
    if (!pts || pts.length < 2) return;
    App.edit(() => App.level().installs.push(App.makeInstall(App.defaults.install.type, App.level(), { pts })));
  }
  tools.install = {
    down() {
      const type = App.defaults.install.type, d = App.installDef(type), lv = App.level();
      if (!E.instOn() || !E.instVisible({ type })) E.setInstLayer('all');
      if (d.shape === 'wall') {
        const t = App.installWallTarget(lv, E.mouse, 40);
        if (t) App.edit(() => lv.installs.push(App.makeInstall(type, lv, t)));
      } else if (d.shape === 'free') {
        App.edit(() => lv.installs.push(App.makeInstall(type, lv, { x: E.snap.x, y: E.snap.y })));
      } else {
        const q = { x: E.snap.x, y: E.snap.y };
        if (!E.run) { E.run = [q]; return; }
        const last = E.run[E.run.length - 1];
        if (G.dist(q, last) < 1) { finishRun(); return; }
        E.run.push(q);
      }
    },
  };

  tools.furniture = {
    down() {
      const o = E.makeObject('furniture', E.snap.x, E.snap.y);
      if (App.furnitureDef(o.type).model && !o.model) return alert('Najpierw zaimportuj model 3D (.glb) w panelu po prawej.');
      App.edit(() => App.level().objects.push(o));
    },
  };
  const objectTool = (kind) => ({
    down() { App.edit(() => App.level().objects.push(E.makeObject(kind, E.snap.x, E.snap.y))); },
  });
  tools.stairs = objectTool('stairs');
  tools.chimney = objectTool('chimney');
  const roofObjectTool = (kind) => ({
    down() {
      if (!App.roofAt(App.project.current, E.snap)) return;
      App.edit(() => App.level().objects.push(E.makeObject(kind, E.snap.x, E.snap.y)));
    },
  });
  tools.roofwin = roofObjectTool('roofwin');
  tools.dormer = roofObjectTool('dormer');
  // Obrót i głębokość lukarny wynikają z połaci – zapisywane, żeby zaznaczanie trafiało w jej obrys.
  function syncDormer(o) {
    const d = App.dormerFrame(o, App.project.current);
    if (!d) return null;
    o.rot = Math.round(d.rot * 100) / 100;
    o.w = Math.round(d.depth * 10) / 10;
    // Czoło w licu ściany: środek obrysu przesuwa się tak, by czoło leżało na ścianie.
    if (d.flush && Math.abs(d.bF + d.depth / 2) > 0.5) {
      const c = G.local({ x: o.x, y: o.y, rot: d.rot }, 0, d.bF + d.depth / 2);
      o.x = Math.round(c.x * 10) / 10;
      o.y = Math.round(c.y * 10) / 10;
      return App.dormerFrame(o, App.project.current);
    }
    return d;
  }

  // ---------- Klawiatura (wywoływana z ui.js) ----------
  E.typing = () => (E.tool === 'wall' && E.chain) || (POLY_TOOLS.includes(E.tool) && E.poly);
  E.typeKey = (k) => {
    if (k === 'Backspace') {
      if (E.typed) E.typed = E.typed.slice(0, -1);
      else if (E.poly) { E.poly.pop(); if (!E.poly.length) E.poly = null; }
      else return false;
    } else if (k === 'Enter') {
      const len = parseFloat(E.typed.replace(',', '.'));
      if (len > 0) {
        const pts = E.tool === 'wall' ? E.chain : E.poly, last = pts[pts.length - 1];
        let dx = E.snap ? E.snap.x - last.x : 1, dy = E.snap ? E.snap.y - last.y : 0;
        const l = Math.hypot(dx, dy);
        if (l < 1e-6) { dx = 1; dy = 0; } else { dx /= l; dy /= l; }
        const p = { x: round1(last.x + dx * len), y: round1(last.y + dy * len) };
        if (E.tool === 'wall') addChainPoint(p); else addPolyPoint(p);
      } else E.finish();
      E.typed = '';
    } else if (/^[0-9.,]$/.test(k)) {
      E.typed += k;
    } else return false;
    App.emit('cursor');
    E.render();
    return true;
  };
  // ---------- Kopiuj / wklej ----------
  // Schowek trzyma kopię danych: { kind, items: { walls, rooms, openings, objects, roofs } } i punkt odniesienia.
  // Pokój idzie razem ze ścianami na jego obrysie i ich otworami, ściana – ze swoimi otworami.
  const clone = (o) => JSON.parse(JSON.stringify(o));
  E.clipboard = null;
  E.copy = () => {
    const sel = App.find(App.selection);
    if (!sel) return false;
    const lv = App.level(), o = sel.obj, items = { walls: [], rooms: [], openings: [], objects: [], roofs: [] };
    if (sel.kind === 'room') {
      items.rooms.push(o);
      // Ściany przycięte do krawędzi pokoju (długa ściana zewnętrzna nie idzie w całości) z otworami z tego odcinka.
      o.pts.forEach((a, k) => {
        const b = o.pts[(k + 1) % o.pts.length], L = G.dist(a, b);
        const w = lv.walls.find(x => App.edgeOnWall(x, a, b));
        if (!w || L < 1) return;
        const nw = { id: App.uid(), x1: a.x, y1: a.y, x2: b.x, y2: b.y, t: w.t, h: w.h || 0 };
        items.walls.push(nw);
        const f = App.wallFrame(w), ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
        lv.openings.filter(op => op.wallId === w.id).forEach(op => {
          const p0 = App.openingPos(w, op), cx = w.x1 + f.ux * p0, cy = w.y1 + f.uy * p0;
          const t = (cx - a.x) * ux + (cy - a.y) * uy;
          if (t - op.width / 2 < -1 || t + op.width / 2 > L + 1) return;
          items.openings.push(Object.assign(clone(op), { wallId: nw.id, pos: t }));
        });
      });
    } else if (sel.kind === 'wall') items.walls.push(o);
    else if (sel.kind === 'opening') items.openings.push(o);
    else if (sel.kind === 'object') items.objects.push(o);
    else if (sel.kind === 'roof') items.roofs.push(o);
    else if (sel.kind === 'install') items.installs = [o];
    else if (sel.kind === 'plot' || sel.kind === 'path' || sel.kind === 'fence') items[sel.kind + 's'] = [o];
    if (sel.kind === 'wall') items.openings = lv.openings.filter(op => op.wallId === o.id);
    // Punkt odniesienia – środek obrysu; przy wklejaniu trafia pod kursor.
    const pts = [...items.walls.flatMap(w => [{ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }]), ...items.rooms.flatMap(r => r.pts), ...items.objects, ...items.roofs,
      ...['plots', 'paths', 'fences'].flatMap(k => (items[k] || []).flatMap(o => o.pts))];
    let ref = null;
    if (pts.length) {
      const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
      ref = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    }
    E.clipboard = { kind: sel.kind, items: clone(items), ref, pastes: 0 };
    App.emit('clipboard');
    return true;
  };
  E.paste = () => {
    const cb = E.clipboard;
    if (!cb) return false;
    const lv = App.level(), it = clone(cb.items), g = App.project.settings.grid || 1;
    // Otwór: do ściany pod kursorem albo do tej samej ściany obok oryginału.
    if (cb.kind === 'opening') {
      const op = it.openings[0];
      const t = E.inside ? openingTarget(op.kind) : null;
      let w = t && t.wall, pos = t && t.pos;
      if (!w) {
        w = lv.walls.find(x => x.id === op.wallId);
        if (!w) return false;
        pos = App.openingPos(w, op) + (op.width + 20) * (cb.pastes + 1);
      }
      const L = App.wallFrame(w).L;
      if (op.width > L) return false;
      App.edit(() => lv.openings.push(Object.assign(op, { id: App.uid(), wallId: w.id, pos: G.clamp(pos, op.width / 2, L - op.width / 2) })));
      cb.pastes++;
      App.select(op.id);
      return true;
    }
    // Instalacja: punkt na ścianie – pod kursor albo obok oryginału; swobodny punkt i trasa – przesunięte.
    if (cb.kind === 'install') {
      const o = it.installs[0], n = cb.pastes + 1;
      o.id = App.uid();
      if (o.wallId) {
        const t = E.inside ? App.installWallTarget(lv, E.mouse, 40) : null;
        if (t) Object.assign(o, { wallId: t.wall.id, pos: t.pos, side: t.side });
        else o.pos += 20 * n;
      } else if (o.pts) o.pts.forEach(q => { q.x += 30 * n; q.y += 30 * n; });
      else if (E.inside) { o.x = Math.round(E.mouse.x / g) * g; o.y = Math.round(E.mouse.y / g) * g; }
      else { o.x += 30 * n; o.y += 30 * n; }
      App.edit(() => lv.installs.push(o));
      cb.pastes++;
      App.select(o.id);
      return true;
    }
    let dx, dy;
    if (E.inside && cb.ref) {
      dx = Math.round((E.mouse.x - cb.ref.x) / g) * g;
      dy = Math.round((E.mouse.y - cb.ref.y) / g) * g;
    } else {
      dx = dy = 50 * (cb.pastes + 1);
    }
    const ids = {};
    const fresh = (o) => { ids[o.id] = App.uid(); o.id = ids[o.id]; return o; };
    App.edit(() => {
      it.walls.forEach(w => { fresh(w); w.x1 += dx; w.y1 += dy; w.x2 += dx; w.y2 += dy; lv.walls.push(w); });
      it.openings.forEach(op => { const wid = ids[op.wallId]; if (!wid) return; fresh(op); op.wallId = wid; lv.openings.push(op); });
      it.rooms.forEach(r => { fresh(r); r.pts.forEach(q => { q.x += dx; q.y += dy; }); lv.rooms.push(r); });
      it.objects.forEach(o => { fresh(o); o.x += dx; o.y += dy; lv.objects.push(o); });
      it.roofs.forEach(r => { fresh(r); r.x += dx; r.y += dy; lv.roofs.push(r); });
      ['plots', 'paths', 'fences'].forEach(k => (it[k] || []).forEach(o => { fresh(o); o.pts.forEach(q => { q.x += dx; q.y += dy; }); lv[k].push(o); }));
    });
    cb.pastes++;
    const main = it.rooms[0] || it.walls[0] || it.objects[0] || it.roofs[0] || ['plots', 'paths', 'fences'].map(k => (it[k] || [])[0]).find(Boolean);
    if (main) App.select(main.id);
    return true;
  };

  E.mirror = () => {
    const sel = App.find(App.selection);
    if (sel && sel.kind === 'object' && (sel.obj.kind === 'stairs' || sel.obj.kind === 'furniture')) {
      App.edit(() => { sel.obj.flip = !sel.obj.flip; });
    } else if (E.tool === 'stairs' || E.tool === 'furniture' || E.tool === 'garden') {
      E.objFlip = !E.objFlip;
      E.render();
    }
  };
  E.rotate = () => {
    const sel = App.find(App.selection);
    if (sel && (sel.kind === 'object' || sel.kind === 'roof')) {
      App.edit(() => { sel.obj.rot = ((sel.obj.rot + 90) % 360 + 360) % 360; });
    } else if (E.tool === 'stairs' || E.tool === 'chimney' || E.tool === 'furniture' || E.tool === 'garden') {
      E.objRot = (E.objRot + 90) % 360;
      E.render();
    }
  };

  // Wzór tekstury podłogi na rzucie (w cm – rysunek jest w układzie świata).
  function texPattern(assign) {
    const tile = App.texTile(assign);
    if (!tile) return null;
    const pat = ctx.createPattern(tile.canvas, 'repeat');
    pat.setTransform(new DOMMatrix().scale(tile.tw / tile.canvas.width, tile.th / tile.canvas.height));
    return pat;
  }

  // ---------- Rysowanie ----------
  const world = () => ctx.setTransform(dpr * E.scale, 0, 0, dpr * E.scale, dpr * E.ox, dpr * E.oy);
  const screen = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const px = n => n / E.scale;
  function path(pts, close = true) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (close) ctx.closePath();
  }
  function line(a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  function label(x, y, text, opt = {}) {
    const s = E.toScreen(x, y);
    screen();
    ctx.save();
    ctx.translate(s.x, s.y);
    if (opt.angle) ctx.rotate(opt.angle);
    ctx.font = opt.font || '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (opt.bg) {
      const m = ctx.measureText(text).width;
      ctx.fillStyle = opt.bg;
      ctx.fillRect(-m / 2 - 4, -9, m + 8, 18);
    }
    ctx.fillStyle = opt.color || '#374151';
    ctx.fillText(text, 0, opt.dy || 0);
    ctx.restore();
    world();
  }
  const fmtM = cm => (cm / 100).toFixed(2).replace('.', ',') + ' m';

  function draw() {
    pending = false;
    if (!W || !App.project) return;
    const p = App.project, lv = App.level(), s = p.settings;
    const tech = E.tech, only = E.instOnly;
    screen();
    ctx.fillStyle = tech ? '#ffffff' : BG;
    ctx.fillRect(0, 0, W, H);
    if (!tech) drawGrid();
    world();
    ctx.lineJoin = 'round';

    // Kondygnacja poniżej jako podkład.
    const below = p.levels[p.current - 1];
    if (below && !tech) {
      ctx.fillStyle = 'rgba(100,116,139,0.16)';
      below.walls.forEach(w => { path(App.wallPolygon(below, w)); ctx.fill(); });
      ctx.setLineDash([px(4), px(4)]);
      ctx.strokeStyle = 'rgba(100,116,139,0.6)';
      ctx.lineWidth = px(1);
      below.objects.filter(o => o.kind === 'stairs').forEach(o => { path(G.rectCorners(o)); ctx.stroke(); });
      ctx.setLineDash([]);
    }

    drawSite(lv, tech);
    lv.rooms.forEach(r => {
      path(r.pts);
      ctx.fillStyle = tech || only ? '#ffffff' : texPattern(r.texFloor) || r.color || '#eee';
      ctx.fill();
    });
    // Tylko instalacje: ściany i otwory przygaszone, żeby przewody i rury były na pierwszym planie.
    if (only) ctx.globalAlpha = 0.3;
    lv.walls.forEach(w => {
      path(App.wallPolygon(lv, w));
      if (tech) {
        // Rysunek techniczny: przekrój ściany kreskowany, obrys czarny.
        ctx.fillStyle = hatch();
        ctx.fill();
        ctx.strokeStyle = App.selection === w.id ? SEL : '#111';
        ctx.lineWidth = px(1.3);
        ctx.stroke();
        return;
      }
      ctx.fillStyle = App.selection === w.id ? '#1e40af' : '#2f3542';
      ctx.fill();
    });
    lv.openings.forEach(o => drawOpening(lv, o));
    lv.fences.forEach(o => drawFence(o, tech));
    // Kominy z niższych kondygnacji przechodzą przez wyższe.
    for (let i = 0; i < p.current && !only; i++) {
      p.levels[i].objects.filter(o => o.kind === 'chimney').forEach(o => drawObject(o, true));
    }
    if (!only) lv.objects.forEach(o => drawObject(o, false));
    ctx.globalAlpha = 1;
    if (E.instOn()) lv.installs.forEach(o => { if (E.instVisible(o)) App.drawInstall(ctx, lv, o, px(1), App.selection === o.id); });
    if (!only) lv.roofs.forEach(drawRoof);
    // Strych: obrys miejsca, w którym połać poddasza jest jeszcze nad podłogą.
    if (!only) App.roofsOver(p.current).forEach(({ r, k }) => {
      const sec = App.roofSection(r, k, App.elevation(p.current));
      if (!sec) return;
      path(sec);
      ctx.strokeStyle = 'rgba(154,52,18,0.55)';
      ctx.lineWidth = px(1);
      ctx.setLineDash([px(2), px(4)]);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    if (tech) drawTechDims(lv);
    else if (s.dims && !only) lv.walls.forEach(drawWallDim);
    lv.rooms.forEach(r => drawRoomLabel(lv, r));
    lv.plots.forEach(o => drawPlotLabels(o, tech, s.dims || tech));
    if (E.instOn() && E.instDims) drawInstallDims(lv);
    if (tech) { drawTitle(lv); if (E.instOn()) drawInstallLegend(lv); }

    if (E.hover && E.tool === 'select' && !E.drag && E.hover.select !== App.selection) drawOutline(E.hover.obj || App.find(E.hover.select).obj, 'rgba(37,99,235,0.45)', 2);
    const sel = App.find(App.selection);
    if (sel) drawOutline(sel.obj, SEL, 2.5, true);
    drawToolPreview();
    drawWalker();
    drawScaleBar();
  }

  // Ludzik ze spaceru w 3D: pozycja i pole widzenia.
  function drawWalker() {
    const w = App.walker;
    if (!w || w.level !== App.project.current) return;
    const a = Math.atan2(-Math.cos(w.yaw), -Math.sin(w.yaw)), half = Math.min(1.4, w.fov * Math.PI / 360), R = px(70);
    const grad = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, R);
    grad.addColorStop(0, 'rgba(245,158,11,0.45)');
    grad.addColorStop(1, 'rgba(245,158,11,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(w.x, w.y);
    ctx.arc(w.x, w.y, R, a - half, a + half);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w.x, w.y, Math.max(px(7), 22), 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.lineWidth = px(2);
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }

  function drawGrid() {
    const g = App.project.settings.grid || 10;
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000];
    const minor = steps.find(s => s >= g && s * E.scale >= 8) || 5000;
    const major = [100, 500, 1000, 5000].find(s => s * E.scale >= 40) || 10000;
    const a = E.toWorld(0, 0), b = E.toWorld(W, H);
    const lines = (step, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = Math.floor(a.x / step) * step; x <= b.x; x += step) {
        const sx = Math.round(x * E.scale + E.ox) + 0.5;
        ctx.moveTo(sx, 0); ctx.lineTo(sx, H);
      }
      for (let y = Math.floor(a.y / step) * step; y <= b.y; y += step) {
        const sy = Math.round(y * E.scale + E.oy) + 0.5;
        ctx.moveTo(0, sy); ctx.lineTo(W, sy);
      }
      ctx.stroke();
    };
    if (minor < major) lines(minor, '#eeeeea');
    lines(major, '#dcdcd6');
  }

  function openingGeom(lv, o) {
    const w = lv.walls.find(x => x.id === o.wallId);
    if (!w) return null;
    const f = App.wallFrame(w), pos = App.openingPos(w, o);
    const cx = w.x1 + f.ux * pos, cy = w.y1 + f.uy * pos;
    const P = (a, b) => ({ x: cx + f.ux * a + f.nx * b, y: cy + f.uy * a + f.ny * b });
    return { w, f, P, hw: (App.openingFree(w, o) ? o.width : Math.min(o.width, f.L)) / 2, ht: w.t / 2 };
  }

  function drawOpening(lv, o, preview) {
    const g = openingGeom(lv, o);
    if (!g) return;
    const { P, hw, ht, f } = g;
    const color = preview ? (o.ok === false ? '#dc2626' : '#16a34a') : App.selection === o.id ? SEL : '#1f2937';
    if (App.isGableWindow(lv, o)) {
      // Okno ponad płaszczyzną cięcia rzutu – tylko przerywany obrys.
      path([P(-hw, -ht - 2), P(hw, -ht - 2), P(hw, ht + 2), P(-hw, ht + 2)]);
      ctx.fillStyle = preview ? 'rgba(22,163,74,0.25)' : 'rgba(219,234,254,0.35)';
      ctx.fill();
      ctx.strokeStyle = color === '#1f2937' ? '#60a5fa' : color;
      ctx.lineWidth = px(1.4);
      ctx.setLineDash([px(4), px(3)]);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    path([P(-hw, -ht - 0.5), P(hw, -ht - 0.5), P(hw, ht + 0.5), P(-hw, ht + 0.5)]);
    ctx.fillStyle = BG;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = px(1.2);
    line(P(-hw, -ht), P(-hw, ht));
    line(P(hw, -ht), P(hw, ht));
    if (o.kind === 'window') {
      path([P(-hw, -ht * 0.35), P(hw, -ht * 0.35), P(hw, ht * 0.35), P(-hw, ht * 0.35)]);
      ctx.fillStyle = preview ? 'rgba(22,163,74,0.15)' : '#dbeafe';
      ctx.fill();
      ctx.stroke();
      line(P(-hw, 0), P(hw, 0));
      line(P(-hw, -ht), P(hw, -ht));
      line(P(-hw, ht), P(hw, ht));
    } else if (o.gate) {
      ctx.setLineDash([px(5), px(3)]);
      line(P(-hw, 0), P(hw, 0));
      ctx.setLineDash([]);
      ctx.lineWidth = px(2);
      line(P(-hw, ht * 0.6), P(hw, ht * 0.6));
    } else {
      const hs = o.flip ? 1 : -1, sd = o.side ? 1 : -1, r = hw * 2;
      const hinge = P(hs * hw, sd * ht);
      const tip = { x: hinge.x + f.nx * sd * r, y: hinge.y + f.ny * sd * r };
      ctx.lineWidth = px(2);
      line(hinge, tip);
      ctx.lineWidth = px(1);
      ctx.setLineDash([px(3), px(3)]);
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const th = k / 24 * Math.PI / 2, c = Math.cos(th) * r, s = Math.sin(th) * r;
        const x = hinge.x - hs * f.ux * c + f.nx * sd * s, y = hinge.y - hs * f.uy * c + f.ny * sd * s;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawObject(o, ghost, bad) {
    const c = G.rectCorners(o);
    const sel = !ghost && App.selection === o.id;
    if (o.kind === 'furniture') {
      App.drawFurniturePlan(ctx, o, px(1), sel, E.tech);
      return;
    }
    ctx.lineWidth = px(1.2);
    if (ghost) ctx.globalAlpha = 0.55;
    if (o.kind === 'dormer') {
      // Rzut lukarny: obrys, ścianka czołowa (gruba linia) i kalenica przy dachu dwuspadowym.
      const d = syncDormer(o);
      const cr = G.rectCorners(o);
      path(cr);
      ctx.fillStyle = bad || !d ? 'rgba(220,38,38,0.25)' : 'rgba(176,82,58,0.35)';
      ctx.fill();
      ctx.strokeStyle = sel ? SEL : bad || !d ? '#dc2626' : '#7c2d12';
      ctx.lineWidth = px(sel ? 2 : 1.2);
      ctx.stroke();
      ctx.lineWidth = px(3);
      line(cr[0], cr[1]);
      ctx.lineWidth = px(1);
      if (o.roof === 'gable') line(G.local(o, 0, -o.w / 2), G.local(o, 0, o.w / 2));
      const c = G.local(o, 0, 0);
      if (o.l * E.scale > 50) label(c.x, c.y, 'Lukarna', { color: '#7c2d12', font: '10px system-ui, sans-serif', bg: 'rgba(252,252,250,0.7)' });
      ctx.globalAlpha = 1;
      return;
    }
    if (o.kind === 'roofwin') {
      // Rzut okna dachowego: długość skrócona o spadek połaci.
      const fr = App.roofWinFrame(o, App.project.current);
      if (fr) o.rot = Math.round(fr.rot * 100) / 100;
      const k = fr ? Math.cos(fr.slope) : 1, q = { x: o.x, y: o.y, rot: o.rot, l: o.l, w: o.w * k };
      path(G.rectCorners(q));
      ctx.fillStyle = bad ? 'rgba(220,38,38,0.25)' : '#c7dbef';
      ctx.fill();
      ctx.strokeStyle = sel ? SEL : bad ? '#dc2626' : '#334155';
      ctx.lineWidth = px(sel ? 2 : 1.2);
      ctx.stroke();
      ctx.lineWidth = px(0.8);
      path(G.rectCorners(Object.assign({}, q, { l: q.l - 16, w: q.w - 16 * k })));
      ctx.stroke();
      line(G.local(q, 0, -q.w / 2), G.local(q, 0, q.w / 2));
      ctx.globalAlpha = 1;
      return;
    }
    if (o.kind === 'stairs') {
      const lay = App.stairLayout(o), L = (q) => G.local(o, q[0], q[1]);
      ctx.strokeStyle = sel ? SEL : '#4b5563';
      ctx.lineWidth = px(0.8);
      lay.parts.forEach(q => {
        path([L([q.a0, q.b0]), L([q.a1, q.b0]), L([q.a1, q.b1]), L([q.a0, q.b1])]);
        ctx.fillStyle = q.landing ? '#e7e3da' : '#f1efe9';
        ctx.fill();
        ctx.stroke();
      });
      ctx.lineWidth = px(1.4);
      path(c);
      ctx.stroke();
      const pts = lay.path.map(L), s0 = pts[0], s1 = pts[pts.length - 1], s2 = pts[pts.length - 2];
      path(pts, false);
      ctx.stroke();
      const d = G.dist(s1, s2) || 1, ux = (s1.x - s2.x) / d, uy = (s1.y - s2.y) / d, ah = Math.min(px(10), o.w / 4);
      path([s1, { x: s1.x - ux * ah * 1.5 - uy * ah * 0.7, y: s1.y - uy * ah * 1.5 + ux * ah * 0.7 }, { x: s1.x - ux * ah * 1.5 + uy * ah * 0.7, y: s1.y - uy * ah * 1.5 - ux * ah * 0.7 }]);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s0.x, s0.y, px(3), 0, Math.PI * 2);
      ctx.fill();
    } else {
      path(c);
      ctx.fillStyle = '#a0523d';
      ctx.fill();
      ctx.strokeStyle = sel ? SEL : '#4a2418';
      ctx.stroke();
      const f = 0.28;
      path([G.local(o, -o.l * f, -o.w * f), G.local(o, o.l * f, -o.w * f), G.local(o, o.l * f, o.w * f), G.local(o, -o.l * f, o.w * f)]);
      ctx.fillStyle = '#2b2522';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawRoof(r) {
    const sel = App.selection === r.id;
    ctx.strokeStyle = sel ? SEL : 'rgba(154,52,18,0.8)';
    ctx.lineWidth = px(sel ? 2 : 1.3);
    ctx.setLineDash([px(7), px(4)]);
    roofLines(r).forEach(([a, b]) => line(a, b));
    ctx.setLineDash([]);
    if (r.type === 'shed') {
      const a = G.local(r, 0, r.w / 2 - px(14)), b = G.local(r, 0, -r.w / 2 + px(14));
      line(a, b);
      path([b, G.local(r, -px(5), -r.w / 2 + px(24)), G.local(r, px(5), -r.w / 2 + px(24))]);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }
    const names = Object.fromEntries(App.ROOF_TYPES);
    const c = G.local(r, -r.l / 4, 0);
    if (r.l * E.scale > 120) label(c.x, c.y, `Dach ${names[r.type] || ''} ${r.pitch}°`, { color: 'rgba(154,52,18,0.9)', font: '10px system-ui, sans-serif', bg: 'rgba(252,252,250,0.8)' });
  }

  function drawWallDim(w) {
    const f = App.wallFrame(w);
    if (f.L * E.scale < 45) return;
    let ang = Math.atan2(f.uy, f.ux);
    if (ang > Math.PI / 2 + 1e-3) ang -= Math.PI;
    if (ang <= -Math.PI / 2 + 1e-3) ang += Math.PI;
    const off = w.t / 2 + px(9);
    const mx = (w.x1 + w.x2) / 2 + f.nx * off, my = (w.y1 + w.y2) / 2 + f.ny * off;
    label(mx, my, fmtM(f.L), { angle: ang, font: '10px system-ui, sans-serif', color: '#6b7280' });
  }

  // ---------- Rysunek techniczny ----------
  let hatchPat = null;
  function hatch() {
    if (!hatchPat) {
      const c = document.createElement('canvas');
      c.width = c.height = 8;
      const x = c.getContext('2d');
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, 8, 8);
      x.strokeStyle = '#555';
      x.lineWidth = 0.9;
      x.beginPath();
      x.moveTo(-1, 9); x.lineTo(9, -1);
      x.moveTo(-1, 1); x.lineTo(1, -1);
      x.moveTo(7, 9); x.lineTo(9, 7);
      x.stroke();
      hatchPat = ctx.createPattern(c, 'repeat');
    }
    hatchPat.setTransform(new DOMMatrix().scale(1 / E.scale));
    return hatchPat;
  }
  const fmtCm = v => { const r = Math.round(v * 10) / 10; return String(r).replace('.', ','); };
  // Linia wymiarowa od a do b (punkty świata) z kreskami ukośnymi i tekstem w cm; ext – punkty, od których idą linie pomocnicze.
  function dimLine(a, b, opt = {}) {
    const L = G.dist(a, b);
    if (L < 0.5) return;
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, t = px(4);
    const col = opt.color || '#111';
    ctx.strokeStyle = col;
    ctx.lineWidth = px(0.8);
    line(a, b);
    (opt.ext || []).forEach(([q, from]) => line(from, { x: q.x + (q.x - from.x) / (G.dist(q, from) || 1) * px(4), y: q.y + (q.y - from.y) / (G.dist(q, from) || 1) * px(4) }));
    [a, b].forEach(q => line({ x: q.x - (ux - uy) * t, y: q.y - (uy + ux) * t }, { x: q.x + (ux - uy) * t, y: q.y + (uy + ux) * t }));
    const text = fmtCm(L);
    if (L * E.scale < text.length * 6 + 4) return;
    let ang = Math.atan2(uy, ux);
    if (ang > Math.PI / 2 + 1e-3) ang -= Math.PI;
    if (ang <= -Math.PI / 2 + 1e-3) ang += Math.PI;
    // Tekst nad linią (po stronie „do góry” po obróceniu).
    const nx = Math.sin(ang), ny = -Math.cos(ang);
    label((a.x + b.x) / 2 + nx * px(7), (a.y + b.y) / 2 + ny * px(7), text, { angle: ang, font: '10px system-ui, sans-serif', color: col, bg: opt.bg });
  }
  // Promień od punktu o w kierunku (dx, dy) do najbliższego lica ściany kondygnacji – odległość albo Infinity.
  function wallRay(lv) {
    const edges = lv.walls.map(w => App.wallPolygon(lv, w)).flatMap(pl => pl.map((q, i) => [q, pl[(i + 1) % pl.length]]));
    return (o, dx, dy) => {
      let best = Infinity;
      edges.forEach(([a, b]) => {
        const ex = b.x - a.x, ey = b.y - a.y, den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) return;
        const t = ((a.x - o.x) * ey - (a.y - o.y) * ex) / den, u = ((a.x - o.x) * dy - (a.y - o.y) * dx) / den;
        if (t > 0.01 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, t);
      });
      return best;
    };
  }
  // Wysokość instalacji: w dolnej połowie kondygnacji od podłogi, w górnej – od sufitu.
  const instHeight = (lv, z) => { const H = App.levelHeight(lv); return z > H / 2 ? `${fmtCm(H - z)} od sufitu` : `h=${fmtCm(z)}`; };
  const upright = (ang) => { if (ang > Math.PI / 2 + 1e-3) ang -= Math.PI; if (ang <= -Math.PI / 2 + 1e-3) ang += Math.PI; return ang; };
  // Wymiary instalacji: trasy – długości odcinków i całej trasy z wysokością; punkty na ścianie – odległość
  // od najbliższego lica ściany poprzecznej i wysokość; punkty swobodne – odległości od ścian w obu osiach.
  function drawInstallDims(lv) {
    const ray = wallRay(lv), font = '9.5px system-ui, sans-serif', bg = 'rgba(255,255,255,0.85)';
    lv.installs.forEach(o => {
      if (!E.instVisible(o)) return;
      const d = App.installDef(o.type), col = App.installColor(o);
      if (o.pts) {
        if (o.pts.length < 2) return;
        let longest = 1;
        for (let k = 1; k < o.pts.length; k++) {
          const a = o.pts[k - 1], b = o.pts[k], L = G.dist(a, b);
          if (L > G.dist(o.pts[longest - 1], o.pts[longest])) longest = k;
          if (o.pts.length > 2 && L * E.scale > 40) {
            const ang = upright(Math.atan2(b.y - a.y, b.x - a.x)), nx = Math.sin(ang), ny = -Math.cos(ang);
            label((a.x + b.x) / 2 + nx * px(8), (a.y + b.y) / 2 + ny * px(8), fmtCm(L), { angle: ang, font, color: col });
          }
        }
        const a = o.pts[longest - 1], b = o.pts[longest];
        const ang = upright(Math.atan2(b.y - a.y, b.x - a.x)), nx = -Math.sin(ang), ny = Math.cos(ang);
        const text = `${d.name}: ${fmtM(App.runLength(o))} · ${instHeight(lv, o.z)}`;
        label((a.x + b.x) / 2 + nx * px(10), (a.y + b.y) / 2 + ny * px(10), text, { angle: ang, font: '600 ' + font, color: col, bg });
        return;
      }
      const at = App.installAt(lv, o);
      if (!at) return;
      if (!o.wallId) {
        // Punkt swobodny: najbliższa ściana w poziomie i w pionie.
        [[1, 0], [0, 1]].forEach(([dx, dy]) => {
          const t1 = ray(at.a, dx, dy), t0 = ray(at.a, -dx, -dy), t = Math.min(t0, t1);
          if (!isFinite(t)) return;
          const s = t1 <= t0 ? 1 : -1;
          dimLine(at.a, { x: at.a.x + dx * s * t, y: at.a.y + dy * s * t }, { color: col, bg });
        });
        return;
      }
      // Punkt na ścianie: wymiar wzdłuż lica do najbliższej ściany poprzecznej, odsunięty do wnętrza.
      const off = px(22), q = { x: at.f.x + at.n.x * 2, y: at.f.y + at.n.y * 2 };
      const t1 = ray(q, at.u.x, at.u.y), t0 = ray(q, -at.u.x, -at.u.y), t = Math.min(t0, t1);
      const base = { x: at.f.x + at.n.x * off, y: at.f.y + at.n.y * off };
      if (isFinite(t) && t < 3000) {
        const s = t1 <= t0 ? 1 : -1, end = { x: at.f.x + at.u.x * s * t, y: at.f.y + at.u.y * s * t };
        const endOff = { x: end.x + at.n.x * off, y: end.y + at.n.y * off };
        dimLine(base, endOff, { color: col, bg, ext: [[base, at.f], [endOff, end]] });
      }
      // Wysokość obok symbolu, po stronie pomieszczenia.
      const h = { x: at.f.x + at.n.x * px(34), y: at.f.y + at.n.y * px(34) };
      label(h.x, h.y, instHeight(lv, o.z), { font, color: col, bg });
    });
  }
  // Legenda symboli instalacji użytych na rzucie (rysunek techniczny), w prawym dolnym rogu.
  function drawInstallLegend(lv) {
    const types = Object.keys(App.INSTALLS).filter(t => lv.installs.some(o => o.type === t && E.instVisible(o)));
    if (!types.length) return;
    const rowH = 22, wBox = 210, hBox = 26 + types.length * rowH, x0 = W - wBox - 12, y0 = H - hBox - 12;
    screen();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.fillRect(x0, y0, wBox, hBox);
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, wBox, hBox);
    ctx.fillStyle = '#111';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('LEGENDA – INSTALACJE', x0 + 10, y0 + 13);
    types.forEach((t, k) => {
      const cy = y0 + 26 + k * rowH + rowH / 2;
      screen();
      ctx.fillStyle = '#111';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(App.installDef(t).name, x0 + 52, cy);
      world();
      const d = App.installDef(t);
      if (d.shape === 'run') {
        const a = E.toWorld(x0 + 10, cy), b = E.toWorld(x0 + 42, cy);
        App.drawInstall(ctx, lv, { type: t, pts: [a, b] }, px(1), false);
      } else if (t === 'riser') {
        // Pion rysowany w skali rzutu – w legendzie stały symbol kółka.
        screen();
        ctx.beginPath(); ctx.arc(x0 + 26, cy, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(87,83,78,0.25)'; ctx.fill();
        ctx.strokeStyle = App.INSTALL_SYS.kan.color; ctx.lineWidth = 1.6; ctx.stroke();
        world();
      } else {
        // Symbol na ścianie rysowany „licem” w dół wiersza – kreska ściany pod spodem.
        const c = E.toWorld(x0 + 26, cy + (d.shape === 'wall' ? 7 : 0));
        App.drawInstall(ctx, lv, { type: t, x: c.x, y: c.y }, px(1), false);
        if (d.shape === 'wall') { ctx.strokeStyle = '#111'; ctx.lineWidth = px(1); const l = E.toWorld(x0 + 14, cy + 7), r = E.toWorld(x0 + 38, cy + 7); line(l, r); }
      }
    });
    world();
  }
  const inRoom = (lv, q) => lv.rooms.some(r => G.inside(q, r.pts));
  function drawTechDims(lv) {
    if (!lv.walls.length) return;
    const polys = lv.walls.map(w => App.wallPolygon(lv, w));
    const all = polys.flat(), minX = Math.min(...all.map(q => q.x)), maxX = Math.max(...all.map(q => q.x));
    const minY = Math.min(...all.map(q => q.y)), maxY = Math.max(...all.map(q => q.y));
    // Ściany zewnętrzne pogrupowane wg strony budynku, z której są widoczne.
    const sides = { top: { c: [], o: [] }, bottom: { c: [], o: [] }, left: { c: [], o: [] }, right: { c: [], o: [] } };
    lv.walls.forEach((w, k) => {
      const f = App.wallFrame(w), horiz = Math.abs(f.uy) < 0.01, vert = Math.abs(f.ux) < 0.01;
      if (!horiz && !vert) return;
      const m = { x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 }, e = w.t / 2 + 3;
      const pIn = inRoom(lv, { x: m.x + f.nx * e, y: m.y + f.ny * e }), nIn = inRoom(lv, { x: m.x - f.nx * e, y: m.y - f.ny * e });
      let out;
      if (pIn !== nIn) out = pIn ? -1 : 1;
      else if (!pIn) {
        // Ściana bez pomieszczeń – zewnętrzna, jeśli leży na obrysie budynku.
        const o = horiz ? (Math.abs(m.y - minY) < w.t ? -1 : Math.abs(m.y - maxY) < w.t ? 1 : 0) : (Math.abs(m.x - minX) < w.t ? -1 : Math.abs(m.x - maxX) < w.t ? 1 : 0);
        if (!o) return;
        out = (horiz ? f.ny : f.nx) * o > 0 ? 1 : -1;
      } else return;
      const dir = horiz ? f.ny * out : f.nx * out, side = horiz ? (dir < 0 ? 'top' : 'bottom') : (dir < 0 ? 'left' : 'right');
      const key = horiz ? 'x' : 'y', ext = polys[k].map(q => q[key]), sd = sides[side];
      sd.c.push(Math.min(...ext), Math.max(...ext));
      lv.openings.filter(o => o.wallId === w.id && !App.isGableWindow(lv, o)).forEach(o => {
        const pos = App.openingPos(w, o);
        [pos - o.width / 2, pos + o.width / 2].forEach(t => sd.o.push(key === 'x' ? w.x1 + f.ux * t : w.y1 + f.uy * t));
      });
    });
    const uniq = (arr) => [...arr].sort((a, b) => a - b).filter((v, i, a) => !i || v - a[i - 1] > 0.5);
    const chain = (side, vals, level) => {
      const horiz = side === 'top' || side === 'bottom', dir = side === 'top' || side === 'left' ? -1 : 1;
      const edge = side === 'top' ? minY : side === 'bottom' ? maxY : side === 'left' ? minX : maxX;
      const at = edge + dir * px(26 + level * 22), from = edge + dir * px(6);
      const P = (v, c) => (horiz ? { x: v, y: c } : { x: c, y: v });
      for (let k = 1; k < vals.length; k++) dimLine(P(vals[k - 1], at), P(vals[k], at), { ext: [[P(vals[k - 1], at), P(vals[k - 1], from)], [P(vals[k], at), P(vals[k], from)]] });
    };
    Object.entries(sides).forEach(([side, sd]) => {
      const horiz = side === 'top' || side === 'bottom', total = horiz ? [minX, maxX] : [minY, maxY];
      let level = 0;
      if (sd.o.length) chain(side, uniq([...sd.c, ...sd.o]), level++);
      const corners = uniq([...sd.c, ...total]);
      if (corners.length > 2) chain(side, corners, level++);
      chain(side, total, level);
    });
    // Wymiary wewnętrzne pomieszczeń: od lica do lica, w poziomie i w pionie.
    const edges = polys.flatMap(pl => pl.map((q, i) => [q, pl[(i + 1) % pl.length]]));
    const ray = (o, dx, dy) => {
      let best = Infinity;
      edges.forEach(([a, b]) => {
        const ex = b.x - a.x, ey = b.y - a.y, den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) return;
        const t = ((a.x - o.x) * ey - (a.y - o.y) * ex) / den, u = ((a.x - o.x) * dy - (a.y - o.y) * dx) / den;
        if (t > 0.01 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, t);
      });
      return best;
    };
    lv.rooms.forEach(r => {
      if (r.pts.length < 3) return;
      const c = G.centroid(r.pts);
      const hy = { x: c.x, y: c.y + px(42) }, vx = { x: c.x + px(70), y: c.y };
      [[G.inside(hy, r.pts) ? hy : c, 1, 0], [G.inside(vx, r.pts) ? vx : c, 0, 1]].forEach(([o, dx, dy]) => {
        const t1 = ray(o, dx, dy), t0 = ray(o, -dx, -dy);
        if (!isFinite(t1) || !isFinite(t0)) return;
        dimLine({ x: o.x - dx * t0, y: o.y - dy * t0 }, { x: o.x + dx * t1, y: o.y + dy * t1 });
      });
    });
    // Opisy otworów: szerokość × wysokość, parapet / próg.
    lv.openings.forEach(o => {
      const w = lv.walls.find(x => x.id === o.wallId);
      if (!w || App.isGableWindow(lv, o)) return;
      const f = App.wallFrame(w), pos = App.openingPos(w, o), m = { x: w.x1 + f.ux * pos, y: w.y1 + f.uy * pos };
      const e = w.t / 2 + 3, side = inRoom(lv, { x: m.x + f.nx * e, y: m.y + f.ny * e }) ? 1 : -1, off = w.t / 2 + px(o.kind === 'door' ? 30 : 12);
      let ang = Math.atan2(f.uy, f.ux);
      if (ang > Math.PI / 2 + 1e-3) ang -= Math.PI;
      if (ang <= -Math.PI / 2 + 1e-3) ang += Math.PI;
      const sill = App.openingSill(o);
      const text = `${fmtCm(o.width)}×${fmtCm(o.height)}` + (o.kind === 'window' ? `  P=${fmtCm(sill)}` : sill ? `  pr. ${fmtCm(sill)}` : '');
      label(m.x + f.nx * side * off, m.y + f.ny * side * off, text, { angle: ang, font: '9.5px system-ui, sans-serif', color: '#111', bg: 'rgba(255,255,255,0.85)' });
    });
    // Schody: liczba i wymiar stopni.
    lv.objects.filter(o => o.kind === 'stairs').forEach(o => {
      const lay = App.stairLayout(o), q = lay.parts[0];
      label(o.x, o.y, `${lay.N} × ${fmtCm(App.stairHeight(o, lv) / lay.N)}/${fmtCm(q.a1 - q.a0)}`, { font: '9.5px system-ui, sans-serif', color: '#111', bg: 'rgba(255,255,255,0.85)' });
    });
  }
  function drawTitle(lv) {
    const el = App.elevation(App.project.current), e = (el / 100).toFixed(2).replace('.', ',');
    screen();
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#111';
    ctx.fillText(`RZUT – ${lv.name.toUpperCase()}`, 14, 12);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#374151';
    ctx.fillText(`poziom podłogi ${el > 0 ? '+' : el < 0 ? '' : '±'}${e} m · wys. kondygnacji ${fmtCm(App.levelHeight(lv))} cm · wymiary w cm`, 14, 30);
    if (E.instOn() && lv.installs.some(E.instVisible)) {
      const l = E.instLayer === 'el' ? 'elektryczna' : E.instLayer === 'wk' ? 'wodno-kanalizacyjna' : 'elektryczna i wodno-kanalizacyjna';
      ctx.fillText(`instalacja ${l}`, 14, 46);
    }
    world();
  }

  // ---------- Teren ----------
  // Działki (teren i granica) i nawierzchnie – pod budynkiem.
  function drawSite(lv, tech) {
    lv.plots.forEach(o => {
      path(o.pts);
      ctx.fillStyle = tech ? '#ffffff' : texPattern(o.tex) || o.color || '#c9dcaa';
      ctx.fill();
    });
    lv.paths.forEach(o => {
      path(o.pts);
      ctx.fillStyle = tech ? '#f3f3f1' : texPattern(o.tex) || o.color;
      ctx.fill();
      ctx.strokeStyle = tech ? '#555' : App.shade(o.color || '#999999', 0.7);
      ctx.lineWidth = px(1);
      ctx.stroke();
    });
    // Granica działki: linia kreska–kropka.
    lv.plots.forEach(o => {
      path(o.pts);
      ctx.strokeStyle = tech ? '#111' : '#2f5d1f';
      ctx.lineWidth = px(tech ? 1.4 : 1.8);
      ctx.setLineDash([px(14), px(4), px(2), px(4)]);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }
  // Ogrodzenie: linia w kolorze wypełnienia, słupki w miejscach jak w 3D.
  function drawFence(o, tech) {
    const st = App.fenceStyle(o.style), segs = App.fenceSegments(o), span = Math.max(50, o.span || 250);
    const col = App.selection === o.id ? SEL : tech ? '#111' : o.color;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(px(2.5), o.style === 'solid' ? 20 : 5);
    const cap = ctx.lineCap;
    ctx.lineCap = 'butt';
    if (o.style === 'mesh') ctx.setLineDash([px(6), px(3)]);
    path(o.pts, !!o.closed);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = col;
    const P = Math.max(st.post, px(5));
    segs.forEach(([a, b], k) => {
      const L = G.dist(a, b), n = Math.max(1, Math.ceil(L / span));
      for (let j = 0; j <= n; j++) {
        if (j === n && (k < segs.length - 1 || o.closed)) continue;
        const t = j / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        ctx.fillRect(x - P / 2, y - P / 2, P, P);
      }
    });
    ctx.lineCap = cap;
  }
  // Nazwa i powierzchnia działki w jej górnym rogu oraz długości boków na zewnątrz granicy.
  function drawPlotLabels(o, tech, dims) {
    const xs = o.pts.map(q => q.x), ys = o.pts.map(q => q.y);
    const at = { x: Math.min(...xs) + px(16), y: Math.min(...ys) + px(18) };
    const color = tech ? '#111' : '#2f5d1f';
    screen();
    const s0 = E.toScreen(at.x, at.y);
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(o.name || 'Działka', s0.x, s0.y);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(App.fmtArea(o.pts), s0.x, s0.y + 15);
    world();
    if (!dims) return;
    const ccw = G.area(o.pts) > 0;
    o.pts.forEach((a, k) => {
      const b = o.pts[(k + 1) % o.pts.length], L = G.dist(a, b);
      if (L * E.scale < 50) return;
      // Na zewnątrz wielokąta – po stronie przeciwnej do wnętrza.
      let nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
      if (!ccw) { nx = -nx; ny = -ny; }
      let ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (ang > Math.PI / 2 + 1e-3) ang -= Math.PI;
      if (ang <= -Math.PI / 2 + 1e-3) ang += Math.PI;
      label((a.x + b.x) / 2 - nx * px(11), (a.y + b.y) / 2 - ny * px(11), fmtM(L), { angle: ang, font: '600 10.5px system-ui, sans-serif', color });
    });
  }

  function drawRoomLabel(lv, r) {
    if (r.pts.length < 3) return;
    const xs = r.pts.map(p => p.x), size = (Math.max(...xs) - Math.min(...xs)) * E.scale;
    if (size < 50) return;
    const c = G.centroid(r.pts);
    label(c.x, c.y, r.name, { font: '600 12px system-ui, sans-serif', color: '#1f2937', dy: -8 });
    label(c.x, c.y, App.roomNetArea(lv, r).toFixed(2).replace('.', ',') + ' m²', { color: '#4b5563', dy: 8 });
    const dr = App.roomDrop(r, App.project.current);
    if (E.tech) label(c.x, c.y, 'h = ' + fmtM(App.levelHeight(lv) + dr), { color: '#4b5563', font: '10px system-ui, sans-serif', dy: dr ? 36 : 22 });
    const drop = App.roomDrop(r, App.project.current);
    if (drop) label(c.x, c.y, r.atGround ? 'na poziomie terenu' : 'podłoga −' + (drop / 100).toFixed(2).replace('.', ',') + ' m', { color: '#9a3412', font: '10px system-ui, sans-serif', dy: 22 });
  }

  function drawHandle(p) {
    const s = px(4);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = SEL;
    ctx.lineWidth = px(1.5);
    ctx.fillRect(p.x - s, p.y - s, 2 * s, 2 * s);
    ctx.strokeRect(p.x - s, p.y - s, 2 * s, 2 * s);
  }

  function drawOutline(obj, color, width, handles) {
    const lv = App.level();
    ctx.strokeStyle = color;
    ctx.lineWidth = px(width);
    if (obj.kind === 'install') {
      // Instalacja podświetlona przez App.drawInstall; trasie dochodzą uchwyty wierzchołków.
      if (handles && obj.pts) obj.pts.forEach(drawHandle);
      return;
    }
    if (obj.pts) {
      path(obj.pts, obj.kind !== 'fence' || obj.closed); ctx.stroke();
      if (handles) obj.pts.forEach(drawHandle);
    } else if (obj.wallId) {
      const g = openingGeom(lv, obj);
      if (!g) return;
      path([g.P(-g.hw, -g.ht), g.P(g.hw, -g.ht), g.P(g.hw, g.ht), g.P(-g.hw, g.ht)]); ctx.stroke();
    } else if (obj.kind || 'pitch' in obj) {
      path(G.rectCorners(obj)); ctx.stroke();
      if (handles && 'pitch' in obj) G.rectCorners(obj).forEach(drawHandle);
    } else if ('x1' in obj) {
      path(App.wallPolygon(lv, obj)); ctx.stroke();
      if (handles) { drawHandle({ x: obj.x1, y: obj.y1 }); drawHandle({ x: obj.x2, y: obj.y2 }); }
    }
  }

  function drawSnapMarker() {
    const s = E.snap;
    if (!s || !E.inside) return;
    ctx.lineWidth = px(1);
    ctx.setLineDash([px(4), px(4)]);
    ctx.strokeStyle = 'rgba(234,88,12,0.7)';
    if (s.gx) line({ x: s.gx.x, y: s.gx.y }, { x: s.x, y: s.y });
    if (s.gy) line({ x: s.gy.x, y: s.gy.y }, { x: s.x, y: s.y });
    ctx.setLineDash([]);
    const r = px(5);
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = px(1.5);
    if (s.kind === 'point') ctx.strokeRect(s.x - r, s.y - r, 2 * r, 2 * r);
    else if (s.kind === 'wall') path([{ x: s.x, y: s.y - r }, { x: s.x + r, y: s.y }, { x: s.x, y: s.y + r }, { x: s.x - r, y: s.y }]), ctx.stroke();
    else { line({ x: s.x - r, y: s.y }, { x: s.x + r, y: s.y }); line({ x: s.x, y: s.y - r }, { x: s.x, y: s.y + r }); }
  }

  function drawToolPreview() {
    const s = E.snap, t = E.tool;
    if (t === 'select') {
      if (E.drag && (E.drag.type === 'vertex' || E.drag.type === 'roofCorner')) drawSnapMarker();
      return;
    }
    if (t === 'wall' && E.chain) {
      const last = E.chain[E.chain.length - 1];
      ctx.strokeStyle = 'rgba(37,99,235,0.6)';
      ctx.lineWidth = px(1);
      path(E.chain, false); ctx.stroke();
      if (s) {
        const tmp = { x1: last.x, y1: last.y, x2: s.x, y2: s.y, t: App.defaults.wall.thickness };
        if (G.dist(last, s) > 0.5) {
          path(App.wallPolygon({ walls: [] }, tmp));
          ctx.fillStyle = 'rgba(37,99,235,0.35)';
          ctx.fill();
          const len = E.typed ? E.typed + ' cm' : Math.round(G.dist(last, s)) + ' cm';
          label((last.x + s.x) / 2, (last.y + s.y) / 2, len, { bg: 'rgba(255,255,255,0.9)', color: SEL, font: '600 11px system-ui, sans-serif' });
        }
      }
    }
    if (t === 'room' && E.rect && s) {
      const a = E.rect.a;
      path([a, { x: s.x, y: a.y }, s, { x: a.x, y: s.y }]);
      ctx.fillStyle = 'rgba(37,99,235,0.12)';
      ctx.fill();
      ctx.strokeStyle = SEL;
      ctx.lineWidth = px(App.defaults.room.makeWalls ? 2 : 1);
      ctx.stroke();
      const wcm = Math.abs(s.x - a.x), hcm = Math.abs(s.y - a.y);
      label((a.x + s.x) / 2, (a.y + s.y) / 2, `${fmtM(wcm)} × ${fmtM(hcm)} = ${(wcm * hcm / 10000).toFixed(2).replace('.', ',')} m²`,
        { bg: 'rgba(255,255,255,0.9)', color: SEL, font: '600 11px system-ui, sans-serif' });
    }
    if (t === 'roof' && E.rect && s) {
      const a = E.rect.a;
      ctx.setLineDash([px(7), px(4)]);
      ctx.strokeStyle = 'rgba(154,52,18,0.9)';
      ctx.lineWidth = px(1.5);
      path([a, { x: s.x, y: a.y }, s, { x: a.x, y: s.y }]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (POLY_TOOLS.includes(t) && E.poly && s) {
      const line = t === 'fence' || (t === 'path' && App.defaults.path.mode === 'strip');
      if (t === 'path' && line) path(App.stripPolygon([...E.poly, s], App.defaults.path.width));
      else path([...E.poly, s], !line);
      ctx.fillStyle = 'rgba(37,99,235,0.12)';
      if (!(t === 'fence')) ctx.fill();
      ctx.strokeStyle = SEL;
      ctx.lineWidth = px(1.5);
      path([...E.poly, s], false); ctx.stroke();
      E.poly.forEach(drawHandle);
      const last = E.poly[E.poly.length - 1];
      const len = E.typed ? E.typed + ' cm' : Math.round(G.dist(last, s)) + ' cm';
      label((last.x + s.x) / 2, (last.y + s.y) / 2, len, { bg: 'rgba(255,255,255,0.9)', color: SEL });
    }
    if ((t === 'door' || t === 'window') && E.preview) {
      const pv = E.preview;
      const d = App.defaults[t];
      drawOpening(App.level(), { kind: t, wallId: pv.wall.id, pos: pv.pos, width: pv.width, height: d.height, sill: pv.sill, flip: false, side: pv.side, ok: pv.ok }, true);
    }
    if (t === 'install' && E.inside) {
      const type = App.defaults.install.type, d = App.installDef(type), lv = App.level();
      ctx.globalAlpha = 0.7;
      if (d.shape === 'wall' && E.preview) App.drawInstall(ctx, lv, App.makeInstall(type, lv, E.preview), px(1), false);
      if (d.shape === 'free' && s) App.drawInstall(ctx, lv, App.makeInstall(type, lv, s), px(1), false);
      if (d.shape === 'run' && s) {
        if (E.run) App.drawInstall(ctx, lv, { type, pts: [...E.run, s] }, px(1), false);
        drawSnapMarker();
      }
      ctx.globalAlpha = 1;
    }
    if ((t === 'stairs' || t === 'chimney' || t === 'roofwin' || t === 'dormer' || t === 'furniture' || t === 'garden') && s && E.inside) {
      ctx.globalAlpha = 0.6;
      drawObject(E.makeObject(t === 'garden' ? 'furniture' : t, s.x, s.y), false, (t === 'roofwin' || t === 'dormer') && !App.roofAt(App.project.current, s));
      ctx.globalAlpha = 1;
    }
    if (t === 'wall' || t === 'room' || t === 'roof' || POLY_TOOLS.includes(t)) drawSnapMarker();
  }

  function drawScaleBar() {
    const L = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find(v => v * E.scale >= 70) || 10000;
    const w = L * E.scale, x = 16, y = H - 18;
    screen();
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y - 5);
    ctx.stroke();
    ctx.fillStyle = '#374151';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(L >= 100 ? L / 100 + ' m' : L + ' cm', x + w / 2, y - 6);
  }

  E.exportPNG = () => {
    const sel = App.selection, hover = E.hover;
    App.selection = null; E.hover = null;
    draw();
    const url = canvas.toDataURL('image/png');
    App.selection = sel; E.hover = hover;
    E.render();
    return url;
  };
})(window.App);
