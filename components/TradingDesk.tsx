"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { AnimationAction, AnimationMixer, Group, Mesh, Texture, WebGLRenderer } from "three";

type Side = "BUY" | "SELL" | null;

/** An observation viewer: all movement follows a recorded decision; no order interface. */
export default function TradingDesk({ className, frameSha, reaction, reactionKey, motion, pressed }: {
  className?: string; frameSha: string | null; reaction: Side; reactionKey: string; motion: boolean; pressed: Side;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const motionRef = useRef(motion);
  const play = useRef<(side: Side) => void>(() => {});
  const syncMotion = useRef<() => void>(() => {});
  const changeFrame = useRef<(sha: string | null) => void>(() => {});
  const changeKeys = useRef<(side: Side) => void>(() => {});

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false, loading = false, visible = false, raf = 0, last = 0, textureVersion = 0;
    let renderer: WebGLRenderer | undefined, mixer: AnimationMixer | undefined, model: Group | undefined;
    let resize: ResizeObserver | undefined, currentTexture: Texture | undefined;
    let draw = () => {};
    let idle: AnimationAction | undefined, active: AnimationAction | undefined;
    const actions = new Map<string, AnimationAction>();
    let idleSeconds = 0, nextGroomAt = 6.5, groomIndex = 0;
    let groom = () => {};
    const releaseModel = (root: Group) => root.traverse(obj => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => material.dispose());
    });
    const frame = (time: number) => {
      raf = 0;
      if (disposed || !visible || document.hidden || media.matches) return;
      if (!last || time - last >= 1000 / 30) {
        const delta = last ? Math.min((time - last) / 1000, .1) : 0;
        if (!motionRef.current && active === idle) {
          idleSeconds += delta;
          if (idleSeconds >= nextGroomAt) { idleSeconds = 0; nextGroomAt = 13 + (groomIndex % 3) * 2; groom(); }
        }
        mixer?.update(delta);
        last = time; draw();
      }
      raf = requestAnimationFrame(frame);
    };
    const sync = () => {
      cancelAnimationFrame(raf); raf = 0; last = 0;
      if (media.matches) {
        if (mixer && idle) { mixer.stopAllAction(); idle.reset().play(); active = idle; mixer.update(0); }
        draw(); return;
      }
      if (renderer && visible && !document.hidden && !disposed) raf = requestAnimationFrame(frame);
    };
    syncMotion.current = sync;

    const load = async () => {
      if (loading || disposed) return;
      loading = true;
      try {
        const [THREE, { GLTFLoader }] = await Promise.all([import("three"), import("three/addons/loaders/GLTFLoader.js")]);
        if (disposed) return;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.AgXToneMapping;
        renderer.toneMappingExposure = 1.2;
        renderer.domElement.setAttribute("aria-hidden", "true");
        renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
        host.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, .1, 60);
        camera.position.set(-5.9, 5.9, 8.2); camera.lookAt(.55, 1.35, 0);
        scene.add(new THREE.HemisphereLight(0xe8ffda, 0x192619, 2.3));
        const key = new THREE.DirectionalLight(0xe6ffcd, 4); key.position.set(-3, 7, 4); scene.add(key);
        const rim = new THREE.DirectionalLight(0xc5ff6b, 3.3); rim.position.set(4, 6, -4); scene.add(rim);
        const fill = new THREE.DirectionalLight(0xffcfb1, 2); fill.position.set(3, 4, 3); scene.add(fill);
        draw = () => renderer?.render(scene, camera);
        resize = new ResizeObserver(() => {
          if (!renderer || disposed) return;
          const { width, height } = host.getBoundingClientRect();
          if (!width || !height) return;
          const half = Math.max(2.65, 3.5 * height / width);
          camera.left = -half * width / height; camera.right = half * width / height;
          camera.top = half; camera.bottom = -half; camera.updateProjectionMatrix();
          renderer.setSize(width, height, false); draw();
        });
        resize.observe(host);
        const gltf = await new GLTFLoader().loadAsync("/models/robinfly/robinfly-desk-v2.glb");
        if (disposed) { releaseModel(gltf.scene); return; }
        model = gltf.scene; scene.add(model);
        const screen = model.getObjectByName("RF_ChartScreen") as Mesh;
        if (!screen?.isMesh) throw new Error("Desk monitor surface missing");
        (Array.isArray(screen.material) ? screen.material : [screen.material]).forEach(material => material.dispose());
        const screenMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
        screen.material = screenMaterial;
        const texture = (next: Texture) => {
          next.flipY = false; next.colorSpace = THREE.SRGBColorSpace;
          next.minFilter = THREE.LinearFilter; next.magFilter = THREE.LinearFilter;
          currentTexture?.dispose(); currentTexture = next;
          screenMaterial.map = next; screenMaterial.needsUpdate = true; draw();
        };
        const statusScreen = (label: string) => {
          const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
          const context = canvas.getContext("2d");
          if (context) {
            context.fillStyle = "#0a130d"; context.fillRect(0, 0, 640, 360);
            context.textAlign = "center"; context.fillStyle = "#d7ff3f"; context.font = "24px monospace";
            context.fillText("ROBINFLY", 320, 155); context.fillStyle = "#93a689"; context.font = "15px monospace";
            context.fillText(label, 320, 195);
          }
          texture(new THREE.CanvasTexture(canvas));
        };
        changeFrame.current = sha => {
          const version = ++textureVersion;
          statusScreen(sha ? "LOADING RECORDED CHART" : "AWAITING CHART INPUT");
          if (!sha || !/^[a-f\d]{64}$/i.test(sha)) return;
          void new THREE.TextureLoader().loadAsync(`https://raw.githubusercontent.com/plantsweb3/trenchfly/feed/frames/${sha}.png`).then(next => {
            if (disposed || version !== textureVersion) { next.dispose(); return; }
            texture(next);
          }).catch(() => { if (!disposed && version === textureVersion) statusScreen("SOURCE FRAME UNAVAILABLE"); });
        };
        statusScreen("AWAITING CHART INPUT");
        const keys = (["BUY", "SELL"] as const).map(side => {
          const object = model!.getObjectByName(side === "BUY" ? "RF_BuyKey" : "RF_SellKey");
          return { side, object, y: object?.position.y ?? 0 };
        });
        changeKeys.current = pressedSide => {
          keys.forEach(({ side, object, y }) => { if (object) object.position.y = y - (side === pressedSide ? .045 : 0); });
          draw();
        };
        mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach(clip => actions.set(clip.name, mixer!.clipAction(clip)));
        idle = actions.get("DeskIdle"); active = idle; idle?.play();
        play.current = side => {
          if (!side || disposed || media.matches) return;
          const next = actions.get(side === "BUY" ? "DeskBuy" : "DeskSell");
          if (!next) return;
          next.reset().setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true;
          next.enabled = true; next.setEffectiveWeight(1).setEffectiveTimeScale(1).play();
          if (active && active !== next) active.crossFadeTo(next, .12, false);
          active = next; idleSeconds = 0;
        };
        groom = () => {
          if (motionRef.current || media.matches || disposed || active !== idle) return;
          const next = actions.get(groomIndex++ % 2 === 0 ? "DeskHandRub" : "DeskFaceRub");
          if (!next) return;
          next.reset().setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true;
          next.enabled = true; next.setEffectiveWeight(1).setEffectiveTimeScale(1).play();
          active?.crossFadeTo(next, .25, false); active = next;
        };
        mixer.addEventListener("finished", event => {
          if (event.action !== active || !idle) return;
          idle.reset().setEffectiveWeight(1).play(); event.action.crossFadeTo(idle, .22, false); active = idle; idleSeconds = 0;
        });
        setReady(true); sync(); draw();
      } catch {
        resize?.disconnect(); currentTexture?.dispose();
        if (model) releaseModel(model);
        renderer?.dispose(); renderer?.domElement.remove(); renderer = undefined; model = undefined;
      }
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) void load(); sync(); }, { threshold: .01 });
    observer.observe(host);
    media.addEventListener("change", sync); document.addEventListener("visibilitychange", sync);
    return () => {
      disposed = true; textureVersion++; cancelAnimationFrame(raf);
      play.current = () => {}; syncMotion.current = () => {}; changeKeys.current = () => {}; changeFrame.current = () => {};
      observer.disconnect(); resize?.disconnect(); media.removeEventListener("change", sync); document.removeEventListener("visibilitychange", sync);
      mixer?.stopAllAction(); if (model) { mixer?.uncacheRoot(model); releaseModel(model); }
      currentTexture?.dispose(); renderer?.dispose(); renderer?.domElement.remove();
    };
  }, []);
  useEffect(() => { motionRef.current = motion; syncMotion.current(); }, [motion]);
  useEffect(() => { if (ready && motion && reaction) play.current(reaction); }, [ready, motion, reaction, reactionKey]);
  useEffect(() => { if (ready) changeFrame.current(frameSha); }, [ready, frameSha]);
  useEffect(() => { if (ready) changeKeys.current(pressed); }, [ready, pressed]);

  return <div ref={mount} className={className} role="img" aria-label="RobinFly at his rigged trading desk. The monitor shows the recorded chart and front legs reach for the BUY and SELL keys." style={{ position: "relative", width: "100%", height: "100%", isolation: "isolate", overflow: "hidden" }}>
    <Image src="/models/robinfly/desk-preview.png" alt="" fill sizes="(max-width: 760px) 100vw, 65vw" style={{ objectFit: "contain", opacity: ready ? 0 : 1 }} />
  </div>;
}
