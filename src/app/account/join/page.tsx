import Link from "next/link";
import { SeniorSignupForm } from "./signup-form";
import "../account.css";

export const metadata = { title: "Join Spandan 4.0", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default function SeniorJoinPage() {
  return <main className="account-page"><div className="account-content" style={{ paddingTop: 28 }}><section className="focused-auth-view"><div className="auth-form-shell">
    <div className="auth-form-head"><span className="auth-badge">SPANDAN 4.0</span><h1>Welcome to Spandan</h1><p>Create your PG, JR, FMG or Faculty festival account.</p></div>
    <SeniorSignupForm />
    <Link href="/account?mode=senior">Already registered? Sign in</Link>
  </div></section></div></main>;
}
