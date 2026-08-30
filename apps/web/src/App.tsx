import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  CloudSun,
  Database,
  Download,
  FileText,
  Info,
  Layers3,
  LoaderCircle,
  MapPinned,
  Play,
  Settings,
  ShieldCheck,
  Sparkles,
  ThermometerSun,
  Users,
  Wind,
  Workflow,
} from "lucide-react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import {
  PlanningExplanationSchema,
  PlanningRunSchema,
  SupervisorPlanningResultSchema,
  type PlanningExplanation,
  type PlanningRequest,
  type SupervisorPlanningResult,
} from "@heatops/contracts";
import { ThermalZoneMap } from "./ThermalZoneMap.js";

type RunState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; result: SupervisorPlanningResult; demo: boolean }
  | { kind: "error"; message: string; code?: string };
type LiveProviderInputs = {
  windSpeedMs: string;
  observedAt: string;
  sourceRef: string;
};
type Context = {
  state: RunState;
  run: (
    scenario: "demo" | "live",
    liveInputs?: LiveProviderInputs,
  ) => Promise<void>;
  result: SupervisorPlanningResult | undefined;
  demo: boolean;
  explanation: PlanningExplanation | undefined;
  explanationError: string | undefined;
};
const names: Record<string, string> = {
  "zone-east": "East Structure",
  "task-wall": "Exterior wall set",
  "crew-masons": "Masonry Crew",
};
const name = (id: string) => names[id] ?? id.replaceAll("-", " ");
const displayDecision = (value: string) =>
  value === "MANUAL_REVIEW_REQUIRED"
    ? "Manual Review Required"
    : value
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^./, (x) => x.toUpperCase());
const fmt = (value?: string) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";

async function api(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
  } catch {
    throw Object.assign(
      new Error(
        "The HeatOps planning API is unavailable. Start or configure the Node API and try again.",
      ),
      { code: "PLANNING_API_UNAVAILABLE" },
    );
  }
  const raw = await response.text();
  let body: {
    data?: unknown;
    error?: { code?: string; message?: string };
  };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    throw Object.assign(
      new Error(
        "The planning API returned an invalid response. Check the API and provider configuration.",
      ),
      { code: "INVALID_API_RESPONSE" },
    );
  }
  if (!response.ok)
    throw Object.assign(
      new Error(body.error?.message ?? `Request failed (${response.status})`),
      { code: body.error?.code },
    );
  return body.data;
}

