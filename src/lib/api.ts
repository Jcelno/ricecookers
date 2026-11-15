import type { Body, Brief, Profile, CellInfo, CompareResult, Meta, NearbyResult, Pin, Planet, RankResult, SearchHit, Source, TwinResult } from "./types";

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError("The RADIUM data service is not responding. Start it with `npm run dev` and reload.");
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).detail ?? "";
    } catch {
      /* body was not JSON */
    }
    throw new ApiError(detail || `The data service returned an error (${res.status}).`, res.status);
  }
  return res.json() as Promise<T>;
}

const post = <T,>(path: string, body: unknown, signal?: AbortSignal) =>
  request<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });

const qs = (o: Record<string, string | number | undefined | null>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

export const api = {
  meta: () => request<Meta>("/api/meta"),
  sources: () => request<{ sources: Source[]; not_used: { name: string; reason: string }[] }>("/api/sources"),
  methodology: () => request<Record<string, any>>("/api/methodology"),
  pins: (body: Body) => request<{ pins: Pin[] }>(`/api/pins?body=${body}`).then((r) => r.pins),
  search: (body: Body, q: string, signal?: AbortSignal) =>
    request<{ results: SearchHit[] }>(`/api/search?${qs({ body, q })}`, { signal }).then((r) => r.results),
  cell: (body: Body, lat: number, lon: number, o: { mission?: string; weights?: Record<string, number>; limits?: string[] } = {}, signal?: AbortSignal) =>
    request<CellInfo>(
      `/api/cell?${qs({ body, lat, lon, mission: o.mission, w: o.weights ? JSON.stringify(o.weights) : undefined, limits: o.limits ? o.limits.join(",") : undefined })}`,
      { signal },
    ),
  rank: (
    b: { mission: string; weights?: Record<string, number>; limits?: string[]; prev_weights?: Record<string, number>; prev_limits?: string[]; n?: number; probe?: { lat: number; lon: number }[] },
    signal?: AbortSignal,
  ) => post<RankResult>("/api/rank", b, signal),
  twin: (b: { body: Planet; lat: number; lon: number; purpose: string; n?: number }, signal?: AbortSignal) => post<TwinResult>("/api/twin", b, signal),
  compare: (b: { body: Planet; lat: number; lon: number; purpose: string; earth_lat: number; earth_lon: number }, signal?: AbortSignal) =>
    post<CompareResult>("/api/twin/compare", b, signal),
  profile: (body: Body, lat: number, lon: number, axis: "ns" | "ew", signal?: AbortSignal) =>
    request<Profile>(`/api/profile?${qs({ body, lat, lon, axis })}`, { signal }),
  nearby: (
    b: { lat: number; lon: number; radius_km: number; mode: "nearest" | "best"; body?: Planet; target_lat?: number; target_lon?: number; purpose?: string; documented_only?: boolean; limit?: number },
    signal?: AbortSignal,
  ) => post<NearbyResult>("/api/analogs/nearby", b, signal),
  brief: (b: { body: Planet; lat: number; lon: number; purpose: string; earth_lat: number; earth_lon: number; setting?: string }, signal?: AbortSignal) =>
    post<Brief>("/api/brief", b, signal),
};

// Overlay image URLs (PNG rendered by the API from grid values).
export const overlay = {
  variable: (body: Body, id: string, region: "global" | "south" | "north" = "global") => `/api/overlay/var.png?${qs({ body, var: id, region })}`,
  suitability: (mission: string, weights: Record<string, number> | undefined, limits: string[] | undefined, region: "global" | "south" | "north" = "global") =>
    `/api/overlay/suitability.png?${qs({ mission, w: weights ? JSON.stringify(weights) : undefined, limits: limits ? limits.join(",") : undefined, region })}`,
  twin: (body: Planet, lat: number, lon: number, purpose: string) => `/api/overlay/twin.png?${qs({ body, lat: lat.toFixed(4), lon: lon.toFixed(4), purpose })}`,
};
