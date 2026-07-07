import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import "./entry.css"

// v10 entry, beat 1: the app opens as the permanent layout — dark left pane,
// dimmed Berlin on the right — and the golden Cybercab presents itself in the
// pane. The pane is the canvas the whole intro lives on; the legacy idle UI
// stays mounted underneath until the new entry fully replaces it.

const cybercabModelUrl = `${import.meta.env.BASE_URL}assets/cybercab.glb`

// Slow enough to feel at rest, alive enough to prove it's 3D.
const TURNTABLE_RAD_PER_SEC = 0.14
// Drag is the optional reward: grab the car, spin it. Auto-rotation resumes
// after the hand lets go.
const DRAG_RAD_PER_PX = 0.006
const DRAG_RESUME_DELAY_MS = 2200

function buildCabScene(container: HTMLDivElement, onReady: () => void) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(
    32,
    container.clientWidth / Math.max(container.clientHeight, 1),
    0.1,
    50,
  )

  // Metallic paint is dead without an environment; the built-in room gives
  // studio reflections with no texture assets.
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

  // A soft key from above-left sculpts the body line beyond what the room
  // reflections give; no shadows — the ground shadow is a CSS ellipse.
  const key = new THREE.DirectionalLight(0xffffff, 1.4)
  key.position.set(-3, 5, 2)
  scene.add(key)
  scene.add(new THREE.AmbientLight(0xffffff, 0.35))

  const cab = new THREE.Group()
  scene.add(cab)

  let disposed = false
  new GLTFLoader().load(cybercabModelUrl, (gltf) => {
    if (disposed) {
      return
    }
    const model = gltf.scene
    // Normalize whatever the export baked in: center on origin, sit on y=0,
    // scale to a known length so camera framing is deterministic.
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const length = Math.max(size.x, size.z)
    const scale = 3.2 / Math.max(length, 0.0001)
    model.scale.setScalar(scale)
    model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)
    cab.add(model)

    // Three-quarter front view, slightly above — the product-shot angle.
    const height = size.y * scale
    camera.position.set(-3.4, height * 0.55 + 0.9, 4.6)
    camera.lookAt(0, height * 0.42, 0)
    cab.rotation.y = -0.5

    onReady()
  })

  return { renderer, scene, camera, cab, pmrem, dispose: () => (disposed = true) }
}

export function EntryPane() {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const [cabReady, setCabReady] = useState(false)

  useEffect(() => {
    const container = mountRef.current
    if (!container) {
      return
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const { renderer, scene, camera, cab, pmrem, dispose } = buildCabScene(container, () =>
      setCabReady(true),
    )

    let dragging = false
    let lastPointerX = 0
    let lastDragAt = 0
    const onPointerDown = (event: PointerEvent) => {
      dragging = true
      lastPointerX = event.clientX
      container.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) {
        return
      }
      cab.rotation.y += (event.clientX - lastPointerX) * DRAG_RAD_PER_PX
      lastPointerX = event.clientX
      lastDragAt = performance.now()
    }
    const onPointerUp = () => {
      dragging = false
      lastDragAt = performance.now()
    }
    container.addEventListener("pointerdown", onPointerDown)
    container.addEventListener("pointermove", onPointerMove)
    container.addEventListener("pointerup", onPointerUp)
    container.addEventListener("pointercancel", onPointerUp)

    let frameId = 0
    let lastTick = performance.now()
    const renderLoop = (now: number) => {
      frameId = requestAnimationFrame(renderLoop)
      const dt = Math.min((now - lastTick) / 1000, 0.1)
      lastTick = now
      if (document.hidden) {
        return
      }
      const restingSince = now - lastDragAt
      if (!dragging && !reducedMotion && restingSince > DRAG_RESUME_DELAY_MS) {
        cab.rotation.y += dt * TURNTABLE_RAD_PER_SEC
      }
      renderer.render(scene, camera)
    }
    frameId = requestAnimationFrame(renderLoop)

    const resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth
      const height = Math.max(container.clientHeight, 1)
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    })
    resizeObserver.observe(container)

    return () => {
      dispose()
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      container.removeEventListener("pointerdown", onPointerDown)
      container.removeEventListener("pointermove", onPointerMove)
      container.removeEventListener("pointerup", onPointerUp)
      container.removeEventListener("pointercancel", onPointerUp)
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (mesh.geometry) {
          mesh.geometry.dispose()
        }
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(material)) {
          material.forEach((entry) => entry.dispose())
        } else if (material) {
          material.dispose()
        }
      })
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <div className="entry-scrim">
      <section className="entry-pane" aria-label="Cybercab">
        <div className={cabReady ? "entry-cab is-ready" : "entry-cab"}>
          <span className="entry-cab-shadow" aria-hidden="true" />
          <div className="entry-cab-mount" ref={mountRef} />
        </div>
      </section>
      <div className="entry-map-veil" aria-hidden="true" />
    </div>
  )
}
