import { useEffect, useRef, useState } from "react";

/** The machine itself: a slow turntable of the Cybercab GLB.
 * three.js and the model are loaded lazily when the section nears the
 * viewport, so the brief's initial load pays nothing for the cameo. */
export function CabViewer() {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    const start = async () => {
      try {
        const three = await import("three");
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        if (disposed || !host.current) return;

        const width = el.clientWidth;
        const height = Math.min(340, Math.max(240, width * 0.42));
        const renderer = new three.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        el.appendChild(renderer.domElement);

        const scene = new three.Scene();
        const camera = new three.PerspectiveCamera(32, width / height, 0.1, 100);

        scene.add(new three.AmbientLight(0x8f9bb8, 0.9));
        const key = new three.DirectionalLight(0xfff2cf, 2.2);
        key.position.set(4, 6, 5);
        scene.add(key);
        const rim = new three.DirectionalLight(0xf5c518, 1.4);
        rim.position.set(-6, 3, -4);
        scene.add(rim);

        const gltf = await new GLTFLoader().loadAsync(
          `${import.meta.env.BASE_URL}assets/cybercab.glb`,
        );
        if (disposed) return;
        const cab = gltf.scene;

        // center on origin, normalize size
        const box = new three.Box3().setFromObject(cab);
        const size = box.getSize(new three.Vector3());
        const center = box.getCenter(new three.Vector3());
        cab.position.sub(center);
        const scale = 3.4 / Math.max(size.x, size.y, size.z);
        cab.scale.setScalar(scale);
        const pivot = new three.Group();
        pivot.add(cab);
        scene.add(pivot);

        camera.position.set(2.6, 1.15, 3.4);
        camera.lookAt(0, -0.1, 0);

        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        pivot.rotation.y = -0.7;

        renderer.render(scene, camera); // paint frame 0 even if rAF is throttled
        let raf = 0;
        const tick = () => {
          if (!reduce) pivot.rotation.y += 0.0035;
          renderer.render(scene, camera);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        cleanup = () => {
          cancelAnimationFrame(raf);
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch {
        if (!disposed) setFailed(true);
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void start();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);

    return () => {
      disposed = true;
      io.disconnect();
      cleanup?.();
    };
  }, []);

  if (failed) return null;
  return (
    <div
      ref={host}
      aria-label="Rotating 3D model of the Tesla Cybercab"
      role="img"
      style={{ width: "100%", overflow: "hidden", borderRadius: 12 }}
    />
  );
}
