import { useQuery } from "@tanstack/react-query";
import { Activity, HardHat } from "lucide-react";

type Health = {
  data: {
    status: string;
    dependencies: { database: string; decisionEngine: string };
  };
};

async function fetchHealth(): Promise<Health> {
  const response = await fetch("/api/v1/health");
  if (!response.ok) throw new Error("API health request failed");
  return response.json() as Promise<Health>;
}

export function App() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false,
    refetchInterval: 30_000,
  });
  const status = health.isPending
    ? "checking..."
    : health.isError
      ? "unavailable"
      : health.data.data.status;
  return (
    <main className="shell">
      <section className="hero">
        <HardHat aria-hidden="true" size={36} />
        <p className="eyebrow">Decision intelligence</p>
        <h1>Workforce HeatOps</h1>
        <p className="lede">
          Heat-aware workforce planning for outdoor construction.
        </p>
      </section>
      <section className="status" aria-live="polite">
        <Activity aria-hidden="true" />
        <div>
          <h2>System status</h2>
          <p>
            API: <strong>{status}</strong>
          </p>
        </div>
      </section>
    </main>
  );
}