function liveRequest(inputs: LiveProviderInputs): PlanningRequest {
  const windSpeedMs = Number(inputs.windSpeedMs);
  if (
    inputs.windSpeedMs.trim() === "" ||
    !Number.isFinite(windSpeedMs) ||
    windSpeedMs < 0
  )
    throw Object.assign(new Error("Enter a valid trusted 2 m wind speed."), {
      code: "TRUSTED_WIND_CONFIGURATION",
    });
  if (!inputs.observedAt || Number.isNaN(Date.parse(inputs.observedAt)))
    throw Object.assign(
      new Error("Supply the exact trusted 2 m wind observation timestamp."),
      {
        code: "TRUSTED_WIND_CONFIGURATION",
      },
    );
  if (!inputs.sourceRef.trim())
    throw Object.assign(
      new Error("Supply the trusted 2 m wind source reference."),
      {
        code: "TRUSTED_WIND_CONFIGURATION",
      },
    );
  const endAt = new Date(inputs.observedAt).toISOString();
  return {
    contractVersion: "1.0",
    site: { id: "site-demo", name: "Phoenix Riverside Build" },
    slotDurationMinutes: 60,
    timeSlots: [{ id: "hour-1", endAt }],
    tasks: [
      {
        id: "task-wall",
        zoneId: "zone-east",
        durationSlots: 1,
        eligibleCrewIds: ["crew-masons"],
        availableSlotIds: ["hour-1"],
        requiredSkills: ["masonry"],
        workloadCategory: "LIGHT",
        predecessorIds: [],
        required: true,
        productivityWeight: 1,
        preferredCrewIds: ["crew-masons"],
      },
    ],
    crews: [
      {
        id: "crew-masons",
        skills: ["masonry"],
        availableSlotIds: ["hour-1"],
        maxHeatExposureSlots: 1,
        exposureBudgetRef: "supervisor-budget-demo",
        ppeCategory: "NORMAL_WORK_CLOTHING",
        acclimatization: { state: "ACCLIMATIZED" },
      },
    ],
    zones: [{ id: "zone-east", capacity: 1, availableSlotIds: ["hour-1"] }],
    snapshots: [],
    environmentalSource: {
      mode: "PROVIDERS",
      timeZone: "America/Phoenix",
      zones: [
        {
          zoneId: "zone-east",
          samplePoint: [-112, 33],
          polygon: [
            [-112.01, 32.99],
            [-111.99, 32.99],
            [-111.99, 33.01],
            [-112.01, 33.01],
            [-112.01, 32.99],
          ],
        },
      ],
      verifiedWind2m: [
        {
          zoneId: "zone-east",
          slotId: "hour-1",
          windSpeedMs,
          measurementHeightM: 2,
          observedAt: endAt,
          sourceRef: inputs.sourceRef.trim(),
        },
      ],
    },
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  const links = [
    ["/mission", MapPinned, "Mission Control"],
    ["/plan", Layers3, "Optimized Plan"],
    ["/evidence", ShieldCheck, "Evidence"],
    ["/alerts", Bell, "Alerts"],
    ["/reports", FileText, "Reports"],
    ["/settings", Settings, "Settings"],
  ] as const;
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <span>
            <ThermometerSun />
          </span>
          <b>HeatOps</b>
        </div>
        <nav>
          {links.map(([to, Icon, label]) => (
            <NavLink key={to} to={to}>
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="user">
          <span>PS</span>
          <div>
            <b>Priya Sharma</b>
            <small>Supervisor · Online</small>
          </div>
        </div>
        <small className="version">HeatOps v1.0 · Demo build</small>
      </aside>
      <main className="page">{children}</main>
    </div>
  );
}

function PageHead({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children}
    </header>
  );
}

function Progress({ state }: { state: RunState }) {
  const active =
    state.kind === "success"
      ? 5
      : state.kind === "loading"
        ? 2
        : state.kind === "error"
          ? 1
          : 0;
  return (
    <div className="progress-card card">
      <div className="section-head">
        <h3>Planning run</h3>
        <span className="badge">
          {state.kind === "success" ? "Complete" : state.kind}
        </span>
      </div>
      {["Evidence", "Thermal", "Safety", "Optimization", "Result"].map(
        (x, i) => (
          <div
            className={
              i < active ? "step done" : i === active ? "step current" : "step"
            }
            key={x}
          >
            <span>{i < active ? "✓" : i + 1}</span>
            <b>{x}</b>
            <small>
              {i < active
                ? "Complete"
                : i === active
                  ? "In progress"
                  : "Pending"}
            </small>
          </div>
        ),
      )}
    </div>
  );
}

function Mission({ context }: { context: Context }) {
  const [scenario, setScenario] = useState<"demo" | "live">("demo");
  const [liveInputs, setLiveInputs] = useState<LiveProviderInputs>(() => {
    const nextHour = new Date();
    nextHour.setUTCMinutes(0, 0, 0);
    nextHour.setUTCHours(nextHour.getUTCHours() + 1);
    return {
      windSpeedMs: "",
      observedAt: nextHour.toISOString(),
      sourceRef: "",
    };
  });
  const [selectedZoneId, setSelectedZoneId] = useState<string>();
  const { result, state } = context;
  const activeZoneId =
    selectedZoneId ?? result?.environment[0]?.snapshot.zoneId;
  const env = result?.environment.find(
    (item) => item.snapshot.zoneId === activeZoneId,
  );
  const safety = result?.safety.find(
    (item) => item.context.zoneId === activeZoneId,
  );
  const selectZone = useCallback((zoneId: string) => {
    setSelectedZoneId(zoneId);
  }, []);
  const wbgt =
    env?.thermal?.status === "VALID" ? env.thermal.estimatedWbgtC : null;
  return (
    <Shell>
      <PageHead
        eyebrow="MISSION CONTROL"
        title="Phoenix Riverside Build"
        subtitle="Deterministic heat-aware workforce planning."
      >
        <div className="run-controls">
          <label>
            Scenario
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value as "demo" | "live")}
            >
              <option value="demo">Golden Demo Evidence</option>
              <option value="live">Live Providers</option>
            </select>
          </label>
          <div>
            <Wind />
            <span>
              <small>TRUSTED 2 m WIND</small>
              {scenario === "demo"
                ? "1.7 m/s · verified demo observation"
                : "Exact-height observation required"}
            </span>
          </div>
          <button
            className="primary"
            onClick={() => void context.run(scenario, liveInputs)}
            disabled={state.kind === "loading"}
          >
            {state.kind === "loading" ? (
              <LoaderCircle className="spin" />
            ) : (
              <Play />
            )}{" "}
            Run HeatOps
          </button>
        </div>
      </PageHead>
      {scenario === "demo" && (
        <div className="demo-strip">
          <Info />
          Golden Demo Evidence uses checked-in verified evidence through the
          Node API. No live provider calls.
        </div>
      )}
      {scenario === "live" && (
        <section
          className="live-config card"
          aria-label="Live Provider configuration"
        >
          <div>
            <b>Live Provider requirements</b>
            <span>
              Server-side FortyGuard credentials and Open-Meteo access must be
              configured. The trusted wind observation must be measured at
              exactly 2 m and temporally aligned to the planning slot.
            </span>
          </div>
          <label>
            Trusted 2 m wind (m/s)
            <input
              aria-label="Trusted 2 m wind speed"
              inputMode="decimal"
              value={liveInputs.windSpeedMs}
              onChange={(event) =>
                setLiveInputs({
                  ...liveInputs,
                  windSpeedMs: event.target.value,
                })
              }
              placeholder="Required"
            />
          </label>
          <label>
            Exact observation timestamp (UTC)
            <input
              aria-label="Trusted wind observation timestamp"
              value={liveInputs.observedAt}
              onChange={(event) =>
                setLiveInputs({ ...liveInputs, observedAt: event.target.value })
              }
              placeholder="2026-08-28T18:00:00Z"
            />
          </label>
          <label>
            Source reference
            <input
              aria-label="Trusted wind source reference"
              value={liveInputs.sourceRef}
              onChange={(event) =>
                setLiveInputs({ ...liveInputs, sourceRef: event.target.value })
              }
              placeholder="Required observation ID"
            />
          </label>
        </section>
      )}
      {state.kind === "error" && (
        <div className="notice error" role="alert">
          <AlertTriangle />
          <span>
            <b>{state.code ?? "Planning failed"}</b>
            {state.message}
          </span>
        </div>
      )}
      <section className="metric-row">
        <div className="stat">
          <small>Estimated Outdoor WBGT</small>
          <strong>{wbgt === null ? "—" : `${wbgt.toFixed(1)}°C`}</strong>
          <span>
            {env ? name(env.snapshot.zoneId) : "Awaiting planning run"}
          </span>
        </div>
        <div className="stat">
          <small>Air temperature</small>
          <strong>
            {env ? `${env.snapshot.airTemperatureC.toFixed(1)}°C` : "—"}
          </strong>
          <span>FortyGuard 60 m tile</span>
        </div>
        <div className="stat">
          <small>Active zones</small>
          <strong>{result ? result.environment.length : "—"}</strong>
          <span>Evidence available</span>
        </div>
        <div className="stat">
          <small>Assignments</small>
          <strong>{result?.schedule?.assignments.length ?? "—"}</strong>
          <span>{result?.schedule?.solverStatus ?? "Not run"}</span>
        </div>
      </section>
      <section className="mission-grid">
        <article className="card map-card">
          <div className="section-head">
            <h2>Thermal zone view</h2>
            <span className="badge">Estimated Outdoor WBGT</span>
          </div>
          <ThermalZoneMap
            result={result}
            loading={state.kind === "loading"}
            selectedZoneId={activeZoneId}
            onSelectZone={selectZone}
          />
        </article>
        <aside className="mission-side">
          <article className="card safety-card">
            <div className="section-head">
              <h2>Safety evaluation</h2>
              <small>
                {activeZoneId ? name(activeZoneId) : "Deterministic"}
              </small>
            </div>
            {safety ? (
              <>
                <span
                  className={
                    safety.result.decision === "CONTINUOUS_WORK_ALLOWED"
                      ? "decision good"
                      : "decision warn"
                  }
                >
                  {displayDecision(safety.result.decision)}
                </span>
                <p>
                  {safety.result.reason?.message ??
                    "Continuous-work evaluation completed with rule evidence."}
                </p>
                <dl>
                  <div>
                    <dt>Limit basis</dt>
                    <dd>{safety.result.limitType ?? "Review"}</dd>
                  </div>
                  <div>
                    <dt>Margin</dt>
                    <dd>
                      {safety.result.marginC === null
                        ? "—"
                        : `${safety.result.marginC.toFixed(3)}°C`}
                    </dd>
                  </div>
                  <div>
                    <dt>Evidence</dt>
                    <dd>
                      {safety.result.ruleEvidence[0]?.sourceOrganization ??
                        "Unavailable"}
                    </dd>
                  </div>
                </dl>
                <NavLink className="outline" to="/evidence">
                  View full evidence <ChevronRight />
                </NavLink>
              </>
            ) : (
              <Empty />
            )}
          </article>
          <Progress state={state} />
        </aside>
      </section>
      <Provenance result={result} />
    </Shell>
  );
}

