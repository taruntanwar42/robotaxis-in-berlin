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

// Drag is the optional reward: grab the car, turn it. It otherwise rests.
const DRAG_RAD_PER_PX = 0.006

// Soft round ground shadow, generated — no texture asset.
function makeGroundShadow() {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext("2d")
  if (ctx) {
    const gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 128)
    gradient.addColorStop(0, "rgba(0,0,0,0.62)")
    gradient.addColorStop(0.65, "rgba(0,0,0,0.18)")
    gradient.addColorStop(1, "rgba(0,0,0,0)")
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 256, 256)
  }
  const texture = new THREE.CanvasTexture(canvas)
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(5.6, 3.4),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  )
  plane.rotation.x = -Math.PI / 2
  plane.position.y = 0.001
  return plane
}

function buildCabScene(container: HTMLDivElement, onReady: () => void) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(
    28,
    container.clientWidth / Math.max(container.clientHeight, 1),
    0.1,
    50,
  )

  // Metallic paint is dead without an environment; the built-in room gives
  // studio reflections with no texture assets. Kept restrained — the vibe is
  // a dark showroom, not a bright turntable stage.
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

  const key = new THREE.DirectionalLight(0xffffff, 1.9)
  key.position.set(-2.5, 6, 3)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0xffffff, 0.8)
  rim.position.set(3, 4, -4)
  scene.add(rim)

  const cab = new THREE.Group()
  scene.add(cab)
  scene.add(makeGroundShadow())

  let disposed = false
  new GLTFLoader().load(cybercabModelUrl, (gltf) => {
    if (disposed) {
      return
    }
    const model = gltf.scene
    // The export's node transforms are untrustworthy (Sketchfab viewer pose
    // baked into the root). Clear that pose, then orient by MEASUREMENT:
    // smallest extent = up, longest = length, tires mark down, taillights
    // mark the rear. No axis conventions assumed.
    const poseRoot = model.getObjectByName("Sketchfab_model")
    if (poseRoot) {
      poseRoot.position.set(0, 0, 0)
      poseRoot.quaternion.identity()
    }

    const AXIS_X = new THREE.Vector3(1, 0, 0)
    const AXIS_Y = new THREE.Vector3(0, 1, 0)
    const AXIS_Z = new THREE.Vector3(0, 0, 1)
    const rotate = (axis: THREE.Vector3, angle: number) => {
      model.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle))
    }
    const measure = () => {
      model.updateMatrixWorld(true)
      return new THREE.Box3().setFromObject(model)
    }
    const partCenter = (name: string) => {
      const part = model.getObjectByName(name)
      if (!part) {
        return null
      }
      model.updateMatrixWorld(true)
      return new THREE.Box3().setFromObject(part).getCenter(new THREE.Vector3())
    }

    // 1. Up: the car's smallest extent is its height — bring it to Y.
    let size = measure().getSize(new THREE.Vector3())
    if (size.z < size.y && size.z < size.x) {
      rotate(AXIS_X, -Math.PI / 2)
    } else if (size.x < size.y && size.x < size.z) {
      rotate(AXIS_Z, Math.PI / 2)
    }
    // 2. Length along X.
    size = measure().getSize(new THREE.Vector3())
    if (size.z > size.x) {
      rotate(AXIS_Y, Math.PI / 2)
    }
    // 3. Wheels down: the near-black tire meshes must sit below mid-height.
    let box = measure()
    const tires = partCenter("Cube_Material.003_0")
    if (tires && tires.y > (box.min.y + box.max.y) / 2) {
      rotate(AXIS_X, Math.PI)
    }
    // 4. Nose toward -X (the camera's side). The red light-bar mesh sits at
    // the tail end of THIS export — verified visually, not assumed.
    box = measure()
    const tail = partCenter("Cube_Material.004_0")
    if (tail && tail.x > (box.min.x + box.max.x) / 2) {
      rotate(AXIS_Y, Math.PI)
    }

    // Normalize: center on origin, wheels on y=0, known length for framing.
    box = measure()
    size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const scale = 3.2 / Math.max(size.x, 0.0001)
    model.scale.setScalar(scale)
    model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale)
    cab.add(model)

    // Restrained reflections keep the gold gold instead of milky.
    model.traverse((object) => {
      const material = (object as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (material && "envMapIntensity" in material) {
        material.envMapIntensity = 0.6
      }
    })

    // Black-glass floor: a faint mirrored ghost under the ground plane.
    const reflection = model.clone(true)
    reflection.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (mesh.isMesh && mesh.material) {
        const cloned = (mesh.material as THREE.MeshStandardMaterial).clone()
        cloned.transparent = true
        cloned.opacity = 0.09
        cloned.depthWrite = false
        mesh.material = cloned
      }
    })
    reflection.scale.y *= -1
    reflection.position.y = -reflection.position.y
    cab.add(reflection)

    // Resting pose: front three-quarter from the left, camera just above the
    // beltline — the product-shot angle, static.
    cab.rotation.y = 1.5 + Math.PI
    const height = size.y * scale
    camera.position.set(-2.8, height * 0.5, 3.45)
    camera.lookAt(0, height * 0.35, 0)

    // First frame immediately — rAF may be suspended in an occluded window.
    renderer.render(scene, camera)
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
    const { renderer, scene, camera, cab, pmrem, dispose } = buildCabScene(container, () =>
      setCabReady(true),
    )

    let dragging = false
    let lastPointerX = 0
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
    }
    const onPointerUp = () => {
      dragging = false
    }
    container.addEventListener("pointerdown", onPointerDown)
    container.addEventListener("pointermove", onPointerMove)
    container.addEventListener("pointerup", onPointerUp)
    container.addEventListener("pointercancel", onPointerUp)

    // No document.hidden gate: rAF self-throttles in hidden tabs, and an
    // explicit gate leaves the canvas blank in occluded-window captures.
    let frameId = 0
    const renderLoop = () => {
      frameId = requestAnimationFrame(renderLoop)
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
          <div className="entry-cab-mount" ref={mountRef} />
        </div>
      </section>
      <div className="entry-map-veil" aria-hidden="true" />
    </div>
  )
}
