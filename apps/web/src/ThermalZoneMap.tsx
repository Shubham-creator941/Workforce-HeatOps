import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import type { FeatureCollection, Polygon } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  FortyGuardPreviewResult,
  SupervisorPlanningResult,
} from "@heatops/contracts";

const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    basemap: {
      type: "raster",
      tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [{ id: "basemap", type: "raster", source: "basemap" }],
};

type Zone = {
  zoneId: string;
  airTemperatureC: number;
  estimatedWbgtC: number | null;
  safetyDecision: string;
  geometry: Polygon;
};

function displayDecision(value: string): string {
  return value === "MANUAL_REVIEW_REQUIRED"
    ? "Manual Review Required"
    : value
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toUpperCase());
}

function thermalColor(value: number | null, minimum: number, maximum: number) {
  if (value === null) return "#64748b";
  if (maximum === minimum) return "#ff8a2a";
  const position = (value - minimum) / (maximum - minimum);
  if (position < 0.34) return "#f5d742";
  if (position < 0.67) return "#ff8a2a";
  return "#ef4444";
}

function tooltip(zone: Zone): HTMLDivElement {
  const root = document.createElement("div");
  root.className = "map-tooltip";
  const title = document.createElement("strong");
  title.textContent = zone.zoneId.replaceAll("-", " ");
  const air = document.createElement("span");
  air.textContent = `Air temperature: ${zone.airTemperatureC.toFixed(2)}°C`;
  const wbgt = document.createElement("span");
  wbgt.textContent = `Estimated Outdoor WBGT: ${zone.estimatedWbgtC?.toFixed(3) ?? "Unavailable"}${zone.estimatedWbgtC === null ? "" : "°C"}`;
  const safety = document.createElement("span");
  safety.textContent = `Safety: ${displayDecision(zone.safetyDecision)}`;
  root.append(title, air, wbgt, safety);
  return root;
}

