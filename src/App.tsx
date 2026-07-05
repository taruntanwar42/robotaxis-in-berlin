import {
  Car,
  MapPinned,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  StepForward,
  Sun,
  X,
} from "lucide-react"
import type { Feature, FeatureCollection, Geometry, LineString, Point, Polygon } from "geojson"
import maplibregl, { type GeoJSONSource } from "maplibre-gl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import "./App.css"
import {
  type CybercabCabRow,
  CybercabExperience,
  type CybercabExperienceData,
  type CybercabRequestMarker,
  type CybercabRequestMarkerStatus,
  type ExperiencePhase,
} from "./components/CybercabExperience"

const mapStyleUrl = import.meta.env.VITE_MAPTILER_STYLE_URL as string | undefined
const configuredDarkMapStyleUrl = import.meta.env.VITE_MAPTILER_DARK_STYLE_URL as string | undefined
const darkMapStyleUrl = configuredDarkMapStyleUrl ?? maptilerDarkStyleUrl(mapStyleUrl)
const scenarioApiUrl = import.meta.env.VITE_SCENARIO_API_URL as string | undefined
const bestCutoutsUrl = `${import.meta.env.BASE_URL}data/cutouts/best-cutouts.geojson`
const cybercabDepotMarkerUrl = `${import.meta.env.BASE_URL}assets/cybercab-depot-marker.png?v=9`
const districtScope = "charlottenburg-moabit-tiergarten"
// 1 replay frame = 1 sim-second; 25 ms per frame = 40x visual speed,
// so the 18:00-19:00 window plays in ~90 real seconds.
const playbackFrameIntervalMs = 25
const playbackLowWatermarkFrames = 250
const playbackRetainedPastFrames = 20
const showEngineeringDiagnostics =
  import.meta.env.DEV && import.meta.env.VITE_SHOW_ENGINEERING_DIAGNOSTICS === "true"
const playbackModes = [5, 10, 25, 50, 100, 250, 500, 1000] as const
type PlaybackMode = (typeof playbackModes)[number]
const defaultPlaybackMode: PlaybackMode = 1000
const demandSource = "matsim"
const dispatchEngine = "taxi"
// Corridor bbox (13.276-13.382, 52.495-52.544) extended north to include the
// fixed TXL depot marker at (13.303, 52.557).
const activeScenarioBounds: [Coordinate, Coordinate] = [
  [13.2758, 52.4952],
  [13.3818, 52.5572],
]

type Coordinate = [number, number]

type SumoVehicle = {
  id: string
  lon: number
  lat: number
  angle: number
  speed?: number
  lane?: string
  edge?: string
  route?: string
  routeCoordinates?: Coordinate[] | null
  kind?: "background" | "robotaxi"
  state?: string | null
}

type RobotaxiRequestStatus =
  | "scheduled"
  | "waiting"
  | "assigned"
  | "onboard"
  | "completed"
  | "capacity_miss"
  | "unreachable"
  | "vehicle_failed"
  | "rejected"
  | "expired"

type RobotaxiRequest = {
  id: string
  sourceVehicleId?: string | null
  source?: string | null
  sourcePersonId?: string | null
  sourceTripId?: string | null
  sourceMode?: string | null
  status: RobotaxiRequestStatus
  requestedAtSec: number
  pickupAtSec?: number | null
  completedAtSec?: number | null
  expiredAtSec?: number | null
  assignedVehicleId?: string | null
  pickup: { lon: number; lat: number }
  dropoff: { lon: number; lat: number }
  pickupEdge: string
  dropoffEdge: string
  partySize?: number | null
  passengers?: number | null
  cybercabSeats?: number | null
  cybercabCapable?: boolean | null
  capacityMissAtSec?: number | null
  pickupMapDistanceM?: number | null
  dropoffMapDistanceM?: number | null
  rejectionReason?: string | null
  tripDistanceKm?: number | null
  waitSec?: number | null
  error?: string | null
}

type DispatchDemandMetadata = {
  source?: string
  percent: number
  sourceTripCount: number
  targetRequestCount: number
  rejectedRequestCount?: number
  rejectionCounts?: Record<string, number>
  removedVehicles: number
  usingFallbackDemand?: boolean
  error?: string | null
}

type RobotaxiDispatch = {
  fleetInit?: {
    requested: number
    added: number
    parkStopIssued: number
    chargerCount?: number
    chargingPowerKw?: number
    batteryCapacityKwh?: number
    initialChargeKwh?: number
    errors: string[]
  }
  demand?: DispatchDemandMetadata
  replacement?: DispatchDemandMetadata
  robotaxis?: RobotaxiFleetItem[]
  requests?: RobotaxiRequest[]
  metrics: {
    targetRequests: number
    sourceTripCount: number
    demandSource?: string
    replacementPercent: number
    removedVehicles: number
    rejectedRequests?: number
    rejectionCounts?: Record<string, number>
    requestStatusCounts?: Record<string, number>
    requestOutcomeCounts?: Record<string, number>
    rejectionReasonCounts?: Record<string, number>
    notServedRequests?: number
    serviceWindowRejected?: number
    unreachableRejected?: number
    reservationCanceled?: number
    dispatchFailed?: number
    completionRatePercent?: number
    waiting: number
    assigned: number
    onboard: number
    completed: number
    failed: number
    avgWaitSec: number | null
    activeRobotaxis: number
    chargingRobotaxis?: number
    readyRobotaxis?: number
    availableRobotaxis?: number
    availableCabs?: number
    lowBatteryReturns?: number
    chargingUnavailable?: number
    stagingTrips?: number
    openRequests?: number
    acceptedRequests?: number
    activeRequests?: number
    fleetAtDepot?: number
    fleetReadyAtDepot?: number
    maxWaitSec?: number | null
    p95WaitSec?: number | null
    serviceWindowComplete?: boolean
    auditStatus?: "pass" | "review" | string
    auditWarnings?: string[]
    fleetStateCounts?: Record<string, number>
    passengersCompleted?: number
    cybercabServeableRequests?: number
    passengerKm?: number
    vehicleKm?: number
    emptyKm?: number
    deadheadingPercent?: number
    seatKmWaste?: number
    energyKwh?: number
    energyWhPerPassengerKm?: number
    chargingSessions?: number
    chargeSessions?: number
    depotUtilizationPercent?: number
  }
}

