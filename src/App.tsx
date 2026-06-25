import { MapPinned, Moon, Pause, Play, RotateCcw, StepForward, Sun } from "lucide-react"
import type { FeatureCollection, Geometry, LineString } from "geojson"
import maplibregl, { type GeoJSONSource } from "maplibre-gl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import "./App.css"

const mapStyleUrl = import.meta.env.VITE_MAPTILER_STYLE_URL as string | undefined
const configuredDarkMapStyleUrl = import.meta.env.VITE_MAPTILER_DARK_STYLE_URL as string | undefined
const darkMapStyleUrl = configuredDarkMapStyleUrl ?? maptilerDarkStyleUrl(mapStyleUrl)
const scenarioApiUrl = import.meta.env.VITE_SCENARIO_API_URL as string | undefined
const districtScope = "reinickendorf-district"
const districtBounds: [Coordinate, Coordinate] = [
  [13.2016158, 52.5488064],
  [13.3892817, 52.6607387],
]

type Coordinate = [number, number]

type SumoVehicle = {
  id: string
  lon: number
  lat: number
  angle: number
  speed: number
  lane: string
  route: string
  kind?: "background"
}

type SumoTrafficLightDisplay =
  | "green"
  | "yellow"
  | "red"
  | "orange"
  | "off"
  | "static"

type SumoTrafficLightState = {
  state: string
  display: SumoTrafficLightDisplay
  phase: number
}

type SumoFrame = {
  simSec: number
  vehicleCount: number
  vehicles: SumoVehicle[]
  departed: string[]
  arrived: string[]
  trafficLights: Record<string, SumoTrafficLightState>
  running?: boolean
  delayMs?: number
}

type SumoSimStatus = {
  status: string
  statusText: string
  simSec: number
  step: number
  totalSteps: number
  delayMs?: number
  running?: boolean
  elapsedSec?: number
}

type SumoNetwork = {
  available: boolean
  scope?: string
  boundary?: FeatureCollection<Geometry>
  lanes: FeatureCollection<LineString>
  internalLanes: FeatureCollection<LineString>
  trafficLights: FeatureCollection
  signalLinks: FeatureCollection<LineString>
  counts: {
    lanes: number
    internalLanes: number
    trafficLights: number
    signalLinks: number
    totalLanes?: number
    totalInternalLanes?: number
  }
  limited?: boolean
}

type SumoLayerKey = "lanes" | "vehicles" | "trafficLights" | "boundary"
type AppTheme = "dark" | "light"
type MapCamera = {
  center: Coordinate
  zoom: number
  bearing: number
  pitch: number
}

const defaultSumoLayerVisibility: Record<SumoLayerKey, boolean> = {
  lanes: true,
  vehicles: true,
  trafficLights: true,
  boundary: true,
}
const sumoLayerIds: Record<SumoLayerKey, string[]> = {
  lanes: ["sumo-internal-lanes", "sumo-lanes"],
  vehicles: ["sumo-vehicles"],
  trafficLights: ["sumo-traffic-lights"],
  boundary: ["base-service-area-line"],
}

function maptilerDarkStyleUrl(styleUrl: string | undefined) {
  if (!styleUrl) {
    return undefined
  }

  if (styleUrl.includes("/bright-v2/")) {
    return styleUrl.replace("/bright-v2/", "/dataviz-dark/")
  }

  return styleUrl
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value)
}

function pointFeatureCollection(vehicles: SumoVehicle[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: vehicles.map((vehicle) => ({
      type: "Feature",
      properties: {
        id: vehicle.id,
        angle: vehicle.angle,
        speed: vehicle.speed,
        lane: vehicle.lane,
        route: vehicle.route,
        kind: vehicle.kind,
      },
      geometry: {
        type: "Point",
        coordinates: [vehicle.lon, vehicle.lat],
      },
    })),
  }
}

