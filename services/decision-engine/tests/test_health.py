"""Foundation endpoint tests."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "service": "workforce-heatops-decision-engine",
        "status": "ok",
    }


def test_version_reports_thermal_and_safety_as_implemented() -> None:
    response = client.get("/version")
    assert response.status_code == 200
    assert response.json() == {
        "serviceVersion": "0.4.0",
        "thermalModel": {
            "name": "liljegren",
            "implementationVersion": "1.0.0",
            "reference": "Liljegren et al. 2008",
        },
        "ruleset": {"name": "NIOSH_2016_MVP_V1", "status": "implemented"},
        "optimizer": "CP_SAT_SLOTS_V1",
    }
