'use strict';
// Meble i wyposażenie: katalog brył (prostopadłościany i walce) wspólny dla rzutu 2D i widoku 3D.
// Obiekt: { kind: 'furniture', type, x, y, l (szerokość), w (głębokość), h, z (nad podłogą), rot, flip, color,
//   tex – tekstura korpusu, front – zdjęcie frontu (type 'photo'), model – id modelu 3D (type 'model') }.
// Układ lokalny: a – wzdłuż szerokości, b – w głąb (front mebla po stronie +w/2), z – w górę od spodu.
window.App = window.App || {};
(function (App) {
  // Materiały stałe; 'main' to kolor mebla, 'main2' – jego ciemniejszy odcień.
  const MATS = {
    white: '#f4f4f2', metal: '#a9aeb5', dark: '#2b2b2e', top: '#5b5048', glass: '#bcd4e6', glassDark: '#1f2933',
    linen: '#f2efe8', pillow: '#ffffff', duvet: '#9fb4c7', screen: '#111827', steel: '#c4c8cc', leaf: '#4d7c3a', pot: '#a0522d',
    carGlass: '#1d2731', tire: '#1b1b1d', light: '#e8edf2', tail: '#a3171b',
    bark: '#6b4f35', leafDark: '#3c6a2e', conifer: '#2d5634', wood: '#a47a4f', woodDark: '#75532f', water: '#4f9fcc',
    sand: '#e4d4a6', soil: '#5a4030', stone: '#a8a29e', canvas: '#efe6d2', flower: '#d64f7e', flower2: '#f2c84b',
    binY: '#e3c13a', binB: '#3b6fb6',
  };
  App.FURNITURE_MATS = MATS;

  // Części: box – { b: [a0, a1, b0, b1, z0, z1], m }, walec pionowy – { c: [a, b, r, z0, z1], m, s: skala w osi b },
  // walec skierowany frontem (pokrętła, drzwi pralki) – { d: [a, z, r, b0, b1], m }.
  const B = (a0, a1, b0, b1, z0, z1, m = 'main') => ({ b: [a0, a1, b0, b1, z0, z1], m });
  // Walec może zwężać się ku górze (t – promień górny: stożek, korona iglaka) i mieć mało boków (seg: 4 – ostrosłup).
  const C = (a, b, r, z0, z1, m = 'main', s = 1, t = null, seg = 0) => Object.assign({ c: [a, b, r, z0, z1], m, s }, t != null ? { t } : {}, seg ? { seg } : {});
  // Kula / elipsoida – środek (a, b, z), promień r, spłaszczenie w pionie sz i w głąb sb (korony drzew, krzewy).
  const S = (a, b, z, r, m = 'main', sz = 1, sb = 1) => ({ e: [a, b, z, r], m, sz, sb });
  const D = (a, z, r, b0, b1, m = 'main') => ({ d: [a, z, r, b0, b1], m });
  // Profil boczny – wielokąt [[a, z], …] wyciągnięty w głąb od b0 do b1; bv – promień zaokrąglenia krawędzi w 3D,
  // r – promień narożników na rzucie z góry.
  const P = (pts, b0, b1, m = 'main', o = {}) => Object.assign({ p: pts, w: [b0, b1], m }, o);
  const legs = (hl, hw, z1, s = 5, inset = 3, m = 'main2') => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) =>
    B(i * (hl - inset) - s / 2, i * (hl - inset) + s / 2, j * (hw - inset) - s / 2, j * (hw - inset) + s / 2, 0, z1, m));
  // Podział szerokości na n równych pól (drzwi, szuflady, poduchy).
  const split = (a0, a1, n) => Array.from({ length: n }, (_, k) => [a0 + (a1 - a0) * k / n, a0 + (a1 - a0) * (k + 1) / n]);

  function bed(L, W, H) {
    const hl = L / 2, hw = W / 2, n = L >= 120 ? 2 : 1;
    return [
      ...legs(hl, hw, 10, 6, 4),
      B(-hl, hl, -hw + 6, hw, 10, 32),
      B(-hl, hl, -hw, -hw + 6, 0, H),
      B(-hl + 3, hl - 3, -hw + 8, hw - 3, 32, 52, 'linen'),
      ...split(-hl + 8, hl - 8, n).map(([a0, a1]) => B(a0 + 3, a1 - 3, -hw + 12, -hw + 50, 52, 62, 'pillow')),
      B(-hl + 1, hl - 1, -hw + 60, hw - 1, 52, 58, 'duvet'),
    ];
  }
  function sofa(L, W, H) {
    const hl = L / 2, hw = W / 2, arm = Math.min(20, L / 6), n = Math.max(1, Math.round((L - 2 * arm) / 65));
    return [
      ...legs(hl, hw, 8, 5, 6, 'dark'),
      B(-hl, hl, -hw, hw, 8, 40),
      B(-hl, hl, -hw, -hw + 20, 40, H),
      B(-hl, -hl + arm, -hw, hw, 40, 62),
      B(hl - arm, hl, -hw, hw, 40, 62),
      ...split(-hl + arm, hl - arm, n).flatMap(([a0, a1]) => [
        B(a0 + 1, a1 - 1, -hw + 20, hw - 2, 40, 50, 'main2'),
        B(a0 + 2, a1 - 2, -hw + 20, -hw + 32, 50, H - 6, 'main2'),
      ]),
    ];
  }
  function cabinet(L, W, H, o = {}) {
    // Korpus z drzwiami lub szufladami na froncie; o.doors – liczba drzwi, o.drawers – liczba szuflad w pionie.
    const hl = L / 2, hw = W / 2, z0 = o.plinth || 0, out = [];
    if (z0) out.push(B(-hl + 1, hl - 1, -hw, hw - 6, 0, z0, 'dark'));
    out.push(B(-hl, hl, -hw, hw - 2, z0, H));
    if (o.drawers) {
      split(z0 + 1, H - 1, o.drawers).forEach(([q0, q1]) => {
        out.push(B(-hl + 0.5, hl - 0.5, hw - 2, hw, q0 + 0.4, q1 - 0.4));
        out.push(B(-Math.min(8, hl / 3), Math.min(8, hl / 3), hw, hw + 2.5, q1 - 7, q1 - 5, 'metal'));
      });
    } else {
      const n = o.doors || Math.max(1, Math.round(L / 50));
      split(-hl, hl, n).forEach(([a0, a1], k) => {
        out.push(B(a0 + 0.4, a1 - 0.4, hw - 2, hw, z0 + 1, H - 1));
        const ha = n > 1 && k % 2 === 0 ? a1 - 4 : a0 + 4, hz = o.handleLow ? z0 + 6 : o.handleTop ? H - 12 : (z0 + H) / 2;
        out.push(B(ha - 1, ha + 1, hw, hw + 2.5, hz - 8, hz + 8, 'metal'));
      });
    }
    return out;
  }
  function counter(L, W, H, parts) {
    const hl = L / 2, hw = W / 2;
    return [...parts, B(-hl, hl, -hw, hw + 2, H - 4, H, 'top')];
  }
  const faucet = (b, z) => [C(0, b, 1.5, z, z + 28, 'metal'), B(-1.2, 1.2, b, b + 17, z + 25, z + 28, 'metal')];

  // Brama / furtka: słupki na końcach, skrzydła z ramą i pionowymi prętami.
  function gate(L, W, H, wings) {
    const p = 12, out = [B(-L / 2, -L / 2 + p, -p / 2, p / 2, 0, H + 10, 'main2'), B(L / 2 - p, L / 2, -p / 2, p / 2, 0, H + 10, 'main2')];
    split(-L / 2 + p + 1, L / 2 - p - 1, wings).forEach(([a0, a1]) => {
      out.push(B(a0, a1, -2, 2, 6, 10), B(a0, a1, -2, 2, H - 4, H), B(a0, a0 + 4, -2, 2, 6, H), B(a1 - 4, a1, -2, 2, 6, H));
      for (let a = a0 + 12; a < a1 - 8; a += 12) out.push(B(a - 1, a + 1, -1, 1, 10, H - 4));
    });
    return out;
  }

  // ---------- Samochody ----------
  // Wymiary z danych technicznych producenta (cm): L0 – długość, W0 – szerokość bez lusterek, H0 – wysokość,
  // wb – rozstaw osi, fo – zwis przedni, R – promień koła (opona), tw – szerokość opony, track – rozstaw kół.
  // Profil nadwozia opisany odległościami od przodu (F) i od tyłu (T); przy zmianie wymiarów skaluje się proporcjonalnie.
  function car(S) {
    return (L, W, H) => {
      const sa = L / S.L0, sb = W / S.W0, sz = H / S.H0;
      const F = (x) => (S.L0 / 2 - x) * sa, T = (x) => (-S.L0 / 2 + x) * sa, Z = (z) => z * sz;
      const hw = W / 2, R = S.R * sz, fa = F(S.fo), ra = F(S.fo + S.wb), arch = R + 3 * sz, bot = Z(S.floor);
      // Wnęka koła w profilu: łuk nad osią.
      const wheelArch = (ax) => {
        const out = [[ax - arch, bot], [ax - arch, R]];
        for (let k = 1; k < 8; k++) { const t = Math.PI - k * Math.PI / 8; out.push([ax + arch * Math.cos(t), R + arch * Math.sin(t)]); }
        return out.concat([[ax + arch, R], [ax + arch, bot]]);
      };
      const body = [
        [T(10), bot], ...wheelArch(ra), ...wheelArch(fa), [F(12), bot], [F(3), Z(30)], [F(0), Z(50)], [F(2), Z(S.hood - 6)], [F(9), Z(S.hood)],
        [F(S.cowlX * 0.45), Z((S.hood + S.cowlZ) / 2 + 3)], [F(S.cowlX), Z(S.cowlZ)],
        [T(S.rwX), Z(S.deck)], [T(22), Z(S.deck)], [T(6), Z(S.deck - 4)], [T(1), Z(S.deck - 14)], [T(0), Z(52)], [T(3), Z(30)],
      ];
      const belt = Math.min(S.cowlZ, S.deck) - 1;
      const cabin = [[T(S.rwX), Z(belt)], [F(S.cowlX), Z(belt)], [F(S.roofF - 8), Z(S.H0 - 4)], [F(S.roofF + 14), Z(S.H0)], [T(S.roofT + 10), Z(S.H0)], [T(S.roofT - 14), Z(S.H0 - 5)]];
      const cw = hw * S.cabin, e = 3 * sz;
      const roof = [[F(S.roofF), Z(S.H0 - 6)], [F(S.roofF + 14), Z(S.H0)], [T(S.roofT + 10), Z(S.H0)], [T(S.roofT - 2), Z(S.H0 - 6)]];
      const tb = Math.min(S.track / 2 * sb, hw - S.tw / 2), tw = S.tw * sb, rim = (b0, b1) => b1 > 0 ? [b1 - 0.6, b1 + 0.4] : [b0 - 0.4, b0 + 0.6];
      const wheels = [fa, ra].flatMap(ax => [-1, 1].flatMap(j => {
        const b0 = j * tb - tw / 2, b1 = j * tb + tw / 2;
        return [D(ax, R, R, b0, b1, 'tire'), D(ax, R, R * 0.62, ...rim(b0, b1), 'metal')];
      }));
      const bp = (pillarA) => B(pillarA - 4 * sa, pillarA + 4 * sa, -cw - 0.6, cw + 0.6, Z(belt), Z(S.H0 - 5), 'main');
      return [
        ...wheels,
        P(body, -hw, hw, 'main', { paint: true, bv: 6 * sb, r: 22 * sa }),
        P(cabin, -cw, cw, 'carGlass', { bv: 5 * sb, r: 18 * sa }),
        P(roof, -cw - 0.5, cw + 0.5, 'main', { paint: true, bv: 4 * sb, r: 18 * sa }),
        Object.assign(bp((F(S.cowlX) + T(S.rwX)) / 2 + S.bpil * sa), { paint: true }),
        // Lusterka – wystają poza szerokość nadwozia (szerokość z lusterkami jest większa).
        ...[-1, 1].map(j => Object.assign(B(F(S.cowlX + 20), F(S.cowlX + 8), j > 0 ? cw : -hw - S.mirror * sb, j > 0 ? hw + S.mirror * sb : -cw, Z(belt + 2), Z(belt + 14)), { paint: true })),
        // Światła przednie, grill, światła tylne, tablice rejestracyjne.
        ...[-1, 1].map(j => B(F(10), F(0.5), j > 0 ? hw - 38 * sb : -hw + 8 * sb, j > 0 ? hw - 8 * sb : -hw + 38 * sb, Z(S.hood - 16), Z(S.hood - 5), 'light')),
        B(F(4), F(-0.4), -S.grill * sb, S.grill * sb, Z(28), Z(S.hood - 8), 'dark'),
        ...[-1, 1].map(j => B(T(-0.4), T(10), j > 0 ? hw - 42 * sb : -hw + 6 * sb, j > 0 ? hw - 6 * sb : -hw + 42 * sb, Z(S.deck - 22), Z(S.deck - 8), 'tail')),
        B(F(1), F(-0.8), -26 * sb, 26 * sb, Z(30), Z(41), 'white'),
        B(T(-0.8), T(2), -26 * sb, 26 * sb, Z(S.deck - 40), Z(S.deck - 29), 'white'),
      ];
    };
  }
  // Audi A4 B8 sedan (2008): 470,3 × 182,6 × 142,7 cm, rozstaw osi 280,8 cm, opony 225/55 R16.
  const A4B8 = { L0: 470.3, W0: 182.6, H0: 142.7, wb: 280.8, fo: 89.4, R: 32.7, tw: 22.5, track: 156.4, floor: 17,
    hood: 74, cowlX: 128, cowlZ: 96, roofF: 210, roofT: 160, rwX: 98, deck: 101, cabin: 0.84, bpil: 18, mirror: 10, grill: 32 };
  // Škoda Fabia I sedan (2006): 423,2 × 164,6 × 145,1 cm, rozstaw osi 246,2 cm, opony 165/70 R14.
  const FABIA1 = { L0: 423.2, W0: 164.6, H0: 145.1, wb: 246.2, fo: 73.5, R: 29.3, tw: 16.5, track: 143.5, floor: 16,
    hood: 76, cowlX: 104, cowlZ: 97, roofF: 172, roofT: 150, rwX: 94, deck: 102, cabin: 0.86, bpil: 10, mirror: 9, grill: 24 };

  const CATALOG = [
    // ---------- Pokój i sypialnia ----------
    { id: 'bed2', cat: 'Pokój', name: 'Łóżko podwójne', l: 160, w: 210, h: 95, color: '#c9b49a', parts: bed },
    { id: 'bed1', cat: 'Pokój', name: 'Łóżko pojedyncze', l: 90, w: 210, h: 90, color: '#c9b49a', parts: bed },
    { id: 'wardrobe', cat: 'Pokój', name: 'Szafa', l: 200, w: 60, h: 220, color: '#e8e2d6', parts: (L, W, H) => cabinet(L, W, H, { plinth: 6 }) },
    { id: 'dresser', cat: 'Pokój', name: 'Komoda', l: 120, w: 45, h: 85, color: '#d9cfc0', parts: (L, W, H) => cabinet(L, W, H, { plinth: 8, drawers: 3 }) },
    { id: 'nightstand', cat: 'Pokój', name: 'Szafka nocna', l: 45, w: 40, h: 50, color: '#d9cfc0', parts: (L, W, H) => cabinet(L, W, H, { plinth: 6, drawers: 2 }) },
    { id: 'sofa', cat: 'Pokój', name: 'Sofa', l: 220, w: 95, h: 85, color: '#7d8fa3', parts: sofa },
    { id: 'armchair', cat: 'Pokój', name: 'Fotel', l: 85, w: 85, h: 85, color: '#7d8fa3', parts: sofa, free: true },
    { id: 'table', cat: 'Pokój', name: 'Stół', l: 160, w: 90, h: 75, color: '#b08a5e', free: true, parts: (L, W, H) => [B(-L / 2, L / 2, -W / 2, W / 2, H - 4, H), ...legs(L / 2, W / 2, H - 4, 6, 6)] },
    { id: 'roundtable', cat: 'Pokój', name: 'Stół okrągły', l: 100, w: 100, h: 75, color: '#b08a5e', free: true,
      parts: (L, W, H) => [C(0, 0, L / 2, H - 4, H, 'main', W / L), C(0, 0, 5, 3, H - 4, 'main2'), C(0, 0, L * 0.22, 0, 3, 'main2', W / L)] },
    { id: 'chair', cat: 'Pokój', name: 'Krzesło', l: 45, w: 50, h: 90, color: '#b08a5e', free: true,
      parts: (L, W, H) => [...legs(L / 2, W / 2, 43, 3, 2), B(-L / 2, L / 2, -W / 2 + 2, W / 2, 43, 47), B(-L / 2 + 2, L / 2 - 2, -W / 2, -W / 2 + 3, 47, H)] },
    { id: 'desk', cat: 'Pokój', name: 'Biurko', l: 140, w: 70, h: 75, color: '#d9cfc0',
      parts: (L, W, H) => {
        const hl = L / 2, hw = W / 2, dw = Math.min(45, L / 3);
        return [B(-hl, hl, -hw, hw, H - 3, H), B(-hl, -hl + 3, -hw + 2, hw - 2, 0, H - 3), B(hl - dw, hl, -hw + 2, hw - 4, 0, H - 3, 'main2'),
          ...split(1, H - 4, 3).flatMap(([q0, q1]) => [B(hl - dw + 0.5, hl - 0.5, hw - 4, hw - 2, q0 + 0.4, q1 - 0.4), B(hl - dw / 2 - 6, hl - dw / 2 + 6, hw - 2, hw, q1 - 6, q1 - 4, 'metal')])];
      } },
    { id: 'bookcase', cat: 'Pokój', name: 'Regał', l: 100, w: 35, h: 200, color: '#d9cfc0',
      parts: (L, W, H) => {
        const hl = L / 2, hw = W / 2, n = Math.max(2, Math.round(H / 38)), books = ['#8c3b3b', '#3b5b8c', '#c9a227', '#4d7c3a', '#6b4f8c', '#d4d0c8'];
        const out = [B(-hl, -hl + 2, -hw, hw, 0, H), B(hl - 2, hl, -hw, hw, 0, H), B(-hl + 2, hl - 2, -hw, -hw + 1, 0, H)];
        for (let k = 0; k <= n; k++) {
          const z = Math.min(H - 2, k * (H - 2) / n);
          out.push(B(-hl + 2, hl - 2, -hw + 1, hw, z, z + 2));
          // Książki na co drugiej półce.
          if (k < n && k % 2 === 1) {
            const sh = (H - 2) / n - 6;
            for (let a = -hl + 4, j = 0; a < hl - 8; a += 4 + (j % 3), j++) out.push(B(a, a + 3 + (j % 3), -hw + 3, hw - 4, z + 2, z + 2 + sh * (0.7 + 0.25 * ((j * 7) % 4) / 3), books[(j * 5 + k) % books.length]));
          }
        }
        return out;
      } },
    { id: 'tvstand', cat: 'Pokój', name: 'Szafka RTV', l: 180, w: 40, h: 45, color: '#3f3a36', parts: (L, W, H) => [...legs(L / 2, W / 2, 8, 4, 5, 'dark'), ...cabinet(L, W, H - 8, { doors: 3 }).map(p => (p.b[4] += 8, p.b[5] += 8, p))] },
    { id: 'tv', cat: 'Pokój', name: 'Telewizor', l: 120, w: 8, h: 70, z: 100, color: '#2b2b2e', parts: (L, W, H) => [B(-L / 2, L / 2, -W / 2, W / 2 - 1, 0, H), B(-L / 2 + 1, L / 2 - 1, W / 2 - 1, W / 2, 1, H - 1, 'screen')] },
    { id: 'carpet', cat: 'Pokój', name: 'Dywan', l: 200, w: 140, h: 1, color: '#c8b7a0', free: true, parts: (L, W, H) => [B(-L / 2, L / 2, -W / 2, W / 2, 0, H)] },
    { id: 'plant', cat: 'Pokój', name: 'Roślina', l: 45, w: 45, h: 120, color: '#a0522d', free: true,
      parts: (L, W, H) => [C(0, 0, L * 0.3, 0, H * 0.3), C(0, 0, L / 2, H * 0.3, H * 0.75, 'leaf', W / L), C(0, 0, L * 0.32, H * 0.75, H, 'leaf', W / L)] },
    { id: 'radiator', cat: 'Pokój', name: 'Grzejnik', l: 80, w: 10, h: 60, z: 15, color: '#f4f4f2',
      parts: (L, W, H) => split(-L / 2, L / 2, Math.max(2, Math.round(L / 5))).map(([a0, a1]) => B(a0 + 0.6, a1 - 0.6, -W / 2, W / 2, 0, H)) },

    // ---------- Kuchnia ----------
    { id: 'kbase', cat: 'Kuchnia', name: 'Szafka dolna', l: 60, w: 60, h: 90, color: '#f1ede4', parts: (L, W, H) => counter(L, W, H, cabinet(L, W, H - 4, { plinth: 10, handleTop: true })) },
    { id: 'kdrawers', cat: 'Kuchnia', name: 'Szafka z szufladami', l: 60, w: 60, h: 90, color: '#f1ede4', parts: (L, W, H) => counter(L, W, H, cabinet(L, W, H - 4, { plinth: 10, drawers: 3 })) },
    { id: 'kwall', cat: 'Kuchnia', name: 'Szafka górna', l: 60, w: 35, h: 70, z: 145, color: '#f1ede4', parts: (L, W, H) => cabinet(L, W, H, { handleLow: true }) },
    { id: 'sink', cat: 'Kuchnia', name: 'Zlewozmywak', l: 80, w: 60, h: 90, color: '#f1ede4',
      parts: (L, W, H) => [...counter(L, W, H, cabinet(L, W, H - 4, { plinth: 10, handleTop: true })),
        B(-L / 2 + 8, L / 2 - 8, -W / 2 + 8, W / 2 - 8, H, H + 0.3, 'steel'), B(-L / 2 + 11, L / 2 - 11, -W / 2 + 11, W / 2 - 11, H + 0.3, H + 0.5, 'metal'), ...faucet(-W / 2 + 4, H)] },
    { id: 'fridge', cat: 'Kuchnia', name: 'Lodówka', l: 60, w: 65, h: 185, color: '#f4f4f2',
      parts: (L, W, H) => {
        const hl = L / 2, hw = W / 2, zs = H * 0.38;
        return [B(-hl, hl, -hw, hw - 3, 0, H), B(-hl + 0.3, hl - 0.3, hw - 3, hw, 1, zs - 0.5), B(-hl + 0.3, hl - 0.3, hw - 3, hw, zs + 0.5, H - 1),
          B(hl - 7, hl - 5, hw, hw + 3, zs - 30, zs - 5, 'metal'), B(hl - 7, hl - 5, hw, hw + 3, zs + 5, zs + 40, 'metal')];
      } },
    { id: 'stove', cat: 'Kuchnia', name: 'Kuchenka', l: 60, w: 60, h: 90, color: '#e5e7eb',
      parts: (L, W, H) => {
        const hl = L / 2, hw = W / 2;
        return [B(-hl, hl, -hw, hw - 1, 0, H - 3), B(-hl, hl, -hw, hw, H - 3, H, 'dark'),
          ...[[-1, -1, 8], [1, -1, 6], [-1, 1, 6], [1, 1, 8]].map(([i, j, r]) => C(i * L / 4.5, j * W / 4.5, r, H, H + 0.6, 'metal')),
          B(-hl + 6, hl - 6, hw - 1, hw + 0.5, 12, H - 26, 'glassDark'), B(-hl + 6, hl - 6, hw + 0.5, hw + 3, H - 22, H - 20, 'metal'),
          ...[-0.6, -0.2, 0.2, 0.6].map(k => D(k * hl, H - 11, 2, hw - 1, hw + 2, 'dark'))];
      } },
    { id: 'dishwasher', cat: 'Kuchnia', name: 'Zmywarka', l: 60, w: 60, h: 85, color: '#f4f4f2',
      parts: (L, W, H) => [B(-L / 2, L / 2, -W / 2, W / 2 - 1, 0, H), B(-L / 2 + 0.3, L / 2 - 0.3, W / 2 - 1, W / 2, H - 10, H - 1, 'dark'),
        B(-L / 2 + 0.3, L / 2 - 0.3, W / 2 - 1, W / 2, 10, H - 10.5), B(-L / 2 + 10, L / 2 - 10, W / 2, W / 2 + 2.5, H - 18, H - 16, 'metal')] },
    { id: 'hood', cat: 'Kuchnia', name: 'Okap', l: 60, w: 50, h: 70, z: 150, color: '#c4c8cc',
      parts: (L, W, H) => [B(-L / 2, L / 2, -W / 2, W / 2, 0, 8), B(-L / 6, L / 6, -W / 2, -W / 2 + 25, 8, H)] },

    // ---------- Łazienka i pralnia ----------
    { id: 'bathtub', cat: 'Łazienka', name: 'Wanna', l: 170, w: 75, h: 55, color: '#f4f4f2',
      parts: (L, W, H) => {
        const hl = L / 2, hw = W / 2, t = 7;
        return [B(-hl, hl, -hw, hw, 0, 8), B(-hl, hl, -hw, -hw + t, 0, H), B(-hl, hl, hw - t, hw, 0, H), B(-hl, -hl + t, -hw + t, hw - t, 0, H), B(hl - t, hl, -hw + t, hw - t, 0, H),
          C(-hl + 3.5, 0, 1.5, H, H + 18, 'metal'), B(-hl + 2.5, -hl + 14, -1.2, 1.2, H + 15, H + 18, 'metal')];
      } },
    { id: 'shower', cat: 'Łazienka', name: 'Prysznic', l: 90, w: 90, h: 200, color: '#f4f4f2',
      parts: (L, W, H) => {
        const hl = L / 2, hw = W / 2;
        return [B(-hl, hl, -hw, hw, 0, 6), C(0, 0, 4, 6, 6.4, 'metal'), B(-hl, hl, hw - 1, hw, 6, H, 'glass'), B(hl - 1, hl, -hw, hw - 1, 6, H, 'glass'),
          C(-hl + 12, -hw + 3, 1.3, 6, H - 8, 'metal'), B(-hl + 11, -hl + 13, -hw + 3, -hw + 16, H - 10, H - 8, 'metal'), C(-hl + 12, -hw + 17, 10, H - 12, H - 10, 'metal')];
      } },
    { id: 'wc', cat: 'Łazienka', name: 'WC', l: 38, w: 65, h: 80, color: '#f4f4f2',
      parts: (L, W, H) => [B(-L / 2 + 1, L / 2 - 1, -W / 2, -W / 2 + 18, 40, H), C(0, -W / 2 + 22, L * 0.3, 0, 30, 'main', 1.3), C(0, W / 2 - 34, L / 2 - 1, 30, 42, 'main', 1.4), C(0, W / 2 - 34, L / 2 - 1, 42, 44, 'white', 1.4)] },
    { id: 'washbasin', cat: 'Łazienka', name: 'Umywalka z szafką', l: 60, w: 46, h: 85, color: '#e8e2d6',
      parts: (L, W, H) => [...cabinet(L - 2, W - 4, H - 12, { doors: 2, handleTop: true }).map(p => (p.b[2] -= 2, p.b[3] -= 2, p.b[4] += 25, p.b[5] = Math.min(p.b[5] + 25, H - 12), p)).filter(p => p.b[5] > p.b[4]),
        B(-L / 2, L / 2, -W / 2, W / 2, H - 12, H, 'white'), C(0, 3, L * 0.32, H, H + 0.3, 'steel', 0.6), ...faucet(-W / 2 + 4, H)] },
    { id: 'washer', cat: 'Łazienka', name: 'Pralka', l: 60, w: 60, h: 85, color: '#f4f4f2',
      parts: (L, W, H) => [B(-L / 2, L / 2, -W / 2, W / 2, 0, H), B(-L / 2 + 0.3, L / 2 - 0.3, W / 2, W / 2 + 0.5, H - 12, H - 1, 'steel'),
        D(0, H * 0.43, L * 0.33, W / 2, W / 2 + 2, 'metal'), D(0, H * 0.43, L * 0.25, W / 2 + 2, W / 2 + 2.6, 'glassDark'), D(L / 2 - 10, H - 6.5, 3, W / 2 + 0.5, W / 2 + 2, 'dark')] },
    { id: 'dryer', cat: 'Łazienka', name: 'Suszarka', l: 60, w: 60, h: 85, color: '#f4f4f2',
      parts: (L, W, H) => [B(-L / 2, L / 2, -W / 2, W / 2, 0, H), B(-L / 2 + 0.3, L / 2 - 0.3, W / 2, W / 2 + 0.5, H - 12, H - 1, 'steel'),
        D(0, H * 0.43, L * 0.33, W / 2, W / 2 + 2, 'white'), D(L / 2 - 10, H - 6.5, 3, W / 2 + 0.5, W / 2 + 2, 'dark')] },

    // ---------- Garaż ----------
    // Auta stoją wzdłuż szerokości (l = długość auta, w = szerokość), przodem w stronę +l.
    { id: 'audiA4B8', cat: 'Garaż', name: 'Audi A4 B8 sedan (2008)', l: 470.3, w: 182.6, h: 142.7, color: '#8e959c', free: true, parts: car(A4B8) },
    { id: 'fabia1sedan', cat: 'Garaż', name: 'Škoda Fabia sedan (2006)', l: 423.2, w: 164.6, h: 145.1, color: '#2d4a73', free: true, parts: car(FABIA1) },

    // ---------- Rośliny (stoją na terenie) ----------
    { id: 'treeLeaf', cat: 'Rośliny', site: true, free: true, name: 'Drzewo liściaste', l: 500, w: 500, h: 700, color: '#4d7c3a',
      parts: (L, W, H) => [C(0, 0, Math.max(8, L * 0.045), 0, H * 0.5, 'bark'), S(0, 0, H * 0.64, L / 2, 'main', H * 0.36 / (L / 2), W / L),
        S(L * 0.16, -W * 0.12, H * 0.55, L * 0.3, 'leafDark', H * 0.22 / (L * 0.3), W / L), S(-L * 0.14, W * 0.12, H * 0.72, L * 0.28, 'main', H * 0.2 / (L * 0.28), W / L)] },
    { id: 'treeConifer', cat: 'Rośliny', site: true, free: true, name: 'Świerk', l: 350, w: 350, h: 900, color: '#2d5634',
      parts: (L, W, H) => [C(0, 0, Math.max(6, L * 0.04), 0, H * 0.22, 'bark'), C(0, 0, L / 2, H * 0.1, H * 0.55, 'main', W / L, L * 0.12),
        C(0, 0, L * 0.38, H * 0.38, H * 0.8, 'main', W / L, L * 0.06), C(0, 0, L * 0.25, H * 0.65, H, 'main', W / L, 0)] },
    { id: 'treeFruit', cat: 'Rośliny', site: true, free: true, name: 'Drzewo owocowe', l: 350, w: 350, h: 400, color: '#5a8a3c',
      parts: (L, W, H) => [C(0, 0, Math.max(6, L * 0.04), 0, H * 0.4, 'bark'), S(0, 0, H * 0.66, L / 2, 'main', H * 0.34 / (L / 2), W / L),
        ...[[0.25, 0.1, 0.7], [-0.2, -0.2, 0.6], [0.05, 0.3, 0.8], [-0.3, 0.15, 0.75]].map(([a, b, z]) => S(a * L, b * W, z * H, Math.max(4, L * 0.025), 'tail'))] },
    { id: 'thuja', cat: 'Rośliny', site: true, free: true, name: 'Tuja', l: 80, w: 80, h: 250, color: '#355f2f',
      parts: (L, W, H) => [C(0, 0, 4, 0, 20, 'bark'), C(0, 0, L / 2, 15, H * 0.8, 'main', W / L, L * 0.3), C(0, 0, L * 0.3, H * 0.8, H, 'main', W / L, 0)] },
    { id: 'bush', cat: 'Rośliny', site: true, free: true, name: 'Krzew', l: 140, w: 140, h: 110, color: '#4f7f38',
      parts: (L, W, H) => [S(0, 0, H * 0.5, L / 2, 'main', H * 0.5 / (L / 2), W / L), S(L * 0.2, W * 0.15, H * 0.6, L * 0.3, 'leafDark', H * 0.4 / (L * 0.3), W / L)] },
    { id: 'hedge', cat: 'Rośliny', site: true, free: true, name: 'Żywopłot', l: 300, w: 60, h: 150, color: '#3c6a2e',
      parts: (L, W, H) => [B(-L / 2, L / 2, -W / 2, W / 2, 0, H * 0.94), B(-L / 2 + 3, L / 2 - 3, -W / 2 + 3, W / 2 - 3, H * 0.94, H)] },
    { id: 'flowerbed', cat: 'Rośliny', site: true, free: true, name: 'Rabata z kwiatami', l: 200, w: 80, h: 35, color: '#4d7c3a',
      parts: (L, W, H) => {
        const out = [B(-L / 2, L / 2, -W / 2, W / 2, 0, 8, 'soil')];
        for (let a = -L / 2 + 15, k = 0; a < L / 2 - 10; a += 22, k++) {
          [-0.25, 0.25].forEach((b, j) => {
            out.push(S(a + (j ? 11 : 0), b * W, 8 + (H - 8) * 0.45, 11, 'main', (H - 8) * 0.45 / 11));
            out.push(S(a + (j ? 11 : 0), b * W, H - 5, 5, (k + j) % 2 ? 'flower' : 'flower2'));
          });
        }
        return out;
      } },
    { id: 'planter', cat: 'Rośliny', site: true, free: true, name: 'Donica z rośliną', l: 50, w: 50, h: 110, color: '#8b5a3c',
      parts: (L, W, H) => [C(0, 0, L / 2, 0, H * 0.4, 'main', W / L, L * 0.5), C(0, 0, L / 2 - 3, H * 0.4 - 3, H * 0.4 - 1, 'soil', W / L), S(0, 0, H * 0.7, L * 0.45, 'leafDark', H * 0.3 / (L * 0.45), W / L)] },

    // ---------- Ogród ----------
    { id: 'gardenTable', cat: 'Ogród', site: true, free: true, name: 'Stół ogrodowy', l: 160, w: 90, h: 75, color: '#a47a4f',
      parts: (L, W, H) => [...split(-L / 2, L / 2, Math.max(4, Math.round(L / 12))).map(([a0, a1]) => B(a0 + 0.6, a1 - 0.6, -W / 2, W / 2, H - 4, H)), ...legs(L / 2, W / 2, H - 4, 7, 8, 'main2')] },
    { id: 'gardenChair', cat: 'Ogród', site: true, free: true, name: 'Krzesło ogrodowe', l: 55, w: 58, h: 90, color: '#a47a4f',
      parts: (L, W, H) => [...legs(L / 2, W / 2, 44, 4, 3, 'main2'), ...split(-W / 2 + 4, W / 2, 5).map(([b0, b1]) => B(-L / 2, L / 2, b0 + 0.6, b1 - 0.6, 42, 45)),
        B(-L / 2 + 2, -L / 2 + 6, -W / 2, -W / 2 + 4, 0, H, 'main2'), B(L / 2 - 6, L / 2 - 2, -W / 2, -W / 2 + 4, 0, H, 'main2'),
        ...split(55, H - 2, 3).map(([z0, z1]) => B(-L / 2 + 2, L / 2 - 2, -W / 2, -W / 2 + 3, z0 + 1, z1 - 1))] },
    { id: 'bench', cat: 'Ogród', site: true, free: true, name: 'Ławka', l: 160, w: 60, h: 80, color: '#a47a4f',
      parts: (L, W, H) => [B(-L / 2 + 8, -L / 2 + 14, -W / 2 + 4, W / 2 - 4, 0, 42, 'dark'), B(L / 2 - 14, L / 2 - 8, -W / 2 + 4, W / 2 - 4, 0, 42, 'dark'),
        ...split(-W / 2 + 10, W / 2, 4).map(([b0, b1]) => B(-L / 2, L / 2, b0 + 0.8, b1 - 0.8, 42, 45)),
        B(-L / 2 + 8, -L / 2 + 14, -W / 2 + 2, -W / 2 + 7, 42, H, 'dark'), B(L / 2 - 14, L / 2 - 8, -W / 2 + 2, -W / 2 + 7, 42, H, 'dark'),
        ...split(52, H, 3).map(([z0, z1]) => B(-L / 2, L / 2, -W / 2, -W / 2 + 3, z0 + 1, z1 - 1))] },
    { id: 'lounger', cat: 'Ogród', site: true, free: true, name: 'Leżak', l: 195, w: 68, h: 85, color: '#efe6d2',
      parts: (L, W, H) => [
        P([[-L / 2, 25], [L / 2 - 60, 25], [L / 2 - 60, 31], [-L / 2, 31]], -W / 2, W / 2, 'main', { bv: 1.5, r: 4 }),
        P([[L / 2 - 64, 25], [L / 2 - 58, 25], [L / 2, H - 4], [L / 2 - 7, H]], -W / 2, W / 2, 'main', { bv: 1.5, r: 4 }),
        ...[[-L / 2 + 6], [L / 2 - 66]].flatMap(([a]) => [B(a - 2, a + 2, -W / 2, -W / 2 + 4, 0, 25, 'metal'), B(a - 2, a + 2, W / 2 - 4, W / 2, 0, 25, 'metal')])] },
    { id: 'umbrella', cat: 'Ogród', site: true, free: true, name: 'Parasol ogrodowy', l: 300, w: 300, h: 250, color: '#efe6d2',
      parts: (L, W, H) => [C(0, 0, 25, 0, 6, 'dark'), C(0, 0, 2.5, 6, H, 'metal'), C(0, 0, L / 2, H - 55, H - 8, 'main', W / L, 5, 8)] },
    { id: 'grill', cat: 'Ogród', site: true, free: true, name: 'Grill węglowy', l: 60, w: 60, h: 100, color: '#262626',
      parts: (L, W, H) => [...[0, 1, 2].map(k => { const t = k * Math.PI * 2 / 3, a = Math.cos(t) * L * 0.3, b = Math.sin(t) * W * 0.3; return B(a - 1.5, a + 1.5, b - 1.5, b + 1.5, 0, H * 0.7, 'metal'); }),
        S(0, 0, H * 0.72, L / 2, 'main', 0.55, W / L), C(0, 0, 3, H * 0.95, H, 'metal')] },
    { id: 'gazebo', cat: 'Ogród', site: true, free: true, name: 'Altana', l: 300, w: 300, h: 300, color: '#8a6845',
      parts: (L, W, H) => {
        const hl = L / 2, hw = W / 2, eave = H * 0.68;
        return [B(-hl, hl, -hw, hw, 0, 12, 'woodDark'),
          ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => B(i * (hl - 10) - 6, i * (hl - 10) + 6, j * (hw - 10) - 6, j * (hw - 10) + 6, 12, eave)),
          B(-hl + 4, hl - 4, -hw + 4, hw - 4, eave - 12, eave),
          B(-hl + 10, hl - 10, -hw + 4, -hw + 9, 12, 95), B(-hl + 4, -hl + 9, -hw + 10, hw - 10, 12, 95), B(hl - 9, hl - 4, -hw + 10, hw - 10, 12, 95),
          C(0, 0, (hl + 25) * Math.SQRT2, eave, H, 'woodDark', W / L, 0, 4)];
      } },
    { id: 'shed', cat: 'Ogród', site: true, free: true, name: 'Domek narzędziowy', l: 250, w: 200, h: 230, color: '#8a6845',
      parts: (L, W, H) => {
        const hl = L / 2, hw = W / 2, wallH = H * 0.72;
        return [B(-hl + 8, hl - 8, -hw + 8, hw - 8, 0, wallH),
          P([[-hl, wallH - 4], [hl, wallH - 4], [0, H]], -hw, hw, 'woodDark', { bv: 1, r: 2 }),
          B(-45, 45, hw - 8, hw - 6, 0, wallH - 25, 'main2'), B(25, 30, hw - 6, hw - 4, 90, 100, 'metal')];
      } },
    { id: 'poolAbove', cat: 'Ogród', site: true, free: true, name: 'Basen stelażowy', l: 500, w: 300, h: 120, color: '#5b7da0',
      parts: (L, W, H) => [B(-L / 2, L / 2, -W / 2, -W / 2 + 4, 0, H), B(-L / 2, L / 2, W / 2 - 4, W / 2, 0, H), B(-L / 2, -L / 2 + 4, -W / 2, W / 2, 0, H), B(L / 2 - 4, L / 2, -W / 2, W / 2, 0, H),
        B(-L / 2 + 4, L / 2 - 4, -W / 2 + 4, W / 2 - 4, 0, H - 15, 'water')] },
    { id: 'pond', cat: 'Ogród', site: true, free: true, name: 'Oczko wodne', l: 250, w: 170, h: 8, color: '#a8a29e',
      parts: (L, W, H) => [C(0, 0, L / 2, 0, H, 'main', W / L), C(0, 0, L / 2 - 18, 0, H + 0.5, 'water', (W - 36) / (L - 36))] },
    { id: 'trampoline', cat: 'Ogród', site: true, free: true, name: 'Trampolina', l: 366, w: 366, h: 90, color: '#2b2b2e',
      parts: (L, W, H) => [...[0, 1, 2, 3, 4, 5].map(k => { const t = k * Math.PI / 3, a = Math.cos(t) * (L / 2 - 6), b = Math.sin(t) * (W / 2 - 6); return C(a, b, 2.5, 0, H - 6, 'metal'); }),
        C(0, 0, L / 2, H - 6, H - 3, 'metal', W / L), C(0, 0, L / 2 - 6, H - 5, H, '#1e40af', W / L), C(0, 0, L / 2 - 22, H - 4.5, H - 3.5, 'main', W / L)] },
    { id: 'swing', cat: 'Ogród', site: true, free: true, name: 'Huśtawka', l: 260, w: 160, h: 220, color: '#8a6845',
      parts: (L, W, H) => [
        ...[-1, 1].flatMap(i => [-1, 1].map(j => B(i * (L / 2 - 6) - 5, i * (L / 2 - 6) + 5, j * (W / 2 - 6) - 5, j * (W / 2 - 6) + 5, 0, H - 10))),
        B(-L / 2, L / 2, -6, 6, H - 12, H),
        ...[-L / 4, L / 4].flatMap(a => [B(a - 22, a + 22, -10, 10, 40, 44, 'dark'), B(a - 20, a - 19, -0.5, 0.5, 44, H - 12, 'metal'), B(a + 19, a + 20, -0.5, 0.5, 44, H - 12, 'metal')])] },
    { id: 'sandbox', cat: 'Ogród', site: true, free: true, name: 'Piaskownica', l: 150, w: 150, h: 25, color: '#a47a4f',
      parts: (L, W, H) => [B(-L / 2, L / 2, -W / 2, -W / 2 + 5, 0, H), B(-L / 2, L / 2, W / 2 - 5, W / 2, 0, H), B(-L / 2, -L / 2 + 5, -W / 2 + 5, W / 2 - 5, 0, H), B(L / 2 - 5, L / 2, -W / 2 + 5, W / 2 - 5, 0, H),
        B(-L / 2 + 5, L / 2 - 5, -W / 2 + 5, W / 2 - 5, 0, H - 8, 'sand')] },
    { id: 'gardenLamp', cat: 'Ogród', site: true, free: true, name: 'Lampa ogrodowa', l: 20, w: 20, h: 90, color: '#2b2b2e',
      parts: (L, W, H) => [C(0, 0, L / 2, 0, 4), C(0, 0, 3, 4, H - 18), B(-L / 2, L / 2, -W / 2, W / 2, H - 18, H - 4, 'light'), B(-L / 2 - 1, L / 2 + 1, -W / 2 - 1, W / 2 + 1, H - 4, H)] },
    { id: 'bins', cat: 'Ogród', site: true, free: true, name: 'Pojemniki na odpady', l: 180, w: 75, h: 110, color: '#3f4a3c',
      parts: (L, W, H) => split(-L / 2, L / 2, 3).flatMap(([a0, a1], k) => [B(a0 + 2, a1 - 2, -W / 2, W / 2 - 3, 0, H - 4, ['main', 'binY', 'binB'][k]), B(a0 + 1, a1 - 1, -W / 2 - 1, W / 2, H - 4, H, ['main', 'binY', 'binB'][k])]) },
    { id: 'compost', cat: 'Ogród', site: true, free: true, name: 'Kompostownik', l: 100, w: 100, h: 80, color: '#75532f',
      parts: (L, W, H) => split(0, H, 6).flatMap(([z0, z1]) => [B(-L / 2, L / 2, -W / 2, -W / 2 + 3, z0 + 1, z1 - 1), B(-L / 2, L / 2, W / 2 - 3, W / 2, z0 + 1, z1 - 1),
        B(-L / 2, -L / 2 + 3, -W / 2 + 3, W / 2 - 3, z0 + 1, z1 - 1), B(L / 2 - 3, L / 2, -W / 2 + 3, W / 2 - 3, z0 + 1, z1 - 1)]) },

    // ---------- Bramy i furtki (stawiane w przerwie ogrodzenia) ----------
    { id: 'gateSwing', cat: 'Bramy', site: true, free: true, name: 'Brama dwuskrzydłowa', l: 400, w: 15, h: 150, color: '#3a3d42', parts: (L, W, H) => gate(L, W, H, 2) },
    { id: 'gateSlide', cat: 'Bramy', site: true, free: true, name: 'Brama przesuwna', l: 450, w: 15, h: 150, color: '#3a3d42', parts: (L, W, H) => gate(L, W, H, 1) },
    { id: 'wicket', cat: 'Bramy', site: true, free: true, name: 'Furtka', l: 110, w: 15, h: 150, color: '#3a3d42', parts: (L, W, H) => gate(L, W, H, 1) },

    // ---------- Własne ----------
    { id: 'photo', cat: 'Własne', name: 'Mebel ze zdjęcia', l: 60, w: 60, h: 85, color: '#d9d4cc', photo: true },
    { id: 'model', cat: 'Własne', name: 'Model 3D (.glb)', l: 100, w: 100, h: 100, color: '#c8c8c8', model: true },
  ];
  App.FURNITURE = CATALOG;
  App.furnitureDef = (type) => CATALOG.find(d => d.id === type) || CATALOG[0];

  App.makeFurniture = (type, x, y, rot) => {
    const d = App.furnitureDef(type);
    return { id: App.uid(), kind: 'furniture', type: d.id, x, y, l: d.l, w: d.w, h: d.h, z: d.z || 0, rot: rot || 0, flip: false, color: d.color };
  };

  // Części mebla w jego układzie lokalnym (dla mebla ze zdjęcia: bryła, front dostaje zdjęcie).
  App.furnitureParts = (o) => {
    const d = App.furnitureDef(o.type);
    if (d.photo) return [B(-o.l / 2, o.l / 2, -o.w / 2, o.w / 2 - 0.5, 0, o.h), Object.assign(B(-o.l / 2, o.l / 2, o.w / 2 - 0.5, o.w / 2, 0, o.h), { front: true })];
    if (d.model) return [];
    return d.parts(o.l, o.w, o.h);
  };
  App.furnitureColor = (m, o) => {
    if (m === 'main') return o.color;
    if (m === 'main2') return shade(o.color, 0.82);
    return MATS[m] || m;
  };
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
    return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
  }
  App.shade = shade;

  // Rzut mebla z góry: części od najniższej do najwyższej, w układzie świata (ctx już przeskalowany do cm).
  // u – ile cm to jeden piksel ekranu (grubość linii).
  const planImages = {};
  App.drawFurniturePlan = (ctx, o, u, sel, tech) => {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot * Math.PI / 180);
    if (o.flip) ctx.scale(-1, 1);
    const d = App.furnitureDef(o.type);
    ctx.lineWidth = u * 0.8;
    ctx.strokeStyle = tech ? '#6b7280' : '#3f3f46';
    if (d.model) {
      // Model 3D: zapisany przy imporcie widok z góry, rozciągnięty na obrys.
      const md = App.model3d(o.model);
      let img = md && planImages[md.id];
      if (md && md.plan && !img) { img = planImages[md.id] = new Image(); img.onload = () => App.emit('texload'); img.src = md.plan; }
      ctx.fillStyle = 'rgba(200,200,200,0.35)';
      ctx.fillRect(-o.l / 2, -o.w / 2, o.l, o.w);
      if (img && img.complete && img.naturalWidth) ctx.drawImage(img, -o.l / 2, -o.w / 2, o.l, o.w);
    } else {
      App.furnitureParts(o).slice().sort((p, q) => top(p) - top(q)).forEach(p => {
        const m = p.m, col = App.furnitureColor(m, o);
        ctx.fillStyle = tech ? '#ffffff' : m === 'glass' ? 'rgba(160,200,230,0.35)' : col;
        ctx.beginPath();
        if (p.b) ctx.rect(p.b[0], p.b[2], p.b[1] - p.b[0], p.b[3] - p.b[2]);
        else if (p.c && p.seg === 4) { const r = p.c[2] / Math.SQRT2; ctx.rect(p.c[0] - r, p.c[1] - r * (p.s || 1), 2 * r, 2 * r * (p.s || 1)); }
        else if (p.c) ctx.ellipse(p.c[0], p.c[1], p.c[2], p.c[2] * (p.s || 1), 0, 0, Math.PI * 2);
        else if (p.e) ctx.ellipse(p.e[0], p.e[1], p.e[3], p.e[3] * (p.sb || 1), 0, 0, Math.PI * 2);
        else if (p.p) {
          const as = p.p.map(q => q[0]), a0 = Math.min(...as), a1 = Math.max(...as), r = Math.min(p.r || 0, (a1 - a0) / 2, (p.w[1] - p.w[0]) / 2);
          if (ctx.roundRect) ctx.roundRect(a0, p.w[0], a1 - a0, p.w[1] - p.w[0], r); else ctx.rect(a0, p.w[0], a1 - a0, p.w[1] - p.w[0]);
        }
        else ctx.rect(p.d[0] - p.d[2], p.d[3], 2 * p.d[2], p.d[4] - p.d[3]);
        ctx.fill();
        ctx.stroke();
      });
    }
    // Front zaznaczony grubszą linią.
    ctx.lineWidth = u * (sel ? 2.2 : 1.2);
    ctx.strokeStyle = sel ? '#2563eb' : tech ? '#4b5563' : '#27272a';
    // Rośliny i wyposażenie ogrodu bez prostokąta obrysu (korona drzewa jest okrągła) – chyba że zaznaczone.
    if (!d.site || sel) ctx.strokeRect(-o.l / 2, -o.w / 2, o.l, o.w);
    if (d.photo || d.model) {
      ctx.lineWidth = u * 2.5;
      ctx.beginPath();
      ctx.moveTo(-o.l / 2, o.w / 2);
      ctx.lineTo(o.l / 2, o.w / 2);
      ctx.stroke();
    }
    ctx.restore();
  };
  const top = (p) => (p.b ? p.b[5] : p.c ? p.c[4] : p.p ? Math.max(...p.p.map(q => q[1])) : p.e ? p.e[2] + p.e[3] * (p.sz || 1) : p.d[1] + p.d[2]);

  // Miniatura do katalogu.
  App.furnitureThumb = (def, size = 44) => {
    const c = document.createElement('canvas');
    c.width = c.height = size * 2;
    const ctx = c.getContext('2d'), o = { type: def.id, x: 0, y: 0, l: def.l, w: def.w, h: def.h, rot: 0, color: def.color };
    const k = size * 2 * 0.86 / Math.max(def.l, def.w);
    ctx.setTransform(k, 0, 0, k, size, size);
    App.drawFurniturePlan(ctx, o, 1 / k * 1.2, false);
    if (def.photo || def.model) {
      ctx.fillStyle = '#3f3f46';
      ctx.font = `bold ${def.l * 0.3}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.photo ? 'foto' : '3D', 0, 0);
    }
    return c;
  };

  // ---------- Modele 3D (.glb) ----------
  // Biblioteka: project.models = [{ id, name, src (dataURL .glb), plan (dataURL widoku z góry), l, w, h }].
  App.model3d = (id) => (App.project.models || []).find(m => m.id === id) || null;
})(window.App);