function trafficLightFeatureCollection(
  network: SumoNetwork | null,
  frame: SumoFrame | null,
): FeatureCollection<LineString> {
  if (!network) {
    return emptyFeatureCollection()
  }

  const liveStates = frame?.trafficLights ?? {}
  return {
    type: "FeatureCollection",
    features: network.signalLinks.features.map((feature) => {
      const properties = feature.properties ?? {}
      const trafficLightId = String(properties.trafficLightId ?? "")
      const linkIndex =
        typeof properties.linkIndex === "number"
          ? properties.linkIndex
          : Number(properties.linkIndex)
      const liveState = trafficLightId ? liveStates[trafficLightId] : undefined
      const stateChar = liveState?.state?.[linkIndex] ?? ""

      return {
        ...feature,
        properties: {
          ...properties,
          display: displaySignalState(stateChar),
          state: stateChar,
          phase: liveState?.phase ?? null,
        },
      }
    }),
  }
}

function trafficLightStateSignature(trafficLights: Record<string, SumoTrafficLightState>) {
  return Object.keys(trafficLights)
    .sort()
    .map((id) => {
      const light = trafficLights[id]
      return `${id}:${light.phase}:${light.state}`
    })
    .join("|")
}

function displaySignalState(stateChar: string): SumoTrafficLightDisplay {
  if (stateChar === "G" || stateChar === "g") {
    return "green"
  }

  if (stateChar === "y" || stateChar === "Y") {
    return "yellow"
  }

  if (stateChar === "u") {
    return "orange"
  }

  if (stateChar === "r" || stateChar === "R" || stateChar === "s") {
    return "red"
  }

  if (stateChar === "o" || stateChar === "O") {
    return "off"
  }

  return "static"
}

function source(map: maplibregl.Map, id: string) {
  return map.getSource(id) as GeoJSONSource | undefined
}

function emptyFeatureCollection<T extends Geometry = Geometry>(): FeatureCollection<T> {
  return { type: "FeatureCollection", features: [] }
}

function ensureSumoLaneLayers(map: maplibregl.Map) {
  if (!map.isStyleLoaded()) {
    return false
  }

  if (!map.getSource("sumo-internal-lanes")) {
    map.addSource("sumo-internal-lanes", {
      type: "geojson",
      data: emptyFeatureCollection<LineString>(),
    })
  }

  if (!map.getSource("sumo-lanes")) {
    map.addSource("sumo-lanes", {
      type: "geojson",
      data: emptyFeatureCollection<LineString>(),
    })
  }

  const beforeVehicleLayer = map.getLayer("sumo-vehicles") ? "sumo-vehicles" : undefined

  if (!map.getLayer("sumo-internal-lanes")) {
    map.addLayer(
      {
        id: "sumo-internal-lanes",
        type: "line",
        source: "sumo-internal-lanes",
        paint: {
          "line-color": "#8bfff0",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            0.24,
            14,
            0.58,
            16,
            1.1,
          ],
          "line-opacity": 0.2,
        },
      },
      beforeVehicleLayer,
    )
  }

  if (!map.getLayer("sumo-lanes")) {
    map.addLayer(
      {
        id: "sumo-lanes",
        type: "line",
        source: "sumo-lanes",
        paint: {
          "line-color": "#d8f7ff",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            0.32,
            14,
            0.8,
            16,
            1.45,
          ],
          "line-opacity": 0.46,
        },
      },
      beforeVehicleLayer,
    )
  }

  return true
}

function applySumoOverlayTheme(map: maplibregl.Map, theme: AppTheme) {
  if (map.getLayer("sumo-internal-lanes")) {
    map.setPaintProperty(
      "sumo-internal-lanes",
      "line-color",
      theme === "light" ? "#138b86" : "#8bfff0",
    )
    map.setPaintProperty("sumo-internal-lanes", "line-opacity", theme === "light" ? 0.34 : 0.2)
  }

  if (map.getLayer("sumo-lanes")) {
    map.setPaintProperty(
      "sumo-lanes",
      "line-color",
      theme === "light" ? "#355c67" : "#d8f7ff",
    )
    map.setPaintProperty("sumo-lanes", "line-opacity", theme === "light" ? 0.68 : 0.46)
  }
}

