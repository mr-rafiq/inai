import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import * as THREE from "three";
import type { OrbState } from "../../lib/types";

/**
 * Cinematic Three.js orb — a living sphere whose surface breathes with 3D
 * simplex noise, rimmed with fresnel glow, floating in a particle field.
 *
 * State drives the physics:      speed  amp   brightness  hue
 *   idle       slow breathing     0.25  0.10   0.9        calm blue
 *   listening  attentive ripple   0.60  0.16   1.1        cyan-blue
 *   thinking   fast inner storm   1.60  0.30   1.35       violet
 *   speaking   rhythmic pulse     1.00  0.22*  1.5        bright indigo (*pulsed)
 *
 * Interactive: the orb leans toward the cursor, swells on hover, and emits a
 * shockwave pulse on click.
 */

const STATE_PARAMS: Record<OrbState, { speed: number; amp: number; bright: number; colorA: string; colorB: string }> = {
  idle: { speed: 0.25, amp: 0.07, bright: 0.9, colorA: "#3b5bdb", colorB: "#9db4ff" },
  listening: { speed: 0.6, amp: 0.11, bright: 1.1, colorA: "#2f9ee0", colorB: "#a5e3ff" },
  thinking: { speed: 1.6, amp: 0.2, bright: 1.35, colorA: "#6d4fd8", colorB: "#c0b3ff" },
  speaking: { speed: 1.0, amp: 0.15, bright: 1.5, colorA: "#4c6ef5", colorB: "#dbe4ff" },
};

// Ashima 3D simplex noise (public domain) — displaces the sphere surface.
const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const VERTEX = /* glsl */ `
uniform float uTime; uniform float uSpeed; uniform float uAmp;
varying vec3 vNormal; varying vec3 vPos; varying float vNoise;
${NOISE_GLSL}
void main(){
  float t = uTime * uSpeed;
  float n = snoise(normal * 2.4 + vec3(t * 0.6, t * 0.4, t * 0.3));
  n += 0.35 * snoise(normal * 5.5 - vec3(t * 0.3, t * 0.5, t * 0.2));
  vNoise = n;
  vec3 displaced = position + normal * n * uAmp;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  vPos = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColorA; uniform vec3 uColorB; uniform float uBright; uniform float uTime;
varying vec3 vNormal; varying vec3 vPos; varying float vNoise;
void main(){
  vec3 viewDir = normalize(vPos);
  float fresnel = pow(1.0 - abs(dot(viewDir, normalize(vNormal))), 2.2);
  vec3 base = mix(uColorA, uColorB, 0.35 + 0.4 * vNoise + 0.25 * fresnel);
  vec3 color = base * uBright + fresnel * uColorB * 1.2;
  float alpha = 0.92 + 0.08 * fresnel;
  gl_FragColor = vec4(color, alpha);
}`;

function OrbMesh({ state }: { state: OrbState }) {
  const mesh = useRef<THREE.Mesh>(null!);
  const mat = useRef<THREE.ShaderMaterial>(null!);
  const [hovered, setHovered] = useState(false);
  const pulse = useRef(0); // click shockwave energy, decays each frame
  const { pointer } = useThree();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSpeed: { value: STATE_PARAMS.idle.speed },
      uAmp: { value: STATE_PARAMS.idle.amp },
      uBright: { value: STATE_PARAMS.idle.bright },
      uColorA: { value: new THREE.Color(STATE_PARAMS.idle.colorA) },
      uColorB: { value: new THREE.Color(STATE_PARAMS.idle.colorB) },
    }),
    [],
  );

  useFrame((_, delta) => {
    const p = STATE_PARAMS[state];
    const u = mat.current.uniforms;
    u.uTime.value += delta;

    // speaking gets a rhythmic pulse layered onto its base amplitude
    const speak = state === "speaking" ? 0.06 * Math.sin(u.uTime.value * 9.0) : 0;
    pulse.current = Math.max(0, pulse.current - delta * 1.8);
    const targetAmp = p.amp + speak + pulse.current * 0.25 + (hovered ? 0.04 : 0);

    // smooth-lerp everything so state changes feel alive, never snappy
    const k = 1 - Math.pow(0.001, delta); // framerate-independent lerp factor
    u.uSpeed.value += (p.speed - u.uSpeed.value) * k;
    u.uAmp.value += (targetAmp - u.uAmp.value) * k;
    u.uBright.value += (p.bright + pulse.current * 0.5 - u.uBright.value) * k;
    (u.uColorA.value as THREE.Color).lerp(new THREE.Color(p.colorA), k);
    (u.uColorB.value as THREE.Color).lerp(new THREE.Color(p.colorB), k);

    // lean toward the cursor + slow ambient rotation
    const m = mesh.current;
    m.rotation.y += (pointer.x * 0.45 - m.rotation.y) * k + delta * 0.05;
    m.rotation.x += (-pointer.y * 0.35 - m.rotation.x) * k;
    const s = 1 + (hovered ? 0.05 : 0) + pulse.current * 0.06;
    m.scale.setScalar(m.scale.x + (s - m.scale.x) * k);
  });

  return (
    <mesh
      ref={mesh}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onClick={() => (pulse.current = 1)}
    >
      <icosahedronGeometry args={[1, 64]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        transparent
      />
    </mesh>
  );
}

/** Soft additive halo billboard behind the orb (cheap "bloom"). */
function Halo({ state }: { state: OrbState }) {
  const mat = useRef<THREE.SpriteMaterial>(null!);
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(140,165,255,0.55)");
    g.addColorStop(0.45, "rgba(110,135,255,0.18)");
    g.addColorStop(1, "rgba(80,100,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, []);

  useFrame((_, delta) => {
    const target = state === "idle" ? 0.5 : state === "speaking" ? 1.0 : 0.8;
    const k = 1 - Math.pow(0.001, delta);
    mat.current.opacity += (target - mat.current.opacity) * k;
  });

  return (
    <sprite scale={[3.6, 3.6, 1]} position={[0, 0, -0.5]}>
      <spriteMaterial ref={mat} map={texture} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
}

interface Orb3DProps {
  state: OrbState;
  className?: string;
}

export default function Orb3D({ state, className }: Orb3DProps) {
  return (
    <div className={className} aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 7], fov: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        dpr={[1, 2]}
      >
        <group position={[0, 1.15, 0]}>
          <Halo state={state} />
          <OrbMesh state={state} />
        </group>
        <Sparkles count={200} scale={14} size={1.8} speed={0.25} opacity={0.4} color="#9db4ff" />
        <Sparkles count={50} scale={8} size={3.2} speed={0.15} opacity={0.28} color="#dbe4ff" />
      </Canvas>
    </div>
  );
}
