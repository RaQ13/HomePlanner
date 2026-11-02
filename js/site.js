'use strict';
// Zagospodarowanie działki: działka (granica i teren), nawierzchnie (chodnik, podjazd, taras…) i ogrodzenia.
// Elementy leżą na terenie (rzędna 0) i są zapisywane na kondygnacji na poziomie terenu (parter):
//   działka     – { id, kind: 'plot', name, pts, color, tex },
//   nawierzchnia – { id, kind: 'path', type, pts, h (wysokość nad terenem), color, tex },
//   ogrodzenie  – { id, kind: 'fence', pts (łamana), closed, style, h, base (podmurówka), span (rozstaw słupków),
//                   color, baseColor, tex (wypełnienie), texBase (podmurówka) }.
window.App = window.App || {};
(function (App) {
  const G = App.geom;

  // Rodzaje nawierzchni: domyślna wysokość nad terenem i kolor.
  App.PATH_KINDS = [
    { id: 'chodnik', name: 'Chodnik', h: 3, color: '#bdb6aa' },
    { id: 'podjazd', name: 'Podjazd', h: 4, color: '#9c968c' },
    { id: 'taras', name: 'Taras', h: 15, color: '#c4a982' },
    { id: 'plac', name: 'Plac / opaska', h: 3, color: '#b3aca0' },
    { id: 'zwir', name: 'Żwir', h: 2, color: '#d2c9b6' },
    { id: 'rabata', name: 'Rabata (kora)', h: 4, color: '#6e4b33' },
    { id: 'trawnik', name: 'Trawnik', h: 1, color: '#86b25c' },
  ];
  App.pathKind = (id) => App.PATH_KINDS.find(k => k.id === id) || App.PATH_KINDS[0];

  // Rodzaje ogrodzeń: domyślny kolor wypełnienia i wymiary słupka.
  App.FENCE_STYLES = [
    { id: 'panel', name: 'Panelowe', color: '#3a3d42', post: 6 },
    { id: 'pickets', name: 'Sztachety', color: '#9b7650', post: 9 },
    { id: 'boards', name: 'Deski poziome', color: '#8a6845', post: 9 },
    { id: 'solid', name: 'Pełne / murowane', color: '#d8d2c6', post: 30 },
    { id: 'mesh', name: 'Siatka', color: '#5b7a4c', post: 5 },
  ];
  App.fenceStyle = (id) => App.FENCE_STYLES.find(k => k.id === id) || App.FENCE_STYLES[0];

  App.makePlot = (pts, n) => ({ id: App.uid(), kind: 'plot', name: n > 1 ? `Działka ${n}` : 'Działka', pts, color: App.defaults.plot.color });
  App.makePath = (pts, type) => {
    const k = App.pathKind(type);
    return { id: App.uid(), kind: 'path', type: k.id, pts, h: k.h, color: k.color };
  };
  App.makeFence = (pts, closed) => {
    const d = App.defaults.fence;
    return { id: App.uid(), kind: 'fence', pts, closed: !!closed, style: d.style, h: d.h, base: d.base, span: d.span, color: d.color, baseColor: '#a8a29e' };
  };

  // Odcinki ogrodzenia (z zamknięciem, gdy obiega teren dookoła).
  App.fenceSegments = (o) => {
    const out = [];
    for (let k = 1; k < o.pts.length; k++) out.push([o.pts[k - 1], o.pts[k]]);
    if (o.closed && o.pts.length > 2) out.push([o.pts[o.pts.length - 1], o.pts[0]]);
    return out.filter(([a, b]) => G.dist(a, b) > 1);
  };
  App.fenceLength = (o) => App.fenceSegments(o).reduce((s, [a, b]) => s + G.dist(a, b), 0);

  // Pas o szerokości width wzdłuż łamanej (chodnik rysowany osią) – obrys z narożnikami ściętymi na styk (miter).
  App.stripPolygon = (pts, width) => {
    const hw = width / 2, n = pts.length;
    if (n < 2) return [];
    const dir = (a, b) => { const L = G.dist(a, b) || 1; return { x: (b.x - a.x) / L, y: (b.y - a.y) / L }; };
    const offset = (side) => pts.map((p, k) => {
      const d0 = k > 0 ? dir(pts[k - 1], p) : dir(p, pts[k + 1]);
      const d1 = k < n - 1 ? dir(p, pts[k + 1]) : d0;
      // Normalna w lewo od kierunku; w narożniku – dwusieczna wydłużona tak, by pas miał stałą szerokość.
      const n0 = { x: -d0.y, y: d0.x }, n1 = { x: -d1.y, y: d1.x };
      let mx = n0.x + n1.x, my = n0.y + n1.y;
      const ml = Math.hypot(mx, my) || 1;
      mx /= ml; my /= ml;
      const k2 = Math.min(4, 1 / Math.max(0.25, mx * n1.x + my * n1.y));
      return { x: Math.round((p.x + side * mx * hw * k2) * 10) / 10, y: Math.round((p.y + side * my * hw * k2) * 10) / 10 };
    });
    return [...offset(1), ...offset(-1).reverse()];
  };

  // Powierzchnia w m² i arach do opisów.
  App.fmtArea = (pts) => {
    const m2 = Math.abs(G.area(pts)) / 10000;
    return `${m2.toFixed(m2 < 100 ? 2 : 0).replace('.', ',')} m²` + (m2 >= 100 ? ` (${(m2 / 100).toFixed(2).replace('.', ',')} a)` : '');
  };
})(window.App);
