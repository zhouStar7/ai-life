type IconName = 'overview' | 'wardrobe' | 'diet' | 'home' | 'travel' | 'spending' | 'settings' | 'search' | 'spark' | 'menu';

export function Icon({ name }: { name: IconName }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      {name === 'overview' && <path {...common} d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />}
      {name === 'wardrobe' && <path {...common} d="M8 4h8l1 3H7zm-1 3h10l-1 13H8zM12 7v13" />}
      {name === 'diet' && <path {...common} d="M6 3v8a3 3 0 0 0 3 3h1v7M14 3c2 3 2 6 2 8a3 3 0 0 1-3 3M14 3v6" />}
      {name === 'home' && <path {...common} d="M4 11h16M6 11V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M7 11v8h10v-8M10 15h4" />}
      {name === 'travel' && <path {...common} d="M3 12h11l5-4v8l-5-4H3zM3 12l2 6h4" />}
      {name === 'spending' && <path {...common} d="M5 19V9M10 19V5M15 19v-7M20 19V8" />}
      {name === 'settings' && <path {...common} d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM4 12h2M18 12h2M12 4v2M12 18v2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M17.8 6.2l-1.4 1.4M7.6 16.4l-1.4 1.4" />}
      {name === 'search' && (
        <>
          <circle {...common} cx="11" cy="11" r="6" />
          <path {...common} d="m16 16 4 4" />
        </>
      )}
      {name === 'spark' && <path {...common} d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />}
      {name === 'menu' && <path {...common} d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}
