import Link from "next/link";
import { InviteSetup } from "./setup-form";
import "../account.css";
export const metadata = { title: "Set up your Spandan account", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default function InvitePage() {
 return <main className="account-page"><section className="auth-form-shell"><h1>Welcome to Spandan</h1><p>Your committee-verified PG, JR or Faculty account. Choose your own password.</p><InviteSetup /><Link href="/account?view=signin">Back to sign in</Link></section></main>;
}
