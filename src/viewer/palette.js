// Colours for the 3D model. Base colours are the "real" material colours;
// each look mixes them toward the paper or keeps them full strength.
import * as THREE from 'three';

export const BASE = {
  timber: {
    column: '#c68b4e', beam: '#cb9455', girder: '#c08748', rafter: '#c68b4e', purlin: '#d2a469',
    slab: '#e2c493', roofslab: '#e2c493', roofdeck: '#d8bc93', wall: '#d7bf9a', rough: 0.62, metal: 0,
  },
  concrete: {
    column: '#9a9ea0', beam: '#a2a6a8', girder: '#9ca0a3', rafter: '#9a9ea0', purlin: '#a2a6a8',
    slab: '#b8bbbc', roofslab: '#b8bbbc', roofdeck: '#90979b', wall: '#babdbd', rough: 0.93, metal: 0,
  },
  steel: {
    column: '#b0523b', beam: '#b85a42', girder: '#aa4e38', infill: '#c1664d', brace: '#8c3b2b', rafter: '#b0523b', purlin: '#c1664d',
    slab: '#c7cacc', roofslab: '#a5adb4', roofdeck: '#828d96', wall: '#a0aab4', rough: 0.42, metal: 0.3,
  },
};
const SHARED = { footing: '#9da1a4', glass: '#a8c5d6', door: '#3a3f45' };

export const PANEL_ROLES = new Set(['slab', 'roofslab', 'roofdeck']);

// How strongly each look shows material colour, and how heavy the ink is.
const LOOKS = {
  drafting: {
    light: { paper: '#fbfbfa', frameMix: 0.5, panelMix: 0.3, footMix: 0.22, envMix: 0.55, edge: '#1d2327', frameEdge: 0.82, panelEdge: 0.4, envEdge: 0.3, hemi: 1.5, sun: 1.7, shadow: 0.075, exposure: 1.0, env: 0.35 },
    dark: { paper: '#1b2433', frameMix: 0.62, panelMix: 0.3, footMix: 0.25, envMix: 0.5, edge: '#d9e2ec', frameEdge: 0.62, panelEdge: 0.28, envEdge: 0.2, hemi: 1.0, sun: 1.6, shadow: 0.34, exposure: 1.0, env: 0.3 },
  },
  studio: {
    light: { paper: '#ffffff', frameMix: 1, panelMix: 1, footMix: 1, envMix: 1, edge: '#14181b', frameEdge: 0.16, panelEdge: 0.1, envEdge: 0.06, hemi: 1.15, sun: 2.5, shadow: 0.2, exposure: 1.0, env: 0.6 },
    dark: { paper: '#0b1220', frameMix: 1, panelMix: 1, footMix: 1, envMix: 1, edge: '#000000', frameEdge: 0.32, panelEdge: 0.2, envEdge: 0.12, hemi: 0.75, sun: 2.8, shadow: 0.55, exposure: 1.05, env: 0.55 },
  },
};

// Red oxide washes out to pink at half strength, so steel keeps more of its colour on paper.
const MAT_WEIGHT = { timber: 1.08, concrete: 1, steel: 1.42 };

export function lookParams(look = 'drafting', dark = false) {
  return (LOOKS[look] || LOOKS.drafting)[dark ? 'dark' : 'light'];
}

export function baseColor(material, role) {
  const b = BASE[material];
  return b[role] || SHARED[role] || b.column;
}

const _c = new THREE.Color();
export function faceColor(material, role, look, dark, out = new THREE.Color()) {
  const p = lookParams(look, dark);
  const frame = p.frameMix * (look === 'drafting' ? MAT_WEIGHT[material] || 1 : 1);
  const mix = role === 'footing' ? p.footMix : PANEL_ROLES.has(role) ? p.panelMix : ['wall', 'glass', 'door'].includes(role) ? p.envMix : Math.min(1, frame);
  out.set(p.paper);
  _c.set(baseColor(material, role));
  return out.lerp(_c, mix);
}

export function edgeStyle(role, look, dark) {
  const p = lookParams(look, dark);
  const opacity = ['wall', 'glass', 'door'].includes(role) ? p.envEdge : PANEL_ROLES.has(role) || role === 'footing' ? p.panelEdge : p.frameEdge;
  return { color: p.edge, opacity };
}
