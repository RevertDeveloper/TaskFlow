"use client";

import { History, Inbox, ListTodo, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AccountControl } from "./AccountControl";

const navigationItems = [
  { href: "/", label: "Hoy", icon: Inbox },
  { href: "/app/lists", label: "Listas", icon: ListTodo },
  { href: "/app/history", label: "Historial", icon: History },
  { href: "/app/settings", label: "Ajustes", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <div className="mobile-nav-wrap">
      <AccountControl />
      <nav className="mobile-nav" aria-label="Navegación móvil">
        {navigationItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} aria-current={isActive ? "page" : undefined}>
              <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}