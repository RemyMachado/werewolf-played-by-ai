import { backdrop } from '../assets/images';

// The full-screen scene behind everything: a gradient base (always present) with the
// night/day raster art crossfading on top. If the images aren't there yet, the layers
// are simply transparent and the gradient shows — the game still looks intentional.
export function Backdrop({ night }: { night: boolean }) {
  return (
    <div className="backdrop" aria-hidden>
      <div className={`backdrop-grad ${night ? 'night' : 'day'}`} />
      <div className="backdrop-img" style={{ backgroundImage: `url(${backdrop(true)})`, opacity: night ? 1 : 0 }} />
      <div className="backdrop-img" style={{ backgroundImage: `url(${backdrop(false)})`, opacity: night ? 0 : 1 }} />
      <div className="backdrop-vignette" />
    </div>
  );
}
