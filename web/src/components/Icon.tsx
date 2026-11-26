const paths = {
  overview: 'm3 10 9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z',
  wardrobe: 'm8 4-5 3 2 5 3-1v9h8v-9l3 1 2-5-5-3a4 4 0 0 1-8 0Z',
  diet: 'M3 3v5a3 3 0 0 0 6 0V3M6 3v19m15-19c-4 0-6 4-6 7v3h6m0-10v19',
  home: 'M5 11V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4M5 18v2m14-2v2M5 18a2 2 0 0 1-2-2v-3a2 2 0 0 1 4 0v1h10v-1a2 2 0 1 1 4 0v3a2 2 0 0 1-2 2Z',
  travel: 'm17 3 1 1v4l4 4v3l-4-2v4l2 2v2l-5-2-4 2v-2l2-2v-4l-9 3v-3l9-5V5a2 2 0 0 1 4-2Z',
  spending: 'M6 19v-5m6 5V5m6 14v-9',
  settings: 'M4 8h6m4 0h6M4 16h10m4 0h2M10 5v6m8 2v6',
  search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-2 4 6 6',
  spark: 'M10 2l2.5 6.5L19 11l-6.5 2.5L10 20l-2.5-6.5L1 11l6.5-2.5L10 2Zm9 12v6m-3-3h6M19 2v4m-2-2h4',
  menu: 'M4 7h16M4 12h16M4 17h16',
};

type IconName = keyof typeof paths;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d={paths[name]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
