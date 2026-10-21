# Datathon Alignment Review

## Purpose

This document compares the current Maldives mobility project with the Datathon 2026 theme:

> Mobility Through Data: Innovate Transport Insights for a Connected Maldives

It records what the current project already does, where it matches the challenge, what remains incomplete, and which additions would have the greatest impact before submission.

This is a review document only. It is intended for approval before application changes are made.

## Overall Assessment

The project is a strong foundation and a partial match for the datathon.

It already looks like a Maldives mobility decision-support product, but it currently emphasizes health, education, and accessibility scoring more than transport operations, sustainability, and monitoring.

The most effective direction is not to build every possible transport feature. The project should focus on multimodal access to essential services, especially healthcare journeys that combine sea, air, and land transport.

The central product message should become:

> AtollLink: Mobility intelligence for essential journeys across the Maldives.

Health and education should remain important because they explain who is affected by transport gaps. However, transport indicators should become the primary product output.

The pitch itself already exists in the application's presentation mode. The project does not need a separate pitch system or a replacement presentation. The appropriate change is to strengthen the existing reader mode with a five-minute clock and story progress while preserving the current presentation choreography.

## Current Feature Inventory

The current application includes:

- A national MapLibre map of inhabited Maldives islands.
- Island accessibility scores and national score summaries.
- Health, education, and transport service markers.
- Demand heatmaps based on population and mapped residential buildings.
- Island-level population, service, connection, and demand analytics.
- Land, marine, and air transport score breakdowns.
- Ferry, airport, bus, bridge, causeway, and land-link evidence.
- RTL ferry data snapshots and route coverage artifacts.
- OpenStreetMap marine, road, service, and route data.
- Population-based demand estimates for health, education, and transport.
- Employment balance using MBS foreign-resident population, working-age population, and island-linked workplace records.
- Inbound and outbound service demand by island.
- Transport hub load and capacity proxy calculations.
- Healthcare routing and care-transfer demand calculations.
- A draft scenario builder for adding, upgrading, moving, and deleting services.
- Island-boundary validation for proposed services.
- A scripted presentation story showing a healthcare journey from Baarah to Hulhumale.
- Keyboard-controlled presentation and reader modes.
- Explicit labels for verified, modeled, narrative, and unavailable evidence in the presentation story.

## Requirement Comparison

