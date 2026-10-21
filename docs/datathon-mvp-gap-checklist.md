# Datathon MVP Gap Checklist

## Purpose

This is a concise execution checklist for aligning the existing Maldives mobility application with the Datathon 2026 theme.

It separates:

- Areas that are already implemented.
- Areas that are partially implemented.
- Areas that are currently missing.
- Recommended quick MVP changes.
- The level of code change and expected impact for each recommendation.

This document is intentionally focused on the smallest credible improvements for the existing pitch and demo. It does not propose rebuilding the application.

The recommended focus is sea transport as the primary mode, with land and air treated as connected legs in an essential healthcare journey. The project should not attempt to implement every transport scope in the theme.

## Status Summary

| Area               | Status              | Current situation                                                                                                                                                                                        |
| ------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GIS map            | Implemented         | MapLibre map with island GeoJSON, OSM roads, service markers, and demand heatmaps.                                                                                                                       |
| Sea transport      | Implemented/partial | RTL ferry routes, schedule snapshots, OSM marine evidence, and ferry connections exist. Full journey calculations are not exposed.                                                                       |
| Land transport     | Partial             | Bus route data, roads, bridges, causeways, and last-mile routing exist. Observed traffic flow and road-safety data do not exist.                                                                         |
| Air transport      | Partial             | Airports, helipads, and modeled air links exist. Verified flight schedules and travel times are unavailable.                                                                                             |
| Healthcare access  | Implemented         | Health demand, hospital routing, elderly demand, care-transfer demand, and island analytics are implemented.                                                                                             |
| Education access   | Implemented         | Education services, population demand, outbound demand, and island analytics are implemented.                                                                                                            |
| Job access         | Implemented/partial | Employment score compares the `foregner` population category and working-age residents with island-linked workplace proxies; job capacity and vacancies remain unavailable.                              |
| Passenger movement | Partial             | Movement is estimated from population and service demand, not observed passenger counts.                                                                                                                 |
| Freight movement   | Missing             | No freight, cargo, port-volume, or logistics data is included.                                                                                                                                           |
| Transport planning | Partial             | Facility scenario proposals work, but ferry frequency, route, capacity, and transport-link proposals are not supported.                                                                                  |
| Monitoring         | Partial             | Static scores and load proxies exist, but there is no live monitoring or update history.                                                                                                                 |
| Sustainability     | Implemented/partial | A modeled pollution-pressure score uses vehicle categories, transport-demand proxies, mode factors, fallback assumptions, and explicit limitations; measured emissions and fuel data remain unavailable. |
| Climate resilience | Missing             | No flooding, weather disruption, coastal-risk, or climate exposure layer exists.                                                                                                                         |
| Road safety        | Missing             | No crash, speed, lighting, pedestrian, or road-risk data exists.                                                                                                                                         |
| Presentation pitch | Implemented         | The existing presentation mode contains an eight-step multimodal healthcare pitch.                                                                                                                       |
| Reader timing      | Missing             | Reader mode has no five-minute countdown or story progress indicator.                                                                                                                                    |
| Public API         | Partial             | Scenario preview and island-service APIs exist under `/api/v1`; several map requests still use unversioned routes.                                                                                       |

## Already Implemented

The following areas should be preserved rather than rebuilt:

- National Maldives mobility map.
- Island accessibility and transport scoring.
- Health, education, and transport service inventory.
- Inbound and outbound demand analytics.
- Employment balance analytics using foreign-resident population and island-linked workplace records.
- Sustainability proxy using vehicle counts, modeled mode demand, pollution factors, and explicit unavailable states.
- Transport hub load estimates.
- Ferry, bus, airport, road, bridge, causeway, and land-link evidence.
- OSM and RTL data artifacts.
- Island-level analytics drawers.
- Interactive service and demand map layers.
- Draft facility scenario builder.
- Existing presentation-mode pitch.
- Existing reader-mode speaker script.
- Verified versus modeled route distinctions in the presentation story.

Key evidence files:

- `src/lib/components/mobility/national-accessibility-map.svelte`
- `src/lib/components/mobility/presentation-story.ts`
- `src/lib/components/mobility/presentation-reader.svelte`
- `src/lib/server/scoring/transport-demand.ts`
- `src/lib/server/scoring/demand-allocation.ts`
- `data/mobility/transport/rtl-ferry-coverage.json`
- `data/mobility/normalized/osm-manifest.json`

## Partial Areas

### Ferry connectivity

The application has RTL route and schedule artifacts, but the interface does not yet calculate a complete journey with waiting time, transfer count, frequency, and total duration.

### Transport planning

The scenario builder can add, upgrade, downgrade, move, and delete services. It does not yet simulate a transport intervention such as increasing ferry frequency or adding a connection.

### Passenger movement

The current application estimates demand from population cohorts, care transfers, and service need. These are useful planning proxies but are not observed passenger traffic.

### Air transport

Airport records and modeled airport links exist. Flight schedules and approved flight travel times are not available, so the air part of the pitch must remain modeled or unavailable.

### Monitoring

The application calculates static national and island results. It does not yet show whether an artifact is current, how a value changed over time, or whether transport operations are currently running.

### API architecture

The project has a mobility facade and some versioned endpoints, but the frontend still uses legacy map endpoints for analytics, profiles, services, and geometry.

## Missing Areas

The following are not required for the first MVP if reliable public data is unavailable:

- Freight movement and logistics.
- Observed traffic flow.
- Road-safety analysis.
- Climate and coastal-risk analysis.
- Measured passenger capacity.
- Verified flight schedules.
- Real-time vessel or vehicle tracking.
- Time-series movement forecasting.
- Carbon emissions based on measured fuel or passenger data.

These should not be simulated as real observations. If they are added later, the data source and uncertainty must be explicit.

## Must Implement

| Area               | Current state                                                           | Recommended change                                                                                                     | Change level | Expected impact         |
| ------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------- |
| Reader demo timing | The pitch exists, but reader mode has no clock                          | Add a five-minute countdown and `Step N of 8` progress only in reader mode.                                            | Low          | High for expo delivery  |
| Ferry connectivity | RTL routes and schedules exist, but journey metrics are not exposed     | Calculate departure, arrival, waiting time, transfer count, and ferry duration for the Baarah journey.                 | Medium       | High                    |
| Movement patterns  | Inbound and outbound demand exists, but it is not presented as movement | Add estimated inbound movement, outbound movement, total movement pressure, outbound dependence, and mode pressure.    | Low/medium   | High                    |
| Transport planning | Facility scenarios exist, but no transport intervention exists          | Add one draft ferry-frequency intervention and compare before and after journey results.                               | Medium/high  | Very high               |
| Sustainability     | No emissions feature exists                                             | Add a transparent estimate only if public distance and mode factors are available.                                     | Medium       | High if clearly labeled |
| Data compliance    | Public artifacts exist, but source claims need review                   | Ensure RTL, OSM, MBS, and routing sources are documented for the declaration form.                                     | Low          | Critical for submission |
| Challenge card     | The draft mentions jobs, which are now modeled as an explicit proxy     | Keep job access only with clear labels for workplace records, assumed-zero foreign rows, and unavailable job capacity. | Low          | Prevents overclaiming   |

## Improve Existing Functionality

### Make transport the headline

The current blended accessibility score combines health, education, and transport. Keep it, but make transport metrics more prominent:

- Journey duration.
- Transfer count.
- Ferry frequency.
- Inbound movement pressure.
- Outbound dependence.
- Transport mode breakdown.
- Hub demand.

Health and education should explain the impact of transport gaps.

### Clarify estimated movement

The current inbound and outbound values are estimated service demand, not measured traffic or observed passenger counts.

Use labels such as:

- Modeled inbound movement.
- Modeled outbound movement.
- Estimated movement pressure.
- Estimated outbound dependence.

Recommended calculations:

```text
estimated inbound movement = inbound demand
estimated outbound movement = outbound demand
total movement pressure = inbound demand + outbound demand
outbound dependence = outbound demand / island population
```

Do not present these values as observed passenger counts.

### Use the existing pitch

Do not build another presentation system. Improve the current presentation mode by adding this sequence to the existing story:

1. National mobility gap.
2. Baarah healthcare demand.
3. Verified ferry journey.
4. Airport and land connection.
5. Inbound and outbound movement pressure.
6. Ferry-frequency proposal.
7. Before-and-after result.

The timer and progress indicator should appear only in reader mode.

### Review data claims

The current pitch references Google Maps in one source label. Replace it with OSM or official administrative data unless its use is clearly permitted.

Keep all modeled, inferred, estimated, and unavailable values explicitly labeled.

## Sustainability Decision

Inbound and outbound demand can support an estimated movement calculation, but they do not independently prove carbon emissions.

If carbon is implemented, use:

```text
estimated movement demand x route distance x mode emission factor
```

This requires:

- Public mode emission factors.
- Route distance.
- Mode classification.
- Clear assumptions.

If those inputs are not reliable, implement movement pressure only and do not claim precise carbon reduction.

### MVP-01: Add reader-mode timer and progress

| Field                 | Recommendation                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Change level          | Low                                                                                                                    |
| Expected impact       | High for expo delivery                                                                                                 |
| User value            | Keeps the presenter within the five-minute demo window and shows progress through the eight-step pitch.                |
| Files                 | `presentation-controller.svelte.ts`, `+page.svelte`, `presentation-reader.svelte`, `presentation_story.md`             |
| Functional change     | Start a five-minute countdown in reader mode and show `Step N of 8` with a progress bar.                               |
| Must remain unchanged | Clean presentation mode, map animation, slide order, keyboard shortcuts, and automatic navigation behavior.            |
| Implementation note   | Store an absolute deadline in `PresentationController`; update the visible remaining time inside `PresentationReader`. |

The timer should be visible only in reader mode. It should show `00:00` when expired without automatically advancing or exiting the pitch.

### MVP-02: Show existing pitch facts and evidence

| Field             | Recommendation                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Change level      | Low                                                                                             |
| Expected impact   | Medium to high for judge comprehension                                                          |
| User value        | Makes the existing facts, notes, and sources visible while presenting.                          |
| Files             | `presentation-reader.svelte`, possibly `presentation-story.ts` for wording only                 |
| Functional change | Render the existing `facts`, `note`, and `source` fields already defined on `PresentationStep`. |
| New data required | None                                                                                            |
| Scope boundary    | Do not build a separate sources and limitations panel.                                          |

This is a presentation-only improvement. It does not change scoring or map behavior.

### MVP-03: Add one verified ferry journey summary

| Field             | Recommendation                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| Change level      | Medium                                                                                                               |
| Expected impact   | High for transport-theme alignment                                                                                   |
| User value        | Converts the existing healthcare story into measurable transport insight.                                            |
| Files             | New mobility journey service, existing mobility facade, one versioned journey endpoint, reader integration           |
| Functional change | Calculate ferry departure, arrival, waiting time, transfer count, and ferry duration from the packaged RTL artifact. |
| Data source       | `data/mobility/transport/rtl-ferry-coverage.json`                                                                    |
| Scope boundary    | Keep the current visual route animation. Do not invent flight schedules or vessel positions.                         |

The air leg should remain explicitly marked as modeled or unavailable when verified schedule data is not present.

### MVP-04: Add one ferry-frequency intervention comparison

| Field             | Recommendation                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Change level      | Medium to high                                                                                  |
| Expected impact   | Very high for judging because it demonstrates planning action, not only diagnosis               |
| User value        | Shows what changes if a transport bottleneck is addressed.                                      |
| Files             | `scenario-contracts.ts`, `scenario-engine.ts`, mobility facade, proposal UI, reader pitch facts |
| Functional change | Support one draft operation such as increasing frequency on an existing ferry route.            |
| Comparison output | Waiting time, total journey duration, transfer count, and affected movement demand.             |
| Persistence       | Draft-only; no database migration or policy persistence.                                        |
| Scope boundary    | Do not build a general route editor or full transport network simulator.                        |

This should be presented as a planning estimate, not an approved operational recommendation.

### MVP-05: Estimate inbound and outbound movement pressure