function Empty({
  text = "Run the Golden Demo Evidence scenario from Mission Control.",
}: {
  text?: string;
}) {
  return (
    <div className="empty">
      <Sparkles />
      <b>No planning result yet</b>
      <span>{text}</span>
      <NavLink to="/mission">Go to Mission Control</NavLink>
    </div>
  );
}

function Story({ result }: { result: SupervisorPlanningResult | undefined }) {
  const count = result?.schedule?.assignments.length ?? 0;
  return (
    <section className="story-grid">
      <article>
        <span>01 BEFORE</span>
        <h3>Required work, unassigned</h3>
        <p>
          Task, crew, zone, availability, and safety evidence enter the planning
          pipeline.
        </p>
        <strong>Inputs preserved</strong>
      </article>
      <ArrowRight />
      <article className="story-engine">
        <span>02 HEATOPS</span>
        <h3>Hard safety constraints</h3>
        <p>
          Only deterministic engine decisions become optimizer feasibility
          constraints.
        </p>
        <strong>Safety is never a soft penalty</strong>
      </article>
      <ArrowRight />
      <article className="story-after">
        <span>03 AFTER</span>
        <h3>{result?.schedule?.solverStatus ?? "Awaiting run"}</h3>
        <p>
          {count} assignment{count === 1 ? "" : "s"} produced from the persisted
          result.
        </p>
        <strong>Supervisor-readable output</strong>
      </article>
    </section>
  );
}

