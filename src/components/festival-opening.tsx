import styles from "./festival-opening.module.css";

const activateOpening = `(() => {
  if (!["/", "/home", "/guest"].includes(window.location.pathname)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  try {
    if (sessionStorage.getItem("spandan-opening")) return;
    sessionStorage.setItem("spandan-opening", "seen");
  } catch {
    return;
  }
  document.getElementById("festival-opening")?.setAttribute("data-playing", "");
})();`;

export function FestivalOpening() {
  return <>
    <div id="festival-opening" className={styles.opening} hidden aria-hidden="true" suppressHydrationWarning>
      <div className={styles.halo} />
      <div className={styles.lockup}>
        <div className={styles.crest} />
        <div className={styles.name}>SPANDAN <span>4.0</span></div>
        <div className={styles.college}>ASMC FIROZABAD</div>
      </div>
    </div>
    {/* Start before hydration so the opening blends into the installed app's launch screen. */}
    <script dangerouslySetInnerHTML={{ __html: activateOpening }} />
  </>;
}
