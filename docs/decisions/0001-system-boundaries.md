# ADR 0001: Control-plane and decision-plane boundaries

## Context

The product combines mutable operational workflows with safety-critical, reproducible calculations. Mixing those concerns would weaken provenance, testing, and security.

## Decision

Node is the control plane and sole owner of MySQL, external providers, public APIs, orchestration, and future agent tools. Python is the deterministic decision plane and owns scientific, safety, and optimization logic. The frontend communicates only with Node.

## Consequences

Node-to-Python contracts must be explicit and validated. Python remains independently reproducible and cannot silently fetch or persist inputs. Node cannot duplicate calculations. There is a service boundary to operate, but failures can be represented honestly without corrupting safety decisions.