| Field             | Recommendation                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change level      | Low to medium                                                                                                                                            |
| Expected impact   | High for transport analytics and national prioritization                                                                                                 |
| User value        | Turns existing inbound and outbound demand values into a clear movement-pressure indicator.                                                              |
| Existing data     | `inboundTotal`, `outboundTotal`, `transportDemand`, `connectedDemand`, and `careTransferDemand`                                                          |
| Functional change | Calculate and display estimated inbound movement, estimated outbound movement, total movement pressure, outbound dependence, and mode-specific pressure. |
| Scope boundary    | Do not describe the result as observed traffic or measured passenger volume.                                                                             |

Recommended indicators:

```text
estimated inbound movement = inbound demand
estimated outbound movement = outbound demand
total movement pressure = inbound demand + outbound demand
outbound dependence = outbound demand / island population
```

The UI should label these as a `modeled movement or traffic proxy`. The existing data represents estimated service demand, not direct traffic counts.

If a later carbon estimate is required, it should use:

```text
estimated movement demand x route distance x transport-mode factor
```

That calculation should remain deferred until route distance and public emission factors are available and documented. The first MVP should prioritize movement pressure rather than claiming precise carbon output.

## Can Ignore For The MVP

These are valid datathon topics but are not necessary for this focused solution:

- Freight analytics.
- Real-time traffic sensors.
- Road-safety scoring.
- Climate-risk layers.
- Digital-connectivity mapping.
- Full machine-learning demand forecasting.
- AI features.
- Native mobile application.
- Live ferry or flight tracking.
- Full flight schedule integration.
- Full API migration.
- Persisted transport-route planning.
- Complete national transport-network simulation.

These areas can be deferred because the current data and pitch are strongest around ferry-connected healthcare access.

## Recommended MVP Order

| Order | Change                                      | Level       | Expected impact |
| ----- | ------------------------------------------- | ----------- | --------------- |
| 1     | Reader-mode timer and progress              | Low         | High            |
| 2     | Existing facts and evidence in reader mode  | Low         | Medium/high     |
| 3     | RTL ferry journey summary                   | Medium      | High            |
| 4     | Inbound/outbound movement-pressure estimate | Low/medium  | High            |
| 5     | One ferry-frequency intervention comparison | Medium/high | Very high       |

The implementation order is:

1. Add reader-only timer and eight-step progress.
2. Expose existing pitch facts and metrics.
3. Calculate the RTL ferry journey summary.
4. Add inbound and outbound movement-pressure metrics.
5. Add one ferry-frequency intervention comparison.
6. Add a bounded carbon estimate only if reliable public factors and distances are available.
7. Finalize source declarations, challenge card, repository, presentation URL or PDF, and authenticity form.

## Changes To Avoid In The MVP

- Do not replace the existing presentation pitch.
- Do not add a second presentation system.
- Do not add a visible sources and limitations panel.
- Do not rewrite the national scoring model.
- Do not add a database migration for draft scenarios.
- Do not claim measured passenger traffic from modeled demand.
- Do not invent flight schedules, vessel positions, or transport capacities.
- Do not implement freight, road safety, climate risk, and live traffic simultaneously.

## Data Claims And Submission Compliance

The final submission must be able to identify the public or official source behind each important dataset. This does not require a new visible source panel in the application.

The submission package should include:

- Repository link.
- Presentation PDF or URL.
- Authenticity declaration.
- Dataset source list.
- Retrieval or effective dates.
- OSM attribution where applicable.
- Clear labels for modeled and estimated values.

The challenge card should not claim job access, freight, measured traffic, or carbon reduction unless those capabilities are actually implemented.

## Expected MVP Outcome

The smallest credible submission should demonstrate this flow:

```text
Existing public data -> island mobility gap -> inbound/outbound movement pressure -> ferry bottleneck -> draft frequency intervention -> changed journey estimate
```

This preserves the current pitch and map while adding enough measurable transport functionality to align the product more directly with the datathon theme.

The key MVP assumption is that item 5 is primarily a modeled movement-pressure estimate. Carbon should remain deferred unless reliable route distances and public emission factors are available.

## Review Status

This document is a review checklist only. It does not authorize implementation changes until the proposed MVP scope is approved.
