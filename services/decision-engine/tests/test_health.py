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


def test_version_reports_thermal_only_as_implemented() -> None:
    response = client.get("/version")
    assert response.status_code == 200
    assert response.json() == {
        "serviceVersion": "0.2.0",
        "thermalModel": {
            "name": "liljegren",
            "implementationVersion": "1.0.0",
            "reference": "Liljegren et al. 2008",
        },
        "ruleset": "not-implemented",
        "optimizer": "not-implemented",
    }
