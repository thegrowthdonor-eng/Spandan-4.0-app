import Link from "next/link";
import { eventCategoryLabel } from "@/lib/event-categories";
import { placingLabel, resultIdentity, type PublishedEventResult } from "@/lib/results";

export function PodiumCard({ result }: { result: PublishedEventResult }) {
  return <div className="podium-card">
    {result.podium_photo_url ? <div className="podium-card-image-box">
      <span className="podium-card-category">{eventCategoryLabel(result.category)}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={result.podium_photo_url} alt={`${result.event_title} winners celebrating`} loading="lazy" decoding="async" />
    </div> : <div className="podium-card-image-box podium-card-placeholder">
      <span className="podium-card-category">{eventCategoryLabel(result.category)}</span>
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true"><path d="M42 22h36v16c0 16-8 28-18 31-10-3-18-15-18-31V22Z" fill="#f1d89b" stroke="#735c35" strokeWidth="3"/><path d="M42 31H27c0 18 8 28 22 29M78 31h15c0 18-8 28-22 29M60 69v16m-17 12h34M49 85h22v12H49z" stroke="#735c35" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="m60 31 3.8 7.6 8.4 1.2-6.1 5.9 1.4 8.3-7.5-3.9-7.5 3.9 1.4-8.3-6.1-5.9 8.4-1.2L60 31Z" fill="#c68163"/></svg>
      <span>Official podium</span>
    </div>}
    <div className="podium-card-body">
      <div className="podium-card-heading"><span>Official result</span><h3 className="podium-card-title">{result.event_title}</h3></div>
      {result.podium_caption && <p className="podium-card-caption">✦ {result.podium_caption}</p>}
      {result.positions.length > 0 && <div className="podium-card-placings">{result.positions.map((position) => {
        const identity = resultIdentity(position);
        return <div key={position.placing} className={`podium-place-row place-${Math.min(position.placing, 4)}`}><span className="podium-place-rank">{placingLabel(position.placing)}</span><span className="podium-winner"><strong>{identity.primary}</strong><small>{identity.secondary}</small></span>{position.points > 0 && <span className="result-points">+{position.points}</span>}</div>;
      })}</div>}
      {result.event_slug && <Link className="podium-view-event" href={`/events/${result.event_slug}`}>View event details <span aria-hidden="true">→</span></Link>}
    </div>
  </div>;
}
