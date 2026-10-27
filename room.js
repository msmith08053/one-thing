// One Thing — the shared room: spots, furniture art, and the renderer.
// Everything is drawn with simple SVG shapes so it stays crisp on any screen.

// Room is 360 × 430. Wall runs 0–282, floor 282–430.
export const SPOTS = {
  ceiling:     { x: 30,  y: 0,   w: 300, h: 46,  label: 'Ceiling' },
  wall_left:   { x: 20,  y: 40,  w: 124, h: 134, label: 'Window wall' },
  wall_mid:    { x: 160, y: 46,  w: 78,  h: 80,  label: 'Middle of the wall' },
  wall_right:  { x: 250, y: 52,  w: 96,  h: 80,  label: 'Right wall' },
  // px/py: where the "+" sits when empty (the rug's center is the Front spot, so its + goes left).
  rug:         { x: 40,  y: 326, w: 280, h: 84,  label: 'Floor (rug)', px: 84, py: 372 },
  floor_left:  { x: 6,   y: 176, w: 80,  h: 162, label: 'Left corner' },
  floor_right: { x: 282, y: 146, w: 74,  h: 194, label: 'Right corner' },
  floor_mid:   { x: 82,  y: 204, w: 200, h: 128, label: 'Main seat' },
  floor_front: { x: 142, y: 340, w: 80,  h: 74,  label: 'Front' },
};
// Drawing order: back to front.
const ORDER = ['wall_left', 'wall_mid', 'wall_right', 'rug', 'floor_left', 'floor_right', 'floor_mid', 'floor_front', 'ceiling'];

const C = {
  mint: '#8CC9B0', mintD: '#7BBBA1', mintL: '#A5D9C3',
  peach: '#F7B7A3', peachD: '#EFA088', peachL: '#FBD0C2', pink: '#F4A9A8',
  butter: '#FFD98A', butterL: '#FFE7A3', wood: '#C98F5B', woodD: '#B07A4F', woodDD: '#8A6A4F',
  leaf: '#6DB58A', leafD: '#5CA57A', leafL: '#7CC499', sky: '#BDE4F4', blue: '#6FA3D6',
  lav: '#C7B8EA', lavD: '#B3A1E0', cream: '#FFF8EC', terra: '#E58E6D', terraL: '#F0A584', ink: '#4A3B2F',
};

const pot = (x, y, w, h) => `<rect x="${x - 3}" y="${y}" width="${w + 6}" height="10" rx="4" fill="${C.terraL}"/><path d="M${x} ${y + 8} L${x + w} ${y + 8} L${x + w - 5} ${y + h} L${x + 5} ${y + h} Z" fill="${C.terra}"/>`;
const glowCircle = (cx, cy, r, night) => `<circle cx="${cx}" cy="${cy}" r="${night ? r * 2 : r * 1.3}" fill="url(#__GLOW__)" opacity="${night ? 1 : 0.55}"/>`;

