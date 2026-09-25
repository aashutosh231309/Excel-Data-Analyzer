import { LayoutDashboard, Settings, Table2, type LucideIcon } from 'lucide-react';

export const APP_SECTIONS = ['dashboard', 'data', 'settings'] as const;

export type AppSection = (typeof APP_SECTIONS)[number];

export interface NavigationItemConfig {
  id: AppSection;
  label: string;
  icon: LucideIcon;
}

export const NAVIGATION_ITEMS: readonly NavigationItemConfig[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'data', label: 'Data', icon: Table2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];
