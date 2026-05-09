// Smooth crossfade favicon — cycles through every vinyl color in a loop.
// Runs at ~12fps with alpha-blended canvas → favicon updated via toDataURL.

const VINYLS = [
  '/vinile-finale.png',
  '/vinile-arancione.png',
  '/vinile-rosso.png',
  '/vinile-verde.png',
  '/vinile-viola.png',
  '/vinile-trasparente.png',
];

const SIZE          = 64;     // canvas size, browser scales to actual favicon
const FPS           = 12;
const PER_COLOR_MS  = 1400;   // dwell + crossfade per color
const FRAMES_TRANS  = (PER_COLOR_MS / 1000) * FPS;

let started = false;

export function startFaviconAnimation() {
  if (started) return;
  started = true;

  let link = document.querySelector('link[rel="icon"]') || document.getElementById('favicon');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/png';

  Promise.all(
    VINYLS.map(src => new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    }))
  ).then((loaded) => {
    const images = loaded.filter(Boolean);
    if (images.length < 2) return;

    const canvas = document.createElement('canvas');
    canvas.width  = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');

    let frame = 0;

    const tick = () => {
      const a = Math.floor(frame / FRAMES_TRANS) % images.length;
      const b = (a + 1) % images.length;
      const t = (frame % FRAMES_TRANS) / FRAMES_TRANS;
      // Ease the crossfade for a softer look
      const eased = t * t * (3 - 2 * t);

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.globalAlpha = 1 - eased;
      ctx.drawImage(images[a], 0, 0, SIZE, SIZE);
      ctx.globalAlpha = eased;
      ctx.drawImage(images[b], 0, 0, SIZE, SIZE);
      ctx.globalAlpha = 1;

      link.href = canvas.toDataURL('image/png');
      frame++;
    };

    tick();
    setInterval(tick, 1000 / FPS);
  });
}
