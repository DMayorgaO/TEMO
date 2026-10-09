export function startVisiblePolling(task: () => Promise<void>, intervalMs: number, changeEvent: string) {
  let disposed = false;
  let running = false;
  const run = async () => {
    if (disposed || running || document.visibilityState === 'hidden') return;
    running = true;
    try {
      await task();
    } catch {
      // Preserve the last confirmed state; the next poll can recover.
    } finally {
      running = false;
    }
  };
  const trigger = () => { void run(); };
  const timer = window.setInterval(trigger, intervalMs);
  window.addEventListener('focus', trigger);
  window.addEventListener(changeEvent, trigger);
  document.addEventListener('visibilitychange', trigger);
  trigger();
  return () => {
    disposed = true;
    window.clearInterval(timer);
    window.removeEventListener('focus', trigger);
    window.removeEventListener(changeEvent, trigger);
    document.removeEventListener('visibilitychange', trigger);
  };
}