| Datathon requirement                  | Current fit       | Evidence and limitation                                                                                                                                                                                                          |
| ------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GIS and mapping                       | Strong            | `src/lib/components/mobility/national-accessibility-map.svelte` uses MapLibre, GeoJSON islands, OSM roads, service markers, and demand heatmaps.                                                                                 |
| Sea transport                         | Strong/partial    | `data/mobility/transport/rtl-ferry-coverage.json` contains 47 routes, 124 covered islands, and 109 matched official islands. OSM marine artifacts provide additional evidence. Schedule and vessel tracking data are incomplete. |
| Land transport                        | Partial           | RTL bus route geometry, OSM roads, bridges, causeways, and land links are present. There is no observed traffic-flow or road-safety dataset.                                                                                     |
| Air transport                         | Partial           | Airports, air terminals, helipads, and modeled airport links are represented. Verified flight schedules and approved air travel times are not available.                                                                         |
| Healthcare and education connectivity | Strong            | Population cohorts, care demand, education demand, hospital routing, inbound demand, outbound demand, and transport hub pressure are implemented.                                                                                |
| Job access                            | Strong/partial    | Island and national employment scores compare the `foregner` population category with working-age residents and island-linked workplace proxies. Job counts, vacancies, capacity, and workforce participation are unavailable.   |
| Passenger movement                    | Partial           | The application estimates demand from population cohorts and care transfers. It does not use observed passenger counts or a complete origin-destination dataset.                                                                 |
| Freight movement                      | Missing           | No freight, cargo, port-volume, or logistics data is currently included.                                                                                                                                                         |
| Ferry connectivity                    | Strong/partial    | RTL ferry routes and schedule snapshots are included. The current interface does not yet expose a full route planner with waiting time, frequency, and transfer calculations.                                                    |
| Traffic flows                         | Missing/partial   | Road data and bus routes exist, but there are no traffic sensors, observed flows, congestion measures, or time-series monitoring.                                                                                                |
| Demand forecasting                    | Partial           | Current demand is a modeled population and service-need proxy. It is not a time-series forecast based on historical movement data.                                                                                               |
| Transport planning                    | Strong foundation | The scenario builder provides interactive draft planning. It currently changes facilities rather than ferry frequency, routes, capacity, or transport connections.                                                               |
| Monitoring                            | Partial           | The application calculates static scores and load proxies. It does not yet provide a clear freshness status, update history, or live operational monitoring.                                                                     |
| Sustainability and carbon             | Missing           | No emissions, fuel, carbon, energy, or mode-comparison metric is currently implemented.                                                                                                                                          |
| Climate resilience                    | Missing           | No flooding, wave exposure, severe-weather, coastal-risk, or climate disruption layer is currently implemented.                                                                                                                  |
| Road safety                           | Missing           | No crash, road-risk, speed, lighting, pedestrian, or road-safety dataset is currently implemented.                                                                                                                               |
| Public and open data                  | Partial/strong    | OSM and RTL artifacts contain source URLs, timestamps, checksums, and limitations. The canonical baseline identifies `local.db` as its source and does not fully expose upstream provenance in the interface.                    |
| Official statistical systems          | Partial           | MBS source links appear in the population estimate artifacts, but estimated data is explicitly excluded from official scoring. The production data register should distinguish official, estimated, and modeled values.          |
| Interactive dashboard                 | Strong            | The map, analytics drawers, island search, demand tabs, service markers, and scenario builder provide a substantial interactive dashboard.                                                                                       |
| API-first architecture                | Incomplete        | Only scenario preview and island services currently exist under `/api/v1`. The UI still calls several unversioned `/api/map/...` endpoints directly.                                                                             |
| Expo demo                             | Strong foundation | The existing presentation mode and `presentation_story.md` provide an eight-step healthcare pitch. Reader mode currently has no five-minute timer or story progress indicator. No new pitch system is required.                  |

## What Already Matches Well

### Data-driven transport insight

The project is not a static map. It calculates population-weighted demand, service gaps, island-level scores, transport mode scores, inbound demand, outbound demand, and hub pressure.

Relevant implementation:

- `src/lib/server/scoring/demand-allocation.ts`
- `src/lib/server/scoring/transport-demand.ts`
- `src/lib/server/scoring/national-score.ts`
- `src/lib/server/scoring/island-profile.ts`

### Multimodal connectivity

The project represents sea, land, and air transport in the scoring model and in the presentation narrative. This is well aligned with the broad datathon scope.

Relevant implementation:

- `src/lib/db/models/transport-connection.ts`
- `src/lib/db/models/transport-route.ts`
- `src/lib/server/scoring/transport-demand.ts`
- `src/lib/components/mobility/presentation-story.ts`

### GIS and public data integration

The project uses MapLibre and GeoJSON with public OSM and RTL artifacts. The data packaging includes retrieval dates, URLs, checksums, schema versions, and known limitations.

Relevant artifacts:

- `data/mobility/manifest.json`
- `data/mobility/normalized/osm-manifest.json`
- `data/mobility/transport/rtl-ferry-coverage.json`
- `data/mobility/normalized/transport-connections.json`
- `data/mobility/normalized/rtl-bus.json`

### Human-centered problem framing

The presentation story makes the problem understandable through a healthcare journey from Baarah to a hospital destination. It demonstrates that reaching an airport or island is not equivalent to reaching care.

This is a strong expo strategy because it gives judges a concrete human outcome before showing the national analytics.

### Honest evidence handling

The presentation story distinguishes verified ferry schedule evidence from modeled sea paths and modeled air links. This is important because the current data does not contain complete vessel tracks, flight schedules, measured capacities, or approved travel times.

