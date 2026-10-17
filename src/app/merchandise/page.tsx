import Link from "next/link";
import { FestTopNav } from "@/components/spandan-branding";
import "../public-info.css";

export const metadata = {
  title: "Official Merchandise — Spandan 4.0 | ASMC Firozabad",
  description: "Official Spandan 4.0 festival t-shirts, hoodies, and accessories. Offline pickup counter details and sizing guide.",
};

const MERCH_ITEMS = [
  {
    id: "tee-midnight",
    tag: "Official Fest Tee",
    icon: "👕",
    title: "Midnight Edition Fest T-Shirt",
    edition: "Spandan 4.0 Core Edition",
    desc: "Heavyweight 240 GSM combed cotton in Spandan Midnight Ink. Minimal embroidered medical cadence crest on chest, bold typographic year back-print.",
    sizes: "Sizes: S · M · L · XL · XXL",
    availability: "Available at Desk",
    contribution: "₹350 Desk Entry",
    pickup: "Collect from Academic Block Desk"
  },
  {
    id: "tee-coral",
    tag: "Festival Special",
    icon: "✨",
    title: "Coral Sunset Edition T-Shirt",
    edition: "Spandan 4.0 Limited Run",
    desc: "Soft-wash 220 GSM breathable cotton in Spandan Coral. Tailored for sports matches and outdoor festival day events.",
    sizes: "Sizes: S · M · L · XL",
    availability: "Available at Desk",
    contribution: "₹350 Desk Entry",
    pickup: "Collect from Academic Block Desk"
  },
  {
    id: "varsity-hoodie",
    tag: "Winter Heavyweight",
    icon: "🧥",
    title: "ASMC Firozabad Varsity Pullover",
    edition: "Embroidered Winter Fleece",
    desc: "360 GSM fleece-lined pullover hoodie with dual kangaroo pockets, brass drawstring aglets, and high-density collegiate embroidery.",
    sizes: "Sizes: M · L · XL · XXL",
    availability: "Limited Stock",
    contribution: "₹750 Desk Entry",
    pickup: "Collect from Academic Block Desk"
  },
  {
    id: "accessory-pack",
    tag: "Festival Pack",
    icon: "🏷️",
    title: "Silicone Wristband & Metal Enamel Pin",
    edition: "Commemorative Keepsake",
    desc: "Dual-tone embossed silicone wristband with festival motto plus a die-struck brass metal enamel pin with butterfly clutch.",
    sizes: "One Size Universal",
    availability: "Ready in Stock",
    contribution: "₹80 Desk Entry",
    pickup: "Collect from Academic Block Desk"
  }
];

const SIZE_GUIDE = [
  { size: "S (Small)", chest: "38 in (96 cm)", length: "27 in (68 cm)", shoulder: "17 in (43 cm)" },
  { size: "M (Medium)", chest: "40 in (102 cm)", length: "28 in (71 cm)", shoulder: "18 in (46 cm)" },
  { size: "L (Large)", chest: "42 in (107 cm)", length: "29 in (74 cm)", shoulder: "19 in (48 cm)" },
  { size: "XL (X-Large)", chest: "44 in (112 cm)", length: "30 in (76 cm)", shoulder: "20 in (51 cm)" },
  { size: "XXL (2X-Large)", chest: "46 in (117 cm)", length: "31 in (79 cm)", shoulder: "21 in (53 cm)" },
];

// Inventory, prices, desk timings and coordinators need committee approval before public release.
const merchandiseApproved = false;