export function ThermalZoneMap({
  result,
  preview,
  loading,
  selectedZoneId,
  onSelectZone,
}: {
  result: SupervisorPlanningResult | undefined;
  preview?: FortyGuardPreviewResult;
  loading: boolean;
  selectedZoneId: string | undefined;
  onSelectZone: (zoneId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | undefined>(undefined);
  const selectedRef = useRef<string | undefined>(undefined);
  const [basemapError, setBasemapError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const zones = useMemo<Zone[]>(() => {
    if (preview)
      return preview.tiles.map((tile) => ({
        zoneId: tile.tileId,
        airTemperatureC: tile.averageTemperatureC,
        estimatedWbgtC: null,
        safetyDecision: "UNAVAILABLE_WITHOUT_VERIFIED_2M_WIND",
        geometry: tile.geometry,
      }));
    return (
      result?.environment.flatMap((environment) => {
        const evidence = environment.providerEvidence;
        if (!evidence) return [];
        const thermal = environment.thermal;
        const safety = result.safety.find(
          (item) => item.context.zoneId === environment.snapshot.zoneId,
        );
        return [
          {
            zoneId: environment.snapshot.zoneId,
            airTemperatureC: environment.snapshot.airTemperatureC,
            estimatedWbgtC:
              thermal?.status === "VALID" ? thermal.estimatedWbgtC : null,
            safetyDecision: safety?.result.decision ?? "INSUFFICIENT_DATA",
            geometry: evidence.fortyGuard.tileGeometry,
          },
        ];
      }) ?? []
    );
  }, [preview, result]);

  useEffect(() => {
    selectedRef.current = selectedZoneId;
    const map = mapRef.current;
    if (map?.getLayer("zones-fill"))
      map.setPaintProperty("zones-fill", "fill-outline-color", [
        "case",
        ["==", ["get", "zoneId"], selectedZoneId ?? ""],
        "#ffffff",
        "#ffbd5c",
      ]);
  }, [selectedZoneId]);

  useEffect(() => {
    if (!containerRef.current || zones.length === 0) return;
    setBasemapError(false);
    setMapReady(false);
    const values = zones
      .map((zone) => (preview ? zone.airTemperatureC : zone.estimatedWbgtC))
      .filter((value): value is number => value !== null);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const collection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: zones.map((zone) => ({
        type: "Feature",
        id: zone.zoneId,
        geometry: zone.geometry,
        properties: {
          zoneId: zone.zoneId,
          fillColor: thermalColor(
            preview ? zone.airTemperatureC : zone.estimatedWbgtC,
            minimum,
            maximum,
          ),
        },
      })),
    };
    const first = zones[0]?.geometry.coordinates[0]?.[0];
    if (!first) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: first as [number, number],
      zoom: 14,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-left");
    map.addControl(
      new maplibregl.AttributionControl({ compact: false }),
      "bottom-right",
    );
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
    });
    map.on("error", () => setBasemapError(true));
    map.on("load", () => {
      map.addSource("zones", { type: "geojson", data: collection });
      map.addLayer({
        id: "zones-fill",
        type: "fill",
        source: "zones",
        paint: {
          "fill-color": ["get", "fillColor"],
          "fill-opacity": 0.66,
          "fill-outline-color": [
            "case",
            ["==", ["get", "zoneId"], selectedRef.current ?? ""],
            "#ffffff",
            "#ffbd5c",
          ],
        },
      });
      map.addLayer({
        id: "zones-line",
        type: "line",
        source: "zones",
        paint: { "line-color": "#ffffff", "line-width": 1.5 },
      });
      const bounds = new maplibregl.LngLatBounds();
      for (const zone of zones)
        for (const ring of zone.geometry.coordinates)
          for (const coordinate of ring)
            bounds.extend(coordinate as [number, number]);
      map.fitBounds(bounds, {
        padding: 48,
        maxZoom: 17,
        duration: 0,
      });
      setMapReady(true);
      map.on("mouseenter", "zones-fill", (event) => {
        map.getCanvas().style.cursor = "pointer";
        const feature = event.features?.[0];
        const zone = zones.find(
          (item) => item.zoneId === feature?.properties.zoneId,
        );
        if (zone)
          popup.setLngLat(event.lngLat).setDOMContent(tooltip(zone)).addTo(map);
      });
      map.on("mousemove", "zones-fill", (event) =>
        popup.setLngLat(event.lngLat),
      );
      map.on("mouseleave", "zones-fill", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("click", "zones-fill", (event) => {
        const zoneId = event.features?.[0]?.properties.zoneId as
          string | undefined;
        if (zoneId) onSelectZone(zoneId);
      });
    });
    return () => {
      popup.remove();
      map.remove();
      mapRef.current = undefined;
    };
  }, [onSelectZone, zones]);

  if (loading)
    return <div className="map-state">Loading verified zone geometry…</div>;
  if (!result && !preview)
    return (
      <div className="map-state">Run HeatOps to load the thermal map.</div>
    );
  if (zones.length === 0)
    return (
      <div className="map-state error" role="status">
        No verified zone geometry is available for this result.
      </div>
    );
  return (
    <div className="thermal-map interactive-map">
      <div
        ref={containerRef}
        className="maplibre-host"
        role="application"
        aria-label="Interactive thermal zone map"
        aria-busy={!mapReady}
        data-ready={mapReady}
      />
      {basemapError && (
        <div className="basemap-warning" role="status">
          Basemap unavailable. Verified zone geometry and evidence remain
          active.
        </div>
      )}
      <div className="zone-selectors" aria-label="Map zones">
        {zones.map((zone) => (
          <button
            key={zone.zoneId}
            type="button"
            aria-label={`Select ${zone.zoneId}`}
            aria-pressed={selectedZoneId === zone.zoneId}
            onClick={() => onSelectZone(zone.zoneId)}
          >
            {zone.zoneId.replaceAll("-", " ")}
          </button>
        ))}
      </div>
      <div className="map-legend">
        <i />
        <span>
          {preview
            ? "Relative thermal color · FortyGuard air temperature"
            : "Relative thermal color · backend Estimated Outdoor WBGT"}
        </span>
        <span>Click a zone for evidence</span>
      </div>
    </div>
  );
}