// Each item: (night) => { body, glow? }. Coordinates are local to the item's spot.
export const ART = {
  // ---------- wall_left (124 × 134) ----------
  window_classic: (n) => ({ body: `
    <rect x="18" y="10" width="88" height="112" rx="12" fill="#fff"/>
    <rect x="25" y="17" width="74" height="98" rx="6" fill="${n ? '#2B3A67' : C.sky}"/>
    ${n ? `<circle cx="80" cy="36" r="10" fill="#FFF4C2"/><circle cx="85" cy="32" r="9" fill="#2B3A67"/>
           <circle cx="40" cy="30" r="1.6" fill="#fff"/><circle cx="55" cy="46" r="1.2" fill="#fff"/><circle cx="34" cy="56" r="1.4" fill="#fff"/>`
        : `<rect x="34" y="34" width="34" height="12" rx="6" fill="#fff"/><circle cx="52" cy="32" r="9" fill="#fff"/>`}
    <path d="M25 115 L25 96 Q50 82 70 94 Q86 86 99 92 L99 115 Z" fill="${n ? '#3E5C4E' : '#A6D8A0'}"/>
    <rect x="58" y="17" width="8" height="98" fill="#fff"/><rect x="25" y="62" width="74" height="7" fill="#fff"/>
    <rect x="4" y="2" width="22" height="130" rx="10" fill="${C.peach}"/><rect x="98" y="2" width="22" height="130" rx="10" fill="${C.peach}"/>
    <rect x="0" y="0" width="124" height="8" rx="4" fill="${C.wood}"/>` }),
  window_round: (n) => ({ body: `
    <circle cx="62" cy="66" r="54" fill="#fff"/><circle cx="62" cy="66" r="45" fill="${n ? '#2B3A67' : C.sky}"/>
    ${n ? `<circle cx="78" cy="48" r="9" fill="#FFF4C2"/><circle cx="45" cy="50" r="1.5" fill="#fff"/><circle cx="58" cy="38" r="1.2" fill="#fff"/>`
        : `<circle cx="78" cy="48" r="10" fill="#FFD45C"/><rect x="34" y="52" width="30" height="10" rx="5" fill="#fff"/>`}
    <path d="M20 84 Q45 70 62 80 Q80 70 104 82 L100 96 Q62 124 24 96 Z" fill="${n ? '#3E5C4E' : '#A6D8A0'}"/>
    <rect x="58" y="12" width="8" height="108" fill="#fff"/><rect x="8" y="62" width="108" height="8" fill="#fff"/>
    <circle cx="62" cy="66" r="50" fill="none" stroke="${C.wood}" stroke-width="5"/>` }),
  window_garden: (n) => ({ body: `
    ${ART.window_classic(n).body}
    <rect x="12" y="108" width="100" height="22" rx="6" fill="${C.wood}"/>
    <circle cx="28" cy="104" r="7" fill="${C.pink}"/><circle cx="44" cy="100" r="8" fill="${C.leafL}"/>
    <circle cx="62" cy="103" r="7" fill="${C.butter}"/><circle cx="80" cy="99" r="8" fill="${C.leaf}"/><circle cx="96" cy="104" r="7" fill="${C.lav}"/>` }),

  // ---------- wall_mid (78 × 80) ----------
  clock_wall: () => ({ body: `
    <circle cx="39" cy="40" r="31" fill="${C.cream}" stroke="${C.wood}" stroke-width="7"/>
    <circle cx="39" cy="16" r="2" fill="${C.ink}"/><circle cx="63" cy="40" r="2" fill="${C.ink}"/><circle cx="39" cy="64" r="2" fill="${C.ink}"/><circle cx="15" cy="40" r="2" fill="${C.ink}"/>
    <path d="M39 40 L39 22 M39 40 L52 47" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/><circle cx="39" cy="40" r="3" fill="${C.ink}"/>` }),
  shelf_small: () => ({ body: `
    <rect x="4" y="54" width="70" height="8" rx="3" fill="${C.wood}"/>
    <path d="M12 62 L12 72 L20 62 Z M58 62 L66 62 L66 72 Z" fill="${C.woodD}"/>
    ${pot(10, 38, 16, 16)}<ellipse cx="18" cy="30" rx="6" ry="11" fill="${C.leaf}"/>
    <rect x="34" y="30" width="7" height="24" rx="1" fill="${C.pink}"/><rect x="42" y="34" width="7" height="20" rx="1" fill="${C.blue}"/>
    <rect x="50" y="28" width="6" height="26" rx="1" fill="${C.butter}" transform="rotate(8 53 41)"/>
    <rect x="61" y="44" width="8" height="10" rx="2" fill="${C.cream}"/><path d="M65 44 Q63 38 65 35" stroke="#F49A5C" stroke-width="3" fill="none" stroke-linecap="round"/>` }),
  mirror_round: () => ({ body: `
    <circle cx="39" cy="40" r="33" fill="#DDEFF7" stroke="#E8C07A" stroke-width="6"/>
    <path d="M22 30 Q28 18 40 15" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M24 42 Q26 36 30 32" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>` }),
  wreath: () => ({ body: `
    <circle cx="39" cy="40" r="27" fill="none" stroke="#C9B48A" stroke-width="10"/>
    <circle cx="39" cy="40" r="27" fill="none" stroke="${C.leafD}" stroke-width="5" stroke-dasharray="7 6"/>
    <circle cx="20" cy="26" r="5" fill="${C.pink}"/><circle cx="60" cy="30" r="5" fill="${C.butter}"/><circle cx="58" cy="58" r="5" fill="${C.lav}"/><circle cx="18" cy="56" r="5" fill="${C.peach}"/>
    <path d="M33 66 L39 60 L45 66 L42 76 M36 76 L39 60" stroke="${C.pink}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` }),

  // ---------- wall_right (96 × 80) ----------
  picture_sunny: () => ({ body: `
    <rect x="6" y="8" width="84" height="64" rx="6" fill="#CDEBD6" stroke="${C.wood}" stroke-width="7"/>
    <circle cx="68" cy="26" r="8" fill="#FFD45C"/>
    <path d="M10 68 Q30 40 50 56 Q66 42 86 58 L86 68 Z" fill="${C.leafL}"/>
    <path d="M10 68 Q34 54 58 66 L58 68 Z" fill="${C.leaf}"/>` }),
  poster_mountains: () => ({ body: `
    <rect x="10" y="4" width="76" height="72" rx="3" fill="#E2EEF9" stroke="#fff" stroke-width="5"/>
    <circle cx="62" cy="24" r="8" fill="${C.peach}"/>
    <path d="M14 70 L38 30 L52 50 L62 38 L82 70 Z" fill="${C.blue}"/>
    <path d="M38 30 L32 40 L44 40 Z M62 38 L58 44 L66 44 Z" fill="#fff"/>
    <rect x="4" y="0" width="16" height="7" rx="1" fill="${C.butterL}" opacity=".9" transform="rotate(-20 12 3)"/>
    <rect x="76" y="0" width="16" height="7" rx="1" fill="${C.butterL}" opacity=".9" transform="rotate(20 84 3)"/>` }),
  picture_cat: () => ({ body: `
    <rect x="12" y="6" width="72" height="68" rx="8" fill="${C.lav}" stroke="#E8C07A" stroke-width="6"/>
    <path d="M30 34 L32 18 L42 28 Z M66 34 L64 18 L54 28 Z" fill="#F49A5C"/>
    <ellipse cx="48" cy="42" rx="20" ry="17" fill="#F49A5C"/>
    <circle cx="41" cy="40" r="2.6" fill="${C.ink}"/><circle cx="55" cy="40" r="2.6" fill="${C.ink}"/>
    <path d="M46 47 L48 49 L50 47" stroke="${C.ink}" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M30 70 Q48 56 66 70" fill="#F49A5C"/>` }),
  gallery_wall: () => ({ body: `
    <rect x="2" y="4" width="40" height="34" rx="3" fill="${C.peachL}" stroke="${C.wood}" stroke-width="4"/><circle cx="22" cy="21" r="8" fill="${C.pink}"/>
    <rect x="48" y="0" width="44" height="46" rx="3" fill="#E2EEF9" stroke="#fff" stroke-width="4"/><path d="M52 42 L64 22 L74 34 L80 28 L88 42 Z" fill="${C.blue}"/>
    <rect x="6" y="44" width="34" height="32" rx="16" fill="${C.butterL}" stroke="#E8C07A" stroke-width="4"/>
    <rect x="50" y="52" width="40" height="26" rx="3" fill="#CDEBD6" stroke="${C.woodD}" stroke-width="4"/><path d="M54 74 Q70 58 86 74 Z" fill="${C.leaf}"/>` }),

  // ---------- ceiling (300 × 46, may hang lower) ----------
  lights_string: (n) => {
    const pts = [[22, 14], [64, 28], [108, 36], [150, 38], [192, 36], [236, 28], [278, 14]];
    const cols = [C.butter, C.pink, C.mint, C.blue, C.butter, C.pink, C.mint];
    return {
      body: `<path d="M0 4 Q150 70 300 4" fill="none" stroke="${C.woodDD}" stroke-width="2.5"/>` +
        pts.map(([x, y], i) => `<rect x="${x - 2}" y="${y - 6}" width="4" height="6" fill="${C.woodDD}"/><ellipse cx="${x}" cy="${y + 4}" rx="6" ry="8" fill="${cols[i]}"/>`).join(''),
      glow: pts.map(([x, y], i) => `<circle cx="${x}" cy="${y + 4}" r="${n ? 22 : 12}" fill="url(#__GLOW__)" opacity="${n ? 0.9 : 0.4}"/>` + (n ? `<ellipse cx="${x}" cy="${y + 4}" rx="6" ry="8" fill="${cols[i]}"/><ellipse cx="${x}" cy="${y + 2}" rx="3" ry="4" fill="#fff" opacity=".7"/>` : '')).join(''),
    };
  },
  bunting: () => {
    const cols = [C.pink, C.butter, C.mint, C.blue, C.peach, C.lav, C.pink, C.butter, C.mint];
    return { body: `<path d="M0 6 Q150 40 300 6" fill="none" stroke="${C.woodDD}" stroke-width="2"/>` +
      cols.map((c, i) => { const x = 18 + i * 33; const y = 6 + Math.sin((i + 0.5) / 9 * Math.PI) * 17; return `<path d="M${x - 11} ${y} L${x + 11} ${y} L${x} ${y + 22} Z" fill="${c}"/>`; }).join('') };
  },
  plant_hanging: () => ({ body: `
    <path d="M150 0 L132 58 M150 0 L168 58 M150 0 L150 58" stroke="${C.woodDD}" stroke-width="1.6"/>
    <path d="M128 56 L172 56 L166 80 L134 80 Z" fill="${C.terra}"/><rect x="125" y="52" width="50" height="8" rx="4" fill="${C.terraL}"/>
    <ellipse cx="140" cy="50" rx="10" ry="6" fill="${C.leaf}"/><ellipse cx="160" cy="49" rx="11" ry="6" fill="${C.leafL}"/>
    <path d="M132 76 Q120 96 126 116" stroke="${C.leafD}" stroke-width="3" fill="none"/><ellipse cx="124" cy="96" rx="5" ry="8" fill="${C.leaf}"/><ellipse cx="127" cy="114" rx="5" ry="7" fill="${C.leafL}"/>
    <path d="M168 76 Q182 100 174 124" stroke="${C.leafD}" stroke-width="3" fill="none"/><ellipse cx="180" cy="98" rx="5" ry="8" fill="${C.leafL}"/><ellipse cx="175" cy="120" rx="5" ry="7" fill="${C.leaf}"/>` }),
  paper_lanterns: (n) => {
    const L = [[60, 40, C.pink], [150, 62, C.butter], [240, 46, C.mint]];
    return {
      body: L.map(([x, y, c]) => `<path d="M${x} 0 L${x} ${y - 16}" stroke="${C.woodDD}" stroke-width="1.6"/><rect x="${x - 6}" y="${y - 18}" width="12" height="5" rx="1" fill="${C.woodDD}"/><ellipse cx="${x}" cy="${y}" rx="17" ry="15" fill="${c}"/><path d="M${x - 15} ${y} L${x + 15} ${y} M${x - 12} ${y - 7} L${x + 12} ${y - 7} M${x - 12} ${y + 7} L${x + 12} ${y + 7}" stroke="#fff" stroke-width="1.4" opacity=".7"/>`).join(''),
      glow: L.map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="${n ? 42 : 26}" fill="url(#__GLOW__)" opacity="${n ? 0.9 : 0.4}"/>` + (n ? `<ellipse cx="${x}" cy="${y}" rx="17" ry="15" fill="${c}"/><ellipse cx="${x}" cy="${y}" rx="9" ry="8" fill="#fff" opacity=".45"/>` : '')).join(''),
    };
  },

  // ---------- rug (280 × 84) ----------
  rug_round: () => ({ body: `
    <ellipse cx="140" cy="42" rx="130" ry="38" fill="${C.pink}"/>
    <ellipse cx="140" cy="42" rx="108" ry="28" fill="none" stroke="#FFE3E0" stroke-width="3" stroke-dasharray="8 6"/>
    <ellipse cx="140" cy="42" rx="44" ry="11" fill="${C.peachL}"/>` }),
  rug_stripe: () => ({ body: `
    <rect x="16" y="8" width="248" height="68" rx="14" fill="${C.mintL}"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${34 + i * 38}" y="8" width="18" height="68" fill="${i % 2 ? C.butterL : '#fff'}" opacity=".85"/>`).join('')}
    ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => `<path d="M${22 + i * 21} 76 l0 7 M${22 + i * 21} 8 l0 -7" stroke="${C.mintD}" stroke-width="2"/>`).join('')}` }),
  rug_checker: () => {
    let sq = '';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++) if ((r + c) % 2 === 0) sq += `<rect x="${20 + c * 20}" y="${10 + r * 16}" width="20" height="16" fill="${C.lav}"/>`;
    return { body: `<rect x="16" y="6" width="248" height="72" rx="10" fill="#fff"/>${sq}<rect x="16" y="6" width="248" height="72" rx="10" fill="none" stroke="${C.lavD}" stroke-width="4"/>` };
  },

  // ---------- floor_left (80 × 162) ----------
  plant_leafy: () => ({ body: `
    <ellipse cx="40" cy="70" rx="12" ry="34" fill="${C.leaf}"/>
    <ellipse cx="22" cy="86" rx="10" ry="27" fill="${C.leafD}" transform="rotate(-32 22 86)"/>
    <ellipse cx="58" cy="86" rx="10" ry="27" fill="${C.leafL}" transform="rotate(32 58 86)"/>
    <ellipse cx="28" cy="60" rx="7" ry="20" fill="${C.leafL}" transform="rotate(-14 28 60)"/>
    ${pot(18, 112, 44, 48)}` }),
  bookshelf: () => ({ body: `
    <rect x="8" y="18" width="64" height="142" rx="6" fill="${C.wood}"/>
    ${[26, 66, 106].map((y) => `<rect x="14" y="${y}" width="52" height="34" rx="2" fill="#F6E3C6"/>`).join('')}
    <rect x="17" y="34" width="7" height="26" rx="1" fill="${C.pink}"/><rect x="25" y="38" width="7" height="22" rx="1" fill="${C.mint}"/><rect x="33" y="32" width="6" height="28" rx="1" fill="${C.blue}"/>
    <rect x="44" y="44" width="16" height="16" rx="7" fill="${C.leafL}"/>
    <rect x="18" y="80" width="18" height="20" rx="3" fill="${C.butter}"/><rect x="40" y="74" width="7" height="26" rx="1" fill="${C.lav}"/><rect x="48" y="78" width="7" height="22" rx="1" fill="${C.peach}"/>
    <rect x="18" y="120" width="30" height="20" rx="3" fill="${C.terra}"/><circle cx="58" cy="132" r="7" fill="${C.cream}"/>` }),
  plant_cactus: () => ({ body: `
    <rect x="32" y="36" width="18" height="84" rx="9" fill="${C.leaf}"/>
    <path d="M32 82 L22 82 Q16 82 16 74 L16 58" stroke="${C.leaf}" stroke-width="12" fill="none" stroke-linecap="round"/>
    <path d="M50 70 L58 70 Q64 70 64 62 L64 50" stroke="${C.leafL}" stroke-width="11" fill="none" stroke-linecap="round"/>
    <circle cx="41" cy="34" r="5" fill="${C.pink}"/>
    ${pot(20, 116, 42, 44)}` }),
  plant_fern: () => ({ body: `
    <rect x="18" y="112" width="44" height="8" rx="3" fill="${C.wood}"/>
    <path d="M24 120 L18 160 M56 120 L62 160 M40 120 L40 160" stroke="${C.woodD}" stroke-width="5" stroke-linecap="round"/>
    ${pot(24, 88, 32, 26)}
    ${[-60, -35, -12, 12, 35, 60].map((a) => `<ellipse cx="40" cy="62" rx="7" ry="30" fill="${a % 2 ? C.leafD : C.leafL}" transform="rotate(${a} 40 90)"/>`).join('')}` }),

  // ---------- floor_mid (200 × 128) ----------
  sofa_mint: () => ({ body: `<g transform="translate(15 24)">
    <rect x="10" y="18" width="150" height="54" rx="20" fill="${C.mint}"/>
    <rect x="0" y="40" width="30" height="46" rx="13" fill="${C.mintD}"/><rect x="140" y="40" width="30" height="46" rx="13" fill="${C.mintD}"/>
    <rect x="22" y="52" width="126" height="32" rx="13" fill="${C.mintL}"/>
    <rect x="38" y="30" width="38" height="28" rx="11" fill="#F7C6A3"/><rect x="94" y="30" width="38" height="28" rx="11" fill="${C.pink}"/>
    <rect x="18" y="85" width="9" height="15" rx="3" fill="${C.woodD}"/><rect x="143" y="85" width="9" height="15" rx="3" fill="${C.woodD}"/></g>` }),
  armchair_peach: () => ({ body: `<g transform="translate(50 30)">
    <rect x="16" y="6" width="68" height="54" rx="20" fill="${C.peach}"/>
    <rect x="2" y="34" width="26" height="46" rx="11" fill="${C.peachD}"/><rect x="72" y="34" width="26" height="46" rx="11" fill="${C.peachD}"/>
    <rect x="22" y="48" width="56" height="30" rx="11" fill="${C.peachL}"/>
    <rect x="14" y="80" width="8" height="16" rx="3" fill="${C.woodD}"/><rect x="78" y="80" width="8" height="16" rx="3" fill="${C.woodD}"/></g>` }),
  sofa_lavender: () => ({ body: `<g transform="translate(20 22)">
    <path d="M14 70 L14 34 Q14 8 40 8 L120 8 Q146 8 146 34 L146 70 Z" fill="${C.lav}"/>
    <circle cx="12" cy="62" r="20" fill="${C.lavD}"/><circle cx="148" cy="62" r="20" fill="${C.lavD}"/>
    <rect x="18" y="56" width="124" height="30" rx="12" fill="#DCD2F5"/>
    <circle cx="56" cy="44" r="13" fill="${C.butterL}"/><rect x="88" y="32" width="30" height="26" rx="9" fill="${C.mintL}"/>
    <rect x="22" y="86" width="8" height="16" rx="3" fill="${C.woodD}"/><rect x="130" y="86" width="8" height="16" rx="3" fill="${C.woodD}"/></g>` }),
  bench_cozy: () => ({ body: `<g transform="translate(18 30)">
    <rect x="0" y="4" width="164" height="12" rx="6" fill="${C.wood}"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${10 + i * 27}" y="14" width="10" height="38" fill="${C.woodD}"/>`).join('')}
    <rect x="0" y="50" width="164" height="16" rx="6" fill="${C.wood}"/>
    <rect x="8" y="40" width="70" height="18" rx="9" fill="${C.mintL}"/><rect x="86" y="40" width="70" height="18" rx="9" fill="${C.peachL}"/>
    <rect x="14" y="22" width="30" height="24" rx="9" fill="${C.butterL}"/>
    <rect x="8" y="66" width="10" height="30" rx="3" fill="${C.woodD}"/><rect x="146" y="66" width="10" height="30" rx="3" fill="${C.woodD}"/></g>` }),

  // ---------- floor_right (74 × 194) ----------
  lamp_floor: (n) => ({ body: `
    <path d="M18 74 L56 74 L48 34 L26 34 Z" fill="${C.butter}" stroke="#E7B95A" stroke-width="2" stroke-linejoin="round"/>
    <rect x="35" y="74" width="4" height="110" fill="${C.woodDD}"/><ellipse cx="37" cy="186" rx="18" ry="6" fill="${C.woodDD}"/>`,
    glow: glowCircle(37, 58, 30, n) + (n ? `<path d="M18 74 L56 74 L48 34 L26 34 Z" fill="#FFE8A8"/>` : '') }),
  lamp_mushroom: (n) => ({ body: `
    <rect x="12" y="146" width="50" height="8" rx="3" fill="${C.wood}"/><path d="M18 154 L14 192 M56 154 L60 192" stroke="${C.woodD}" stroke-width="5" stroke-linecap="round"/>
    <rect x="31" y="118" width="12" height="28" rx="5" fill="${C.cream}"/>
    <path d="M10 120 Q10 88 37 88 Q64 88 64 120 Z" fill="${C.pink}"/>
    <circle cx="26" cy="104" r="4" fill="#fff"/><circle cx="44" cy="98" r="5" fill="#fff"/><circle cx="52" cy="110" r="3" fill="#fff"/>`,
    glow: glowCircle(37, 112, 26, n) + (n ? `<path d="M10 120 Q10 88 37 88 Q64 88 64 120 Z" fill="#FFC9C4"/>` : '') }),
  coatrack: () => ({ body: `
    <rect x="35" y="26" width="5" height="158" fill="${C.woodD}"/><ellipse cx="37" cy="186" rx="20" ry="6" fill="${C.woodDD}"/>
    <path d="M37 40 L22 30 M37 40 L52 30 M37 56 L24 50 M37 56 L50 50" stroke="${C.woodD}" stroke-width="4" stroke-linecap="round"/>
    <path d="M18 30 Q22 20 30 28 L24 36 Z" fill="${C.blue}"/><ellipse cx="54" cy="26" rx="12" ry="5" fill="${C.terra}"/><path d="M46 26 Q54 10 62 26 Z" fill="${C.terra}"/>
    <path d="M48 50 L52 100 L44 100 L42 52 Z" fill="${C.pink}"/>` }),
  plant_tall: () => ({ body: `
    <path d="M37 150 Q34 100 37 50" stroke="${C.woodD}" stroke-width="5" fill="none"/>
    ${[-70, -40, -10, 20, 50, 80].map((a, i) => `<ellipse cx="37" cy="24" rx="7" ry="30" fill="${i % 2 ? C.leaf : C.leafL}" transform="rotate(${a} 37 52)"/>`).join('')}
    ${pot(17, 146, 40, 46)}` }),

  // ---------- floor_front (80 × 74) ----------
  table_coffee: () => ({ body: `
    <rect x="4" y="34" width="72" height="12" rx="5" fill="${C.wood}"/>
    <rect x="10" y="46" width="7" height="24" rx="2" fill="${C.woodD}"/><rect x="63" y="46" width="7" height="24" rx="2" fill="${C.woodD}"/>
    <rect x="22" y="20" width="14" height="14" rx="3" fill="${C.cream}"/><path d="M36 24 Q42 26 36 30" stroke="${C.cream}" stroke-width="3" fill="none"/>
    <path d="M26 16 Q24 10 28 6 M32 16 Q30 10 34 6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/>
    <rect x="46" y="26" width="22" height="8" rx="2" fill="${C.blue}"/><rect x="48" y="20" width="18" height="6" rx="2" fill="${C.butter}"/>` }),
  fishbowl: () => ({ body: `
    <rect x="22" y="62" width="36" height="9" rx="4" fill="${C.wood}"/>
    <circle cx="40" cy="38" r="26" fill="#CDEBF5" stroke="#A9D6EA" stroke-width="3"/>
    <path d="M16 38 Q40 30 64 38 L62 48 Q40 70 18 48 Z" fill="#9FD3EA"/>
    <ellipse cx="38" cy="45" rx="9" ry="6" fill="#F49A5C"/><path d="M46 45 L54 39 L54 51 Z" fill="#F49A5C"/><circle cx="34" cy="43" r="1.6" fill="${C.ink}"/>` }),
  pouf: () => ({ body: `
    <ellipse cx="40" cy="44" rx="34" ry="24" fill="${C.butter}"/>
    <ellipse cx="40" cy="32" rx="30" ry="12" fill="${C.butterL}"/>
    ${[-20, -8, 4, 16].map((x) => `<path d="M${40 + x} 36 Q${42 + x} 52 ${40 + x} 64" stroke="#E7B95A" stroke-width="3" fill="none"/>`).join('')}` }),
  catbed: () => ({ body: `
    <ellipse cx="40" cy="52" rx="38" ry="18" fill="${C.lavD}"/><ellipse cx="40" cy="46" rx="30" ry="12" fill="#E9E2FA"/>
    <ellipse cx="42" cy="42" rx="22" ry="11" fill="#9A9AA8"/>
    <circle cx="24" cy="38" r="9" fill="#9A9AA8"/><path d="M18 32 L19 24 L24 30 Z M27 30 L31 24 L31 33 Z" fill="#9A9AA8"/>
    <path d="M20 39 Q22 41 24 39 M26 39 Q28 41 30 39" stroke="${C.ink}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M62 44 Q70 36 64 30" stroke="#9A9AA8" stroke-width="5" fill="none" stroke-linecap="round"/>` }),
  radio: () => ({ body: `
    <rect x="10" y="46" width="60" height="8" rx="3" fill="${C.wood}"/><path d="M16 54 L14 72 M64 54 L66 72" stroke="${C.woodD}" stroke-width="4" stroke-linecap="round"/>
    <rect x="12" y="14" width="56" height="32" rx="8" fill="${C.peachD}"/>
    <circle cx="28" cy="30" r="10" fill="${C.cream}"/><circle cx="28" cy="30" r="5" fill="none" stroke="${C.woodD}" stroke-width="2"/>
    <rect x="44" y="22" width="18" height="6" rx="2" fill="${C.cream}"/><circle cx="48" cy="38" r="3" fill="${C.cream}"/><circle cx="58" cy="38" r="3" fill="${C.cream}"/>
    <path d="M22 14 L34 2" stroke="${C.woodDD}" stroke-width="2" stroke-linecap="round"/>` }),

  // ---------- seasonal ----------
  pumpkin: () => ({ body: `
    <ellipse cx="26" cy="48" rx="18" ry="22" fill="#F08A3C"/><ellipse cx="54" cy="48" rx="18" ry="22" fill="#F08A3C"/>
    <ellipse cx="40" cy="48" rx="20" ry="24" fill="#F59A4A"/>
    <path d="M38 24 Q40 14 46 10" stroke="${C.leafD}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M28 40 L34 34 L36 42 Z M52 40 L46 34 L44 42 Z" fill="#7A3A12"/>
    <path d="M27 54 Q40 66 53 54 L49 58 L45 55 L40 60 L35 55 L31 58 Z" fill="#7A3A12"/>` }),
  bat_garland: () => {
    const bat = (x, y) => `<path d="M${x} ${y} q-6 -6 -14 -2 q4 2 4 6 q4 -3 6 0 q2 -4 4 -4 q2 0 4 4 q2 -3 6 0 q0 -4 4 -6 q-8 -4 -14 2 Z" fill="#5E4E8C"/>`;
    return { body: `<path d="M0 6 Q150 44 300 6" fill="none" stroke="${C.woodDD}" stroke-width="2"/>` +
      [0, 1, 2, 3, 4, 5, 6].map((i) => { const x = 25 + i * 42; const y = 8 + Math.sin((i + 0.5) / 7 * Math.PI) * 18; return i % 2 ? `<path d="M${x - 8} ${y} L${x + 8} ${y} L${x} ${y + 16} Z" fill="#F59A4A"/>` : bat(x, y + 8); }).join('') };
  },
  lamp_jackolantern: (n) => ({ body: `
    <rect x="12" y="140" width="50" height="8" rx="3" fill="${C.wood}"/><path d="M18 148 L14 192 M56 148 L60 192" stroke="${C.woodD}" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="25" cy="118" rx="14" ry="20" fill="#F08A3C"/><ellipse cx="49" cy="118" rx="14" ry="20" fill="#F08A3C"/><ellipse cx="37" cy="118" rx="17" ry="22" fill="#F59A4A"/>
    <path d="M36 97 Q37 90 42 87" stroke="${C.leafD}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M27 112 L32 106 L34 114 Z M47 112 L42 106 L40 114 Z M26 124 Q37 134 48 124 L44 127 L37 131 L30 127 Z" fill="#FFD460"/>`,
    glow: glowCircle(37, 118, 26, n) + (n ? `<path d="M27 112 L32 106 L34 114 Z M47 112 L42 106 L40 114 Z M26 124 Q37 134 48 124 L44 127 L37 131 L30 127 Z" fill="#FFE07A"/>` : '') }),
  tree_holiday: (n) => {
    const orn = [[30, 70, C.pink], [46, 92, C.blue], [24, 112, C.butter], [50, 128, C.pink], [32, 140, C.lav], [42, 54, C.butter]];
    return {
      body: `<rect x="31" y="160" width="12" height="16" fill="${C.woodD}"/><path d="M20 176 L54 176 L50 192 L24 192 Z" fill="${C.terra}"/>
        <path d="M37 30 L62 90 L12 90 Z" fill="${C.leaf}"/><path d="M37 60 L68 130 L6 130 Z" fill="${C.leafD}"/><path d="M37 96 L72 164 L2 164 Z" fill="${C.leaf}"/>
        <path d="M37 14 l4 9 10 1 -8 6 3 10 -9 -6 -9 6 3 -10 -8 -6 10 -1 Z" fill="#FFD45C"/>` +
        orn.map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="5" fill="${c}"/>`).join(''),
      glow: n ? orn.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="12" fill="url(#__GLOW__)" opacity=".8"/>`).join('') + `<circle cx="37" cy="26" r="20" fill="url(#__GLOW__)"/>` : '',
    };
  },
  snow_garland: () => {
    const flake = (x, y, r) => `<g stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M${x - r} ${y} L${x + r} ${y} M${x - r * 0.5} ${y - r * 0.87} L${x + r * 0.5} ${y + r * 0.87} M${x - r * 0.5} ${y + r * 0.87} L${x + r * 0.5} ${y - r * 0.87}"/></g><circle cx="${x}" cy="${y}" r="2" fill="${C.blue}"/>`;
    return { body: `<path d="M0 6 Q150 44 300 6" fill="none" stroke="#B8C9DA" stroke-width="2"/>` +
      [0, 1, 2, 3, 4, 5, 6].map((i) => { const x = 25 + i * 42; const y = 14 + Math.sin((i + 0.5) / 7 * Math.PI) * 18; return `<circle cx="${x}" cy="${y}" r="11" fill="${C.blue}" opacity=".35"/>` + flake(x, y, 8); }).join('') };
  },
  gift_stack: () => ({ body: `
    <rect x="6" y="36" width="40" height="34" rx="3" fill="${C.pink}"/><rect x="23" y="36" width="6" height="34" fill="#fff"/><rect x="6" y="49" width="40" height="6" fill="#fff"/>
    <rect x="42" y="44" width="32" height="26" rx="3" fill="${C.mint}"/><rect x="55" y="44" width="6" height="26" fill="${C.butter}"/>
    <rect x="16" y="14" width="30" height="22" rx="3" fill="${C.lav}"/><rect x="28" y="14" width="6" height="22" fill="${C.butter}"/>
    <path d="M31 14 q-10 -10 -12 0 Z M31 14 q10 -10 12 0 Z" fill="${C.butter}"/>` }),
  tulips: () => {
    const fl = [[22, 52, C.pink], [40, 40, C.butter], [58, 50, '#E86A6A'], [31, 66, '#E86A6A'], [50, 64, C.pink]];
    return { body: fl.map(([x, y]) => `<path d="M${x} ${y + 8} Q${(x + 40) / 2} ${y + 50} 40 120" stroke="${C.leafD}" stroke-width="3" fill="none"/>`).join('') +
      `<ellipse cx="28" cy="104" rx="5" ry="14" fill="${C.leaf}" transform="rotate(-20 28 104)"/><ellipse cx="52" cy="104" rx="5" ry="14" fill="${C.leafL}" transform="rotate(20 52 104)"/>` +
      fl.map(([x, y, c]) => `<path d="M${x - 8} ${y} Q${x - 8} ${y + 14} ${x} ${y + 14} Q${x + 8} ${y + 14} ${x + 8} ${y} L${x + 4} ${y + 5} L${x} ${y - 2} L${x - 4} ${y + 5} Z" fill="${c}"/>`).join('') +
      pot(20, 116, 40, 44) };
  },
  flower_garland: () => {
    const cols = [C.pink, C.butter, C.lav, C.peach, C.pink, C.butter, C.lav];
    return { body: `<path d="M0 6 Q150 44 300 6" fill="none" stroke="${C.leafD}" stroke-width="2.5"/>` +
      cols.map((c, i) => { const x = 25 + i * 42; const y = 10 + Math.sin((i + 0.5) / 7 * Math.PI) * 18;
        return `<ellipse cx="${x - 9}" cy="${y + 4}" rx="6" ry="3" fill="${C.leaf}" transform="rotate(-20 ${x - 9} ${y + 4})"/>` +
          [0, 72, 144, 216, 288].map((a) => `<circle cx="${x + Math.cos(a * Math.PI / 180) * 6}" cy="${y + Math.sin(a * Math.PI / 180) * 6}" r="5" fill="${c}"/>`).join('') +
          `<circle cx="${x}" cy="${y}" r="4" fill="#fff"/>`; }).join('') };
  },
};

