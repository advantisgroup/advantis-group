/** Sticky header (~h-16) height that both the popout clamp and scroll-margin must clear. */
export const HEADER_HEIGHT = 68;

const VIEWPORT_MARGIN = 12;

/** Walks up from `el` to find the nearest scrollable ancestor, falling back to `window`. */
export function findScrollParent(el: Element): Element | Window {
  let node: Element | null = el.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return window;
}

function getScrollTop(container: Element | Window): number {
  return container instanceof Window ? window.scrollY : container.scrollTop;
}

/** Resolves once `container`'s scroll position settles (via `scrollend` or frame-stability), or on timeout. */
export function waitForScrollSettle(container: Element | Window, timeoutMs = 600): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let rafId = 0;
    let lastTop = getScrollTop(container);
    let stableFrames = 0;

    const finish = () => {
      if (settled) return;
      settled = true;
      container.removeEventListener("scrollend", finish);
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
      resolve();
    };

    function poll() {
      if (settled) return;
      const top = getScrollTop(container);
      if (top === lastTop) {
        stableFrames++;
        if (stableFrames >= 2) {
          finish();
          return;
        }
      } else {
        stableFrames = 0;
        lastTop = top;
      }
      rafId = requestAnimationFrame(poll);
    }

    container.addEventListener("scrollend", finish, { once: true });
    rafId = requestAnimationFrame(poll);
    const timer = setTimeout(finish, timeoutMs);
  });
}

function isOutOfView(rect: DOMRect): boolean {
  return (
    rect.top < HEADER_HEIGHT + 8 ||
    rect.bottom > window.innerHeight - VIEWPORT_MARGIN ||
    rect.left < VIEWPORT_MARGIN ||
    rect.right > window.innerWidth - VIEWPORT_MARGIN
  );
}

/**
 * If `el` is off-screen or would leave the popout nowhere reasonable to clamp
 * to, scroll it into view (respecting the sticky header) and wait for the
 * scroll to settle. Resolves immediately if the element is already visible.
 */
export async function scrollTargetIntoView(el: Element): Promise<void> {
  const rect = el.getBoundingClientRect();
  if (!isOutOfView(rect)) return;

  const scrollParent = findScrollParent(el);
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  await waitForScrollSettle(scrollParent);
}
