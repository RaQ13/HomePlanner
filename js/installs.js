'use strict';
// Instalacje w ścianach: elektryczna i wodno-kanalizacyjna. Lista lv.installs:
//   punkt na ścianie – { kind: 'install', type, wallId, pos (cm od początku ściany), side (±1 – lico), z (nad podłogą) },
//   punkt swobodny  – { kind: 'install', type, x, y, z } (punkt świetlny na suficie, pion kanalizacyjny),
//   trasa           – { kind: 'install', type, pts: [{ x, y }], z } – przewód / rura poziomo na wysokości z (zwykle w osi ściany).
window.App = window.App || {};
(function (App) {
  const G = App.geom;
  App.INSTALL_SYS = {
    el: { name: 'Elektryczna', color: '#ea580c', group: 'el' },
    zw: { name: 'Woda zimna', color: '#2563eb', group: 'wk' },
    cw: { name: 'Woda ciepła', color: '#dc2626', group: 'wk' },
    kan: { name: 'Kanalizacja', color: '#57534e', group: 'wk' },
  };
  // shape: 'wall' – punkt na licu ściany, 'free' – punkt w dowolnym miejscu, 'run' – trasa.
  const T = App.INSTALLS = {
    socket: { sys: 'el', shape: 'wall', name: 'Gniazdko', z: 30 },
    socket2: { sys: 'el', shape: 'wall', name: 'Gniazdko podwójne', z: 30 },
    power: { sys: 'el', shape: 'wall', name: 'Gniazdo siłowe 400 V', z: 30 },
    switch: { sys: 'el', shape: 'wall', name: 'Łącznik', z: 110 },
    switch2: { sys: 'el', shape: 'wall', name: 'Łącznik podwójny', z: 110 },
    lightw: { sys: 'el', shape: 'wall', name: 'Kinkiet', z: 200 },
    junction: { sys: 'el', shape: 'wall', name: 'Puszka rozgałęźna', z: -30 },
    board: { sys: 'el', shape: 'wall', name: 'Rozdzielnica', z: 140 },
    light: { sys: 'el', shape: 'free', name: 'Punkt świetlny (sufit)', z: -1 },
    cable: { sys: 'el', shape: 'run', name: 'Przewód', z: -30, r: 0.8 },
    cold: { sys: 'zw', shape: 'wall', name: 'Podejście wody zimnej', z: 50 },
    hot: { sys: 'cw', shape: 'wall', name: 'Podejście wody ciepłej', z: 50 },
    drain: { sys: 'kan', shape: 'wall', name: 'Odpływ (podejście kan.)', z: 45 },
    riser: { sys: 'kan', shape: 'free', name: 'Pion kanalizacyjny', z: 0, r: 5.5 },
    pcold: { sys: 'zw', shape: 'run', name: 'Rura wody zimnej', z: 30, r: 1.6 },
    phot: { sys: 'cw', shape: 'run', name: 'Rura wody ciepłej', z: 36, r: 1.6 },
    pdrain: { sys: 'kan', shape: 'run', name: 'Rura kanalizacyjna', z: 15, r: 2.5 },
  };
  App.installDef = (type) => T[type] || T.socket;
  App.installColor = (o) => App.INSTALL_SYS[App.installDef(o.type).sys].color;
  App.installGroup = (o) => App.INSTALL_SYS[App.installDef(o.type).sys].group;
  // Domyślna wysokość: ujemna liczy się od sufitu (np. –30 = 30 cm pod sufitem).
  // Warstwa instalacji w 3D: 'none' (tylko osprzęt na licu), 'all', 'el', 'wk'; xray3d – starsze projekty.
  App.inst3dLayer = (s) => s.inst3d || (s.xray3d ? 'all' : 'none');
  App.installDefaultZ = (type, lv) => { const z = App.installDef(type).z; return z < 0 ? App.levelHeight(lv) + z : z; };

  App.makeInstall = (type, lv, at) => {
    const d = App.installDef(type), o = { id: App.uid(), kind: 'install', type, z: App.installDefaultZ(type, lv) };
    if (d.shape === 'wall') Object.assign(o, { wallId: at.wall.id, pos: at.pos, side: at.side });
    else if (d.shape === 'free') Object.assign(o, { x: at.x, y: at.y });
    else o.pts = at.pts;
    return o;
  };

  // Punkt na ścianie: oś ściany (a), lico (f), kierunek do pomieszczenia (n), kierunek wzdłuż ściany (u).
  App.installAt = (lv, o) => {
    if (!o.wallId) return o.pts ? null : { a: { x: o.x, y: o.y }, f: { x: o.x, y: o.y }, n: { x: 0, y: -1 }, u: { x: 1, y: 0 } };
    const w = lv.walls.find(x => x.id === o.wallId);
    if (!w) return null;
    const fr = App.wallFrame(w), s = o.side || 1, t = Math.max(0, Math.min(fr.L, o.pos));
    const a = { x: w.x1 + fr.ux * t, y: w.y1 + fr.uy * t };
    return { w, a, f: { x: a.x + fr.nx * s * w.t / 2, y: a.y + fr.ny * s * w.t / 2 }, n: { x: fr.nx * s, y: fr.ny * s }, u: { x: fr.ux, y: fr.uy } };
  };
  // Wskazanie ściany dla punktu: najbliższa ściana, położenie wzdłuż niej i lico po stronie kursora.
  App.installWallTarget = (lv, p, tol) => {
    let best = null;
    lv.walls.forEach(w => {
      const pr = G.project(p, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
      if (pr.t < 0 || pr.t > 1 || pr.d > w.t / 2 + tol || (best && best.d <= pr.d)) return;
      const fr = App.wallFrame(w), side = (p.x - pr.x) * fr.nx + (p.y - pr.y) * fr.ny >= 0 ? 1 : -1;
      best = { d: pr.d, wall: w, pos: Math.round(pr.t * fr.L), side };
    });
    return best;
  };
  App.runLength = (o) => o.pts.reduce((s, q, k) => (k ? s + G.dist(q, o.pts[k - 1]) : 0), 0);

  // ---------- Rzut 2D: symbole (rozmiar stały na ekranie, u – cm na piksel) ----------
  App.drawInstall = (ctx, lv, o, u, sel) => {
    const d = App.installDef(o.type), col = sel ? '#2563eb' : App.installColor(o);
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = col;
    ctx.lineCap = 'round';
    if (d.shape === 'run') {
      ctx.lineWidth = u * (d.sys === 'kan' ? 3.2 : d.sys === 'el' ? 1.6 : 2.2) * (sel ? 1.6 : 1);
      if (d.sys === 'el') ctx.setLineDash([u * 7, u * 3]);
      ctx.beginPath();
      o.pts.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
      ctx.restore();
      return;
    }
    const at = App.installAt(lv, o);
    if (!at) { ctx.restore(); return; }
    // Układ symbolu: oś x wzdłuż ściany, oś y do wnętrza pomieszczenia, początek na licu.
    ctx.translate(at.f.x, at.f.y);
    ctx.transform(at.u.x, at.u.y, at.n.x, at.n.y, 0, 0);
    ctx.scale(u, u);
    ctx.lineWidth = sel ? 2 : 1.4;
    const circle = (x, y, r, fill) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); fill ? ctx.fill() : ctx.stroke(); };
    const ln = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    const letter = (t) => { ctx.fillStyle = '#fff'; ctx.font = 'bold 8px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, 0, 7.5); };
    switch (o.type) {
      case 'socket': case 'socket2': case 'power':
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI); ctx.stroke();
        ln(0, 6, 0, 11);
        if (o.type !== 'socket') ln(-4, 9, 4, 9);
        if (o.type === 'power') { ln(-4, 12, 4, 12); }
        break;
      case 'switch': case 'switch2':
        circle(0, 5, 3, true);
        ln(2, 3, 8, -3);
        if (o.type === 'switch2') ln(-2, 3, -8, -3);
        break;
      case 'lightw':
        circle(0, 6, 5);
        ln(-3.5, 2.5, 3.5, 9.5); ln(3.5, 2.5, -3.5, 9.5);
        break;
      case 'junction':
        circle(0, 4, 3);
        circle(0, 4, 1.4, true);
        break;
      case 'board':
        ctx.fillRect(-9, 0, 18, 7);
        break;
      case 'light':
        circle(0, 0, 7);
        ln(-5, -5, 5, 5); ln(5, -5, -5, 5);
        break;
      case 'riser':
        ctx.scale(1 / u, 1 / u);
        ctx.lineWidth = u * 1.6;
        circle(0, 0, d.r * 2);
        ctx.fillStyle = 'rgba(87,83,78,0.25)';
        circle(0, 0, d.r * 2, true);
        break;
      default:
        // Podejścia wod-kan: kółko z literą Z / C / K.
        circle(0, 7.5, 5.5, true);
        letter(o.type === 'cold' ? 'Z' : o.type === 'hot' ? 'C' : 'K');
    }
    ctx.restore();
  };
  // Punkt zaczepienia symbolu na rzucie (do zaznaczania).
  App.installHitPoint = (lv, o, u) => {
    const at = App.installAt(lv, o);
    if (!at) return null;
    if (!o.wallId) return at.a;
    return { x: at.f.x + at.n.x * 6 * u, y: at.f.y + at.n.y * 6 * u };
  };
})(window.App);
