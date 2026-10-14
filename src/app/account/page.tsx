import Link from "next/link";
import { hasSupabaseConfiguration } from "@/server/env";
import "./account.css";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";

export default function AccountPage() {
  const configured = hasSupabaseConfiguration();
  return <main className="account-page">
    <header className="account-header"><Link className="wordmark" href="/">Spandan <span>4.0</span></Link><Link href="/" className="back-link">← Back to the fest</Link></header>
    <section className="account-hero" aria-labelledby="account-title"><p className="eyebrow ink">Student account</p><h1 id="account-title">Your fest,<br /><em>in one place.</em></h1><p>Use your batch, roll number and password. Student email and SMS OTP are not required.</p></section>
    <section className="account-grid"><div className="auth-stack"><SignInForm configured={configured} /><SignUpForm configured={configured} /></div><aside><p className="eyebrow ink">How access works</p><ol className="access-steps"><li><span>01</span><div><strong>Create your profile</strong><p>Name, batch, roll number and phone are collected once.</p></div></li><li><span>02</span><div><strong>Wait for verification</strong><p>The treasurer verifies college identity and the offline contribution.</p></div></li><li><span>03</span><div><strong>Apply to events</strong><p>Activation enables applications; it does not guarantee approval or final selection.</p></div></li></ol><div id="recovery" className="recovery"><strong>Account recovery</strong><p>Contact the authorised fest help desk with your college ID. Staff never need your existing password.</p></div></aside></section>
  </main>;
}
