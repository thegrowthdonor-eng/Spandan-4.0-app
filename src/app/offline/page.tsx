import Link from "next/link";
import "./offline.css";

export default function OfflinePage() {
  return <main className="offline-page"><p className="eyebrow">SPANDAN 4.0</p><h1>You&apos;re offline.</h1><p>This public shell may be stale. Private account information and actions are never stored for offline use.</p><Link href="/">Try again →</Link></main>;
}