function ensureSumoTrafficLightLayers(map: maplibregl.Map) {
  const hasSignalSource = Boolean(map.getSource("sumo-traffic-lights"))
  const hasSignalLayer = Boolean(map.getLayer("sumo-traffic-lights"))
  if (!map.isStyleLoaded() && (!hasSignalSource || !hasSignalLayer)) {
    return false
  }

  if (!hasSignalSource) {
    map.addSource("sumo-traffic-lights", {
      type: "geojson",
      data: emptyFeatureCollection<LineString>(),
    })
  }

  if (!hasSignalLayer) {
    map.addLayer(
      {
        id: "sumo-traffic-lights",
        type: "line",
        source: "sumo-traffic-lights",
        paint: {
          "line-color": [
            "match",
            ["get", "display"],
            "green",
            "#35e878",
            "yellow",
            "#d8c344",
            "red",
            "#e34343",
            "orange",
            "#c98532",
            "off",
            "#8b969b",
            "static",
            "#8b969b",
            "#8b969b",
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13,
            0.35,
            15.2,
            0.95,
            16.2,
            1.55,
            18,
            2.25,
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13,
            0.3,
            15.2,
            0.72,
            16.2,
            0.92,
            18,
            1,
          ],
        },
      },
      map.getLayer("sumo-vehicles") ? "sumo-vehicles" : undefined,
    )
  }

  return true
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2))
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

function createBackgroundVehicleMarkerImage() {
  const pixelRatio = 4
  const canvas = document.createElement("canvas")
  canvas.width = 14 * pixelRatio
  canvas.height = 24 * pixelRatio
  const context = canvas.getContext("2d")
  if (!context) {
    return null
  }

  context.scale(pixelRatio, pixelRatio)
  context.translate(7, 12)
  context.fillStyle = "rgba(7, 13, 17, 0.38)"
  drawRoundedRect(context, -3.4, -7.6, 6.8, 15.4, 3)
  context.fill()

  context.fillStyle = "#f2f6f7"
  context.beginPath()
  context.moveTo(0, -9)
  context.bezierCurveTo(2.7, -7.1, 3.7, -4.4, 3.5, 4.3)
  context.bezierCurveTo(3.1, 7.1, 2, 8.4, 0, 8.8)
  context.bezierCurveTo(-2, 8.4, -3.1, 7.1, -3.5, 4.3)
  context.bezierCurveTo(-3.7, -4.4, -2.7, -7.1, 0, -9)
  context.closePath()
  context.fill()

  context.fillStyle = "#1f2b31"
  drawRoundedRect(context, -2, -3.7, 4, 6.8, 1.8)
  context.fill()
  context.fillStyle = "#d8e1e4"
  drawRoundedRect(context, -1.7, -7, 3.4, 2.4, 1)
  context.fill()
  context.fillStyle = "#c8d2d6"
  drawRoundedRect(context, -1.7, 5.1, 3.4, 2.1, 1)
  context.fill()

  return {
    data: context.getImageData(0, 0, canvas.width, canvas.height),
    pixelRatio,
  }
}

function setSumoLayerVisibility(
  map: maplibregl.Map,
  visibility: Record<SumoLayerKey, boolean>,
) {
  Object.entries(sumoLayerIds).forEach(([key, layerIds]) => {
    layerIds.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(
          layerId,
          "visibility",
          visibility[key as SumoLayerKey] ? "visible" : "none",
        )
      }
    })
  })
}

function backendWebSocketUrl(path: string) {
  if (!scenarioApiUrl) {
    return null
  }

  const baseUrl = scenarioApiUrl.replace(/\/$/, "")
  const protocolUrl = baseUrl.startsWith("https://")
    ? baseUrl.replace("https://", "wss://")
    : baseUrl.replace("http://", "ws://")
  return `${protocolUrl}${path}`
}

function backendHttpUrl(path: string) {
  if (!scenarioApiUrl) {
    return null
  }

  return `${scenarioApiUrl.replace(/\/$/, "")}${path}`
}

