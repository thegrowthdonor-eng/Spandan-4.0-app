"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { managementLinks, type ManagementSummary } from "@/lib/management";
import styles from "@/app/admin/workspace.module.css";

export function WorkspaceShell({ summary, children }: { summary: ManagementSummary; children: React.ReactNode }) {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  const links = managementLinks(summary);
  const title = links.find(link => link.href === pathname)?.label ?? "Management";
  const navigation = <nav aria-label="Management navigation">{links.map(link =>
    <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}
      onClick={() => { if (menu.current) menu.current.open = false; }}>{link.label}</Link>
  )}</nav>;
  return <div className={styles.workspace} data-management-portal>
    <a className={styles.skip} href="#management-content">Skip to workspace</a>
    <aside className={styles.sidebar}>
      <Link className={styles.brand} href="/admin">SPANDAN <small>Management</small></Link>
      {navigation}
      <div className={styles.returnLinks}><Link href="/home">← Festival</Link><Link href="/my-fest">My Fest pass</Link></div>
    </aside>
    <div className={styles.body}>
      <header className={styles.toolbar}>
        <details ref={menu} className={styles.mobileMenu}><summary aria-label="Open management menu">☰ Menu</summary>{navigation}</details>
        <strong>{title}</strong>
        <Link href="/home">Festival ↗</Link>
      </header>
      <div id="management-content" data-management-content className={styles.content}>{children}</div>
    </div>
  </div>;
}
