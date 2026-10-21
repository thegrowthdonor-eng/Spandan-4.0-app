"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function NavigationProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Complete progress on route change
  useEffect(() => {
    if (loading) {
      setProgress(100);
      const timer = setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [pathname, searchParams]);

  // Trickle progress while loading
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setProgress(25);
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 85) return prev;
          const next = prev + Math.random() * 12;
          return next > 85 ? 85 : next;
        });
      }, 250);
    }
    return () => clearInterval(interval);
  }, [loading]);

  // Intercept all link clicks for instant 0ms visual feedback
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = (e.target as HTMLElement)?.closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href) return;

      if (
        target.target === "_blank" ||
        target.hasAttribute("download") ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        return;
      }

      try {
        const targetUrl = new URL(href, window.location.href);
        const currentUrl = new URL(window.location.href);

        if (
          targetUrl.origin === currentUrl.origin &&
          (targetUrl.pathname !== currentUrl.pathname || targetUrl.search !== currentUrl.search)
        ) {
          setLoading(true);
          setProgress(20);
        }
      } catch {
        // Skip invalid URL
      }
    }

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  if (!loading && progress === 0) return null;

  return (
    <div
      className="global-nav-progress-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      aria-label="Loading page"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "3px",
        zIndex: 99999,
        pointerEvents: "none",
        background: "transparent",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background: "linear-gradient(90deg, #a9533e 0%, #c47656 40%, #e2a048 75%, #4ade80 100%)",
          boxShadow: "0 0 12px rgba(169, 83, 62, 0.8), 0 0 6px rgba(226, 160, 72, 0.9)",
          transition: progress === 100 ? "width 180ms ease-out, opacity 300ms 120ms ease" : "width 280ms ease-out",
          opacity: progress === 100 ? 0 : 1,
          borderRadius: "0 2px 2px 0",
        }}
      />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressBarInner />
    </Suspense>
  );
}
