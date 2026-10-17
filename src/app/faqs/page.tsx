import Link from "next/link";
import { FestTopNav } from "@/components/spandan-branding";
import "../public-info.css";

export const dynamic = "force-dynamic";

const faqSections = [
  {
    category: "Registration & Account Activation",
    questions: [
      {
        q: "How do I register for Spandan 4.0?",
        a: "Create your student account using your official MBBS Batch and Roll Number. After submitting the sign-up form, submit your offline fest contribution to your batch representative or the treasury desk. Once verified against the physical ledger, your account will be activated.",
      },
      {
        q: "Why do I see 'Activation Pending' when I sign in?",
        a: "To prevent unverified accounts and proxy entries, every student registration must be reconciled with the physical cash/bank ledger reference by the Treasury. Please contact your batch representative with your Fest ID.",
      },
      {
        q: "I forgot my password. Can I reset it?",
        a: "Yes. In line with festival privacy guidelines, password resets are handled via one-time Recovery Tokens issued in person at the Registration Desk upon verifying your college ID card.",
      },
    ],
  },
  {
    category: "Competitions & Participation",
    questions: [
      {
        q: "What is the difference between Application Approval and Selection?",
        a: "Approval confirms you meet eligibility requirements and submitted valid responses. For group events and sports squads, final selection happens when squads are officially composed and published by the Event Head. For solo events, selection is finalized separately before roster lock.",
      },
      {
        q: "Can I participate in multiple events?",
        a: "Yes, provided the fixture timings do not clash. Please review the official schedule before applying. If a clash occurs, you may withdraw your application before the roster lock.",
      },
      {
        q: "When does the roster lock take effect?",
        a: "Each event has an announced roster lock timestamp. After roster lock, applications and squad compositions cannot be altered without written sanction from the Main Admin.",
      },
    ],
  },
  {
    category: "Scoring, Standings & Protests",
    questions: [
      {
        q: "How are batch standing points calculated?",
        a: "Batch points are calculated strictly from published official positions (e.g. 1st = 10 pts, 2nd = 7 pts, 3rd = 5 pts). Points cannot be manually altered without publishing an audited results correction.",
      },
      {
        q: "What if there is a score discrepancy or dispute?",
        a: "Team captains or batch representatives should submit an official grievance to the Event Head or through the in-app Help Desk within the published event grievance window. If upheld, a corrected score snapshot or result publication will be released with an audited change reason.",
      },
    ],
  },
];

export default function FaqsPage() {
  return (
    <main className="public-page">
      <FestTopNav activePage="faqs" />

      <section className="public-hero">
        <span className="fest-hero-badge">💡 Helpdesk</span>
        <h1>Rules &amp; <em>FAQs</em></h1>
        <p>Registration, batch eligibility, event rules, and grievance guidelines.</p>
      </section>

      <section className="public-content">
        <div className="faqs-container">
          {faqSections.map((sec) => (
            <div key={sec.category} className="faq-section-block">
              <h2 className="faq-section-title">{sec.category}</h2>
              <div className="faq-accordion-list">
                {sec.questions.map((item, idx) => (
                  <details key={idx} className="faq-item">
                    <summary className="faq-question">
                      <span>{item.q}</span>
                      <span className="faq-chevron" aria-hidden>+</span>
                    </summary>
                    <div className="faq-answer">
                      <p>{item.a}</p>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ))}

          <div className="faq-help-box">
            <h3>Still have questions or need assistance?</h3>
            <p>
              Signed-in students can open an official support ticket directly from their dashboard. Our committee is here
              to ensure every scholar has an uninterrupted festival experience.
            </p>
            <Link href="/my-fest" className="cta-link-btn">
              Go to My Fest Support Desk →
            </Link>
          </div>
        </div>
      </section>

      <footer className="public-footer">
        <span>ASMC Firozabad · SPANDAN 4.0</span>
        <Link href="/my-fest">Go to My Fest →</Link>
      </footer>
    </main>
  );
}
