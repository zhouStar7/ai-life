import { Armchair, ChartNoAxesColumn, House, Menu, Plane, Search, Settings2, Shirt, Sparkles, Utensils } from 'lucide-react';

const icons = { overview: House, wardrobe: Shirt, diet: Utensils, home: Armchair, travel: Plane, spending: ChartNoAxesColumn, settings: Settings2, search: Search, spark: Sparkles, menu: Menu };
type IconName = keyof typeof icons;

export function Icon({ name }: { name: IconName }) {
  const Glyph = icons[name];
  return <Glyph size={18} strokeWidth={1.7} aria-hidden="true" />;
}
