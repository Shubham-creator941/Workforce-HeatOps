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


def test_version_is_honest_about_unimplemented_capabilities() -> None:
    response = client.get("/version")
    assert response.status_code == 200
    assert response.json() == {
        "serviceVersion": "0.1.0",
        "thermalModel": "not-implemented",
        "ruleset": "not-implemented",
        "optimizer": "not-implemented",
    }
