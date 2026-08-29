import {
  SupervisorPlanningResultSchema,
  type SupervisorPlanningResult,
} from "@heatops/contracts";

// Checked-in deterministic evidence from the verified golden-path fixture.
// Values are not recomputed in Node and this path makes no provider calls.
export const supervisorDemoResult: SupervisorPlanningResult =
  SupervisorPlanningResultSchema.parse({
    planningRunId: "5ab9302d-c2be-48e1-876f-752c591e6331",
    status: "READY_FOR_REVIEW",
    site: {
      id: "site-demo",
      name: "Phoenix Riverside Build · Demo Scenario",
    },
    environment: [
      {
        snapshot: {
          snapshotId: "snapshot-zone-east-hour-1",
          zoneId: "zone-east",
          slotId: "hour-1",
          timestamp: "2026-08-28T18:00:00Z",
          latitude: 33,
          longitude: -112,
          airTemperatureC: 34.25,
          relativeHumidityPercent: 36,
          solarRadiationWm2: 642,
          windSpeedMs: 1.7,
          windMeasurementHeightM: 2,
          surfacePressureHpa: 991.2,
          solarAveragingPeriodMinutes: 60,
        },
        providerEvidence: {
          snapshotId: "snapshot-zone-east-hour-1",
          zoneId: "zone-east",
          slotId: "hour-1",
          fortyGuard: {
            provider: "FORTYGUARD_TEMPERATURE_API_V1",
            activityId: "verified-activity",
            tileId: "tile-60m-1",
            granularityM: 60,
            averageTemperatureC: 34.25,
            minTemperatureC: 33.8,
            maxTemperatureC: 34.9,
            submittedStartDate: "2026-08-28",
            submittedStartTime: "11:00",
            submittedTimeZone: "America/Phoenix",
            alignedIntervalStart: "2026-08-28T17:00:00Z",
            alignedIntervalEnd: "2026-08-28T18:00:00Z",
            responseTimestampSemantics: "NOT_PROVIDED",
          },
          meteorology: {
            provider: "OPEN_METEO_FORECAST_API",
            requestedTimestamp: "2026-08-28T18:00:00Z",
            returnedTimestamp: "2026-08-28T11:00",
            relativeHumidityPercent: 36,
            surfacePressureHpa: 991.2,
            shortwaveRadiationWm2: 642,
            radiationSemantics: "PRECEDING_HOUR_MEAN",
          },
          wind: {
            sourceRef: "trusted-onsite-anemometer-demo",
            observedAt: "2026-08-28T18:00:00Z",
            windSpeedMs: 1.7,
            measurementHeightM: 2,
          },
        },
        thermal: {
          snapshotId: "snapshot-zone-east-hour-1",
          status: "VALID",
          estimatedWbgtC: 27.125,
          components: {
            globeTemperatureC: 38,
            naturalWetBulbTemperatureC: 23,
            psychrometricWetBulbTemperatureC: 21.5,
          },
          modelDiagnostics: {
            effectiveWindSpeedMs: 1.7,
            adjustedSolarRadiationWm2: 642,
            cosineSolarZenith: 0.71,
          },
          warnings: [],
        },
      },
    ],
    safety: [
      {
        context: {
          evaluationRef: "safety-task-wall-crew-masons-hour-1",
          thermalEstimateId: "snapshot-zone-east-hour-1",
          taskId: "task-wall",
          crewId: "crew-masons",
          zoneId: "zone-east",
          slotId: "hour-1",
        },
        result: {
          evaluationRef: "safety-task-wall-crew-masons-hour-1",
          thermalEstimateId: "snapshot-zone-east-hour-1",
          decision: "CONTINUOUS_WORK_ALLOWED",
          estimatedWbgtC: 27.125,
          clothingAdjustmentC: 0,
          effectiveWorkWbgtC: 27.125,
          workloadCategory: "LIGHT",
          workMetabolicRateWatts: 180,
          restMetabolicRateWatts: 115,
          limitType: "REL",
          applicableContinuousWorkLimitWbgtC: 30.763,
          marginC: 3.638,
          maxWorkMinutesPerHour: 60,
          requiredRestMinutesPerHour: 0,
          acclimatizationConstraint: { maxHeatExposureFraction: 1 },
          ruleEvidence: [
            {
              ruleId: "CONTINUOUS_REL_LIGHT",
              sourceTitle: "NIOSH 2016-106",
              sourceOrganization: "NIOSH",
              sourceYear: 2016,
              publicationId: "2016-106",
            },
          ],
          reason: null,
        },
      },
    ],
    schedule: {
      solverStatus: "OPTIMAL",
      assignments: [
        {
          taskId: "task-wall",
          crewId: "crew-masons",
          zoneId: "zone-east",
          slotIds: ["hour-1"],
          slotEndsAt: ["2026-08-28T18:00:00Z"],
          safetyEvaluationRefs: ["safety-task-wall-crew-masons-hour-1"],
        },
      ],
      unscheduledTaskIds: [],
      reasonCode: null,
    },
    error: null,
  });