function Plan({ context }: { context: Context }) {
  const r = context.result;
  const assignments = r?.schedule?.assignments ?? [];
  const reviews =
    r?.safety.filter((x) => x.result.decision === "MANUAL_REVIEW_REQUIRED") ??
    [];
  return (
    <Shell>
      <PageHead
        title="Optimized Plan"
        subtitle="See how HeatOps turns validated evidence into an auditable plan."
      >
        <NavLink className="outline" to="/evidence">
          <ShieldCheck /> View evidence
        </NavLink>
      </PageHead>
      <Story result={r} />
      <section className="card ai-explanation" aria-label="AI explanation">
        <div className="ai-title">
          <Sparkles />
          <div>
            <span>AI EXPLANATION</span>
            <h2>Why did HeatOps do this?</h2>
          </div>
          <strong>Deterministic decisions remain authoritative</strong>
        </div>
        {context.explanation ? (
          <>
            <p>{context.explanation.summary}</p>
            {context.explanation.assignmentExplanations.map((item) => (
              <article key={item.taskId + item.crewId}>
                <b>
                  {name(item.taskId)} → {name(item.crewId)}
                </b>
                <span>{item.explanation}</span>
                <small>
                  Evidence: {item.deterministicEvidenceRefs.join(", ")}
                </small>
              </article>
            ))}
            {context.explanation.unscheduledExplanations.map((item) => (
              <article key={item.taskId}>
                <b>{name(item.taskId)} · Unscheduled</b>
                <span>{item.explanation}</span>
                <small>
                  Evidence:{" "}
                  {item.deterministicEvidenceRefs.join(", ") || "run status"}
                </small>
              </article>
            ))}
            <div className="ai-boundary">
              <ShieldCheck /> {context.explanation.disclaimer}
            </div>
          </>
        ) : (
          <p className="ai-unavailable">
            {context.explanationError ??
              "Run a planning scenario to request an explanation of its persisted result."}
          </p>
        )}
      </section>
      <section className="plan-layout">
        <article className="card timeline-card">
          <div className="section-head">
            <div>
              <h2>Optimized schedule & assignments</h2>
              <p>Times are taken from optimizer slot output.</p>
            </div>
            <span className="badge">
              {r?.schedule?.solverStatus ?? "Not run"}
            </span>
          </div>
          {assignments.length ? (
            <div className="timeline">
              {assignments.map((a) => (
                <div className="timeline-row" key={a.taskId + a.crewId}>
                  <div>
                    <CircleDot />
                    <span>
                      <b>{name(a.zoneId)}</b>
                      <small>{a.slotIds.join(", ")}</small>
                    </span>
                  </div>
                  <article>
                    <span className="time-label">{fmt(a.slotEndsAt[0])}</span>
                    <b>{name(a.taskId)}</b>
                    <small>
                      <Users /> {name(a.crewId)}
                    </small>
                  </article>
                </div>
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </article>
        <aside className="card summary">
          <h2>Plan summary</h2>
          <dl>
            <div>
              <dt>Assignments</dt>
              <dd>{assignments.length}</dd>
            </div>
            <div>
              <dt>Unscheduled</dt>
              <dd>{r?.schedule?.unscheduledTaskIds.length ?? "—"}</dd>
            </div>
            <div>
              <dt>Manual reviews</dt>
              <dd>{reviews.length}</dd>
            </div>
            <div>
              <dt>Solver</dt>
              <dd>{r?.schedule?.solverStatus ?? "Not run"}</dd>
            </div>
          </dl>
          <NavLink className="outline" to="/evidence">
            Inspect evidence <ChevronRight />
          </NavLink>
        </aside>
      </section>
      <section className="exceptions">
        <div className="card">
          <AlertTriangle />
          <span>
            <b>Unscheduled</b>
            <small>
              {r?.schedule?.unscheduledTaskIds.map(name).join(", ") ||
                "None in this run"}
            </small>
          </span>
        </div>
        <div className="card">
          <Info />
          <span>
            <b>Manual Review Required</b>
            <small>
              {reviews.map((x) => name(x.context.taskId)).join(", ") ||
                "None in this run"}
            </small>
          </span>
        </div>
        <div className="card">
          <CheckCircle2 />
          <span>
            <b>Infeasible</b>
            <small>
              {r?.status === "INFEASIBLE"
                ? r.schedule?.reasonCode
                : "No infeasible result"}
            </small>
          </span>
        </div>
      </section>
    </Shell>
  );
}

function Provenance({
  result,
}: {
  result: SupervisorPlanningResult | undefined;
}) {
  const e = result?.environment[0]?.providerEvidence;
  return (
    <section className="card provenance">
      <div>
        <ShieldCheck />
        <span>
          <b>Evidence chain</b>
          <small>{result ? "Persisted result" : "Awaiting run"}</small>
        </span>
      </div>
      <div>
        <CloudSun />
        <span>
          <small>FORTYGUARD TILE</small>
          {e
            ? `${e.fortyGuard.averageTemperatureC.toFixed(2)}°C · ${e.fortyGuard.tileId}`
            : "Awaiting evidence"}
        </span>
      </div>
      <div>
        <Database />
        <span>
          <small>OPEN-METEO</small>
          {e?.meteorology.returnedTimestamp ?? "Awaiting evidence"}
        </span>
      </div>
      <div>
        <Wind />
        <span>
          <small>TRUSTED 2 m WIND</small>
          {e
            ? `${e.wind.windSpeedMs} m/s · ${e.wind.sourceRef}`
            : "Awaiting evidence"}
        </span>
      </div>
      <div>
        <Workflow />
        <span>
          <small>ENGINE CHAIN</small>Thermal → Safety → CP-SAT
        </span>
      </div>
    </section>
  );
}

function Evidence({ context }: { context: Context }) {
  const r = context.result;
  const env = r?.environment[0];
  const thermal = env?.thermal;
  const safety = r?.safety[0]?.result;
  const valid = thermal?.status === "VALID" ? thermal : undefined;
  function download() {
    if (!r) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `heatops-evidence-${r.planningRunId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Shell>
      <PageHead
        title="Evidence"
        subtitle="Deterministic data and decision evidence for this planning run."
      >
        <button className="outline" onClick={download} disabled={!r}>
          <Download /> Download evidence
        </button>
      </PageHead>
      {!r ? (
        <Empty />
      ) : (
        <>
          <section className="evidence-hero">
            <div>
              <small>Estimated Outdoor WBGT</small>
              <strong>
                {valid ? `${valid.estimatedWbgtC.toFixed(3)}°C` : "Unavailable"}
              </strong>
            </div>
            <div>
              <small>Safety decision</small>
              <strong>
                {safety ? displayDecision(safety.decision) : "Unavailable"}
              </strong>
              <span>{safety?.reason?.message ?? "Engine result"}</span>
            </div>
            <div>
              <small>Limit basis</small>
              <strong>{safety?.limitType ?? "Review"}</strong>
              <span>Continuous-work evaluation</span>
            </div>
            <div>
              <small>Decision engine</small>
              <strong>Deterministic</strong>
              <span>No AI safety decisions</span>
            </div>
          </section>
          <section className="evidence-grid">
            <article className="card components">
              <div className="section-head">
                <h2>Thermal inputs & components</h2>
                <span>{fmt(env?.snapshot.timestamp)}</span>
              </div>
              <div className="component-grid">
                <Metric
                  label="Air temperature"
                  value={env ? `${env.snapshot.airTemperatureC}°C` : "—"}
                  note="FortyGuard tile"
                />
                <Metric
                  label="Relative humidity"
                  value={env ? `${env.snapshot.relativeHumidityPercent}%` : "—"}
                  note="Open-Meteo"
                />
                <Metric
                  label="Trusted wind (2 m)"
                  value={env ? `${env.snapshot.windSpeedMs} m/s` : "—"}
                  note={env?.providerEvidence?.wind.sourceRef ?? "—"}
                />
                <Metric
                  label="Globe temperature"
                  value={
                    valid ? `${valid.components.globeTemperatureC}°C` : "—"
                  }
                  note="Thermal output"
                />
                <Metric
                  label="Natural wet bulb"
                  value={
                    valid
                      ? `${valid.components.naturalWetBulbTemperatureC}°C`
                      : "—"
                  }
                  note="Thermal output"
                />
                <Metric
                  label="Estimated Outdoor WBGT"
                  value={valid ? `${valid.estimatedWbgtC}°C` : "—"}
                  note="Liljegren engine"
                />
              </div>
            </article>
            <article className="card safety-table">
              <h2>Safety evaluation evidence</h2>
              <table>
                <tbody>
                  <Row
                    a="Decision"
                    b={
                      safety ? displayDecision(safety.decision) : "Unavailable"
                    }
                  />
                  <Row
                    a="Effective work WBGT"
                    b={
                      safety?.effectiveWorkWbgtC === null || !safety
                        ? "—"
                        : `${safety.effectiveWorkWbgtC}°C`
                    }
                  />
                  <Row a="Limit type" b={safety?.limitType ?? "—"} />
                  <Row
                    a="Continuous-work limit"
                    b={
                      safety?.applicableContinuousWorkLimitWbgtC === null ||
                      !safety
                        ? "—"
                        : `${safety.applicableContinuousWorkLimitWbgtC}°C`
                    }
                  />
                  <Row
                    a="Margin"
                    b={
                      safety?.marginC === null || !safety
                        ? "—"
                        : `${safety.marginC}°C`
                    }
                  />
                  <Row
                    a="Rule source"
                    b={safety?.ruleEvidence[0]?.sourceTitle ?? "—"}
                  />
                </tbody>
              </table>
            </article>
          </section>
          <Provenance result={r} />
          <section className="card chain">
            <h2>Deterministic engine chain</h2>
            {[
              "Provider evidence",
              "Normalized inputs",
              "Thermal engine",
              "Safety engine",
              "CP-SAT optimizer",
              "Supervisor result",
            ].map((x, i) => (
              <div key={x}>
                <span>{i + 1}</span>
                <b>{x}</b>
                {i < 5 && <ArrowRight />}
              </div>
            ))}
          </section>
        </>
      )}
    </Shell>
  );
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{note}</span>
    </div>
  );
}
function Row({ a, b }: { a: string; b: string }) {
  return (
    <tr>
      <th>{a}</th>
      <td>{b}</td>
    </tr>
  );
}

function Alerts({ context }: { context: Context }) {
  const [filter, setFilter] = useState("ALL");
  const r = context.result;
  const alerts = useMemo(() => {
    if (!r) return [];
    const items: { type: string; title: string; detail: string; to: string }[] =
      [];
    for (const x of r.safety)
      if (x.result.decision === "MANUAL_REVIEW_REQUIRED")
        items.push({
          type: "REVIEW",
          title: "Manual Review Required",
          detail: x.result.reason?.message ?? name(x.context.taskId),
          to: "/evidence",
        });
    if (r.status === "INSUFFICIENT_DATA")
      items.push({
        type: "DATA",
        title: "Insufficient data",
        detail: r.error?.message ?? "Safety-critical data missing",
        to: "/evidence",
      });
    if (r.status === "INFEASIBLE")
      items.push({
        type: "PLAN",
        title: "Plan infeasible",
        detail:
          r.schedule?.reasonCode ?? "Hard constraints could not be satisfied",
        to: "/plan",
      });
    if (r.error)
      items.push({
        type: "DATA",
        title: r.error.code,
        detail: r.error.message,
        to: "/evidence",
      });
    if (items.length === 0)
      items.push({
        type: "INFO",
        title: "No action-required alerts",
        detail:
          "The current persisted planning result has no manual-review, insufficient-data, or infeasible state.",
        to: "/plan",
      });
    return items;
  }, [r]);
  const visible =
    filter === "ALL" ? alerts : alerts.filter((x) => x.type === filter);
  return (
    <Shell>
      <PageHead
        title="Alerts"
        subtitle="Derived only from actual planning-run states and evidence."
      >
        <label className="filter">
          Status
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">All</option>
            <option value="REVIEW">Manual review</option>
            <option value="DATA">Data issues</option>
            <option value="PLAN">Planning</option>
          </select>
        </label>
      </PageHead>
      <section className="alert-stats">
        <Metric
          label="Action required"
          value={String(alerts.filter((x) => x.type !== "INFO").length)}
          note="Current run"
        />
        <Metric
          label="Manual review"
          value={String(alerts.filter((x) => x.type === "REVIEW").length)}
          note="Safety decisions"
        />
        <Metric
          label="Data issues"
          value={String(alerts.filter((x) => x.type === "DATA").length)}
          note="Fail-closed states"
        />
        <Metric
          label="Planning"
          value={String(alerts.filter((x) => x.type === "PLAN").length)}
          note="Optimizer states"
        />
      </section>
      <article className="card alert-list">
        <div className="table-head">
          <span>Status</span>
          <span>Alert</span>
          <span>Planning run</span>
          <span>Action</span>
        </div>
        {visible.map((x, i) => (
          <div className="alert-row" key={x.title + i}>
            <span className="badge">{x.type}</span>
            <span>
              <b>{x.title}</b>
              <small>{x.detail}</small>
            </span>
            <code>{r?.planningRunId.slice(0, 8) ?? "No run"}</code>
            <NavLink className="outline" to={x.to}>
              View <ChevronRight />
            </NavLink>
          </div>
        ))}
      </article>
    </Shell>
  );
}

function Reports({ context }: { context: Context }) {
  const r = context.result;
  return (
    <Shell>
      <PageHead
        title="Reports"
        subtitle="Open and export planning results produced in this session."
      />
      {!r ? (
        <Empty text="Run a scenario to create the first report." />
      ) : (
        <>
          <article className="card reports">
            <div className="table-head">
              <span>Run ID</span>
              <span>Site</span>
              <span>Status</span>
              <span>Summary</span>
              <span>Actions</span>
            </div>
            <div className="report-row">
              <code>{r.planningRunId.slice(0, 12)}</code>
              <span>{r.site?.name ?? "Unknown"}</span>
              <span className="badge">
                {context.demo ? "Demo Evidence" : r.status}
              </span>
              <span>
                {r.schedule?.assignments.length ?? 0} assignment(s) ·{" "}
                {r.environment.length} zone(s)
              </span>
              <NavLink className="outline" to="/plan">
                Open run <ChevronRight />
              </NavLink>
            </div>
          </article>
          <section className="report-cards">
            <article className="card">
              <h2>Report contents</h2>
              <p>
                Planning result, assignments, thermal evidence, safety evidence,
                provider provenance, alerts, and exceptions.
              </p>
            </article>
            <article className="card">
              <h2>Data source</h2>
              <p>
                {context.demo
                  ? "Checked-in Golden Demo Evidence served by the Node API."
                  : "Persisted provider-backed production result."}
              </p>
            </article>
          </section>
        </>
      )}
    </Shell>
  );
}

function SettingsPage({ context }: { context: Context }) {
  const [units, setUnits] = useState("C");
  const [window, setWindow] = useState("ONE_HOUR");
  return (
    <Shell>
      <PageHead
        title="Settings"
        subtitle="Demo, site, and display preferences. Deterministic science is read-only."
      />
      <section className="settings-grid">
        <article className="card settings-card">
          <h2>Site & demo preferences</h2>
          <label>
            Active site
            <input readOnly value="Phoenix Riverside Build" />
          </label>
          <label>
            Default scenario
            <select>
              <option>Golden Demo Evidence</option>
              <option>Live Providers</option>
            </select>
          </label>
          <label>
            Planning window
            <select value={window} onChange={(e) => setWindow(e.target.value)}>
              <option value="ONE_HOUR">One hour</option>
            </select>
          </label>
          <label>
            Temperature unit
            <div className="segmented">
              <button
                className={units === "C" ? "selected" : ""}
                onClick={() => setUnits("C")}
              >
                °C
              </button>
              <button
                className={units === "F" ? "selected" : ""}
                onClick={() => setUnits("F")}
              >
                °F
              </button>
            </div>
          </label>
        </article>
        <article className="card settings-card">
          <h2>Trusted input & providers</h2>
          <Provider
            name="FortyGuard HeatMap"
            detail="Hyperlocal air temperature · 60 m tiles"
            live={Boolean(context.result?.environment[0]?.providerEvidence)}
          />
          <Provider
            name="Open-Meteo"
            detail="Humidity, pressure, and actual radiation inputs"
            live={Boolean(context.result?.environment[0]?.providerEvidence)}
          />
          <Provider
            name="Trusted 2 m wind"
            detail="Exact-height observation; never converted from 10 m"
            live={Boolean(context.result?.environment[0]?.providerEvidence)}
          />
          <Provider
            name="Decision engine"
            detail="Thermal, safety, and CP-SAT optimization"
            live={Boolean(context.result)}
          />
        </article>
        <article className="card settings-card locked">
          <ShieldCheck />
          <h2>Scientific controls are locked</h2>
          <p>
            Supervisors cannot override WBGT calculations, RAL/REL limits,
            safety decisions, or optimizer hard constraints from this interface.
          </p>
          <dl>
            <div>
              <dt>Thermal authority</dt>
              <dd>Python Liljegren engine</dd>
            </div>
            <div>
              <dt>Safety ruleset</dt>
              <dd>NIOSH_2016_MVP_V1</dd>
            </div>
            <div>
              <dt>Optimizer</dt>
              <dd>CP_SAT_SLOTS_V1</dd>
            </div>
          </dl>
        </article>
      </section>
    </Shell>
  );
}
function Provider({
  name: providerName,
  detail,
  live,
}: {
  name: string;
  detail: string;
  live: boolean;
}) {
  return (
    <div className="provider">
      <CheckCircle2 />
      <span>
        <b>{providerName}</b>
        <small>{detail}</small>
      </span>
      <em>{live ? "Evidence available" : "Configured"}</em>
    </div>
  );
}

export function App() {
  const navigate = useNavigate();
  const [state, setState] = useState<RunState>({ kind: "idle" });
  const [explanation, setExplanation] = useState<PlanningExplanation>();
  const [explanationError, setExplanationError] = useState<string>();
  const result = state.kind === "success" ? state.result : undefined;
  const demo = state.kind === "success" && state.demo;
  async function run(
    scenario: "demo" | "live",
    liveInputs?: LiveProviderInputs,
  ) {
    setState({ kind: "loading" });
    setExplanation(undefined);
    setExplanationError(undefined);
    try {
      if (scenario === "demo") {
        const parsed = SupervisorPlanningResultSchema.parse(
          await api("/api/v1/planning-runs/demo", {
            method: "POST",
            body: JSON.stringify({ scenarioId: "phoenix-golden-v1" }),
          }),
        );
        setState({ kind: "success", result: parsed, demo: true });
        void navigate("/plan");
        try {
          setExplanation(
            PlanningExplanationSchema.parse(
              await api("/api/v1/planning-runs/demo/explanation", {
                method: "POST",
                body: JSON.stringify({ planningRunId: parsed.planningRunId }),
              }),
            ),
          );
        } catch (error) {
          setExplanationError((error as Error).message);
        }
        return;
      }
      const created = PlanningRunSchema.parse(
        await api("/api/v1/planning-runs", {
          method: "POST",
          body: JSON.stringify(
            liveRequest(
              liveInputs ?? { windSpeedMs: "", observedAt: "", sourceRef: "" },
            ),
          ),
        }),
      );
      const parsed = SupervisorPlanningResultSchema.parse(
        await api(`/api/v1/planning-runs/${created.id}/result`),
      );
      setState({ kind: "success", result: parsed, demo: false });
      void navigate("/plan");
      try {
        setExplanation(
          PlanningExplanationSchema.parse(
            await api(`/api/v1/planning-runs/${created.id}/explanation`, {
              method: "POST",
              body: "{}",
            }),
          ),
        );
      } catch (error) {
        setExplanationError((error as Error).message);
      }
    } catch (error) {
      const failure = error as Error & { code?: string };
      setState({
        kind: "error",
        message: failure.message,
        ...(failure.code ? { code: failure.code } : {}),
      });
      void navigate("/mission");
    }
  }
  const context: Context = {
    state,
    run,
    result,
    demo,
    explanation,
    explanationError,
  };
  return (
    <Routes>
      <Route path="/mission" element={<Mission context={context} />} />
      <Route path="/plan" element={<Plan context={context} />} />
      <Route path="/evidence" element={<Evidence context={context} />} />
      <Route path="/alerts" element={<Alerts context={context} />} />
      <Route path="/reports" element={<Reports context={context} />} />
      <Route path="/settings" element={<SettingsPage context={context} />} />
      <Route path="*" element={<Navigate to="/mission" replace />} />
    </Routes>
  );
}
