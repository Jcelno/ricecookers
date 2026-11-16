import { useEffect, useRef, useState } from "react";

/**
 * A lit sphere of a real world, drawn with one small WebGL shader.
 *
 * The start screen shows the Moon, Mars and Earth before any map engine has loaded, so this must be
 * light: a quad, one equirectangular texture (public/worlds/*.jpg, stitched from the same NASA tile
 * services the app's base maps use) and an orthographic projection. A place on the sphere can be marked;
 * its screen position is reported so the caller can draw a line to it.
 *
 * Without WebGL 2 the texture is shown as a flat disc instead: the page never depends on this drawing.
 */
export type World = "moon" | "mars" | "earth";
export interface LatLon { lat: number; lon: number }

const TEXTURE: Record<World, string> = { moon: "/worlds/moon.jpg", mars: "/worlds/mars.jpg", earth: "/worlds/earth.jpg" };
const RIM: Record<World, [number, number, number, number]> = {
  moon: [0.75, 0.82, 0.92, 0.05],
  mars: [0.95, 0.62, 0.45, 0.16],
  earth: [0.45, 0.72, 1.0, 0.5],
};

const GAIN: Record<World, number> = { moon: 1.25, mars: 1.5, earth: 1.12 };

const VERT = `#version 300 es
in vec2 aP; out vec2 vP;
void main() { vP = aP; gl_Position = vec4(aP, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uView;      // latitude and longitude at the centre of the disc, radians
uniform vec3 uLight;     // direction to the Sun in view space
uniform vec4 uRim;       // atmosphere tint and strength
uniform float uPx;       // one device pixel as a fraction of the radius
uniform float uGain;     // brightness to bring each mosaic to a similar level
in vec2 vP; out vec4 o;
const float PI = 3.141592653589793;
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float z = sqrt(1.0 - r * r);
  float s0 = sin(uView.x), c0 = cos(uView.x);
  float lat = asin(clamp(vP.y * c0 + z * s0, -1.0, 1.0));
  float lon = uView.y + atan(vP.x, z * c0 - vP.y * s0);
  float u = lon / (2.0 * PI) + 0.5;
  float v = 0.5 - lat / PI;
  // The longitude wraps along a line that can cross the visible disc near a pole. Take texture
  // gradients from whichever form of u is continuous there, so no seam of blurred texels appears.
  float ub = fract(u + 0.5);
  float ux = dFdx(u), uy = dFdy(u), bx = dFdx(ub), by = dFdy(ub);
  vec2 gx = vec2(abs(ux) < abs(bx) ? ux : bx, dFdx(v));
  vec2 gy = vec2(abs(uy) < abs(by) ? uy : by, dFdy(v));
  vec3 col = textureGrad(uTex, vec2(u, v), gx, gy).rgb;
  vec3 n = vec3(vP, z);
  float lit = smoothstep(-0.28, 0.6, dot(n, uLight));
  col *= uGain * mix(0.06, 1.1, lit);
  col *= mix(0.7, 1.0, pow(z, 0.45));
  col += uRim.rgb * uRim.a * pow(1.0 - z, 2.6) * (0.25 + 0.75 * lit);
  float a = 1.0 - smoothstep(1.0 - 2.5 * uPx, 1.0, r);
  o = vec4(col * a, a);
}`;

const rad = (d: number) => (d * Math.PI) / 180;
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Orthographic position of a place, as fractions of the radius from the disc centre (y up). Null on the far side. */
export function projectOrb(view: LatLon, p: LatLon): { x: number; y: number; z: number } {
  const f0 = rad(view.lat), f = rad(p.lat), dl = rad(p.lon - view.lon);
  return {
    x: Math.cos(f) * Math.sin(dl),
    y: Math.cos(f0) * Math.sin(f) - Math.sin(f0) * Math.cos(f) * Math.cos(dl),
    z: Math.sin(f0) * Math.sin(f) + Math.cos(f0) * Math.cos(f) * Math.cos(dl),
  };
}

