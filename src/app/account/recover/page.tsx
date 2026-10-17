import { InviteSetup } from "../invite/setup-form";
import "../account.css";
export const metadata = { title: "Reset your Spandan password", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default function RecoveryPage() {
  return <main className="account-page"><section className="auth-form-shell"><h1>Reset password</h1><p>Use the private reset link issued after committee verification.</p><InviteSetup recovery /></section></main>;
}
