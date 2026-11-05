import { FestTopNav } from "@/components/spandan-branding";
import { LiveGroundClient } from "./live-ground-client";
import "../public-info.css";

export const metadata = { title: "Live Ground | SPANDAN 4.0", description: "Live scores, current programmes and upcoming calls from the SPANDAN 4.0 ground desk." };

export default function LivePage() {
  return <main className="public-page"><FestTopNav activePage="live"/><section className="public-hero"><p className="eyebrow">Live Ground</p><h1>Every court. Every stage. Right now.</h1><p>Official coordinator updates, offline-safe scoring and CricHeroes links for cricket.</p></section><section className="public-content"><LiveGroundClient/></section></main>;
}
