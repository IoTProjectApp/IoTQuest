// Line icons (24 × 24, drawn with the current text colour) shared by the home page and workspaces.
const PATHS = {
  map: '<path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z"/><path d="M9 4v13M15 6.5v13"/>',
  select: '<path d="m5 3 14 7.5-6.2 1.7L10 18.5 5 3Z"/>',
  object: '<path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"/><path d="m4 7 8 4 8-4M12 11v10"/>',
  erase: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/><path d="M10 11v6M14 11v6"/>',
  camera:
    '<circle cx="12" cy="12" r="2.5"/><ellipse cx="12" cy="12" rx="9.5" ry="4.5"/><path d="M12 2.5v3M12 18.5v3"/>',
  move: '<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/>',
  scale: '<path d="M4 20 20 4M14 4h6v6M10 20H4v-6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  save: '<path d="M5 3h11l4 4v14H4V3Z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  play: '<path d="M7 4.5v15l12-7.5L7 4.5Z"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4"/><path d="M6 8h4M14 8h4"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  warning: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17.5v.5"/>',
  focus: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><circle cx="12" cy="12" r="2.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  road: '<path d="M8 3 5 21M16 3l3 18"/><path d="M12 4v3M12 10.5v3M12 17v3"/>',
  junction:
    '<path d="M3 12h18M12 3v18"/><circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/>',
  crossing: '<path d="M4 7h16M4 17h16"/><path d="M7 9.5v5M10.5 9.5v5M14 9.5v5M17.5 9.5v5"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v7.5c0 4-2.5 7-6.5 7-3 0-4.6-1.6-6-4l-2-3.6a1.6 1.6 0 0 1 2.6-1.8L8 13"/>',
  traffic:
    '<rect x="8" y="2.5" width="8" height="19" rx="2.5"/><circle cx="12" cy="7" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="17" r="1.6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  plan: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 12h17M12 3.5v17"/>',
  cube: '<path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"/><path d="m4 7 8 4 8-4M12 11v10"/>',
  person: '<circle cx="12" cy="6.5" r="3"/><path d="M12 10v6M8 21l4-5 4 5M7 12.5l5-2 5 2"/>',
  quest: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  city: '<path d="M3 21h18M5 21V9l5-3v15M10 21V4l9 4v13"/><path d="M13 10h3M13 14h3M13 18h3"/>',
  chat: '<path d="M4 5h16v11H10l-5 4v-4H4V5Z"/><path d="M8 9.5h8M8 12.5h5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  world:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.5-4-9s1.5-6.5 4-9Z"/>',
  terrain: '<path d="m3 20 6-9 4 5 4-7 4 11H3Z"/><circle cx="17.5" cy="6.5" r="2"/>',
  paint:
    '<path d="M19 3 9.5 12.5a3 3 0 0 0-.8 1.5l-.7 3.5 3.5-.7a3 3 0 0 0 1.5-.8L22.5 6.5 19 3Z"/><path d="M5 21c2 0 3.5-1 3.5-2.5S7.5 16 6 16s-2.5 1-2.5 2.5C3.5 20 3 21 5 21Z"/>',
  water: '<path d="M12 3.5c3.5 4.5 6 7.5 6 11a6 6 0 1 1-12 0c0-3.5 2.5-6.5 6-11Z"/>',
  tree: '<path d="M12 3 6 11h3.5L6.5 16h11l-3-5H18L12 3Z"/><path d="M12 16v5"/>',
  building:
    '<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-5h6v5M9 10h2M13 10h2M9 13.5h2M13 13.5h2"/>',
  furniture:
    '<path d="M5 12V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/><path d="M3 12h18v5H3v-5ZM5 17v3M19 17v3"/>',
  device:
    '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff:
    '<path d="M3 3l18 18M10.6 10.6a2.8 2.8 0 0 0 3.9 3.9"/><path d="M6.4 6.6C3.9 8.2 2 12 2 12s3.5 6 10 6c2 0 3.7-.5 5.2-1.4M9.5 6.2A10.7 10.7 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-2.8 3.8"/>',
  layers:
    '<path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z"/><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  upload: '<path d="M12 15V3m0 0-4 4m4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  folder:
    '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.3l2 2.5h8.7A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-12Z"/>',
};

export function icon(name, size = 18) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}
