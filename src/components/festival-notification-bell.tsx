"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import styles from "./festival-notification-bell.module.css";
import type { FestivalNotification } from "@/app/api/public/notifications/route";

const STORAGE_KEY = "spandan_last_notification_check";

function formatRelativeTime(dateString: string): string {
  try {
    const timestamp = new Date(dateString).getTime();
    if (isNaN(timestamp)) return "Recently";

    const diffSecs = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSecs < 60) return "Just now";
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    if (diffSecs < 172800) return "Yesterday";
    return new Intl.DateTimeFormat("en-IN", {
      month: "short",
      day: "numeric",
      timeZone: "Asia/Kolkata",
    }).format(new Date(timestamp));
  } catch {
    return "Recently";
  }
}

export function FestivalNotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<FestivalNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState<"all" | "notice" | "result" | "event">("all");
  const [, startTransition] = useTransition();

  // Load notifications from API
  useEffect(() => {
    let isMounted = true;

    async function loadNotifications() {
      try {
        const res = await fetch("/api/public/notifications");
        if (!res.ok) return;
        const data = await res.json();
        if (data.ok && Array.isArray(data.items) && isMounted) {
          const items: FestivalNotification[] = data.items;
          setNotifications(items);

          // Calculate unread
          const lastCheck = localStorage.getItem(STORAGE_KEY);
          if (!lastCheck) {
            setUnreadCount(Math.min(items.length, 5));
          } else {
            const lastTime = parseInt(lastCheck, 10);
            const unread = items.filter((n) => new Date(n.timestamp).getTime() > lastTime).length;
            setUnreadCount(unread);
          }
        }
      } catch {
        // Fallback silently if offline or network error
      }
    }

    loadNotifications();

    // Poll every 45s for fresh notifications
    const timer = setInterval(loadNotifications, 45_000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  function handleOpen() {
    setIsOpen(true);
    // Mark as checked
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setUnreadCount(0);
  }

  function handleClose() {
    setIsOpen(false);
  }

  function handleMarkAllRead() {
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    setUnreadCount(0);
  }

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const filteredNotifications = notifications.filter((item) => {
    if (activeTab === "all") return true;
    return item.type === activeTab;
  });

  return (
    <>
      <button
        type="button"
        className={styles.bellButton}
        onClick={handleOpen}
        aria-label="Festival Notifications"
        title="Festival Notifications"
      >
        <svg
          className={styles.bellSvg}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>

        {unreadCount > 0 && (
          <span className={styles.badge} aria-label={`${unreadCount} unread notifications`}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={styles.backdrop} onClick={handleClose}>
          <div
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="festival-notifications-title"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={styles.panelHeader}>
              <div className={styles.headerTitleRow}>
                <span className={styles.headerIcon} aria-hidden="true">
                  🔔
                </span>
                <h3 id="festival-notifications-title" className={styles.panelTitle}>
                  Notifications
                </h3>
                <span className={styles.headerEditionBadge}>SPANDAN 4.0</span>
              </div>
              <div className={styles.headerActions}>
                <button
                  type="button"
                  className={styles.markReadBtn}
                  onClick={handleMarkAllRead}
                  title="Mark all as read"
                >
                  Mark read
                </button>
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={handleClose}
                  aria-label="Close notifications dialog"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className={styles.tabsRow} role="tablist" aria-label="Notification categories">
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === "all" ? styles.tabBtnActive : ""}`}
                onClick={() => startTransition(() => setActiveTab("all"))}
              >
                All ({notifications.length})
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === "notice" ? styles.tabBtnActive : ""}`}
                onClick={() => startTransition(() => setActiveTab("notice"))}
              >
                📢 Circulars
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === "result" ? styles.tabBtnActive : ""}`}
                onClick={() => startTransition(() => setActiveTab("result"))}
              >
                🏆 Results
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === "event" ? styles.tabBtnActive : ""}`}
                onClick={() => startTransition(() => setActiveTab("event"))}
              >
                🎯 Events
              </button>
            </div>

            {/* Items List */}
            <div className={styles.list}>
              {filteredNotifications.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>✨</div>
                  <h4 className={styles.emptyTitle}>You&apos;re all caught up!</h4>
                  <p className={styles.emptySubtitle}>
                    New event announcements, official circulars, and match results will appear here in real-time.
                  </p>
                </div>
              ) : (
                filteredNotifications.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={styles.item}
                    onClick={handleClose}
                  >
                    <div className={styles.itemHeader}>
                      <span
                        className={`${styles.badgePill} ${
                          item.urgency === "urgent" ? styles.badgeUrgent : styles.badgeNormal
                        }`}
                      >
                        {item.badge}
                      </span>
                      <span className={styles.itemTime}>{formatRelativeTime(item.timestamp)}</span>
                    </div>
                    <h4 className={styles.itemTitle}>{item.title}</h4>
                    <p className={styles.itemBody}>{item.body}</p>
                    <span className={styles.itemFooterLink}>
                      View details ↗
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
