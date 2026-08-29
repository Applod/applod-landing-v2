/**
 * video-modal.js — one <dialog> reused by every video trigger on the page
 * (the hero "Watch the Reel" button, the three work-grid case studies).
 *
 * Each trigger carries its own src/poster/caption as data attributes; opening
 * the dialog just points the shared <video> at whichever trigger was clicked.
 * The element is only ever populated on demand — nothing preloads.
 */

const TRIGGER_SELECTOR = '[data-video]';

/**
 * @returns {{destroy: () => void}}
 */
export function initVideoModal() {
  const dialog = document.querySelector('[data-video-modal]');
  const video = dialog?.querySelector('[data-video-modal-player]');
  const caption = dialog?.querySelector('[data-video-modal-caption]');
  const closeButton = dialog?.querySelector('[data-video-modal-close]');
  if (!dialog || !video || !caption || !closeButton) return { destroy: () => {} };

  let opener = null;

  const open = (trigger) => {
    const src = trigger.dataset.video;
    if (!src) return;

    opener = trigger;
    video.poster = trigger.dataset.poster ?? '';
    video.src = src;
    caption.textContent = trigger.dataset.title ?? '';
    dialog.showModal();
    // showModal() is itself inside the click's gesture chain — play() here
    // still counts as gesture-initiated for the autoplay-with-sound policy.
    video.play().catch(() => {
      /* Autoplay can still be refused (e.g. low-power mode); the visible
         controls bar lets the visitor start it manually either way. */
    });
  };

  const onTriggerClick = (event) => {
    const trigger = event.target.closest(TRIGGER_SELECTOR);
    if (trigger) open(trigger);
  };

  // Cleanup is called directly from every close path we trigger ourselves
  // (the × button, a backdrop click) rather than left to the dialog's native
  // 'close' event alone — that event is queued as a spec'd async task, and at
  // least one embedded-browser environment this shipped in never dispatched
  // it for a programmatic .close() at all. The listener below stays only as
  // the fallback for Escape, the one close path with no call site of ours.
  const close = () => {
    if (!dialog.open) return;
    dialog.close();
    cleanup();
  };

  const onBackdropClick = (event) => {
    // A click landing on the <dialog> element itself, not its content, is
    // the native ::backdrop click-through — the standard "click outside".
    if (event.target === dialog) close();
  };

  const cleanup = () => {
    video.pause();
    // Clearing src (not just pausing) stops any further buffering the
    // instant the dialog closes, and drops the decoded frame from memory.
    video.removeAttribute('src');
    video.load();
    opener?.focus();
    opener = null;
  };

  document.addEventListener('click', onTriggerClick);
  closeButton.addEventListener('click', close);
  dialog.addEventListener('click', onBackdropClick);
  dialog.addEventListener('close', cleanup);

  return {
    destroy: () => {
      document.removeEventListener('click', onTriggerClick);
      dialog.removeEventListener('click', onBackdropClick);
      dialog.removeEventListener('close', onClose);
    },
  };
}
