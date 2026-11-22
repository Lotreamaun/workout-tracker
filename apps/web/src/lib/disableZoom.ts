/**
 * iOS Safari игнорирует `user-scalable=no` в viewport, поэтому pinch-зум
 * блокируется вручную: gesture*-события (только WebKit) и мультитач-touchmove.
 */
export function disableZoom() {
  const prevent = (event: Event) => event.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, prevent, { passive: false });
  }
  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) event.preventDefault();
    },
    { passive: false },
  );
}
