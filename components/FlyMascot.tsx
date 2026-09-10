"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { AnimationAction, AnimationMixer, Group, Mesh, WebGLRenderer } from "three";

type Reaction = "BUY" | "SELL" | null;

/** Decorative mascot. Reactions mirror the caller's events; this never places orders. */
export default function FlyMascot({
  className = "",
  reaction = null,
  eager = false,
}: {
  className?: string;
  reaction?: Reaction;
  eager?: boolean;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const play = useRef<(name: string) => void>(() => {});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let loading = false;
    let visible = false;
    let raf = 0;
    let last = 0;
    let renderer: WebGLRenderer | undefined;
    let mixer: AnimationMixer | undefined;
    let model: Group | undefined;
    let resize: ResizeObserver | undefined;
    let draw = () => {};
    let active: AnimationAction | undefined;
    let idle: AnimationAction | undefined;
    const actions = new Map<string, AnimationAction>();

    const frame = (now: number) => {
      raf = 0;
      if (disposed || !visible || document.hidden || media.matches) return;
      if (!last || now - last >= 1000 / 30) {
        mixer?.update(last ? Math.min((now - last) / 1000, 0.1) : 0);
        last = now;
        draw();
      }
      raf = requestAnimationFrame(frame);
    };
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      if (media.matches) { draw(); return; }
      if (renderer && visible && !document.hidden && !disposed) raf = requestAnimationFrame(frame);
    };
    const releaseModel = (root: Group) => {
      root.traverse((obj) => {
        const mesh = obj as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => material.dispose());
      });
    };

    const load = async () => {
      if (loading || disposed || media.matches) return;
      loading = true;
      try {
        const [THREE, { GLTFLoader }] = await Promise.all([
          import("three"),
          import("three/addons/loaders/GLTFLoader.js"),
        ]);
        if (disposed) return;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.AgXToneMapping;
        renderer.toneMappingExposure = 1.35;
        renderer.domElement.setAttribute("aria-hidden", "true");
        renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
        host.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-2.7, 2.7, 2.25, -2.25, 0.1, 60);
        camera.position.set(4.3, 4.5, 7.5);
        camera.lookAt(-0.13, 1.1, 0);
        scene.add(new THREE.HemisphereLight(0xf1ffe5, 0x2c3721, 2.8));
        const key = new THREE.DirectionalLight(0xf0ffdd, 4.5);
        key.position.set(2, 6, 4); scene.add(key);
        const rim = new THREE.DirectionalLight(0xccff66, 3);
        rim.position.set(-3, 4.5, -2); scene.add(rim);
        const fill = new THREE.DirectionalLight(0xffd9c5, 2);
        fill.position.set(4, 3, -3); scene.add(fill);
        draw = () => renderer?.render(scene, camera);
        resize = new ResizeObserver(() => {
          if (!renderer || disposed) return;
          const { width, height } = host.getBoundingClientRect();
          if (!width || !height) return;
          const half = 2.25;
          camera.left = -half * width / height;
          camera.right = half * width / height;
          camera.top = half; camera.bottom = -half;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
          draw();
        });
        resize.observe(host);
        const gltf = await new GLTFLoader().loadAsync("/models/trenchfly/trenchfly.glb");
        if (disposed) { releaseModel(gltf.scene); return; }
        model = gltf.scene;
        scene.add(model);
        mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => actions.set(clip.name, mixer!.clipAction(clip)));
        idle = actions.get("Idle");
        active = idle;
        idle?.play();
        play.current = (name) => {
          if (media.matches || disposed) return;
          const next = actions.get(name);
          if (!next) return;
          next.reset().setLoop(THREE.LoopOnce, 1);
          next.clampWhenFinished = true;
          next.enabled = true;
          next.setEffectiveWeight(1).setEffectiveTimeScale(1).play();
          if (active && active !== next) active.crossFadeTo(next, 0.16, false);
          active = next;
        };
        mixer.addEventListener("finished", (event) => {
          if (event.action !== active || !idle) return;
          idle.reset().setEffectiveWeight(1).play();
          event.action.crossFadeTo(idle, 0.22, false);
          active = idle;
        });
        draw();
        setReady(true);
        sync();
      } catch (error) {
        // The rendered Blender poster remains visible if WebGL/model loading fails.
        console.warn("TrenchFly mascot: using still-image fallback", error);
        resize?.disconnect();
        renderer?.dispose();
        renderer?.domElement.remove();
        renderer = undefined;
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) void load();
      sync();
    }, { threshold: 0.01 });
    observer.observe(host);
    const preference = () => { if (visible) void load(); sync(); };
    media.addEventListener("change", preference);
    document.addEventListener("visibilitychange", sync);
    return () => {
      disposed = true;
      play.current = () => {};
      cancelAnimationFrame(raf);
      observer.disconnect(); resize?.disconnect();
      media.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", sync);
      mixer?.stopAllAction();
      if (model) { mixer?.uncacheRoot(model); releaseModel(model); }
      renderer?.dispose(); renderer?.domElement.remove();
    };
  }, []);

  useEffect(() => {
    if (reaction) play.current(reaction === "BUY" ? "BuyReact" : "SellReact");
  }, [reaction]);

  return (
    <div
      ref={mount}
      className={className}
      role="img"
      aria-label="Low-poly TrenchFly mascot with lime wings and red compound eyes"
      style={{ position: "relative", aspectRatio: "6 / 5", isolation: "isolate", overflow: "hidden" }}
    >
      <Image
        src="/models/trenchfly/fly-transparent.png"
        alt=""
        loading={eager ? "eager" : "lazy"}
        fill
        sizes="(max-width: 640px) 70vw, 330px"
        style={{ objectFit: "contain", opacity: ready ? 0 : 1 }}
      />
    </div>
  );
}
