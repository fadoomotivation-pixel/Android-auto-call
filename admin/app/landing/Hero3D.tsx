"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";

/** Slowly rotating, gently distorted "signal orb" — the product's calling core. */
function Orb() {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.getElapsedTime();
    mesh.current.rotation.y = t * 0.12;
    mesh.current.rotation.z = Math.sin(t * 0.18) * 0.08;
  });
  return (
    <Float speed={1.2} rotationIntensity={0.5} floatIntensity={0.7}>
      <mesh ref={mesh} scale={1.45}>
        <icosahedronGeometry args={[1, 12]} />
        <MeshDistortMaterial
          color="#6366f1"
          emissive="#a855f7"
          emissiveIntensity={0.35}
          roughness={0.18}
          metalness={0.85}
          distort={0.32}
          speed={1.4}
        />
      </mesh>
      {/* wireframe shell for depth */}
      <mesh scale={1.62}>
        <icosahedronGeometry args={[1, 2]} />
        <meshBasicMaterial color="#22d3ee" wireframe transparent opacity={0.08} />
      </mesh>
    </Float>
  );
}

/** A drifting starfield that parallaxes with the orb. */
function Particles({ count = 900 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 4 + Math.random() * 6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    ref.current.rotation.y = t * 0.03;
    ref.current.rotation.x = Math.sin(t * 0.05) * 0.1;
  });

  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled>
      <PointMaterial
        transparent
        color="#c7d2fe"
        size={0.022}
        sizeAttenuation
        depthWrite={false}
        opacity={0.85}
      />
    </Points>
  );
}

export default function Hero3D() {
  return (
    <Canvas
      className="cp-hero-canvas"
      camera={{ position: [0, 0, 6], fov: 45 }}
      dpr={[1, 1.8]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1.4} color="#ffffff" />
      <pointLight position={[-6, -3, -4]} intensity={2.2} color="#a855f7" />
      <pointLight position={[6, 4, 2]} intensity={1.6} color="#22d3ee" />
      <Orb />
      <Particles />
    </Canvas>
  );
}
