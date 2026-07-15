/** Renders a dependable WebGL room preview when Pascal WebGPU is unavailable. */
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { JSX, ReactNode } from "react";

function Room(): JSX.Element {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 10]} intensity={1.2} castShadow />
      <pointLight position={[-5, 5, -5]} intensity={0.6} />

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.5, 0, 2]} receiveShadow>
        <planeGeometry args={[5.4, 4.4]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.8} metalness={0.1} />
      </mesh>

      {/* Walls */}
      <mesh position={[2.5, 1.4, -0.1]} castShadow receiveShadow>
        <boxGeometry args={[5.4, 2.8, 0.2]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
      </mesh>
      <mesh position={[2.5, 1.4, 4.1]} castShadow receiveShadow>
        <boxGeometry args={[5.4, 2.8, 0.2]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
      </mesh>
      <mesh position={[-0.1, 1.4, 2]} castShadow receiveShadow>
        <boxGeometry args={[0.2, 2.8, 4.4]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
      </mesh>
      <mesh position={[5.1, 1.4, 2]} castShadow receiveShadow>
        <boxGeometry args={[0.2, 2.8, 4.4]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
      </mesh>

      <OrbitControls target={[2.5, 1.2, 2]} makeDefault />
    </>
  );
}

export function SimpleWebGLFallback({ children }: { children?: ReactNode }): JSX.Element {
  return (
    <div className="spatial-editor">
      <div className="spatial-editor-notice">
        <span>当前处于 WebGL 预览模式</span>
        {children ? <div className="spatial-editor-notice-actions">{children}</div> : null}
      </div>
      <Canvas camera={{ position: [8, 6, 8], fov: 45 }} shadows>
        <Room />
      </Canvas>
    </div>
  );
}