// Wallpapers and floors (style spots, not placed objects)
const WALLS = {
  default:      { a: '#FCEBD0', b: '#F8E2C2', type: 'stripes' },
  wall_mint:    { a: '#E6F4EB', b: '#CDE9D7', type: 'stripes' },
  wall_dots:    { a: '#FFF1E9', b: '#F6C4B1', type: 'dots' },
  wall_gingham: { a: '#EEF5FC', b: '#C9DEF2', type: 'gingham' },
  wall_diamond: { a: '#F1ECFA', b: '#D8CDF1', type: 'diamond' },
};
const FLOORS = {
  default:       { a: '#E5B583', b: '#D9A673', type: 'planks' },
  floor_walnut:  { a: '#A9724A', b: '#8E5E3B', type: 'planks' },
  floor_checker: { a: '#F7F0E4', b: '#CFC2EA', type: 'checker' },
  floor_carpet:  { a: '#A9C8E6', b: '#93B5D8', type: 'carpet' },
};
function wallPattern(pid, w) {
  const { a, b, type } = w;
  if (type === 'dots') return `<pattern id="${pid}" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="${a}"/><circle cx="7" cy="7" r="4" fill="${b}"/><circle cx="21" cy="21" r="4" fill="${b}"/></pattern>`;
  if (type === 'gingham') return `<pattern id="${pid}" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="${a}"/><rect width="12" height="24" fill="${b}" opacity=".55"/><rect width="24" height="12" fill="${b}" opacity=".55"/></pattern>`;
  if (type === 'diamond') return `<pattern id="${pid}" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill="${a}"/><path d="M15 4 L25 15 L15 26 L5 15 Z" fill="${b}"/></pattern>`;
  return `<pattern id="${pid}" width="36" height="10" patternUnits="userSpaceOnUse"><rect width="18" height="10" fill="${a}"/><rect x="18" width="18" height="10" fill="${b}"/></pattern>`;
}
function floorPattern(pid, f) {
  const { a, b, type } = f;
  if (type === 'checker') return `<pattern id="${pid}" width="48" height="24" patternUnits="userSpaceOnUse"><rect width="48" height="24" fill="${a}"/><rect width="24" height="12" fill="${b}"/><rect x="24" y="12" width="24" height="12" fill="${b}"/></pattern>`;
  if (type === 'carpet') return `<pattern id="${pid}" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${a}"/><circle cx="4" cy="4" r="1.3" fill="${b}"/><circle cx="12" cy="11" r="1.3" fill="${b}"/></pattern>`;
  return `<pattern id="${pid}" width="73" height="30" patternUnits="userSpaceOnUse"><rect width="73" height="30" fill="${a}"/><rect x="70" width="3" height="30" fill="${b}"/></pattern>`;
}
export const STYLE_SPOTS = {
  wallpaper: { label: 'Wallpaper' },
  floor: { label: 'Floor' },
};

