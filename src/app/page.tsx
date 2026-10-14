const pillars = [
  ["01", "Explore", "Published event information stays open to everyone."],
  ["02", "Participate", "A verified contribution unlocks individual applications."],
  ["03", "Follow", "Fixtures, scores and final batch standings in one place."],
];

const categories = ["Sports", "Performing arts", "Literary", "Creative"];

export default function Home() {
  return (
    <main>
      <nav className="nav" aria-label="Primary navigation">
        <a className="wordmark" href="#top" aria-label="SPANDAN 4.0 home">Spandan <span>4.0</span></a>
        <div className="nav-links"><a href="#experience">Experience</a><a href="#notice">Notice</a><a href="#account">My Fest</a></div>
        <a className="nav-cta" href="/account">Sign in <span aria-hidden>↗</span></a>
      </nav>

      <section id="top" className="hero" aria-labelledby="hero-title">
        <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
        <p className="eyebrow">GMC Firozabad · Festival edition</p>
        <h1 id="hero-title">A pulse of<br /><em>possibility.</em></h1>
        <p className="hero-copy">SPANDAN brings sports, culture and campus spirit together. Explore what is confirmed, then make your mark when registrations open.</p>
        <div className="hero-actions"><a className="button button-light" href="#experience">Explore the fest <span>↓</span></a><a className="text-link" href="#notice">Read the latest notice <span>→</span></a></div>
        <div className="hero-meta"><span>Official programme dates<br /><strong>To be confirmed</strong></span><span>Built for<br /><strong>GMC Firozabad</strong></span></div>
      </section>

      <section id="notice" className="notice" aria-label="Current notice"><p><span className="dot" /> Planning update</p><strong>Festival dates, event rules and registrations will be published by the organising committee.</strong><a href="#experience">What to expect →</a></section>

      <section id="experience" className="section intro">
        <div><p className="eyebrow ink">The festival, thoughtfully organised</p><h2>One space for every <em>moment.</em></h2></div>
        <p className="body-copy">From first discovery to final results, SPANDAN is designed to make the festival easier to follow, fairer to enter and more memorable to share.</p>
      </section>

      <section className="pillars section" aria-label="Festival features">
        {pillars.map(([number, title, copy]) => <article className="pillar" key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p><a href="#account" aria-label={`Learn more about ${title}`}>→</a></article>)}
      </section>

      <section className="showcase">
        <div className="section showcase-grid"><div><p className="eyebrow">A place to show up</p><h2>Find your<br /><em>stage.</em></h2><p>Browse categories, read rules and keep up with the moments that move campus.</p></div><div className="categories">{categories.map((category, index) => <button type="button" key={category}><span>0{index + 1}</span>{category}<b>↗</b></button>)}</div></div>
      </section>

      <section id="account" className="account section"><div><p className="eyebrow ink">Your SPANDAN space</p><h2>Ready when<br />you <em>are.</em></h2><p>Students sign in with batch, roll number and password. Contribution verification happens outside the app — there is no online payment or checkout.</p></div><div className="account-card"><p className="eyebrow">Account access</p><h3>Registration opens after activation.</h3><p>Already verified? Your applications, selection updates and personal schedule will live here.</p><a className="account-button" href="/account">View account access</a><small>This is a planning preview, not a live registration system.</small></div></section>

      <footer><a className="wordmark" href="#top">Spandan <span>4.0</span></a><p>GMC Firozabad · A festival platform in preparation</p><a href="#notice">Back to top ↑</a></footer>
    </main>
  );
}
