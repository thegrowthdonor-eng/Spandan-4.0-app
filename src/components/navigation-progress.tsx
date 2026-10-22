"use client";

import { Suspense, useEffect, useReducer, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function NavigationProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(progressReducer, { loading: false, progress: 0 });
  const loadingRef = useRef(false);

  useEffect(() => {
    loadingRef.current = state.loading;
  }, [state.loading]);

  // Complete progress on route change
  useEffect(() => {
    if (loadingRef.current) {
      dispatch({ type: "complete" });
      const timer = setTimeout(() => {
        dispatch({ type: "reset" });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [pathname, searchParams]);

  // Trickle progress while loading
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (state.loading) {
      interval = setInterval(() => {
        dispatch({ type: "trickle" });
      }, 250);
    }
    return () => clearInterval(interval);
  }, [state.loading]);

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
          dispatch({ type: "start" });
        }
      } catch {
        // Skip invalid URL
      }
    }

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  if (!state.loading && state.progress === 0) return null;

  return (
    <div
      className="global-nav-progress-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={state.progress}
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
          width: `${state.progress}%`,
          background: "linear-gradient(90deg, #a9533e 0%, #c47656 40%, #e2a048 75%, #4ade80 100%)",
          boxShadow: "0 0 12px rgba(169, 83, 62, 0.8), 0 0 6px rgba(226, 160, 72, 0.9)",
          transition: state.progress === 100 ? "width 180ms ease-out, opacity 300ms 120ms ease" : "width 280ms ease-out",
          opacity: state.progress === 100 ? 0 : 1,
          borderRadius: "0 2px 2px 0",
        }}
      />
    </div>
  );
}

type ProgressState = { loading: boolean; progress: number };
type ProgressAction = { type: "start" } | { type: "complete" } | { type: "reset" } | { type: "trickle" };

function progressReducer(state: ProgressState, action: ProgressAction): ProgressState {
  switch (action.type) {
    case "start":
      return { loading: true, progress: Math.max(state.progress, 20) };
    case "complete":
      return state.loading ? { loading: true, progress: 100 } : state;
    case "reset":
      return { loading: false, progress: 0 };
    case "trickle": {
      if (!state.loading || state.progress >= 85) return state;
      return { ...state, progress: Math.min(85, state.progress + Math.random() * 12) };
    }
  }
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressBarInner />
    </Suspense>
  );
}
