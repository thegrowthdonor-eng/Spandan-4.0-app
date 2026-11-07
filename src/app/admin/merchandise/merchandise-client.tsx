"use client";

import { useState } from "react";
import styles from "../promotional.module.css";

export type MerchandiseItem = {
  id: string;
  edition_id: string;
  name: string;
  description: string;
  image_url: string;
  image_alt: string;
  sizes: string[];
  availability_note: string;
  collection_note: string;
  contact_note: string;
  state: "draft" | "scheduled" | "published" | "archived";
  publish_at: string | null;
  created_at: string;
};

const STANDARD_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "Free Size"];

export function MerchandiseClient({
  initialItems,
  editions,
}: {
  initialItems: MerchandiseItem[];
  editions: { id: string; name: string }[];
}) {
  const [items, setItems] = useState<MerchandiseItem[]>(initialItems);
  const [filter, setFilter] = useState<string>("all");
  const [editingItem, setEditingItem] = useState<Partial<MerchandiseItem> | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [customSize, setCustomSize] = useState("");

  const filteredItems = items.filter((item) => {
    if (filter === "all") return true;
    return item.state === filter;
  });

  function openCreateModal() {
    setErrorMessage("");
    setEditingItem({
      edition_id: editions[0]?.id || "",
      name: "",
      description: "",
      image_url: "",
      image_alt: "",
      sizes: ["S", "M", "L", "XL"],
      availability_note: "Available at Festival Central Desk",
      collection_note: "Confirm size and collect with student Fest ID at the desk",
      contact_note: "Treasury Desk: ASMC Firozabad",
      state: "published",
    });
    setIsModalOpen(true);
  }

  function openEditModal(item: MerchandiseItem) {
    setErrorMessage("");
    setEditingItem({ ...item });
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingItem(null);
    setErrorMessage("");
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "merchandise");

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setEditingItem((prev) =>
        prev
          ? {
              ...prev,
              image_url: data.url,
              image_alt: prev.image_alt || prev.name || file.name.replace(/\.[^/.]+$/, ""),
            }
          : null
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  function toggleSize(size: string) {
    if (!editingItem) return;
    const currentSizes = editingItem.sizes || [];
    const updated = currentSizes.includes(size)
      ? currentSizes.filter((s) => s !== size)
      : [...currentSizes, size];
    setEditingItem({ ...editingItem, sizes: updated });
  }

  function addCustomSize() {
    if (!customSize.trim() || !editingItem) return;
    const size = customSize.trim().toUpperCase();
    const currentSizes = editingItem.sizes || [];
    if (!currentSizes.includes(size)) {
      setEditingItem({ ...editingItem, sizes: [...currentSizes, size] });
    }
    setCustomSize("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem) return;

    setSaving(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/admin/merchandise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          item: editingItem,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save item");

      if (editingItem.id) {
        setItems((prev) => prev.map((item) => (item.id === data.item.id ? data.item : item)));
      } else {
        setItems((prev) => [data.item, ...prev]);
      }
      closeModal();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch("/api/admin/merchandise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete item");

      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Deletion failed");
    }
  }

  return (
    <div>
      <div className={styles.actionsBar}>
        <div className={styles.filterGroup}>
          {["all", "published", "draft", "archived"].map((st) => (
            <button
              key={st}
              type="button"
              className={`${styles.filterBtn} ${filter === st ? styles.filterBtnActive : ""}`}
              onClick={() => setFilter(st)}
            >
              {st.charAt(0).toUpperCase() + st.slice(1)} (
              {st === "all" ? items.length : items.filter((i) => i.state === st).length})
            </button>
          ))}
        </div>

        <button type="button" className={styles.createBtn} onClick={openCreateModal}>
          + Add Merchandise Item
        </button>
      </div>

      {filteredItems.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>No merchandise items found</h3>
          <p>
            {filter === "all"
              ? "No official merchandise items have been added yet. Click '+ Add Merchandise Item' to add festival apparel or souvenirs."
              : `No merchandise items with status "${filter}".`}
          </p>
          {filter === "all" && (
            <button type="button" className={styles.createBtn} onClick={openCreateModal}>
              + Add Merchandise Item
            </button>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredItems.map((item) => (
            <article key={item.id} className={styles.card}>
              <div className={styles.imgBox}>
                <img src={item.image_url} alt={item.image_alt || item.name} />
              </div>

              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{item.name}</h3>
                <span
                  className={`${styles.badge} ${
                    item.state === "published"
                      ? styles.badgePublished
                      : item.state === "archived"
                      ? styles.badgeArchived
                      : item.state === "scheduled"
                      ? styles.badgeScheduled
                      : styles.badgeDraft
                  }`}
                >
                  {item.state}
                </span>
              </div>

              <p className={styles.cardDesc}>{item.description}</p>

              <div className={styles.cardMeta}>
                <div>
                  <strong>Sizes:</strong> {item.sizes?.length ? item.sizes.join(" · ") : "None specified"}
                </div>
                <div>
                  <strong>Availability:</strong> {item.availability_note}
                </div>
                <div>
                  <strong>Collection:</strong> {item.collection_note}
                </div>
              </div>

              <div className={styles.cardFooter}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => openEditModal(item)}
                >
                  Edit details
                </button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={() => handleDelete(item.id, item.name)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {isModalOpen && editingItem && (
        <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h2>{editingItem.id ? "Edit Merchandise Item" : "New Merchandise Item"}</h2>
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

                <div className={styles.field}>
                  <label htmlFor="m-name">Item Name *</label>
                  <input
                    id="m-name"
                    required
                    maxLength={160}
                    placeholder="e.g. Official Spandan 4.0 Graphic Jersey"
                    value={editingItem.name || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="m-desc">Description *</label>
                  <textarea
                    id="m-desc"
                    required
                    rows={3}
                    maxLength={2000}
                    placeholder="Describe the apparel fabric, fit, theme, and edition branding..."
                    value={editingItem.description || ""}
                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  />
                </div>

                <div className={styles.fieldPair}>
                  <div className={styles.field}>
                    <label>Product Photo *</label>
                    <label className={styles.uploadZone}>
                      {uploading ? (
                        <span>Uploading image...</span>
                      ) : editingItem.image_url ? (
                        <>
                          <img
                            src={editingItem.image_url}
                            alt="Preview"
                            className={styles.previewImage}
                          />
                          <small>Click to choose a different photo (Max 5MB)</small>
                        </>
                      ) : (
                        <>
                          <strong>Upload photo</strong>
                          <small>WebP, PNG, JPEG up to 5MB</small>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/webp,image/png,image/jpeg"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file);
                        }}
                      />
                    </label>
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="m-url">Direct Image URL</label>
                    <input
                      id="m-url"
                      type="url"
                      placeholder="https://..."
                      value={editingItem.image_url || ""}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          image_url: e.target.value,
                          image_alt: editingItem.image_alt || editingItem.name || "Merchandise",
                        })
                      }
                    />
                    <label htmlFor="m-alt" style={{ marginTop: 8 }}>
                      Image Alt Text *
                    </label>
                    <input
                      id="m-alt"
                      required
                      placeholder="Visual description for accessibility"
                      value={editingItem.image_alt || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, image_alt: e.target.value })}
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label>Available Sizes</label>
                  <div className={styles.sizesWrap}>
                    {STANDARD_SIZES.map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        className={`${styles.sizePill} ${
                          editingItem.sizes?.includes(sz) ? styles.sizePillActive : ""
                        }`}
                        onClick={() => toggleSize(sz)}
                      >
                        {sz}
                      </button>
                    ))}
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <input
                        className={styles.customSizeInput}
                        placeholder="Custom..."
                        value={customSize}
                        onChange={(e) => setCustomSize(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addCustomSize();
                          }
                        }}
                      />
                      <button type="button" className={styles.btnSecondary} onClick={addCustomSize}>
                        + Add
                      </button>
                    </div>
                  </div>
                  <small>Selected: {editingItem.sizes?.join(", ") || "None selected"}</small>
                </div>

                <div className={styles.fieldPair}>
                  <div className={styles.field}>
                    <label htmlFor="m-avail">Availability Guidance *</label>
                    <input
                      id="m-avail"
                      required
                      maxLength={500}
                      placeholder="e.g. In stock · Pre-orders closing Dec 1st"
                      value={editingItem.availability_note || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, availability_note: e.target.value })}
                    />
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="m-state">Publication State *</label>
                    <select
                      id="m-state"
                      value={editingItem.state || "draft"}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          state: e.target.value as MerchandiseItem["state"],
                        })
                      }
                    >
                      <option value="published">Published (Visible to all students)</option>
                      <option value="draft">Draft (Private to committee)</option>
                      <option value="archived">Archived (Hidden)</option>
                    </select>
                  </div>
                </div>

                <div className={styles.fieldPair}>
                  <div className={styles.field}>
                    <label htmlFor="m-coll">Collection Instructions *</label>
                    <input
                      id="m-coll"
                      required
                      maxLength={1000}
                      placeholder="e.g. Collect from Ground Floor Desk between 2 PM - 5 PM"
                      value={editingItem.collection_note || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, collection_note: e.target.value })}
                    />
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="m-contact">Desk / Contact Reference *</label>
                    <input
                      id="m-contact"
                      required
                      maxLength={500}
                      placeholder="e.g. Student Council Treasury / +91 ..."
                      value={editingItem.contact_note || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, contact_note: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className={styles.createBtn} disabled={saving || uploading}>
                  {saving ? "Saving..." : editingItem.id ? "Save Changes" : "Create Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

