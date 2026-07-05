import { motion, useReducedMotion } from "framer-motion";
import type { OrbState } from "../../lib/types";

interface OrbProps {
  state: OrbState;
  size?: number;
}

// Per-state motion vocabulary (§9.1):
//   idle      slow breathing pulse, low glow
//   listening reacts to voice amplitude (Phase 2) — gentle expand for now
//   thinking  swirling internal motion, brighter
//   speaking  rhythmic pulse in sync with speech
const CORE: Record<OrbState, { scale: number[]; opacity: number[] }> = {
  idle: { scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] },
  listening: { scale: [1, 1.12, 1], opacity: [0.9, 1, 0.9] },
  thinking: { scale: [1, 1.09, 0.97, 1.05, 1], opacity: [0.9, 1, 0.9] },
  speaking: { scale: [1, 1.14, 0.98, 1.1, 1], opacity: [1, 0.9, 1] },
};

const DURATION: Record<OrbState, number> = {
  idle: 4.5,
  listening: 2.2,
  thinking: 1.4,
  speaking: 0.7,
};

const GLOW: Record<OrbState, string> = {
  idle: "0 0 60px 8px rgba(91,124,255,0.30)",
  listening: "0 0 80px 12px rgba(124,156,255,0.45)",
  thinking: "0 0 90px 16px rgba(91,124,255,0.55)",
  speaking: "0 0 110px 20px rgba(169,188,255,0.65)",
};

export default function Orb({ state, size = 200 }: OrbProps) {
  const reduce = useReducedMotion();

  return (
    <div
      role="img"
      aria-label={`Assistant is ${state}`}
      data-orb-state={state}
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
    >
      {/* outer halo */}
      <motion.div
        className="absolute rounded-full"
        style={{ width: size * 0.9, height: size * 0.9, boxShadow: GLOW[state] }}
        animate={reduce ? { boxShadow: GLOW[state] } : { boxShadow: GLOW[state] }}
        transition={{ duration: 0.8 }}
      />

      {/* swirling ring — most visible while thinking */}
      {!reduce && (
        <motion.div
          className="absolute rounded-full opacity-60"
          style={{
            width: size * 0.78,
            height: size * 0.78,
            background:
              "conic-gradient(from 0deg, transparent, rgba(124,156,255,0.55), transparent 60%)",
            filter: "blur(6px)",
          }}
          animate={{ rotate: 360 }}
          transition={{
            duration: state === "thinking" ? 2.2 : 8,
            ease: "linear",
            repeat: Infinity,
          }}
        />
      )}

      {/* luminous core */}
      <motion.div
        className="relative rounded-full"
        style={{
          width: size * 0.6,
          height: size * 0.6,
          background:
            "radial-gradient(circle at 35% 30%, #cdd9ff 0%, #7c9cff 40%, #3a55c8 75%, #1b246b 100%)",
        }}
        animate={reduce ? { scale: 1, opacity: 1 } : CORE[state]}
        transition={{
          duration: DURATION[state],
          ease: "easeInOut",
          repeat: reduce ? 0 : Infinity,
        }}
      >
        {/* inner highlight */}
        <div
          className="absolute rounded-full"
          style={{
            top: "16%",
            left: "20%",
            width: "34%",
            height: "34%",
            background: "radial-gradient(circle, rgba(255,255,255,0.9), transparent 70%)",
            filter: "blur(2px)",
          }}
        />
      </motion.div>
    </div>
  );
}
