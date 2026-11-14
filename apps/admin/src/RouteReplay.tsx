import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Fix = {
  latitude: number;
  longitude: number;
  accuracy: number;
  battery?: number | null;
  mocked?: boolean | number;
  observed_at: string;
};
type Gap = { from: string; to: string; minutes: number };

const SPEEDS = [1, 2, 4, 8];
const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const reduced = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Position, accuracy and time at a fractional index along the route. */
function sample(points: Fix[], progress: number) {
  const i = Math.min(points.length - 1, Math.max(0, Math.floor(progress)));
  const j = Math.min(points.length - 1, i + 1);
  const f = i === j ? 0 : Math.min(1, progress - i);
  const a = points[i],
    b = points[j];
  return {
    i,
    f,
    lat: lerp(a.latitude, b.latitude, f),
    lng: lerp(a.longitude, b.longitude, f),
    accuracy: lerp(a.accuracy, b.accuracy, f),
    time: lerp(Date.parse(a.observed_at), Date.parse(b.observed_at), f),
    mocked: !!(f < 0.5 ? a.mocked : b.mocked),
    from: a,
    to: b,
  };
}

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d={d} fill="currentColor" />
  </svg>
);
const PLAY =
  "M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z";
const PAUSE = "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z";
const REPLAY = "M12 5V2L7 6.5 12 11V8a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8Z";

