import { lazy, Suspense, useMemo } from "react";
import { useReducedMotion } from "framer-motion";
import type { OrbState } from "../../lib/types";
import OrbFallback from "./OrbFallback";

// Heavy three.js bundle loads lazily and only when WebGL is actually usable.
const Orb3D = lazy(() => import("./Orb3D"));

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

interface OrbProps {
  state: OrbState;
  size?: number;
  /** Fill the parent (used for the full-bleed cinematic scene). */
  fill?: boolean;
}

/**
 * The signature orb (F33). Chooses the cinematic Three.js scene when the
 * device supports it, otherwise a calm CSS fallback (also honours
 * prefers-reduced-motion, F37).
 */
export default function Orb({ state, size = 200, fill = false }: OrbProps) {
  const reduce = useReducedMotion();
  const webgl = useMemo(webglAvailable, []);
  const use3d = webgl && !reduce;

  return (
    <div
      role="img"
      aria-label={`Assistant is ${state}`}
      data-orb-state={state}
      data-orb-mode={use3d ? "3d" : "fallback"}
      className={fill ? "grid h-full w-full place-items-center" : "grid place-items-center"}
      style={fill ? undefined : { width: size, height: size }}
    >
      {use3d ? (
        <Suspense fallback={<OrbFallback state={state} size={fill ? 220 : size} />}>
          <Orb3D state={state} className="h-full w-full" />
        </Suspense>
      ) : (
        <OrbFallback state={state} size={fill ? 220 : size} />
      )}
    </div>
  );
}
