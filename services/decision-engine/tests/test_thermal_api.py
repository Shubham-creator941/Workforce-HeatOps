"""Internal thermal batch API tests."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

FIXTURE_DIRECTORY = Path(__file__).parents[3] / "fixtures" / "thermal"
client = TestClient(app)


def hot_input() -> dict[str, object]:
    fixture = json.loads(
        (FIXTURE_DIRECTORY / "reference_daytime_hot.json").read_text(encoding="utf-8")
    )
    value = fixture["input"]
    assert isinstance(value, dict)
    return value


def test_batch_preserves_order_and_isolates_item_failure() -> None:
    valid = hot_input()
    invalid = valid | {"snapshotId": "bad", "relativeHumidityPercent": 101.0}
    response = client.post(
        "/internal/v1/thermal/batch",
        json={
            "contractVersion": "1.0",
            "planningRunId": "run_test",
            "model": "LILJEGREN",
            "items": [valid, invalid],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["contractVersion"] == "1.0"
    assert body["model"] == {
        "name": "liljegren",
        "implementationVersion": "1.0.0",
        "reference": "Liljegren et al. 2008",
        "referenceCodeVersion": "WBGT 1.1",
    }
    assert [(item["snapshotId"], item["status"]) for item in body["results"]] == [
        ("hot_daytime", "VALID"),
        ("bad", "INVALID_INPUT"),
    ]


def test_structurally_malformed_request_uses_http_validation() -> None:
    response = client.post(
        "/internal/v1/thermal/batch",
        json={"contractVersion": "1.0", "planningRunId": "run", "model": "OTHER", "items": []},
    )
    assert response.status_code == 422


def test_shift_sized_batch_returns_one_result_per_item() -> None:
    base = hot_input()
    items = [base | {"snapshotId": f"point_{index}"} for index in range(100)]
    response = client.post(
        "/internal/v1/thermal/batch",
        json={
            "contractVersion": "1.0",
            "planningRunId": "run_batch",
            "model": "LILJEGREN",
            "items": items,
        },
    )
    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 100
    assert [result["snapshotId"] for result in results] == [
        f"point_{index}" for index in range(100)
    ]
