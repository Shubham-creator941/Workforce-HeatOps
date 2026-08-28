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


def test_continuous_exceedance_returns_reproducible_manual_review_evidence() -> None:
    response = client.post(
        "/internal/v1/safety/batch",
        json={
            "contractVersion": "1.0",
            "rulesetVersion": "NIOSH_2016_MVP_V1",
            "evaluations": [
                {
                    "evaluationRef": "hot-heavy",
                    "thermalEstimateId": "thermal-hot",
                    "estimatedWbgtC": 30.0,
                    "workloadCategory": "HEAVY",
                    "ppeCategory": "NORMAL_WORK_CLOTHING",
                    "acclimatization": {"state": "ACCLIMATIZED"},
                    "recoveryEnvironment": {"mode": "SAME_AS_WORK"},
                }
            ],
        },
    )
    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["decision"] == "MANUAL_REVIEW_REQUIRED"
    assert result["reason"]["code"] == "DETAILED_WORK_REST_ASSESSMENT_REQUIRED"
    assert result["effectiveWorkWbgtC"] == 30.0
    assert result["applicableContinuousWorkLimitWbgtC"] < 30.0
    assert result["marginC"] < 0
    assert "selectedPattern" not in result
    assert "candidateEvaluations" not in result
