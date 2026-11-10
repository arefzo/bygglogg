const paths = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/>',
  book: '<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v20H7.5A2.5 2.5 0 0 1 5 19.5z"/><path d="M5 17.5h15"/><path d="M9 7h7M9 10.5h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.4l3.4 2"/>',
  shield: '<path d="M12 2.8 4.8 6v5.6c0 4.4 3 8 7.2 9.6 4.2-1.6 7.2-5.2 7.2-9.6V6z"/><path d="m8.8 12 2.2 2.3 4.4-4.6"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="14" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  left: '<path d="m14.5 5-7 7 7 7"/>',
  right: '<path d="m9.5 5 7 7-7 7"/>',
  down: '<path d="m5 9 7 7 7-7"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  alert: '<path d="M12 3.5 21 20H3z"/><path d="M12 9.5v5M12 17.2v.3"/>',
  lock: '<rect x="4.5" y="10" width="15" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="4.5" y="10" width="15" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/>',
  print: '<path d="M7 8V3h10v5"/><rect x="3.5" y="8" width="17" height="9" rx="2"/><path d="M7 14h10v7H7z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 14h9l1-14M10 11v6M14 11v6"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M17.5 14.4A6.5 6.5 0 0 1 21.5 20"/>',
  building: '<path d="M4 21V5l8-3v19M12 9h8v12M2 21h20"/><path d="M7 7v.01M7 11v.01M7 15v.01M16 13v.01M16 17v.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/>',
  camera: '<path d="M3.5 8h3l1.5-2h8L17.5 8h3v12h-17z"/><circle cx="12" cy="13.5" r="3.5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m14.5 5.5 4 4"/>',
  flag: '<path d="M5 21V4h9l-1.5 4H20l-1.5 4H20l-2 4H5"/>',
};

export function icon(name, size = 18, className = '') {
  const body = paths[name] ?? paths.info;
  return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function inconLogo({ width = 34, height = 24 } = {}) {
  return `<img class="incon-logo" src="/assets/incon-logo.png" width="${width}" height="${height}" alt="INCON" />`;
}