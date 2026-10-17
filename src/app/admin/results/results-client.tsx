"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImageUploadWidget } from "@/components/admin/image-upload-widget";

export type PointRule = {
  placing: number;
  points: number;
};

export type EligibleBatch = {
  batch_id: string;
  label: string;
  course_label: string | null;
};

export type ResultPublication = {
  publication_id: string;
  version: number;
  state: string;
  reason: string | null;
  published_by_name: string | null;
  published_at: string;
  podium_photo_url?: string | null;
  podium_caption?: string | null;
  positions: Array<{
    placing: number;
    batch_id: string | null;
    batch_label: string;
    winner_name?: string | null;
    participant_category?: string | null;
    application_id?: string | null;
    group_id?: string | null;
    points: number;
    note: string | null;
  }>;
};

export type ResultParticipant = {
  target_id: string;
  target_kind: "application" | "group";
  label: string;
  category: string;
  batch_id: string | null;
};

type EventMeta = {
  id: string;
  title: string;
  category: string;
  format: string;
};

export function ResultsClient({
  event,
  batches,
  pointRules,
  results,
  participants = [],
  isMainAdmin,
}: {
  event: EventMeta;
  batches: EligibleBatch[];
  pointRules: PointRule[];
  results: ResultPublication[];
  participants?: ResultParticipant[];
  isMainAdmin: boolean;
}) {
  const router = useRouter();

  // Point rules editing state
  const [rules, setRules] = useState<PointRule[]>(
    pointRules.length > 0
      ? pointRules
      : [
          { placing: 1, points: 10 },
          { placing: 2, points: 7 },
          { placing: 3, points: 5 },
        ]
  );
  const [rulesPending, setRulesPending] = useState(false);

  // Result publication form state
  const currentPublished = results.find((r) => r.state === "published");
  const isCorrection = Boolean(currentPublished);

  const defaultTarget = (idx: number) => {
    if (participants[idx]) return `${participants[idx].target_kind}:${participants[idx].target_id}`;
    if (batches[idx]) return `batch:${batches[idx].batch_id}`;
    return "";
  };

  const [positions, setPositions] = useState<Array<{ placing: number; targetKey: string; note: string }>>(
    currentPublished && currentPublished.positions.length > 0
      ? currentPublished.positions.map((p) => ({
          placing: p.placing,
          targetKey: p.application_id
            ? `application:${p.application_id}`
            : p.group_id
            ? `group:${p.group_id}`
            : p.batch_id
            ? `batch:${p.batch_id}`
            : "",
          note: p.note ?? "",
        }))
      : [
          { placing: 1, targetKey: defaultTarget(0), note: "" },
          { placing: 2, targetKey: defaultTarget(1), note: "" },
          { placing: 3, targetKey: defaultTarget(2), note: "" },
        ]
  );
  const [podiumPhotoUrl, setPodiumPhotoUrl] = useState(currentPublished?.podium_photo_url ?? "");
  const [podiumCaption, setPodiumCaption] = useState(currentPublished?.podium_caption ?? "");
  const [publishReason, setPublishReason] = useState("");
  const [publishPending, setPublishPending] = useState(false);

  // Status message
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Add placing row
  function addPositionRow() {
    const nextPlace = positions.length + 1;
    setPositions([...positions, { placing: nextPlace, targetKey: defaultTarget(positions.length), note: "" }]);
  }

  // Remove placing row
  function removePositionRow(index: number) {
    if (positions.length <= 1) return;
    const next = positions.filter((_, i) => i !== index).map((pos, idx) => ({ ...pos, placing: idx + 1 }));
    setPositions(next);
  }

  // Add point rule row
  function addRuleRow() {
    const nextPlace = rules.length + 1;
    setRules([...rules, { placing: nextPlace, points: 1 }]);
  }

  function removeRuleRow(index: number) {
    if (rules.length <= 1) return;
    const next = rules.filter((_, i) => i !== index).map((r, idx) => ({ ...r, placing: idx + 1 }));
    setRules(next);
  }

  // Save point rules
  async function handleSavePointRules(e: React.FormEvent) {
    e.preventDefault();
    if (rulesPending) return;
    setRulesPending(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setPointRules",
          eventId: event.id,
          rules,
        }),
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setStatusMessage({ text: "Point rules successfully saved." });
        router.refresh();
      } else {
        setStatusMessage({ text: data.error ?? "Failed to save point rules.", isError: true });
      }
    } catch {
      setStatusMessage({ text: "Network error saving point rules.", isError: true });
    } finally {
      setRulesPending(false);
    }
  }

  // Publish / Correct Results
  async function handlePublishResults(e: React.FormEvent) {
    e.preventDefault();
    if (publishPending) return;

    if (isCorrection && !publishReason.trim()) {
      setStatusMessage({ text: "A correction reason is required when re-publishing results.", isError: true });
      return;
    }

    // Check for duplicate winners in placements
    const usedWinners = new Set<string>();
    for (const pos of positions) {
      if (!pos.targetKey) {
        setStatusMessage({ text: `Choose a winner for placing #${pos.placing}.`, isError: true });
        return;
      }
      if (usedWinners.has(pos.targetKey)) {
        setStatusMessage({ text: "Each placing must be awarded to a distinct participant, team, or batch.", isError: true });
        return;
      }
      usedWinners.add(pos.targetKey);
    }

    // Check that point rules exist for each placing
    const rulePlacings = new Set(rules.map((r) => r.placing));
    for (const pos of positions) {
      if (!rulePlacings.has(pos.placing)) {
        setStatusMessage({
          text: `Point rules are not configured for placing #${pos.placing}. Save point rules first.`,
          isError: true,
        });
        return;
      }
    }

    setPublishPending(true);
    setStatusMessage(null);
    try {
      const payloadPositions = positions.map((p) => {
        const [kind, id] = p.targetKey.includes(":") ? p.targetKey.split(":") : ["batch", p.targetKey];
        return {
          placing: p.placing,
          applicationId: kind === "application" ? id : undefined,
          groupId: kind === "group" ? id : undefined,
          batchId: kind === "batch" ? id : undefined,
          note: p.note.trim() || undefined,
        };
      });

      const res = await fetch("/api/admin/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish",
          eventId: event.id,
          positions: payloadPositions,
          reason: publishReason.trim() || undefined,
          podiumPhotoUrl: podiumPhotoUrl.trim() || undefined,
          podiumCaption: podiumCaption.trim() || undefined,
        }),
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setStatusMessage({
          text: isCorrection
            ? "Results correction published successfully. Standings board updated."
            : "Official results published successfully! Standings board updated.",
        });
        setPublishReason("");
        router.refresh();
      } else {
        setStatusMessage({ text: data.error ?? "Failed to publish results.", isError: true });
      }
    } catch {
      setStatusMessage({ text: "Network error publishing results.", isError: true });
    } finally {
      setPublishPending(false);
    }
  }

  return (
    <div className="results-workspace">
      {/* Top Bar Navigation */}
      <div className="review-top-bar">
        <div className="review-links">
          <Link className="workspace-sublink" href={`/admin/fixtures?event=${event.id}`}>
            ← Fixtures & Scores
          </Link>
          <Link className="workspace-sublink" href={`/admin/review?event=${event.id}`}>
            Review Queue →
          </Link>
          <Link className="workspace-sublink" href="/standings" target="_blank">
            Live Public Standings ↗
          </Link>
        </div>
      </div>

      {statusMessage && (
        <div className={`status-banner ${statusMessage.isError ? "error" : "success"}`} role="status">
          {statusMessage.text}
        </div>
      )}

      <div className="results-grid">
        {/* LEFT COLUMN: Point Rules Configuration */}
        <section className="results-panel point-rules-panel">
          <div className="panel-header">
            <h2>Point Rules Configuration</h2>
            <span className="panel-subtitle">Mandatory points per finish</span>
          </div>

          <form onSubmit={handleSavePointRules} className="point-rules-form">
            <p className="rules-note">
              Points are credited to the batch leaderboard when official results are published. Every placing in the final
              lineup must have configured points.
            </p>

            <div className="point-rules-list">
              {rules.map((rule, idx) => (
                <div key={idx} className="rule-row">
                  <span className="placing-badge">#{rule.placing}</span>
                  <label className="points-input-label">
                    Points:
                    <input
                      type="number"
                      min={0}
                      value={rule.points}
                      disabled={rulesPending || !isMainAdmin}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setRules(rules.map((r, i) => (i === idx ? { ...r, points: isNaN(val) ? 0 : val } : r)));
                      }}
                    />
                  </label>
                  {isMainAdmin && rules.length > 1 && (
                    <button
                      type="button"
                      className="remove-btn"
                      onClick={() => removeRuleRow(idx)}
                      disabled={rulesPending}
                      title="Remove placing"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {isMainAdmin && (
              <div className="rules-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={addRuleRow}
                  disabled={rulesPending}
                >
                  + Add Placing Rule
                </button>
                <button type="submit" className="primary-btn" disabled={rulesPending}>
                  {rulesPending ? "Saving Rules…" : "Save Point Rules"}
                </button>
              </div>
            )}
            {!isMainAdmin && (
              <p className="admin-only-note">Point rules can only be modified by the Main Admin.</p>
            )}
          </form>
        </section>

        {/* RIGHT COLUMN: Official Result Publication */}
        <section className="results-panel publish-panel">
          <div className="panel-header">
            <h2>
              {isCorrection ? "Official Results (Published v" + currentPublished?.version + ")" : "Publish Official Results"}
            </h2>
            <span className="panel-subtitle">Final batch podium & points award</span>
          </div>

          {isCorrection && currentPublished && (
            <div className="correction-warning">
              ⚠️ Official results are currently published. Submitting this form will supersede the previous result and
              bump the version to <strong>v{currentPublished.version + 1}</strong>. A reason is mandatory.
            </div>
          )}

          <form onSubmit={handlePublishResults} className="publish-form">
            <div className="positions-list">
              {positions.map((pos, idx) => (
                <div key={idx} className="position-card">
                  <div className="position-place-col">
                    <span className="medal-icon">
                      {pos.placing === 1 ? "🥇 1st" : pos.placing === 2 ? "🥈 2nd" : pos.placing === 3 ? "🥉 3rd" : `#${pos.placing}`}
                    </span>
                    <span className="award-points">
                      ({rules.find((r) => r.placing === pos.placing)?.points ?? 0} pts)
                    </span>
                  </div>

                  <div className="position-inputs">
                    <label>
                      Winner (Participant, Team, or Batch)
                      <select
                        value={pos.targetKey}
                        onChange={(e) =>
                          setPositions(
                            positions.map((p, i) => (i === idx ? { ...p, targetKey: e.target.value } : p))
                          )
                        }
                        className="batch-select"
                        required
                      >
                        <option value="">Select Winner</option>
                        {participants.length > 0 && (
                          <optgroup label="Selected Participants / Teams">
                            {participants.map((item) => (
                              <option key={item.target_id} value={`${item.target_kind}:${item.target_id}`}>
                                {item.label} ({item.category.toUpperCase()})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Batches (General)">
                          {batches.map((b) => (
                            <option key={b.batch_id} value={`batch:${b.batch_id}`}>
                              Batch {b.label}
                              {b.course_label ? ` (${b.course_label})` : ""}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </label>

                    <label>
                      Note / Description (Optional)
                      <input
                        type="text"
                        maxLength={500}
                        value={pos.note}
                        onChange={(e) =>
                          setPositions(positions.map((p, i) => (i === idx ? { ...p, note: e.target.value } : p)))
                        }
                        placeholder="e.g. Winner of 5-set final thriller"
                      />
                    </label>
                  </div>

                  {positions.length > 1 && (
                    <button
                      type="button"
                      className="remove-btn"
                      onClick={() => removePositionRow(idx)}
                      disabled={publishPending}
                      title="Remove place"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              className="secondary-btn"
              onClick={addPositionRow}
              disabled={publishPending}
            >
              + Add Another Placement
            </button>

            <div className="podium-media-box">
              <h3>🏆 Podium Celebration &amp; Winner Media</h3>
              <p>Attach official trophy lifting, medal presentation photo, and victory caption for public standings and event showcase.</p>
              
              <ImageUploadWidget
                folder="podiums"
                onUploadSuccess={(url) => setPodiumPhotoUrl(url)}
                label="Upload Podium Photo (Auto-Compress to WebP)"
              />

              <label>
                Podium Photo Link
                <input
                  type="url"
                  value={podiumPhotoUrl}
                  onChange={(e) => setPodiumPhotoUrl(e.target.value)}
                  maxLength={1000}
                  placeholder="https://... or paste external link"
                />
              </label>

              {podiumPhotoUrl && (
                <div className="podium-preview-container">
                  <div className="podium-preview-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={podiumPhotoUrl}
                      alt="Podium Celebration preview"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.opacity = "0.3";
                      }}
                    />
                  </div>
                  <div className="podium-preview-info">
                    <span>✦ Podium Celebration Photo Attached</span>
                    <button type="button" onClick={() => setPodiumPhotoUrl("")}>
                      Remove Photo
                    </button>
                  </div>
                </div>
              )}

              <label>
                Victory Caption / Celebration Note
                <input
                  type="text"
                  value={podiumCaption}
                  onChange={(e) => setPodiumCaption(e.target.value)}
                  maxLength={500}
                  placeholder="e.g. Batch 2022 MBBS lifting the trophy after a thrilling final!"
                />
              </label>
            </div>

            {isCorrection && (
              <label className="modal-label mandatory" style={{ marginTop: 16 }}>
                Reason for Results Correction (Mandatory)
                <textarea
                  required
                  rows={2}
                  maxLength={500}
                  value={publishReason}
                  onChange={(e) => setPublishReason(e.target.value)}
                  placeholder="e.g. Scorer correction on disqualification / re-calculated set difference"
                />
              </label>
            )}

            <div className="publish-actions" style={{ marginTop: 20 }}>
              <button
                type="submit"
                className="primary-btn publish-submit"
                disabled={publishPending || (isCorrection && !publishReason.trim())}
              >
                {publishPending
                  ? "Publishing Results…"
                  : isCorrection && currentPublished
                  ? `Publish Results Correction (v${currentPublished.version + 1})`
                  : "Publish Official Results"}
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Publication History */}
      {results.length > 0 && (
        <section className="results-history-section">
          <h2>Results Audit History</h2>
          <div className="history-publications-list">
            {results.map((pub) => (
              <article key={pub.publication_id} className={`pub-card state-${pub.state}`}>
                <div className="pub-card-header">
                  <span className="pub-version">Version v{pub.version}</span>
                  <span className={`pub-state-tag ${pub.state}`}>{pub.state.toUpperCase()}</span>
                  <span className="pub-meta">
                    Published by {pub.published_by_name || "Organiser"} at{" "}
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Kolkata",
                    }).format(new Date(pub.published_at))}
                  </span>
                </div>

                {pub.reason && (
                  <p className="pub-reason">
                    <strong>Correction Reason:</strong> {pub.reason}
                  </p>
                )}

                {pub.podium_photo_url && (
                  <div className="pub-podium-media">
                    <div className="pub-podium-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pub.podium_photo_url} alt="Podium celebration" loading="lazy" />
                    </div>
                    <div className="pub-podium-details">
                      <span className="pub-podium-tag">Podium Celebration Media</span>
                      {pub.podium_caption && <p className="pub-podium-caption">{pub.podium_caption}</p>}
                    </div>
                  </div>
                )}

                  <div className="pub-podium-preview">
                    {pub.positions.map((pos) => (
                      <div key={pos.placing} className="pub-podium-item">
                        <span className="pos-place">#{pos.placing}</span>
                        <span className="pos-batch">{pos.winner_name ? `${pos.winner_name} (${pos.batch_label})` : pos.batch_label}</span>
                        <span className="pos-points">{pos.points > 0 ? `${pos.points} pts` : "No batch points"}</span>
                        {pos.note && <span className="pos-note">({pos.note})</span>}
                      </div>
                    ))}
                  </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
