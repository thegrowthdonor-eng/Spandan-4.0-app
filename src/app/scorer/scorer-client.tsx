"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getOfflineFixture, initialPayload, listOfflineFixtures, putOfflineFixture, removeOfflineFixture,
  type OfflineFixtureRecord, type PreparedFixture, type ScoreStatus,
} from "@/lib/offline-score-store";
import styles from "./scorer.module.css";

function deviceId() {
  const key = "spandan_scorer_device_id";
  let value = localStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); localStorage.setItem(key, value); }
  return value;
}

function number(payload: Record<string, unknown>, key: string) {
  const value = Number(payload[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function ScoreControl({ label, value, onChange, steps = [1] }: { label: string; value: number; onChange: (value: number) => void; steps?: number[] }) {
  return <section className={styles.teamControl}><h3>{label}</h3><strong className={styles.bigScore}>{value}</strong><div className={styles.scoreButtons}>
    <button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Subtract one from ${label}`}>−1</button>
    {steps.map(step => <button type="button" key={step} onClick={() => onChange(value + step)}>+{step}</button>)}
  </div></section>;
}

function clockValue(payload: Record<string, unknown>, countdown: boolean) {
  const base = number(payload, "clock_seconds");
  if (!payload.clock_running || typeof payload.clock_started_at !== "string") return base;
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(payload.clock_started_at).getTime()) / 1000));
  return countdown ? Math.max(0, base - elapsed) : base + elapsed;
}

export function OfflineScorer() {
  const search = useSearchParams();
  const requestedFixture = search.get("fixture");
  const [record, setRecord] = useState<OfflineFixtureRecord | null>(null);
  const [prepared, setPrepared] = useState<OfflineFixtureRecord[]>([]);
  const [message, setMessage] = useState("Opening offline scorer…");
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [reconciliation, setReconciliation] = useState("");
  const [cricHeroesUrl, setCricHeroesUrl] = useState("");
  const [, setClockTick] = useState(0);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshPrepared = useCallback(async () => {
    const items = await listOfflineFixtures();
    if (!navigator.onLine) { setPrepared(items); return items; }
    try {
      const response = await fetch("/api/admin/fixtures/prepare-offline", { cache: "no-store" });
      const body = await response.json() as { userId?: string };
      const visible = response.ok && body.userId ? items.filter(item => item.fixture.userId === body.userId) : [];
      setPrepared(visible); return visible;
    } catch { setPrepared([]); return []; }
  }, []);

  const prepare = useCallback(async (fixtureId: string) => {
    const local = await getOfflineFixture(fixtureId);
    if (!navigator.onLine) {
      if (local) { setRecord(local); setMessage(local.pending ? "Unsynced score restored from this device." : "Offline scorer ready."); }
      if (!local) setMessage("This fixture was not prepared on this device. Connect once and open it from Fixtures.");
      return;
    }
    const response = await fetch("/api/admin/fixtures/prepare-offline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fixtureId, deviceId: deviceId() }), cache: "no-store" });
    const body = await response.json() as { fixture?: PreparedFixture; error?: string };
    if (!response.ok || !body.fixture) { setMessage(body.error ?? "Unable to prepare this fixture."); return; }
    const saved = await getOfflineFixture(fixtureId);
    const current = saved?.fixture.userId === body.fixture.userId ? saved : null;
    const next: OfflineFixtureRecord = current?.pending ? current : {
      id: fixtureId,
      fixture: body.fixture,
      payload: Object.keys(body.fixture.scorePayload ?? {}).length ? body.fixture.scorePayload : initialPayload(body.fixture.scoreTemplate),
      status: body.fixture.status,
      localRevision: current?.localRevision ?? 0,
      history: current?.history ?? [],
      pending: null,
      lastSyncedAt: current?.lastSyncedAt ?? new Date().toISOString(),
      syncError: null,
    };
    next.fixture = body.fixture;
    await putOfflineFixture(next);
    setRecord(next);
    await refreshPrepared();
    setMessage("Prepared and saved on this device. Airplane-mode scoring is ready.");
    if (navigator.storage?.persist) setPersistent(await navigator.storage.persist());
  }, [refreshPrepared]);

  useEffect(() => {
    const initial = setTimeout(() => {
      if (requestedFixture) void prepare(requestedFixture);
      else void refreshPrepared().then(items => { if (items.length === 1) setRecord(items[0]); setMessage(items.length ? "Choose a prepared fixture." : "Open a fixture from the organiser workspace to prepare this device."); });
    }, 0);
    return () => clearTimeout(initial);
  }, [prepare, refreshPrepared, requestedFixture]);

  const sync = useCallback(async () => {
    const current = record ? await getOfflineFixture(record.id) : null;
    if (!current?.pending || !navigator.onLine || syncing) return;
    setSyncing(true);
    try {
      const response = await fetch("/api/admin/fixtures/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        fixtureId: current.id, deviceId: current.fixture.deviceId, baseVersion: current.fixture.serverVersion, checkpoints: [current.pending],
      }), cache: "no-store" });
      const body = await response.json() as { version?: number; error?: string; conflict?: boolean; leaseRevoked?: boolean };
      if (!response.ok || typeof body.version !== "number") {
        current.syncError = body.error ?? "Sync failed; the local score is safe.";
        if (body.leaseRevoked || body.conflict) setReconciliation(current.syncError);
        await putOfflineFixture(current); setRecord({ ...current }); setMessage(current.syncError); return;
      }
      const latest = await getOfflineFixture(current.id) ?? current;
      latest.fixture.serverVersion = body.version;
      if (latest.pending?.clientMutationId === current.pending.clientMutationId) latest.pending = null;
      latest.lastSyncedAt = new Date().toISOString();
      latest.syncError = null;
      await putOfflineFixture(latest); setRecord({ ...latest });
      setMessage(latest.pending ? "Earlier checkpoint synced; newer device changes remain queued." : latest.fixture.scoreTemplate === "cricket" ? "Synced privately. Reconcile with CricHeroes before publishing." : "Synced to Live Ground.");
    } catch {
      setMessage("Network unavailable. Score remains saved on this device.");
    } finally { setSyncing(false); }
  }, [record, syncing]);

  useEffect(() => {
    const connectivity = () => { setOnline(navigator.onLine); if (navigator.onLine) void sync(); };
    const visible = () => { if (document.visibilityState === "visible" && navigator.onLine) void sync(); };
    const workerMessage = (event: MessageEvent) => { if (event.data?.type === "SPANDAN_SYNC_SCORES") void sync(); };
    window.addEventListener("online", connectivity); window.addEventListener("offline", connectivity); document.addEventListener("visibilitychange", visible); navigator.serviceWorker?.addEventListener("message", workerMessage);
    return () => { window.removeEventListener("online", connectivity); window.removeEventListener("offline", connectivity); document.removeEventListener("visibilitychange", visible); navigator.serviceWorker?.removeEventListener("message", workerMessage); };
  }, [sync]);

  useEffect(() => {
    if (!record?.payload.clock_running) return;
    const timer = setInterval(() => setClockTick(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [record?.payload.clock_running]);

  const commit = useCallback(async (payload: Record<string, unknown>, status = record?.status ?? "live", immediate = false) => {
    if (!record) return;
    const latest = await getOfflineFixture(record.id) ?? record;
    const nextRevision = latest.localRevision + 1;
    const next: OfflineFixtureRecord = {
      ...latest, payload, status, localRevision: nextRevision,
      history: [{ payload: latest.payload, status: latest.status }, ...latest.history].slice(0, 30),
      pending: { clientMutationId: crypto.randomUUID(), localRevision: nextRevision, scorePayload: payload, status,
        provisional: latest.fixture.scoreTemplate === "cricket", recordedAt: new Date().toISOString() },
      syncError: null,
    };
    await putOfflineFixture(next); setRecord(next); setMessage(navigator.onLine ? "Saved on this device; sync queued." : "Saved on this device. Waiting for internet.");
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready.then(registration => {
        const withSync = registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } };
        return withSync.sync?.register("spandan-score-sync");
      }).catch(() => undefined);
    }
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void sync(), immediate ? 0 : 10_000);
  }, [record, sync]);

  async function undo() {
    if (!record?.history.length) return;
    const [previous, ...rest] = record.history;
    const nextRevision = record.localRevision + 1;
    const next: OfflineFixtureRecord = { ...record, payload: previous.payload, status: previous.status, history: rest, localRevision: nextRevision,
      pending: { clientMutationId: crypto.randomUUID(), localRevision: nextRevision, scorePayload: previous.payload, status: previous.status,
        provisional: record.fixture.scoreTemplate === "cricket", recordedAt: new Date().toISOString() }, syncError: null };
    await putOfflineFixture(next); setRecord(next); setMessage("Previous local score restored; sync queued.");
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void sync(), 0);
  }

  function exportRecovery() {
    if (!record) return;
    const blob = new Blob([JSON.stringify({ format: "spandan-offline-score-v1", exportedAt: new Date().toISOString(), record }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `spandan-score-${record.id}.json`; link.click(); URL.revokeObjectURL(url);
  }

  async function importRecovery(file: File) {
    if (!navigator.onLine) { setMessage("Connect and sign in before importing a recovery file."); return; }
    if (file.size > 1_000_000) { setMessage("Recovery file is too large."); return; }
    try {
      const saved = JSON.parse(await file.text()) as { format?: string; record?: OfflineFixtureRecord };
      if (saved.format !== "spandan-offline-score-v1" || !saved.record?.id || !saved.record.payload || typeof saved.record.localRevision !== "number") throw new Error();
      const response = await fetch("/api/admin/fixtures/prepare-offline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fixtureId: saved.record.id, deviceId: deviceId() }), cache: "no-store" });
      const body = await response.json() as { fixture?: PreparedFixture; error?: string };
      if (!response.ok || !body.fixture) { setMessage(body.error ?? "This signed-in account cannot restore that fixture."); return; }
      const restored: OfflineFixtureRecord = { ...saved.record, id: body.fixture.fixtureId, fixture: body.fixture, syncError: null };
      await putOfflineFixture(restored); setRecord(restored); await refreshPrepared();
      setMessage("Recovery restored after authorisation. Review the score, then sync.");
    } catch { setMessage("That is not a valid Spandan score recovery file."); }
  }

  async function release() {
    if (!record || record.pending || !navigator.onLine) { setMessage("Sync or export pending scores before releasing this device."); return; }
    const response = await fetch("/api/admin/fixtures/release-device", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fixtureId: record.id, deviceId: record.fixture.deviceId, force: false }) });
    if (!response.ok) { setMessage("Unable to release this scorer."); return; }
    await removeOfflineFixture(record.id); setRecord(null); await refreshPrepared(); setMessage("Device released. Another authorised scorer can now prepare this fixture.");
  }

  async function reconcileCricket() {
    if (!record || record.fixture.scoreTemplate !== "cricket" || record.pending) { setMessage("Sync the device score before reconciliation."); return; }
    try {
      const response = await fetch("/api/admin/fixtures/reconcile-cricket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fixtureId: record.id, url: cricHeroesUrl }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) { setMessage(body.error ?? "Unable to reconcile cricket score."); return; }
      const next = { ...record, fixture: { ...record.fixture, scoreProvider: "cricheroes" as const, externalScoreUrl: cricHeroesUrl } };
      await putOfflineFixture(next); setRecord(next); setMessage("Reconciled. The score and official CricHeroes link are now public.");
    } catch { setMessage("Network unavailable. Reconciliation was not published."); }
  }

  if (!record) return <section className={styles.empty}><h1>Offline scorer</h1><p>{message}</p>{prepared.map(item => <button key={item.id} onClick={() => setRecord(item)}>{item.fixture.participantALabel} vs {item.fixture.participantBLabel}</button>)}<label className={styles.importButton}>Import authorised recovery<input type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) void importRecovery(file); }} /></label></section>;
  if (reconciliation) return <section className={styles.empty}><h1>Scorer transfer detected</h1><p>{reconciliation}</p><p>This device will not overwrite the replacement scorer. Download its recovery copy for an administrator to reconcile.</p><button type="button" onClick={exportRecovery}>Download recovery copy</button></section>;

  const f = record.fixture; const p = record.payload;
  const change = (key: string, value: unknown) => void commit({ ...p, [key]: value });
  return <div className={styles.console}>
    <section className={`${styles.connection} ${online ? styles.online : styles.offline}`} role="status">
      <strong>{online ? "Online" : "Offline — scoring continues"}</strong><span>{record.pending ? "1 local checkpoint waiting" : "All changes synced"}</span>
    </section>
    {persistent === false && <p className={styles.warning}>Persistent storage was not granted. Keep this installed app on the device and download a recovery copy.</p>}
    <header className={styles.matchHeader}><div><p>{f.eventTitle} · {f.stage}</p><h1>{f.participantALabel} <span>vs</span> {f.participantBLabel}</h1><small>{f.venue ?? "Venue to be confirmed"}</small></div><div className={styles.syncState}><b>Local r{record.localRevision}</b><span>Server v{f.serverVersion}</span></div></header>

    <div className={styles.statusRow}>
      <label>Status <select value={record.status} onChange={event => void commit(p, event.target.value as ScoreStatus, true)}><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="paused">Paused</option><option value="final">Final</option><option value="cancelled">Cancelled</option></select></label>
      <button type="button" onClick={() => void undo()} disabled={!record.history.length}>Undo</button>
      <button type="button" onClick={() => void sync()} disabled={!record.pending || !online || syncing}>{syncing ? "Syncing…" : "Sync now"}</button>
    </div>

    {f.scoreTemplate === "cricket" && <><label className={styles.innings}>Innings<select value={String(p.innings ?? "First innings")} onChange={event => change("innings", event.target.value)}><option>First innings</option><option>Second innings</option></select></label><div className={styles.cricketGrid}>{["A","B"].map(side => <section key={side} className={styles.teamControl}><h3>{side === "A" ? f.participantALabel : f.participantBLabel}</h3><div className={styles.fieldRow}><label>Runs<input inputMode="numeric" value={String(p[`team${side}_runs`] ?? 0)} onChange={e => change(`team${side}_runs`, e.target.value)} /></label><label>Wickets<input inputMode="numeric" value={String(p[`team${side}_wickets`] ?? 0)} onChange={e => change(`team${side}_wickets`, e.target.value)} /></label><label>Overs<input inputMode="decimal" value={String(p[`team${side}_overs`] ?? "0.0")} onChange={e => change(`team${side}_overs`, e.target.value)} /></label></div></section>)}</div></>}
    {f.scoreTemplate === "football" && <div className={styles.scoreGrid}><ScoreControl label={f.participantALabel} value={number(p,"teamA_goals")} onChange={v => change("teamA_goals",String(v))}/><ScoreControl label={f.participantBLabel} value={number(p,"teamB_goals")} onChange={v => change("teamB_goals",String(v))}/></div>}
    {f.scoreTemplate === "basketball" && <div className={styles.scoreGrid}><ScoreControl label={f.participantALabel} value={number(p,"teamA_score")} steps={[1,2,3]} onChange={v => change("teamA_score",String(v))}/><ScoreControl label={f.participantBLabel} value={number(p,"teamB_score")} steps={[1,2,3]} onChange={v => change("teamB_score",String(v))}/></div>}
    {(f.scoreTemplate === "football" || f.scoreTemplate === "basketball") && <ClockControl payload={p} countdown={f.scoreTemplate === "basketball"} commit={payload => void commit(payload, record.status, true)} />}
    {(f.scoreTemplate === "badminton" || f.scoreTemplate === "set_based") && <><div className={styles.scoreGrid}><ScoreControl label={f.participantALabel} value={number(p,"teamA_points")} onChange={v => change("teamA_points",String(v))}/><ScoreControl label={f.participantBLabel} value={number(p,"teamB_points")} onChange={v => change("teamB_points",String(v))}/></div><button className={styles.finishSet} type="button" onClick={() => void commit({ ...p, sets: [...(Array.isArray(p.sets) ? p.sets : []), { teamA:number(p,"teamA_points"),teamB:number(p,"teamB_points") }], teamA_points:"0",teamB_points:"0" }, record.status, true)}>Finish current set</button></>}
    {f.scoreTemplate === "generic" && <div className={styles.scoreGrid}><ScoreControl label={f.participantALabel} value={number(p,"teamA_score")} onChange={v => change("teamA_score",String(v))}/><ScoreControl label={f.participantBLabel} value={number(p,"teamB_score")} onChange={v => change("teamB_score",String(v))}/></div>}

    <label className={styles.summary}>Ground update / outcome<textarea maxLength={500} value={String(p.summary ?? "")} onChange={e => change("summary",e.target.value)} placeholder="Short public match update" /></label>
    {f.scoreTemplate === "cricket" && <div className={styles.providerNote}><p>CricHeroes is the official cricket source. Offline scores stay private until this device score is checked against the official scorecard.</p><div className={styles.providerForm}><input type="url" value={cricHeroesUrl} onChange={event => setCricHeroesUrl(event.target.value)} placeholder="https://cricheroes.com/…"/><button type="button" disabled={Boolean(record.pending) || !online || !cricHeroesUrl} onClick={() => void reconcileCricket()}>Reconciled &amp; publish</button></div></div>}
    <footer className={styles.actions}><button type="button" onClick={exportRecovery}>Download recovery copy</button><label className={styles.importButton}>Import recovery<input type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) void importRecovery(file); }} /></label><button type="button" onClick={() => void release()}>Release this device</button></footer>
    <p className={styles.message} aria-live="polite">{message}</p>
  </div>;
}

function ClockControl({ payload, countdown, commit }: { payload: Record<string, unknown>; countdown: boolean; commit: (payload: Record<string, unknown>) => void }) {
  const seconds = clockValue(payload, countdown);
  const running = payload.clock_running === true;
  const update = (nextSeconds: number, nextRunning = running) => commit({ ...payload, clock_seconds: Math.max(0, nextSeconds), clock_running: nextRunning, clock_started_at: nextRunning ? new Date().toISOString() : null });
  return <section className={styles.clock}><p>{countdown ? "Game clock" : "Match clock"}</p><strong>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</strong><div><button type="button" onClick={() => update(seconds, !running)}>{running ? "Pause" : "Start"}</button><button type="button" onClick={() => update(seconds - 60)}>−1 min</button><button type="button" onClick={() => update(seconds + 60)}>+1 min</button></div></section>;
}