export function RouteReplay({ points, gaps }: { points: Fix[]; gaps: Gap[] }) {
  const last = points.length - 1;
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const parts = useRef<{
    ghost?: L.Polyline;
    glow?: L.Polyline;
    trail?: L.Polyline;
    dots: L.CircleMarker[];
    marker?: L.Marker;
    accuracy?: L.Circle;
    group: L.LayerGroup;
  } | null>(null);
  const lastPan = useRef(0);
  const [progress, setProgress] = useState(last);
  const progressRef = useRef(last);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [follow, setFollow] = useState(true);
  const followRef = useRef(true);
  followRef.current = follow;

  // Same route? Keep the viewer's place when the page refreshes its data.
  const signature = useMemo(
    () =>
      points.length
        ? `${points.length}|${points[0].observed_at}|${points[last].observed_at}`
        : "none",
    [points, last],
  );
  const gapAt = useMemo(() => {
    const set = new Map<number, Gap>();
    for (const g of gaps)
      for (let i = 0; i < last; i++)
        if (
          points[i].observed_at === g.from &&
          points[i + 1].observed_at === g.to
        )
          set.set(i, g);
    return set;
  }, [points, gaps, last]);

  // Roughly 20 seconds for the whole route at 1x, never too fast or too slow per leg.
  const legMs = Math.min(1400, Math.max(160, 20000 / Math.max(1, last)));

  const seek = (p: number) => {
    const clamped = Math.min(last, Math.max(0, p));
    progressRef.current = clamped;
    setProgress(clamped);
  };

  // Build the map once.
  useEffect(() => {
    if (!mapEl.current) return;
    const m = L.map(mapEl.current, {
      scrollWheelZoom: false,
      zoomControl: true,
    }).setView([points[0].latitude, points[0].longitude], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      parts.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)build the route layers when the route itself changes.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    parts.current?.group.remove();
    const group = L.layerGroup().addTo(m);
    const path = points.map(
      (p) => [p.latitude, p.longitude] as [number, number],
    );
    const ghost = L.polyline(path, {
      color: "#9bb5bd",
      weight: 4,
      opacity: 0.7,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(group);
    // Signal gaps are drawn dashed in amber so a "jump" is never mistaken for travel.
    gapAt.forEach((g, i) =>
      L.polyline([path[i], path[i + 1]], {
        color: "#d97706",
        weight: 4,
        dashArray: "2 9",
        lineCap: "round",
      })
        .bindTooltip(`Signal gap · ${g.minutes} min`, { sticky: true })
        .addTo(group),
    );
    const glow = L.polyline([], {
      color: "#0f766e",
      weight: 12,
      opacity: 0.18,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(group);
    const trail = L.polyline([], {
      color: "#0f766e",
      weight: 5,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(group);
    const dots = points.map((p) =>
      L.circleMarker([p.latitude, p.longitude], {
        radius: 3.5,
        color: "#9bb5bd",
        weight: 2,
        fillColor: "#fff",
        fillOpacity: 1,
      })
        .bindTooltip(clock(Date.parse(p.observed_at)))
        .addTo(group),
    );
    const pin = (label: string, cls: string) =>
      L.divIcon({
        className: "rr-pin-wrap",
        html: `<span class="rr-pin ${cls}">${label}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
    L.marker(path[0], { icon: pin("S", "start"), keyboard: false })
      .bindTooltip("Start")
      .addTo(group);
    if (path.length > 1)
      L.marker(path[last], { icon: pin("E", "end"), keyboard: false })
        .bindTooltip("Latest fix")
        .addTo(group);
    const accuracy = L.circle(path[0], {
      radius: points[0].accuracy,
      color: "#0f766e",
      weight: 1,
      fillOpacity: 0.12,
    }).addTo(group);
    const marker = L.marker(path[0], {
      icon: L.divIcon({
        className: "rr-marker-wrap",
        html: '<span class="rr-marker"><i class="rr-pulse"></i><i class="rr-dot"></i></span>',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
      zIndexOffset: 1000,
      keyboard: false,
    }).addTo(group);
    parts.current = { ghost, glow, trail, dots, marker, accuracy, group };
    if (points.length > 1)
      m.fitBounds(L.latLngBounds(path), { padding: [40, 40], maxZoom: 16 });
    else m.setView(path[0], 16);
    // A refreshed route keeps its place, except when sitting at the end, where it follows new fixes.
    const atEnd = progressRef.current >= Math.max(0, last - 1) - 0.0001;
    seek(atEnd ? last : Math.min(progressRef.current, last));
    paint(progressRef.current, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, gapAt]);

  // Move everything to a (possibly fractional) position without rebuilding layers.
  function paint(p: number, allowPan: boolean) {
    const v = parts.current;
    const m = map.current;
    if (!v || !m || !points.length) return;
    const s = sample(points, p);
    const here: [number, number] = [s.lat, s.lng];
    const done = points
      .slice(0, s.i + 1)
      .map((x) => [x.latitude, x.longitude] as [number, number]);
    if (s.f > 0) done.push(here);
    v.trail?.setLatLngs(done);
    v.glow?.setLatLngs(done);
    v.marker?.setLatLng(here);
    v.accuracy?.setLatLng(here);
    v.accuracy?.setRadius(Math.max(1, s.accuracy));
    v.accuracy?.setStyle({ color: s.mocked ? "#b42318" : "#0f766e" });
    v.dots.forEach((d, i) => {
      const passed = p >= i - 1e-6;
      d.setStyle(
        passed
          ? {
              color: "#0f766e",
              fillColor: "#0f766e",
              fillOpacity: 1,
              weight: 2,
            }
          : { color: "#9bb5bd", fillColor: "#fff", fillOpacity: 1, weight: 2 },
      );
    });
    const el = v.marker?.getElement()?.querySelector(".rr-marker");
    el?.classList.toggle("mock", s.mocked);
    // Camera: glide only when the marker nears the edge, so the map never lurches.
    if (allowPan && followRef.current) {
      const size = m.getSize();
      const pt = m.latLngToContainerPoint(here);
      const mx = size.x * 0.22,
        my = size.y * 0.22;
      const near =
        pt.x < mx || pt.x > size.x - mx || pt.y < my || pt.y > size.y - my;
      const now = performance.now();
      if (near && now - lastPan.current > 700) {
        lastPan.current = now;
        m.panTo(here, {
          animate: !reduced(),
          duration: 0.9,
          easeLinearity: 0.35,
        });
      }
    }
  }
  useLayoutEffect(() => {
    paint(progress, playing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  // The animation loop: time-based, so the marker glides at the same pace on any display.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let prev = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(100, now - prev);
      prev = now;
      const next = progressRef.current + (dt / legMs) * speed;
      if (next >= last) {
        seek(last);
        setPlaying(false);
        return;
      }
      seek(next);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, legMs, last]);

  const toggle = () => {
    if (last < 1) return;
    if (!playing && progressRef.current >= last) seek(0);
    setPlaying((p) => !p);
  };
  const fit = () =>
    map.current?.fitBounds(
      L.latLngBounds(
        points.map((p) => [p.latitude, p.longitude] as [number, number]),
      ),
      { padding: [40, 40], maxZoom: 16, animate: !reduced() },
    );

  const s = sample(points, progress);
  const inGap = gapAt.get(Math.min(s.i, last - 1)) && s.f > 0 && s.f < 1;
  const pct = last > 0 ? (progress / last) * 100 : 100;
  const fix = s.f < 0.5 ? s.from : s.to;

  return (
    <div
      className="rr"
      tabIndex={0}
      aria-label="Route replay. Space plays or pauses, left and right arrows step through fixes."
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === " ") {
          e.preventDefault();
          toggle();
        } else if (e.key === "ArrowRight") {
          setPlaying(false);
          seek(Math.floor(progressRef.current) + 1);
        } else if (e.key === "ArrowLeft") {
          setPlaying(false);
          seek(Math.ceil(progressRef.current) - 1);
        }
      }}
    >
      <div className="rr-stage">
        <div
          ref={mapEl}
          className="map"
          role="img"
          aria-label="Recorded location route map"
        />
        <div className="rr-hud" aria-live="off">
          <strong>{clock(s.time)}</strong>
          <span>
            Fix {Math.min(last, Math.round(progress)) + 1} of {points.length}
          </span>
        </div>
        {inGap && (
          <div className="rr-gap" role="status">
            Signal gap · {gapAt.get(s.i)!.minutes} min
          </div>
        )}
        <div className="rr-tools">
          <button
            type="button"
            className={"rr-tool" + (follow ? " on" : "")}
            aria-pressed={follow}
            onClick={() => setFollow(!follow)}
            title="Keep the marker in view while playing"
          >
            Follow
          </button>
          <button
            type="button"
            className="rr-tool"
            onClick={fit}
            title="Show the whole route"
          >
            Fit route
          </button>
        </div>
      </div>

      <div className="rr-bar">
        <button
          type="button"
          className="rr-play"
          disabled={points.length < 2}
          onClick={toggle}
          aria-label={
            playing
              ? "Pause replay"
              : progress >= last
                ? "Replay route"
                : "Play route"
          }
        >
          <Icon
            d={playing ? PAUSE : progress >= last && last > 0 ? REPLAY : PLAY}
          />
        </button>
        <div className="rr-timeline">
          <div className="rr-track" aria-hidden="true">
            {[...gapAt.keys()].map((i) => (
              <span
                key={i}
                className="rr-band"
                style={{
                  left: `${(i / Math.max(1, last)) * 100}%`,
                  width: `${(1 / Math.max(1, last)) * 100}%`,
                }}
              />
            ))}
          </div>
          <input
            type="range"
            aria-label="Replay position"
            min={0}
            max={Math.max(1, last)}
            step="any"
            value={progress}
            disabled={points.length < 2}
            style={{ "--p": pct + "%" } as CSSProperties}
            onChange={(e) => {
              setPlaying(false);
              seek(Number(e.target.value));
            }}
          />
        </div>
        <div className="rr-speed" role="group" aria-label="Playback speed">
          {SPEEDS.map((x) => (
            <button
              key={x}
              type="button"
              className={x === speed ? "on" : ""}
              aria-pressed={x === speed}
              onClick={() => setSpeed(x)}
            >
              {x}×
            </button>
          ))}
        </div>
      </div>

      <div className="rr-chips">
        <span className="rr-chip">±{Math.round(fix.accuracy)} m accuracy</span>
        <span className="rr-chip">
          Battery {fix.battery ?? "unknown"}
          {fix.battery != null ? "%" : ""}
        </span>
        {fix.mocked ? <span className="rr-chip bad">Mock location</span> : null}
        <span className="rr-chip muted">
          {fix.latitude.toFixed(5)}, {fix.longitude.toFixed(5)}
        </span>
      </div>
    </div>
  );
}
