import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Home, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AvatarImage } from './AvatarImage';

export interface DashboardNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badgeCount?: number;
}

interface DashboardShellProps {
  portalLabel: string;
  navItems: DashboardNavItem[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  primaryAction?: React.ReactNode;
  children: React.ReactNode;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  portalLabel,
  navItems,
  activeTab,
  onSelectTab,
  primaryAction,
  children,
}) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const currentItem = navItems.find((i) => i.id === activeTab);

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex sc-canvas text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 sc-sidebar border-r border-white/[0.08]">
        <div className="h-16 px-6 flex items-center justify-between border-b border-white/[0.08]">
          <Link to="/" className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
            SmartCred
          </Link>
          <span className="text-xs text-slate-400">{portalLabel}</span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-indigo-600/20 text-white border border-indigo-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <span className="flex items-center gap-3 truncate">
                  <span className={active ? 'text-indigo-400' : 'text-slate-400'}>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badgeCount !== undefined && item.badgeCount > 0 && (
                  <span className="text-xs font-mono tabular-nums text-indigo-300">
                    {item.badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/[0.08] space-y-3">
          {user && (
            <div className="flex items-center gap-3 px-2">
              <AvatarImage src={user.avatarUrl} name={user.fullName} sizeClass="w-9 h-9" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">{user.fullName}</p>
                <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Website</span>
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-rose-950/60 border border-white/10 text-xs font-medium text-slate-300 hover:text-rose-200 transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] sc-sidebar border-r border-white/10 flex flex-col z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-white/10">
              <span className="text-lg font-bold text-white">SmartCred</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="p-2 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const active = item.id === activeTab;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium ${
                      active
                        ? 'bg-indigo-600/20 text-white border border-indigo-500/30'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      {item.icon}
                      <span>{item.label}</span>
                    </span>
                    {item.badgeCount !== undefined && item.badgeCount > 0 && (
                      <span className="text-xs font-mono text-indigo-300">{item.badgeCount}</span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-white/10 flex gap-2">
              <Link
                to="/"
                className="flex-1 py-2 rounded-lg bg-slate-900 border border-white/10 text-center text-xs text-slate-200"
              >
                Public Site
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex-1 py-2 rounded-lg bg-rose-950/50 border border-rose-500/20 text-xs text-rose-200"
              >
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 glass-nav px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-300 hover:text-white"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-400 hidden sm:inline">{portalLabel}</span>
              <span className="text-slate-600 hidden sm:inline">/</span>
              <span className="font-semibold text-white truncate">
                {currentItem?.label || 'Overview'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">{primaryAction}</div>
        </header>

        {/* Responsive Mobile/Tablet Inline Quick-Switch Navigation Strip (non-sticky, zero viewport crowding) */}
        <div className="lg:hidden border-b border-white/[0.08] px-4 py-2.5 overflow-x-auto no-print">
          <div className="flex items-center gap-1.5 min-w-max">
            {navItems.map((item) => {
              const active = item.id === activeTab;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-900/80 text-slate-300 hover:text-white border border-white/10'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.badgeCount !== undefined && item.badgeCount > 0 && (
                    <span className="font-mono tabular-nums opacity-90">({item.badgeCount})</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
};
