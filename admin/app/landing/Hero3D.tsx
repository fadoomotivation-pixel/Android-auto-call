"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MeshDistortMaterial } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

/**
 * Branded hero scene: a glowing AI "core" with lead-nodes orbiting it, lines
 * connecting them, and light "call pulses" travelling along those lines into
 * the core — a literal picture of the product (leads → AI dialer → calls).
 * Pointer-reactive parallax, real bloom. Lighter automatically on mobile.
 */

type NodeDef = {
  pos: THREE.Vector3;
  speed: number;
  axis: THREE.Vector3;
  radius: number;
  phase: number;
  color: THREE.Color;
};

const PALETTE = ["#c7d2fe", "#a855f7", "#22d3ee", "#34d399"].map(
  (c) => new THREE.Color(c),
);

function useNodes(count: number): NodeDef[] {
  return useMemo(() => {
    const nodes: NodeDef[] = [];
    for (let i = 0; i < count; i++) {
      const radius = 2.4 + Math.random() * 1.9;
      const axis = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ).normalize();
      const phase = Math.random() * Math.PI * 2;
      nodes.push({
        pos: new THREE.Vector3(),
        speed: 0.08 + Math.random() * 0.16,
        axis,
        radius,
        phase,
        color: PALETTE[i % PALETTE.length].clone(),
      });
    }
    return nodes;
  }, [count]);
}

function Network({ count, pointer }: { count: number; pointer: THREE.Vector2 }) {
  const group = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const nodes = useNodes(count);

  // Instanced lead-node spheres.
  const nodeMesh = useRef<THREE.InstancedMesh>(null);
  // Line segments core → node.
  const lineGeo = useRef<THREE.BufferGeometry>(null);
  // Travelling pulses (one per node, looping in toward the core).
  const pulseMesh = useRef<THREE.InstancedMesh>(null);

  const linePositions = useMemo(
    () => new Float32Array(count * 2 * 3),
    [count],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // Smooth parallax: rotate the whole constellation toward the pointer.
    if (group.current) {
      group.current.rotation.y += (pointer.x * 0.5 - group.current.rotation.y) * Math.min(1, delta * 2.5);
      group.current.rotation.x += (-pointer.y * 0.35 - group.current.rotation.x) * Math.min(1, delta * 2.5);
      group.current.rotation.z = Math.sin(t * 0.1) * 0.04;
    }
    if (core.current) {
      core.current.rotation.y = t * 0.2;
      const s = 1 + Math.sin(t * 1.6) * 0.03;
      core.current.scale.setScalar(s);
    }

    for (let i = 0; i < count; i++) {
      const n = nodes[i];
      const angle = t * n.speed + n.phase;
      // position on a tilted circular orbit
      tmp.set(Math.cos(angle) * n.radius, Math.sin(angle) * n.radius, 0);
      tmp.applyAxisAngle(n.axis, n.phase);
      n.pos.copy(tmp);

      // node instance
      if (nodeMesh.current) {
        dummy.position.copy(tmp);
        const ps = 0.06 + (Math.sin(angle * 2) * 0.5 + 0.5) * 0.05;
        dummy.scale.setScalar(ps);
        dummy.updateMatrix();
        nodeMesh.current.setMatrixAt(i, dummy.matrix);
        nodeMesh.current.setColorAt(i, n.color);
      }

      // line endpoints
      linePositions[i * 6] = 0;
      linePositions[i * 6 + 1] = 0;
      linePositions[i * 6 + 2] = 0;
      linePositions[i * 6 + 3] = tmp.x;
      linePositions[i * 6 + 4] = tmp.y;
      linePositions[i * 6 + 5] = tmp.z;

      // pulse travels node → core, looping
      if (pulseMesh.current) {
        const k = (t * 0.5 + i * 0.13) % 1; // 0..1
        dummy.position.set(tmp.x * (1 - k), tmp.y * (1 - k), tmp.z * (1 - k));
        const grow = 0.05 + (1 - k) * 0.06;
        dummy.scale.setScalar(grow);
        dummy.updateMatrix();
        pulseMesh.current.setMatrixAt(i, dummy.matrix);
        pulseMesh.current.setColorAt(i, n.color);
      }
    }

    if (nodeMesh.current) {
      nodeMesh.current.instanceMatrix.needsUpdate = true;
      if (nodeMesh.current.instanceColor) nodeMesh.current.instanceColor.needsUpdate = true;
    }
    if (pulseMesh.current) {
      pulseMesh.current.instanceMatrix.needsUpdate = true;
      if (pulseMesh.current.instanceColor) pulseMesh.current.instanceColor.needsUpdate = true;
    }
    if (lineGeo.current) {
      const attr = lineGeo.current.getAttribute("position") as THREE.BufferAttribute;
      attr.needsUpdate = true;
    }
  });

  return (
    <group ref={group}>
      {/* AI core */}
      <mesh ref={core}>
        <icosahedronGeometry args={[1.05, 16]} />
        <MeshDistortMaterial
          color="#6d5efc"
          emissive="#a855f7"
          emissiveIntensity={0.7}
          roughness={0.15}
          metalness={0.9}
          distort={0.28}
          speed={1.6}
        />
      </mesh>
      <mesh scale={1.28}>
        <icosahedronGeometry args={[1.05, 2]} />
        <meshBasicMaterial color="#22d3ee" wireframe transparent opacity={0.12} />
      </mesh>

      {/* connection lines */}
      <lineSegments>
        <bufferGeometry ref={lineGeo}>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#5b6cff" transparent opacity={0.16} />
      </lineSegments>

      {/* lead nodes */}
      <instancedMesh ref={nodeMesh} args={[undefined, undefined, count]}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshStandardMaterial
          emissive="#ffffff"
          emissiveIntensity={1.4}
          color="#ffffff"
          toneMapped={false}
        />
      </instancedMesh>

      {/* travelling call pulses */}
      <instancedMesh ref={pulseMesh} args={[undefined, undefined, count]}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshStandardMaterial
          emissive="#ffffff"
          emissiveIntensity={2.2}
          color="#ffffff"
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}

function PointerTracker({ pointer }: { pointer: THREE.Vector2 }) {
  const { size } = useThree();
  useFrame((state) => {
    // react-three pointer is normalised -1..1 already
    pointer.x = state.pointer.x;
    pointer.y = state.pointer.y;
  });
  // keep size referenced so resize re-evaluates
  void size;
  return null;
}

export default function Hero3D({ mobile = false }: { mobile?: boolean }) {
  const pointer = useMemo(() => new THREE.Vector2(0, 0), []);
  const count = mobile ? 22 : 48;

  return (
    <Canvas
      className="cp-hero-canvas"
      camera={{ position: [0, 0, 9], fov: 42 }}
      dpr={mobile ? [1, 1.5] : [1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <ambientLight intensity={0.5} />
      <pointLight position={[-6, -3, -4]} intensity={2.4} color="#a855f7" />
      <pointLight position={[6, 4, 3]} intensity={1.8} color="#22d3ee" />
      <PointerTracker pointer={pointer} />
      <Network count={count} pointer={pointer} />
      <EffectComposer multisampling={mobile ? 0 : 4}>
        <Bloom
          intensity={mobile ? 0.9 : 1.5}
          luminanceThreshold={0.2}
          luminanceSmoothing={0.9}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.25} darkness={0.85} />
      </EffectComposer>
    </Canvas>
  );
}
