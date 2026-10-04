"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export function NavLink({ href, label, icon }: { href: string; label: string; icon?: IconName }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link href={href} className={active ? "active" : ""}>
      {icon ? <Icon name={icon} className="nav-ico" /> : null}
      <span>{label}</span>
    </Link>
  );
}
