'use strict';
// Interfejs: pasek narzędzi, kondygnacje, panel właściwości, ustawienia, pliki, skróty klawiszowe.
(function (App) {
  const G = App.geom;
  const E = App.editor;
  const $ = (sel) => document.querySelector(sel);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs) {
      if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'className') el.className = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k === 'checked') el.checked = !!attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    kids.flat().forEach(c => c != null && el.append(c));
    return el;
  };
  const svg = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

  const TOOLS = [
    { id: 'select', name: 'Zaznacz', key: 'V', icon: svg('<path d="M5 3l14 8-6 2-3 6z"/>') },
    { id: 'wall', name: 'Ściana', key: 'W', icon: svg('<path d="M3 17h18v-4H3z" fill="currentColor" fill-opacity=".25"/><path d="M3 9h7v4"/>') },
    { id: 'room', name: 'Pokój', key: 'R', icon: svg('<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 12h6"/>') },
    { id: 'poly', name: 'Pokój dowolny', key: 'P', icon: svg('<path d="M4 6l9-2 7 7-4 9H6z"/>') },
    { id: 'door', name: 'Drzwi', key: 'D', icon: svg('<path d="M3 20h4M17 20h4M7 20V6"/><path d="M7 6a14 14 0 0 1 10 14" stroke-dasharray="2 2"/>') },
    { id: 'window', name: 'Okno', key: 'O', icon: svg('<rect x="3" y="9" width="18" height="6"/><path d="M3 12h18"/>') },
    { id: 'stairs', name: 'Schody', key: 'S', icon: svg('<path d="M4 20h4v-4h4v-4h4V8h4V4"/>') },
    { id: 'chimney', name: 'Komin', key: 'K', icon: svg('<path d="M7 21V8h8v13"/><path d="M6 8h10M11 5c0-2 2-2 2-3M9 5c0-1 1-1 1-2"/>') },
    { id: 'roofwin', name: 'Okno dachowe', key: 'L', icon: svg('<path d="M3 16l9-9 9 9"/><path d="M9 12.5l3-3 3 3-3 3z" fill="currentColor" fill-opacity=".25"/>') },
    { id: 'dormer', name: 'Lukarna', key: 'U', icon: svg('<path d="M2 18l10-10 10 10"/><path d="M8 14v-4h8v4" /><path d="M7 10l5-3 5 3"/>') },
    { id: 'install', name: 'Instalacje', key: 'I', icon: svg('<path d="M13 3l-6 10h5l-1 8 6-10h-5z"/>') },
    { id: 'furniture', name: 'Meble', key: 'E', icon: svg('<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M3 11h18v5H3zM5 16v3M19 16v3"/>') },
    { id: 'roof', name: 'Dach', key: 'A', icon: svg('<path d="M2 13l10-8 10 8"/><path d="M5 11v8h14v-8"/>') },
    { id: 'plot', name: 'Działka', key: 'G', icon: svg('<path d="M3 7l8-4 10 5-3 12-14-2z" stroke-dasharray="4 2"/>') },
    { id: 'path', name: 'Nawierzchnia', key: 'N', icon: svg('<path d="M6 21l4-18M18 21l-4-18"/><path d="M12 5v2M12 11v2M12 17v2"/>') },
    { id: 'fence', name: 'Płot', key: 'Z', icon: svg('<path d="M5 21V7l2-3 2 3v14M15 21V7l2-3 2 3v14M3 10h18M3 16h18"/>') },
    { id: 'garden', name: 'Ogród', key: 'Y', icon: svg('<circle cx="12" cy="9" r="6"/><path d="M12 15v6M9 21h6"/>') },
  ];

  const UI = App.ui = {};

  // ---------- Pasek narzędzi ----------
  function buildTools() {
    const box = $('#tools');
    TOOLS.forEach(t => box.append(h('button', {
      className: 'tool', 'data-tool': t.id, title: `${t.name} (${t.key})`, onclick: () => E.setTool(t.id),
      html: `${t.icon}<span>${t.name}</span><kbd>${t.key}</kbd>`,
    })));
    App.on('tool', () => {
      box.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === E.tool));
      renderProps();
      updateStatus();
    });
  }

  // ---------- Kondygnacje ----------
  function renderLevels() {
    const box = $('#levels');
    box.innerHTML = '';
    const p = App.project;
    for (let i = p.levels.length - 1; i >= 0; i--) {
      const lv = p.levels[i];
      const row = h('div', { className: 'level' + (i === p.current ? ' active' : ''), onclick: (e) => { if (e.target.tagName !== 'INPUT' && i !== p.current) App.setLevel(i); } },
        h('span', { className: 'lv-elev', title: 'Rzędna podłogi' }, (App.elevation(i) / 100).toFixed(2).replace('.', ',') + (lv.attic ? ' ⌂' : '')),
        h('input', { className: 'lv-name', value: lv.name, title: 'Nazwa kondygnacji', onfocus: () => { if (i !== p.current) App.setLevel(i); }, onchange: (e) => App.edit(() => { lv.name = e.target.value || lv.name; }) }),
        h('input', { className: 'lv-h', type: 'number', min: 150, max: 600, step: 5, value: lv.height, title: 'Wysokość kondygnacji [cm]', onchange: (e) => App.edit(() => { lv.height = G.clamp(+e.target.value || 270, 150, 600); }) }),
      );
      box.append(row);
    }
    const lv = App.level();
    $('#chk-attic').checked = !!lv.attic;
    $('#btn-lv-copy').textContent = p.current === 0 && p.levels.length > 1 ? 'Kopiuj ściany z wyższej' : 'Kopiuj ściany z niższej';
    const lift = $('#inp-lift');
    if (document.activeElement !== lift) lift.value = Math.round(p.lift || 0);
    const inp = $('#inp-lv-walls');
    if (document.activeElement !== inp) inp.value = Math.round(App.levelWallHeight(lv));
    $('#chk-keep-ridge').parentElement.style.display = lv.roofs.length || App.roofsOver(p.current).length ? '' : 'none';
    $('#attic-note').textContent = lv.attic
      ? 'Dach tej kondygnacji ścina jej ściany od wysokości „Wysokość ścian” (ścianka kolankowa) w górę. Kondygnacja powyżej to strych.'
      : App.roofsOver(p.current).length ? 'Kondygnacja pod dachem z niższej kondygnacji – dach ścina jej ściany. „Wysokość ścian” to tu ścianka kolankowa – jej podniesienie podnosi ten dach.' : '';
  }
  function toggleAttic(on) {
    App.edit(() => App.setAttic(App.level(), on));
  }
  function addLevel() {
    App.edit(() => {
      const p = App.project, n = p.levels.length, above = n - (p.ground || 0);
      p.levels.push(App.newLevel(above === 1 ? 'Piętro' : `Piętro ${above}`, 260));
      p.current = n;
    });
    App.select(null);
  }
  // Piwnica – nowa kondygnacja pod najniższą; parter zostaje na poziomie terenu.
  function addBasement() {
    App.edit(() => {
      const p = App.project, depth = (p.ground || 0) + 1;
      p.levels.unshift(App.newLevel(depth === 1 ? 'Piwnica' : `Piwnica ${depth}`, 250));
      p.ground = (p.ground || 0) + 1;
      p.current = 0;
    });
    App.select(null);
  }
  function removeLevel() {
    const p = App.project;
    if (p.levels.length < 2) return;
    const lv = App.level();
    const empty = !lv.walls.length && !lv.rooms.length && !lv.objects.length;
    if (!empty && !confirm(`Usunąć kondygnację „${lv.name}” razem z zawartością?`)) return;
    App.edit(() => {
      const i = p.current;
      p.levels.splice(i, 1);
      if (i < (p.ground || 0)) p.ground--;
      p.ground = Math.min(p.ground || 0, p.levels.length - 1);
      p.current = Math.max(0, i - 1);
    });
    App.select(null);
  }
  // Okno wyboru: które pokoje niższej kondygnacji przenieść (ich ściany, opcjonalnie też obrys pokoju).
  function copyWallsFromBelow() {
    // Z najniższej kondygnacji (np. piwnicy) – z kondygnacji powyżej.
    const p = App.project, below = p.levels[p.current - 1] || p.levels[p.current + 1];
    if (!below) return alert('Brak innej kondygnacji.');
    const roomBoxes = below.rooms.map(r => ({ r, el: h('input', { type: 'checkbox', checked: true }) }));
    const loose = below.walls.filter(w => !App.wallRooms(below, w).length);
    const looseBox = h('input', { type: 'checkbox', checked: true });
    const roomsToo = h('input', { type: 'checkbox', checked: false });
    const close = () => overlay.remove();
    const run = () => {
      const chosen = roomBoxes.filter(b => b.el.checked).map(b => b.r);
      // Ściana tylko zaznaczonych pokoi idzie w całości; wspólna z odznaczonym – tylko odcinki przy zaznaczonych.
      const walls = [];
      below.walls.forEach(w => {
        const rs = App.wallRooms(below, w);
        if (!rs.length) { if (looseBox.checked) walls.push(w); return; }
        if (rs.every(r => chosen.includes(r))) { walls.push(w); return; }
        const f = App.wallFrame(w), tOf = (p) => (p.x - w.x1) * f.ux + (p.y - w.y1) * f.uy;
        rs.filter(r => chosen.includes(r)).forEach(r => r.pts.forEach((a, k) => {
          const b = r.pts[(k + 1) % r.pts.length];
          if (!App.edgeOnWall(w, a, b)) return;
          const t0 = G.clamp(Math.min(tOf(a), tOf(b)), 0, f.L), t1 = G.clamp(Math.max(tOf(a), tOf(b)), 0, f.L);
          if (t1 - t0 > 1) walls.push(Object.assign({}, w, { x1: w.x1 + f.ux * t0, y1: w.y1 + f.uy * t0, x2: w.x1 + f.ux * t1, y2: w.y1 + f.uy * t1 }));
        }));
      });
      App.edit(() => {
        const lv = App.level();
        walls.forEach(w => {
          const same = (x) => (App.near(x.x1, x.y1, w.x1, w.y1) && App.near(x.x2, x.y2, w.x2, w.y2)) || (App.near(x.x1, x.y1, w.x2, w.y2) && App.near(x.x2, x.y2, w.x1, w.y1));
          if (!lv.walls.some(same)) {
            lv.walls.push(Object.assign({}, w, { id: App.uid(), h: 0 }));
          }
        });
        if (roomsToo.checked) {
          chosen.forEach(r => lv.rooms.push(Object.assign({}, r, { id: App.uid(), pts: r.pts.map(q => ({ x: q.x, y: q.y })) })));
        }
      });
      close();
    };
    const row = (input, text) => h('label', { className: 'pick' }, input, h('span', {}, text));
    const all = (v) => roomBoxes.forEach(b => { b.el.checked = v; });
    const overlay = h('div', { className: 'modal', onclick: (e) => { if (e.target === overlay) close(); } },
      h('div', { className: 'dialog' },
        h('h3', {}, `Kopiuj ściany z: ${below.name}`),
        h('p', { className: 'muted' }, 'Zaznacz pokoje, których ściany mają trafić na bieżącą kondygnację. Ściana wspólna z odznaczonym pokojem zostanie skopiowana tylko na odcinku przy zaznaczonych.'),
        h('div', { className: 'pick-actions' },
          h('button', { onclick: () => all(true) }, 'Wszystkie'),
          h('button', { onclick: () => all(false) }, 'Żaden')),
        h('div', { className: 'pick-list' },
          roomBoxes.map(b => row(b.el, `${b.r.name} (${App.roomNetArea(below, b.r).toFixed(1).replace('.', ',')} m²)`)),
          loose.length ? row(looseBox, `Ściany poza pokojami (${loose.length})`) : null),
        row(roomsToo, 'Kopiuj też pokoje (podłogi i nazwy)'),
        h('div', { className: 'actions' },
          h('button', { onclick: close }, 'Anuluj'),
          h('button', { className: 'primary', onclick: run }, 'Kopiuj'))));
    document.body.append(overlay);
  }


  // ---------- Formularze ----------
  // spec: { key, label, type: number|text|color|checkbox|select|info, get, set, min, max, step, unit, options }
  function form(title, spec, actions) {
    const wrap = h('div', { className: 'form' });
    if (title) wrap.append(h('h3', {}, title));
    spec.filter(Boolean).forEach(f => {
      let input;
      const val = f.get();
      if (f.type === 'info') {
        wrap.append(h('div', { className: 'row' }, h('label', {}, f.label), h('span', { className: 'info' }, val)));
        return;
      }
      if (f.type === 'select') {
        input = h('select', {}, f.options.map(([v, t]) => {
          const o = h('option', { value: v }, t);
          if (String(v) === String(val)) o.selected = true;
          return o;
        }));
      } else if (f.type === 'checkbox') {
        input = h('input', { type: 'checkbox' });
        input.checked = !!val;
      } else {
        input = h('input', { type: f.type || 'number' });
        if (f.min != null) input.min = f.min;
        if (f.max != null) input.max = f.max;
        input.step = f.step || 1;
        input.value = val == null ? '' : val;
        if (f.placeholder) input.placeholder = f.placeholder;
      }
      input.dataset.key = f.key || f.label;
      input.addEventListener('change', () => {
        let v = f.type === 'checkbox' ? input.checked : input.value;
        if (!f.type || f.type === 'number') {
          v = parseFloat(String(v).replace(',', '.'));
          if (isNaN(v)) v = f.allowEmpty ? 0 : f.get();
          if (f.min != null) v = Math.max(f.min, v);
          if (f.max != null) v = Math.min(f.max, v);
        }
        f.set(v);
      });
      const lbl = h('label', {}, f.label);
      const row = h('div', { className: 'row' + (f.type === 'checkbox' ? ' check' : '') }, lbl, input);
      if (f.unit) row.append(h('span', { className: 'unit' }, f.unit));
      wrap.append(row);
    });
    if (actions) wrap.append(h('div', { className: 'actions' }, actions.flat()));
    return wrap;
  }
  const editSet = (fn) => (v) => App.edit(() => fn(v));

  // Pola wyboru tekstury dla powierzchni o[key]: tekstura z biblioteki, sposób (powielanie / rozciągnięcie), skala wzoru.
  function texFields(o, key, label) {
    const lib = App.project.textures || [], a = o[key];
    if (!lib.length) return [];
    const f = [{ key, label, type: 'select', options: [['', 'brak'], ...lib.map(t => [t.id, t.name])], get: () => (a ? a.id : ''),
      set: editSet(v => { if (!v) delete o[key]; else o[key] = Object.assign({ mode: 'tile', scale: 100 }, o[key], { id: v }); }) }];
    if (a) {
      f.push({ key: key + 'Mode', label: '– sposób', type: 'select', options: [['tile', 'powielanie'], ['stretch', 'rozciągnięcie']], get: () => a.mode, set: editSet(v => { a.mode = v; }) });
      if (a.mode !== 'stretch') {
        f.push({ key: key + 'Scale', label: '– skala wzoru', unit: '%', min: 5, max: 2000, step: 5, get: () => a.scale || 100, set: editSet(v => { a.scale = v; }) });
        // Spoiny między powtórzeniami albo wzór ciągły (bez żadnych kresek na łączeniach).
        f.push({ key: key + 'Joints', label: '– przerwy (spoiny)', type: 'select', options: [['0', 'brak – wzór ciągły'], ['1', 'tak']],
          get: () => (a.joint > 0 ? '1' : '0'), set: editSet(v => { a.joint = v === '1' ? (a.lastJoint || 1) : 0; }) });
        if (a.joint > 0) {
          f.push({ key: key + 'Joint', label: '– szerokość spoin', unit: 'cm', min: 0.1, max: 50, step: 0.1, get: () => a.joint, set: editSet(v => { a.joint = a.lastJoint = v; }) });
          f.push({ key: key + 'JointColor', label: '– kolor spoin', type: 'color', get: () => a.jointColor || '#d8d2c8', set: editSet(v => { a.jointColor = v; }) });
        }
      }
    }
    return f;
  }
  const defSet = (obj, key) => (v) => { obj[key] = v; App.saveDefaults(); E.render(); };

  function selectionForm(sel) {
    const lv = App.level(), o = sel.obj;
    // Kopiuj / Wklej / Usuń – wspólne dla wszystkich elementów.
    const del = [
      h('button', { title: 'Kopiuj (Ctrl+C)', onclick: () => E.copy() }, 'Kopiuj'),
      E.clipboard ? h('button', { title: 'Wklej (Ctrl+V) – pod kursorem na rzucie albo obok oryginału', onclick: () => E.paste() }, 'Wklej') : null,
      h('button', { className: 'danger', onclick: deleteSelection }, 'Usuń'),
    ].filter(Boolean);
    if (sel.kind === 'wall') {
      const f = App.wallFrame(o);
      return form('Ściana', [
        { key: 'len', label: 'Długość', unit: 'cm', min: 1, get: () => Math.round(f.L * 10) / 10, set: editSet(v => setWallLength(lv, o, v)) },
        { key: 't', label: 'Grubość', unit: 'cm', min: 5, max: 100, get: () => o.t, set: editSet(v => { o.t = v; }) },
        { key: 'h', label: 'Wysokość', unit: 'cm', min: 0, max: 1000, allowEmpty: true, placeholder: String(lv.height), get: () => o.h || '', set: editSet(v => { o.h = v || 0; }) },
        { label: 'Otwory', type: 'info', get: () => String(lv.openings.filter(x => x.wallId === o.id).length) },
        ...texFields(o, 'tex', 'Tekstura ściany'),
      ], [del]);
    }
    if (sel.kind === 'room') {
      return form('Pokój', [
        { key: 'name', label: 'Nazwa', type: 'text', get: () => o.name, set: editSet(v => { o.name = v; }) },
        { key: 'color', label: 'Kolor podłogi', type: 'color', get: () => o.color, set: editSet(v => { o.color = v; }) },
        { key: 'atGround', label: 'Podłoga na poziomie terenu (np. garaż)', type: 'checkbox', get: () => !!o.atGround, set: editSet(v => { o.atGround = v; }) },
        o.atGround ? null : { key: 'drop', label: 'Podłoga niżej o', unit: 'cm', min: 0, max: 600, get: () => o.drop || 0, set: editSet(v => { o.drop = v; }) },
        { label: 'Rzędna podłogi', type: 'info', get: () => ((App.elevation(App.project.current) - App.roomDrop(o, App.project.current)) / 100).toFixed(2).replace('.', ',') + ' m' },
        { label: 'Pow. netto', type: 'info', get: () => App.roomNetArea(lv, o).toFixed(2).replace('.', ',') + ' m²' },
        { label: 'Pow. w osiach', type: 'info', get: () => (Math.abs(G.area(o.pts)) / 10000).toFixed(2).replace('.', ',') + ' m²' },
        { label: 'Obwód', type: 'info', get: () => (G.perimeter(o.pts) / 100).toFixed(2).replace('.', ',') + ' m' },
        { label: 'Narożniki', type: 'info', get: () => String(o.pts.length) },
        ...texFields(o, 'texFloor', 'Tekstura podłogi'),
        ...texFields(o, 'texCeil', 'Tekstura sufitu'),
      ], [del]);
    }
    if (sel.kind === 'opening') {
      const w = lv.walls.find(x => x.id === o.wallId), L = w ? App.wallFrame(w).L : 1000;
      const spec = [
        { key: 'width', label: 'Szerokość', unit: 'cm', min: 30, max: Math.floor(L), get: () => o.width, set: editSet(v => { o.width = v; }) },
        { key: 'height', label: 'Wysokość', unit: 'cm', min: 30, max: 400, get: () => o.height, set: editSet(v => { o.height = v; }) },
      ];
      if (o.kind === 'window') {
        const Hh = w ? App.wallHeight(lv, w) : 270;
        spec.push({ key: 'sill', label: 'Parapet', unit: 'cm', min: 0, max: 1500, get: () => o.sill, set: editSet(v => { o.sill = v; }) });
        spec.push({ key: 'gable', label: 'W szczycie dachu (nad ścianą)', type: 'checkbox', get: () => o.sill >= Hh,
          set: editSet(v => { o.sill = v ? Hh + 30 : Math.min(App.defaults.window.sill, Hh - o.height); }) });
      }
      const free = w && App.openingFree(w, o);
      spec.push({ key: 'pos', label: 'Oś od początku ściany', unit: 'cm', min: free ? -Math.floor(L) : 0, max: Math.floor(free ? 2 * L : L), get: () => Math.round(w ? App.openingPos(w, o) : o.pos), set: editSet(v => { o.pos = v; }) });
      if (o.kind === 'door') {
        spec.push({ key: 'sill', label: 'Próg nad podłogą (ujemny – niżej)', unit: 'cm', min: -400, max: 300, get: () => o.sill || 0, set: editSet(v => { o.sill = v; }) });
        spec.push({ key: 'gate', label: 'Brama garażowa', type: 'checkbox', get: () => !!o.gate, set: editSet(v => { o.gate = v; }) });
        spec.push({ key: 'flip', label: 'Zawiasy po drugiej stronie', type: 'checkbox', get: () => o.flip, set: editSet(v => { o.flip = v; }) });
        spec.push({ key: 'side', label: 'Otwieranie na drugą stronę', type: 'checkbox', get: () => o.side, set: editSet(v => { o.side = v; }) });
      }
      spec.push(...texFields(o, 'tex', o.kind === 'window' ? 'Tekstura ramy' : 'Tekstura'));
      return form(o.kind === 'window' ? 'Okno' : o.gate ? 'Brama' : 'Drzwi', spec, [del]);
    }
    if (sel.kind === 'roof') {
      const p = App.project, tan = () => Math.tan(o.pitch * Math.PI / 180);
      const ridge = () => App.roofKinked(o) ? Math.max(...App.roofProfile(o).map(q => q[1]))
        : o.type === 'flat' ? 0 : o.type === 'shed' ? o.w * tan() : Math.min(o.w, o.type === 'hip' ? o.l : o.w) / 2 * tan();
      // Załamanie połaci – tylko dach dwuspadowy; strona A/B to połać po lewej/prawej przy obrocie 0°.
      const kinkSpec = o.type !== 'gable' ? [] : [
        { key: 'kink', label: 'Załamanie połaci', type: 'select', options: [['0', 'brak'], ['-1', 'po stronie A'], ['1', 'po stronie B']], get: () => String(o.kink || 0),
          set: editSet(v => {
            o.kink = +v;
            if (o.kink && !o.kinkW) { o.kinkW = Math.round(o.w / 3 / 10) * 10; o.kinkPitch = Math.max(10, o.pitch - 20); }
          }) },
        ...(o.kink ? [
          { key: 'kinkW', label: 'Szerokość dolnej części', unit: 'cm', min: 20, max: Math.round(o.w * 0.8), get: () => o.kinkW, set: editSet(v => { o.kinkW = v; }) },
          { key: 'kinkPitch', label: 'Kąt dolnej części', unit: '°', min: 3, max: o.pitch, get: () => o.kinkPitch, set: editSet(v => { o.kinkPitch = v; }) },
        ] : []),
      ];
      return form('Dach', [
        { key: 'type', label: 'Rodzaj', type: 'select', options: App.ROOF_TYPES, get: () => o.type, set: editSet(v => { o.type = v; }) },
        { key: 'pitch', label: 'Kąt nachylenia', unit: '°', min: 3, max: 70, get: () => o.pitch, set: editSet(v => { o.pitch = v; }) },
        { key: 'overhang', label: 'Okap', unit: 'cm', min: 0, max: 200, get: () => o.overhang, set: editSet(v => { o.overhang = v; }) },
        ...kinkSpec,
        { key: 'attic', label: 'Ścina ściany kondygnacji (poddasze)', type: 'checkbox', get: () => !!lv.attic, set: editSet(v => App.setAttic(lv, v)) },
        lv.attic
          ? { key: 'raise', label: 'Ścina ściany od wysokości', unit: 'cm', min: 0, max: 600, get: () => o.raise || 0, set: editSet(v => { o.raise = v; }) }
          : { key: 'raise', label: 'Ścianka kolankowa nad ścianami', unit: 'cm', min: 0, max: 300, get: () => o.raise || 0, set: editSet(v => { o.raise = v; }) },
        { key: 'l', label: 'Długość (wzdłuż kalenicy)', unit: 'cm', min: 50, max: 5000, get: () => Math.round(o.l), set: editSet(v => { o.l = v; }) },
        { key: 'w', label: 'Szerokość', unit: 'cm', min: 50, max: 5000, get: () => Math.round(o.w), set: editSet(v => { o.w = v; }) },
        { key: 'rot', label: 'Obrót', unit: '°', min: -360, max: 360, step: 5, get: () => o.rot, set: editSet(v => { o.rot = v; }) },
        { key: 'color', label: 'Kolor pokrycia', type: 'color', get: () => o.color, set: editSet(v => { o.color = v; }) },
        { key: 'level', label: 'Leży na kondygnacji', type: 'select', options: p.levels.map((l, i) => [i, l.name]), get: () => p.current,
          set: editSet(v => {
            const to = +v;
            if (to === p.current) return;
            App.level().roofs = App.level().roofs.filter(r => r !== o);
            p.levels[to].roofs.push(o);
            p.current = to;
          }) },
        { label: 'Wys. kalenicy', type: 'info', get: () => ((ridge() + (o.raise || 0)) / 100).toFixed(2).replace('.', ',') + (lv.attic ? ' m nad podłogą' : ' m nad ścianami') },
        ...texFields(o, 'tex', 'Tekstura pokrycia'),
      ], [h('button', { onclick: E.rotate }, 'Obróć 90° (T)'), del]);
    }
    if (sel.kind === 'object' && o.kind === 'stairs') {
      const shape = o.shape || 'straight', lay = App.stairLayout(o), first = lay.parts[0];
      const spec = [
        { key: 'shape', label: 'Rodzaj', type: 'select', options: App.STAIR_SHAPES, get: () => shape, set: editSet(v => App.setStairShape(o, v)) },
      ];
      if (shape === 'straight') {
        spec.push({ key: 'w', label: 'Szerokość', unit: 'cm', min: 50, max: 400, get: () => o.w, set: editSet(v => { o.w = v; o.fw = v; }) });
      } else {
        spec.push({ key: 'fw', label: 'Szerokość biegu', unit: 'cm', min: 50, max: 300, get: () => o.fw, set: editSet(v => {
          o.fw = v;
          // Podest nie węższy niż bieg; schody poszerzają się, gdy biegi się nie mieszczą.
          if (o.land && o.land < v && shape === 'L') o.land = v;
          if (o.landW && o.landW < v) o.landW = v;
          App.setStairShape(o, shape);
        }) });
        spec.push({ key: 'w', label: 'Szerokość całkowita', unit: 'cm', min: 60, max: 800, get: () => o.w, set: editSet(v => { o.w = v; }) });
      }
      spec.push(
        { key: 'l', label: shape === 'straight' ? 'Długość biegu' : 'Długość całkowita', unit: 'cm', min: 50, max: 1000, get: () => o.l, set: editSet(v => { o.l = v; }) },
        { key: 'steps', label: 'Liczba stopni', min: shape === 'straight' ? 2 : 4, max: 40, get: () => lay.N, set: editSet(v => { o.steps = Math.round(v); }) },
      );
      if (shape === 'U') {
        spec.push({ key: 'land', label: 'Głębokość spocznika', unit: 'cm', min: 20, max: 500, get: () => Math.round(o.land || o.fw), set: editSet(v => { o.land = v; o.l = Math.max(o.l, v + 60); }) });
      }
      if (shape === 'L') {
        spec.push({ key: 'land', label: 'Długość podestu (wzdłuż 1. biegu)', unit: 'cm', min: 50, max: 500, get: () => Math.round(o.land || o.fw), set: editSet(v => { o.land = Math.max(v, o.fw); o.l = Math.max(o.l, o.land + 60); }) });
        spec.push({ key: 'landW', label: 'Szerokość podestu (wzdłuż 2. biegu)', unit: 'cm', min: 50, max: 500, get: () => Math.round(o.landW || o.fw), set: editSet(v => { o.landW = Math.max(v, o.fw); o.w = Math.max(o.w, o.landW + 60); }) });
      }
      if (shape !== 'straight') spec.push({ key: 'flip', label: 'Skręt w drugą stronę', type: 'checkbox', get: () => !!o.flip, set: editSet(v => { o.flip = v; }) });
      spec.push(
        { key: 'rot', label: 'Obrót', unit: '°', min: -360, max: 360, step: 15, get: () => o.rot, set: editSet(v => { o.rot = v; }) },
        { label: 'Wys. stopnia', type: 'info', get: () => (lv.height / lay.N).toFixed(1).replace('.', ',') + ' cm' },
        { label: 'Głęb. stopnia', type: 'info', get: () => (first.a1 - first.a0).toFixed(1).replace('.', ',') + ' cm' },
      );
      spec.push(...texFields(o, 'tex', 'Tekstura'));
      if (shape !== 'straight') spec.push({ label: 'Podest na', type: 'info', get: () => (lay.parts.find(q => q.landing).k * lv.height / lay.N / 100).toFixed(2).replace('.', ',') + ' m' });
      return form('Schody', spec, [h('button', { onclick: E.rotate }, 'Obróć 90° (T)'), h('button', { onclick: E.mirror }, 'Odbij (M)'), del]);
    }
    if (sel.kind === 'object' && o.kind === 'dormer') {
      const d = App.dormerFrame(o, App.project.current);
      return form('Lukarna', [
        { key: 'roof', label: 'Dach lukarny', type: 'select', options: App.DORMER_ROOFS, get: () => o.roof, set: editSet(v => { o.roof = v; if (v === 'gable' && o.pitch < 25) o.pitch = 35; }) },
        { key: 'l', label: 'Szerokość', unit: 'cm', min: 80, max: 1500, get: () => o.l, set: editSet(v => { o.l = v; }) },
        { key: 'h', label: 'Wys. ścianki czołowej', unit: 'cm', min: 40, max: 400, get: () => o.h, set: editSet(v => { o.h = v; }) },
        { key: 'pitch', label: 'Spadek dachu lukarny', unit: '°', min: 0, max: 60, get: () => o.pitch, set: editSet(v => { o.pitch = v; }) },
        { key: 'flush', label: 'Czoło w licu ściany (podnosi ścianę)', type: 'checkbox', get: () => !!o.flush, set: editSet(v => { o.flush = v; }) },
        o.flush ? { key: 'cutEave', label: 'Przerwij okap pod lukarną', type: 'checkbox', get: () => !!o.cutEave, set: editSet(v => { o.cutEave = v; }) } : null,
        d && d.cut ? null : { key: 'windows', label: 'Liczba okien', min: 0, max: 6, get: () => o.windows, set: editSet(v => { o.windows = Math.round(v); }) },
        { label: 'Głębokość', type: 'info', get: () => d ? (d.depth / 100).toFixed(2).replace('.', ',') + ' m' : 'poza połacią' },
        ...texFields(o, 'tex', 'Tekstura dachu lukarny'),
      ], [del]);
    }
    if (sel.kind === 'object' && o.kind === 'furniture') return furnitureForm(o, del);
    if (sel.kind === 'plot') {
      return form('Działka', [
        { key: 'name', label: 'Nazwa', type: 'text', get: () => o.name, set: editSet(v => { o.name = v; }) },
        { key: 'color', label: 'Kolor terenu', type: 'color', get: () => o.color, set: editSet(v => { o.color = v; }) },
        ...texFields(o, 'tex', 'Tekstura terenu'),
        { label: 'Powierzchnia', type: 'info', get: () => App.fmtArea(o.pts) },
        { label: 'Obwód', type: 'info', get: () => (G.perimeter(o.pts) / 100).toFixed(2).replace('.', ',') + ' m' },
        { label: 'Zabudowa', type: 'info', get: () => builtUp(lv, o) },
        { label: 'Narożniki', type: 'info', get: () => String(o.pts.length) },
      ], [del]);
    }
    if (sel.kind === 'path') {
      return form('Nawierzchnia', [
        { key: 'type', label: 'Rodzaj', type: 'select', options: App.PATH_KINDS.map(k => [k.id, k.name]), get: () => o.type,
          set: editSet(v => { const k = App.pathKind(v); Object.assign(o, { type: v, h: k.h, color: k.color }); }) },
        { key: 'h', label: 'Wysokość nad terenem', unit: 'cm', min: 0.5, max: 300, step: 0.5, get: () => o.h, set: editSet(v => { o.h = v; }) },
        { key: 'color', label: 'Kolor', type: 'color', get: () => o.color, set: editSet(v => { o.color = v; }) },
        ...texFields(o, 'tex', 'Tekstura (kostka, płyty…)'),
        { label: 'Powierzchnia', type: 'info', get: () => App.fmtArea(o.pts) },
      ], [del]);
    }
    if (sel.kind === 'fence') {
      return form('Ogrodzenie', [
        { key: 'style', label: 'Rodzaj', type: 'select', options: App.FENCE_STYLES.map(k => [k.id, k.name]), get: () => o.style,
          set: editSet(v => { o.style = v; o.color = App.fenceStyle(v).color; }) },
        { key: 'h', label: 'Wysokość', unit: 'cm', min: 30, max: 400, get: () => o.h, set: editSet(v => { o.h = v; }) },
        { key: 'base', label: 'Podmurówka', unit: 'cm', min: 0, max: 200, get: () => o.base || 0, set: editSet(v => { o.base = v; }) },
        { key: 'span', label: 'Rozstaw słupków', unit: 'cm', min: 50, max: 600, step: 5, get: () => o.span || 250, set: editSet(v => { o.span = v; }) },
        { key: 'color', label: 'Kolor wypełnienia', type: 'color', get: () => o.color, set: editSet(v => { o.color = v; }) },
        { key: 'baseColor', label: o.style === 'solid' ? 'Kolor słupków i podmurówki' : 'Kolor podmurówki', type: 'color', get: () => o.baseColor || '#a8a29e', set: editSet(v => { o.baseColor = v; }) },
        { key: 'closed', label: 'Zamknięte dookoła', type: 'checkbox', get: () => !!o.closed, set: editSet(v => { o.closed = v && o.pts.length > 2; }) },
        ...texFields(o, 'tex', 'Tekstura wypełnienia'),
        ...texFields(o, 'texBase', 'Tekstura podmurówki'),
        { label: 'Długość', type: 'info', get: () => (App.fenceLength(o) / 100).toFixed(2).replace('.', ',') + ' m' },
      ], [del]);
    }
    if (sel.kind === 'install') return installForm(o, lv, del);
    if (sel.kind === 'object' && o.kind === 'roofwin') {
      const fr = App.roofWinFrame(o, App.project.current);
      return form('Okno dachowe', [
        { key: 'l', label: 'Szerokość', unit: 'cm', min: 30, max: 400, get: () => o.l, set: editSet(v => { o.l = v; }) },
        { key: 'w', label: 'Długość (wzdłuż spadku)', unit: 'cm', min: 30, max: 400, get: () => o.w, set: editSet(v => { o.w = v; }) },
        { label: 'Połać', type: 'info', get: () => fr ? Math.round(fr.slope * 180 / Math.PI) + '°' : 'poza dachem' },
      ], [del]);
    }
    if (sel.kind === 'object') {
      return form('Komin', [
        { key: 'l', label: 'Szerokość', unit: 'cm', min: 20, max: 300, get: () => o.l, set: editSet(v => { o.l = v; }) },
        { key: 'w', label: 'Głębokość', unit: 'cm', min: 20, max: 300, get: () => o.w, set: editSet(v => { o.w = v; }) },
        { key: 'above', label: 'Ponad dach', unit: 'cm', min: 0, max: 500, get: () => o.above, set: editSet(v => { o.above = v; }) },
        ...texFields(o, 'tex', 'Tekstura'),
        { key: 'rot', label: 'Obrót', unit: '°', min: -360, max: 360, step: 15, get: () => o.rot, set: editSet(v => { o.rot = v; }) },
      ], [h('button', { onclick: E.rotate }, 'Obróć 90° (T)'), del]);
    }
    return null;
  }

  // Powierzchnia zabudowy na działce: obrys ścian zewnętrznych parteru (wielokąty ścian i pokoi w obrysie działki).
  function builtUp(lv, plot) {
    const rooms = lv.rooms.filter(r => G.inside(G.centroid(r.pts), plot.pts));
    if (!rooms.length) return '—';
    const area = rooms.reduce((s, r) => s + Math.abs(G.area(r.pts)), 0) / 10000, total = Math.abs(G.area(plot.pts)) / 10000;
    return `${area.toFixed(1).replace('.', ',')} m² (${Math.round(area / total * 100)}%) – w osiach ścian`;
  }

  // ---------- Instalacje ----------
  function installCatalog() {
    const d = App.defaults.install, wrap = h('div', { className: 'form' }, h('h3', {}, 'Nowy element instalacji'));
    const groups = [['el', 'Instalacja elektryczna'], ['wk', 'Instalacja wodno-kanalizacyjna']];
    groups.forEach(([g, title]) => {
      wrap.append(h('div', { className: 'furn-cat' }, title));
      wrap.append(h('div', { className: 'inst-list' }, Object.entries(App.INSTALLS).filter(([, t]) => App.INSTALL_SYS[t.sys].group === g).map(([id, t]) =>
        h('button', { className: 'inst-item' + (d.type === id ? ' active' : ''), onclick: () => { d.type = id; App.saveDefaults(); E.cancel(); renderProps(); } },
          h('i', { style: `background:${App.INSTALL_SYS[t.sys].color}` + (t.shape === 'run' ? ';height:3px;border-radius:2px' : '') }),
          t.name + (t.shape === 'run' ? ' (trasa)' : '')))));
    });
    const t = App.installDef(d.type), lv = App.level();
    wrap.append(h('p', { className: 'muted small' }, t.shape === 'run'
      ? `Trasa biegnie poziomo na wysokości ${App.installDefaultZ(d.type, lv)} cm nad podłogą, w osi ściany. Gniazdka, łączniki i podejścia leżące na trasie dostają w 3D pionowe odejścia.`
      : t.shape === 'wall' ? `Domyślna wysokość: ${App.installDefaultZ(d.type, lv)} cm nad podłogą (zmienisz we właściwościach).` : 'Kliknij w dowolnym miejscu rzutu.'));
    return wrap;
  }
  function installForm(o, lv, del) {
    const d = App.installDef(o.type), sys = d.sys;
    const same = Object.entries(App.INSTALLS).filter(([, t]) => t.shape === d.shape && App.INSTALL_SYS[t.sys].group === App.INSTALL_SYS[sys].group);
    const spec = [
      { key: 'type', label: 'Rodzaj', type: 'select', options: same.map(([id, t]) => [id, t.name]), get: () => o.type, set: editSet(v => { o.type = v; }) },
      { label: 'Instalacja', type: 'info', get: () => App.INSTALL_SYS[sys].name },
    ];
    if (o.type !== 'light' && o.type !== 'riser') spec.push({ key: 'z', label: d.shape === 'run' ? 'Wysokość trasy' : 'Wysokość nad podłogą', unit: 'cm', min: 0, max: 1000, get: () => o.z, set: editSet(v => { o.z = v; }) });
    if (o.wallId) {
      const w = lv.walls.find(x => x.id === o.wallId);
      if (w) spec.push({ key: 'pos', label: 'Od początku ściany', unit: 'cm', min: 0, max: Math.round(App.wallFrame(w).L), get: () => o.pos, set: editSet(v => { o.pos = v; }) });
    }
    if (o.pts) spec.push({ label: 'Długość trasy', type: 'info', get: () => (App.runLength(o) / 100).toFixed(2).replace('.', ',') + ' m' });
    const acts = [];
    if (o.wallId) acts.push(h('button', { onclick: () => App.edit(() => { o.side = -(o.side || 1); }) }, 'Na drugie lico ściany'));
    return form(d.name, spec, [acts, del]);
  }

  // ---------- Meble ----------
  const catOptions = (cur) => App.FURNITURE.filter(d => !(d.photo || d.model) || d.id === cur).map(d => [d.id, `${d.cat}: ${d.name}`]);
  function furnitureForm(o, del) {
    const def = App.furnitureDef(o.type), lib = App.project.textures || [];
    const spec = [
      { key: 'type', label: 'Rodzaj', type: 'select', options: catOptions(o.type), get: () => o.type,
        set: editSet(v => { const d = App.furnitureDef(v); Object.assign(o, { type: v, l: d.l, w: d.w, h: d.h, z: d.z || 0, color: d.color }); delete o.front; delete o.model; }) },
      { key: 'l', label: 'Szerokość', unit: 'cm', min: 1, max: 2000, get: () => o.l, set: editSet(v => { o.l = v; }) },
      { key: 'w', label: 'Głębokość', unit: 'cm', min: 1, max: 2000, get: () => o.w, set: editSet(v => { o.w = v; }) },
      { key: 'h', label: 'Wysokość', unit: 'cm', min: 0.5, max: 1000, get: () => o.h, set: editSet(v => { o.h = v; }) },
      { key: 'z', label: def.site ? 'Nad terenem' : 'Nad podłogą', unit: 'cm', min: 0, max: 1000, get: () => o.z || 0, set: editSet(v => { o.z = v; }) },
      def.model ? null : { key: 'color', label: 'Kolor', type: 'color', get: () => o.color, set: editSet(v => { o.color = v; }) },
    ];
    if (def.photo) {
      spec.push({ key: 'front', label: 'Zdjęcie frontu', type: 'select', options: [['', 'brak'], ...lib.map(t => [t.id, t.name])], get: () => (o.front ? o.front.id : ''),
        set: editSet(v => { if (v) o.front = { id: v }; else delete o.front; }) });
    }
    if (def.model) {
      spec.push({ key: 'model', label: 'Model', type: 'select', options: App.project.models.map(m => [m.id, m.name]), get: () => o.model,
        set: editSet(v => { const m = App.model3d(v); o.model = v; if (m) Object.assign(o, { l: m.l, w: m.w, h: m.h }); }) });
    }
    spec.push(...texFields(o, 'tex', def.model ? 'Tekstura (cały model)' : 'Tekstura korpusu'));
    spec.push({ key: 'rot', label: 'Obrót', unit: '°', min: -360, max: 360, step: 15, get: () => o.rot, set: editSet(v => { o.rot = v; }) });
    const acts = [h('button', { onclick: E.rotate }, 'Obróć 90° (T)'), h('button', { onclick: E.mirror }, 'Odbij (M)')];
    if (def.photo) acts.push(h('button', { onclick: () => textureDialog({ photo: true, onAdd: t => App.edit(() => fitPhoto(o, t)) }) }, 'Wczytaj zdjęcie frontu…'));
    if (def.photo && o.front) acts.push(h('button', { title: 'Wysokość z proporcji zdjęcia przy obecnej szerokości', onclick: () => { const t = App.texture(o.front.id); if (t) App.edit(() => { o.h = Math.round(o.l * t.aspect); }); } }, 'Wysokość wg zdjęcia'));
    if (def.model) acts.push(h('button', { onclick: () => modelDialog(m => App.edit(() => Object.assign(o, { model: m.id, l: m.l, w: m.w, h: m.h }))) }, 'Importuj model…'));
    return form(def.name, spec, [acts, del]);
  }
  // Mebel ze zdjęcia: front ze zdjęcia, wysokość z proporcji, boki w średnim kolorze zdjęcia.
  function fitPhoto(o, t) {
    o.front = { id: t.id };
    o.h = Math.round(o.l * t.aspect);
    if (t.avg) o.color = t.avg;
  }
  // Katalog mebli (narzędzie Meble) albo roślin i wyposażenia ogrodu (narzędzie Ogród).
  function furnitureCatalog(garden) {
    const d = garden ? App.defaults.garden : App.defaults.furniture, wrap = h('div', { className: 'form' }, h('h3', {}, garden ? 'Ogród' : 'Nowy mebel'));
    const pick = (id) => { d.type = id; App.saveDefaults(); App.emit('furnitureType'); renderProps(); };
    if (!!App.furnitureDef(d.type).site !== !!garden) d.type = App.FURNITURE.find(f => !!f.site === !!garden).id;
    [...new Set(App.FURNITURE.filter(f => !!f.site === !!garden).map(f => f.cat))].forEach(cat => {
      wrap.append(h('div', { className: 'furn-cat' }, cat));
      wrap.append(h('div', { className: 'furn-grid' }, App.FURNITURE.filter(f => f.cat === cat).map(f =>
        h('button', { className: 'furn-item' + (d.type === f.id ? ' active' : ''), title: `${f.name} – ${f.l} × ${f.w} × ${f.h} cm`, onclick: () => pick(f.id) },
          App.furnitureThumb(f), h('span', {}, f.name)))));
    });
    const def = App.furnitureDef(d.type);
    if (def.photo) wrap.append(h('p', { className: 'muted small' }, 'Postaw bryłę na rzucie, a potem we właściwościach wczytaj zdjęcie jej frontu (np. lodówki, szafy, kredensu) – zdjęcie pokryje przód, a boki dostaną jego kolor.'));
    if (def.model) {
      const models = App.project.models;
      if (models.length && !App.model3d(d.model)) d.model = models[0].id;
      wrap.append(h('div', { className: 'tex-lib' },
        models.length ? h('div', { className: 'tex-grid' }, models.map(m => h('div', { className: 'tex-item' + (d.model === m.id ? ' active' : ''), title: `${m.name} – ${m.l} × ${m.w} × ${m.h} cm`, onclick: (e) => { if (e.target.tagName !== 'BUTTON') { d.model = m.id; App.saveDefaults(); renderProps(); } } },
          h('img', { src: m.plan, alt: '' }), h('span', {}, m.name),
          h('button', { className: 'icon danger', title: 'Usuń model', onclick: () => { if (confirm(`Usunąć model „${m.name}”? Zniknie też z rzutu.`)) App.removeModel(m.id); } }, '×'))))
          : h('p', { className: 'muted small' }, 'Zaimportuj model w formacie .glb (np. z Sketchfab, Poly Haven, od producenta albo z generatora AI „zdjęcie → 3D”). Potem kliknij na rzucie, aby go postawić.'),
        h('button', { className: 'wide', onclick: () => modelDialog(m => { d.model = m.id; App.saveDefaults(); renderProps(); }) }, 'Importuj model 3D (.glb)…')));
    }
    return wrap;
  }

  // Import modelu .glb: wymiary z obrysu (jednostki glTF to metry), widok z góry do rzutu 2D.
  function modelDialog(onAdd) {
    const file = h('input', { type: 'file', accept: '.glb,model/gltf-binary' });
    const name = h('input', { type: 'text' });
    const dims = ['l', 'w', 'h'].map(() => h('input', { type: 'number', min: 1, max: 5000, step: 1 }));
    const preview = h('canvas', { width: 256, height: 256, className: 'tex-preview' });
    const info = h('p', { className: 'muted small' }, 'Tylko pliki .glb (jeden plik z teksturami). Modele skompresowane Draco nie są obsługiwane.');
    let src = null, plan = null;
    file.onchange = () => {
      const f = file.files[0];
      if (!f) return;
      if (!name.value) name.value = f.name.replace(/\.[^.]+$/, '');
      const r = new FileReader();
      r.onload = () => {
        new THREE.GLTFLoader().parse(r.result, '', (gltf) => {
          const sc = gltf.scene, box = new THREE.Box3().setFromObject(sc), size = box.getSize(new THREE.Vector3());
          // Model w metrach (typowo) albo już w centymetrach.
          const k = Math.max(size.x, size.y, size.z) > 30 ? 1 : 100;
          [size.x, size.z, size.y].forEach((v, j) => { dims[j].value = Math.max(1, Math.round(v * k)); });
          plan = topView(sc, box);
          const px = preview.getContext('2d');
          px.clearRect(0, 0, 256, 256);
          px.drawImage(plan, 0, 0, 256, 256 * plan.height / plan.width);
          const bin = new Uint8Array(r.result);
          let str = '';
          for (let j = 0; j < bin.length; j += 0x8000) str += String.fromCharCode.apply(null, bin.subarray(j, j + 0x8000));
          src = 'data:model/gltf-binary;base64,' + btoa(str);
          const mb = bin.length / 1048576;
          info.textContent = `Wczytano: ${mb.toFixed(1)} MB.` + (mb > 3 ? ' Duży model – może nie zmieścić się w pamięci przeglądarki, zapisuj projekt do pliku.' : '');
        }, (err) => { src = null; info.textContent = 'Nie udało się wczytać modelu: ' + (err && err.message || err); });
      };
      r.readAsArrayBuffer(f);
    };
    const close = () => overlay.remove();
    const add = () => {
      if (!src) return alert('Najpierw wybierz plik .glb.');
      const m = App.addModel({ name: name.value.trim() || 'Model', src, plan: plan.toDataURL('image/png'), l: +dims[0].value || 100, w: +dims[1].value || 100, h: +dims[2].value || 100 });
      close();
      if (onAdd) onAdd(m);
    };
    const row = (label, input, unit) => h('div', { className: 'row' }, h('label', {}, label), input, unit ? h('span', { className: 'unit' }, unit) : h('span'));
    const overlay = h('div', { className: 'modal', onclick: (e) => { if (e.target === overlay) close(); } },
      h('div', { className: 'dialog form' },
        h('h3', {}, 'Import modelu 3D'),
        file, info, preview,
        row('Nazwa', name),
        row('Szerokość', dims[0], 'cm'), row('Głębokość', dims[1], 'cm'), row('Wysokość', dims[2], 'cm'),
        h('p', { className: 'muted small' }, 'Front modelu to jego strona +Z (tak zapisuje większość programów). Wymiary możesz poprawić także po postawieniu.'),
        h('div', { className: 'actions' }, h('button', { onclick: close }, 'Anuluj'), h('button', { className: 'primary', onclick: add }, 'Dodaj'))));
    document.body.append(overlay);
  }
  // Widok z góry: trójkąty rzutowane na płaszczyznę XZ, od najniższych do najwyższych, cieniowane wg nachylenia.
  function topView(scene, box) {
    const size = box.getSize(new THREE.Vector3()), S = 256, k = S / Math.max(size.x, size.z, 1e-6);
    const c = document.createElement('canvas');
    c.width = Math.max(8, Math.round(size.x * k)); c.height = Math.max(8, Math.round(size.z * k));
    const x = c.getContext('2d'), tris = [];
    scene.updateMatrixWorld(true);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
    scene.traverse(m => {
      if (!m.isMesh) return;
      const pos = m.geometry.attributes.position, idx = m.geometry.index, cnt = idx ? idx.count : pos.count;
      const mt = Array.isArray(m.material) ? m.material[0] : m.material, col = mt && mt.color ? mt.color.clone() : new THREE.Color('#bbbbbb');
      const step = Math.max(3, Math.floor(cnt / 3 / 60000) * 3);
      for (let j = 0; j + 2 < cnt; j += step) {
        const v = [0, 1, 2].map(q => (idx ? idx.getX(j + q) : j + q));
        a.fromBufferAttribute(pos, v[0]).applyMatrix4(m.matrixWorld);
        b.fromBufferAttribute(pos, v[1]).applyMatrix4(m.matrixWorld);
        d.fromBufferAttribute(pos, v[2]).applyMatrix4(m.matrixWorld);
        n.subVectors(b, a).cross(e.subVectors(d, a)).normalize();
        const lit = 0.55 + 0.45 * Math.abs(n.y);
        tris.push({ y: Math.max(a.y, b.y, d.y), p: [a, b, d].map(q => [(q.x - box.min.x) * k, (q.z - box.min.z) * k]), c: '#' + col.clone().multiplyScalar(lit).getHexString() });
      }
    });
    tris.sort((p, q) => p.y - q.y).forEach(t => {
      x.beginPath();
      x.moveTo(t.p[0][0], t.p[0][1]); x.lineTo(t.p[1][0], t.p[1][1]); x.lineTo(t.p[2][0], t.p[2][1]);
      x.closePath();
      x.fillStyle = x.strokeStyle = t.c;
      x.fill();
      x.lineWidth = 0.5;
      x.stroke();
    });
    return c;
  }

  function setWallLength(lv, w, len) {
    const f = App.wallFrame(w), nx = w.x1 + f.ux * len, ny = w.y1 + f.uy * len;
    App.pointRefs(lv, w.x2, w.y2).forEach(r => { r.o[r.kx] = Math.round(nx * 10) / 10; r.o[r.ky] = Math.round(ny * 10) / 10; });
  }

  function toolForm() {
    const d = App.defaults, t = E.tool;
    if (t === 'wall') return form('Nowa ściana', [
      { key: 'dt', label: 'Grubość', unit: 'cm', min: 5, max: 100, get: () => d.wall.thickness, set: defSet(d.wall, 'thickness') },
      { key: 'dh', label: 'Wysokość', unit: 'cm', min: 0, max: 1000, allowEmpty: true, placeholder: 'auto', get: () => d.wall.height || '', set: defSet(d.wall, 'height') },
    ]);
    if (t === 'room' || t === 'poly') return form('Nowy pokój', [
      { key: 'dn', label: 'Nazwa', type: 'text', get: () => d.room.name, set: defSet(d.room, 'name') },
      { key: 'dw', label: 'Twórz ściany', type: 'checkbox', get: () => d.room.makeWalls, set: defSet(d.room, 'makeWalls') },
      { key: 'dt', label: 'Grubość ścian', unit: 'cm', min: 5, max: 100, get: () => d.room.thickness, set: defSet(d.room, 'thickness') },
    ]);
    if (t === 'door') return form('Nowe drzwi', [
      { key: 'dw', label: 'Szerokość', unit: 'cm', min: 30, max: 400, get: () => d.door.width, set: defSet(d.door, 'width') },
      { key: 'dh', label: 'Wysokość', unit: 'cm', min: 100, max: 400, get: () => d.door.height, set: defSet(d.door, 'height') },
    ]);
    if (t === 'window') return form('Nowe okno', [
      { key: 'dw', label: 'Szerokość', unit: 'cm', min: 20, max: 600, get: () => d.window.width, set: defSet(d.window, 'width') },
      { key: 'dh', label: 'Wysokość', unit: 'cm', min: 20, max: 400, get: () => d.window.height, set: defSet(d.window, 'height') },
      { key: 'ds', label: 'Parapet', unit: 'cm', min: 0, max: 300, get: () => d.window.sill, set: defSet(d.window, 'sill') },
      { key: 'dg', label: 'W szczycie dachu (nad ścianą)', type: 'checkbox', get: () => !!d.window.gable, set: defSet(d.window, 'gable') },
    ]);
    if (t === 'stairs') return form('Nowe schody', [
      { key: 'dsh', label: 'Rodzaj', type: 'select', options: App.STAIR_SHAPES, get: () => d.stairs.shape || 'straight', set: defSet(d.stairs, 'shape') },
      { key: 'dw', label: 'Szerokość biegu', unit: 'cm', min: 50, max: 400, get: () => d.stairs.width, set: defSet(d.stairs, 'width') },
      { key: 'dl', label: 'Długość całkowita', unit: 'cm', min: 50, max: 1000, get: () => d.stairs.length, set: defSet(d.stairs, 'length') },
      { key: 'ds', label: 'Liczba stopni', min: 2, max: 40, get: () => d.stairs.steps, set: defSet(d.stairs, 'steps') },
    ]);
    if (t === 'dormer') return form('Nowa lukarna', [
      { key: 'dro', label: 'Dach lukarny', type: 'select', options: App.DORMER_ROOFS, get: () => d.dormer.roof, set: (v) => { d.dormer.roof = v; if (v === 'gable' && d.dormer.pitch < 25) d.dormer.pitch = 35; App.saveDefaults(); renderProps(); E.render(); } },
      { key: 'dw', label: 'Szerokość', unit: 'cm', min: 80, max: 1500, get: () => d.dormer.width, set: defSet(d.dormer, 'width') },
      { key: 'dh', label: 'Wys. ścianki czołowej', unit: 'cm', min: 40, max: 400, get: () => d.dormer.height, set: defSet(d.dormer, 'height') },
      { key: 'dp', label: 'Spadek dachu lukarny', unit: '°', min: 0, max: 60, get: () => d.dormer.pitch, set: defSet(d.dormer, 'pitch') },
      { key: 'dfl', label: 'Czoło w licu ściany (podnosi ścianę)', type: 'checkbox', get: () => !!d.dormer.flush, set: defSet(d.dormer, 'flush') },
      { key: 'dn', label: 'Liczba okien', min: 0, max: 6, get: () => d.dormer.windows, set: defSet(d.dormer, 'windows') },
    ]);
    if (t === 'roofwin') return form('Nowe okno dachowe', [
      { key: 'dw', label: 'Szerokość', unit: 'cm', min: 30, max: 400, get: () => d.roofwin.width, set: defSet(d.roofwin, 'width') },
      { key: 'dl', label: 'Długość (wzdłuż spadku)', unit: 'cm', min: 30, max: 400, get: () => d.roofwin.length, set: defSet(d.roofwin, 'length') },
    ]);
    if (t === 'chimney') return form('Nowy komin', [
      { key: 'dw', label: 'Szerokość', unit: 'cm', min: 20, max: 300, get: () => d.chimney.width, set: defSet(d.chimney, 'width') },
      { key: 'dd', label: 'Głębokość', unit: 'cm', min: 20, max: 300, get: () => d.chimney.depth, set: defSet(d.chimney, 'depth') },
      { key: 'da', label: 'Ponad dach', unit: 'cm', min: 0, max: 500, get: () => d.chimney.above, set: defSet(d.chimney, 'above') },
    ]);
    if (t === 'furniture') return furnitureCatalog(false);
    if (t === 'garden') return furnitureCatalog(true);
    if (t === 'plot') return form('Nowa działka', [
      { key: 'dc', label: 'Kolor terenu', type: 'color', get: () => d.plot.color, set: defSet(d.plot, 'color') },
      { label: 'Wskazówka', type: 'info', get: () => 'Klikaj narożniki granicy działki' },
    ]);
    if (t === 'path') return form('Nowa nawierzchnia', [
      { key: 'dk', label: 'Rodzaj', type: 'select', options: App.PATH_KINDS.map(k => [k.id, k.name]), get: () => d.path.kind, set: defSet(d.path, 'kind') },
      { key: 'dm', label: 'Rysowanie', type: 'select', options: [['strip', 'pas o szerokości (oś)'], ['area', 'obszar (narożniki)']], get: () => d.path.mode, set: (v) => { defSet(d.path, 'mode')(v); renderProps(); } },
      d.path.mode === 'strip' ? { key: 'dw', label: 'Szerokość', unit: 'cm', min: 20, max: 1000, step: 5, get: () => d.path.width, set: defSet(d.path, 'width') } : null,
    ]);
    if (t === 'fence') return form('Nowe ogrodzenie', [
      { key: 'ds', label: 'Rodzaj', type: 'select', options: App.FENCE_STYLES.map(k => [k.id, k.name]), get: () => d.fence.style,
        set: (v) => { d.fence.style = v; d.fence.color = App.fenceStyle(v).color; App.saveDefaults(); renderProps(); } },
      { key: 'dh', label: 'Wysokość', unit: 'cm', min: 30, max: 400, get: () => d.fence.h, set: defSet(d.fence, 'h') },
      { key: 'db', label: 'Podmurówka', unit: 'cm', min: 0, max: 200, get: () => d.fence.base, set: defSet(d.fence, 'base') },
      { key: 'dsp', label: 'Rozstaw słupków', unit: 'cm', min: 50, max: 600, step: 5, get: () => d.fence.span, set: defSet(d.fence, 'span') },
      { key: 'dc', label: 'Kolor', type: 'color', get: () => d.fence.color, set: defSet(d.fence, 'color') },
    ]);
    if (t === 'install') return installCatalog();
    if (t === 'roof') return form('Nowy dach', [
      { key: 'dt', label: 'Rodzaj', type: 'select', options: App.ROOF_TYPES, get: () => d.roof.type, set: defSet(d.roof, 'type') },
      { key: 'dp', label: 'Kąt nachylenia', unit: '°', min: 3, max: 70, get: () => d.roof.pitch, set: defSet(d.roof, 'pitch') },
      { key: 'do', label: 'Okap', unit: 'cm', min: 0, max: 200, get: () => d.roof.overhang, set: defSet(d.roof, 'overhang') },
      { key: 'dr', label: 'Ścianka kolankowa', unit: 'cm', min: 0, max: 300, get: () => d.roof.raise, set: defSet(d.roof, 'raise') },
      { key: 'dc', label: 'Kolor pokrycia', type: 'color', get: () => d.roof.color, set: defSet(d.roof, 'color') },
    ]);
    return null;
  }

  function summary() {
    const p = App.project;
    const wrap = h('div', { className: 'form' }, h('h3', {}, 'Podsumowanie'));
    if (E.clipboard) wrap.append(h('div', { className: 'actions' }, h('button', { title: 'Wklej skopiowany element (Ctrl+V)', onclick: () => E.paste() }, 'Wklej (Ctrl+V)')));
    let total = 0;
    p.levels.forEach(lv => {
      const a = lv.rooms.reduce((s, r) => s + App.roomNetArea(lv, r), 0);
      total += a;
      wrap.append(h('div', { className: 'row' }, h('label', {}, lv.name), h('span', { className: 'info' }, a.toFixed(2).replace('.', ',') + ' m²')));
    });
    wrap.append(h('div', { className: 'row total' }, h('label', {}, 'Razem (netto)'), h('span', { className: 'info' }, total.toFixed(2).replace('.', ',') + ' m²')));
    const lv = App.level();
    wrap.append(h('p', { className: 'muted' },
      `${lv.name}: ścian ${lv.walls.length}, pokoi ${lv.rooms.length}, drzwi ${lv.openings.filter(o => o.kind === 'door').length}, okien ${lv.openings.filter(o => o.kind === 'window').length}.`));
    const ground = p.levels[p.ground || 0];
    ground.plots.forEach(o => wrap.append(h('div', { className: 'row' }, h('label', {}, o.name || 'Działka'), h('span', { className: 'info' }, App.fmtArea(o.pts)))));
    wrap.append(h('p', { className: 'muted' }, 'Zaznacz element na rzucie, aby edytować jego wymiary.'));
    return wrap;
  }

  function renderProps() {
    const box = $('#props');
    const focused = document.activeElement && box.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    box.innerHTML = '';
    const sel = App.find(App.selection);
    box.append((sel && selectionForm(sel)) || toolForm() || summary());
    if (focused) {
      const el = box.querySelector(`[data-key="${CSS.escape(focused)}"]`);
      if (el) el.focus();
    }
  }

  function renderSettings() {
    const s = App.project.settings, set = (k) => editSet(v => { s[k] = v; });
    const box = $('#settings');
    box.innerHTML = '';
    box.append(form(null, [
      { key: 'grid', label: 'Siatka', unit: 'cm', min: 1, max: 100, get: () => s.grid, set: set('grid') },
      { key: 'dims', label: 'Pokaż wymiary ścian', type: 'checkbox', get: () => s.dims, set: set('dims') },
      { key: 'wallColor', label: 'Kolor ścian', type: 'color', get: () => s.wallColor, set: set('wallColor') },
    ]));
    // Biblioteka tekstur projektu.
    const lib = App.project.textures || [];
    box.append(h('div', { className: 'tex-lib' },
      h('h3', {}, 'Tekstury'),
      lib.length ? h('div', { className: 'tex-grid' }, lib.map(t => h('div', { className: 'tex-item', title: `${t.name} – wzór ${t.size} cm` },
        h('img', { src: t.src, alt: '' }),
        h('span', {}, t.name),
        h('button', { className: 'icon danger', title: 'Usuń teksturę', onclick: () => { if (confirm(`Usunąć teksturę „${t.name}”? Zniknie też z elementów, które jej używają.`)) App.removeTexture(t.id); } }, '×'))))
        : h('p', { className: 'muted small' }, 'Dodaj zdjęcie (np. cegły, deski, płytki) – potem wybierzesz je we właściwościach ściany, podłogi, sufitu, drzwi, okna, dachu…'),
      h('button', { className: 'wide', onclick: textureDialog }, 'Dodaj teksturę ze zdjęcia…')));
  }

  // ---------- Import tekstury ----------
  // Zdjęcie przerabiane na grafikę pasującą do projektu: zmniejszone, wygładzone, stonowane lub uproszczone
  // („rysunkowe”), opcjonalnie bezszwowe (krawędzie wzoru przechodzą w siebie przy powielaniu).
  // Średni kolor obrazu (boki mebla ze zdjęcia).
  function avgColor(c) {
    const t = document.createElement('canvas');
    t.width = t.height = 1;
    const x = t.getContext('2d');
    x.drawImage(c, 0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function processImage(img, o) {
    const k = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(16, Math.round(img.naturalWidth * k)), hgt = Math.max(16, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = hgt;
    const x = c.getContext('2d');
    x.filter = { photo: 'none', soft: 'saturate(0.6) contrast(0.9) brightness(1.06) blur(0.6px)', flat: 'saturate(0.8) contrast(1.05) blur(1.4px)' }[o.style] || 'none';
    // Z zapasem poza płótnem – rozmycie nie przyciemnia brzegów (inaczej kreski na łączeniach wzoru).
    const m = 4;
    x.drawImage(img, -m, -m, w + 2 * m, hgt + 2 * m);
    x.filter = 'none';
    const id = x.getImageData(0, 0, w, hgt), d = id.data;
    const tint = [245, 241, 234];
    for (let p = 0; p < d.length; p += 4) {
      for (let ch = 0; ch < 3; ch++) {
        let v = d[p + ch];
        if (o.style === 'flat') v = Math.round(v / 255 * 8) / 8 * 255;
        if (o.style !== 'photo') v = v * 0.85 + tint[ch] * 0.15;
        d[p + ch] = v;
      }
    }
    if (o.seamless) {
      const src = new Uint8ClampedArray(d);
      for (let yy = 0; yy < hgt; yy++) {
        for (let xx = 0; xx < w; xx++) {
          const a = Math.min(1 - Math.abs(2 * xx / (w - 1) - 1), 1 - Math.abs(2 * yy / (hgt - 1) - 1));
          const wo = Math.min(1, a * 2.5), q = ((yy + (hgt >> 1)) % hgt * w + (xx + (w >> 1)) % w) * 4, p = (yy * w + xx) * 4;
          for (let ch = 0; ch < 3; ch++) d[p + ch] = src[p + ch] * wo + src[q + ch] * (1 - wo);
        }
      }
    }
    x.putImageData(id, 0, 0);
    return c;
  }
  function textureDialog(opt = {}) {
    const file = h('input', { type: 'file', accept: 'image/*' });
    const name = h('input', { type: 'text', placeholder: 'np. cegła' });
    const style = h('select', {}, [['soft', 'stonowany (pasuje do projektu)'], ['flat', 'rysunkowy (uproszczony)'], ['photo', 'oryginalny']].map(([v, t]) => h('option', { value: v }, t)));
    const seamless = h('input', { type: 'checkbox', checked: !opt.photo });
    const size = h('input', { type: 'number', min: 5, max: 2000, step: 5, value: 100 });
    const preview = h('canvas', { width: 256, height: 256, className: 'tex-preview' });
    let img = null, out = null;
    const update = () => {
      const px = preview.getContext('2d');
      px.clearRect(0, 0, 256, 256);
      if (!img) return;
      out = processImage(img, { style: style.value, seamless: seamless.checked });
      // Podgląd powielania: 2 × 2 wzory.
      const s = opt.photo ? 256 * Math.min(1, out.width / out.height) : 128, sh = s * out.height / out.width;
      for (let yy = 0; yy < 256; yy += sh) for (let xx = 0; xx < 256; xx += s) px.drawImage(out, xx, yy, s, sh);
    };
    file.onchange = () => {
      const f = file.files[0];
      if (!f) return;
      if (!name.value) name.value = f.name.replace(/\.[^.]+$/, '');
      const r = new FileReader();
      r.onload = () => { const im = new Image(); im.onload = () => { img = im; update(); }; im.src = r.result; };
      r.readAsDataURL(f);
    };
    style.onchange = update;
    seamless.onchange = update;
    const close = () => overlay.remove();
    const add = () => {
      if (!out) return alert('Najpierw wybierz zdjęcie.');
      App.addTexture({ name: name.value.trim() || 'Tekstura', src: out.toDataURL('image/jpeg', 0.85), size: Math.max(5, +size.value || 100), aspect: out.height / out.width, avg: avgColor(out) });
      close();
      if (opt.onAdd) opt.onAdd(App.project.textures[App.project.textures.length - 1]);
    };
    const row = (label, input, unit) => h('div', { className: 'row' }, h('label', {}, label), input, unit ? h('span', { className: 'unit' }, unit) : h('span'));
    const overlay = h('div', { className: 'modal', onclick: (e) => { if (e.target === overlay) close(); } },
      h('div', { className: 'dialog form' },
        h('h3', {}, opt.photo ? 'Zdjęcie frontu mebla' : 'Nowa tekstura'),
        h('p', { className: 'muted' }, opt.photo ? 'Wybierz zdjęcie przodu mebla lub sprzętu zrobione na wprost, przycięte do jego krawędzi. Zostanie przerobione na grafikę pasującą do projektu.' : 'Wybierz zdjęcie powierzchni (cegła, drewno, płytki, tynk…). Zostanie zmniejszone i przerobione na grafikę pasującą do projektu.'),
        file,
        preview,
        row('Nazwa', name),
        row('Styl', style),
        opt.photo ? null : h('div', { className: 'row check' }, h('label', {}, 'Bezszwowa (do powielania)'), seamless),
        opt.photo ? null : row('Szerokość wzoru', size, 'cm'),
        opt.photo ? null : h('p', { className: 'muted small' }, 'Szerokość wzoru to rzeczywisty rozmiar jednego powtórzenia, np. 25 cm dla cegły z fugą albo 120 cm dla deski.'),
        h('div', { className: 'actions' }, h('button', { onclick: close }, 'Anuluj'), h('button', { className: 'primary', onclick: add }, 'Dodaj'))));
    document.body.append(overlay);
  }

  // ---------- Usuwanie ----------
  function deleteSelection() {
    if (!App.selection) return;
    const id = App.selection;
    App.edit(() => App.removeById(id));
    App.select(null);
  }

  // ---------- Pasek stanu ----------
  function updateStatus() {
    const s = E.snap;
    $('#st-coords').textContent = s ? `x ${(s.x / 100).toFixed(2)}  y ${(s.y / 100).toFixed(2)} m` : '';
    $('#st-hint').textContent = E.typed ? `Długość: ${E.typed} cm — Enter, aby zatwierdzić` : E.hint();
    $('#st-zoom').textContent = Math.round(E.scale * 100 / 0.6) + '%';
    $('#btn-undo').disabled = !App.canUndo();
    $('#btn-redo').disabled = !App.canRedo();
  }

  // ---------- Widoki ----------
  UI.setView = (mode) => {
    const views = $('#views');
    views.dataset.mode = mode;
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
    App.view3d.setVisible(mode !== '2d');
    try { localStorage.setItem('planer.view', mode); } catch (e) { /* ignoruj */ }
  };

  // ---------- Pliki ----------
  function download(url, name) {
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
  }
  const fileName = (ext) => (App.project.name || 'projekt').replace(/[^\p{L}\p{N}_-]+/gu, '_') + ext;
  function saveFile() {
    const blob = new Blob([JSON.stringify(App.project, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    download(url, fileName('.json'));
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function openFile(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const p = JSON.parse(r.result);
        if (!p || !Array.isArray(p.levels)) throw new Error('format');
        App.setProject(p);
      } catch (e) {
        alert('Nie udało się wczytać pliku – to nie jest projekt Planera.');
      }
    };
    r.readAsText(file);
  }

  // ---------- Klawiatura ----------
  function onKey(e) {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      if (e.key === 'Enter') e.target.blur();
      return;
    }
    const ctrl = e.ctrlKey || e.metaKey, k = e.key;
    if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? App.redo() : App.undo(); return; }
    if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault(); App.redo(); return; }
    if (ctrl && (k === 's' || k === 'S')) { e.preventDefault(); saveFile(); return; }
    if (ctrl && (k === 'c' || k === 'C')) { if (E.copy()) e.preventDefault(); return; }
    if (ctrl && (k === 'v' || k === 'V')) { if (E.paste()) e.preventDefault(); return; }
    if (ctrl && (k === 'd' || k === 'D')) { e.preventDefault(); if (E.copy()) E.paste(); return; }
    if (ctrl) return;
    if (k === ' ') { e.preventDefault(); E.space = true; return; }
    if (E.typing() && E.typeKey(k)) { e.preventDefault(); return; }
    if (k === 'Escape') {
      if (!E.cancel()) { if (App.selection) App.select(null); else E.setTool('select'); }
      return;
    }
    if (k === 'Enter') { E.finish(); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
    if (k === 't' || k === 'T') { E.rotate(); return; }
    if (k === 'm' || k === 'M') { E.mirror(); return; }
    if (k === 'f' || k === 'F') { E.fit(); return; }
    if (k === '+' || k === '=') { E.zoom(1.2); return; }
    if (k === '-') { E.zoom(1 / 1.2); return; }
    const tool = TOOLS.find(t => t.key.toLowerCase() === k.toLowerCase());
    if (tool) E.setTool(tool.id);
  }

  UI.init = () => {
    buildTools();
    $('#btn-new').onclick = () => {
      if (confirm('Rozpocząć nowy, pusty projekt? Bieżący zostanie zastąpiony (zapisz go wcześniej do pliku).')) App.setProject(App.newProject());
    };
    $('#btn-sample').onclick = () => {
      if (confirm('Wczytać przykładowy dom? Bieżący projekt zostanie zastąpiony.')) App.setProject(App.sampleProject());
    };
    $('#btn-open').onclick = () => $('#file-input').click();
    $('#file-input').onchange = (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ''; };
    $('#btn-save').onclick = saveFile;
    $('#btn-png').onclick = () => {
      const mode = $('#views').dataset.mode;
      if (mode === '3d') { const u = App.view3d.screenshot(); if (u) download(u, fileName('_3d.png')); }
      else download(E.exportPNG(), fileName('_rzut.png'));
    };
    $('#btn-undo').onclick = App.undo;
    $('#btn-redo').onclick = App.redo;
    $('#btn-fit').onclick = E.fit;
    $('#btn-3d-frame').onclick = App.view3d.frame;
    const pickBtn = $('#btn-3d-pick');
    const setPick = (on) => {
      App.view3d.setPick(on);
      pickBtn.classList.toggle('active', on);
      $('#hint3d').textContent = on ? 'Kliknij element, aby go zaznaczyć · przeciąganie – obrót · prawy – przesuw · kółko – zoom'
        : 'Lewy przycisk – obrót · prawy – przesuw · kółko – zoom';
      try { localStorage.setItem('planer.pick3d', on ? '1' : ''); } catch (e) { /* bez zapisu */ }
    };
    pickBtn.onclick = () => setPick(!App.view3d.pick);
    try { setPick(localStorage.getItem('planer.pick3d') === '1'); } catch (e) { setPick(false); }
    $('#chk-attic').onchange = (e) => toggleAttic(e.target.checked);
    $('#inp-lift').onchange = (e) => {
      const v = Math.max(0, +e.target.value || 0);
      App.edit(() => { App.project.lift = v; });
      e.target.blur();
    };
    $('#inp-lv-walls').onchange = (e) => {
      const v = +e.target.value;
      if (!(v >= 0)) return renderLevels();
      App.edit(() => App.setLevelWallHeight(App.level(), v, $('#chk-keep-ridge').checked));
      e.target.blur();
    };
    // Tryb pokazu 3D to ustawienie widoku – zapisywane z projektem, ale bez wpisu w historii cofania.
    const set3d = (k, v) => { App.project.settings[k] = v; App.save(); App.emit('change'); };
    $('#sel-3d-show').onchange = (e) => {
      set3d('show3d', e.target.value);
      if (e.target.value === 'only') set3d('roofs3d', false);
      App.view3d.frame();
    };
    $('#chk-3d-roof').onchange = (e) => set3d('roofs3d', e.target.checked);
    $('#sel-3d-inst').onchange = (e) => { delete App.project.settings.xray3d; set3d('inst3d', e.target.value); };
    $('#chk-3d-instonly').onchange = (e) => set3d('instOnly3d', e.target.checked);
    $('#chk-2d-instonly').onchange = (e) => E.setInstOnly(e.target.checked);
    $('#chk-2d-instdims').onchange = (e) => E.setInstDims(e.target.checked);
    $('#chk-2d-tech').onchange = (e) => E.setTech(e.target.checked);
    $('#sel-2d-inst').onchange = (e) => E.setInstLayer(e.target.value);
    const sync2d = () => { $('#chk-2d-tech').checked = E.tech; $('#sel-2d-inst').value = E.instLayer; $('#chk-2d-instonly').checked = E.instOnly;
      $('#chk-2d-instdims').checked = E.instDims;
      // Wymiary instalacji mają sens tylko przy widocznych instalacjach.
      $('#chk-2d-instdims').closest('label').style.display = E.instOn() ? '' : 'none'; };
    App.on('view2d', sync2d);
    sync2d();
    const sync3d = () => {
      const s = App.project.settings;
      $('#sel-3d-show').value = s.show3d || 'all';
      $('#chk-3d-roof').checked = s.roofs3d !== false;
      $('#sel-3d-inst').value = App.inst3dLayer(s);
      $('#chk-3d-instonly').checked = !!s.instOnly3d;
    };
    App.on('change', sync3d);
    App.on('load', sync3d);
    sync3d();
    $('#btn-3d-top').onclick = App.view3d.top;
    $('#btn-lv-add').onclick = addLevel;
    $('#btn-lv-del').onclick = removeLevel;
    $('#btn-lv-basement').onclick = addBasement;
    $('#btn-lv-copy').onclick = copyWallsFromBelow;
    document.querySelectorAll('[data-view]').forEach(b => { b.onclick = () => UI.setView(b.dataset.view); });
    const name = $('#proj-name');
    name.onchange = () => App.edit(() => { App.project.name = name.value.trim() || 'Projekt'; });

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', (e) => { if (e.key === ' ') E.space = false; });

    App.on('change', () => {
      renderLevels(); renderProps(); renderSettings(); updateStatus();
      name.value = App.project.name;
      document.title = `${App.project.name} – Planer domu`;
    });
    App.on('select', renderProps);
    App.on('clipboard', renderProps);
    App.on('cursor', updateStatus);
    App.on('load', () => setTimeout(() => { E.fit(); App.view3d.frame(); }, 0));
  };
})(window.App);
