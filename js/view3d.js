'use strict';
// Podgląd 3D (Three.js). Scena budowana w centymetrach, grupa główna skalowana do metrów.
// Plan (x, y) -> świat (x, z), wysokość -> y.
(function (App) {
  const G = App.geom;
  const V = App.view3d = { ready: false, visible: false, pick: false };
  let THREE, renderer, scene, camera, controls, root, sun, container, terrain, grid;
  let dirty = true, framed = false;
  let shownLast = Infinity; // najwyższa kondygnacja pokazana w 3D (szczyty dachu liczone tylko z widocznych ścian)
  const mats = {};

  V.init = (el) => {
    container = el;
    THREE = window.THREE;
    if (!THREE || !THREE.OrbitControls) {
      el.insertAdjacentHTML('beforeend', '<div class="no3d">Nie udało się wczytać biblioteki Three.js (js/vendor).</div>');
      return;
    }
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.prepend(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdde8f2);
    scene.fog = new THREE.Fog(0xdde8f2, 80, 220);

    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(18, 14, 22);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 1;
    controls.maxDistance = 150;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f80, 0.6));
    sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 120 });
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);

    terrain = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: 0xc5d3b8, roughness: 1 }));
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    scene.add(terrain);
    grid = new THREE.GridHelper(100, 100, 0xa6b49a, 0xb7c4ab);
    grid.position.y = 0.002;
    scene.add(grid);

    root = new THREE.Group();
    root.scale.setScalar(0.01);
    scene.add(root);

    new ResizeObserver(resize).observe(el);
    App.on('change', () => { dirty = true; });
    App.on('texload', () => { dirty = true; });
    App.on('select', highlight);
    initPicking();
    initWalk();
    V.ready = true;
    resize();
    loop();
  };

  V.setVisible = (v) => {
    V.visible = v;
    if (v) { resize(); dirty = true; }
  };

  function resize() {
    if (!renderer) return;
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }

  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.1, (now - (loop.t || now)) / 1000);
    loop.t = now;
    if (!V.visible) return;
    if (dirty) {
      dirty = false;
      rebuild();
      highlight();
      // Nowe obiekty muszą mieć policzone położenie przed testami kolizji spaceru w tej samej klatce.
      scene.updateMatrixWorld();
      if (!framed && !W.on) { V.frame(); framed = true; }
    }
    if (W.on) walkStep(dt);
    else controls.update();
    renderer.render(scene, camera);
  }

  let edgeMat = null;
  function mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial(Object.assign({ color: new THREE.Color(color), roughness: 0.85 }, opts));
    return mats[key];
  }
  // Połać wygrywa test głębokości z krawędziami ścian i szczytów, które się z nią stykają.
  const roofMaterial = (color) => mat(color, { side: THREE.DoubleSide, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  function mesh(geo, material, parent) {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  // Prostopadłościan w układzie lokalnym: u (wzdłuż), v (wysokość), w (w poprzek).
  function box(parent, material, u0, u1, v0, v1, d, w = 0) {
    if (u1 - u0 < 0.1 || v1 - v0 < 0.1) return null;
    const m = mesh(new THREE.BoxGeometry(u1 - u0, v1 - v0, d), material, parent);
    m.position.set((u0 + u1) / 2, (v0 + v1) / 2, w);
    return m;
  }

  // ---------- Zaznaczanie w 3D ----------
  // Elementy oznaczone userData.pick = { id, level }; otwory w ścianach mają własną podgrupę (tylko id).
  function pickOf(obj) {
    let id = null, level = null;
    for (let o = obj; o && o !== root; o = o.parent) {
      const pk = o.userData.pick;
      if (!pk) continue;
      if (id == null) id = pk.id;
      if (pk.level != null) { level = pk.level; break; }
    }
    return id == null ? null : { id, level };
  }
  // Wszystko, co builder dołoży do parent, dostaje znacznik elementu.
  function tagged(parent, id, level, build) {
    const n0 = parent.children.length;
    build();
    const added = parent.children.slice(n0);
    added.forEach(c => { c.userData.pick = { id, level }; });
    return added;
  }

  // ---------- Tekstury ----------
  const texCache = {};
  function threeTexture(tile) {
    if (texCache[tile.key]) return texCache[tile.key];
    const tex = new THREE.CanvasTexture(tile.canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return (texCache[tile.key] = tex);
  }
  // Materiał z teksturą przejmuje stronę i przesunięcie głębi materiału, który zastępuje (np. połać dachu).
  function texMaterial(tile, base) {
    const key = ['tex', tile.key, base.side, base.polygonOffset ? 1 : 0].join(':');
    if (!mats[key]) {
      mats[key] = new THREE.MeshStandardMaterial({
        map: threeTexture(tile), roughness: 0.85, side: base.side,
        polygonOffset: base.polygonOffset, polygonOffsetFactor: base.polygonOffsetFactor, polygonOffsetUnits: base.polygonOffsetUnits,
      });
    }
    return mats[key];
  }
  // Siatki w obrębie obiektów (bez podgrup innych elementów, np. otworów w ścianie).
  function meshesOf(objs, filter) {
    const out = [];
    const walk = (o, top) => {
      if (!top && o.userData.pick && o.userData.pick.level == null) return;
      if (o.isMesh && filter(o)) out.push(o);
      o.children.forEach(c => walk(c, false));
    };
    objs.forEach(o => walk(o, true));
    return out;
  }
  // Dzieli siatkę na trójkąty bez tekstury (grupa 0, dotychczasowy materiał) i z teksturą (grupa 1).
  function splitFaces(m, M, faces, tile) {
    const base = Array.isArray(m.material) ? m.material[0] : m.material, top = Array.isArray(m.material) ? m.material[1] : m.material;
    return groupFaces(m, M, faces, base, texMaterial(tile, top));
  }
  // Grupy materiałów siatki: trójkąty spełniające faces(n) – matKeep, pozostałe – matRest.
  function groupFaces(m, M, faces, matRest, matKeep) {
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const pos = geo.attributes.position, nor = geo.attributes.normal, n = pos.count / 3;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    const keep = [], rest = [];
    for (let t = 0; t < n; t++) {
      A.fromBufferAttribute(pos, t * 3).applyMatrix4(M); B.fromBufferAttribute(pos, t * 3 + 1).applyMatrix4(M); C.fromBufferAttribute(pos, t * 3 + 2).applyMatrix4(M);
      (faces(B.sub(A).cross(C.sub(A)).normalize()) ? keep : rest).push(t);
    }
    if (!keep.length) return false;
    const order = rest.concat(keep);
    const re = (attr) => {
      const out = new Float32Array(attr.count * attr.itemSize), w = attr.itemSize * 3;
      order.forEach((t, j) => out.set(attr.array.subarray(t * w, t * w + w), j * w));
      return new THREE.BufferAttribute(out, attr.itemSize);
    };
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', re(pos));
    if (nor) g2.setAttribute('normal', re(nor));
    g2.addGroup(0, rest.length * 3, 0);
    g2.addGroup(rest.length * 3, keep.length * 3, 1);
    m.geometry.dispose();
    if (geo !== m.geometry) geo.dispose();
    m.geometry = g2;
    m.material = [matRest, matKeep];
    return true;
  }
  // Nakłada teksturę: UV w płaszczyźnie każdego trójkąta (u – poziomo wzdłuż powierzchni, v – w górę spadku),
  // w cm układu frame. Powielanie – wzór co size × scale; rozciąganie – raz na każdą płaską powierzchnię.
  // faces(n) – tylko trójkąty o normalnej n (w układzie frame) spełniającej warunek dostają teksturę (grupa materiału 1).
  function applyTexture(meshes, assign, frame, faces) {
    const tile = App.texTile(assign);
    if (!tile || !meshes.length) return;
    root.updateMatrixWorld(true);
    const inv = frame.matrixWorld.clone().invert();
    if (faces) meshes = meshes.filter(m => splitFaces(m, new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld), faces, tile));
    const tw = tile.tw, th = tile.th, stretch = assign.mode === 'stretch';
    const up = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
    const P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    const recs = [];
    meshes.forEach(m => {
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      if (geo !== m.geometry) { m.geometry.dispose(); m.geometry = geo; }
      const M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld), pos = geo.attributes.position;
      const uv = new Float32Array(pos.count * 2);
      for (let k = 0; k + 2 < pos.count; k += 3) {
        P.forEach((v, j) => v.fromBufferAttribute(pos, k + j).applyMatrix4(M));
        const n = e1.subVectors(P[1], P[0]).cross(e2.subVectors(P[2], P[0])).normalize().clone();
        const tu = new THREE.Vector3().crossVectors(up, n);
        if (tu.lengthSq() < 1e-6) tu.copy(X); else tu.normalize();
        const tv = new THREE.Vector3().crossVectors(n, tu).normalize();
        recs.push({ uv, k, st: P.map(v => [v.dot(tu), v.dot(tv)]), key: [n.x, n.y, n.z].map(x => Math.round(x * 50)).join() + '|' + Math.round(n.dot(P[0])) });
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (!Array.isArray(m.material)) m.material = texMaterial(tile, m.material);
    });
    const bounds = {};
    if (stretch) recs.forEach(r => {
      const b = bounds[r.key] || (bounds[r.key] = [Infinity, Infinity, -Infinity, -Infinity]);
      r.st.forEach(([s, q]) => { b[0] = Math.min(b[0], s); b[1] = Math.min(b[1], q); b[2] = Math.max(b[2], s); b[3] = Math.max(b[3], q); });
    });
    recs.forEach(r => r.st.forEach(([s, q], j) => {
      const b = bounds[r.key];
      r.uv[(r.k + j) * 2] = stretch ? (s - b[0]) / (b[2] - b[0] || 1) : s / tw;
      r.uv[(r.k + j) * 2 + 1] = stretch ? (q - b[1]) / (b[3] - b[1] || 1) : q / th;
    }));
  }
  const solid = (m) => !m.material.transparent;
  // Sufit pokoju – płaszczyzna skierowana w dół (od góry niewidoczna, więc nie zasłania widoku z lotu ptaka).
  // Wysokość sufitu w punkcie planu (względem podłogi kondygnacji i): spód płyty stropu nad nim, a gdy wyżej
  // nie ma pokoju – wysokość kondygnacji.
  function ceilingAt(i, pt) {
    const p = App.project, H = App.levelHeight(p.levels[i]), up = p.levels[i + 1];
    const r = up && up.rooms.find(x => x.pts.length >= 3 && G.inside(pt, x.pts));
    if (!r) return H - 1;
    const fl = App.roomFloor(i + 1, r);
    return H + (i + 1 === 0 ? 1 : 0.5) - fl.drop - fl.thick;
  }
  function buildCeiling(parent, pts, y) {
    if (pts.length < 3) return null;
    const shape = new THREE.Shape(pts.map(q => new THREE.Vector2(q.x, q.y)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(Math.PI / 2);
    const m = mesh(geo, mat('#ffffff'), parent);
    m.position.y = y;
    m.castShadow = false;
    return m;
  }
  function hitAt(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    // Przy prześwietlonych ścianach pierwszeństwo mają instalacje w ich wnętrzu.
    const s = App.project.settings, xray = !!s.instOnly3d || App.inst3dLayer(s) !== 'none';
    let first = null;
    for (const h of ray.intersectObjects(root.children, true)) {
      if (h.object.userData.noPick) continue;
      const pk = pickOf(h.object);
      if (!pk) continue;
      if (!xray) return pk;
      const f = App.find(pk.id, App.project.levels[pk.level] || App.level());
      if (f && f.kind === 'install') return pk;
      first = first || pk;
    }
    return first;
  }
  function initPicking() {
    const el = renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null; });
    el.addEventListener('pointerup', (e) => {
      if (!V.pick || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const pk = hitAt(e);
      if (!pk) return App.select(null);
      // Element z innej kondygnacji – przejście na nią, bo edycja dotyczy bieżącej kondygnacji.
      if (pk.level != null && pk.level !== App.project.current) App.setLevel(pk.level);
      App.select(pk.id);
    });
    el.addEventListener('pointermove', (e) => {
      if (!V.pick || e.buttons) return;
      el.style.cursor = hitAt(e) ? 'pointer' : 'default';
    });
  }
  // Podświetlenie zaznaczonego elementu (kopia materiału, bo materiały są współdzielone).
  function highlight() {
    if (!root) return;
    root.traverse(o => {
      if (!o.isMesh) return;
      if (o.userData.baseMat) { o.material = o.userData.baseMat; delete o.userData.baseMat; }
      const pk = App.selection && pickOf(o);
      if (!pk || pk.id !== App.selection) return;
      o.userData.baseMat = o.material;
      const hl = (x) => { x = x.clone(); if (x.emissive) { x.emissive.set('#2563eb'); x.emissiveIntensity = 0.45; } return x; };
      o.material = Array.isArray(o.material) ? o.material.map(hl) : hl(o.material);
    });
  }
  V.setPick = (on) => {
    V.pick = on;
    if (renderer && !on) renderer.domElement.style.cursor = '';
  };

  function clear() {
    root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    root.clear();
  }

  // ---------- Budowa sceny ----------
  function rebuild() {
    clear();
    const p = App.project, s = p.settings;
    // Na spacerze widać wszystkie kondygnacje – można przejść schodami piętro wyżej.
    const mode = W.on ? 'all' : s.show3d || 'all', n = p.levels.length;
    const first = mode === 'only' ? p.current : 0, last = mode === 'all' ? n - 1 : p.current;
    shownLast = last;
    const roofs = s.roofs3d !== false;
    // Instalacje: ściany półprzezroczyste, widać przewody i rury w ich wnętrzu (wszystkie albo jednej branży).
    // „Tylko instalacje”: budynek jako lekki szkic (ściany i stropy z krawędziami), bez mebli, schodów i dachów.
    const only = !!s.instOnly3d, layer = App.inst3dLayer(s);
    const xray = layer !== 'none' || only;
    const instShow = (o) => !only || layer === 'none' || layer === 'all' || App.installGroup(o) === layer;
    const instXray = (o) => only || layer === 'all' || App.installGroup(o) === layer;
    const wallMat = xray ? mat(s.wallColor, { transparent: true, opacity: 0.3, depthWrite: false }) : mat(s.wallColor);
    edgeMat = edgeMat || new THREE.LineBasicMaterial({ color: '#64748b', transparent: true, opacity: 0.55 });
    const ghost = (objs, opacity) => {
      const gm = mat('#94a3b8', { transparent: true, opacity, depthWrite: false });
      // Krawędzie tylko bryły ścian i stropów – ramy okien i drzwi bez krawędzi, żeby nie zaciemniały widoku.
      const ms = [];
      const walk = (x, inOpening) => {
        inOpening = inOpening || (!!x.userData.pick && x.userData.pick.level == null);
        if (x.isMesh) ms.push([x, inOpening]);
        x.children.forEach(c => walk(c, inOpening));
      };
      objs.forEach(o => walk(o, false));
      ms.forEach(([m, inOpening]) => {
        m.material = gm;
        m.castShadow = m.receiveShadow = false;
        m.userData.noPick = true;
        if (inOpening) return;
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), edgeMat);
        e.userData.noPick = true;
        m.add(e);
      });
    };
    terrainHoles(p);
    // Na kondygnacji podziemnej teren jest półprzezroczysty, żeby było widać piwnicę.
    const underground = App.elevation(p.current) < 0;
    Object.assign(terrain.material, { transparent: underground, opacity: underground ? 0.3 : 1, depthWrite: !underground });
    terrain.material.needsUpdate = true;
    grid.visible = !underground;
    // Komin przycinany do widocznych kondygnacji; pełna wysokość, gdy nad nim nic nie jest ukryte albo widać dach.
    const from = App.elevation(first);
    const to = last === n - 1 || (roofs && p.levels[last].roofs.length) ? Infinity : App.elevation(last + 1);
    for (let i = 0; i < first && !only; i++) {
      p.levels[i].objects.forEach(o => { if (o.kind === 'chimney') tagged(root, o.id, i, () => buildChimney(root, o, i, from, to)); });
    }

    for (let i = first; i <= last; i++) {
      const lv = p.levels[i], elev = App.elevation(i);
      const g = new THREE.Group();
      g.position.y = elev;
      root.add(g);
      // Zagospodarowanie terenu (działka, nawierzchnie, ogrodzenia, rośliny) – na rzędnej terenu 0, nie kondygnacji.
      const sg = new THREE.Group();
      root.add(sg);
      if (!only) {
        lv.plots.forEach(o => { const objs = tagged(sg, o.id, i, () => buildSlab(sg, o.pts, 0.3, 1.3, o.color)); if (o.tex) applyTexture(meshesOf(objs, solid), o.tex, sg); });
        lv.paths.forEach(o => { const objs = tagged(sg, o.id, i, () => buildSlab(sg, o.pts, o.h, o.h + 1, o.color)); if (o.tex) applyTexture(meshesOf(objs, solid), o.tex, sg); });
        lv.fences.forEach(o => tagged(sg, o.id, i, () => buildFence(sg, o)));
      }
      lv.walls.forEach(w => {
        const objs = tagged(g, w.id, i, () => buildWall(g, lv, w, wallMat, i));
        if (only) return ghost(objs, 0.1);
        if (w.tex && !xray) objs.forEach(o => applyTexture(meshesOf([o], m => m.material === wallMat), w.tex, o));
        // Tekstury okien i drzwi – rama, skrzydło (bez szyby), w układzie ściany.
        lv.openings.filter(op => op.wallId === w.id && op.tex).forEach(op => objs.forEach(o => {
          const sub = o.children.filter(c => c.userData.pick && c.userData.pick.id === op.id);
          applyTexture(sub.flatMap(c => { const out = []; c.traverse(x => { if (x.isMesh && solid(x)) out.push(x); }); return out; }), op.tex, o);
        }));
      });
      const under = App.roofsOver(i);
      lv.rooms.forEach(r => {
        const fl = App.roomFloor(i, r), outline = floorOutline(r.pts, under, elev);
        const lift = (i === 0 ? 1 : 0.5) - fl.drop;
        // Fragmenty podłogi obniżone (wnęka, np. brodzik) – otwór w płycie podłogi pokoju.
        const pits = lv.areas.filter(a => a.surf !== 'ceil' && a.drop > 0 && a.pts.length >= 3 && G.inside(G.centroid(a.pts), r.pts)).map(a => a.pts);
        const objs = tagged(g, r.id, i, () => buildFloor(g, outline, fl.thick, lift, p.levels[i - 1], r.color, pits));
        if (only) return ghost(objs, 0.06);
        // Tekstura podłogi tylko na wierzchu płyty – spód (sufit kondygnacji niżej) i krawędzie bez niej.
        if (r.texFloor) applyTexture(objs.filter(o => o.isMesh), r.texFloor, g, (n) => n.y > 0.5);
        if (r.texCeil) {
          const c = tagged(g, r.id, i, () => buildCeiling(g, outline, ceilingAt(i, G.centroid(r.pts)) - 0.2));
          applyTexture(c.filter(o => o.isMesh), r.texCeil, g);
        }
      });
      // Fragmenty podłogi (warstwa / podest na podłodze) i sufitu (pod stropem, ewentualnie obniżone).
      if (!only) lv.areas.forEach(o => {
        if (o.pts.length < 3) return;
        // Sufit nad pokojem nie zasłania widoku z góry, gdy kondygnacja wyżej jest ukryta.
        if (o.surf === 'ceil' && i === last && i < n - 1) return;
        const c = G.centroid(o.pts), thick = Math.max(0.5, o.thick || 1), lift = Math.max(0, o.lift || 0);
        let top, depth;
        if (o.surf === 'ceil') { const cy = ceilingAt(i, c); top = cy - 0.1; depth = lift + thick; }
        else {
          const room = lv.rooms.find(r => G.inside(c, r.pts)), fl = (i === 0 ? 1 : 0.5) - (room ? App.roomDrop(room, i) : 0);
          // Obniżenie najwyżej do spodu płyty podłogi pokoju; obniżony fragment wypełnia płytę pod sobą.
          const slab = room ? App.roomFloor(i, room).thick : 22, drop = room ? G.clamp(o.drop || 0, 0, slab - 1) : 0;
          if (drop > 0) { top = fl - drop; depth = Math.max(thick, slab - drop); }
          else { top = fl + lift + thick; depth = lift + thick - 0.1; }
        }
        const objs = tagged(g, o.id, i, () => buildSlab(g, o.pts, top, depth, o.color));
        objs.forEach(m => { if (m.isMesh) m.castShadow = o.surf !== 'ceil'; });
        if (o.tex) applyTexture(objs.filter(m => m.isMesh), o.tex, g, o.surf === 'ceil' ? (n) => n.y < -0.5 : (n) => n.y > 0.5);
      });
      if (!only) lv.objects.forEach(o => {
        if (o.kind === 'stairs') {
          // Schody w obniżonym pokoju zaczynają się na jego podłodze.
          const room = lv.rooms.find(r => G.inside(o, r.pts)), drop = room ? App.roomDrop(room, i) : 0;
          const sg = new THREE.Group();
          sg.position.y = -drop;
          g.add(sg);
          sg.userData.pick = { id: o.id, level: i };
          buildStairs(sg, o, o.h ? o.h : App.levelHeight(lv) + drop, App.levelHeight(lv) + drop);
          if (o.tex) applyTexture(meshesOf([sg], m => solid(m) && !m.userData.rail), o.tex, sg);
          if (o.texRail) applyTexture(meshesOf([sg], m => !!m.userData.rail), o.texRail, sg);
          return;
        }
        if (o.kind === 'furniture') {
          // Rośliny i wyposażenie ogrodu na parterze, poza pokojami, stoją na terenie (parter może być podniesiony).
          const onSite = App.furnitureDef(o.type).site && i === (p.ground || 0) && !lv.rooms.some(r => G.inside(o, r.pts));
          const pg = onSite ? sg : g;
          const objs = tagged(pg, o.id, i, () => buildFurniture(pg, o, lv, i));
          objs.forEach(x => {
            if (o.tex) applyTexture(meshesOf([x], m => m.userData.main), o.tex, x);
            if (o.front) applyTexture(meshesOf([x], m => m.userData.front), Object.assign({}, o.front, { mode: 'stretch' }), x);
          });
          return;
        }
        let objs = [];
        if (o.kind === 'roofwin') { if (roofs) objs = tagged(root, o.id, i, () => buildRoofWin(o, i)); }
        else if (o.kind === 'dormer') { if (roofs) objs = tagged(root, o.id, i, () => buildDormer(o, i, wallMat)); }
        else objs = tagged(g, o.id, i, () => buildChimney(g, o, i, elev, to));
        // Lukarna: tekstura na jej dach; pozostałe obiekty – na całą bryłę.
        if (o.tex) objs.forEach(x => applyTexture(meshesOf([x], m => solid(m) && (o.kind !== 'dormer' || m.material.polygonOffset)), o.tex, x));
      });
      lv.installs.forEach(o => { if (instShow(o)) tagged(g, o.id, i, () => buildInstall(g, lv, o, instXray(o), only ? 2 : 1)); });
      if (roofs && !only) lv.roofs.forEach(r => {
        const objs = tagged(root, r.id, i, () => buildRoof(r, i, wallMat));
        if (r.tex) objs.forEach(x => applyTexture(meshesOf([x], m => !!m.material.polygonOffset), r.tex, x));
      });
    }
  }

  // Teren nie przecina piwnicy: obrys pokoi kondygnacji podziemnych zapisany w buforze szablonu (stencil)
  // wycina tam teren – widok przez otwór nad schodami i spacer po piwnicy. Pokoje mogą się stykać i nakładać.
  let terrainKey = '', terrainMask = null;
  App.undergroundAt = (pt) => App.project.levels.some((l, i) => App.elevation(i) < 0 && l.rooms.some(r => r.pts.length >= 3 && G.inside(pt, r.pts)));
  function terrainHoles(p) {
    const rooms = p.levels.flatMap((l, i) => (App.elevation(i) < 0 ? l.rooms : [])).filter(r => r.pts.length >= 3);
    const key = JSON.stringify(rooms.map(r => r.pts));
    if (key === terrainKey) return;
    terrainKey = key;
    if (!terrainMask) {
      terrainMask = new THREE.Group();
      scene.add(terrainMask);
      Object.assign(terrain.material, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc });
    }
    terrainMask.children.slice().forEach(m => { terrainMask.remove(m); m.geometry.dispose(); });
    const mm = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
    rooms.forEach(r => {
      const geo = new THREE.ShapeGeometry(new THREE.Shape(r.pts.map(q => new THREE.Vector2(q.x / 100, q.y / 100))));
      geo.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(geo, mm);
      m.renderOrder = -10;
      m.position.y = 0.001;
      terrainMask.add(m);
    });
  }

  function buildWall(parent, lv, w, wallMat, i) {
    const f = App.wallFrame(w), T = w.t, Hh = App.wallHeight(lv, w);
    const e0 = App.wallEndConnected(lv, w, 0) ? T / 2 : 0, e1 = App.wallEndConnected(lv, w, 1) ? T / 2 : 0;
    const g = new THREE.Group();
    g.position.set(w.x1, 0, w.y1);
    g.rotation.y = -Math.atan2(f.uy, f.ux);
    parent.add(g);

    // Otwory liczone od podłogi przy ścianie w ich miejscu (obniżony pokój), ściana zaczyna się od foot
    // (cokół do terenu) – oba mogą się zmieniać wzdłuż ściany.
    const floorAt = (t) => App.wallFloorAt(lv, i, w, G.clamp(t, 0, f.L));
    let ops = lv.openings.filter(o => o.wallId === w.id).map(o => {
      const pos = App.openingPos(w, o), width = App.openingFree(w, o) ? o.width : Math.min(o.width, f.L);
      const bottom = floorAt(pos).base + App.openingSill(o);
      // Okno może wychodzić ponad ścianę (w szczyt dachu) – ściana jest przycinana do Hh, okno do połaci nad nim.
      let top = o.kind === 'door' ? Math.min(Hh, bottom + o.height) : bottom + o.height;
      if (top > Hh) {
        [pos - width / 2, pos + width / 2].forEach(t => {
          const hit = App.roofAt(i, { x: w.x1 + f.ux * t, y: w.y1 + f.uy * t });
          if (hit) top = Math.min(top, hit.h - App.elevation(i) - 3);
        });
        top = Math.max(top, bottom + 10);
      }
      return { o, a: pos - width / 2, b: pos + width / 2, bottom, top };
    });
    // Okna w całości ponad ścianą nie wycinają jej – stoją w ścianie szczytowej dachu.
    // Ramy buduje tylko ściana, do której otwór należy; ściana wyższej kondygnacji dostaje sam otwór.
    // Każdy otwór we własnej podgrupie, żeby dało się go zaznaczyć w 3D.
    const frame = (op) => {
      if (op.foreign) return;
      const sg = new THREE.Group();
      sg.userData.pick = { id: op.o.id };
      g.add(sg);
      if (op.o.kind === 'window') return buildWindow(sg, op, T);
      // Drzwi budowane od zera – podgrupa stoi na podłodze przy ścianie.
      sg.position.y = op.bottom;
      buildDoor(sg, Object.assign({}, op, { bottom: 0, top: op.top - op.bottom }), T);
    };
    ops.filter(op => op.bottom >= Hh).forEach(frame);
    ops = ops.filter(op => op.bottom < Hh).concat(foreignOpenings(i, w, f)).sort((x, y) => x.a - y.a);

    // Na poddaszu (i nad nim) ściana ścięta połacią: obrys z otworami wyciągnięty na grubość ściany.
    const prof = wallProfile(i, w, f, -e0, f.L + e1, Hh);
    if (prof && !prof.length) return;
    if (prof) {
      const foot = Math.min(floorAt(0).foot, floorAt(f.L / 2).foot, floorAt(f.L).foot);
      const topAt = (s) => {
        for (let k = 1; k < prof.length; k++) {
          const [sa, ya] = prof[k - 1], [sb, yb] = prof[k];
          if (s <= sb) return sb - sa < 1e-6 ? yb : ya + (yb - ya) * (s - sa) / (sb - sa);
        }
        return prof[prof.length - 1][1];
      };
      const minTop = (a, b) => Math.min(topAt(a), topAt(b), ...prof.filter(q => q[0] > a && q[0] < b).map(q => q[1]));
      const shape = new THREE.Shape();
      shape.moveTo(prof[0][0], foot);
      shape.lineTo(prof[prof.length - 1][0], foot);
      for (let k = prof.length - 1; k >= 0; k--) if (prof[k][1] > 0.5) shape.lineTo(prof[k][0], prof[k][1]);
      shape.closePath();
      ops.forEach(op => {
        op.top = Math.min(op.top, minTop(op.a, op.b) - 5);
        if (op.top - op.bottom < 10) return;
        const hole = new THREE.Path();
        // Otwór nie może dotykać krawędzi obrysu (okno z kondygnacji niżej zaczyna się przy podłodze).
        const y0 = Math.max(op.bottom, foot + 0.5), a0 = Math.max(op.a, prof[0][0] + 0.5), b0 = Math.min(op.b, prof[prof.length - 1][0] - 0.5);
        hole.moveTo(a0, y0); hole.lineTo(b0, y0); hole.lineTo(b0, op.top); hole.lineTo(a0, op.top); hole.closePath();
        shape.holes.push(hole);
        frame(op);
      });
      const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
      geo.translate(0, 0, -T / 2);
      mesh(geo, wallMat, g);
      return;
    }

    // Ściana w pionowych pasach między krawędziami otworów; w każdym pasie pełne odcinki między otworami.
    const x0 = -e0, x1 = f.L + e1;
    const xs = [...new Set([x0, x1, ...ops.flatMap(op => [op.a, op.b]), ...App.wallFloorBreaks(lv, i, w)])].filter(x => x >= x0 && x <= x1).sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k++) {
      const a = xs[k], b = xs[k + 1], mid = (a + b) / 2;
      if (b - a < 0.1) continue;
      const foot = floorAt(mid).foot;
      const cuts = ops.filter(op => op.a <= mid && op.b >= mid)
        .map(op => [Math.max(foot, op.bottom), Math.min(Hh, op.top)]).filter(c => c[1] > c[0]).sort((p, q) => p[0] - q[0]);
      let y = foot;
      cuts.forEach(([c0, c1]) => { if (c0 > y) box(g, wallMat, a, b, y, c0, T); y = Math.max(y, c1); });
      if (y < Hh) box(g, wallMat, a, b, y, Hh, T);
    }
    ops.forEach(frame);
  }

  // Otwory z innych ścian leżących w tej samej linii: z niższych kondygnacji (okno wyższe niż jego kondygnacja)
  // i z tej samej kondygnacji (dwie nakładające się ściany sąsiednich pokoi – drzwi w jednej przebijają obie).
  function foreignOpenings(i, w, f) {
    const out = [], elev = App.elevation(i), levels = App.project.levels;
    for (let k = 0; k <= i; k++) {
      const ek = App.elevation(k);
      levels[k].walls.forEach(wk => {
        if (wk === w) return;
        const fk = App.wallFrame(wk);
        if (Math.abs(fk.ux * f.uy - fk.uy * f.ux) > 0.01) return;
        if (Math.abs((wk.x1 - w.x1) * f.nx + (wk.y1 - w.y1) * f.ny) > Math.min(5, (w.t + wk.t) / 4)) return;
        levels[k].openings.forEach(o => {
          if (o.wallId !== wk.id) return;
          const sill = App.openingSill(o), top = ek + sill + o.height - elev;
          if (top <= 1) return;
          const pos = App.openingPos(wk, o), cx = wk.x1 + fk.ux * pos, cy = wk.y1 + fk.uy * pos;
          const t = (cx - w.x1) * f.ux + (cy - w.y1) * f.uy, width = App.openingFree(wk, o) ? o.width : Math.min(o.width, fk.L);
          if (t + width / 2 < 0 || t - width / 2 > f.L) return;
          out.push({ o, foreign: true, a: t - width / 2, b: t + width / 2, bottom: Math.max(0, ek + sill - elev), top });
        });
      });
    }
    return out;
  }


  // Wysokość ściany wzdłuż jej osi pod połaciami poddasza: [[s, y], ...] albo null, gdy nic jej nie ścina.
  function wallProfile(i, w, f, s0, s1, Hh) {
    const elev = App.elevation(i), n = Math.max(2, Math.ceil((s1 - s0) / 5)), pts = [];
    let clipped = false;
    for (let k = 0; k <= n; k++) {
      const s = s0 + (s1 - s0) * k / n;
      let top = Hh;
      [-1, 1].forEach(sd => {
        const p = { x: w.x1 + f.ux * s + f.nx * sd * w.t / 2, y: w.y1 + f.uy * s + f.ny * sd * w.t / 2 };
        top = Math.min(top, App.roofClipTop(i, p, w) - elev - 1);
      });
      if (top < Hh - 0.5) clipped = true;
      pts.push([s, Math.max(0, top)]);
    }
    if (!clipped) return null;
    // Części ściany całkiem pod połacią (poza dachem) odpadają.
    const k0 = pts.findIndex(q => q[1] > 2), k1 = pts.length - 1 - [...pts].reverse().findIndex(q => q[1] > 2);
    if (k0 < 0) return [];
    const kept = pts.slice(Math.max(0, k0 - 1), Math.min(pts.length, k1 + 2));
    // Usuwa punkty pośrednie na odcinkach prostych.
    return kept.filter((q, k) => {
      if (k === 0 || k === kept.length - 1) return true;
      const a = kept[k - 1], b = kept[k + 1];
      return Math.abs((q[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (q[0] - a[0])) > 1e-3 * (b[0] - a[0]);
    });
  }

  function buildWindow(g, op, T) {
    const fw = 6, fd = Math.min(10, T), frame = mat('#f7f7f5', { roughness: 0.5 });
    const { a, b, bottom, top } = op;
    box(g, frame, a, a + fw, bottom, top, fd);
    box(g, frame, b - fw, b, bottom, top, fd);
    box(g, frame, a + fw, b - fw, bottom, bottom + fw, fd);
    box(g, frame, a + fw, b - fw, top - fw, top, fd);
    if (b - a >= 100) box(g, frame, (a + b) / 2 - fw * 0.4, (a + b) / 2 + fw * 0.4, bottom + fw, top - fw, fd * 0.8);
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(1, b - a - 2 * fw), Math.max(1, top - bottom - 2 * fw)),
      mat('#9cc7e6', { transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.set((a + b) / 2, (bottom + top) / 2, 0);
    g.add(glass);
    if (bottom > 0) box(g, mat('#d6d3cc'), a - 3, b + 3, bottom - 3, bottom, T + 6);
  }

  function buildDoor(g, op, T) {
    const fw = 7, fd = Math.min(12, T), frame = mat('#6e4a2c'), leaf = mat('#a8794c');
    const { a, b, top } = op;
    if (op.o.gate) {
      // Brama segmentowa: panele z poziomymi przetłoczeniami.
      const panel = mat('#6b5440'), n = Math.max(3, Math.round(top / 50)), ph = top / n;
      for (let k = 0; k < n; k++) box(g, panel, a + 2, b - 2, k * ph + 1, (k + 1) * ph - 1, 5);
      box(g, frame, a, b, top - 4, top, fd);
      return;
    }
    box(g, frame, a, a + fw, 0, top, fd);
    box(g, frame, b - fw, b, 0, top, fd);
    box(g, frame, a + fw, b - fw, top - fw, top, fd);
    if (W.on) {
      // Na spacerze drzwi otwarte: skrzydło prostopadle do ściany, po stronie otwierania (jak łuk na rzucie).
      const L = b - a - 2 * fw, sd = op.o.side ? 1 : -1;
      const u0 = op.o.flip ? b - fw - 4 : a + fw;
      box(g, leaf, u0, u0 + 4, 0, top - fw, L, sd * (fd / 2 + L / 2));
      return;
    }
    box(g, leaf, a + fw, b - fw, 0, top - fw, 4);
    const hx = op.o.flip ? a + fw + 8 : b - fw - 8;
    box(g, mat('#c9c9c9', { metalness: 0.7, roughness: 0.3 }), hx - 6, hx + 6, 100, 104, 10);
  }

  function rectPath(o, PathCls) {
    const c = G.rectCorners(o), path = new PathCls();
    c.forEach((q, i) => (i ? path.lineTo(q.x, q.y) : path.moveTo(q.x, q.y)));
    path.closePath();
    return path;
  }

  // Podłoga strychu kończy się tam, gdzie połać poddasza schodzi poniżej stropu.
  function floorOutline(pts, under, elev) {
    const c = G.centroid(pts);
    under.forEach(({ r, k }) => {
      if (pts.length < 3 || App.roofHeightAt(r, k, c) == null) return;
      const sec = App.roofSection(r, k, elev + 5);
      pts = sec ? G.clipConvex(pts, sec) : [];
    });
    return pts;
  }

  function buildFloor(parent, pts, thick, lift, below, color, pits = []) {
    if (pts.length < 3 || Math.abs(G.area(pts)) < 100) return;
    const shape = new THREE.Shape();
    pts.forEach((q, i) => (i ? shape.lineTo(q.x, q.y) : shape.moveTo(q.x, q.y)));
    shape.closePath();
    // Otwory w stropie nad schodami z niższej kondygnacji.
    if (below) {
      below.objects.filter(o => o.kind === 'stairs' && G.rectCorners(o).every(q => G.inside(q, pts))).forEach(o => shape.holes.push(rectPath(o, THREE.Path)));
    }
    // Otwory pod obniżone fragmenty podłogi, minimalnie zmniejszone (mogą dochodzić do ścian pokoju).
    pits.forEach(hp => {
      const c = G.centroid(hp);
      shape.holes.push(new THREE.Path(hp.map(q => { const d = Math.hypot(q.x - c.x, q.y - c.y) || 1, k = Math.max(0, 1 - 0.3 / d); return new THREE.Vector2(c.x + (q.x - c.x) * k, c.y + (q.y - c.y) * k); })));
    });
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    const m = mesh(geo, mat(color || '#dddddd'), parent);
    m.userData.slab = true; // na spacerze krawędź stropu (otwór nad schodami) nie zatrzymuje
    m.position.y = lift;
    // Kolor pokoju tylko na wierzchu podłogi; spód (sufit kondygnacji niżej) i krawędzie – jasny tynk.
    groupFaces(m, new THREE.Matrix4(), (n) => n.y > 0.5, mat('#ecebe6'), m.material);
  }

  // Biegi schodów: kolejne stopnie między spocznikami, z kierunkiem (da, db) w układzie schodów.
  function stairFlights(lay) {
    const flights = [];
    let cur = [];
    lay.parts.forEach(q => { if (q.landing) { if (cur.length) flights.push(cur); cur = []; } else cur.push(q); });
    if (cur.length) flights.push(cur);
    return flights.filter(f => f.length >= 2).map(steps => {
      const c = (q) => [(q.a0 + q.a1) / 2, (q.b0 + q.b1) / 2], p0 = c(steps[0]), p1 = c(steps[steps.length - 1]);
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
      return { steps, da: (p1[0] - p0[0]) / L, db: (p1[1] - p0[1]) / L };
    });
  }
  // Skośna płyta pod biegiem: od spodu klocków stopni do linii równoległej do biegu, grubość T (prostopadle).
  function buildFlightSlab(g, f, rise, T, material) {
    const { steps, da, db } = f;
    const corners = (q) => [[q.a0, q.b0], [q.a1, q.b0], [q.a1, q.b1], [q.a0, q.b1]];
    const S = (p) => da * p[0] + db * p[1], C = (p) => -db * p[0] + da * p[1];
    const rng = steps.map(q => { const ss = corners(q).map(S); return [Math.min(...ss), Math.max(...ss)]; });
    const cs = steps.flatMap(q => corners(q).map(C)), c0 = Math.min(...cs), c1 = Math.max(...cs);
    const n = steps.length, bottom = (j) => (steps[j].k - 1) * rise;
    // Linia przez tylne dolne narożniki klocków pierwszego i ostatniego stopnia, obniżona o grubość płyty.
    const slope = (bottom(n - 1) - bottom(0)) / ((rng[n - 1][1] - rng[0][1]) || 1);
    const drop = T * Math.sqrt(1 + slope * slope);
    const under = (sv) => Math.max(0, bottom(0) + (sv - rng[0][1]) * slope - drop);
    const pts = [];
    steps.forEach((q, j) => { pts.push([rng[j][0], bottom(j)], [rng[j][1], bottom(j)]); });
    pts.push([rng[n - 1][1], under(rng[n - 1][1])], [rng[0][0], under(rng[0][0])]);
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: c1 - c0, bevelEnabled: false });
    geo.translate(0, 0, c0);
    const m = mesh(geo, material, g);
    m.matrixAutoUpdate = false;
    // Układ: x – wzdłuż biegu, y – w górę, z – w poprzek (prawoskrętny).
    m.matrix.makeBasis(new THREE.Vector3(da, 0, db), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-db, 0, da));
  }

  // Sufit skośny nad biegiem: płyta równoległa do linii krawędzi stopni (prześwit clear) na całej długości biegu;
  // poniżej poziomu podłogi wyżej przestrzeń nad płytą jest wypełniona stropem (z góry nie ma tam otworu).
  function buildSoffit(g, f, rise, height, clear) {
    const { steps, da, db } = f;
    const corners = (q) => [[q.a0, q.b0], [q.a1, q.b0], [q.a1, q.b1], [q.a0, q.b1]];
    const S = (p) => da * p[0] + db * p[1], C = (p) => -db * p[0] + da * p[1];
    const front = steps.map(q => Math.min(...corners(q).map(S))), n = steps.length;
    const s1 = Math.max(...corners(steps[n - 1]).map(S)), s0 = front[0];
    const cs = steps.flatMap(q => corners(q).map(C)), c0 = Math.min(...cs), c1 = Math.max(...cs);
    const slope = (steps[n - 1].k - steps[0].k) * rise / ((front[n - 1] - front[0]) || 1);
    if (slope <= 0) return;
    const yAt = (sv) => steps[0].k * rise + (sv - front[0]) * slope + clear;
    const floorTop = height + 0.3, P = 10;
    // Dół: linia sufitu; góra: wierzch płyty (P nad sufitem), ale nie niżej niż wierzch stropu wyżej.
    const pts = [[s0, yAt(s0)], [s1, yAt(s1)], [s1, Math.max(yAt(s1) + P, floorTop)]];
    const sx = s0 + (floorTop - P - yAt(s0)) / slope;
    if (sx > s0 && sx < s1) pts.push([sx, floorTop]);
    pts.push([s0, Math.max(floorTop, yAt(s0) + P)]);
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: c1 - c0, bevelEnabled: false });
    geo.translate(0, 0, c0);
    const m = mesh(geo, mat('#ecebe6'), g);
    m.matrixAutoUpdate = false;
    m.matrix.makeBasis(new THREE.Vector3(da, 0, db), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-db, 0, da));
    m.userData.levelUp = true; // wierzch wypełnienia to podłoga kondygnacji wyżej
  }

  function buildStairs(parent, o, height, floorH = height) {
    const lay = App.stairLayout(o), rise = height / lay.N;
    const g = new THREE.Group();
    g.position.set(o.x, 0, o.y);
    g.rotation.y = -o.rot * Math.PI / 180;
    parent.add(g);
    const m1 = mat('#b49a7a'), m2 = mat('#8d7457'), m3 = mat('#a38b6d');
    // Stopnie i spoczniki jako płyty – pod biegiem zostaje wolne miejsce (np. zejście do piwnicy pod schodami);
    // „Zabudowa pod schodami” – bryła pełna do podłogi.
    const T = 18;
    lay.parts.forEach(q => {
      // Stopień – klocek wysokości stopnia; spocznik – płyta; zabudowa – bryła do podłogi.
      const top = rise * q.k, bottom = o.solid ? 0 : Math.max(0, q.landing ? top - T - 4 : top - rise);
      box(g, q.landing ? m3 : q.k % 2 ? m1 : m2, q.a0, q.a1, bottom, top, q.b1 - q.b0, (q.b0 + q.b1) / 2);
    });
    // Pod każdym biegiem skośna płyta (spód równoległy do schodów) – sufit np. nad zejściem do piwnicy pod biegiem.
    if (!o.solid) stairFlights(lay).forEach(f => buildFlightSlab(g, f, rise, T, m2));
    // Sufit skośny: nad biegiem, równolegle do schodów, prześwit o.soffitH nad krawędziami stopni – aż do stropu wyżej.
    if (o.soffit) stairFlights(lay).forEach(f => buildSoffit(g, f, rise, floorH, (o.soffitH || 210)));
    // Poręcze: pręt na słupkach albo pełna ścianka (balustrada murowana), H nad krawędzią stopni, odsunięte do środka biegu.
    const H = o.railH || 90, wall = o.railType === 'wall';
    const rail = mat(wall ? App.project.settings.wallColor : '#3f3f46', wall ? {} : { metalness: 0.5, roughness: 0.4 });
    lay.rails.forEach(r => {
      const da = r.a1 - r.a0, db = r.b1 - r.b0, len = Math.hypot(da, db);
      if (len < 1) return;
      const y0 = r.k0 * rise, y1 = r.k1 * rise;
      if (wall) {
        const t = 10, ins = t / 2;
        // Spód ścianki biegnie pod stopniami (albo od podłogi przy zabudowie), góra – H nad krawędzią stopni.
        const lo = (y) => (o.solid ? 0 : Math.max(0, y - rise - T));
        const shape = new THREE.Shape([new THREE.Vector2(0, lo(y0)), new THREE.Vector2(len, lo(y1)), new THREE.Vector2(len, y1 + H), new THREE.Vector2(0, y0 + H)]);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
        geo.translate(0, 0, -t / 2);
        const m = mesh(geo, rail, g);
        m.rotation.y = -Math.atan2(db, da);
        m.position.set(r.a0 + r.ia * ins, 0, r.b0 + r.ib * ins);
        m.userData.rail = true;
        return;
      }
      const ins = 3;
      const p0 = new THREE.Vector3(r.a0 + r.ia * ins, y0 + H, r.b0 + r.ib * ins), p1 = new THREE.Vector3(r.a1 + r.ia * ins, y1 + H, r.b1 + r.ib * ins);
      const bar = mesh(new THREE.BoxGeometry(p0.distanceTo(p1), 4, 4), rail, g);
      bar.position.copy(p0).lerp(p1, 0.5);
      bar.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), p1.clone().sub(p0).normalize());
      bar.userData.rail = true;
      const n = Math.max(2, Math.round(len / 120) + 1);
      for (let j = 0; j < n; j++) {
        const q = p0.clone().lerp(p1, (0.05 + 0.9 * j / (n - 1)));
        const post = mesh(new THREE.BoxGeometry(3, H + 2, 3), rail, g);
        post.position.set(q.x, q.y - H / 2, q.z);
        post.userData.rail = true;
      }
    });
  }

  // ---------- Instalacje ----------
  // Rura / przewód od punktu a do b (wektory 3D, cm).
  function tube(parent, a, b, r, material) {
    const len = a.distanceTo(b);
    if (len < 0.1) return;
    const m = mesh(new THREE.CylinderGeometry(r, r, len, 12), material, parent);
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.castShadow = false;
  }
  // Osprzęt na licu ściany widoczny zawsze; przewody, rury, puszki i piony – tylko w trybie „Instalacje”.
  function buildInstall(parent, lv, o, xray, thick = 1) {
    // thick – pogrubienie przewodów i rur w trybie „Tylko instalacje”, żeby były czytelne z daleka.
    const d = Object.assign({}, App.installDef(o.type), { r: (App.installDef(o.type).r || 1) * thick });
    const color = App.installColor(o), cm = mat(color, { roughness: 0.5 });
    if (d.shape === 'run') {
      if (!xray || o.pts.length < 2) return;
      const V = (q, z) => new THREE.Vector3(q.x, z, q.y);
      for (let k = 1; k < o.pts.length; k++) tube(parent, V(o.pts[k - 1], o.z), V(o.pts[k], o.z), d.r, cm);
      o.pts.forEach(q => { const j = mesh(new THREE.SphereGeometry(d.r * 1.15, 10, 8), cm, parent); j.position.copy(V(q, o.z)); });
      // Pionowe odejścia do punktów tej samej instalacji leżących na trasie (gniazdka, łączniki, punkty świetlne, podejścia).
      lv.installs.forEach(p => {
        if (p === o || p.pts || App.installDef(p.type).sys !== d.sys) return;
        const at = App.installAt(lv, p);
        if (!at) return;
        const on = o.pts.some((q, k) => k && G.project(at.a, o.pts[k - 1], q).d < 3);
        if (!on) return;
        const z = p.type === 'light' ? App.levelHeight(lv) : p.z;
        tube(parent, V(at.a, o.z), V(at.a, z), d.r, cm);
        if (p.wallId) tube(parent, V(at.a, z), V(at.f, z), d.r, cm);
      });
      return;
    }
    const at = App.installAt(lv, o);
    if (!at) return;
    if (o.type === 'light') {
      const m = mesh(new THREE.CylinderGeometry(9, 9, 2, 24), mat('#fff7e0', { emissive: '#7a6a40', roughness: 0.4 }), parent);
      m.position.set(at.a.x, App.levelHeight(lv) - 1, at.a.y);
      return;
    }
    if (o.type === 'riser') {
      if (xray) tube(parent, new THREE.Vector3(at.a.x, 0, at.a.y), new THREE.Vector3(at.a.x, App.levelHeight(lv), at.a.y), d.r, cm);
      return;
    }
    // Układ punktu: x – wzdłuż ściany, z – od lica do pomieszczenia.
    const g = new THREE.Group();
    g.position.set(at.f.x, o.z, at.f.y);
    g.rotation.y = Math.atan2(at.n.x, at.n.y);
    parent.add(g);
    const w = at.w, plate = (pw, ph, depth, m) => { const b = mesh(new THREE.BoxGeometry(pw, ph, depth), m, g); b.position.z = depth / 2; return b; };
    const white = mat('#f8f8f6', { roughness: 0.45 });
    if (d.sys === 'el') {
      if (o.type === 'junction') {
        if (!xray) return;
        const b = mesh(new THREE.CylinderGeometry(4, 4, Math.min(6, w.t), 16), cm, g);
        b.rotation.x = Math.PI / 2;
        b.position.z = -Math.min(6, w.t) / 2;
        return;
      }
      if (o.type === 'board') { plate(30, 40, 2, white); plate(26, 2, 2.4, mat('#9ca3af')).position.y = 8; return; }
      if (o.type === 'lightw') { plate(14, 9, 2, white); const l = mesh(new THREE.SphereGeometry(6, 16, 12), mat('#fff7e0', { emissive: '#7a6a40' }), g); l.position.z = 7; return; }
      const two = o.type === 'socket2';
      plate(two ? 15.5 : 8.5, 8.5, 1, white);
      const dark = mat(o.type === 'power' ? '#b91c1c' : '#d4d4d0', { roughness: 0.5 });
      if (o.type.startsWith('switch')) {
        (o.type === 'switch2' ? [-1.8, 1.8] : [0]).forEach(x => { const k = mesh(new THREE.BoxGeometry(o.type === 'switch2' ? 3.2 : 6, 6, 0.6), dark, g); k.position.set(x, 0, 1.3); });
      } else {
        (two ? [-3.6, 3.6] : [0]).forEach(x => { const k = mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.6, 20), dark, g); k.rotation.x = Math.PI / 2; k.position.set(x, 0, 1.3); });
      }
      if (xray) { const b = mesh(new THREE.CylinderGeometry(3.5, 3.5, 5, 16), cm, g); b.rotation.x = Math.PI / 2; b.position.z = -2.5; }
      return;
    }
    // Podejście wod-kan: króciec wystający z lica (w trybie „Instalacje” także jego część w ścianie).
    const r = d.sys === 'kan' ? 2.5 : 1.3, z0 = xray ? -w.t / 2 : 0;
    const k = mesh(new THREE.CylinderGeometry(r, r, 4 - z0, 16), cm, g);
    k.rotation.x = Math.PI / 2;
    k.position.z = (4 + z0) / 2;
  }

  // ---------- Teren: działka, nawierzchnie, ogrodzenia ----------
  // Płyta o obrysie pts: wierzch na wysokości top, grubość thick (w dół).
  function buildSlab(parent, pts, top, thick, color) {
    if (pts.length < 3 || Math.abs(G.area(pts)) < 100) return;
    const shape = new THREE.Shape(pts.map(q => new THREE.Vector2(q.x, q.y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    const m = mesh(geo, mat(color || '#cccccc', { roughness: 0.95 }), parent);
    m.position.y = top;
    m.castShadow = false;
  }
  // Wiele prostopadłościanów [x0, x1, y0, y1, z0, z1] w jednej geometrii (pręty paneli, sztachety, deski).
  function boxesGeometry(list) {
    const pos = [], nor = [];
    const quad = (a, b, c, d, n) => { [a, b, c, a, c, d].forEach(v => { pos.push(...v); nor.push(...n); }); };
    list.forEach(([x0, x1, y0, y1, z0, z1]) => {
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
      quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
      quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
      quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
      quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
      quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return geo;
  }
  // Ogrodzenie: każdy odcinek w swoim układzie (x – wzdłuż, y – w górę, z – w poprzek): podmurówka, słupki, wypełnienie.
  function buildFence(parent, o) {
    const st = App.fenceStyle(o.style), H = o.h, base = Math.min(o.base || 0, H - 10), span = Math.max(50, o.span || 250);
    const fill = mat(o.color, o.style === 'panel' ? { metalness: 0.4, roughness: 0.5 } : o.style === 'mesh' ? { transparent: true, opacity: 0.45, depthWrite: false } : {});
    const postMat = o.style === 'solid' ? mat(o.baseColor || '#a8a29e') : mat(o.style === 'panel' || o.style === 'mesh' ? o.color : App.shade(o.color, 0.8), o.style === 'panel' ? { metalness: 0.4, roughness: 0.5 } : {});
    const baseMat = mat(o.baseColor || '#a8a29e');
    const segs = App.fenceSegments(o), P = st.post;
    segs.forEach(([a, b], k) => {
      const L = G.dist(a, b), gs = new THREE.Group();
      gs.position.set(a.x, 0, a.y);
      gs.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
      parent.add(gs);
      // Słupki: na początku odcinka (koniec ma następny odcinek albo osobny słupek) i pośrednie co ≤ span.
      const n = Math.max(1, Math.ceil(L / span)), posts = [];
      for (let j = 0; j < n; j++) posts.push(j * L / n);
      if (k === segs.length - 1 && !o.closed) posts.push(L);
      const ph = o.style === 'solid' ? H + 6 : H + 2;
      gs.add(Object.assign(new THREE.Mesh(boxesGeometry(posts.map(t => [t - P / 2, t + P / 2, 0, ph, -P / 2, P / 2])), postMat), { castShadow: true, receiveShadow: true }));
      if (o.style === 'solid') gs.add(Object.assign(new THREE.Mesh(boxesGeometry(posts.map(t => [t - P / 2 - 3, t + P / 2 + 3, ph, ph + 5, -P / 2 - 3, P / 2 + 3])), mat(App.shade(o.baseColor || '#a8a29e', 0.85))), { castShadow: true }));
      const x0 = P / 2, x1 = L - P / 2;
      if (base > 0) {
        const bt = o.style === 'solid' ? 22 : 6, bm = new THREE.Mesh(boxesGeometry([[0, L, 0, base, -bt / 2, bt / 2]]), baseMat);
        bm.castShadow = bm.receiveShadow = true;
        gs.add(bm);
        if (o.texBase) applyTexture([bm], o.texBase, gs);
      }
      const z0 = base > 0 ? base + (o.style === 'solid' ? 0 : 3) : 5, z1 = H, boxes = [];
      // Wypełnienie między słupkami (pręty i deski nie wchodzą w słupki).
      const between = (fn) => posts.concat(posts[posts.length - 1] < L - 1 ? [L] : []).forEach((t, j, arr) => { if (j) fn(arr[j - 1] + P / 2, t - P / 2); });
      if (o.style === 'panel') {
        between((s0, s1) => {
          for (let x = s0 + 2.5; x < s1 - 1; x += 5) boxes.push([x - 0.25, x + 0.25, z0, z1, -0.25, 0.25]);
          [0.04, 0.5, 0.96].forEach(f => { const z = z0 + (z1 - z0) * f; boxes.push([s0, s1, z - 0.3, z + 0.3, -0.8, -0.2], [s0, s1, z - 0.3, z + 0.3, 0.2, 0.8]); });
        });
      } else if (o.style === 'pickets') {
        between((s0, s1) => {
          boxes.push([s0, s1, z0 + 12, z0 + 20, -3, 0], [s0, s1, z1 - 22, z1 - 14, -3, 0]);
          for (let x = s0 + 2; x + 9 <= s1 - 1; x += 13) boxes.push([x, x + 9, z0 + 3, z1 - 3, 0, 2], [x + 2, x + 7, z1 - 3, z1, 0, 2]);
        });
      } else if (o.style === 'boards') {
        between((s0, s1) => { for (let z = z0 + 1; z + 12 <= z1 + 0.5; z += 14) boxes.push([s0, s1, z, z + 12, -1, 1]); });
      } else if (o.style === 'solid') {
        between((s0, s1) => boxes.push([s0, s1, z0, z1 - 4, -10, 10], [s0, s1, z1 - 4, z1, -12, 12]));
      } else {
        between((s0, s1) => boxes.push([s0, s1, z0, z1, -0.15, 0.15], [s0, s1, z1 - 1, z1, -0.4, 0.4]));
      }
      if (!boxes.length || x1 <= x0) return;
      const fm = new THREE.Mesh(boxesGeometry(boxes), fill);
      fm.castShadow = o.style !== 'mesh';
      fm.receiveShadow = true;
      gs.add(fm);
      if (o.tex) applyTexture([fm], o.tex, gs);
    });
  }

  // ---------- Meble ----------
  const FURN_OPTS = {
    metal: { metalness: 0.6, roughness: 0.35 }, steel: { metalness: 0.5, roughness: 0.4 }, screen: { roughness: 0.2 }, glassDark: { roughness: 0.15 },
    glass: { transparent: true, opacity: 0.3, roughness: 0.1, depthWrite: false }, white: { roughness: 0.4 },
    water: { transparent: true, opacity: 0.8, roughness: 0.08, metalness: 0.1 }, leafDark: { roughness: 0.95 }, conifer: { roughness: 0.95 },
    paint: { metalness: 0.35, roughness: 0.35 }, carGlass: { metalness: 0.3, roughness: 0.1 }, tire: { roughness: 0.95 },
    light: { emissive: '#3a3a30', roughness: 0.2 }, tail: { emissive: '#4a0a0a', roughness: 0.3 },
  };
  function buildFurniture(parent, o, lv, i) {
    // Mebel stoi na podłodze pokoju (także obniżonej), z – wysokość nad podłogą (szafki wiszące, telewizor).
    const room = lv.rooms.find(r => G.inside(o, r.pts)), drop = room ? App.roomDrop(room, i) : 0;
    const g = new THREE.Group();
    g.position.set(o.x, (o.z || 0) - drop, o.y);
    g.rotation.y = -o.rot * Math.PI / 180;
    if (o.flip) g.scale.x = -1;
    parent.add(g);
    if (App.furnitureDef(o.type).model) return buildModel(g, o);
    App.furnitureParts(o).forEach(p => {
      const color = App.furnitureColor(p.m, o), material = mat(color, FURN_OPTS[p.paint ? 'paint' : p.m] || {});
      let m;
      if (p.b) {
        const [a0, a1, b0, b1, z0, z1] = p.b;
        if (a1 - a0 < 0.05 || b1 - b0 < 0.05 || z1 - z0 < 0.05) return;
        m = mesh(new THREE.BoxGeometry(a1 - a0, z1 - z0, b1 - b0), material, g);
        m.position.set((a0 + a1) / 2, (z0 + z1) / 2, (b0 + b1) / 2);
      } else if (p.c) {
        const [a, b, r, z0, z1] = p.c;
        if (z1 - z0 < 0.05) return;
        m = mesh(new THREE.CylinderGeometry(p.t != null ? p.t : r, r, z1 - z0, p.seg || 32), material, g);
        m.position.set(a, (z0 + z1) / 2, b);
        // Ostrosłup (4 boki) – obrócony tak, by krawędzie podstawy były równoległe do osi mebla, potem rozciągnięty w głąb.
        if (p.seg === 4) { m.geometry.rotateY(Math.PI / 4); m.geometry.scale(1, 1, p.s || 1); } else m.scale.z = p.s || 1;
      } else if (p.e) {
        const [a, b, z, r] = p.e;
        m = mesh(new THREE.SphereGeometry(r, 24, 16), material, g);
        m.position.set(a, z, b);
        m.scale.set(1, p.sz || 1, p.sb || 1);
      } else if (p.p) {
        // Profil boczny (a, z) wyciągnięty w głąb od b0 do b1, z zaokrąglonymi krawędziami (karoseria auta).
        // Zaokrąglenie powiększa obrys o bv – profil zmniejszony o tyle, żeby wymiary zostały prawdziwe.
        const [b0, b1] = p.w, bv = Math.min(p.bv == null ? 2 : p.bv, (b1 - b0) / 4);
        const as = p.p.map(q => q[0]), zs = p.p.map(q => q[1]);
        const ca = (Math.min(...as) + Math.max(...as)) / 2, ha = (Math.max(...as) - Math.min(...as)) / 2;
        const cz = (Math.min(...zs) + Math.max(...zs)) / 2, hz = (Math.max(...zs) - Math.min(...zs)) / 2;
        const ka = ha > bv ? (ha - bv) / ha : 1, kz = hz > bv ? (hz - bv) / hz : 1;
        const shape = new THREE.Shape(p.p.map(([x, z]) => new THREE.Vector2(ca + (x - ca) * ka, cz + (z - cz) * kz)));
        const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.1, b1 - b0 - 2 * bv), bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv, bevelSegments: 3, curveSegments: 4 });
        m = mesh(geo, material, g);
        m.position.z = b0 + bv;
      } else {
        const [a, z, r, b0, b1] = p.d;
        m = mesh(new THREE.CylinderGeometry(r, r, b1 - b0, 32), material, g);
        m.rotation.x = Math.PI / 2;
        m.position.set(a, z, (b0 + b1) / 2);
      }
      if (p.m === 'glass') m.castShadow = false;
      m.userData.main = p.m === 'main' || p.m === 'main2';
      m.userData.front = !!p.front;
    });
  }
  // Model .glb: wczytany raz (pamięć podręczna), kopiowany i dopasowany do wymiarów mebla.
  const modelCache = {};
  function buildModel(g, o) {
    const md = App.model3d(o.model);
    if (!md) return;
    let c = modelCache[md.id];
    if (!c) {
      c = modelCache[md.id] = { scene: null };
      new THREE.GLTFLoader().load(md.src, (gltf) => { c.scene = gltf.scene; dirty = true; }, undefined, () => { c.error = true; });
    }
    if (!c.scene) return;
    const obj = c.scene.clone(true), box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
    // Spód na podłodze, środek w środku obrysu; skala do l × h × w.
    const inner = new THREE.Group();
    inner.add(obj);
    obj.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    inner.scale.set(o.l / (size.x || 1), o.h / (size.y || 1), o.w / (size.z || 1));
    obj.traverse(x => { if (x.isMesh) { x.castShadow = x.receiveShadow = true; x.userData.main = true; } });
    g.add(inner);
  }

  // base – rzędna dołu (względem rodzica), to – rzędna bezwzględna, powyżej której komin jest ukryty.
  function buildChimney(parent, o, i, base, to = Infinity) {
    const top = App.chimneyTop(o, i), parentY = parent === root ? 0 : base;
    const h = Math.min(top, to) - base;
    if (h <= 0) return;
    const g = new THREE.Group();
    g.position.set(o.x, base - parentY, o.y);
    g.rotation.y = -o.rot * Math.PI / 180;
    parent.add(g);
    box(g, mat('#9a4a36'), -o.l / 2, o.l / 2, 0, h, o.w);
    if (top <= to) box(g, mat('#5b5b5b'), -o.l / 2 - 6, o.l / 2 + 6, h, h + 8, o.w + 12);
  }

  // ---------- Dach ----------
  // Budowany w układzie lokalnym dachu: u – wzdłuż kalenicy (l), v – w poprzek (w), y – wysokość bezwzględna.
  function buildRoof(r, i, wallMat) {
    const lv = App.project.levels[i];
    const top = App.elevation(i) + (lv.attic ? 0 : App.levelHeight(lv)), base = App.roofBase(i, r);
    const ov = r.overhang || 0, tan = Math.tan(r.pitch * Math.PI / 180), hl = r.l / 2, hw = r.w / 2;
    const g = new THREE.Group();
    g.position.set(r.x, 0, r.y);
    g.rotation.y = -r.rot * Math.PI / 180;
    root.add(g);
    const roofMat = roofMaterial(r.color);
    const fillMat = mat(App.project.settings.wallColor, { side: THREE.DoubleSide });

    // Ścianka kolankowa przy podniesionym dachu.
    // Ścianki kolankowe dachu tylko wtedy, gdy pod dachem nie stoją narysowane ściany (poddasza lub wyższej kondygnacji).
    const wallsUnder = (lv.attic && lv.walls.length) || App.project.levels.some((l, j) => j > i && App.roofsOver(j).some(o => o.r === r));
    if (base - top > 0.5 && !wallsUnder) {
      const k = 20;
      box(g, wallMat, -hl, hl, top, base, k, -hw + k / 2);
      box(g, wallMat, -hl, hl, top, base, k, hw - k / 2);
      [-1, 1].forEach(sd => {
        const m = mesh(new THREE.BoxGeometry(k, base - top, r.w - 2 * k), wallMat, g);
        m.position.set(sd * (hl - k / 2), (top + base) / 2, 0);
      });
    }
    if (r.type === 'flat') {
      box(g, roofMat, -hl - ov, hl + ov, base, base + 20, r.w + 2 * ov);
      return;
    }

    const faces = [], gables = [];
    const yE = base - ov * tan;
    if (r.type === 'shed') {
      const yH = base + (r.w + ov) * tan, yW = base + r.w * tan;
      const A = [-hl - ov, yE, -hw - ov], B = [hl + ov, yE, -hw - ov], C = [hl + ov, yH, hw + ov], D = [-hl - ov, yH, hw + ov];
      faces.push([A, B, C, D]);
      [-hl, hl].forEach(u => gables.push({ plane: 'u', at: u, poly: [[-hw, base], [hw, base], [hw, yW]], topAt: (v) => base + (v + hw) * tan }));
      gables.push({ plane: 'v', at: hw, poly: [[-hl, base], [hl, base], [hl, yW], [-hl, yW]], topAt: () => yW });
    } else if (r.type === 'hip') {
      // Kalenica zawsze wzdłuż dłuższego boku.
      const swap = r.l < r.w, L = swap ? hw : hl, Wd = swap ? hl : hw;
      const P = (u, y, v) => (swap ? [v, y, u] : [u, y, v]);
      const yR = base + Wd * tan, r0 = Math.min(-L + Wd, 0), r1 = Math.max(L - Wd, 0);
      const A = P(-L - ov, yE, -Wd - ov), B = P(L + ov, yE, -Wd - ov), E = P(-L - ov, yE, Wd + ov), F = P(L + ov, yE, Wd + ov);
      const R0 = P(r0, yR, 0), R1 = P(r1, yR, 0);
      faces.push([A, B, R1, R0], [R0, R1, F, E], [A, R0, E], [B, F, R1]);
    } else if (App.roofKinked(r)) {
      // Dach z załamaniem: połać z każdego odcinka profilu, szczyt – wielokąt pod profilem.
      const pr = App.roofProfile(r);
      for (let k = 1; k < pr.length; k++) {
        const [b0, h0] = pr[k - 1], [b1, h1] = pr[k];
        faces.push([[-hl - ov, base + h0, b0], [hl + ov, base + h0, b0], [hl + ov, base + h1, b1], [-hl - ov, base + h1, b1]]);
      }
      const inner = pr.filter(([b]) => b > -hw && b < hw).map(([b, h]) => [b, base + h]);
      const poly = [[-hw, base], [hw, base], ...inner.reverse()];
      [-hl, hl].forEach(u => gables.push({ plane: 'u', at: u, poly, topAt: (v) => base + App.roofProfileAt(pr, v) }));
    } else {
      const yR = base + hw * tan;
      const A = [-hl - ov, yE, -hw - ov], B = [hl + ov, yE, -hw - ov], C = [hl + ov, yR, 0], D = [-hl - ov, yR, 0];
      const E = [-hl - ov, yE, hw + ov], F = [hl + ov, yE, hw + ov];
      faces.push([A, B, C, D], [D, C, F, E]);
      [-hl, hl].forEach(u => gables.push({ plane: 'u', at: u, poly: [[-hw, base], [hw, base], [0, yR]], topAt: (v) => base + (hw - Math.abs(v)) * tan }));
    }
    // Otwory w połaciach pod lukarnami i oknami dachowymi (w układzie lokalnym dachu: u, v).
    const local = (poly) => poly.map(p => { const q = G.toLocal(r, p); return { x: q.a, y: q.b }; });
    const holes = lv.objects.filter(o => o.kind === 'dormer').map(o => App.dormerShape(o, i))
      .filter(ds => ds && ds.roof === r).map(ds => local(ds.poly));
    App.project.levels.forEach((l, j) => l.objects.forEach(o => {
      if (o.kind !== 'roofwin') return;
      const fr = App.roofWinFrame(o, j);
      if (!fr || fr.roof !== r) return;
      const hp = roofWinHole(o, j);
      if (hp) holes.push(local(hp));
    }));
    faces.forEach(face => buildRoofFace(g, face, holes, roofMat));
    gables.forEach(gb => buildGable(g, r, i, gb, fillMat));
  }

  // Płaska połać [[u, y, v], ...] z otworami (wielokąty w rzucie u, v); otwór wystający poza połać jest do niej
  // przycinany i lekko odsuwany od krawędzi, żeby triangulacja nie zawiodła.
  function buildRoofFace(g, face, holes, material) {
    const contour = face.map(([u, , v]) => ({ x: u, y: v }));
    const [P0, P1, P2] = face;
    const e1 = [P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]], e2 = [P2[0] - P0[0], P2[1] - P0[1], P2[2] - P0[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const yAt = (x, z) => P0[1] - (n[0] * (x - P0[0]) + n[2] * (z - P0[2])) / n[1];
    const c = G.centroid(contour);
    const inner = holes.map(hp => G.clipConvex(hp, contour)).filter(hp => hp.length >= 3 && Math.abs(G.area(hp)) > 25)
      .map(hp => hp.map(p => ({ x: c.x + (p.x - c.x) * 0.995, y: c.y + (p.y - c.y) * 0.995 })))
      .map(hp => (G.area(hp) > 0) === (G.area(contour) > 0) ? hp.reverse() : hp);
    const tris = THREE.ShapeUtils.triangulateShape(contour.map(p => new THREE.Vector2(p.x, p.y)), inner.map(hp => hp.map(p => new THREE.Vector2(p.x, p.y))));
    const verts = contour.concat(...inner), pos = [];
    tris.forEach(t => t.forEach(k => { const p = verts[k]; pos.push(p.x, yAt(p.x, p.y), p.y); }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    mesh(geo, material, g);
  }

  // Ściana szczytowa pod dachem: wielokąt w pionowej płaszczyźnie (u = at albo v = at), pogrubiony do wnętrza
  // na grubość ściany pod nią, z otworami na okna wychodzące ponad ściany.
  function buildGable(g, r, i, gb, fillMat) {
    const lv = App.project.levels[i], elev = App.elevation(i), base = App.roofBase(i, r);
    const ra = r.rot * Math.PI / 180, ax = Math.cos(ra), ay = Math.sin(ra);
    const inward = gb.at > 0 ? -1 : 1;
    // Czy element o kierunku (ux, uy) w punkcie c leży w płaszczyźnie szczytu (grubość t)?
    const normal = (c) => { const q = G.toLocal(r, c); return gb.plane === 'u' ? q.a : q.b; };
    const onPlane = (c, ux, uy, t) => {
      const dot = Math.abs(ux * ax + uy * ay), q = G.toLocal(r, c);
      if (gb.plane === 'u' ? dot > 0.05 : dot < 0.999) return null;
      return Math.abs(normal(c) - gb.at) <= t + 10 ? (gb.plane === 'u' ? q.b : q.a) : null;
    };
    // Szczyt zaczyna się nad najwyższą ścianą stojącą w jego płaszczyźnie (na poddaszu – także ścianami strychu,
    // ściętymi połacią) i stoi w licu tej ściany, nawet gdy dach jest od niej trochę szerszy.
    // Ściany ukrytych wyższych kondygnacji się nie liczą – inaczej w szczycie zostałaby dziura.
    let depth = 0, from = -Infinity, at = gb.at;
    const levels = App.project.levels;
    levels.slice(i, Math.max(i, shownLast) + 1).forEach((l, j) => {
      l.walls.forEach(w => {
        const f = App.wallFrame(w), c = { x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 };
        if (onPlane(c, f.ux, f.uy, w.t) == null) return;
        if (!depth) at = normal(c) - inward * w.t / 2;
        depth = Math.max(depth, w.t);
        from = Math.max(from, App.elevation(i + j) + App.wallHeight(l, w));
      });
    });
    let poly = gb.poly;
    if (depth) poly = clipAbove(poly, from);
    if (poly.length < 3) return;
    const shape = new THREE.Shape(poly.map(([s, y]) => new THREE.Vector2(s, y)));
    const ss = poly.map(q => q[0]), sMin = Math.min(...ss) + 3, sMax = Math.max(...ss) - 3;
    lv.openings.forEach(o => {
      const w = lv.walls.find(x => x.id === o.wallId);
      if (!w || o.kind !== 'window') return;
      const Hh = App.wallHeight(lv, w), f = App.wallFrame(w), pos = App.openingPos(w, o);
      // Parapet liczony od podłogi przy ścianie (pokój obniżony, np. garaż na poziomie terenu) – jak w buildWall.
      const sill = App.wallFloorAt(lv, i, w, pos).base + o.sill;
      if (sill + o.height <= Hh) return;
      const s = onPlane({ x: w.x1 + f.ux * pos, y: w.y1 + f.uy * pos }, f.ux, f.uy, w.t);
      if (s == null) return;
      const s0 = Math.max(sMin, s - o.width / 2), s1 = Math.min(sMax, s + o.width / 2);
      const y0 = Math.max(elev + Math.max(sill, Hh), base + 1, depth ? from + 1 : -Infinity), y1 = Math.min(elev + sill + o.height, gb.topAt(s0) - 3, gb.topAt(s1) - 3);
      if (s1 - s0 < 5 || y1 - y0 < 5) return;
      const hole = new THREE.Path();
      hole.moveTo(s0, y0); hole.lineTo(s1, y0); hole.lineTo(s1, y1); hole.lineTo(s0, y1); hole.closePath();
      shape.holes.push(hole);
    });
    const geo = new THREE.ExtrudeGeometry(shape, { depth: depth || 2, bevelEnabled: false });
    const m = new THREE.Matrix4();
    // Obniżony o 3 cm, żeby górna krawędź nie migotała z połacią.
    if (gb.plane === 'u') m.set(0, 0, inward, at, 0, 1, 0, -3, 1, 0, 0, 0, 0, 0, 0, 1);
    else m.set(1, 0, 0, 0, 0, 1, 0, -3, 0, 0, inward, at, 0, 0, 0, 1);
    geo.applyMatrix4(m);
    mesh(geo, fillMat, g);
  }

  // Część wielokąta [[s, y]] leżąca powyżej y = ymin.
  function clipAbove(poly, ymin) {
    const out = [];
    poly.forEach((a, k) => {
      const b = poly[(k + 1) % poly.length], ina = a[1] >= ymin, inb = b[1] >= ymin;
      if (ina) out.push(a);
      if (ina !== inb) {
        const t = (ymin - a[1]) / (b[1] - a[1]);
        out.push([a[0] + (b[0] - a[0]) * t, ymin]);
      }
    });
    return out;
  }

  // Płaski wielokąt [[u, v]] wyciągnięty na grubość d wzdłuż N; U, V – osie płaszczyzny, O – początek.
  function prism(parent, poly, U, V, N, O, d, material, holes = []) {
    const shape = new THREE.Shape(poly.map(([u, v]) => new THREE.Vector2(u, v)));
    holes.forEach(hp => {
      const path = new THREE.Path();
      hp.forEach(([u, v], k) => (k ? path.lineTo(u, v) : path.moveTo(u, v)));
      path.closePath();
      shape.holes.push(path);
    });
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    geo.applyMatrix4(new THREE.Matrix4().makeBasis(U, V, N).setPosition(O));
    return mesh(geo, material, parent);
  }

  // Lukarna (dach wysunięty z połaci): ścianka czołowa z oknami, boczne trójkąty i własny dach.
  // Układ lokalny: x – w poprzek, z – w górę spadku połaci (w rzucie), y – wysokość bezwzględna.
  function buildDormer(o, i, wallMat) {
    const d = App.dormerFrame(o, i);
    if (!d) return;
    const roof = App.roofAt(i, o).r;
    const g = new THREE.Group();
    g.position.set(o.x, 0, o.y);
    g.rotation.y = -d.rot * Math.PI / 180;
    root.add(g);
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const hl = o.l / 2, t = 10, ov = 25, { bF, hF, eH, td, tm } = d;
    const wallM = mat(App.project.settings.wallColor, { side: THREE.DoubleSide });
    const roofM = roofMaterial(roof.color);

    // Ścianka czołowa z oknami.
    // Czoło w licu ściany zaczyna się na jej górze: ścięta ściana sama dochodzi pod lukarnę (czoło to tylko
    // szczyt ponad nią), nieścięta kończy się pod dachem i czoło z oknami stoi na niej.
    const fB = !d.flush ? hF : d.cut ? Math.max(hF, d.wallTop) : Math.min(d.wallTop, eH - 30);
    const y0 = Math.min(hF, fB), front = [[-hl, y0], [hl, y0], [hl, eH]];
    if (o.roof === 'gable') front.push([0, eH + hl * td]);
    front.push([-hl, eH]);
    const frontPoly = clipAbove(front, fB);
    const n = Math.max(0, Math.round(o.windows || 0)), avail = o.l - 50;
    const ww = n ? Math.min(140, (avail - (n - 1) * 25) / n) : 0, wb = fB + 25, wt = eH - 20;
    const holes = [], wins = [];
    if (n && ww > 20 && wt - wb > 30) {
      for (let k = 0; k < n; k++) {
        const c = -((n - 1) * (ww + 25)) / 2 + k * (ww + 25);
        holes.push([[c - ww / 2, wb], [c + ww / 2, wb], [c + ww / 2, wt], [c - ww / 2, wt]]);
        wins.push({ a: c - ww / 2, b: c + ww / 2, bottom: wb, top: wt });
      }
    }
    // Przy ściętej ścianie okna lukarny wstawia się w tę ścianę – czoło to tylko szczyt nad nią.
    if (frontPoly.length >= 3) prism(g, frontPoly, V3(1, 0, 0), V3(0, 1, 0), V3(0, 0, 1), V3(0, 0, bF), t, wallM, d.cut ? [] : holes);
    if (!d.cut) {
      const wg = new THREE.Group();
      wg.position.z = bF + t / 2;
      g.add(wg);
      wins.forEach(op => buildWindow(wg, Object.assign({ o: { kind: 'window' } }, op), t));
    }

    // Boczne trójkąty od połaci do okapu lukarny.
    const side = [[bF, hF], [bF, eH], [bF + d.dEave, eH + d.dEave * d.tdSide]];
    [-1, 1].forEach(sd => prism(g, side, V3(0, 0, 1), V3(0, 1, 0), V3(-sd, 0, 0), V3(sd * hl, 0, 0), t, wallM));

    // Dach lukarny – płaszczyzny kończą się na połaci głównej.
    const tris = [], P = (x, y, z) => [x, y, z], tri = (a, b, c) => tris.push(...a, ...b, ...c);
    const onMain = (y) => bF + (y - hF) / tm;
    const z0 = bF - ov, L = hl + ov;
    if (o.roof === 'gable') {
      const yE = eH - ov * td, yR = eH + hl * td;
      const zE = onMain(yE), zR = onMain(yR);
      [-1, 1].forEach(sd => {
        const A = P(sd * L, yE, z0), B = P(0, yR, z0), C = P(0, yR, zR), D = P(sd * L, yE, zE);
        tri(A, B, C); tri(A, C, D);
      });
    } else {
      const yE = eH - ov * td, zB = bF + d.dEave, yB = eH + d.dEave * td;
      const A = P(-L, yE, z0), B = P(L, yE, z0), C = P(L, yB, zB), D = P(-L, yB, zB);
      tri(A, B, C); tri(A, C, D);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
    geo.computeVertexNormals();
    mesh(geo, roofM, g);
  }

  // Okno dachowe – płaska rama ze szkłem leżąca na połaci.
  // Okno dachowe w układzie połaci: e1 – poziomo (szerokość l), e2 – w górę połaci (długość w), n – normalna.
  function roofWinBasis(o, i) {
    const fr = App.roofWinFrame(o, i);
    if (!fr) return null;
    const ra = fr.rot * Math.PI / 180, cs = Math.cos(fr.slope);
    const e1 = new THREE.Vector3(Math.cos(ra), 0, Math.sin(ra));
    const e2 = new THREE.Vector3(-Math.sin(ra) * cs, Math.sin(fr.slope), Math.cos(ra) * cs);
    const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
    if (n.y < 0) n.negate();
    return { fr, e1, e2, n, C: new THREE.Vector3(o.x, fr.h, o.y) };
  }
  // Otwór w połaci pod oknem dachowym – obrys w rzucie (x, y), trochę mniejszy niż rama, żeby nie było szczeliny.
  function roofWinHole(o, i) {
    const b = roofWinBasis(o, i);
    if (!b) return null;
    const hl = o.l / 2 - 3, hw = o.w / 2 - 3;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s1, s2]) => {
      const p = b.C.clone().addScaledVector(b.e1, s1 * hl).addScaledVector(b.e2, s2 * hw);
      return { x: p.x, y: p.z };
    });
  }
  function buildRoofWin(o, i) {
    const b = roofWinBasis(o, i);
    if (!b) return;
    const { e1, e2, n, C } = b;
    // Prostopadłościan w układzie okna: środek (a wzdłuż e1, c wzdłuż e2), wymiary l × w, grubość od lift.
    const piece = (material, a, c, l, w, thick, lift) => {
      const m = mesh(new THREE.BoxGeometry(1, 1, 1), material, root);
      m.matrixAutoUpdate = false;
      const p = C.clone().addScaledVector(e1, a).addScaledVector(e2, c).addScaledVector(n, lift + thick / 2);
      m.matrix.makeBasis(e1.clone().multiplyScalar(l), n.clone().multiplyScalar(thick), e2.clone().multiplyScalar(w)).setPosition(p);
      return m;
    };
    // Rama (kołnierz na połaci i ościeże pod nią), w środku szyba – przez otwór w połaci widać niebo.
    const frame = mat('#3f3f46', { roughness: 0.6 }), lining = mat('#f1efe9', { roughness: 0.8 });
    const fw = 7, L = o.l, W = o.w;
    piece(frame, 0, -(W - fw) / 2, L, fw, 10, -2);
    piece(frame, 0, (W - fw) / 2, L, fw, 10, -2);
    piece(frame, -(L - fw) / 2, 0, fw, W - 2 * fw, 10, -2);
    piece(frame, (L - fw) / 2, 0, fw, W - 2 * fw, 10, -2);
    // Ościeże od wewnątrz (biała podbitka grubości dachu).
    piece(lining, 0, -(W - 2) / 2, L - 2, 2, 22, -24);
    piece(lining, 0, (W - 2) / 2, L - 2, 2, 22, -24);
    piece(lining, -(L - 2) / 2, 0, 2, W - 4, 22, -24);
    piece(lining, (L - 2) / 2, 0, 2, W - 4, 22, -24);
    const glass = piece(mat('#9cc7e6', { transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1, depthWrite: false }), 0, 0, L - 2 * fw, W - 2 * fw, 1, 3);
    glass.castShadow = false;
  }

  // ---------- Kamera ----------
  function bounds() {
    const b = new THREE.Box3().setFromObject(root);
    if (b.isEmpty()) b.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
    return b;
  }
  V.frame = () => {
    if (!V.ready) return;
    if (dirty) { dirty = false; rebuild(); }
    const b = bounds(), c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3()).length();
    controls.target.copy(c);
    camera.position.set(c.x + size * 0.75, c.y + size * 0.6, c.z + size * 0.95);
    placeSun(c, size);
  };
  V.top = () => {
    if (!V.ready) return;
    const b = bounds(), c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3()).length();
    controls.target.copy(c);
    camera.position.set(c.x, c.y + size * 1.4, c.z + 0.01);
  };
  function placeSun(c, size) {
    sun.position.set(c.x + size * 0.6, c.y + size * 1.2, c.z + size * 0.4);
    sun.target.position.copy(c);
    const r = Math.max(15, size);
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, far: size * 4 + 50 });
    sun.shadow.camera.updateProjectionMatrix();
  }
  // ---------- Spacer (widok z oczu człowieka) ----------
  // Pozycja stóp w metrach (świat), kierunek patrzenia yaw/pitch. Ściany, meble i okna zatrzymują,
  // stopnie do 45 cm pokonuje się krokiem – po schodach wchodzi się na wyższą kondygnację.
  const W = { on: false, pos: null, yaw: 0, pitch: 0, keys: new Set(), saved: null, goal: null, sent: '' };
  const EYE = 1.65, STEP = 0.45, CLIMB = 1.0, RADIUS = 0.28, BODY = [0.5, 0.8, 1.1, 1.3];
  V.walking = () => W.on;
  const caster = () => { const r = new THREE.Raycaster(); r.firstHitOnly = true; return r; };
  const upNormal = (h) => h.face && h.face.normal.clone().transformDirection(h.object.matrixWorld).y;
  // Najwyższa pozioma powierzchnia pod punktem (podłoga, stopień, teren, chodnik) – rzędna w metrach.
  function floorHit(x, z, fromY) {
    const r = caster();
    r.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
    r.far = 60;
    for (const h of r.intersectObjects([root, terrain], true)) {
      if (!h.object.isMesh || !h.object.visible) continue;
      // Nad piwnicą teren nie istnieje (zejście przez otwór w stropie na schody).
      if (h.object === terrain && App.undergroundAt({ x: h.point.x * 100, y: h.point.z * 100 })) continue;
      if (upNormal(h) > 0.5) return h;
    }
    return null;
  }
  function floorBelow(x, z, fromY) {
    const h = floorHit(x, z, fromY);
    return h ? h.point.y : null;
  }
  // Kondygnacja, na której stoi człowiek: podłoga pokoju, schody, mebel – ich kondygnacja; teren – parter.
  // Nie z samej wysokości, bo pokój „na poziomie terenu” przy podniesionym parterze leży niżej niż jego kondygnacja.
  function standOn(h) {
    if (h.object === terrain) { W.level = App.project.ground || 0; return; }
    const pk = pickOf(h.object);
    if (pk && pk.level != null) W.level = Math.min(App.project.levels.length - 1, pk.level + (h.object.userData.levelUp ? 1 : 0));
  }
  // Czy ruch o d (metry) w kierunku dir koliduje z czymś na wysokości kolan, bioder, piersi lub głowy.
  // Kolana i biodra liczone od wyższej z podłóg (tu / przed sobą), głowa – od niższej: przy uskoku między
  // podłogami pokoi nie zatrzymuje krawędź ściany pod progiem ani nadproże drzwi wyciętych od niższej podłogi.
  function blocked(pos, dir, d, hi, lo) {
    const r = caster();
    r.far = d + RADIUS;
    for (const hgt of BODY) {
      r.set(new THREE.Vector3(pos.x, hi + hgt, pos.z), dir);
      // Stopnie nie zatrzymują (także strome schody – o wejściu decyduje wysokość kroku, a z boku w bieg się nie
      // wejdzie, bo krok byłby za wysoki); pod biegiem i spocznikiem człowiek się schyla. Zatrzymuje ścianka balustrady.
      if (r.intersectObject(root, true).some(h => h.object.isMesh && h.object.visible && !h.object.userData.slab && (h.object.userData.rail || !isStairs(h.object)))) return true;
    }
    return false;
  }
  function isStairs(obj) {
    const pk = pickOf(obj), lv = pk && App.project.levels[pk.level];
    const f = lv && App.find(pk.id, lv);
    return !!f && f.obj.kind === 'stairs';
  }
  // Wolna wysokość nad podłogą y w punkcie (x, z) – do schylania się i zatrzymania pod zbyt niską przeszkodą.
  function clearance(x, z, y) {
    const r = caster();
    r.set(new THREE.Vector3(x, y + 0.3, z), new THREE.Vector3(0, 1, 0));
    r.far = EYE + 0.5;
    const h = r.intersectObject(root, true).find(q => q.object.isMesh && q.object.visible && !q.object.material.transparent);
    return h ? h.point.y - y : Infinity;
  }
  // Powierzchnia, na którą można wejść większym krokiem (do CLIMB): podłoga pokoju, ściana pod progiem, teren,
  // nawierzchnia – ale nie mebel, schody czy komin.
  const CLIMBABLE = new Set(['room', 'wall', 'opening', 'path', 'plot', 'area']);
  function climbable(h) {
    if (h.object === terrain || h.object.userData.slab) return true;
    const pk = pickOf(h.object), lv = pk && App.project.levels[pk.level];
    const f = lv && App.find(pk.id, lv);
    return !!f && CLIMBABLE.has(f.kind);
  }
  // Ruch dzielony na krótkie kroki (przy niskiej liczbie klatek jeden skok nie wejdzie w ścianę ani w stopień).
  function tryMove(dx, dz) {
    const len = Math.hypot(dx, dz);
    if (len < 1e-5) return false;
    const n = Math.ceil(len / 0.05);
    let ok = false;
    for (let k = 0; k < n; k++) if (moveOnce(dx / n, dz / n)) ok = true; else break;
    return ok;
  }
  function moveOnce(dx, dz) {
    const len = Math.hypot(dx, dz), feet = new THREE.Vector3(W.pos.x, W.target, W.pos.z);
    for (const [mx, mz] of [[dx, dz], [dx, 0], [0, dz]]) {
      const l = Math.hypot(mx, mz);
      if (l < len * 0.2) continue;
      const dir = new THREE.Vector3(mx / l, 0, mz / l);
      // Podłogi tuż przed sobą: wyższa (uskok do wejścia) i niższa (zejście).
      let hi = feet.y, lo = feet.y;
      for (const t of [l + RADIUS * 0.5, l + RADIUS, l + RADIUS + 0.15, l + RADIUS + 0.3]) {
        const a = floorHit(feet.x + dir.x * t, feet.z + dir.z * t, feet.y + CLIMB);
        if (!a) continue;
        const dy = a.point.y - feet.y;
        if (dy > STEP && climbable(a)) hi = Math.max(hi, a.point.y);
        if (dy < -STEP) lo = Math.min(lo, a.point.y);
      }
      if (blocked(feet, dir, l, hi, lo)) continue;
      // Krok w górę najwyżej o STEP (stopień, niski mebel), w dół – dowolnie (zejście, upadek z krawędzi).
      // Uskok między podłogami pokoi (np. korytarz na poziomie terenu, pokój wyżej, bez narysowanych
      // schodków) – do CLIMB, jakby w drzwiach były stopnie.
      const h = floorHit(W.pos.x + mx, W.pos.z + mz, W.target + CLIMB);
      if (!h) continue;
      const up = h.point.y - W.target;
      if (up > STEP && !climbable(h)) continue;
      if (clearance(W.pos.x + mx, W.pos.z + mz, h.point.y) < 1.2) continue;
      W.pos.x += mx; W.pos.z += mz;
      W.target = h.point.y;
      standOn(h);
      return true;
    }
    return false;
  }
  function walkStep(dt) {
    const k = W.keys, run = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = (run ? 3.5 : 1.5) * dt;
    if (k.has('ArrowLeft') || k.has('KeyQ')) W.yaw += 1.8 * dt;
    if (k.has('ArrowRight') || k.has('KeyE')) W.yaw -= 1.8 * dt;
    let f = 0, sd = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD')) sd += 1;
    if (k.has('KeyA')) sd -= 1;
    const fx = -Math.sin(W.yaw), fz = -Math.cos(W.yaw), rx = -fz, rz = fx;
    if (f || sd) {
      W.goal = null;
      const l = Math.hypot(f, sd);
      tryMove((fx * f + rx * sd) / l * speed, (fz * f + rz * sd) / l * speed);
    } else if (W.goal) {
      // Dwuklik: przejście do wskazanego miejsca.
      const dx = W.goal.x - W.pos.x, dz = W.goal.z - W.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.05 || !tryMove(dx / d * Math.min(d, speed * 1.6), dz / d * Math.min(d, speed * 1.6))) W.goal = null;
    }
    {
      const dy = W.target - W.pos.y;
      W.pos.y += Math.abs(dy) < 0.01 ? dy : dy * Math.min(1, dt * (dy > 0 ? 14 : 8));
    }
    // Pod niskim stropem (spocznik, skos poddasza) człowiek się schyla – oczy 15 cm pod przeszkodą nad głową.
    const want = G.clamp(clearance(W.pos.x, W.pos.z, W.target) - 0.15, 1.05, EYE);
    W.eye = W.eye == null ? want : W.eye + (want - W.eye) * Math.min(1, dt * 8);
    camera.position.set(W.pos.x, W.pos.y + W.eye, W.pos.z);
    camera.rotation.set(W.pitch, W.yaw, 0, 'YXZ');
    sendWalker();
  }
  // Kondygnacja, na której stoi człowiek – do znacznika na rzucie i przełączenia rzutu.
  function sendWalker() {
    const level = G.clamp(W.level == null ? App.project.current : W.level, 0, App.project.levels.length - 1);
    const w = { x: Math.round(W.pos.x * 100), y: Math.round(W.pos.z * 100), yaw: W.yaw, fov: camera.fov * camera.aspect, level };
    const key = `${w.x},${w.y},${w.yaw.toFixed(2)},${level}`;
    if (key === W.sent) return;
    W.sent = key;
    App.walker = w;
    if (level !== App.project.current) App.setLevel(level);
    App.emit('walker');
  }
  // Miejsce upuszczenia ludzika: punkt na rzędnej bieżącej kondygnacji pod kursorem, stopy na podłodze w tym miejscu.
  V.dropTarget = (clientX, clientY) => {
    if (!V.ready) return null;
    const r = renderer.domElement.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
    const ray = caster();
    ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera);
    const p = App.project, ey = App.elevation(p.current) / 100;
    const pt = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -ey), new THREE.Vector3());
    if (!pt || pt.distanceTo(camera.position) > 300) return null;
    const f = floorBelow(pt.x, pt.z, ey + 1.2);
    pt.y = f == null ? ey : f;
    return pt;
  };
  let marker = null;
  V.showDrop = (pt) => {
    if (!V.ready) return;
    if (!marker) {
      marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.34, 40), new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthTest: false, transparent: true, opacity: 0.9 }));
      marker.rotation.x = -Math.PI / 2;
      marker.renderOrder = 10;
      scene.add(marker);
    }
    marker.visible = !!pt;
    if (pt) marker.position.set(pt.x, pt.y + 0.02, pt.z);
  };
  V.walkStart = (pt, yaw) => {
    if (!V.ready || !pt) return;
    V.showDrop(null);
    if (!W.on) {
      W.saved = { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
      // Patrzymy w tę stronę, w którą patrzyła kamera.
      const d = controls.target.clone().sub(camera.position);
      W.yaw = Math.atan2(-d.x, -d.z);
    }
    if (yaw != null) W.yaw = yaw;
    W.pitch = 0;
    W.on = true;
    W.goal = null;
    W.eye = null;
    W.pos = pt.clone();
    W.level = App.project.current;
    const h = floorHit(pt.x, pt.z, pt.y + STEP);
    W.target = h ? h.point.y : pt.y;
    if (h) standOn(h);
    controls.enabled = false;
    camera.fov = 70;
    camera.near = 0.05;
    camera.updateProjectionMatrix();
    dirty = true;
    renderer.domElement.focus && renderer.domElement.focus();
    App.emit('walk', true);
  };
  V.walkStop = () => {
    if (!W.on) return;
    W.on = false;
    W.keys.clear();
    const s = W.saved;
    camera.position.copy(s.pos);
    controls.target.copy(s.target);
    camera.fov = s.fov;
    camera.near = 0.1;
    camera.updateProjectionMatrix();
    controls.enabled = true;
    App.walker = null;
    W.sent = '';
    dirty = true;
    App.emit('walker');
    App.emit('walk', false);
  };
  function initWalk() {
    const el = renderer.domElement;
    let look = null;
    el.addEventListener('pointerdown', (e) => {
      if (!W.on) return;
      look = { x: e.clientX, y: e.clientY, yaw: W.yaw, pitch: W.pitch };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!W.on || !look || !e.buttons) return;
      // Jak w Street View: przeciąganie „chwyta” obraz.
      const k = (camera.fov * Math.PI / 180) / el.clientHeight;
      W.yaw = look.yaw + (e.clientX - look.x) * k;
      W.pitch = G.clamp(look.pitch + (e.clientY - look.y) * k, -1.45, 1.45);
    });
    el.addEventListener('pointerup', () => { look = null; });
    el.addEventListener('contextmenu', (e) => { if (W.on) e.preventDefault(); });
    el.addEventListener('wheel', (e) => {
      if (!W.on) return;
      e.preventDefault();
      camera.fov = G.clamp(camera.fov + Math.sign(e.deltaY) * 5, 25, 95);
      camera.updateProjectionMatrix();
    }, { passive: false });
    el.addEventListener('dblclick', (e) => {
      if (!W.on) return;
      const r = el.getBoundingClientRect(), ray = caster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const h = ray.intersectObjects([root, terrain], true).find(x => x.object.isMesh && x.object.visible && !(x.object === terrain && App.undergroundAt({ x: x.point.x * 100, y: x.point.z * 100 })));
      if (!h) return;
      if (upNormal(h) > 0.5) W.goal = h.point.clone();
      else W.goal = h.point.clone().addScaledVector(ray.ray.direction, -0.4);
    });
    // Klawisze ruchu przechwytywane przed skrótami edytora (W, S, A, D, Q, E, strzałki).
    const MOVE = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
    window.addEventListener('keydown', (e) => {
      if (!W.on || !V.visible || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') { V.walkStop(); }
      else if (MOVE.has(e.code)) W.keys.add(e.code);
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
    window.addEventListener('keyup', (e) => { W.keys.delete(e.code); });
    window.addEventListener('blur', () => W.keys.clear());
  }

  V.screenshot = () => {
    if (!V.ready) return null;
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  };
})(window.App);
