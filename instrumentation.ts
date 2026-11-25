// Starts the autonomous trading agent when the Next.js server boots.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("@/lib/trading/scheduler");
  startScheduler();
}
