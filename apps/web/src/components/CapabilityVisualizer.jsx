import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const NODES = [
  { label: 'Studio', color: 0xff7a18, group: 'content' },
  { label: 'Research', color: 0xffbb3b, group: 'intelligence' },
  { label: 'Websites', color: 0xff8e5aff, group: 'build' },
  { label: 'AI teams', color: 0x4b91ff, group: 'workspace' },
  { label: 'Voice', color: 0x22c59a, group: 'voice' },
  { label: 'Visuals', color: 0xf14c9c, group: 'design' },
  { label: 'Meetings', color: 0x4cc7e8, group: 'productivity' },
  { label: 'Engineering', color: 0xffd166, group: 'engineering' },
];

export default function CapabilityVisualizer({ className = '' }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 8.2);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.18, 2),
      new THREE.MeshBasicMaterial({ color: 0xff7a18, wireframe: true, transparent: true, opacity: 0.72 }),
    );
    scene.add(core);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(1.72, 1.75, 96),
      new THREE.MeshBasicMaterial({ color: 0xffc15e, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }),
    );
    halo.rotation.x = 0.95;
    scene.add(halo);

    const nodeGroup = new THREE.Group();
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xf8b56b, transparent: true, opacity: 0.28 });
    const nodes = NODES.map((node, index) => {
      const angle = (index / NODES.length) * Math.PI * 2;
      const point = new THREE.Vector3(Math.cos(angle) * 2.48, Math.sin(angle) * 1.65, (index % 2 ? 0.4 : -0.45));
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 20, 20),
        new THREE.MeshBasicMaterial({ color: node.color }),
      );
      mesh.position.copy(point);
      nodeGroup.add(mesh);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), point]), lineMaterial);
      nodeGroup.add(line);
      return { mesh, angle, radius: point.length(), offset: index * 0.64 };
    });
    scene.add(nodeGroup);

    const stars = new THREE.BufferGeometry();
    const starPositions = new Float32Array(240 * 3);
    for (let i = 0; i < starPositions.length; i += 3) {
      starPositions[i] = (Math.random() - 0.5) * 11;
      starPositions[i + 1] = (Math.random() - 0.5) * 8;
      starPositions[i + 2] = -Math.random() * 4;
    }
    stars.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xffe2b9, size: 0.025, transparent: true, opacity: 0.8 })));

    let frame;
    const start = performance.now();
    const resize = () => {
      const size = Math.min(mount.clientWidth, mount.clientHeight || mount.clientWidth);
      renderer.setSize(size, size, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    };
    const animate = (now) => {
      const t = (now - start) * 0.00055;
      core.rotation.set(t * 0.55, t, t * 0.28);
      halo.rotation.z = -t * 0.45;
      nodeGroup.rotation.z = t * 0.3;
      nodes.forEach(({ mesh, angle, offset }) => {
        mesh.scale.setScalar(1 + Math.sin(t * 5 + offset) * 0.24);
        mesh.position.z = Math.sin(t * 2 + angle) * 0.35;
      });
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.dispose();
      core.geometry.dispose();
      core.material.dispose();
      halo.geometry.dispose();
      halo.material.dispose();
      lineMaterial.dispose();
      stars.dispose();
      mount.replaceChildren();
    };
  }, []);

  return <div ref={mountRef} aria-hidden="true" className={`pointer-events-none select-none ${className}`} />;
}
