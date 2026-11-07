"use client";

import { useState } from "react";
import { sponsorTier, sponsorWebsite } from "@/lib/sponsors";
import styles from "../promotional.module.css";

export type SponsorRecord = {
  id: string;
  edition_id: string;
  event_id: string | null;
  name: string;
  tier: string;
  logo_url: string;
  logo_alt: string;
  description: string | null;
  website_url: string | null;
  sort_order: number;
  state: "draft" | "scheduled" | "published" | "archived";
  publish_at: string | null;
  created_at: string;
};

const STANDARD_TIERS = [
  "Title Partner",
  "Diamond Partner",
  "Gold Partner",
  "Associate Partner",
  "Festival Supporter",
];

export function SponsorsClient({
  initialSponsors,
  editions,
}: {
  initialSponsors: SponsorRecord[];
  editions: { id: string; name: string }[];
}) {
  const [sponsors, setSponsors] = useState<SponsorRecord[]>(initialSponsors);
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [editingSponsor, setEditingSponsor] = useState<Partial<SponsorRecord> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const filteredSponsors = sponsors.filter((s) => {
    if (tierFilter === "all") return true;
    if (tierFilter === "draft") return s.state === "draft";
    if (tierFilter === "title") return sponsorTier(s.tier) === 0;
    if (tierFilter === "diamond") return sponsorTier(s.tier) === 1;
    if (tierFilter === "associate_gold") return sponsorTier(s.tier) === 2;
    if (tierFilter === "supporters") return sponsorTier(s.tier) === 3;
    return true;
  });

  function openCreateModal() {
    setErrorMessage("");
    setEditingSponsor({
      edition_id: editions[0]?.id || "",
      name: "",
      tier: "Associate Partner",
      logo_url: "",
      logo_alt: "",
      description: "",
      website_url: "",
      sort_order: (sponsors.length + 1) * 10,
      state: "published",
    });
    setIsModalOpen(true);
  }

  function openEditModal(sponsor: SponsorRecord) {
    setErrorMessage("");
    setEditingSponsor({ ...sponsor });
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingSponsor(null);
    setErrorMessage("");
  }

  async function handleLogoUpload(file: File) {
    setUploading(true);
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "sponsors");

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Logo upload failed");

      setEditingSponsor((prev) =>
        prev
          ? {
              ...prev,
              logo_url: data.url,
              logo_alt: prev.logo_alt || `${prev.name || file.name} logo`,
            }
          : null
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Logo upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSponsor) return;

    setSaving(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/admin/sponsors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          sponsor: editingSponsor,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save sponsor");

      if (editingSponsor.id) {
        setSponsors((prev) =>
          prev.map((s) => (s.id === data.sponsor.id ? data.sponsor : s))
        );
      } else {
        setSponsors((prev) => [...prev, data.sponsor]);
      }
      closeModal();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Are you sure you want to remove partner "${name}"? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch("/api/admin/sponsors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete partner");

      setSponsors((prev) => prev.filter((s) => s.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Deletion failed");
    }
  }

  return (
    <div>
      <div className={styles.actionsBar}>
        <div className={styles.filterGroup}>
          {[
            { id: "all", label: `All (${sponsors.length})` },
            { id: "title", label: `Title (${sponsors.filter((s) => sponsorTier(s.tier) === 0).length})` },
            { id: "diamond", label: `Diamond (${sponsors.filter((s) => sponsorTier(s.tier) === 1).length})` },
            { id: "associate_gold", label: `Gold / Associate (${sponsors.filter((s) => sponsorTier(s.tier) === 2).length})` },
            { id: "supporters", label: `Supporters (${sponsors.filter((s) => sponsorTier(s.tier) === 3).length})` },
            { id: "draft", label: `Drafts (${sponsors.filter((s) => s.state === "draft").length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.filterBtn} ${tierFilter === tab.id ? styles.filterBtnActive : ""}`}
              onClick={() => setTierFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button type="button" className={styles.createBtn} onClick={openCreateModal}>
          + Add Festival Partner
        </button>
      </div>

      {filteredSponsors.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>No partners found</h3>
          <p>
            {tierFilter === "all"
              ? "No festival sponsors or partners have been added yet. Click '+ Add Festival Partner' to add official partners."
              : `No partners found under the selected filter "${tierFilter}".`}
          </p>
          {tierFilter === "all" && (
            <button type="button" className={styles.createBtn} onClick={openCreateModal}>
              + Add Festival Partner
            </button>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredSponsors.map((sponsor) => (
            <article key={sponsor.id} className={styles.card}>
              <div className={styles.logoBox}>
                <img src={sponsor.logo_url} alt={sponsor.logo_alt || sponsor.name} />
              </div>

              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>{sponsor.name}</h3>
                  <small style={{ color: "#79547c", fontWeight: 700 }}>{sponsor.tier}</small>
                </div>
                <span
                  className={`${styles.badge} ${
                    sponsor.state === "published"
                      ? styles.badgePublished
                      : sponsor.state === "archived"
                      ? styles.badgeArchived
                      : styles.badgeDraft
                  }`}
                >
                  {sponsor.state}
                </span>
              </div>

              {sponsor.description && <p className={styles.cardDesc}>{sponsor.description}</p>}

              <div className={styles.cardMeta}>
                <div>
                  <strong>Sort Order:</strong> #{sponsor.sort_order}
                </div>
                {sponsorWebsite(sponsor.website_url) && (
                  <div>
                    <strong>Website:</strong>{" "}
                    <a
                      href={sponsorWebsite(sponsor.website_url)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#633e63", textDecoration: "underline" }}
                    >
                      {new URL(sponsorWebsite(sponsor.website_url)!).hostname} ↗
                    </a>
                  </div>
                )}
              </div>

              <div className={styles.cardFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => openEditModal(sponsor)}
                >
                  Edit details
                </button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={() => handleDelete(sponsor.id, sponsor.name)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {isModalOpen && editingSponsor && (
        <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2>{editingSponsor.id ? "Edit Partner Details" : "New Festival Partner"}</h2>
              <button type="button" className={styles.btnSecondary} onClick={closeModal}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className={styles.modalBody}>
                {errorMessage && (
                  <div className="portal-message portal-error" role="alert">
                    {errorMessage}
                  </div>
                )}

                <div className={styles.fieldPair}>
                  <div className={styles.field}>
                    <label htmlFor="s-name">Partner / Organization Name *</label>
                    <input
                      id="s-name"
                      required
                      maxLength={160}
                      placeholder="e.g. State Bank of India"
                      value={editingSponsor.name || ""}
                      onChange={(e) => setEditingSponsor({ ...editingSponsor, name: e.target.value })}
                    />
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="s-tier">Sponsorship Tier *</label>
                    <input
                      id="s-tier"
                      required
                      list="tier-presets"
                      maxLength={80}
                      placeholder="e.g. Title Partner, Diamond Partner"
                      value={editingSponsor.tier || ""}
                      onChange={(e) => setEditingSponsor({ ...editingSponsor, tier: e.target.value })}
                    />
                    <datalist id="tier-presets">
                      {STANDARD_TIERS.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className={styles.fieldPair}>
                  <div className={styles.field}>
                    <label>Partner Logo *</label>
                    <label className={styles.uploadZone}>
                      {uploading ? (
                        <span>Uploading logo...</span>
                      ) : editingSponsor.logo_url ? (
                        <>
                          <img
                            src={editingSponsor.logo_url}
                            alt="Preview"
                            className={styles.previewImage}
                          />
                          <small>Click to replace logo</small>
                        </>
                      ) : (
                        <>
                          <strong>Upload official logo</strong>
                          <small>WebP, PNG, JPEG with transparent background</small>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/webp,image/png,image/jpeg"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleLogoUpload(file);
                        }}
                      />
                    </label>
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="s-url">Direct Logo URL</label>
                    <input
                      id="s-url"
                      type="url"
                      placeholder="https://..."
                      value={editingSponsor.logo_url || ""}
                      onChange={(e) =>
                        setEditingSponsor({
                          ...editingSponsor,
                          logo_url: e.target.value,
                          logo_alt: editingSponsor.logo_alt || `${editingSponsor.name || "Partner"} logo`,
                        })
                      }
                    />
                    <label htmlFor="s-alt" style={{ marginTop: 8 }}>
                      Logo Alt Text *
                    </label>
                    <input
                      id="s-alt"
                      required
                      placeholder="e.g. State Bank of India Logo"
                      value={editingSponsor.logo_alt || ""}
                      onChange={(e) => setEditingSponsor({ ...editingSponsor, logo_alt: e.target.value })}
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label htmlFor="s-desc">Description (Optional)</label>
                  <textarea
                    id="s-desc"
                    rows={2}
                    maxLength={1000}
                    placeholder="Short statement or association background..."
                    value={editingSponsor.description || ""}
                    onChange={(e) => setEditingSponsor({ ...editingSponsor, description: e.target.value })}
                  />
                </div>

                <div className={styles.fieldPair}>
                  <div className={styles.field}>
                    <label htmlFor="s-web">Partner Website URL (Optional)</label>
                    <input
                      id="s-web"
                      type="url"
                      placeholder="https://example.com"
                      value={editingSponsor.website_url || ""}
                      onChange={(e) => setEditingSponsor({ ...editingSponsor, website_url: e.target.value })}
                    />
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="s-order">Display Sort Order</label>
                    <input
                      id="s-order"
                      type="number"
                      min={0}
                      value={editingSponsor.sort_order ?? 0}
                      onChange={(e) =>
                        setEditingSponsor({
                          ...editingSponsor,
                          sort_order: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                    <small>Lower numbers display first within the tier.</small>
                  </div>
                </div>

                <div className={styles.field}>
                  <label htmlFor="s-state">Publication State *</label>
                  <select
                    id="s-state"
                    value={editingSponsor.state || "draft"}
                    onChange={(e) =>
                      setEditingSponsor({
                        ...editingSponsor,
                        state: e.target.value as SponsorRecord["state"],
                      })
                    }
                  >
                    <option value="published">Published (Visible in Directory &amp; Banner)</option>
                    <option value="draft">Draft (Private)</option>
                    <option value="archived">Archived (Hidden)</option>
                  </select>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className={styles.createBtn} disabled={saving || uploading}>
                  {saving ? "Saving..." : editingSponsor.id ? "Save Changes" : "Add Partner"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