type RobotaxiFleetItem = {
  id: string
  status: string
  requestId?: string | null
  targetEdge?: string | null
  locationEdge?: string | null
  phaseSinceSec?: number | null
  batteryWh?: number | null
  batteryKwh?: number | null
  batteryPercent?: number | null
  chargingSessionActive?: boolean | null
  chargingSessions?: number | null
  error?: string | null
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
  vehicleCount?: number
  robotaxiCount?: number
  vehicles: SumoVehicle[]
  departed?: string[]
  arrived?: string[]
  trafficLights: Record<string, SumoTrafficLightState | string>
  running?: boolean
  delayMs?: number
  dispatch?: RobotaxiDispatch
  phase?: string
  metrics?: unknown
  cabs?: unknown
  cybercabs?: unknown
  robotaxis?: unknown
  requests?: unknown
  requestMarkers?: unknown
  mapRequests?: unknown
  totals?: unknown
  audit?: unknown
  finalAudit?: unknown
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
  depot?: FeatureCollection<Geometry>
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

type SumoScenarioWindow = {
  startSec: number
  endSec: number
  label?: string
}

type SumoScenarioSummary = {
  window?: SumoScenarioWindow
}

type SumoLayerKey =
  | "lanes"
  | "vehicles"
  | "trafficLights"
  | "boundary"
  | "requests"
  | "cutouts"
type AppTheme = "dark" | "light"
type MapCamera = {
  center: Coordinate
  zoom: number
  bearing: number
  pitch: number
}

type RenderDiagnostics = {
  renderFps: number
  dataFps: number
  backendStepMs: number
  backendFrameMs: number
  backendVehicleIdMs: number
  backendVehicleLoopMs: number
  backendTrafficLightMs: number
  backendChunkMs: number
  backendSendMs: number
  frontendParseMs: number
  frontendAppendMs: number
  chunkFrames: number
}

type PlaybackStatus = "Idle" | "Buffering" | "Playing" | "Paused" | "Ended" | "Error"

type RobotaxiRunAudit = {
  window?: string
  timeSec?: number
  completed: number
  openRequests: number
  notServedRequests: number
  avgWaitSec: number | null
  maxWaitSec: number | null
  vehicleKm: number
  deadheadKm: number
  deadheadingPercent: number
  energyKwh: number
  energyWhPerPassengerKm?: number | null
  chargingSessions: number
  lowBatteryReturns?: number
  stagingTrips?: number
  fleetStateCounts?: Record<string, number>
  fleetAtDepot: number
  fleetSize: number
  nonDepotRobotaxis: string[]
  allFleetRecovered: boolean
  passed: boolean
}

const defaultSumoLayerVisibility: Record<SumoLayerKey, boolean> = {
  lanes: true,
  vehicles: true,
  trafficLights: true,
  boundary: true,
  requests: true,
  cutouts: false,
}
const sumoLayerIds: Record<SumoLayerKey, string[]> = {
  lanes: ["sumo-internal-lanes", "sumo-lanes"],
  vehicles: ["sumo-vehicles", "sumo-cybercab-glow", "sumo-cybercabs"],
  trafficLights: ["sumo-traffic-lights"],
  boundary: [
    "service-area-halo",
    "sumo-depot-fill",
    "sumo-depot-line",
    "sumo-depot-label",
    "base-service-area-line",
  ],
  requests: ["robotaxi-request-paths", "robotaxi-request-markers"],
  cutouts: ["best-cutouts-line", "best-cutouts-label"],
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

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function formatSeconds(value: number | null | undefined) {
  if (!isFiniteNumber(value)) {
    return "--"
  }

  return `${Math.round(value)}s`
}

function formatSignedInteger(value: number | null | undefined) {
  return isFiniteNumber(value) ? formatInteger(value) : "--"
}

function formatStepWidth(mode: PlaybackMode) {
  const stepWidth = mode <= 50 ? mode / 50 : 1
  return Number.isInteger(stepWidth) ? `${stepWidth}s` : `${stepWidth.toFixed(1)}s`
}

function formatVisualSampling(mode: PlaybackMode) {
  if (mode <= 50) {
    return "every frame"
  }

  return `every ${mode / 50}${mode === 100 ? "nd" : "th"} frame`
}

function formatSimClock(simSec: number | null | undefined) {
  if (typeof simSec !== "number" || !Number.isFinite(simSec)) {
    return "--"
  }

  const wholeSeconds = Math.max(0, Math.floor(simSec))
  const hours = Math.floor(wholeSeconds / 3600)
  const minutes = Math.floor((wholeSeconds % 3600) / 60)

  return [hours, minutes].map((part) => String(part).padStart(2, "0")).join(":")
}

function formatWindowLabel(window: SumoScenarioWindow | null | undefined) {
  if (!window) {
    return "18:00-21:00"
  }
  return window.label || `${formatSimClock(window.startSec)}-${formatSimClock(window.endSec)}`
}

function formatBatteryPercent(value: number | null | undefined) {
  return isFiniteNumber(value) ? `${Math.round(value)}%` : "--"
}

function formatCabId(index: number) {
  return `cybercab_${String(index + 1).padStart(2, "0")}`
}

function formatCabStatus(status: string | null | undefined) {
  if (!status) {
    return "offline"
  }

  return status.replace(/_/g, " ")
}

function formatCabAssignment(status: string | null | undefined, requestId: string | null | undefined) {
  if (requestId) {
    return `#${requestId.replace(/^matsim_/, "")}`
  }

  const normalized = (status || "offline").replace(/_/g, " ")
  if (normalized.includes("charging")) {
    return "charging"
  }
  if (normalized.includes("returning")) {
    return "depot return"
  }
  if (normalized.includes("en route pickup") || normalized.includes("assigned")) {
    return "assigned"
  }
  if (normalized.includes("passenger") || normalized.includes("onboard")) {
    return "on trip"
  }
  if (normalized.includes("repositioning") || normalized.includes("staging")) {
    return "positioning"
  }
  if (normalized.includes("service")) {
    return "service hold"
  }
  if (normalized.includes("safe") || normalized.includes("support")) {
    return "support"
  }
  if (normalized.includes("failed") || normalized.includes("error")) {
    return "attention"
  }
  if (normalized.includes("offline")) {
    return "no telemetry"
  }
  if (normalized.includes("depot") || normalized.includes("idle") || normalized.includes("staged")) {
    return "no assignment"
  }

  return "standby"
}

function cabStatusClass(status: string | null | undefined) {
  return `is-${(status || "offline").replace(/[\s_]+/g, "-")}`
}

function cabStatusRank(status: string | null | undefined) {
  const normalized = formatCabStatus(status).toLowerCase()
  if (normalized.includes("passenger")) return 0
  if (normalized.includes("pickup")) return 1
  if (normalized.includes("returning")) return 2
  if (normalized.includes("charging")) return 3
  if (normalized.includes("safe") || normalized.includes("support") || normalized.includes("failed")) return 3
  if (normalized.includes("depot") || normalized.includes("standby") || normalized.includes("idle")) return 4
  if (normalized.includes("offline")) return 6
  return 5
}

function fleetStateSummary(rows: Array<{ displayStatus: string }>) {
  const counts = {
    active: 0,
    charging: 0,
    standby: 0,
  }

  for (const row of rows) {
    const normalized = formatCabStatus(row.displayStatus).toLowerCase()
    if (
      normalized.includes("passenger") ||
      normalized.includes("pickup") ||
      normalized.includes("returning")
    ) {
      counts.active += 1
    } else if (normalized.includes("charging")) {
      counts.charging += 1
    } else {
      counts.standby += 1
    }
  }

  return counts
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function recordsFromUnknownArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function firstRecordArray(records: Record<string, unknown>[], fieldNames: string[]) {
  for (const record of records) {
    for (const fieldName of fieldNames) {
      const rows = recordsFromUnknownArray(record[fieldName])
      if (rows.length > 0) {
        return rows
      }
    }
  }
  return []
}

function numberFromRecord(record: Record<string, unknown>, fieldNames: string[]) {
  for (const fieldName of fieldNames) {
    const value = record[fieldName]
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
  }
  return undefined
}

function stringFromRecord(record: Record<string, unknown>, fieldNames: string[]) {
  for (const fieldName of fieldNames) {
    const value = record[fieldName]
    if (typeof value === "string" && value.trim()) {
      return value
    }
  }
  return undefined
}

function experienceMetricRecords(frame: SumoFrame | null) {
  const records: Record<string, unknown>[] = []
  if (!frame) {
    return records
  }

  records.push(frame as unknown as Record<string, unknown>)
  if (isRecord(frame.dispatch)) {
    records.push(frame.dispatch)
    if (isRecord(frame.dispatch.metrics)) {
      records.push(frame.dispatch.metrics)
    }
  }
  for (const value of [frame.metrics, frame.totals, frame.audit, frame.finalAudit]) {
    if (isRecord(value)) {
      records.push(value)
    }
  }
  return records
}

function pickExperienceMetric(frame: SumoFrame | null, fieldNames: string[]) {
  for (const record of experienceMetricRecords(frame)) {
    const value = numberFromRecord(record, fieldNames)
    if (value !== undefined) {
      return value
    }
  }
  return undefined
}

function normalizeCabRows(frame: SumoFrame | null): CybercabCabRow[] {
  const records = experienceMetricRecords(frame)
  const contractRows = firstRecordArray(records, ["cabRows", "cabs", "cybercabs", "robotaxis"])
  const vehiclesById = new Map((frame?.vehicles ?? []).map((vehicle) => [vehicle.id, vehicle]))

  if (contractRows.length > 0) {
    return contractRows.map((record, index) => {
      const id = stringFromRecord(record, ["id", "vehicleId", "cabId"]) ?? `cybercab_${index + 1}`
      const vehicle = vehiclesById.get(id)
      return {
        id,
        label: stringFromRecord(record, ["label", "displayLabel", "name"]) ?? `Cybercab ${index + 1}`,
        state: stringFromRecord(record, ["state", "status", "displayStatus"]),
        speedKph:
          numberFromRecord(record, ["speedKph", "speed"]) ??
          (typeof vehicle?.speed === "number" ? vehicle.speed * 3.6 : undefined),
        etaSec: numberFromRecord(record, ["etaSec", "etaSeconds"]),
        target: stringFromRecord(record, ["target", "targetEdge", "destination"]),
        stopReason: stringFromRecord(record, ["stopReason", "reason"]),
        requestId: stringFromRecord(record, ["requestId", "assignedRequestId"]),
        requestContext: stringFromRecord(record, ["requestContext", "assignmentLabel"]),
        lon: numberFromRecord(record, ["lon", "lng"]) ?? vehicle?.lon,
        lat: numberFromRecord(record, ["lat"]) ?? vehicle?.lat,
        heading: numberFromRecord(record, ["heading", "angle"]) ?? vehicle?.angle,
      }
    })
  }

  return (frame?.dispatch?.robotaxis ?? []).map((cab, index) => {
    const vehicle = vehiclesById.get(cab.id)
    return {
      id: cab.id,
      label: `Cybercab ${index + 1}`,
      state: formatCabStatus(cab.status),
      speedKph: typeof vehicle?.speed === "number" ? vehicle.speed * 3.6 : undefined,
      target: cab.targetEdge ?? cab.locationEdge ?? undefined,
      stopReason: cab.error ?? undefined,
      requestId: cab.requestId ?? undefined,
      requestContext: cab.requestId ? `Request ${cab.requestId}` : undefined,
      lon: vehicle?.lon,
      lat: vehicle?.lat,
      heading: vehicle?.angle,
    }
  })
}

function requestMarkerStatus(status: string | undefined): CybercabRequestMarkerStatus | null {
  if (!status) {
    return null
  }
  // "scheduled" requests are future demand, not open ride requests.
  if (status === "waiting" || status === "open") {
    return "open"
  }
  if (status === "assigned" || status === "onboard" || status === "accepted") {
    return "accepted"
  }
  if (status === "completed") {
    return "completed"
  }
  return null
}

function normalizeRequestMarkers(frame: SumoFrame | null): CybercabRequestMarker[] {
  const records = experienceMetricRecords(frame)
  const contractRows = firstRecordArray(records, ["mapRequests", "requestMarkers", "requests"])

  if (contractRows.length > 0) {
    return contractRows.flatMap((record, index) => {
      const status = requestMarkerStatus(
        stringFromRecord(record, ["markerState", "status", "state", "displayState"]),
      )
      const origin = isRecord(record.origin) ? record.origin : record
      const lon = numberFromRecord(origin, ["lon", "lng", "originLon"])
      const lat = numberFromRecord(origin, ["lat", "originLat"])
      if (!status || lon === undefined || lat === undefined) {
        return []
      }
      return [
        {
          id: stringFromRecord(record, ["id", "requestId"]) ?? `request-${index}`,
          status,
          lon,
          lat,
          assignedCabId: stringFromRecord(record, ["assignedCabId", "assignedVehicleId"]),
        },
      ]
    })
  }

  return (frame?.dispatch?.requests ?? []).flatMap((request) => {
    const status = requestMarkerStatus(request.status)
    if (!status) {
      return []
    }
    return [
      {
        id: request.id,
        status,
        lon: request.pickup.lon,
        lat: request.pickup.lat,
        assignedCabId: request.assignedVehicleId ?? undefined,
      },
    ]
  })
}

function isSumoFrame(value: unknown): value is SumoFrame {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.simSec === "number" &&
    Array.isArray(value.vehicles) &&
    isRecord(value.trafficLights)
  )
}

function normalizePlaybackFrame(frame: SumoFrame): SumoFrame {
  return {
    ...frame,
    vehicleCount: frame.vehicleCount ?? frame.vehicles.length,
    departed: frame.departed ?? [],
    arrived: frame.arrived ?? [],
    vehicles: frame.vehicles.map((vehicle) => ({
      ...vehicle,
      speed: vehicle.speed ?? 0,
      lane: vehicle.lane ?? "",
      edge: vehicle.edge ?? "",
      route: vehicle.route ?? "",
      kind: vehicle.kind ?? "background",
      state: vehicle.state ?? null,
    })),
    dispatch: frame.dispatch,
  }
}

function playbackFramesFromPayload(payload: unknown): SumoFrame[] {
  if (isSumoFrame(payload)) {
    return [normalizePlaybackFrame(payload)]
  }

  if (Array.isArray(payload)) {
    return payload.filter(isSumoFrame).map(normalizePlaybackFrame)
  }

  if (!isRecord(payload)) {
    return []
  }

  const directFrames = payload.frames
  if (Array.isArray(directFrames)) {
    return directFrames.filter(isSumoFrame).map(normalizePlaybackFrame)
  }

  const directFrame = payload.frame
  if (isSumoFrame(directFrame)) {
    return [normalizePlaybackFrame(directFrame)]
  }

  const nestedData = payload.data
  if (nestedData !== undefined) {
    const nestedFrames = playbackFramesFromPayload(nestedData)
    if (nestedFrames.length > 0) {
      return nestedFrames
    }
  }

  const nestedChunk = payload.chunk
  if (nestedChunk !== undefined) {
    return playbackFramesFromPayload(nestedChunk)
  }

  return []
}

function playbackCursorFromPayload(payload: unknown) {
  if (!isRecord(payload)) {
    return null
  }

  const cursor = payload.nextCursor ?? payload.cursor
  if (typeof cursor === "string" || typeof cursor === "number") {
    return cursor
  }

  return null
}

function playbackDoneFromPayload(payload: unknown) {
  if (!isRecord(payload)) {
    return false
  }

  return payload.done === true || payload.type === "done"
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
        state: vehicle.state,
      },
      geometry: {
        type: "Point",
        coordinates: [vehicle.lon, vehicle.lat],
      },
    })),
  }
}

function pulseOpacity(simSec: number, high = 0.94, low = 0.28) {
  return Math.sin(simSec * Math.PI * 2.4) >= 0 ? high : low
}

function distanceMeters(a: { lon: number; lat: number }, b: { lon: number; lat: number }) {
  const latMeters = 111_320
  const lonMeters = latMeters * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180))
  const dx = (a.lon - b.lon) * lonMeters
  const dy = (a.lat - b.lat) * latMeters
  return Math.sqrt(dx * dx + dy * dy)
}

function visibleCompletedRequest(
  request: RobotaxiRequest,
  simSec: number,
  vehiclesById: Map<string, SumoVehicle>,
) {
  if (request.status !== "completed" || typeof request.completedAtSec !== "number") {
    return false
  }

  const assignedVehicleId = request.assignedVehicleId ?? ""
  const vehicle = vehiclesById.get(assignedVehicleId)
  if (!vehicle) {
    return simSec - request.completedAtSec <= 2
  }

  return distanceMeters(vehicle, request.dropoff) <= 22 && (vehicle.speed ?? 0) <= 2.5
}