const THUMB_BOX = { lights_string: '0 -6 300 64', bunting: '0 -2 300 50', paper_lanterns: '30 -4 240 96', plant_hanging: '95 -4 110 132', bat_garland: '0 -2 300 56', snow_garland: '0 -2 300 56', flower_garland: '0 -2 300 56' };

// A single item, framed for a store card or list.
export function itemThumb(itemId, spot, cls = '') {
  if (spot === 'wallpaper' || spot === 'floor') {
    const pid = 's' + (++uid);
    const w = spot === 'wallpaper' ? WALLS[itemId] || WALLS.default : WALLS.default;
    const f = spot === 'floor' ? FLOORS[itemId] || FLOORS.default : FLOORS.default;
    return `<svg class="${cls}" viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>${wallPattern(pid + 'w', w)}${floorPattern(pid + 'f', f)}</defs>
      <rect width="120" height="${spot === 'wallpaper' ? 66 : 34}" fill="url(#${pid}w)"/><rect y="${spot === 'wallpaper' ? 66 : 34}" width="120" height="${spot === 'wallpaper' ? 24 : 56}" fill="url(#${pid}f)"/>
      <rect y="${spot === 'wallpaper' ? 62 : 30}" width="120" height="5" fill="#E9C9A0"/></svg>`;
  }
  const s = SPOTS[spot]; const art = ART[itemId]?.(false);
  if (!s || !art) return '';
  const vb = THUMB_BOX[itemId] || `-6 -6 ${s.w + 12} ${s.h + 12}`;
  const gid = 'g' + (++uid);
  return `<svg class="${cls}" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${glowDef(gid)}${(art.glow || '').replaceAll('__GLOW__', gid)}${art.body}</svg>`;
}