The project should preserve this honesty rather than inventing operational data.

## Main Gaps To Resolve

### 1. Transport is not yet the headline output

The national score currently combines health, education, and transport. This is useful analytically, but a judge may interpret the product as a general social-service accessibility map rather than a transport intelligence platform.

The top-level experience should prioritize:

- Journey duration.
- Number of transfers.
- Ferry frequency and availability.
- Outbound essential-trip demand.
- Mode-specific access.
- Hub pressure.
- Estimated carbon impact.

Health and education should explain the consequences of transport gaps and identify the people affected.

### 2. The current scenario planner does not change transport operations

`src/lib/mobility/scenario-contracts.ts` currently supports:

- `add_service`
- `upgrade_service`
- `move_service`
- `delete_service`

`src/lib/server/mobility/scenario-engine.ts` projects those facility changes into a temporary snapshot. It does not yet change ferry schedules, route frequency, transport links, passenger capacity, or travel time.

The result is a good facility-planning prototype, but it is not yet a complete transport intervention planner.

### 3. Most movement and capacity values are proxies

The current scorer estimates demand from population cohorts and uses configured capacity proxies for transport stops. This is acceptable if clearly labeled, but it should not be presented as measured passenger movement or validated capacity.

The interface should display confidence and evidence status beside every important number.

### 4. Sustainability is absent

The datathon explicitly mentions sustainability and reducing carbon footprints. The project currently has no emissions or mode comparison feature.

A transparent estimate is enough for the hackathon. It does not need to claim precise real-world emissions.

### 5. Operational journey data is not fully exposed

The RTL artifact contains schedule entries, but the current product does not provide a complete journey calculation showing waiting time, transfer time, frequency, and total elapsed time.

This is the most valuable transport-specific addition because it turns the emotional story into an operational insight.

### 6. Provenance is mostly hidden from the user

The backend and data artifacts include limitations, but the main interface does not yet give judges a clear source register or evidence-quality view.

Public data compliance should be visible in the demo, not only present in source files.

### 7. Reader mode needs a five-minute clock

The existing presentation mode is already the pitch. The reader mode is the presenter-facing version of that pitch and currently displays the script without a five-minute clock or step progress indicator.

The requested change is intentionally narrow:

- Start a five-minute countdown when reader mode begins.
- Show the timer only inside `PresentationReader`.
- Show the current story position as `Step N of 8`.
- Keep the timer deadline in `PresentationController` so switching between reader and clean presentation modes does not restart the session.
- Reset the deadline when the presentation session exits.
- Display `00:00` without auto-advancing or exiting.
- Leave the map, story choreography, keyboard shortcuts, and clean presentation mode unchanged.

The timer should be visible only in reader mode. The clock may continue while the reader is temporarily hidden so the five-minute session remains a single clock, but no timer UI should appear in clean presentation mode.

## Recommended Additions In Priority Order

### Priority 1: Make the product transport-first

Update the product name, description, and opening panel to communicate a transport decision system.

Recommended positioning:

> AtollLink reveals which sea, land, and air connections prevent island residents from reaching essential services, then compares practical transport interventions using demand, journey time, hub pressure, and sustainability indicators.

The current accessibility score can remain, but it should be presented as a supporting impact score rather than the only headline.

### Priority 2: Add a journey and connectivity analysis

Use the existing RTL schedule data to calculate:

- First and last departure.
- Scheduled frequency.
- Waiting time.
- Number of ferry transfers.
- Estimated total journey duration.
- Mode sequence.
- Bottleneck island or hub.
- Whether each leg is verified, modeled, or unavailable.

The initial demo journey can remain Baarah to Tree Top Hospital, but the interface should show the journey as data rather than only as an animation.

### Priority 3: Add transport interventions to the scenario planner

Add support for at least one transport intervention, preferably:

- Increase frequency on an existing ferry route.
- Add a proposed ferry connection.
- Add a bus connection to a transport hub.

The scenario response should compare baseline and proposal values for:

- People gaining access.
- Outbound healthcare demand.
- Outbound education demand.
- Journey time.
- Transfer count.
- Hub load.
- Estimated emissions.

The proposal can remain draft-only, but the interface must clearly say that it is a planning simulation and is not persisted or approved policy.

### Priority 4: Add a sustainability estimate

Implement a clearly labeled estimated emissions calculation using public emission factors.

Suggested model:

```text
estimated emissions = passenger demand x route distance x mode emission factor
```

The UI should show:

- Mode used.
- Distance source.
- Demand source.
- Emission-factor source.
- Assumptions.
- A confidence label.

The result should be labeled as an estimate, not as measured emissions.

### Priority 5: Add a sources and confidence panel

Expose a visible data register containing:

- OSM source and retrieval date.
- RTL source and effective date.
- MBS source and reference year.
- OSRM or routing source where used.
- Coverage counts.
- Artifact versions and checksums.
- Modeled or inferred records.
- Missing capacity, travel-time, and schedule limitations.

Avoid relying on Google Maps records in the final data story unless their use is permitted and properly attributed. Prefer OSM and official administrative records where possible.

### Priority 6: Add reader-mode pitch timing

The pitch already exists. Add only the reader-mode timing and progress overlay:

- A five-minute timer.
- A `Step N of 8` counter.
- A story-step progress bar.
- A reset through the existing presentation exit behavior.

Minimal files for this change:

- `src/lib/components/mobility/presentation-controller.svelte.ts` for the countdown deadline.
- `src/routes/+page.svelte` for passing controller values to the reader.
- `src/lib/components/mobility/presentation-reader.svelte` for the timer and progress UI.
- `tests/unit/presentation-controller.spec.ts` for focused lifecycle assertions, without automatically running tests.
- `presentation_story.md` for documenting reader-mode timing.

Do not add the timer to `NationalAccessibilityMap`, `presentation-story.ts`, or clean presentation mode. Do not add automatic slide advancement.

Recommended five-minute sequence:

1. Show the national mobility gap.
2. Select Baarah and show affected population and care demand.
3. Show the verified ferry schedule and transfer chain.
4. Show the airport and last-mile land connection.
5. Apply a proposed transport intervention.
6. Compare baseline and proposal outcomes.
7. Open the sources and limitations panel.

The source and limitations panel can initially reuse the existing `facts`, `note`, and `source` fields on `PresentationStep`. A new provenance system is not required for the timer change.

### Priority 7: Complete the versioned API surface

Add stable endpoints for:

- `/api/v1/health`
- `/api/v1/national/summary`
- `/api/v1/islands`
- `/api/v1/islands/:id`
- `/api/v1/islands/:id/profile`
- `/api/v1/map/features`

Then route the frontend through those contracts rather than relying primarily on the unversioned `/api/map/...` endpoints.

This is valuable for credibility and future integration, although the first five priorities have more direct judging impact.

### Priority 8: Remove starter branding

Update the remaining starter references in:

- `src/lib/config/app/index.ts`
- `README.md`
- `tests/e2e/homepage.test.ts`

The application should present itself consistently as the Maldives mobility product.

## Minimal Implementation Plan

The implementation should be staged so the requested reader-mode feature is delivered without changing the application's core scoring or map behavior.

### Phase 1: Reader timer and progress

Implement only the five-minute reader-mode clock and eight-step progress indicator.

The countdown should use an absolute deadline rather than decrementing a counter. This prevents timer drift when the browser throttles background tabs. The interval belongs to the reader component and must be cleaned up when the reader unmounts.

The controller owns the deadline, while the reader owns display updates. This keeps the timer stable when switching between reader and clean presentation modes while ensuring that the timer is rendered only in reader mode.

### Phase 2: Reuse existing pitch evidence

Render the existing `PresentationStep.facts`, `PresentationStep.note`, and `PresentationStep.source` values in reader mode. This adds visible evidence and limitations without changing the data model, map, scoring formulas, or presentation choreography.

The current verified, modeled, narrative, and proposal map styling should remain unchanged.