function robotaxiRequestFeatureCollection(
  requests: RobotaxiRequest[] | undefined,
  simSec = 0,
  vehicles: SumoVehicle[] = [],
): FeatureCollection<Point> {
  const features: Array<Feature<Point>> = []
  const vehiclesById = new Map(
    vehicles
      .filter((vehicle) => vehicle.kind === "robotaxi")
      .map((vehicle) => [vehicle.id, vehicle] as const),
  )

  for (const request of requests ?? []) {
    const common = {
      requestId: request.id,
      status: request.status,
      assignedVehicleId: request.assignedVehicleId ?? "",
      waitSec: request.waitSec ?? null,
    }

    if (request.status === "waiting" || request.status === "assigned") {
      features.push({
        type: "Feature",
        properties: {
          ...common,
          id: `${request.id}:pickup`,
          pointType: "pickup",
          visual: request.status === "waiting" ? "pickup-waiting" : "pickup-assigned",
          opacity: request.status === "waiting" ? pulseOpacity(simSec, 0.94, 0.32) : 0.92,
        },
        geometry: {
          type: "Point",
          coordinates: [request.pickup.lon, request.pickup.lat],
        },
      })
    }

    if (request.status === "onboard") {
      const opacity = pulseOpacity(simSec, 0.95, 0.36)
      if (
        typeof request.pickupAtSec === "number" &&
        simSec - request.pickupAtSec <= 8
      ) {
        features.push({
          type: "Feature",
          properties: {
            ...common,
            id: `${request.id}:pickup`,
            pointType: "pickup",
            visual: "pickup-arrived",
            opacity,
          },
          geometry: {
            type: "Point",
            coordinates: [request.pickup.lon, request.pickup.lat],
          },
        })
      }
      features.push({
        type: "Feature",
        properties: {
          ...common,
          id: `${request.id}:dropoff`,
          pointType: "dropoff",
          visual: "dropoff-active",
          opacity,
        },
        geometry: {
          type: "Point",
          coordinates: [request.dropoff.lon, request.dropoff.lat],
        },
      })
    }

    if (
      request.status === "expired" &&
      typeof request.expiredAtSec === "number" &&
      simSec - request.expiredAtSec <= 80
    ) {
      const expiredAge = Math.max(0, simSec - request.expiredAtSec)
      features.push({
        type: "Feature",
        properties: {
          ...common,
          id: `${request.id}:pickup`,
          pointType: "pickup",
          visual: "pickup-expired",
          opacity: 0.4 * (1 - expiredAge / 80),
        },
        geometry: {
          type: "Point",
          coordinates: [request.pickup.lon, request.pickup.lat],
        },
      })
    }

    if (visibleCompletedRequest(request, simSec, vehiclesById)) {
      features.push({
        type: "Feature",
        properties: {
          ...common,
          id: `${request.id}:dropoff`,
          pointType: "dropoff",
          visual: "dropoff-completed",
          opacity: 0.9,
        },
        geometry: {
          type: "Point",
          coordinates: [request.dropoff.lon, request.dropoff.lat],
        },
      })
    }
  }

  return {
    type: "FeatureCollection",
    features,
  }
}

function robotaxiRequestPathFeatureCollection(
  requests: RobotaxiRequest[] | undefined,
  vehicles: SumoVehicle[],
): FeatureCollection<LineString> {
  const vehiclesById = new Map(
    vehicles
      .filter((vehicle) => vehicle.kind === "robotaxi")
      .map((vehicle) => [vehicle.id, vehicle] as const),
  )

  return {
    type: "FeatureCollection",
    features: (requests ?? [])
      .flatMap((request): Array<Feature<LineString>> => {
        const assignedVehicleId = request.assignedVehicleId ?? ""
        const vehicle = vehiclesById.get(assignedVehicleId)
        if (!vehicle) {
          return []
        }
        const routeCoordinates = vehicle.routeCoordinates ?? []
        if (routeCoordinates.length < 2) {
          return []
        }

        if (request.status === "assigned") {
          return [
            {
              type: "Feature",
              properties: {
                requestId: request.id,
                assignedVehicleId,
                visual: "pickup-path",
              },
              geometry: {
                type: "LineString",
                coordinates: routeCoordinates,
              },
            },
          ]
        }

        if (request.status === "onboard") {
          return [
            {
              type: "Feature",
              properties: {
                requestId: request.id,
                assignedVehicleId,
                visual: "dropoff-path",
              },
              geometry: {
                type: "LineString",
                coordinates: routeCoordinates,
              },
            },
          ]
        }

        return []
      }),
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
      const stateString = typeof liveState === "string" ? liveState : liveState?.state
      const stateChar = stateString?.[linkIndex] ?? ""

      return {
        ...feature,
        properties: {
          ...properties,
          display: displaySignalState(stateChar),
          state: stateChar,
          phase: typeof liveState === "string" ? null : liveState?.phase ?? null,
        },
      }
    }),
  }
}

function trafficLightStateSignature(trafficLights: Record<string, SumoTrafficLightState | string>) {
  return Object.keys(trafficLights)
    .sort()
    .map((id) => {
      const light = trafficLights[id]
      return typeof light === "string" ? `${id}:${light}` : `${id}:${light.phase}:${light.state}`
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

function closeRing(ring: Coordinate[]) {
  if (ring.length === 0) {
    return ring
  }

  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] === last[0] && first[1] === last[1]) {
    return ring
  }

  return [...ring, first]
}

function collectExteriorRings(geojson: FeatureCollection<Geometry> | null | undefined) {
  const rings: Coordinate[][] = []
  for (const feature of geojson?.features ?? []) {
    const geometry = feature.geometry
    if (!geometry) {
      continue
    }

    if (geometry.type === "Polygon") {
      const coordinates = geometry.coordinates as Coordinate[][]
      if (coordinates[0]?.length) {
        rings.push(closeRing(coordinates[0]))
      }
    }

    if (geometry.type === "MultiPolygon") {
      const polygons = geometry.coordinates as Coordinate[][][]
      for (const polygon of polygons) {
        if (polygon[0]?.length) {
          rings.push(closeRing(polygon[0]))
        }
      }
    }
  }
  return rings
}

function signedRingArea(ring: Coordinate[]) {
  return ring.reduce((area, [lon, lat], index) => {
    const [nextLon, nextLat] = ring[(index + 1) % ring.length]
    return area + lon * nextLat - nextLon * lat
  }, 0)
}

function orientRing(ring: Coordinate[], clockwise: boolean) {
  const closedRing = closeRing(ring)
  const isClockwise = signedRingArea(closedRing) < 0
  return isClockwise === clockwise ? closedRing : [...closedRing].reverse()
}

function serviceHaloFeatureCollection(
  boundary: FeatureCollection<Geometry> | null | undefined,
): FeatureCollection<Polygon> {
  const serviceRings = collectExteriorRings(boundary)
  if (serviceRings.length === 0) {
    return emptyFeatureCollection<Polygon>()
  }

  const outerRing = orientRing([
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ], false)
  const clearRings = serviceRings.map((ring) => orientRing(ring, true))

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [outerRing, ...clearRings],
        },
      },
    ],
  }
}

