// Layout used by all authenticated "shell" pages — lobby list, profile, clubs,
// tournaments, rules, about, and the lobby room. Provides a sticky top nav
// (brand link + section links + theme toggle + user chip) and renders the
// active route via <Outlet />.
//
// Auth pages (login, register) and the full-screen game page deliberately
// render outside this layout because they don't want the nav chrome.

import { NavLink, Outlet } from 'react-router';

import { cn } from '@/lib/cn.js';
import { ThemeToggle } from '@/components/ui/ThemeToggle.js';
import { UserChip } from '@/components/ui/UserChip.js';
import { ROUTE_PATH } from '@/routes/paths.js';

interface NavItem {
  to: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: ROUTE_PATH.HOME, label: 'Лобби' },
  { to: ROUTE_PATH.CLUBS, label: 'Клубы' },
  { to: ROUTE_PATH.TOURNAMENTS, label: 'Турниры' },
  { to: ROUTE_PATH.RULES, label: 'Правила' },
  { to: ROUTE_PATH.ABOUT, label: 'О проекте' },
];

export function MainLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <TopNav />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between gap-3">
          <NavLink
            to={ROUTE_PATH.HOME}
            end
            className="text-sm sm:text-base font-bold tracking-tight text-fg hover:text-accent transition-colors shrink-0"
          >
            online-mafia
          </NavLink>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavItemLink key={item.to} item={item} />
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <UserChip />
          </div>
        </div>

        {/* Mobile: nav links wrap below the bar so the top stays clean. */}
        <nav className="md:hidden flex items-center gap-1 overflow-x-auto pb-2 -mx-1 px-1">
          {NAV_ITEMS.map((item) => (
            <NavItemLink key={item.to} item={item} />
          ))}
        </nav>
      </div>
    </header>
  );
}

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === ROUTE_PATH.HOME}
      className={({ isActive }) =>
        cn(
          'rounded-md px-3 py-1.5 text-sm transition-colors whitespace-nowrap',
          isActive ? 'bg-bg text-fg font-semibold' : 'text-muted hover:text-fg hover:bg-bg',
        )
      }
    >
      {item.label}
    </NavLink>
  );
}
