/**
 * Générateur pseudo-aléatoire basé sur Mulberry32 pour une reproductibilité exacte
 */
export function createPRNG(seed = 42) {
  let s = Math.floor(Math.abs(seed)) || 42;

  function next() {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Uniforme dans [min, max]
  function uniform(min = 0, max = 1) {
    return min + next() * (max - min);
  }

  // Distribution gaussienne (Box-Muller)
  function normal(mean = 0, std = 1) {
    const u1 = Math.max(1e-15, next());
    const u2 = next();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * std;
  }

  return { next, uniform, normal };
}
