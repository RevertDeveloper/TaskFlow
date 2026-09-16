"use client";

import { History, LayoutDashboard, ListTodo, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeSwitcher } from "./ThemeSwitcher";

const navigationItems = [
  { href: "/app/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/app/lists", label: "Listas", icon: ListTodo },
  { href: "/app/history", label: "Historial", icon: History },
  { href: "/app/settings", label: "Ajustes", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="app-frame__sidebar" aria-label="Navegación principal">
      <Link className="brand-mark" href="/app/dashboard" aria-label="TaskFlow, ir al panel">
        <span className="brand-mark__dot" aria-hidden="true" />
        <span>TaskFlow</span>
      </Link>
      <nav className="app-nav">
        {navigationItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} aria-current={isActive ? "page" : undefined}>
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="app-frame__sidebar-footer">
        <p className="sidebar-note">Un lugar para lo que importa.</p>
        <ThemeSwitcher />
      </div>
    </aside>
  );
}