import Link from "next/link";
import "./my-fest.css";

export default function MyFestPage() {
  return <main className="my-fest-page"><p className="eyebrow">My Fest</p><h1>Your festival space is being prepared.</h1><p>Once the live Supabase session and organiser configuration are connected, this page will show access status, applications, selection updates, schedule and reminders.</p><Link href="/account">Back to account →</Link></main>;
}