export default function MerchandisePage() {
  if (!merchandiseApproved) {
    return <main className="public-page"><FestTopNav activePage="merchandise" /><section className="public-hero"><span className="fest-hero-badge">👕 Festival Merchandise</span><h1>Merch details <em>coming soon</em></h1><p>Official items, availability and offline collection instructions will appear here after committee confirmation.</p></section><section className="public-content"><div className="empty-public"><p className="eyebrow">Awaiting confirmation</p><h2>No merchandise information has been published.</h2><p>Please do not rely on unofficial prices, stock messages or collection details shared elsewhere.</p></div></section><footer className="public-footer"><span>ASMC Firozabad · SPANDAN 4.0</span><Link href="/guest">Public festival hub →</Link></footer></main>;
  }
  return (
    <main className="public-page">
      <FestTopNav activePage="merchandise" />

      <section className="public-hero">
        <span className="fest-hero-badge">👕 Official Keepsakes</span>
        <h1>Festival <em>Merchandise</em></h1>
        <p>Official t-shirts, varsity hoodies, and keepsake accessories.</p>
      </section>

      <div className="public-content">
        <div className="public-section-heading">
          <div>
            <p className="eyebrow">Collection 2026</p>
            <h2>Official Festival Line</h2>
          </div>
          <p>
            Inspect items, choose your sizing, and visit the campus collection desk. 
            No online cart or payment gateway is required.
          </p>
        </div>

        {/* Offline Collection Counter Details */}
        <section className="offline-desk-banner" aria-label="Merchandise collection policy">
          <p className="eyebrow" style={{ color: "#e88979" }}>Physical Collection Protocol</p>
          <h3>Student Council Offline Desk</h3>
          <p>
            Per ASMC Firozabad festival finance guidelines (Requirement R22), this application operates strictly 
            without an online payment gateway or cart checkout. All merchandise size trials, collections, 
            and physical ledger entries are conducted in-person.
          </p>

          <div className="desk-details-grid">
            <div className="desk-detail-item">
              <strong>Desk Location</strong>
              <span>Student Council Office, Ground Floor, Academic Complex, ASMC Firozabad</span>
            </div>
            <div className="desk-detail-item">
              <strong>Counter Timings</strong>
              <span>10:00 AM – 5:00 PM (Daily from 17 Nov to 26 Nov 2026)</span>
            </div>
            <div className="desk-detail-item">
              <strong>Desk Coordinators</strong>
              <span>Ankit Sharma (MBBS 2021) &amp; Priya Patel (MBBS 2022)</span>
            </div>
          </div>
        </section>

        {/* Merchandise Grid */}
        <div className="merch-grid">
          {MERCH_ITEMS.map((item) => (
            <article key={item.id} className="merch-card">
              <div className="merch-img-box">
                <span className="merch-tag">{item.tag}</span>
                <span className="merch-icon">{item.icon}</span>
                <strong className="merch-img-label">{item.title}</strong>
                <span className="merch-edition-sub">{item.edition}</span>
              </div>

              <h4 className="merch-title">{item.title}</h4>
              <p className="merch-desc">{item.desc}</p>

              <div className="merch-meta-row">
                <span className="merch-sizes">{item.sizes}</span>
                <span className="merch-availability">{item.availability}</span>
              </div>

              <div className="merch-meta-row" style={{ borderTop: "none", paddingTop: 0 }}>
                <strong style={{ font: "600 14px 'DM Mono', monospace", color: "#261923" }}>
                  {item.contribution}
                </strong>
                <span className="merch-pickup-note">{item.pickup}</span>
              </div>
            </article>
          ))}
        </div>

        {/* Sizing Guide */}
        <section className="size-guide-card">
          <p className="eyebrow">Accurate Fit</p>
          <h3>Garment Sizing Specification</h3>
          <p>
            Measurements are standard unisex chest circumference and body length in inches. Sample garments are available at the collection desk for physical trial before confirmation.
          </p>

          <table className="size-table">
            <thead>
              <tr>
                <th>Size</th>
                <th>Chest Circumference</th>
                <th>Body Length</th>
                <th>Shoulder Width</th>
              </tr>
            </thead>
            <tbody>
              {SIZE_GUIDE.map((row) => (
                <tr key={row.size}>
                  <td><strong>{row.size}</strong></td>
                  <td>{row.chest}</td>
                  <td>{row.length}</td>
                  <td>{row.shoulder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <footer className="public-footer">
        <div>
          <strong>Spandan 4.0</strong> · ASMC Firozabad Official Festival Operating System
        </div>
        <div>
          <Link href="/guest" style={{ color: "inherit", textDecoration: "underline" }}>Guest Portal</Link> · <Link href="/account" style={{ color: "inherit", textDecoration: "underline" }}>Student Sign In</Link>
        </div>
      </footer>
    </main>
  );
}
