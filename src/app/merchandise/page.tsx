import Link from "next/link";
import { FestTopNav } from "@/components/spandan-branding";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createPublicClient } from "@/server/supabase/public";
import "../public-info.css";

export const metadata = {
  title: "Official Merchandise — Spandan 4.0 | ASMC Firozabad",
  description: "Published Spandan 4.0 festival merchandise and offline collection information.",
};

type Merchandise = {
  id: string;
  name: string;
  description: string;
  image_url: string;
  image_alt: string;
  sizes: string[];
  availability_note: string;
  collection_note: string;
  contact_note: string;
};

export default async function MerchandisePage() {
  let items: Merchandise[] = [];
  let unavailable = !hasPublicSupabaseConfiguration();
  if (!unavailable) {
    const { data, error } = await createPublicClient()
      .from("merchandise_items")
      .select("id,name,description,image_url,image_alt,sizes,availability_note,collection_note,contact_note")
      .order("created_at");
    unavailable = Boolean(error);
    items = (data ?? []) as Merchandise[];
  }

  return <main className="public-page">
    <FestTopNav activePage="merchandise" />
    <section className="public-hero"><span className="fest-hero-badge">Festival merchandise</span><h1>Official <em>Merchandise</em></h1><p>Published collection details, availability and physical pickup guidance.</p></section>
    <div className="public-content">
      {items.length ? <>
        <div className="public-section-heading"><div><p className="eyebrow">Published collection</p><h2>Festival line</h2></div><p>There is no online cart or payment gateway. Confirm size and collect through the published offline desk process.</p></div>
        <div className="merch-grid">
          {items.map((item) => <article key={item.id} className="merch-card">
            <div className="merch-img-box"><img src={item.image_url} alt={item.image_alt} /><strong className="merch-img-label">{item.name}</strong></div>
            <h4 className="merch-title">{item.name}</h4><p className="merch-desc">{item.description}</p>
            <div className="merch-meta-row"><span className="merch-sizes">{item.sizes.length ? `Sizes: ${item.sizes.join(" · ")}` : "Size details at the desk"}</span><span className="merch-availability">{item.availability_note}</span></div>
            <p className="merch-pickup-note">{item.collection_note}</p><p className="merch-pickup-note">{item.contact_note}</p>
          </article>)}
        </div>
      </> : <div className="empty-public"><p className="eyebrow">{unavailable ? "Connection pending" : "Awaiting publication"}</p><h2>No merchandise information has been published.</h2><p>{unavailable ? "The public content service is not configured, so unofficial prices and stock are not displayed." : "Please do not rely on unofficial prices, stock messages or collection details shared elsewhere."}</p></div>}
    </div>
    <footer className="public-footer"><span>ASMC Firozabad · SPANDAN 4.0</span><Link href="/guest">Public festival hub →</Link></footer>
  </main>;
}
