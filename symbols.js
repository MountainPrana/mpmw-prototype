// Waypoint symbols for the picker and for the user's own waypoints on the map.
//
// PLACEHOLDERS: these stand in until the shared symbol library exists (symbols/ in the
// project, one SVG per QGIS `type` value). Each entry's `type` is the value saved with
// the waypoint, so keep it matching the QGIS attribute values when the real set arrives.
//
// Each symbol draws on a 24 x 24 grid. `fill` is the symbol color, `detail` the color of
// the small marks inside it, and `edge` an optional outline so it reads on a busy map.

"use strict";

const SYMBOLS = [
  {
    type: "campsite", name: "Campsite",
    draw: (fill, detail, edge) =>
      `<polygon points="12,3 2.5,20 21.5,20" fill="${fill}" stroke="${edge || "#FFFFFF"}" stroke-width="${edge ? 1.8 : 1.5}" stroke-linejoin="round"/>`
  },
  {
    type: "trailhead", name: "Trailhead",
    draw: (fill, detail, edge) =>
      `<rect x="3" y="3" width="18" height="18" rx="3.5" fill="${fill}"${edgeAttr(edge)}/>` +
      `<path d="M9.5 17V7h3.2a3 3 0 0 1 0 6H9.5" fill="none" stroke="${detail}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
  },
  {
    type: "water", name: "Water",
    draw: (fill, detail, edge) =>
      `<path d="M12 2.5s7 7.6 7 12.5a7 7 0 0 1-14 0c0-4.9 7-12.5 7-12.5z" fill="${fill}"${edgeAttr(edge)}/>`
  },
  {
    type: "viewpoint", name: "Viewpoint",
    draw: (fill, detail, edge) =>
      `<path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" fill="${fill}"${edgeAttr(edge)}/>` +
      `<circle cx="12" cy="12" r="3.2" fill="${detail}"/>`
  },
  {
    type: "hazard", name: "Hazard",
    draw: (fill, detail, edge) =>
      `<path d="M12 2l10 10-10 10L2 12z" fill="${fill}"${edgeAttr(edge)}/>` +
      `<path d="M12 7.5v5.5" stroke="${detail}" stroke-width="2.2" stroke-linecap="round"/>` +
      `<circle cx="12" cy="16.4" r="1.3" fill="${detail}"/>`
  },
  {
    type: "crossing", name: "Crossing",
    draw: (fill, detail, edge) =>
      `<rect x="2" y="2" width="20" height="20" rx="10" fill="${fill}"${edgeAttr(edge)}/>` +
      `<path d="M6 10c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 3 0" fill="none" stroke="${detail}" stroke-width="1.9" stroke-linecap="round"/>` +
      `<path d="M6 14.5c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 3 0" fill="none" stroke="${detail}" stroke-width="1.9" stroke-linecap="round"/>`
  },
  {
    type: "other", name: "Other",
    draw: (fill, detail, edge) =>
      (edge ? `<path d="M5.5 21V3.5" stroke="${edge}" stroke-width="5" stroke-linecap="round"/>` +
              `<path d="M6.5 4h12l-3 4.5 3 4.5h-12z" fill="${edge}" stroke="${edge}" stroke-width="3" stroke-linejoin="round"/>` : "") +
      `<path d="M5.5 21V3.5" stroke="${fill}" stroke-width="2.4" stroke-linecap="round"/>` +
      `<path d="M6.5 4h12l-3 4.5 3 4.5h-12z" fill="${fill}"/>`
  }
];

// "Existing waypoint": the user's note goes on a symbol already printed on the map, and
// shows as a ring (halo) around it instead of a second symbol.
const EXISTING = {
  type: "existing", name: "Existing waypoint",
  draw: (fill, detail) =>
    `<circle cx="12" cy="12" r="9" fill="none" stroke="${fill}" stroke-width="2.6"/>` +
    `<polygon points="12,7.6 7.9,14.8 16.1,14.8" fill="${detail}"/>`
};

function edgeAttr(edge) {
  return edge ? ` stroke="${edge}" stroke-width="1.6" stroke-linejoin="round" paint-order="stroke"` : "";
}

function symbolFor(type) {
  if (type === EXISTING.type) return EXISTING;
  return SYMBOLS.find((s) => s.type === type) || SYMBOLS[SYMBOLS.length - 1];
}

// Returns the SVG markup for one symbol.
function symbolSvg(type, { size = 26, fill = "currentColor", detail = "#FFFFFF", edge = null } = {}) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">` +
    symbolFor(type).draw(fill, detail, edge) + `</svg>`;
}
