"""Safety batch API contract and isolation tests."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_batch_isolates_manual_review() -> None:
    base = {
        "thermalEstimateId": "t",
        "estimatedWbgtC": 20,
        "workloadCategory": "LIGHT",
        "ppeCategory": "NORMAL_WORK_CLOTHING",
        "acclimatization": {"state": "ACCLIMATIZED"},
        "recoveryEnvironment": {"mode": "SAME_AS_WORK"},
    }
    response = client.post(
        "/internal/v1/safety/batch",
        json={
            "contractVersion": "1.0",
            "rulesetVersion": "NIOSH_2016_MVP_V1",
            "evaluations": [
                {**base, "evaluationRef": "a"},
                {**base, "evaluationRef": "b", "ppeCategory": "UNKNOWN"},
                {**base, "evaluationRef": "c"},
            ],
        },
    )
    assert response.status_code == 200
    assert [x["decision"] for x in response.json()["results"]] == [
        "CONTINUOUS_WORK_ALLOWED",
        "MANUAL_REVIEW_REQUIRED",
        "CONTINUOUS_WORK_ALLOWED",
    ]


def test_malformed_request_is_422() -> None:
    response = client.post(
        "/internal/v1/safety/batch",
        json={"contractVersion": "1.0", "rulesetVersion": "NIOSH_2016_MVP_V1", "evaluations": []},
    )
    assert response.status_code == 422