export default function App() {
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sumoStatus, setSumoStatus] = useState("Idle")
  const [sumoFrame, setSumoFrame] = useState<SumoFrame | null>(null)
  const [sumoSimStatus, setSumoSimStatus] = useState<SumoSimStatus | null>(null)
  const [sumoNetwork, setSumoNetwork] = useState<SumoNetwork | null>(null)
  const [isSumoNetworkLoading, setIsSumoNetworkLoading] = useState(false)
  const [isSumoConnected, setIsSumoConnected] = useState(false)
  const [isSumoRunning, setIsSumoRunning] = useState(false)
  const [sumoDelayMs, setSumoDelayMs] = useState(0)
  const [appTheme, setAppTheme] = useState<AppTheme>("light")
  const [sumoLayerVisibility, setSumoLayerVisibilityState] = useState<
    Record<SumoLayerKey, boolean>
  >(defaultSumoLayerVisibility)
  const [baseMapReadyTick, setBaseMapReadyTick] = useState(0)

  const baseMapContainerRef = useRef<HTMLDivElement | null>(null)
  const baseMapRef = useRef<maplibregl.Map | null>(null)
  const appThemeRef = useRef<AppTheme>("light")
  const pendingThemeCameraRef = useRef<MapCamera | null>(null)
  const sumoNetworkRef = useRef<SumoNetwork | null>(null)
  const sumoLayerVisibilityRef = useRef<Record<SumoLayerKey, boolean>>(
    defaultSumoLayerVisibility,
  )
  const sumoTrafficLightGeojsonRef = useRef<FeatureCollection<LineString>>(
    emptyFeatureCollection<LineString>(),
  )
  const latestSumoFrameRef = useRef<SumoFrame | null>(null)
  const lastTrafficLightSignatureRef = useRef("")
  const lastSumoUiUpdateRef = useRef(0)
  const sumoSocketRef = useRef<WebSocket | null>(null)
  const sumoDelayMsRef = useRef(0)

  const currentMapStyleUrl = appTheme === "dark" ? darkMapStyleUrl : mapStyleUrl

  useEffect(() => {
    sumoNetworkRef.current = sumoNetwork
  }, [sumoNetwork])

  useEffect(() => {
    sumoLayerVisibilityRef.current = sumoLayerVisibility
  }, [sumoLayerVisibility])

  useEffect(() => {
    sumoDelayMsRef.current = sumoDelayMs
  }, [sumoDelayMs])

  useEffect(() => {
    appThemeRef.current = appTheme
  }, [appTheme])

  const captureActiveMapCamera = () => {
    const map = baseMapRef.current
    if (!map) {
      return
    }

    const center = map.getCenter()
    pendingThemeCameraRef.current = {
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    }
  }

  const syncSumoNetworkLayers = useCallback((map = baseMapRef.current) => {
    const network = sumoNetworkRef.current
    if (!map || !network || !ensureSumoLaneLayers(map)) {
      return false
    }

    ensureSumoTrafficLightLayers(map)
    applySumoOverlayTheme(map, appThemeRef.current)
    source(map, "sumo-lanes")?.setData(network.lanes)
    source(map, "sumo-internal-lanes")?.setData(network.internalLanes)
    source(map, "sumo-traffic-lights")?.setData(sumoTrafficLightGeojsonRef.current)
    setSumoLayerVisibility(map, sumoLayerVisibilityRef.current)
    map.triggerRepaint()
    return true
  }, [])

  const updateSumoTrafficLightSource = useCallback(
    (map: maplibregl.Map, frame: SumoFrame, force = false) => {
      const network = sumoNetworkRef.current
      if (!network || network.signalLinks.features.length === 0) {
        return false
      }

      const lightSignature = trafficLightStateSignature(frame.trafficLights)
      if (!force && lightSignature === lastTrafficLightSignatureRef.current) {
        return true
      }

      if (!ensureSumoTrafficLightLayers(map)) {
        return false
      }

      const nextTrafficLights = trafficLightFeatureCollection(network, frame)
      if (nextTrafficLights.features.length === 0) {
        return false
      }

      lastTrafficLightSignatureRef.current = lightSignature
      sumoTrafficLightGeojsonRef.current = nextTrafficLights
      source(map, "sumo-traffic-lights")?.setData(nextTrafficLights)
      map.triggerRepaint()
      return true
    },
    [],
  )

  const sumoVehicleGeojson = useMemo(
    () => pointFeatureCollection(sumoFrame?.vehicles ?? []),
    [sumoFrame],
  )

  const sumoTrafficLightGeojson = useMemo(
    () => trafficLightFeatureCollection(sumoNetwork, null),
    [sumoNetwork],
  )

  const sumoBoundaryGeojson = sumoNetwork?.boundary ?? null

  useEffect(() => {
    sumoTrafficLightGeojsonRef.current = sumoTrafficLightGeojson
    lastTrafficLightSignatureRef.current = ""
    const map = baseMapRef.current
    const latestFrame = latestSumoFrameRef.current
    if (map && latestFrame) {
      updateSumoTrafficLightSource(map, latestFrame, true)
    }
  }, [sumoTrafficLightGeojson, updateSumoTrafficLightSource])

  useEffect(() => {
    const map = baseMapRef.current
    if (!map) {
      return
    }

    source(map, "base-service-area")?.setData(
      sumoBoundaryGeojson ?? emptyFeatureCollection<Geometry>(),
    )
  }, [baseMapReadyTick, sumoBoundaryGeojson])

  useEffect(() => {
    if (!scenarioApiUrl) {
      setLoadError("Backend URL is not configured.")
      setSumoStatus("Backend not configured")
      setIsSumoNetworkLoading(false)
      return
    }

    const networkUrl = backendHttpUrl(`/sumo/${districtScope}/network`)
    if (!networkUrl) {
      setIsSumoNetworkLoading(false)
      return
    }
    const url = networkUrl

    let isCancelled = false
    async function loadSumoNetwork() {
      setIsSumoNetworkLoading(true)
      try {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`SUMO network request failed: ${response.status}`)
        }

        const network = (await response.json()) as SumoNetwork
        if (isCancelled) {
          return
        }

        if (!network.available) {
          throw new Error("SUMO network is unavailable.")
        }

        setSumoNetwork(network)
        setSumoStatus("Ready")
        setLoadError(null)
      } catch (error) {
        if (!isCancelled) {
          setSumoStatus("Network layer unavailable")
          setLoadError(error instanceof Error ? error.message : "Network layer unavailable.")
        }
      } finally {
        if (!isCancelled) {
          setIsSumoNetworkLoading(false)
        }
      }
    }

    void loadSumoNetwork()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (!baseMapContainerRef.current || baseMapRef.current || !currentMapStyleUrl) {
      return
    }

    const restoredCamera = pendingThemeCameraRef.current
    const map = new maplibregl.Map({
      container: baseMapContainerRef.current,
      style: currentMapStyleUrl,
      ...(restoredCamera
        ? {
            center: restoredCamera.center,
            zoom: restoredCamera.zoom,
          }
        : {
            bounds: districtBounds,
            fitBoundsOptions: {
              padding: { top: 48, bottom: 48, left: 104, right: 430 },
              maxZoom: 11.75,
            },
          }),
      pitch: restoredCamera?.pitch ?? 0,
      bearing: restoredCamera?.bearing ?? 0,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right")
    map.addControl(new maplibregl.AttributionControl({ compact: true }))

    const syncNetworkLayers = () => {
      syncSumoNetworkLayers(map)
    }

    map.on("load", () => {
      map.addSource("base-service-area", {
        type: "geojson",
        data: emptyFeatureCollection<Geometry>(),
      })
      map.addSource("sumo-vehicles", {
        type: "geojson",
        data: emptyFeatureCollection(),
      })
      const backgroundVehicleMarker = createBackgroundVehicleMarkerImage()
      if (backgroundVehicleMarker && !map.hasImage("sumo-background-vehicle-marker")) {
        map.addImage("sumo-background-vehicle-marker", backgroundVehicleMarker.data, {
          pixelRatio: backgroundVehicleMarker.pixelRatio,
        })
      }
      map.addLayer({
        id: "base-service-area-line",
        type: "line",
        source: "base-service-area",
        paint: {
          "line-color": "#37d9ff",
          "line-width": 2.4,
          "line-dasharray": [2.4, 1.2],
          "line-opacity": 0.96,
        },
      })
      map.addLayer({
        id: "sumo-vehicles",
        type: "symbol",
        source: "sumo-vehicles",
        layout: {
          "icon-image": "sumo-background-vehicle-marker",
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            0.42,
            14,
            0.68,
            16,
            1.05,
          ],
          "icon-rotate": ["coalesce", ["get", "angle"], 0],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      })
      setSumoLayerVisibility(map, defaultSumoLayerVisibility)
      syncNetworkLayers()
      if (restoredCamera) {
        map.jumpTo(restoredCamera)
        pendingThemeCameraRef.current = null
      }
      setBaseMapReadyTick((tick) => tick + 1)
      map.once("idle", () => {
        syncNetworkLayers()
        setBaseMapReadyTick((tick) => tick + 1)
      })
    })
    map.on("idle", syncNetworkLayers)
    map.on("styledata", syncNetworkLayers)
    baseMapRef.current = map

    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(baseMapContainerRef.current)

    return () => {
      resizeObserver.disconnect()
      map.off("idle", syncNetworkLayers)
      map.off("styledata", syncNetworkLayers)
      map.remove()
      baseMapRef.current = null
      setBaseMapReadyTick((tick) => tick + 1)
    }
  }, [currentMapStyleUrl, syncSumoNetworkLayers])

  useEffect(() => {
    const map = baseMapRef.current
    if (!map || !map.isStyleLoaded()) {
      return
    }

    source(map, "sumo-vehicles")?.setData(sumoVehicleGeojson)
  }, [baseMapReadyTick, sumoVehicleGeojson])

  useEffect(() => {
    syncSumoNetworkLayers()
  }, [baseMapReadyTick, sumoLayerVisibility, sumoNetwork, syncSumoNetworkLayers])

  useEffect(() => {
    const map = baseMapRef.current
    if (!map || !ensureSumoTrafficLightLayers(map)) {
      return
    }

    source(map, "sumo-traffic-lights")?.setData(sumoTrafficLightGeojson)
    setSumoLayerVisibility(map, sumoLayerVisibility)
    map.triggerRepaint()
  }, [baseMapReadyTick, sumoLayerVisibility, sumoTrafficLightGeojson])

  useEffect(() => {
    const map = baseMapRef.current
    if (!map || !map.isStyleLoaded()) {
      return
    }

    setSumoLayerVisibility(map, sumoLayerVisibility)
  }, [sumoLayerVisibility])

  const sendSumoCommand = useCallback((command: string, payload: Record<string, unknown> = {}) => {
    const socket = sumoSocketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setSumoStatus("SUMO session unavailable")
      return false
    }

    socket.send(JSON.stringify({ command, ...payload }))
    return true
  }, [])

  const updateSumoDelay = useCallback(
    (value: number) => {
      const nextDelayMs = Number.isFinite(value)
        ? Math.max(0, Math.min(1000, Math.round(value)))
        : 0
      setSumoDelayMs(nextDelayMs)
      sumoDelayMsRef.current = nextDelayMs
      sendSumoCommand("delay", { delayMs: nextDelayMs })
    },
    [sendSumoCommand],
  )

  useEffect(() => {
    const wsUrl = backendWebSocketUrl(`/ws/sumo/${districtScope}`)
    const summaryUrl = backendHttpUrl(`/sumo/${districtScope}/summary`)
    if (!wsUrl) {
      setSumoStatus("Backend not configured")
      return
    }
    const socketUrl = wsUrl

    let isClosed = false
    let socket: WebSocket | null = null
    lastTrafficLightSignatureRef.current = ""
    latestSumoFrameRef.current = null
    lastSumoUiUpdateRef.current = 0
    setSumoStatus("Checking backend")

    async function connectToSumo() {
      if (!summaryUrl) {
        setSumoStatus("Backend not configured")
        return
      }

      try {
        const response = await fetch(summaryUrl)
        if (!response.ok) {
          setSumoStatus(
            response.status === 404
              ? "HF Space needs redeploy"
              : `Backend check failed ${response.status}`,
          )
          return
        }
      } catch {
        setSumoStatus("Backend unavailable")
        return
      }

      if (isClosed) {
        return
      }

      socket = new WebSocket(socketUrl)
      sumoSocketRef.current = socket
      socket.addEventListener("open", () => {
        setIsSumoConnected(true)
        setSumoStatus("Ready")
        socket?.send(JSON.stringify({ command: "delay", delayMs: sumoDelayMsRef.current }))
      })

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data) as SumoFrame & {
          type?: "hello" | "frame" | "simStatus" | "delay" | "done" | "error"
          message?: string
          statusText?: string
          status?: string
          step?: number
          totalSteps?: number
          elapsedSec?: number
        }

        if (message.type === "hello") {
          setIsSumoConnected(true)
          setSumoStatus("Ready")
          return
        }

        if (message.type === "delay") {
          if (typeof message.delayMs === "number") {
            setSumoDelayMs(message.delayMs)
          }
          return
        }

        if (message.type === "simStatus") {
          const nextStatus = message as unknown as SumoSimStatus
          setSumoSimStatus(nextStatus)
          setIsSumoRunning(Boolean(nextStatus.running))
          setSumoStatus(nextStatus.statusText ?? nextStatus.status ?? "Idle")
          if (typeof nextStatus.delayMs === "number") {
            setSumoDelayMs(nextStatus.delayMs)
          }
          return
        }

        if (message.type === "frame") {
          latestSumoFrameRef.current = message
          if (typeof message.running === "boolean") {
            setIsSumoRunning(message.running)
            setSumoStatus(message.running ? "Streaming" : "Paused")
          }
          if (typeof message.delayMs === "number") {
            setSumoDelayMs(message.delayMs)
          }
          const map = baseMapRef.current
          if (map) {
            source(map, "sumo-vehicles")?.setData(pointFeatureCollection(message.vehicles))
            updateSumoTrafficLightSource(map, message)
            map.triggerRepaint()
          }

          const now = performance.now()
          if (now - lastSumoUiUpdateRef.current >= 1000 / 60) {
            lastSumoUiUpdateRef.current = now
            setSumoFrame(message)
          }
          return
        }

        if (message.type === "done") {
          setIsSumoRunning(false)
          return
        }

        if (message.type === "error") {
          setSumoStatus(message.message ?? "SUMO error")
        }
      })

      socket.addEventListener("close", () => {
        if (sumoSocketRef.current === socket) {
          sumoSocketRef.current = null
        }
        setIsSumoConnected(false)
        setIsSumoRunning(false)
        if (!isClosed) {
          setSumoStatus("Disconnected")
        }
      })

      socket.addEventListener("error", () => {
        setSumoStatus("Connection error")
      })
    }

    void connectToSumo()

    return () => {
      isClosed = true
      if (sumoSocketRef.current === socket) {
        sumoSocketRef.current = null
      }
      socket?.close()
    }
  }, [updateSumoTrafficLightSource])

  return (
    <main className={`app-shell theme-${appTheme}`}>
      <aside className="nav-rail" aria-label="Simulation navigation">
        <div className="brand-mark">
          <MapPinned size={18} aria-hidden="true" />
        </div>
      </aside>

      <section className="map-stage" aria-label="SUMO traffic map">
        {mapStyleUrl ? (
          <div ref={baseMapContainerRef} className="map-canvas base-map-canvas" />
        ) : (
          <div className="map-fallback">
            <MapPinned size={30} />
            <h1>Map style missing</h1>
            <p>Add `VITE_MAPTILER_STYLE_URL` to `.env.local`.</p>
          </div>
        )}
        <div className="map-vignette" aria-hidden="true" />
      </section>

      <section className="sumo-panel" aria-label="Simulation control panel">
        <div className="panel-title-row">
          <div>
            <h1>Simulation Control Panel</h1>
          </div>
          <button
            type="button"
            className="theme-toggle"
            title={appTheme === "dark" ? "Switch to light map" : "Switch to dark map"}
            aria-label={appTheme === "dark" ? "Switch to light map" : "Switch to dark map"}
            onClick={() => {
              captureActiveMapCamera()
              setAppTheme((theme) => (theme === "dark" ? "light" : "dark"))
            }}
          >
            {appTheme === "dark" ? (
              <Sun size={16} aria-hidden="true" />
            ) : (
              <Moon size={16} aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="panel-box backend-sim-box" aria-label="Backend simulation controls">
          <div className="panel-box-header">
            <h2>Backend Sim</h2>
            {isSumoNetworkLoading ? (
              <span className="scope-loading" role="status" aria-label="Loading SUMO area">
                <span className="scope-loading-spinner" aria-hidden="true" />
              </span>
            ) : null}
          </div>

          <div className="sumo-status-grid">
            <Metric label="Status" value={sumoStatus} />
            <Metric label="Step" value={sumoSimStatus?.step ?? "--"} />
          </div>

          <div className="sumo-control-stack" aria-label="SUMO run controls">
            <div className="control-row">
              <button
                type="button"
                className="icon-button"
                disabled={!isSumoConnected || isSumoRunning}
                onClick={() => {
                  if (sendSumoCommand("start")) {
                    setSumoStatus("Starting")
                  }
                }}
              >
                <Play size={16} />
                <span>Start</span>
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={!isSumoConnected || !isSumoRunning}
                onClick={() => {
                  if (sendSumoCommand("stop")) {
                    setSumoStatus("Paused")
                  }
                }}
              >
                <Pause size={16} />
                <span>Stop</span>
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={!isSumoConnected || isSumoRunning}
                onClick={() => {
                  if (sendSumoCommand("step")) {
                    setSumoStatus("Stepping")
                  }
                }}
              >
                <StepForward size={16} />
                <span>Step</span>
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={!isSumoConnected}
                onClick={() => {
                  if (sendSumoCommand("reset")) {
                    setSumoStatus("Resetting")
                  }
                }}
              >
                <RotateCcw size={16} />
                <span>Reset</span>
              </button>
            </div>

            <div className="delay-control">
              <div className="delay-control-header">
                <label htmlFor="sumo-delay-ms">Delay</label>
                <input
                  id="sumo-delay-ms"
                  type="number"
                  min={0}
                  max={1000}
                  step={10}
                  value={sumoDelayMs}
                  onChange={(event) => updateSumoDelay(Number(event.target.value))}
                  aria-label="SUMO delay in milliseconds"
                />
                <span>ms</span>
              </div>
              <input
                type="range"
                min={0}
                max={1000}
                step={10}
                value={sumoDelayMs}
                onChange={(event) => updateSumoDelay(Number(event.target.value))}
                aria-label="SUMO delay slider"
              />
            </div>
          </div>
        </div>

        <div className="panel-box render-layers-box" aria-label="Render layer controls">
          <div className="panel-box-header">
            <h2>Render Layers</h2>
          </div>

          <div className="sumo-layer-list" aria-label="SUMO map layers">
            <LayerToggle
              label="Lanes"
              active={sumoLayerVisibility.lanes}
              onClick={() =>
                setSumoLayerVisibilityState((current) => ({
                  ...current,
                  lanes: !current.lanes,
                }))
              }
            />
            <LayerToggle
              label="Traffic"
              active={sumoLayerVisibility.vehicles}
              onClick={() =>
                setSumoLayerVisibilityState((current) => ({
                  ...current,
                  vehicles: !current.vehicles,
                }))
              }
            />
            <LayerToggle
              label="Boundary"
              active={sumoLayerVisibility.boundary}
              onClick={() =>
                setSumoLayerVisibilityState((current) => ({
                  ...current,
                  boundary: !current.boundary,
                }))
              }
            />
            <LayerToggle
              label="Lights"
              active={sumoLayerVisibility.trafficLights}
              onClick={() =>
                setSumoLayerVisibilityState((current) => ({
                  ...current,
                  trafficLights: !current.trafficLights,
                }))
              }
            />
          </div>
        </div>
      </section>

      {loadError ? <div className="error-banner">{loadError}</div> : null}
    </main>
  )
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{typeof value === "number" ? formatInteger(value) : value}</strong>
    </div>
  )
}

function LayerToggle({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={active ? "layer-toggle is-active" : "layer-toggle"}
      onClick={onClick}
      aria-pressed={active}
    >
      <span />
      {label}
    </button>
  )
}
