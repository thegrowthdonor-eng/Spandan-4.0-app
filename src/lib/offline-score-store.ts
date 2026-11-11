export type ScoreStatus = "scheduled" | "live" | "paused" | "final" | "cancelled";

export type PreparedFixture = {
  fixtureId: string;
  eventId: string;
  editionId: string;
  eventTitle: string;
  operatingMethod?: "live_matches" | "fixtures_only" | "results_only" | "voting" | "programme";
  stage: string;
  participantALabel: string;
  participantBLabel: string;
  venue: string | null;
  startsAt: string | null;
  actualStartedAt?: string | null;
  scoreTemplate: "cricket" | "football" | "badminton" | "basketball" | "set_based" | "generic";
  scoreProvider: "internal" | "cricheroes";
  externalScoreUrl: string | null;
  serverVersion: number;
  status: ScoreStatus;
  scorePayload: Record<string, unknown>;
  userId: string;
  deviceId: string;
  leaseExpiresAt: string;
};

export type PendingCheckpoint = {
  clientMutationId: string;
  localRevision: number;
  scorePayload: Record<string, unknown>;
  status: ScoreStatus;
  provisional: boolean;
  recordedAt: string;
};

export type OfflineFixtureRecord = {
  id: string;
  fixture: PreparedFixture;
  payload: Record<string, unknown>;
  status: ScoreStatus;
  localRevision: number;
  history: Array<{ payload: Record<string, unknown>; status: ScoreStatus }>;
  pending: PendingCheckpoint | null;
  lastSyncedAt: string | null;
  syncError: string | null;
};

const DB_NAME = "spandan-offline-scorer";
const STORE = "fixtures";

export function scorerDeviceId() {
  const key = "spandan_scorer_device_id";
  let value = localStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); localStorage.setItem(key, value); }
  return value;
}

export async function savePreparedFixture(fixture: PreparedFixture) {
  const saved = await getOfflineFixture(fixture.fixtureId);
  const current = saved?.fixture.userId === fixture.userId ? saved : null;
  const next: OfflineFixtureRecord = current?.pending ? current : {
    id: fixture.fixtureId, fixture, payload: scorerPayload(fixture.scoreTemplate, fixture.scorePayload),
    status: fixture.status, localRevision: current?.localRevision ?? 0, history: current?.history ?? [],
    pending: null, lastSyncedAt: current?.lastSyncedAt ?? new Date().toISOString(), syncError: null,
  };
  next.fixture = fixture;
  await putOfflineFixture(next);
  return next;
}

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline scorer storage is unavailable."));
  });
}

async function transact<T>(mode: IDBTransactionMode, task: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = task(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline scorer storage failed."));
    transaction.oncomplete = () => db.close();
  });
}

export function getOfflineFixture(id: string) {
  return transact<OfflineFixtureRecord | undefined>("readonly", (store) => store.get(id));
}

export function listOfflineFixtures() {
  return transact<OfflineFixtureRecord[]>("readonly", (store) => store.getAll());
}

export function putOfflineFixture(record: OfflineFixtureRecord) {
  return transact<IDBValidKey>("readwrite", (store) => store.put(record));
}

export function removeOfflineFixture(id: string) {
  return transact<undefined>("readwrite", (store) => store.delete(id));
}

export function initialPayload(template: PreparedFixture["scoreTemplate"]) {
  if (template === "cricket") return { teamA_runs: "0", teamA_wickets: "0", teamA_overs: "0.0", teamB_runs: "0", teamB_wickets: "0", teamB_overs: "0.0", innings: "First innings", summary: "" };
  if (template === "football") return { teamA_goals: "0", teamB_goals: "0", period: "First half", clock_seconds: 0, clock_running: false, clock_started_at: null, penalties: "", summary: "" };
  if (template === "basketball") return { teamA_score: "0", teamB_score: "0", quarter: "Q1", teamA_fouls: "0", teamB_fouls: "0", clock_seconds: 600, clock_running: false, clock_started_at: null, summary: "" };
  if (template === "badminton" || template === "set_based") return { teamA_points: "0", teamB_points: "0", sets: [], best_of: 3, winner: "", summary: "" };
  return { teamA_score: "0", teamB_score: "0", round: "", winner: "", summary: "" };
}

export function scorerPayload(template: PreparedFixture["scoreTemplate"], payload: Record<string, unknown>) {
  if (template === "badminton" && typeof payload.set1 === "string") {
    return { ...initialPayload(template), winner: payload.winner ?? "", sets: [payload.set1, payload.set2, payload.set3].filter(value => typeof value === "string" && /^\d{1,3}-\d{1,3}$/.test(value)).map(value => {
      const [teamA, teamB] = String(value).split("-").map(Number);
      return { teamA, teamB };
    }) };
  }
  return { ...initialPayload(template), ...payload };
}
