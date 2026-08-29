import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CloudSun,
  Database,
  HardHat,
  LoaderCircle,
  MapPinned,
  Play,
  ShieldCheck,
  Sparkles,
  ThermometerSun,
  Users,
  Wind,
} from "lucide-react";
import {
  PlanningRunSchema,
  SupervisorPlanningResultSchema,
  type PlanningRequest,
  type SupervisorPlanningResult,
} from "@heatops/contracts";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; result: SupervisorPlanningResult }
  | { kind: "error"; message: string; code?: string };

const labels: Record<string, string> = {
  "zone-east": "East Structure",
  "task-wall": "Exterior wall set",
  "crew-masons": "Masonry Crew",
};
const label = (id: string) => labels[id] ?? id.replaceAll("-", " ");
const time = (value?: string) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(value))
    : "—";

function demoRequest(): PlanningRequest {
  const nextHour = new Date();
  nextHour.setUTCMinutes(0, 0, 0);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1);
  const endAt = nextHour.toISOString();
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
          windSpeedMs: 1.7,
          measurementHeightM: 2,
          observedAt: endAt,
          sourceRef: "trusted-onsite-anemometer-demo",
        },
      ],
    },
  };
}

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = (await response.json()) as {
    data?: unknown;
    error?: { code?: string; message?: string };
  };
  if (!response.ok)
    throw Object.assign(
      new Error(body.error?.message ?? `Request failed (${response.status})`),
      { code: body.error?.code },
    );
  return body.data;
}

function Empty({
  children = "Run HeatOps to evaluate provider-backed inputs.",
}: {
  children?: string;
}) {
  return (
    <div className="empty">
      <Sparkles />
      <strong>Ready for evidence</strong>
      <span>{children}</span>
    </div>
  );
}

function ThermalMap({
  result,
}: {
  result: SupervisorPlanningResult | undefined;
}) {
  const env = result?.environment[0];
  const wbgt =
    env?.thermal?.status === "VALID" ? env.thermal.estimatedWbgtC : null;
  return (
    <div className="map" aria-label="Thermal zone map">
      <div className="map-grid" />
      <svg viewBox="0 0 760 500" role="img" aria-label="Planning zones">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>
        <path className="road" d="M-30 420 C180 350 225 120 430 -20" />
        <path className="road thin" d="M80 -20 C260 160 520 190 790 110" />
        <polygon
          className="zone glow"
          points="175,80 480,55 620,205 430,300 145,240"
        />
        <polygon
          className="zone hot"
          points="175,80 480,55 620,205 430,300 145,240"
        />
        <polygon
          className="zone amber"
          points="145,240 430,300 365,455 80,410"
        />
        <polygon
          className="zone gold"
          points="430,300 620,205 700,405 365,455"
        />
      </svg>
      <div className="map-value">
        <span>ZONE EAST · 60 m TILE</span>
        <strong>
          {wbgt === null ? "Awaiting run" : `${wbgt.toFixed(1)}°C`}
        </strong>
        <small>Estimated Outdoor WBGT</small>
      </div>
      <div className="air-value">
        <span>AIR TEMPERATURE</span>
        <strong>
          {env ? `${env.snapshot.airTemperatureC.toFixed(1)}°C` : "—"}
        </strong>
      </div>
      <div className="map-foot">
        <span>
          <MapPinned /> Phoenix Riverside Build
        </span>
        <span>Provider evidence · deterministic science</span>
      </div>
    </div>
  );
}

