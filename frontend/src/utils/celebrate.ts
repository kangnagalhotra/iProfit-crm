// Lightweight confetti burst — no dependency, a throwaway canvas overlay that
// animates ~2.5s and removes itself. Used for the two moments worth
// celebrating: converting a lead to a deal, and closing a deal Won.

const COLORS = ['#025ADF', '#16A34A', '#8B5CF6', '#F97316', '#DC2626', '#FBBF24', '#0891B2', '#DB2777'];

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; color: string; rotation: number; vr: number; shape: 'rect' | 'circle';
}

export function celebrate(): void {
  if (typeof document === 'undefined') return;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999;';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }

  // Two bursts from the bottom corners angled toward the center, like party
  // poppers going off.
  const particles: Particle[] = [];
  function burst(originX: number, direction: number) {
    for (let i = 0; i < 90; i++) {
      const angle = (-Math.PI / 2) + direction * (Math.PI / 5) * (Math.random() - 0.2);
      const speed = 9 + Math.random() * 13;
      particles.push({
        x: originX,
        y: canvas.height + 10,
        vx: Math.cos(angle) * speed * direction * -1 + (Math.random() - 0.5) * 3,
        vy: Math.sin(angle) * speed * 1.6 - Math.random() * 6,
        size: 5 + Math.random() * 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
      });
    }
  }
  burst(canvas.width * 0.1, 1);
  burst(canvas.width * 0.9, -1);

  const started = performance.now();
  const DURATION = 2500;

  function frame(now: number) {
    const elapsed = now - started;
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    const fade = Math.max(0, 1 - elapsed / DURATION);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // gravity
      p.vx *= 0.99;
      p.rotation += p.vr;

      ctx!.save();
      ctx!.globalAlpha = fade;
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rotation);
      ctx!.fillStyle = p.color;
      if (p.shape === 'rect') ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      else { ctx!.beginPath(); ctx!.arc(0, 0, p.size / 2.5, 0, Math.PI * 2); ctx!.fill(); }
      ctx!.restore();
    }

    if (elapsed < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}