### Phase 3: Add one transport journey summary

Reuse the packaged RTL ferry artifact to calculate one read-only journey summary for the existing Baarah story:

- Ferry departure and arrival times.
- Waiting time.
- Transfer count.
- Ferry journey duration.
- Verified, modeled, or unavailable status for each leg.

Keep the existing animated route. Add the calculated summary as reader facts rather than rebuilding the map animation.

The airport leg must remain explicitly modeled or unavailable where verified flight schedules and travel times are not present.

### Phase 4: Add one transport intervention comparison

Add one focused draft intervention, preferably an increase in frequency on an existing ferry route. Avoid replacing the existing scenario engine or adding a general-purpose transport planner at this stage.

Compare only the metrics needed for the pitch:

- Waiting time.
- Total journey duration.
- Transfer count.
- Affected or outbound demand.
- Estimated emissions.

Keep the result draft-only and clearly label it as a planning simulation rather than an approved policy outcome.

### Phase 5: Add a transparent sustainability estimate

Add a pure calculation for estimated emissions using public mode factors, route distance, and modeled passenger demand. Include the factor source, assumptions, and confidence in the response and reader display.

Do not add emissions to the national score until the estimate has an approved provenance and a clear interpretation.

### Deferred work

The following work should remain outside the minimal pitch-focused implementation unless time and reliable data are available:

- Full versioned API migration.
- Freight analytics.
- Road-safety scoring.
- Climate-risk layers.
- Live traffic monitoring.
- Database schema changes.
- Persisted transport route proposals.
- New global application state.

## Features To Avoid Adding Without Data

The datathon theme is broad, but adding unsupported features would weaken credibility.

Do not add the following unless reliable public data is available:

- Invented live ferry positions.
- Invented flight schedules.
- Claimed measured passenger capacity.
- Claimed real-time traffic congestion.
- Precise carbon numbers without emission-factor provenance.
- Freight forecasts without freight data.
- Road-safety scores without crash or road-risk data.

Modeled outputs are acceptable when they are explicitly labeled as modeled, estimated, inferred, or unavailable.

## Recommended Product Definition

### Product name

AtollLink

### Product description

AtollLink is a Maldives mobility intelligence platform that maps essential journeys across sea, land, and air transport, identifies islands where transport gaps limit access to healthcare and education, and lets planners compare the effects of proposed route and service interventions.

### Strongest competition angle

The project should not compete as only another map. It should demonstrate a complete decision loop:

```text
Public data -> mobility gap -> affected people -> transport bottleneck -> proposed intervention -> measurable impact
```

That decision loop directly connects the current mapping work to the datathon's objectives around transport planning, monitoring, sustainability, and modernized transport statistics.

## Challenge Card Draft

The following is exactly 50 words. Replace `AtollLink` with the final team name if necessary.

> Team AtollLink addresses Maldives' fragmented island connectivity, where residents struggle to reach healthcare, education, and jobs across disconnected transport networks. We will build a sea, land, and air mobility intelligence platform combining population, service, RTL ferry, bus, airport, and OpenStreetMap data to reveal gaps, estimate demand, and compare sustainable interventions.

## Final Recommendation

Proceed with the current project direction, but do not present it as finished yet.

The project already matches the datathon strongly in GIS, multimodal transport representation, healthcare and education connectivity, public-data integration, interactive planning, and an existing presentation-mode pitch. It becomes a much stronger submission after adding the reader-mode five-minute timer and progress indicator, a transport-first journey analysis, one transport intervention comparison, transparent sustainability estimates, and visible data provenance.

The project does not need to cover every possible scope. A focused sea-air-land essential-journey problem is more credible and more memorable than a shallow attempt to cover freight, road safety, climate risk, traffic monitoring, and digital connectivity simultaneously.

## Review Status

This document records the current assessment and proposed direction. The pitch already exists in presentation mode. The requested first implementation is limited to a five-minute timer and story progress indicator in reader mode. No other application functionality changes are authorized by this document alone.