interface Props {
  world: World;
  /** Where the disc is centred. A change eases there over about 900 ms. */
  view: LatLon;
  /** Turn slowly while no place is marked. */
  spin?: boolean;
  marker?: LatLon | null;
  /** Called with the marker's position in CSS pixels inside this element, or null when it is hidden. */
  onMarker?: (p: { x: number; y: number } | null) => void;
  className?: string;
  label: string;
}

export function WorldOrb({ world, view, spin = false, marker = null, onMarker, className, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const dot = useRef<HTMLSpanElement>(null);
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);
  const live = useRef({ view, spin, marker, onMarker });
  live.current = { view, spin, marker, onMarker };

  useEffect(() => {
    const cv = canvas.current, el = host.current;
    if (!cv || !el) return;
    const gl = cv.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "low-power" });
    if (!gl) { setFallback(true); return; }
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { setFallback(true); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aP");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uView = gl.getUniformLocation(prog, "uView"), uLight = gl.getUniformLocation(prog, "uLight");
    const uRim = gl.getUniformLocation(prog, "uRim"), uPx = gl.getUniformLocation(prog, "uPx");
    const light = [-0.52, 0.42, 0.74];
    const ln = Math.hypot(...light);
    gl.uniform3f(uLight, light[0] / ln, light[1] / ln, light[2] / ln);
    gl.uniform4f(uRim, ...RIM[world]);
    gl.uniform1f(gl.getUniformLocation(prog, "uGain"), GAIN[world]);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    let textured = false, dead = false, frame = 0, size = 0;
    const tex = gl.createTexture();
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (dead) return;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      textured = true;
      dirty = true;
      setReady(true);
    };
    img.onerror = () => { if (!dead) setFallback(true); };
    img.src = TEXTURE[world];

    const cur = { ...live.current.view };
    let dirty = true, last = performance.now(), lastMark = "";
    const resize = () => {
      const css = el.clientWidth;
      const px = Math.max(2, Math.round(css * Math.min(2, window.devicePixelRatio || 1)));
      if (px !== size) { size = px; cv.width = cv.height = px; gl.viewport(0, 0, px, px); gl.uniform1f(uPx, 2 / px); dirty = true; }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(64, now - last);
      last = now;
      const { view: target, spin: turning, marker: mark, onMarker: report } = live.current;
      const still = reduced();
      if (turning && !mark && !still) { cur.lon = wrap(cur.lon + dt * 0.0035); dirty = true; }
      else {
        // Ease toward the requested view; under reduced motion the view simply changes.
        const dLat = target.lat - cur.lat, dLon = wrap(target.lon - cur.lon);
        if (Math.abs(dLat) > 0.01 || Math.abs(dLon) > 0.01) {
          const k = still ? 1 : 1 - Math.exp(-dt / 190);
          cur.lat += dLat * k;
          cur.lon = wrap(cur.lon + dLon * k);
          dirty = true;
        }
      }
      if (!dirty) return;
      dirty = false;
      if (textured) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uView, rad(cur.lat), rad(cur.lon));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      const css = el.clientWidth, half = css / 2;
      let pos: { x: number; y: number } | null = null;
      if (mark) {
        const p = projectOrb(cur, mark);
        if (p.z > 0.06) pos = { x: half + p.x * half, y: half - p.y * half };
      }
      const key = pos ? `${pos.x.toFixed(1)},${pos.y.toFixed(1)}` : "";
      if (key !== lastMark) {
        lastMark = key;
        if (dot.current) {
          dot.current.style.opacity = pos ? "1" : "0";
          if (pos) dot.current.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
        }
        report?.(pos);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      dead = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [world]);

  return (
    <div ref={host} className={`orb orb-${world} ${className ?? ""}`} role="img" aria-label={label} data-ready={ready || fallback}>
      {fallback ? <span className={`world-disc ${world} orb-fallback`} /> : <canvas ref={canvas} aria-hidden />}
      <span ref={dot} className="orb-marker" aria-hidden style={{ opacity: 0 }}><i /><i /><b /></span>
    </div>
  );
}