function depotLabelFeatureCollection(
  depot: FeatureCollection<Geometry> | null | undefined,
): FeatureCollection<Point> {
  const points = collectExteriorRings(depot).flat()
  if (points.length === 0) {
    return emptyFeatureCollection<Point>()
  }

  const bounds = points.reduce(
    (current, [lon, lat]) => ({
      minLon: Math.min(current.minLon, lon),
      maxLon: Math.max(current.maxLon, lon),
      minLat: Math.min(current.minLat, lat),
      maxLat: Math.max(current.maxLat, lat),
    }),
    {
      minLon: Number.POSITIVE_INFINITY,
      maxLon: Number.NEGATIVE_INFINITY,
      minLat: Number.POSITIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY,
    },
  )

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          label: "CYBERCAB DEPOT",
        },
        geometry: {
          type: "Point",
          coordinates: [
            (bounds.minLon + bounds.maxLon) / 2,
            (bounds.minLat + bounds.maxLat) / 2,
          ],
        },
      },
    ],
  }
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
          "line-opacity": 0.22,
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
          "line-color": "#8fd8e4",
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
          "line-opacity": 0.42,
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
      theme === "light" ? "#8fd8e4" : "#8bfff0",
    )
    map.setPaintProperty("sumo-internal-lanes", "line-opacity", theme === "light" ? 0.24 : 0.18)
  }

  if (map.getLayer("sumo-lanes")) {
    map.setPaintProperty(
      "sumo-lanes",
      "line-color",
      theme === "light" ? "#8fd8e4" : "#8fd8e4",
    )
    map.setPaintProperty("sumo-lanes", "line-opacity", theme === "light" ? 0.26 : 0.34)
  }

  if (map.getLayer("sumo-depot-fill")) {
    map.setPaintProperty("sumo-depot-fill", "fill-color", theme === "light" ? "#222826" : "#18231d")
    map.setPaintProperty("sumo-depot-fill", "fill-opacity", theme === "light" ? 0.12 : 0.18)
  }

  if (map.getLayer("service-area-halo")) {
    map.setPaintProperty("service-area-halo", "fill-color", theme === "light" ? "#1f3036" : "#01090d")
    map.setPaintProperty("service-area-halo", "fill-opacity", theme === "light" ? 0.17 : 0.42)
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

function createCybercabMarkerImage() {
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

  context.shadowColor = "rgba(255, 182, 36, 0.7)"
  context.shadowBlur = 4
  context.fillStyle = "rgba(255, 191, 52, 0.38)"
  drawRoundedRect(context, -4.2, -8.6, 8.4, 17.2, 3.7)
  context.fill()
  context.shadowBlur = 0

  context.fillStyle = "rgba(68, 43, 4, 0.38)"
  drawRoundedRect(context, -3.2, -7.2, 6.4, 14.6, 2.8)
  context.fill()

  context.fillStyle = "#e5a51d"
  context.beginPath()
  context.moveTo(0, -9)
  context.bezierCurveTo(2.8, -7.3, 3.8, -4.4, 3.6, 4.5)
  context.bezierCurveTo(3.2, 7.3, 2.1, 8.5, 0, 8.9)
  context.bezierCurveTo(-2.1, 8.5, -3.2, 7.3, -3.6, 4.5)
  context.bezierCurveTo(-3.8, -4.4, -2.8, -7.3, 0, -9)
  context.closePath()
  context.fill()

  context.fillStyle = "#ffd76a"
  drawRoundedRect(context, -1.8, -7.1, 3.6, 2.5, 1.1)
  context.fill()

  context.fillStyle = "#10161a"
  drawRoundedRect(context, -2.1, -3.7, 4.2, 6.9, 1.9)
  context.fill()

  context.fillStyle = "#b87b10"
  drawRoundedRect(context, -1.8, 5.1, 3.6, 2.2, 1)
  context.fill()

  return {
    data: context.getImageData(0, 0, canvas.width, canvas.height),
    pixelRatio,
  }
}

function ensureCybercabDepotMarkerImage(map: maplibregl.Map) {
  if (map.hasImage("cybercab-depot-marker")) {
    return
  }

  const image = new Image()
  image.onload = () => {
    if (!map.hasImage("cybercab-depot-marker")) {
      map.addImage("cybercab-depot-marker", image, { pixelRatio: 2 })
      map.triggerRepaint()
    }
  }
  image.src = cybercabDepotMarkerUrl
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

  if (path.startsWith("ws://") || path.startsWith("wss://")) {
    return path
  }

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path.startsWith("https://")
      ? path.replace("https://", "wss://")
      : path.replace("http://", "ws://")
  }

  const baseUrl = scenarioApiUrl.replace(/\/$/, "")
  const protocolUrl = baseUrl.startsWith("https://")
    ? baseUrl.replace("https://", "wss://")
    : baseUrl.replace("http://", "ws://")
  return `${protocolUrl}${path.startsWith("/") ? path : `/${path}`}`
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
  const [sumoSummary, setSumoSummary] = useState<SumoScenarioSummary | null>(null)
  const [sumoNetwork, setSumoNetwork] = useState<SumoNetwork | null>(null)
  const [isSumoNetworkLoading, setIsSumoNetworkLoading] = useState(false)
  const [isSumoConnected, setIsSumoConnected] = useState(false)
  const [isSumoRunning, setIsSumoRunning] = useState(false)
  const [sumoDelayMs, setSumoDelayMs] = useState(0)
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("Idle")
  const [playbackBufferSize, setPlaybackBufferSize] = useState(0)
  const [isPlaybackPlaying, setIsPlaybackPlaying] = useState(false)
  const [playbackAppliedFrames, setPlaybackAppliedFrames] = useState(0)
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(defaultPlaybackMode)
  const [finalRunAudit, setFinalRunAudit] = useState<RobotaxiRunAudit | null>(null)
  const [appTheme, setAppTheme] = useState<AppTheme>("light")
  const [isMapEnabled, setIsMapEnabled] = useState(true)
  const [isEngineeringPanelOpen, setIsEngineeringPanelOpen] = useState(false)
  const [isStoryOpen, setIsStoryOpen] = useState(true)
  const [diagnostics, setDiagnostics] = useState<RenderDiagnostics>({
    renderFps: 0,
    dataFps: 0,
    backendStepMs: 0,
    backendFrameMs: 0,
    backendVehicleIdMs: 0,
    backendVehicleLoopMs: 0,
    backendTrafficLightMs: 0,
    backendChunkMs: 0,
    backendSendMs: 0,
    frontendParseMs: 0,
    frontendAppendMs: 0,
    chunkFrames: 0,
  })
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
  const latestRobotaxiRequestsRef = useRef<RobotaxiRequest[] | undefined>(undefined)
  const lastTrafficLightSignatureRef = useRef("")
  const sumoSocketRef = useRef<WebSocket | null>(null)
  const sumoDelayMsRef = useRef(0)
  const dataUpdateCountRef = useRef(0)
  const playbackSocketRef = useRef<WebSocket | null>(null)
  const playbackAbortControllerRef = useRef<AbortController | null>(null)
  const playbackTimelineRef = useRef<SumoFrame[]>([])
  const playbackCursorRef = useRef<string | number | null>(null)
  const playbackDoneRef = useRef(false)
  const pendingPlaybackDoneRef = useRef<{
    simSec?: number
    audit?: RobotaxiRunAudit
    finalDispatch?: RobotaxiDispatch
  } | null>(null)
  const playbackFetchInFlightRef = useRef(false)
  const isPlaybackPlayingRef = useRef(false)
  const playbackAnimationFrameRef = useRef(0)
  const playbackLastTickAtRef = useRef<number | null>(null)
  const playbackFrameRemainderMsRef = useRef(0)
  const playbackAppliedIndexRef = useRef(-1)
  const playbackModeRef = useRef<PlaybackMode>(defaultPlaybackMode)
  const staticOverlaySyncFrameRef = useRef<number | null>(null)

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
    isPlaybackPlayingRef.current = isPlaybackPlaying
  }, [isPlaybackPlaying])

  useEffect(() => {
    playbackModeRef.current = playbackMode
  }, [playbackMode])

  useEffect(() => {
    appThemeRef.current = appTheme
  }, [appTheme])

  useEffect(() => {
    let animationFrameId = 0
    let renderFrames = 0
    let lastRenderSampleAt = performance.now()

    const sampleRenderFps = (now: number) => {
      renderFrames += 1
      const elapsedMs = now - lastRenderSampleAt
      if (elapsedMs >= 1000) {
        const nextRenderFps = Math.round((renderFrames * 1000) / elapsedMs)
        setDiagnostics((current) => ({ ...current, renderFps: nextRenderFps }))
        renderFrames = 0
        lastRenderSampleAt = now
      }
      animationFrameId = requestAnimationFrame(sampleRenderFps)
    }

    animationFrameId = requestAnimationFrame(sampleRenderFps)

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const nextDataFps = dataUpdateCountRef.current
      dataUpdateCountRef.current = 0
      setDiagnostics((current) => ({ ...current, dataFps: nextDataFps }))
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

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
    if (!map || !network || !map.isStyleLoaded() || !ensureSumoLaneLayers(map)) {
      return false
    }

    ensureSumoTrafficLightLayers(map)
    applySumoOverlayTheme(map, appThemeRef.current)
    source(map, "service-area-halo")?.setData(
      serviceHaloFeatureCollection(network.boundary ?? null),
    )
    source(map, "sumo-depot")?.setData(network.depot ?? emptyFeatureCollection<Geometry>())
    source(map, "sumo-depot-label")?.setData(depotLabelFeatureCollection(network.depot ?? null))
    source(map, "sumo-lanes")?.setData(network.lanes)
    source(map, "sumo-internal-lanes")?.setData(network.internalLanes)
    source(map, "sumo-traffic-lights")?.setData(sumoTrafficLightGeojsonRef.current)
    source(map, "robotaxi-request-paths")?.setData(
      robotaxiRequestPathFeatureCollection(
        latestRobotaxiRequestsRef.current,
        latestSumoFrameRef.current?.vehicles ?? [],
      ),
    )
    source(map, "robotaxi-requests")?.setData(
      robotaxiRequestFeatureCollection(
        latestRobotaxiRequestsRef.current,
        latestSumoFrameRef.current?.simSec ?? 0,
        latestSumoFrameRef.current?.vehicles ?? [],
      ),
    )
    setSumoLayerVisibility(map, sumoLayerVisibilityRef.current)
    return true
  }, [])

  const scheduleStaticOverlaySync = useCallback(() => {
    if (staticOverlaySyncFrameRef.current !== null) {
      cancelAnimationFrame(staticOverlaySyncFrameRef.current)
      staticOverlaySyncFrameRef.current = null
    }

    let attempts = 0
    const trySync = () => {
      attempts += 1
      if (syncSumoNetworkLayers() || attempts >= 90) {
        staticOverlaySyncFrameRef.current = null
        return
      }

      staticOverlaySyncFrameRef.current = requestAnimationFrame(trySync)
    }

    staticOverlaySyncFrameRef.current = requestAnimationFrame(trySync)
  }, [syncSumoNetworkLayers])

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

  const appendPlaybackFrames = useCallback((frames: SumoFrame[]) => {
    if (frames.length === 0) {
      return
    }

    playbackTimelineRef.current.push(...frames)
    setPlaybackBufferSize(
      Math.max(0, playbackTimelineRef.current.length - playbackAppliedIndexRef.current - 1),
    )
    if (isPlaybackPlayingRef.current) {
      setPlaybackStatus("Playing")
    }
  }, [])

  const syncPlaybackFrameSources = useCallback(
    (frame: SumoFrame) => {
      latestSumoFrameRef.current = frame
      if (frame.dispatch?.requests) {
        latestRobotaxiRequestsRef.current = frame.dispatch.requests
      }
      const activeRequests = latestRobotaxiRequestsRef.current
      const map = baseMapRef.current
      if (map) {
        source(map, "sumo-vehicles")?.setData(pointFeatureCollection(frame.vehicles))
        source(map, "robotaxi-request-paths")?.setData(
          robotaxiRequestPathFeatureCollection(activeRequests, frame.vehicles),
        )
        source(map, "robotaxi-requests")?.setData(
          robotaxiRequestFeatureCollection(activeRequests, frame.simSec, frame.vehicles),
        )
        updateSumoTrafficLightSource(map, frame)
        map.triggerRepaint()
      }
    },
    [updateSumoTrafficLightSource],
  )

  const applyPlaybackFrame = useCallback(
    (frame: SumoFrame) => {
      syncPlaybackFrameSources(frame)
      dataUpdateCountRef.current += 1
      setPlaybackAppliedFrames((count) => count + 1)
      setSumoFrame(frame)
    },
    [syncPlaybackFrameSources],
  )

  // The backend streams the replay much faster than the paced playback
  // consumes it, so the "done" payload arrives mid-run. It is stashed here and
  // only applied once the frame timeline has drained.
  const finalizePlaybackRun = useCallback(() => {
    const payload = pendingPlaybackDoneRef.current
    pendingPlaybackDoneRef.current = null
    if (payload?.audit) {
      setFinalRunAudit(payload.audit)
    }
    const currentFrame = latestSumoFrameRef.current
    const finalSimSec =
      typeof payload?.simSec === "number" ? payload.simSec : currentFrame?.simSec
    if (payload?.finalDispatch && currentFrame) {
      const finalFrame = {
        ...currentFrame,
        simSec: finalSimSec ?? currentFrame.simSec,
        dispatch: payload.finalDispatch,
      }
      syncPlaybackFrameSources(finalFrame)
      setSumoFrame(finalFrame)
    }
    playbackTimelineRef.current = []
    playbackAppliedIndexRef.current = -1
    playbackFrameRemainderMsRef.current = 0
    setPlaybackBufferSize(0)
    setIsPlaybackPlaying(false)
    isPlaybackPlayingRef.current = false
    setPlaybackStatus("Ended")
  }, [syncPlaybackFrameSources])

  const requestPlaybackChunk = useCallback(async () => {
    if (playbackSocketRef.current || playbackDoneRef.current) {
      return
    }
    if (playbackAppliedIndexRef.current >= 0 || playbackTimelineRef.current.length > 0) {
      // A run is already streaming or buffered. Reopening the websocket would
      // start a second run from 18:00 and splice its frames after the current
      // timeline; the stream either finishes with "done" or fails terminally.
      return
    }

    const playbackUrl = backendWebSocketUrl(
      `/ws/sumo/${districtScope}/playback?speed=${playbackModeRef.current}&demand=${demandSource}&engine=${dispatchEngine}&detail=public&cache=auto`,
    )
    if (!playbackUrl) {
      setPlaybackStatus("Error")
      setLoadError("Backend URL is not configured.")
      return
    }

    playbackFetchInFlightRef.current = true
    setPlaybackStatus((status) => (status === "Idle" || status === "Paused" ? "Buffering" : status))

    const handlePlaybackPayload = (payload: unknown) => {
      const frames = playbackFramesFromPayload(payload)
      appendPlaybackFrames(frames)

      const nextCursor = playbackCursorFromPayload(payload)
      if (nextCursor !== null) {
        playbackCursorRef.current = nextCursor
      }

      if (playbackDoneFromPayload(payload)) {
        playbackDoneRef.current = true
      }
    }

    const socket = new WebSocket(playbackUrl)
    playbackSocketRef.current = socket

    socket.addEventListener("message", (event) => {
      const parseStartedAt = performance.now()
      const payload = JSON.parse(event.data) as {
        type?: string
        message?: string
        sendMs?: number
        simSec?: number
        audit?: RobotaxiRunAudit
        finalDispatch?: RobotaxiDispatch
        profile?: {
          frames?: number
          stepMs?: number
          frameMs?: number
          vehicleIdMs?: number
          vehicleLoopMs?: number
          trafficLightMs?: number
          chunkMs?: number
        }
      }
      const frontendParseMs = performance.now() - parseStartedAt
      if (payload.type === "chunk") {
        const appendStartedAt = performance.now()
        handlePlaybackPayload(payload)
        const frontendAppendMs = performance.now() - appendStartedAt
        const profile = payload.profile
        if (profile) {
          setDiagnostics((current) => ({
            ...current,
            backendStepMs: profile.stepMs ?? current.backendStepMs,
            backendFrameMs: profile.frameMs ?? current.backendFrameMs,
            backendVehicleIdMs: profile.vehicleIdMs ?? current.backendVehicleIdMs,
            backendVehicleLoopMs: profile.vehicleLoopMs ?? current.backendVehicleLoopMs,
            backendTrafficLightMs: profile.trafficLightMs ?? current.backendTrafficLightMs,
            backendChunkMs: profile.chunkMs ?? current.backendChunkMs,
            frontendParseMs: Math.round(frontendParseMs * 100) / 100,
            frontendAppendMs: Math.round(frontendAppendMs * 100) / 100,
            chunkFrames: profile.frames ?? current.chunkFrames,
          }))
        }
        if (
          playbackTimelineRef.current.length > playbackAppliedIndexRef.current + 1 &&
          isPlaybackPlayingRef.current
        ) {
          setPlaybackStatus("Playing")
        }
        return
      }

      if (payload.type === "done") {
        playbackDoneRef.current = true
        pendingPlaybackDoneRef.current = {
          simSec: payload.simSec,
          audit: payload.audit,
          finalDispatch: payload.finalDispatch,
        }
        // Finalize only once the paced playback has drained the timeline —
        // even when paused, so a resumed run still plays out its buffer.
        const timelineExhausted =
          playbackAppliedIndexRef.current >= playbackTimelineRef.current.length - 1
        if (timelineExhausted) {
          finalizePlaybackRun()
        }
        return
      }

      if (payload.type === "stopped") {
        playbackDoneRef.current = true
        if (payload.audit) {
          setFinalRunAudit(payload.audit)
        }
        setPlaybackStatus("Paused")
        return
      }

      if (payload.type === "error") {
        setPlaybackStatus("Error")
        setLoadError(payload.message ?? "Playback unavailable.")
      }

      if (payload.type === "transportProfile" && typeof payload.sendMs === "number") {
        setDiagnostics((current) => ({ ...current, backendSendMs: payload.sendMs ?? 0 }))
        return
      }
    })

    socket.addEventListener("close", () => {
      if (playbackSocketRef.current === socket) {
        playbackSocketRef.current = null
      }
      playbackFetchInFlightRef.current = false
      setPlaybackBufferSize(
        Math.max(0, playbackTimelineRef.current.length - playbackAppliedIndexRef.current - 1),
      )
      if (!playbackDoneRef.current && isPlaybackPlayingRef.current) {
        // Stream died before "done"; without it the run can never finish.
        setIsPlaybackPlaying(false)
        isPlaybackPlayingRef.current = false
        setPlaybackStatus("Error")
        setLoadError("Playback stream ended unexpectedly.")
      }
    })

    socket.addEventListener("error", () => {
      if (playbackSocketRef.current === socket) {
        playbackSocketRef.current = null
      }
      playbackFetchInFlightRef.current = false
      try {
        socket.close()
      } catch {
        // Ignore close errors from already-failed sockets.
      }
      setIsPlaybackPlaying(false)
      isPlaybackPlayingRef.current = false
      setPlaybackStatus("Error")
      setLoadError("Playback websocket unavailable.")
    })
  }, [appendPlaybackFrames, finalizePlaybackRun])

  const startPlayback = useCallback(() => {
    if (playbackSocketRef.current) {
      try {
        playbackSocketRef.current.close()
      } catch {
        // Ignore close errors from stale sockets.
      }
      playbackSocketRef.current = null
      playbackFetchInFlightRef.current = false
    }

    const remainingFrames =
      playbackTimelineRef.current.length - Math.max(0, playbackAppliedIndexRef.current + 1)
    if (playbackDoneRef.current && remainingFrames <= 0) {
      playbackCursorRef.current = null
      playbackDoneRef.current = false
      pendingPlaybackDoneRef.current = null
      playbackTimelineRef.current = []
      playbackAppliedIndexRef.current = -1
      setPlaybackAppliedFrames(0)
      setFinalRunAudit(null)
    }

    setLoadError(null)
    setIsPlaybackPlaying(true)
    isPlaybackPlayingRef.current = true
    playbackLastTickAtRef.current = null
    playbackFrameRemainderMsRef.current = 0
    setPlaybackStatus(
      playbackTimelineRef.current.length > playbackAppliedIndexRef.current + 1
        ? "Playing"
        : "Buffering",
    )
    void requestPlaybackChunk()
  }, [requestPlaybackChunk])

  const canChangePlaybackMode =
    !isPlaybackPlaying &&
    playbackStatus !== "Buffering" &&
    playbackTimelineRef.current.length === 0 &&
    playbackAppliedIndexRef.current < 0

  const dispatchMetrics = sumoFrame?.dispatch?.metrics
  const demandMetadata = sumoFrame?.dispatch?.demand ?? sumoFrame?.dispatch?.replacement
  const fleetInit = sumoFrame?.dispatch?.fleetInit
  const sourceTripCount = dispatchMetrics?.sourceTripCount ?? 20
  const estimatedTargetRequests = sourceTripCount
  const exactTargetRequests =
    dispatchMetrics?.targetRequests ?? demandMetadata?.targetRequestCount
  const targetRequests = exactTargetRequests ?? estimatedTargetRequests
  const completedRequests = dispatchMetrics?.completed ?? 0
  const displayedCompletedRequests = finalRunAudit?.completed ?? completedRequests
  const dispatchableRequests =
    dispatchMetrics?.cybercabServeableRequests ?? targetRequests
  const requestCompletionPercent =
    dispatchableRequests && dispatchableRequests > 0
      ? Math.round((displayedCompletedRequests / dispatchableRequests) * 100)
      : 0
  const inProgressRequests =
    (dispatchMetrics?.waiting ?? 0) + (dispatchMetrics?.assigned ?? 0) + (dispatchMetrics?.onboard ?? 0)
  const isPreparingPlayback = playbackStatus === "Buffering" && playbackAppliedFrames === 0
  const targetRequestLabel = exactTargetRequests === undefined ? `~${targetRequests}` : String(targetRequests)
  const primaryActionLabel = isPreparingPlayback
    ? "Preparing"
    : isPlaybackPlaying
      ? "Running"
      : playbackStatus === "Paused"
        ? "Resume"
        : playbackStatus === "Ended"
          ? "Replay"
           : "Run simulation"
  const scenarioWindowLabel = formatWindowLabel(sumoSummary?.window)
  const displayFleetSize = Math.max(
    fleetInit?.requested ?? 0,
    fleetInit?.added ?? 0,
    sumoFrame?.dispatch?.robotaxis?.length ?? 0,
    5,
  )
  const robotaxiVehicles = useMemo(
    () => (sumoFrame?.vehicles ?? []).filter((vehicle) => vehicle.kind === "robotaxi"),
    [sumoFrame?.vehicles],
  )
  const robotaxiVehiclesById = useMemo(
    () => new Map(robotaxiVehicles.map((vehicle) => [vehicle.id, vehicle] as const)),
    [robotaxiVehicles],
  )
  const robotaxiStatusById = useMemo(
    () =>
      new Map(
        (sumoFrame?.dispatch?.robotaxis ?? []).map((robotaxi) => [robotaxi.id, robotaxi] as const),
      ),
    [sumoFrame?.dispatch?.robotaxis],
  )
  const initialFleetBatteryPercent =
    fleetInit?.initialChargeKwh && fleetInit.batteryCapacityKwh
      ? (fleetInit.initialChargeKwh / fleetInit.batteryCapacityKwh) * 100
      : 91
  const fleetRows = useMemo(
    () =>
      Array.from({ length: displayFleetSize }, (_, index) => {
        const id = formatCabId(index)
        const dispatchRobotaxi = robotaxiStatusById.get(id)
        const vehicle = robotaxiVehiclesById.get(id)
        const status =
          dispatchRobotaxi?.status ??
          vehicle?.state ??
          (sumoFrame ? "offline" : "depot standby")
        const displayStatus =
          status === "offline" && dispatchRobotaxi?.batteryPercent !== undefined && !dispatchRobotaxi?.error
            ? "depot standby"
            : status
        return {
          id,
          status,
          displayStatus,
          assignmentLabel: formatCabAssignment(displayStatus, dispatchRobotaxi?.requestId ?? null),
          requestId: dispatchRobotaxi?.requestId ?? null,
          batteryPercent: dispatchRobotaxi?.batteryPercent ?? (sumoFrame ? null : initialFleetBatteryPercent),
          batteryKwh: dispatchRobotaxi?.batteryKwh ?? null,
          locationEdge: dispatchRobotaxi?.locationEdge ?? vehicle?.lane ?? null,
          error: dispatchRobotaxi?.error ?? null,
        }
      }).sort((a, b) => {
        const statusRank = cabStatusRank(a.displayStatus) - cabStatusRank(b.displayStatus)
        if (statusRank !== 0) {
          return statusRank
        }
        return a.id.localeCompare(b.id)
      }),
    [
      displayFleetSize,
      initialFleetBatteryPercent,
      robotaxiStatusById,
      robotaxiVehiclesById,
      sumoFrame,
    ],
  )
  const fleetSummary = useMemo(() => fleetStateSummary(fleetRows), [fleetRows])
  const dispatchTelemetryLine =
    dispatchMetrics?.vehicleKm && dispatchMetrics.vehicleKm > 0
      ? `Deadhead ${Math.round(dispatchMetrics.deadheadingPercent ?? 0)}% · ${(
          dispatchMetrics.energyKwh ?? 0
        ).toFixed(1)} kWh`
      : "SUMO taxi device + controller energy model"
  const waitingRequests = dispatchMetrics?.waiting ?? 0
  const assignedRequests = dispatchMetrics?.assigned ?? 0
  const onboardRequests = dispatchMetrics?.onboard ?? 0
  const liveFleetAtDepot = dispatchMetrics?.fleetAtDepot ?? fleetSummary.charging
  const liveChargingSessions =
    dispatchMetrics?.chargingSessions ?? dispatchMetrics?.chargeSessions ?? 0
  const liveStagingTrips = dispatchMetrics?.stagingTrips ?? 0
  const liveReadyRobotaxis = dispatchMetrics?.readyRobotaxis ?? 0
  const finalFleetRecoveredLabel = finalRunAudit
    ? `${finalRunAudit.fleetAtDepot}/${finalRunAudit.fleetSize}`
    : null
  const simTimeLabel = sumoFrame ? formatSimClock(sumoFrame.simSec) : scenarioWindowLabel
  const experiencePhase: ExperiencePhase = isStoryOpen
    ? "onboarding"
    : finalRunAudit || playbackStatus === "Ended"
      ? "results"
      : "running"
  const normalizedCabRows = useMemo(() => normalizeCabRows(sumoFrame), [sumoFrame])
  const normalizedRequestMarkers = useMemo(() => normalizeRequestMarkers(sumoFrame), [sumoFrame])
  // "Open" in the user pane means announced-and-waiting riders, not the whole
  // day's scheduled demand (backend openRequests = scheduled + waiting).
  const waitingRequestsForExperience = pickExperienceMetric(sumoFrame, [
    "waiting",
    "openRequests",
  ]) ?? waitingRequests
  const acceptedRequestsForExperience =
    pickExperienceMetric(sumoFrame, ["acceptedRequests"]) ??
    assignedRequests + onboardRequests
  const availableCabsForExperience =
    pickExperienceMetric(sumoFrame, ["availableCabs", "availableRobotaxis"]) ??
    normalizedCabRows.filter((cab) => {
      const state = (cab.state ?? "").toLowerCase()
      return state.includes("available") || state.includes("idle") || state.includes("staged")
    }).length
  const experienceData: CybercabExperienceData = {
    live: {
      currentTime: simTimeLabel,
      openRequests: waitingRequestsForExperience,
      acceptedRequests: acceptedRequestsForExperience,
      availableCabs: availableCabsForExperience,
    },
    cabs: normalizedCabRows,
    totals: {
      ridesServed:
        finalRunAudit?.completed ??
        pickExperienceMetric(sumoFrame, ["ridesServed", "completed", "servedRequests"]),
      totalDemand:
        pickExperienceMetric(sumoFrame, ["totalDemand", "targetRequests", "sourceTripCount"]) ??
        targetRequests,
      cabsReturned: finalRunAudit?.fleetAtDepot ?? pickExperienceMetric(sumoFrame, ["cabsReturned"]),
    },
    requests: normalizedRequestMarkers,
  }

  const pausePlayback = useCallback(() => {
    setIsPlaybackPlaying(false)
    isPlaybackPlayingRef.current = false
    setPlaybackStatus(playbackDoneRef.current ? "Ended" : "Paused")
  }, [])

  const resetPlayback = useCallback(() => {
    playbackAbortControllerRef.current?.abort()
    playbackAbortControllerRef.current = null
    try {
      playbackSocketRef.current?.send(JSON.stringify({ command: "stop" }))
    } catch {
      // Socket may still be connecting; cleanup below must proceed anyway.
    }
    try {
      playbackSocketRef.current?.close()
    } catch {
      // Ignore close errors from stale sockets.
    }
    playbackSocketRef.current = null
    playbackFetchInFlightRef.current = false
    playbackTimelineRef.current = []
    playbackCursorRef.current = null
    playbackDoneRef.current = false
    pendingPlaybackDoneRef.current = null
    playbackLastTickAtRef.current = null
    playbackFrameRemainderMsRef.current = 0
    playbackAppliedIndexRef.current = -1
    lastTrafficLightSignatureRef.current = ""
    latestSumoFrameRef.current = null
    latestRobotaxiRequestsRef.current = undefined

    const map = baseMapRef.current
    if (map) {
      source(map, "sumo-vehicles")?.setData(emptyFeatureCollection())
      source(map, "robotaxi-request-paths")?.setData(emptyFeatureCollection<LineString>())
      source(map, "robotaxi-requests")?.setData(emptyFeatureCollection())
      const resetTrafficLights = trafficLightFeatureCollection(sumoNetworkRef.current, null)
      sumoTrafficLightGeojsonRef.current = resetTrafficLights
      source(map, "sumo-traffic-lights")?.setData(resetTrafficLights)
      map.triggerRepaint()
    }

    setIsPlaybackPlaying(false)
    isPlaybackPlayingRef.current = false
    setPlaybackBufferSize(0)
    setPlaybackAppliedFrames(0)
    setPlaybackStatus("Idle")
    setSumoFrame(null)
    setFinalRunAudit(null)
  }, [])

  useEffect(() => {
    if (!isPlaybackPlaying) {
      return
    }

    const advancePlayback = (now: number) => {
      if (!isPlaybackPlayingRef.current) {
        return
      }

      if (playbackLastTickAtRef.current === null) {
        playbackLastTickAtRef.current = now
      }

      // Allow generous catch-up so browser rAF throttling (background or
      // occluded tabs) delays rendering without stretching the run's wall
      // clock; at 25 ms/frame this caps a single tick at 80 frames.
      const deltaMs = Math.min(2000, now - playbackLastTickAtRef.current)
      playbackLastTickAtRef.current = now
      playbackFrameRemainderMsRef.current += deltaMs
      const timeline = playbackTimelineRef.current

      if (playbackFrameRemainderMsRef.current >= playbackFrameIntervalMs) {
        const dueFrameCount = Math.max(
          1,
          Math.floor(playbackFrameRemainderMsRef.current / playbackFrameIntervalMs),
        )
        const targetIndex = Math.min(
          playbackAppliedIndexRef.current + dueFrameCount,
          timeline.length - 1,
        )
        if (targetIndex === playbackAppliedIndexRef.current && targetIndex >= 0) {
          // Buffer underrun mid-run: don't re-apply the same frame.
          if (playbackDoneRef.current) {
            finalizePlaybackRun()
            return
          }
          playbackFrameRemainderMsRef.current = Math.min(
            playbackFrameRemainderMsRef.current,
            playbackFrameIntervalMs,
          )
          setPlaybackStatus("Buffering")
          void requestPlaybackChunk()
        } else if (targetIndex >= 0 && targetIndex < timeline.length) {
          playbackFrameRemainderMsRef.current -= dueFrameCount * playbackFrameIntervalMs
          if (playbackFrameRemainderMsRef.current < 0) {
            playbackFrameRemainderMsRef.current = 0
          }
          playbackAppliedIndexRef.current = targetIndex
          applyPlaybackFrame(timeline[targetIndex])

          let appliedIndex = playbackAppliedIndexRef.current
          if (appliedIndex > playbackLowWatermarkFrames) {
            const removableFrames = appliedIndex - playbackRetainedPastFrames
            timeline.splice(0, removableFrames)
            playbackAppliedIndexRef.current -= removableFrames
            appliedIndex = playbackAppliedIndexRef.current
          }

          const remainingFrames = Math.max(0, timeline.length - appliedIndex - 1)
          setPlaybackBufferSize(remainingFrames)
          setPlaybackStatus("Playing")

          if (playbackDoneRef.current && remainingFrames === 0) {
            finalizePlaybackRun()
            return
          }

          if (remainingFrames <= playbackLowWatermarkFrames) {
            void requestPlaybackChunk()
          }
        } else if (playbackDoneRef.current) {
          finalizePlaybackRun()
          return
        } else {
          playbackFrameRemainderMsRef.current = Math.min(
            playbackFrameRemainderMsRef.current,
            playbackFrameIntervalMs,
          )
          setPlaybackStatus("Buffering")
          void requestPlaybackChunk()
        }
      }
    }

    const tickPlayback = (now: number) => {
      if (!isPlaybackPlayingRef.current) {
        return
      }
      advancePlayback(now)
      playbackAnimationFrameRef.current = requestAnimationFrame(tickPlayback)
    }

    playbackAnimationFrameRef.current = requestAnimationFrame(tickPlayback)

    // Chrome suspends requestAnimationFrame entirely for hidden/occluded
    // windows, which would freeze the run whenever the user tabs away. This
    // low-frequency fallback keeps sim time advancing (the wall-clock delta
    // math catches up to 80 frames per tick).
    const fallbackInterval = window.setInterval(() => {
      if (isPlaybackPlayingRef.current) {
        advancePlayback(performance.now())
      }
    }, 500)

    return () => {
      cancelAnimationFrame(playbackAnimationFrameRef.current)
      window.clearInterval(fallbackInterval)
    }
  }, [applyPlaybackFrame, finalizePlaybackRun, isPlaybackPlaying, requestPlaybackChunk])

  useEffect(() => {
    return () => {
      playbackAbortControllerRef.current?.abort()
    }
  }, [])

  const sumoTrafficLightGeojson = trafficLightFeatureCollection(sumoNetwork, null)
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
    source(map, "service-area-halo")?.setData(
      serviceHaloFeatureCollection(sumoBoundaryGeojson),
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
    if (!isMapEnabled || !baseMapContainerRef.current || baseMapRef.current || !currentMapStyleUrl) {
      return
    }

    const restoredCamera = pendingThemeCameraRef.current
    const defaultFitBoundsOptions =
      window.innerWidth < 720
        ? {
            padding: { top: 28, bottom: 28, left: 28, right: 28 },
            maxZoom: 11.1,
          }
        : {
            padding: { top: 72, bottom: 72, left: 430, right: 410 },
            maxZoom: 12.35,
          }
    const map = new maplibregl.Map({
      container: baseMapContainerRef.current,
      style: currentMapStyleUrl,
      ...(restoredCamera
        ? {
            center: restoredCamera.center,
            zoom: restoredCamera.zoom,
          }
        : {
            bounds: activeScenarioBounds,
            fitBoundsOptions: defaultFitBoundsOptions,
          }),
      pitch: restoredCamera?.pitch ?? 0,
      bearing: restoredCamera?.bearing ?? 0,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right")
    map.addControl(new maplibregl.AttributionControl({ compact: true }))

    map.on("load", () => {
      map.addSource("service-area-halo", {
        type: "geojson",
        data: emptyFeatureCollection<Polygon>(),
      })
      map.addSource("base-service-area", {
        type: "geojson",
        data: emptyFeatureCollection<Geometry>(),
      })
      map.addSource("sumo-depot", {
        type: "geojson",
        data: emptyFeatureCollection<Geometry>(),
      })
      map.addSource("sumo-depot-label", {
        type: "geojson",
        data: emptyFeatureCollection<Point>(),
      })
      map.addSource("sumo-vehicles", {
        type: "geojson",
        data: emptyFeatureCollection(),
      })
      map.addSource("robotaxi-requests", {
        type: "geojson",
        data: emptyFeatureCollection(),
      })
      map.addSource("robotaxi-request-paths", {
        type: "geojson",
        data: emptyFeatureCollection<LineString>(),
      })
      map.addSource("best-cutouts", {
        type: "geojson",
        data: bestCutoutsUrl,
      })
      const backgroundVehicleMarker = createBackgroundVehicleMarkerImage()
      if (backgroundVehicleMarker && !map.hasImage("sumo-background-vehicle-marker")) {
        map.addImage("sumo-background-vehicle-marker", backgroundVehicleMarker.data, {
          pixelRatio: backgroundVehicleMarker.pixelRatio,
        })
      }
      const cybercabMarker = createCybercabMarkerImage()
      if (cybercabMarker && !map.hasImage("sumo-cybercab-marker")) {
        map.addImage("sumo-cybercab-marker", cybercabMarker.data, {
          pixelRatio: cybercabMarker.pixelRatio,
        })
      }
      ensureCybercabDepotMarkerImage(map)
      map.addLayer({
        id: "service-area-halo",
        type: "fill",
        source: "service-area-halo",
        paint: {
          "fill-color": appThemeRef.current === "light" ? "#1f3036" : "#01090d",
          "fill-opacity": appThemeRef.current === "light" ? 0.17 : 0.42,
          "fill-antialias": true,
        },
      })
      map.addLayer({
        id: "sumo-depot-fill",
        type: "fill",
        source: "sumo-depot",
        paint: {
          "fill-color": appThemeRef.current === "light" ? "#222826" : "#18231d",
          "fill-opacity": appThemeRef.current === "light" ? 0.12 : 0.18,
        },
      })
      map.addLayer({
        id: "sumo-depot-line",
        type: "line",
        source: "sumo-depot",
        paint: {
          "line-color": "#ffc400",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            1.4,
            15,
            2.8,
            17,
            4.2,
          ],
          "line-opacity": 0.94,
        },
      })
      map.addLayer({
        id: "sumo-depot-label",
        type: "symbol",
        source: "sumo-depot-label",
        layout: {
          "icon-image": "cybercab-depot-marker",
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0.35,
            12,
            0.56,
            14,
            0.76,
            16,
            0.95,
          ],
          "icon-anchor": "left",
          "icon-offset": [3, -2],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      })
      map.addLayer({
        id: "base-service-area-line",
        type: "line",
        source: "base-service-area",
        paint: {
          "line-color": "#37d9ff",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            1.25,
            14,
            1.75,
            16,
            2.2,
          ],
          "line-dasharray": [2, 1.4],
          "line-opacity": 0.78,
        },
      })
      map.addLayer({
        id: "best-cutouts-line",
        type: "line",
        source: "best-cutouts",
        paint: {
          "line-color": [
            "match",
            ["get", "rawName"],
            "Reinickendorf",
            "#00d7ff",
            "charlottenburg",
            "#ffb800",
            "mitte",
            "#ff4fd8",
            "#ffffff",
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            4.4,
            12,
            5.2,
            15,
            6.4,
          ],
          "line-opacity": 1,
          "line-dasharray": [3, 1],
        },
      })
      map.addLayer({
        id: "best-cutouts-label",
        type: "symbol",
        source: "best-cutouts",
        layout: {
          "symbol-placement": "line",
          "text-field": ["get", "name"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            10,
            12,
            12,
            15,
            14,
          ],
          "text-letter-spacing": 0,
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: {
          "text-color": ["coalesce", ["get", "lineColor"], "#ffffff"],
          "text-halo-color": appThemeRef.current === "light" ? "#f8fcfd" : "#071014",
          "text-halo-width": 1.4,
          "text-opacity": 0.9,
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
        paint: {
          "icon-opacity": 0.55,
        },
        filter: ["!=", ["get", "kind"], "robotaxi"],
      })
      map.addLayer({
        id: "sumo-cybercab-glow",
        type: "circle",
        source: "sumo-vehicles",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            7,
            14,
            12,
            16,
            18,
          ],
          "circle-color": "#ffc107",
          "circle-opacity": 0.28,
          "circle-blur": 0.9,
        },
        filter: ["==", ["get", "kind"], "robotaxi"],
      })
      map.addLayer({
        id: "sumo-cybercabs",
        type: "symbol",
        source: "sumo-vehicles",
        layout: {
          "icon-image": "sumo-cybercab-marker",
          "icon-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            0.62,
            14,
            1.0,
            16,
            1.4,
          ],
          "icon-rotate": ["coalesce", ["get", "angle"], 0],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
        filter: ["==", ["get", "kind"], "robotaxi"],
      })
      map.addLayer({
        id: "robotaxi-request-paths",
        type: "line",
        source: "robotaxi-request-paths",
        paint: {
          "line-color": [
            "match",
            ["get", "visual"],
            "pickup-path",
            "#213238",
            "dropoff-path",
            "#c89700",
            "#213238",
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            0.55,
            14,
            0.95,
            16,
            1.6,
          ],
          "line-opacity": [
            "match",
            ["get", "visual"],
            "pickup-path",
            0.36,
            "dropoff-path",
            0.56,
            0.5,
          ],
        },
      })
      map.addLayer({
        id: "robotaxi-request-markers",
        type: "circle",
        source: "robotaxi-requests",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            1.5,
            14,
            2.3,
            16,
            3.2,
          ],
          "circle-color": [
            "match",
            ["get", "visual"],
            "pickup-waiting",
            "rgba(7, 16, 20, 0)",
            "pickup-assigned",
            "#071014",
            "pickup-arrived",
            "#071014",
            "dropoff-active",
            "#071014",
            "dropoff-completed",
            "#66777d",
            "pickup-expired",
            "rgba(154, 163, 167, 0)",
            "#071014",
          ],
          "circle-opacity": ["coalesce", ["get", "opacity"], 0.9],
          "circle-stroke-color": [
            "match",
            ["get", "visual"],
            "dropoff-completed",
            "#66777d",
            "pickup-expired",
            "#9aa3a7",
            "#071014",
          ],
          "circle-stroke-width": [
            "match",
            ["get", "visual"],
            "pickup-waiting",
            1.8,
            "pickup-assigned",
            1.2,
            1.2,
          ],
          "circle-stroke-opacity": ["coalesce", ["get", "opacity"], 0.9],
        },
      })
      setSumoLayerVisibility(map, defaultSumoLayerVisibility)
      scheduleStaticOverlaySync()
      if (restoredCamera) {
        map.jumpTo(restoredCamera)
        pendingThemeCameraRef.current = null
      }
      setBaseMapReadyTick((tick) => tick + 1)
      map.once("idle", () => {
        scheduleStaticOverlaySync()
        setBaseMapReadyTick((tick) => tick + 1)
      })
    })
    baseMapRef.current = map

    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(baseMapContainerRef.current)

    return () => {
      if (staticOverlaySyncFrameRef.current !== null) {
        cancelAnimationFrame(staticOverlaySyncFrameRef.current)
        staticOverlaySyncFrameRef.current = null
      }
      resizeObserver.disconnect()
      map.remove()
      baseMapRef.current = null
      setBaseMapReadyTick((tick) => tick + 1)
    }
  }, [currentMapStyleUrl, isMapEnabled, scheduleStaticOverlaySync])

  useEffect(() => {
    scheduleStaticOverlaySync()
  }, [baseMapReadyTick, sumoLayerVisibility, sumoNetwork, scheduleStaticOverlaySync])

  useEffect(() => {
    const map = baseMapRef.current
    if (!map || !map.isStyleLoaded() || !ensureSumoTrafficLightLayers(map)) {
      const animationFrameId = requestAnimationFrame(() => {
        const nextMap = baseMapRef.current
        if (!nextMap || !nextMap.isStyleLoaded() || !ensureSumoTrafficLightLayers(nextMap)) {
          return
        }
        source(nextMap, "sumo-traffic-lights")?.setData(sumoTrafficLightGeojson)
        setSumoLayerVisibility(nextMap, sumoLayerVisibility)
      })

      return () => {
        cancelAnimationFrame(animationFrameId)
      }
    }

    source(map, "sumo-traffic-lights")?.setData(sumoTrafficLightGeojson)
    setSumoLayerVisibility(map, sumoLayerVisibility)
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
        const summary = (await response.json()) as SumoScenarioSummary
        setSumoSummary(summary)
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
          if (typeof message.running === "boolean") {
            setIsSumoRunning(message.running)
            setSumoStatus(message.running ? "Streaming" : "Paused")
          }
          if (typeof message.delayMs === "number") {
            setSumoDelayMs(message.delayMs)
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
  }, [])

  return (
    <main
      className={`app-shell theme-${appTheme}${isStoryOpen ? " intro-open is-onboarding" : ""}`}
    >
      {showEngineeringDiagnostics ? (
        <aside className="nav-rail" aria-label="Simulation navigation">
          <div className="brand-mark">
            <MapPinned size={18} aria-hidden="true" />
          </div>
        </aside>
      ) : null}

      <section className="map-stage" aria-label="SUMO traffic map">
        {mapStyleUrl && isMapEnabled ? (
          <div ref={baseMapContainerRef} className="map-canvas base-map-canvas" />
        ) : mapStyleUrl ? (
          <div className="map-fallback">
            <MapPinned size={30} />
            <h1>Map disabled</h1>
            <p>MapLibre canvas is unmounted for performance diagnosis.</p>
          </div>
        ) : (
          <div className="map-fallback">
            <MapPinned size={30} />
            <h1>Map style missing</h1>
            <p>Add `VITE_MAPTILER_STYLE_URL` to `.env.local`.</p>
          </div>
        )}
        <div className="map-vignette" aria-hidden="true" />
      </section>

      <CybercabExperience
        phase={experiencePhase}
        data={experienceData}
        isSimulationUnavailable={playbackStatus === "Error" || sumoStatus === "Backend unavailable"}
        onStartReplay={() => {
          setIsStoryOpen(false)
          void startPlayback()
        }}
      />

      {showEngineeringDiagnostics ? (
      <>
      <section className="dispatch-app-panel" aria-label="Robotaxi dispatch app">
        <div className="dispatch-hero">
          <div className="dispatch-brand">
            <span className="dispatch-brand-mark">
              <Car size={18} aria-hidden="true" />
            </span>
            <div>
              <h1>Cybercab Dispatch</h1>
              <p>MATSim person requests are served live inside the SUMO traffic simulation.</p>
            </div>
          </div>
          <button
            type="button"
            className="theme-toggle dispatch-theme-toggle"
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

        <div className="dispatch-score">
          <span>completed rides</span>
          <strong>{displayedCompletedRequests}</strong>
          <div className="dispatch-progress" aria-hidden="true">
            <span style={{ width: `${Math.min(100, requestCompletionPercent)}%` }} />
          </div>
        </div>

        <div className="dispatch-mini-grid">
          <Metric label="Wait avg" value={formatSeconds(finalRunAudit?.avgWaitSec ?? dispatchMetrics?.avgWaitSec)} />
          <Metric label="Sim time" value={simTimeLabel} />
          <Metric label="Open" value={formatSignedInteger(finalRunAudit?.openRequests ?? inProgressRequests)} />
          <Metric label="Fleet" value={fleetInit ? `${fleetInit.added}/${fleetInit.requested}` : displayFleetSize} />
        </div>

        {finalRunAudit ? (
          <div className={finalRunAudit.passed ? "dispatch-final-card is-clean" : "dispatch-final-card"}>
            <div className="dispatch-final-header">
              <span>Run audit</span>
              <strong>{finalRunAudit.passed ? "clean finish" : "review needed"}</strong>
            </div>
            <div className="dispatch-final-grid">
              <Metric label="Max wait" value={formatSeconds(finalRunAudit.maxWaitSec)} />
              <Metric label="Deadhead" value={`${Math.round(finalRunAudit.deadheadingPercent)}%`} />
              <Metric label="Energy" value={`${finalRunAudit.energyKwh.toFixed(1)} kWh`} />
              <Metric label="Depot" value={finalFleetRecoveredLabel ?? "--"} />
            </div>
            <div className="dispatch-final-line">
              <span>{formatInteger(finalRunAudit.chargingSessions)} charge sessions</span>
              <span>{formatInteger(finalRunAudit.stagingTrips ?? 0)} staging moves</span>
            </div>
          </div>
        ) : (
          <div className="dispatch-final-card">
            <div className="dispatch-final-header">
              <span>Fleet readiness</span>
              <strong>{dispatchMetrics?.auditStatus === "pass" ? "nominal" : "live"}</strong>
            </div>
            <div className="dispatch-final-grid">
              <Metric label="Depot" value={`${formatInteger(liveFleetAtDepot)}/${displayFleetSize}`} />
              <Metric label="Ready" value={formatInteger(liveReadyRobotaxis)} />
              <Metric label="Charging" value={formatInteger(dispatchMetrics?.chargingRobotaxis ?? fleetSummary.charging)} />
              <Metric label="Sessions" value={formatInteger(liveChargingSessions)} />
            </div>
            <div className="dispatch-final-line">
              <span>{formatInteger(liveStagingTrips)} staging moves</span>
              <span>{formatSeconds(dispatchMetrics?.p95WaitSec)} p95 wait</span>
            </div>
          </div>
        )}

        <div className="dispatch-outcome-card" aria-label="Request state summary">
          <div>
            <span>waiting</span>
            <strong>{formatInteger(waitingRequests)}</strong>
          </div>
          <div>
            <span>assigned</span>
            <strong>{formatInteger(assignedRequests)}</strong>
          </div>
          <div>
            <span>onboard</span>
            <strong>{formatInteger(onboardRequests)}</strong>
          </div>
        </div>

        <div className="dispatch-control-card">
          <div className="dispatch-slider-block">
            <div className="playback-mode-header">
              <span>Simulation speed</span>
              <strong>{playbackMode}x</strong>
            </div>
            <input
              type="range"
              min={0}
              max={playbackModes.length - 1}
              step={1}
              value={playbackModes.indexOf(playbackMode)}
              disabled={!canChangePlaybackMode}
              aria-label="Playback speed mode"
              onChange={(event) => {
                const nextMode = playbackModes[Number(event.target.value)]
                if (nextMode) {
                  setPlaybackMode(nextMode)
                }
              }}
            />
            <div className="playback-mode-ticks" aria-hidden="true">
              {playbackModes.map((mode) => (
                <span key={mode}>{mode}x</span>
              ))}
            </div>
          </div>

          <div className="dispatch-slider-block dispatch-demand-card">
            <div className="playback-mode-header">
              <span>Demand source</span>
              <strong>{targetRequestLabel} requests</strong>
            </div>
            <div className="dispatch-demand-meta">
              <span>MATSim Berlin demand</span>
              <span>{scenarioWindowLabel}</span>
              <span>SUMO routes</span>
            </div>
          </div>
        </div>

        <div className="dispatch-actions">
          <button
            type="button"
            className={isPreparingPlayback ? "dispatch-primary-button is-loading" : "dispatch-primary-button"}
            disabled={isPlaybackPlaying}
            onClick={startPlayback}
          >
            <Play size={17} />
            <span>{primaryActionLabel}</span>
          </button>
          <button
            type="button"
            className="dispatch-icon-button"
            disabled={!isPlaybackPlaying}
            onClick={pausePlayback}
            aria-label="Pause simulation"
          >
            <Pause size={17} />
          </button>
          <button
            type="button"
            className="dispatch-icon-button"
            onClick={resetPlayback}
            aria-label="Reset simulation"
          >
            <RotateCcw size={17} />
          </button>
        </div>

        <div className="dispatch-status-line">
          <span>{exactTargetRequests === undefined ? "Ready" : "Evening window"}</span>
          <span>{dispatchTelemetryLine}</span>
        </div>
      </section>

      <aside className="fleet-panel" aria-label="Cybercab fleet status">
        <div className="fleet-panel-header">
          <h2 className="fleet-panel-title">Fleet Status</h2>
          <span className="fleet-panel-count">
            {displayFleetSize} cabs
          </span>
        </div>
        <div className="fleet-summary" aria-label="Fleet state summary">
          <span><strong>{fleetSummary.active}</strong> active</span>
          <span><strong>{fleetSummary.charging}</strong> charging</span>
          <span><strong>{fleetSummary.standby}</strong> standby</span>
        </div>
        <div className="fleet-list">
          {fleetRows.map((cab) => (
            <div
              className={`cab-row ${cabStatusClass(cab.displayStatus)}`}
              key={cab.id}
              title={cab.error ?? cab.locationEdge ?? cab.id}
            >
              <span className="cab-row-marker" aria-hidden="true" />
              <div className="cab-row-main">
                <span className="cab-row-name">{cab.id.replace("cybercab_", "Cab ")}</span>
                <span className="cab-row-state">
                  {cab.error ? "attention" : formatCabStatus(cab.displayStatus)}
                </span>
              </div>
              <div className="cab-row-meta">
                <span>{formatBatteryPercent(cab.batteryPercent)}</span>
                <span>{cab.assignmentLabel}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <button
        type="button"
        className="engineering-toggle"
        aria-label={isEngineeringPanelOpen ? "Hide engineering panel" : "Show engineering panel"}
        onClick={() => setIsEngineeringPanelOpen((open) => !open)}
      >
        {isEngineeringPanelOpen ? <X size={18} /> : <Settings2 size={18} />}
      </button>

      {isEngineeringPanelOpen ? (
      <section
        className="sumo-panel engineering-panel is-open"
        aria-label="Engineering diagnostics panel"
      >
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

        <div className="panel-box playback-box" aria-label="Buffered playback controls">
          <div className="panel-box-header">
            <h2>Playback {playbackMode}x</h2>
            <span className={isPlaybackPlaying ? "status-pill is-live" : "status-pill"}>
              {playbackStatus}
            </span>
          </div>

          <div className="playback-mode-control">
            <div className="playback-mode-header">
              <span>Speed</span>
              <strong>
                {playbackMode}x · {formatStepWidth(playbackMode)} step
              </strong>
            </div>
            <div className="playback-mode-subtitle">{formatVisualSampling(playbackMode)}</div>
            <input
              type="range"
              min={0}
              max={playbackModes.length - 1}
              step={1}
              value={playbackModes.indexOf(playbackMode)}
              disabled={!canChangePlaybackMode}
              aria-label="Playback speed mode"
              onChange={(event) => {
                const nextMode = playbackModes[Number(event.target.value)]
                if (nextMode) {
                  setPlaybackMode(nextMode)
                }
              }}
            />
            <div className="playback-mode-ticks" aria-hidden="true">
              {playbackModes.map((mode) => (
                <span key={mode}>{mode}x</span>
              ))}
            </div>
          </div>

          <div className="playback-mode-control">
            <div className="playback-mode-header">
              <span>Demand source</span>
              <strong>MATSim person plans</strong>
            </div>
            <div className="playback-mode-subtitle">
              live request queue mapped to reachable SUMO stops
            </div>
            <div className="playback-mode-ticks" aria-hidden="true">
              <span>1% MATSim</span>
              <span>{scenarioWindowLabel}</span>
              <span>service-area filtered</span>
            </div>
          </div>

          <div className="sumo-status-grid">
            <Metric label="Buffer" value={playbackBufferSize} />
            <Metric label="Sim Time" value={formatSimClock(sumoFrame?.simSec)} />
            <Metric label="Vehicles" value={sumoFrame?.vehicleCount ?? "--"} />
            <Metric
              label="Cybercabs"
              value={
                sumoFrame?.robotaxiCount ??
                sumoFrame?.vehicles.filter((vehicle) => vehicle.kind === "robotaxi").length ??
                "--"
              }
            />
            <Metric label="Applied" value={playbackAppliedFrames} />
          </div>

          <div className="playback-buffer-meter" aria-hidden="true">
            <span
              style={{
                width: `${Math.min(
                  100,
                  Math.round((playbackBufferSize / playbackLowWatermarkFrames) * 100),
                )}%`,
              }}
            />
          </div>

          <div className="control-row playback-control-row">
            <button
              type="button"
              className="icon-button"
              disabled={isPlaybackPlaying}
              onClick={startPlayback}
            >
              <Play size={16} />
              <span>Play</span>
            </button>
            <button
              type="button"
              className="icon-button"
              disabled={!isPlaybackPlaying}
              onClick={pausePlayback}
            >
              <Pause size={16} />
              <span>Pause</span>
            </button>
            <button type="button" className="icon-button" onClick={resetPlayback}>
              <RotateCcw size={16} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        <div className="panel-box dispatch-box" aria-label="Robotaxi dispatch metrics">
          <div className="panel-box-header">
            <h2>Robotaxi Dispatch</h2>
          </div>

          <div className="sumo-status-grid">
            <Metric label="Waiting" value={sumoFrame?.dispatch?.metrics.waiting ?? "--"} />
            <Metric label="Onboard" value={sumoFrame?.dispatch?.metrics.onboard ?? "--"} />
            <Metric
              label="Completed"
              value={`${sumoFrame?.dispatch?.metrics.completed ?? 0}/${
                sumoFrame?.dispatch?.metrics.targetRequests ?? "--"
              }`}
            />
            <Metric
              label="Avg wait"
              value={formatSeconds(sumoFrame?.dispatch?.metrics.avgWaitSec)}
            />
            <Metric
              label="Fleet"
              value={
                sumoFrame?.dispatch?.fleetInit
                  ? `${sumoFrame.dispatch.fleetInit.added}/${sumoFrame.dispatch.fleetInit.requested}`
                  : "--"
              }
            />
            <Metric
              label="Active"
              value={sumoFrame?.dispatch?.metrics.activeRobotaxis ?? "--"}
            />
            <Metric
              label="Rejected"
              value={`${sumoFrame?.dispatch?.metrics.rejectedRequests ?? 0}/${
                sumoFrame?.dispatch?.metrics.sourceTripCount ?? "--"
              }`}
            />
            <Metric
              label="Demand"
              value={
                sumoFrame?.dispatch?.metrics.sourceTripCount
                  ? `${formatInteger(sumoFrame.dispatch.metrics.targetRequests)} of ${formatInteger(
                      sumoFrame.dispatch.metrics.sourceTripCount,
                    )}`
                  : "MATSim"
              }
            />
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
            <LayerToggle
              label="Requests"
              active={sumoLayerVisibility.requests}
              onClick={() =>
                setSumoLayerVisibilityState((current) => ({
                  ...current,
                  requests: !current.requests,
                }))
              }
            />
            <LayerToggle
              label="Cutouts"
              active={sumoLayerVisibility.cutouts}
              onClick={() =>
                setSumoLayerVisibilityState((current) => ({
                  ...current,
                  cutouts: !current.cutouts,
                }))
              }
            />
          </div>
        </div>

        <div className="panel-box diagnostics-box" aria-label="Rendering diagnostics">
          <div className="panel-box-header">
            <h2>Diagnostics</h2>
          </div>

          <div className="diagnostics-grid">
            <Metric label="Render FPS" value={diagnostics.renderFps} />
            <Metric label="Data FPS" value={diagnostics.dataFps} />
            <Metric label="SUMO Step" value={`${diagnostics.backendStepMs} ms`} />
            <Metric label="Extract" value={`${diagnostics.backendFrameMs} ms`} />
            <Metric label="Vehicle IDs" value={`${diagnostics.backendVehicleIdMs} ms`} />
            <Metric label="Vehicles" value={`${diagnostics.backendVehicleLoopMs} ms`} />
            <Metric label="Lights" value={`${diagnostics.backendTrafficLightMs} ms`} />
            <Metric label="Chunk" value={`${diagnostics.backendChunkMs} ms`} />
            <Metric label="Send" value={`${diagnostics.backendSendMs} ms`} />
            <Metric label="Parse" value={`${diagnostics.frontendParseMs} ms`} />
            <Metric label="Append" value={`${diagnostics.frontendAppendMs} ms`} />
            <Metric label="Frames" value={diagnostics.chunkFrames} />
          </div>
          <div className="diagnostics-actions">
            <LayerToggle
              label="MapLibre"
              active={isMapEnabled}
              onClick={() => setIsMapEnabled((enabled) => !enabled)}
            />
          </div>
        </div>
      </section>
      ) : null}
      </>
      ) : null}

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