let uid = 0;
const glowDef = (gid) => `<defs><radialGradient id="${gid}"><stop offset="0" stop-color="#FFF1BF" stop-opacity=".95"/><stop offset=".45" stop-color="#FFE29A" stop-opacity=".5"/><stop offset="1" stop-color="#FFE29A" stop-opacity="0"/></radialGradient></defs>`;
// The whole room. placed: { spot: item_id }. opts: { night, slice, empty }
export function roomSVG(placed, opts = {}) {
  const n = !!opts.night; const id = 'r' + (++uid);
  const wall = WALLS[placed.wallpaper] || WALLS.default;
  const floor = FLOORS[placed.floor] || FLOORS.default;
  let items = '', glows = '';
  for (const spot of ORDER) {
    const itemId = placed[spot]; if (!itemId || !ART[itemId]) continue;
    const s = SPOTS[spot]; const a = ART[itemId](n);
    const wrap = (inner) => `<svg x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}" overflow="visible">${inner}</svg>`;
    items += wrap(a.body);
    if (a.glow) glows += wrap(a.glow.replaceAll('__GLOW__', id + 'g'));
  }
  return `<svg class="room-svg" viewBox="0 0 360 430" preserveAspectRatio="${opts.slice ? 'xMidYMax slice' : 'xMidYMid meet'}" role="img" aria-label="Your shared room${opts.empty ? ', still empty' : ''}">
    ${glowDef(id + 'g')}
    <defs>
      ${wallPattern(id + 'w', wall)}
      ${floorPattern(id + 'f', floor)}
    </defs>
    <rect width="360" height="282" fill="url(#${id}w)"/>
    <rect y="282" width="360" height="148" fill="url(#${id}f)"/>
    <rect y="270" width="360" height="14" fill="${n ? '#D4B48E' : '#E9C9A0'}"/>
    ${glows && !n ? glows : ''}
    ${items}
    ${n ? `<rect width="360" height="430" fill="#1F2552" opacity=".38"/>${glows}` : ''}
  </svg>`;
}

// Is it evening? (7 p.m.–6 a.m. local)
export const isEvening = (d = new Date()) => d.getHours() >= 19 || d.getHours() < 6;
