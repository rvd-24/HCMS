// Render's free tier sleeps the backend after ~15 idle minutes and takes up to a
// minute to wake. Ping it as soon as anyone opens the site (so it's warming up
// while they read the landing page or type their password), then keep pinging
// while a tab is visible. The GitHub Actions cron covers the hours nobody's here.
const INTERVAL_MS = 10 * 60_000;

function ping() {
  fetch("/api/health", { cache: "no-store" }).catch(() => {
    /* asleep or offline — the next ping or real request will wake it */
  });
}

export function keepBackendAwake() {
  let last = 0;
  const tick = () => {
    if (document.visibilityState !== "visible" || Date.now() - last < INTERVAL_MS - 5_000) return;
    last = Date.now();
    ping();
  };
  last = Date.now();
  ping();
  setInterval(tick, INTERVAL_MS);
  // Background tabs throttle timers, so catch up as soon as the tab is back.
  document.addEventListener("visibilitychange", tick);
}
