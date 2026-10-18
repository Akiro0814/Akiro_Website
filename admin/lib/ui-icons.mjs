// A consistent 24px stroke grid for the blog's existing navigation.
const paths = {
  dashboard: 'M3 3h7v8H3zM14 3h7v5h-7zM3 15h7v6H3zM14 12h7v9h-7z',
  posts: 'M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6',
  notes: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
  projects: 'M3 7h18v13H3zM8 7V4h8v3M3 12h18M10 12v3h4v-3',
  media: 'M3 4h18v16H3zM3 15l5-5 5 6 3-3 5 5M16 8h.01',
  'site-content': 'M3 4h18v16H3zM3 8h18M8 8v12M11 12h7M11 16h5',
  links: 'M10 13a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-2 2M14 11a4 4 0 0 0-6 0l-4 4a4 4 0 0 0 6 6l2-2',
  music: 'M9 18V5l11-2v13M9 9l11-2M9 18a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3M20 16a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3',
  announcements: 'M4 11h4l12-6v14L8 13H4zM8 13l2 7H7l-2-7',
  comments: 'M3 4h18v13H9l-6 4zM7 8h10M7 12h7',
  'site-stats': 'M4 20V10M10 20V4M16 20v-7M21 20H3',
  build: 'M4 8a8 8 0 0 1 14-3l2 3M20 3v5h-5M20 16a8 8 0 0 1-14 3l-2-3M4 21v-5h5',
  calendar: 'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2',
  site: 'M3 11l9-8 9 8M5 9v12h14V9M9 21v-8h6v8',
};
export function navIcon(key) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[key] || paths.posts}"/></svg>`;
}