export function App() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const result = state.kind === "success" ? state.result : undefined;
  const env = result?.environment[0];
  const safety = result?.safety[0];
  const assignments = result?.schedule?.assignments ?? [];
  const wbgt =
    env?.thermal?.status === "VALID" ? env.thermal.estimatedWbgtC : null;
  const evidence = env?.providerEvidence;
  const reviewCount =
    result?.safety.filter((x) => x.result.decision === "MANUAL_REVIEW_REQUIRED")
      .length ?? 0;
  const blocked =
    result?.status === "INFEASIBLE" || result?.status === "INSUFFICIENT_DATA";

  async function run() {
    setState({ kind: "loading" });
    try {
      const created = PlanningRunSchema.parse(
        await api("/api/v1/planning-runs", {
          method: "POST",
          body: JSON.stringify(demoRequest()),
        }),
      );
      const persisted = SupervisorPlanningResultSchema.parse(
        await api(`/api/v1/planning-runs/${created.id}/result`),
      );
      setState({ kind: "success", result: persisted });
    } catch (error) {
      const failure = error as Error & { code?: string };
      setState({
        kind: "error",
        message: failure.message,
        ...(failure.code === undefined ? {} : { code: failure.code }),
      });
    }
  }

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <span>
            <ThermometerSun />
          </span>
          <b>HeatOps</b>
        </div>
        <nav aria-label="Mission Control">
          <a className="active" href="#mission">
            <MapPinned />
            <i>Mission Control</i>
          </a>
          <a href="#schedule">
            <Clock3 />
            <i>Schedule</i>
          </a>
          <a href="#evidence">
            <ShieldCheck />
            <i>Evidence</i>
          </a>
        </nav>
        <div className="profile">
          <span>PS</span>
          <div>
            <b>Priya</b>
            <small>Supervisor</small>
          </div>
        </div>
      </aside>
      <main id="mission">
        <header>
          <div>
            <p className="kicker">SUPERVISOR MISSION CONTROL</p>
            <h1>Turn heat intelligence into a field-ready plan.</h1>
          </div>
          <div className="actions">
            <div className="site">
              <MapPinned />
              <span>
                <small>ACTIVE SITE</small>Phoenix Riverside
              </span>
            </div>
            <button
              onClick={() => void run()}
              disabled={state.kind === "loading"}
            >
              {state.kind === "loading" ? (
                <LoaderCircle className="spin" />
              ) : (
                <Play />
              )}
              {state.kind === "loading"
                ? "Building plan…"
                : result
                  ? "Run again"
                  : "Run HeatOps"}
            </button>
          </div>
        </header>
        <section
          className="story"
          aria-label="Before HeatOps after optimization"
        >
          <div>
            <span>01 · BEFORE</span>
            <strong>Required work enters unsequenced</strong>
            <small>1 task · 1 eligible crew · 1 planning zone</small>
          </div>
          <ArrowRight />
          <div className="heatops">
            <span>02 · HEATOPS</span>
            <strong>Evidence → safety → constraints</strong>
            <small>Deterministic Node + Python pipeline</small>
          </div>
          <ArrowRight />
          <div className={blocked ? "blocked" : ""}>
            <span>03 · AFTER</span>
            <strong>
              {result
                ? (result.schedule?.solverStatus ?? result.status)
                : "Awaiting optimization"}
            </strong>
            <small>
              {result
                ? `${assignments.length} assignment${assignments.length === 1 ? "" : "s"} ready for review`
                : "No assumptions before the run"}
            </small>
          </div>
        </section>
        {state.kind === "error" && (
          <div className="banner error" role="alert">
            <AlertTriangle />
            <span>
              <b>Planning run failed</b>
              {state.code ? `${state.code}: ` : ""}
              {state.message}
            </span>
          </div>
        )}
        {blocked && (
          <div className="banner warn" role="status">
            <AlertTriangle />
            <span>
              <b>{result.status.replaceAll("_", " ")}</b>
              {result.error?.message ??
                result.schedule?.reasonCode ??
                "No automatic assignment was produced."}
            </span>
          </div>
        )}
        {reviewCount > 0 && (
          <div className="banner warn" role="status">
            <AlertTriangle />
            <span>
              <b>Supervisor review required</b>
              {reviewCount} safety evaluation requires detailed occupational
              review.
            </span>
          </div>
        )}
        <section className="workspace">
          <article className="panel map-panel">
            <div className="panel-head">
              <div>
                <p className="kicker">LIVE PLANNING EVIDENCE</p>
                <h2>Thermal zone view</h2>
              </div>
              <em>{(result?.status ?? "NOT_RUN").replaceAll("_", " ")}</em>
            </div>
            <ThermalMap result={result} />
          </article>
          <aside className="insights">
            <article className="panel metric">
              <ThermometerSun />
              <p>ESTIMATED OUTDOOR WBGT</p>
              <strong>{wbgt === null ? "—" : `${wbgt.toFixed(1)}°C`}</strong>
              <small>Python Liljegren thermal engine</small>
            </article>
            <article className="panel safety">
              <div className="panel-head">
                <div>
                  <p className="kicker">SAFETY EVALUATION</p>
                  <h2>Supervisor state</h2>
                </div>
                {safety &&
                  (safety.result.decision === "CONTINUOUS_WORK_ALLOWED" ? (
                    <CheckCircle2 className="green" />
                  ) : (
                    <AlertTriangle className="yellow" />
                  ))}
              </div>
              {safety ? (
                <div className="safety-body">
                  <b
                    className={
                      safety.result.decision === "CONTINUOUS_WORK_ALLOWED"
                        ? "allowed"
                        : "review"
                    }
                  >
                    {safety.result.decision.replaceAll("_", " ")}
                  </b>
                  <p>
                    {safety.result.reason?.message ??
                      "The continuous-work evaluation returned complete rule evidence."}
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
                          : `${safety.result.marginC.toFixed(2)}°C`}
                      </dd>
                    </div>
                    <div>
                      <dt>Evidence</dt>
                      <dd>
                        {safety.result.ruleEvidence[0]?.sourceOrganization ??
                          "Review"}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <Empty />
              )}
            </article>
          </aside>
        </section>
        <section className="lower" id="schedule">
          <article className="panel schedule">
            <div className="panel-head">
              <div>
                <p className="kicker">FIELD EXECUTION</p>
                <h2>Schedule & assignments</h2>
              </div>
              <em>{result?.schedule?.solverStatus ?? "NOT RUN"}</em>
            </div>
            {assignments.length ? (
              <div className="assignments">
                {assignments.map((a) => (
                  <div className="assignment" key={a.taskId + a.crewId}>
                    <span className="when">
                      <Clock3 />
                      {time(a.slotEndsAt[0])}
                    </span>
                    <span className="task">
                      <i />
                      <span>
                        <b>{label(a.taskId)}</b>
                        <small>{label(a.zoneId)}</small>
                      </span>
                    </span>
                    <span className="crew">
                      <Users />
                      <span>
                        <small>ASSIGNED CREW</small>
                        {label(a.crewId)}
                      </span>
                    </span>
                    <CheckCircle2 className="green" />
                  </div>
                ))}
              </div>
            ) : (
              <Empty />
            )}
          </article>
          <article className="panel explain">
            <div className="panel-head">
              <div>
                <p className="kicker">EXPLAINABILITY</p>
                <h2>Why did HeatOps do this?</h2>
              </div>
              <Sparkles className="purple" />
            </div>
            {result ? (
              <div className="explain-body">
                <p>
                  HeatOps admitted only combinations returned as automatically
                  feasible by the safety engine, then used the deterministic
                  optimizer to assign required work.
                </p>
                <div>
                  <span>
                    <ThermometerSun />
                    Estimated WBGT
                  </span>
                  <span>
                    <ShieldCheck />
                    Safety decision
                  </span>
                  <span>
                    <Users />
                    Crew eligibility
                  </span>
                  <span>
                    <Clock3 />
                    Availability
                  </span>
                </div>
                <small>
                  This summarizes persisted evidence. No AI explanation is
                  generated in this MVP.
                </small>
              </div>
            ) : (
              <Empty />
            )}
          </article>
        </section>
        <section className="trust" id="evidence">
          <div>
            <ShieldCheck className="green" />
            <span>
              <b>Evidence chain</b>
              <small>Timestamped · supervisor-readable</small>
            </span>
          </div>
          <div>
            <CloudSun />
            <span>
              <small>HYPERLOCAL AIR TEMP</small>
              {evidence
                ? `${evidence.fortyGuard.averageTemperatureC.toFixed(1)}°C · ${evidence.fortyGuard.tileId}`
                : "FortyGuard · awaiting run"}
            </span>
          </div>
          <div>
            <Database />
            <span>
              <small>METEOROLOGY</small>
              {evidence
                ? `Open-Meteo · ${evidence.meteorology.returnedTimestamp}`
                : "Open-Meteo · awaiting run"}
            </span>
          </div>
          <div>
            <Wind />
            <span>
              <small>TRUSTED 2 m WIND</small>
              {evidence
                ? `${evidence.wind.windSpeedMs.toFixed(1)} m/s · ${evidence.wind.sourceRef}`
                : "Observation · awaiting run"}
            </span>
          </div>
          <div>
            <HardHat />
            <span>
              <small>DECISION ENGINES</small>Thermal · safety · CP-SAT
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
