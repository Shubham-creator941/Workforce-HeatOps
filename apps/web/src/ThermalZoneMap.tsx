import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  FortyGuardPreviewResult,
  SupervisorPlanningResult,
} from "@heatops/contracts";

const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SOURCE_ID = "fortyguard-zones";
const FILL_LAYER_ID = "fortyguard-fill";
const OUTLINE_LAYER_ID = "fortyguard-outline";
type AreaGeometry = Polygon | MultiPolygon;
type Zone = {
  zoneId: string;
  airTemperatureC: number;
  estimatedWbgtC: number | null;
  safetyDecision: string;
  geometry: AreaGeometry;
};

function coordinatesOf(geometry: AreaGeometry): number[][] {
  return geometry.type === "Polygon"
    ? geometry.coordinates.flat()
    : geometry.coordinates.flat(2);
}
export function featureCollectionBounds(
  collection: FeatureCollection<AreaGeometry>,
): [[number, number], [number, number]] | null {
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  for (const [featureIndex, feature] of collection.features.entries())
    for (const coordinate of coordinatesOf(feature.geometry)) {
      const longitude = coordinate[0],
        latitude = coordinate[1];
      if (
        longitude === undefined ||
        latitude === undefined ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
      )
        throw new Error(
          `Invalid longitude/latitude in map feature ${featureIndex}.`,
        );
      west = Math.min(west, longitude);
      south = Math.min(south, latitude);
      east = Math.max(east, longitude);
      north = Math.max(north, latitude);
    }
  return Number.isFinite(west)
    ? [
        [west, south],
        [east, north],
      ]
    : null;
}
function displayDecision(value: string): string {
  return value === "MANUAL_REVIEW_REQUIRED"
    ? "Manual Review Required"
    : value
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toUpperCase());
}
function tooltip(zone: Zone): HTMLDivElement {
  const root = document.createElement("div");
  root.className = "map-tooltip";
  const title = document.createElement("strong");
  title.textContent = zone.zoneId.replaceAll("-", " ");
  const air = document.createElement("span");
  air.textContent = `FortyGuard average air temperature: ${zone.airTemperatureC.toFixed(2)}°C`;
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
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string>();
  const [sourceFeatureCount, setSourceFeatureCount] = useState(0);
  const [renderedFeatureCount, setRenderedFeatureCount] = useState(0);
  const [basemapLayerCount, setBasemapLayerCount] = useState(0);
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
        const safety = result.safety.find(
          (item) => item.context.zoneId === environment.snapshot.zoneId,
        );
        return [
          {
            zoneId: environment.snapshot.zoneId,
            airTemperatureC: environment.snapshot.airTemperatureC,
            estimatedWbgtC:
              environment.thermal?.status === "VALID"
                ? environment.thermal.estimatedWbgtC
                : null,
            safetyDecision: safety?.result.decision ?? "INSUFFICIENT_DATA",
            geometry: evidence.fortyGuard.tileGeometry,
          },
        ];
      }) ?? []
    );
  }, [preview, result]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer(OUTLINE_LAYER_ID)) return;
    map.setPaintProperty(OUTLINE_LAYER_ID, "line-color", [
      "case",
      ["==", ["get", "zoneId"], selectedZoneId ?? ""],
      "#ffffff",
      "#ffd166",
    ]);
    map.setPaintProperty(OUTLINE_LAYER_ID, "line-width", [
      "case",
      ["==", ["get", "zoneId"], selectedZoneId ?? ""],
      4,
      2,
    ]);
  }, [selectedZoneId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || zones.length === 0) return;
    setMapReady(false);
    setMapError(undefined);
    setSourceFeatureCount(0);
    setRenderedFeatureCount(0);
    setBasemapLayerCount(0);
    const collection: FeatureCollection<AreaGeometry> = {
      type: "FeatureCollection",
      features: zones.map((zone) => ({
        type: "Feature",
        id: zone.zoneId,
        geometry: zone.geometry,
        properties: { zoneId: zone.zoneId },
      })),
    };
    let bounds: [[number, number], [number, number]];
    try {
      const computed = featureCollectionBounds(collection);
      if (!computed) throw new Error("No polygon coordinates available.");
      bounds = computed;
    } catch (error) {
      setMapError(
        error instanceof Error ? error.message : "Invalid polygon geometry.",
      );
      return;
    }
    let map: maplibregl.Map | undefined;
    let popup: maplibregl.Popup | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let layoutFrame = 0;
    let diagnosticsTimer = 0;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(BASEMAP_STYLE);
        if (!response.ok)
          throw new Error(
            `OpenFreeMap style request failed (${response.status}).`,
          );
        const style = (await response.json()) as StyleSpecification;
        style.sources[SOURCE_ID] = { type: "geojson", data: collection };
        style.layers.push(
          {
            id: FILL_LAYER_ID,
            type: "fill",
            source: SOURCE_ID,
            paint: { "fill-color": "#ff8a00", "fill-opacity": 0.5 },
          },
          {
            id: OUTLINE_LAYER_ID,
            type: "line",
            source: SOURCE_ID,
            paint: { "line-color": "#ffd166", "line-width": 2 },
          },
        );
        if (cancelled) return;
        map = new maplibregl.Map({
          container,
          style,
          bounds,
          fitBoundsOptions: { padding: 50, maxZoom: 18, duration: 0 },
          attributionControl: false,
        });
        mapRef.current = map;
        map.on("error", (event) =>
          setMapError(
            event.error instanceof Error
              ? event.error.message
              : "MapLibre resource failed to load.",
          ),
        );
        map.addControl(new maplibregl.NavigationControl(), "top-left");
        map.addControl(
          new maplibregl.AttributionControl({ compact: false }),
          "bottom-right",
        );
        popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
        });
        resizeObserver = new ResizeObserver(() => map?.resize());
        resizeObserver.observe(container);
        map.on("mouseenter", FILL_LAYER_ID, (event) => {
          map!.getCanvas().style.cursor = "pointer";
          const zone = zones.find(
            (item) => item.zoneId === event.features?.[0]?.properties.zoneId,
          );
          if (zone)
            popup!
              .setLngLat(event.lngLat)
              .setDOMContent(tooltip(zone))
              .addTo(map!);
        });
        map.on("mousemove", FILL_LAYER_ID, (event) =>
          popup!.setLngLat(event.lngLat),
        );
        map.on("mouseleave", FILL_LAYER_ID, () => {
          map!.getCanvas().style.cursor = "";
          popup!.remove();
        });
        map.on("click", FILL_LAYER_ID, (event) => {
          const zoneId = event.features?.[0]?.properties.zoneId as
            string | undefined;
          if (zoneId) onSelectZone(zoneId);
        });
        const assessRenderedMap = () => {
          const sourceCount = map!.querySourceFeatures(SOURCE_ID).length;
          const renderedFeatures = map!.queryRenderedFeatures();
          const renderedCount = renderedFeatures.filter(
            (feature) => feature.layer.id === FILL_LAYER_ID,
          ).length;
          const baseCount = renderedFeatures.filter(
            (feature) =>
              feature.layer.id !== FILL_LAYER_ID &&
              feature.layer.id !== OUTLINE_LAYER_ID,
          ).length;
          setSourceFeatureCount(sourceCount);
          setRenderedFeatureCount(renderedCount);
          setBasemapLayerCount(baseCount);
          if (sourceCount > 0 && renderedCount > 0 && baseCount > 0) {
            setMapReady(true);
            map!.off("render", assessRenderedMap);
            window.clearInterval(diagnosticsTimer);
          }
        };
        map.on("render", assessRenderedMap);
        diagnosticsTimer = window.setInterval(assessRenderedMap, 250);
        layoutFrame = window.requestAnimationFrame(() => {
          layoutFrame = window.requestAnimationFrame(() => {
            map!.resize();
            map!.fitBounds(bounds, { padding: 50, maxZoom: 18, duration: 0 });
            map!.triggerRepaint();
          });
        });
      } catch (error) {
        if (!cancelled)
          setMapError(
            error instanceof Error
              ? error.message
              : "OpenFreeMap failed to load.",
          );
      }
    })();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(layoutFrame);
      window.clearInterval(diagnosticsTimer);
      resizeObserver?.disconnect();
      popup?.remove();
      map?.remove();
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
      <div className="map-viewport">
        <div
          ref={containerRef}
          className="maplibre-host"
          role="application"
          aria-label="Interactive thermal zone map"
          aria-busy={!mapReady}
          data-ready={mapReady}
          data-input-feature-count={zones.length}
          data-source-feature-count={sourceFeatureCount}
          data-rendered-feature-count={renderedFeatureCount}
          data-basemap-layer-count={basemapLayerCount}
          data-source-exists={Boolean(mapRef.current?.getSource(SOURCE_ID))}
          data-fill-layer-exists={Boolean(
            mapRef.current?.getLayer(FILL_LAYER_ID),
          )}
          data-outline-layer-exists={Boolean(
            mapRef.current?.getLayer(OUTLINE_LAYER_ID),
          )}
        />
        {mapError && (
          <div className="basemap-warning" role="alert">
            Map unavailable: {mapError}
          </div>
        )}
      </div>
      <div className="map-legend">
        <i />
        <span>
          {preview
            ? "FortyGuard air-temperature tile coverage"
            : "Verified planning-zone coverage"}
        </span>
        <span>Click a tile for evidence</span>
      </div>
    </div>
  );
}
