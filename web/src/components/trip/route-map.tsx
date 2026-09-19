"use client";

/**
 * The day's route on a real street map (Leaflet + OpenStreetMap tiles): numbered stops in visiting order,
 * amber for meals, indigo for sights, green for where you sleep. Hovering a stop in the timeline lifts its pin.
 */
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { DayPlan, GStay } from "@/lib/trip";

const pin = (label: string, color: string, big: boolean) =>
  `<span style="display:grid;place-items:center;width:${big ? 30 : 24}px;height:${big ? 30 : 24}px;border-radius:9999px;background:${color};color:#fff;font:600 11px/1 ui-sans-serif,system-ui;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);transition:all .15s">${label}</span>`;

export function RouteMap({ day, stay, hi, onHover }: { day: DayPlan; stay: GStay | null; hi: number | null; onHover: (i: number | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const pins = useRef<Marker[]>([]);
  const L = useRef<typeof import("leaflet") | null>(null);

  useEffect(() => {
    let dead = false;
    import("leaflet").then((mod) => {
      if (dead || !box.current) return;
      const lf = (L.current = mod.default ?? mod);
      const m = (map.current ??= lf.map(box.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true }));
      m.eachLayer((layer) => m.removeLayer(layer));
      lf.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(m);
      const pts = day.stops.map((s) => [s.place.lat, s.place.lon] as [number, number]);
      lf.polyline(pts, { color: "#3e63dd", weight: 3, opacity: 0.75, dashArray: "2 7", lineCap: "round" }).addTo(m);
      pins.current = day.stops.map((s, i) =>
        lf.marker(pts[i], { icon: lf.divIcon({ className: "", html: pin(String(i + 1), s.meal ? "#ffba18" : "#3e63dd", false), iconSize: [24, 24], iconAnchor: [12, 12] }), title: s.place.name })
          .addTo(m).on("mouseover", () => onHover(i)).on("mouseout", () => onHover(null)).bindTooltip(s.place.name, { direction: "top", offset: [0, -10] }));
      if (stay) lf.marker([stay.lat, stay.lon], { icon: lf.divIcon({ className: "", html: pin("zz", "#2a7e3b", false), iconSize: [24, 24], iconAnchor: [12, 12] }), title: stay.name }).addTo(m).bindTooltip(`Stay: ${stay.name}`, { direction: "top", offset: [0, -10] });
      m.fitBounds(lf.latLngBounds([...pts, ...(stay ? [[stay.lat, stay.lon] as [number, number]] : [])]).pad(0.18), { maxZoom: 16 });
      setTimeout(() => m.invalidateSize(), 50);
    });
    return () => { dead = true; };
  }, [day, stay]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const lf = L.current;
    if (!lf) return;
    pins.current.forEach((p, i) => {
      const s = day.stops[i];
      p.setIcon(lf.divIcon({ className: "", html: pin(String(i + 1), s.meal ? "#ffba18" : "#3e63dd", hi === i), iconSize: hi === i ? [30, 30] : [24, 24], iconAnchor: hi === i ? [15, 15] : [12, 12] }));
      p.setZIndexOffset(hi === i ? 1000 : 0);
    });
  }, [hi, day]);

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);

  return <div ref={box} className="isolate h-[300px] w-full overflow-hidden rounded-xl border border-border bg-muted/50" role="img" aria-label={`Map of day ${day.day}`} />;
}
