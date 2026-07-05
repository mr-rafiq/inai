import { motion, useReducedMotion } from "framer-motion";
import type { OrbState } from "../../lib/types";

/**
 * CSS/SVG fallback orb — used when WebGL is unavailable or the user prefers
 * reduced motion. Calm, low-cost, still state-aware.
 */

const GLOW: Record<OrbState, string> = {
  idle: "0 0 60px 8px rgba(91,124,255,0.30)",
  listening: "0 0 80px 12px rgba(124,156,255,0.45)",
  thinking: "0 0 90px 16px rgba(109,79,216,0.55)",
  speaking: "0 0 110px 20px rgba(169,188,255,0.65)",
};

const DURATION: Record<OrbState, number> = {
  idle: 4.5,
  listening: 2.2,
  thinking: 1.4,
  speaking: 0.7,
};

export default function OrbFallback({ state, size = 180 }: { state: OrbState; size?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="grid place-items-center" style={{ width: size, height: size }} aria-hidden="true">
      <motion.div
        className="rounded-full"
        style={{
          width: size * 0.62,
          height: size * 0.62,
          boxShadow: GLOW[state],
          background:
            "radial-gradient(circle at 35% 30%, #cdd9ff 0%, #7c9cff 40%, #3a55c8 75%, #1b246b 100%)",
        }}
        animate={reduce ? { scale: 1 } : { scale: [1, 1.08, 1] }}
        transition={{ duration: DURATION[state], ease: "easeInOut", repeat: reduce ? 0 : Infinity }}
      />
    </div>
  );
}
