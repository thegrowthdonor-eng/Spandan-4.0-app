"use client";

import { useState } from "react";
import Link from "next/link";
import { SignInForm } from "./sign-in-form";
import { SignUpForm } from "./sign-up-form";

export function AuthPortalClient({
  configured,
  returnTo,
  initialView = "hub",
}: {
  configured: boolean;
  returnTo?: string;
  initialView?: "hub" | "signin" | "signup";
}) {
  const [view, setView] = useState<"hub" | "signin" | "signup">(initialView);

  // VIEW 1: FOCUSED SIGN IN
  if (view === "signin") {
    return (
      <div className="focused-auth-view">
        <button
          type="button"
          onClick={() => setView("hub")}
          className="back-to-options-btn"
        >
          ← Back to options
        </button>

        <div className="auth-form-shell">
          <div className="auth-form-head">
            <span className="auth-badge">PARTICIPANT &amp; ORGANISER ACCESS</span>
            <h2>Sign In</h2>
            <p>Choose your account type to access Spandan 4.0.</p>
          </div>

          <SignInForm
            configured={configured}
            returnTo={returnTo}
          />

          <div className="auth-form-switch">
            <p>
              New MBBS student?{" "}
              <button
                type="button"
                className="switch-btn"
                onClick={() => setView("signup")}
              >
                Create your profile →
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // VIEW 2: FOCUSED REGISTRATION
  if (view === "signup") {
    return (
      <div className="focused-auth-view">
        <button
          type="button"
          onClick={() => setView("hub")}
          className="back-to-options-btn"
        >
          ← Back to options
        </button>

        <div className="auth-form-shell">
          <div className="auth-form-head">
            <span className="auth-badge">NEW STUDENT REGISTRATION</span>
            <h2>Create Profile</h2>
            <p>Register once with your official college credentials. Verified offline at the counter.</p>
          </div>

          <SignUpForm
            configured={configured}
          />

          <div className="auth-form-switch">
            <p>
              Already registered?{" "}
              <button
                type="button"
                className="switch-btn"
                onClick={() => setView("signin")}
              >
                Sign in here →
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // VIEW 3: THE CLEAN 3-OPTION GATEWAY (DEFAULT)
  return (
    <div className="gateway-hub-view">
      <div className="gateway-cards-grid">
        {/* Card 1: Sign In (Forest Green Hero) */}
        <button
          type="button"
          className="gateway-card card-green"
          onClick={() => setView("signin")}
        >
          <div className="card-top">
            <span className="card-icon-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <span className="card-arrow" aria-hidden="true">→</span>
          </div>
          <div className="card-copy">
            <h3>Sign In</h3>
            <p>Registered students &amp; organisers access with Batch &amp; Roll Number.</p>
          </div>
        </button>

        {/* Card 2: Create Profile (Warm Terracotta / Peach) */}
        <button
          type="button"
          className="gateway-card card-peach"
          onClick={() => setView("signup")}
        >
          <div className="card-top">
            <span className="card-icon-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </span>
            <span className="card-arrow" aria-hidden="true">→</span>
          </div>
          <div className="card-copy">
            <h3>Create Profile</h3>
            <p>New MBBS students register here for official festival pass &amp; entries.</p>
          </div>
        </button>

        {/* Card 3: Enter as Guest (Champagne Sand) */}
        <Link href="/guest" className="gateway-card card-sand">
          <div className="card-top">
            <span className="card-icon-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </span>
            <span className="card-arrow" aria-hidden="true">↗</span>
          </div>
          <div className="card-copy">
            <h3>Enter as Guest</h3>
            <p>Browse competition events, live match scores, schedule &amp; circulars freely.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
