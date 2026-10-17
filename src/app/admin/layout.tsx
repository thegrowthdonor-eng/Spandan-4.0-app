import Link from "next/link";
import styles from "./workspace.module.css";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.workspace}>
      <header className={styles.toolbar}>
        <Link href="/admin" className={styles.home}><span aria-hidden>←</span> Organiser hub</Link>
        <nav aria-label="Organiser navigation"><Link href="/my-fest">My Fest</Link><Link href="/">Festival <span aria-hidden>↗</span></Link></nav>
      </header>
      {children}
    </div>
  );
}
