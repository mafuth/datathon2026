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
- A draft scenario builder for adding, upgrading, downgrading, moving, and deleting services.
- Island-boundary validation for proposed services.

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
| Sustainability and carbon             | Partial           | A transparent sustainability proxy is implemented, but it is not a measured emissions inventory or validated route-level carbon comparison.                                                                                      |
| Climate resilience                    | Missing           | No flooding, wave exposure, severe-weather, coastal-risk, or climate disruption layer is currently implemented.                                                                                                                  |
| Road safety                           | Missing           | No crash, road-risk, speed, lighting, pedestrian, or road-safety dataset is currently implemented.                                                                                                                               |
| Public and open data                  | Partial/strong    | OSM and RTL artifacts contain source URLs, timestamps, checksums, and limitations. The canonical baseline identifies `local.db` as its source and does not fully expose upstream provenance in the interface.                    |
| Official statistical systems          | Partial           | MBS source links appear in the population estimate artifacts, but estimated data is explicitly excluded from official scoring. The production data register should distinguish official, estimated, and modeled values.          |
| Interactive dashboard                 | Strong            | The map, analytics drawers, island search, demand tabs, service markers, and scenario builder provide a substantial interactive dashboard.                                                                                       |
| API-first architecture                | Incomplete        | Only scenario preview and island services currently exist under `/api/v1`. The UI still calls several unversioned `/api/map/...` endpoints directly.                                                                             |

## What Already Matches Well

### Data-driven transport insight

The project is not a static map. It calculates population-weighted demand, service gaps, island-level scores, transport mode scores, inbound demand, outbound demand, and hub pressure.

Relevant implementation:

- `src/lib/server/scoring/demand-allocation.ts`
- `src/lib/server/scoring/transport-demand.ts`
- `src/lib/server/scoring/national-score.ts`
- `src/lib/server/scoring/island-profile.ts`

### Multimodal connectivity

The project represents sea, land, and air transport in the scoring model. This is well aligned with the broad datathon scope.

Relevant implementation:

- `src/lib/db/models/transport-connection.ts`
- `src/lib/db/models/transport-route.ts`
- `src/lib/server/scoring/transport-demand.ts`

### GIS and public data integration

The project uses MapLibre and GeoJSON with public OSM and RTL artifacts. The data packaging includes retrieval dates, URLs, checksums, schema versions, and known limitations.

Relevant artifacts:

- `data/mobility/manifest.json`
- `data/mobility/normalized/osm-manifest.json`
- `data/mobility/transport/rtl-ferry-coverage.json`
- `data/mobility/normalized/transport-connections.json`
- `data/mobility/normalized/rtl-bus.json`

### Human-centered problem framing

A healthcare journey from Baarah to a hospital destination is a useful example because it demonstrates that reaching an airport or island is not equivalent to reaching care.

This framing gives judges a concrete human outcome before the national analytics.

### Honest evidence handling

The project should distinguish verified ferry schedule evidence from modeled sea paths and modeled air links. This is important because the current data does not contain complete vessel tracks, flight schedules, measured capacities, or approved travel times.

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
- `downgrade_service`
- `move_service`
- `delete_service`

`src/lib/server/mobility/scenario-engine.ts` projects those facility changes into a temporary snapshot. It does not yet change ferry schedules, route frequency, transport links, passenger capacity, or travel time.

The result is a good facility-planning prototype, but it is not yet a complete transport intervention planner.

### 3. Most movement and capacity values are proxies

The current scorer estimates demand from population cohorts and uses configured capacity proxies for transport stops. This is acceptable if clearly labeled, but it should not be presented as measured passenger movement or validated capacity.

The interface should display confidence and evidence status beside every important number.

### 4. Sustainability is modeled, not measured

The backend includes a transparent sustainability proxy using vehicle counts, configured category and mode factors, modeled transport demand, and explicit fallbacks. It is exposed as a fifth scoring domain and analytics data, but it is not an emissions inventory or a measured carbon-footprint comparison.

The remaining gap is provenance-rich route emissions using observed trips, distance, occupancy, fuel type, and validated mode capacity. The current output must remain labeled as modeled or estimated.

### 5. Operational journey data is not fully exposed

The RTL artifact contains schedule entries, but the current product does not provide a complete journey calculation showing waiting time, transfer time, frequency, and total elapsed time.

This is a valuable transport-specific addition because it turns a human-centered example into an operational insight.

### 6. Provenance is mostly hidden from the user

The backend and data artifacts include limitations, but the main interface does not yet give judges a clear source register or evidence-quality view.

Public data compliance should be visible in the product, not only present in source files.

## Recommended Additions In Priority Order

### Priority 1: Make the product transport-first

Update the product name, description, and opening panel to communicate a transport decision system.

Recommended positioning:

> AtollLink reveals which sea, land, and air connections prevent island residents from reaching essential services, then compares practical transport interventions using demand, journey time, hub pressure, and sustainability indicators.

The current accessibility score can remain, but it should be presented as a supporting impact score rather than the only headline.

### Priority 2: Add journey and connectivity analysis

Use the existing RTL schedule data to calculate:

- First and last departure.
- Scheduled frequency.
- Waiting time.
- Number of ferry transfers.
- Estimated total journey duration.
- Mode sequence.
- Bottleneck island or hub.
- Whether each leg is verified, modeled, or unavailable.

An initial example can use the Baarah-to-Tree-Top-Hospital journey, but the interface should show the journey as data.

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

### Priority 4: Extend the sustainability estimate

The backend has a clearly labeled pollution-pressure estimate using public vehicle and transport proxies. Extend it only if reliable route-level inputs and public emission-factor provenance become available.

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

Avoid relying on Google Maps records in final data claims unless their use is permitted and properly attributed. Prefer OSM and official administrative records where possible.

### Priority 6: Complete the versioned API surface

Add stable endpoints for:

- `/api/v1/health`
- `/api/v1/national/summary`
- `/api/v1/islands`
- `/api/v1/islands/:id`
- `/api/v1/islands/:id/profile`
- `/api/v1/map/features`

Then route the frontend through those contracts rather than relying primarily on the unversioned `/api/map/...` endpoints.

This is valuable for credibility and future integration, although the first five priorities have more direct judging impact.

### Priority 7: Remove starter branding

Update the remaining starter references in:

- `src/lib/config/app/index.ts`
- `README.md`
- `tests/e2e/homepage.test.ts`

The application should present itself consistently as the Maldives mobility product.

## Minimal Implementation Plan

### Phase 1: Add one transport journey summary

Reuse the packaged RTL ferry artifact to calculate one read-only journey summary for a Baarah example:

- Ferry departure and arrival times.
- Waiting time.
- Transfer count.
- Ferry journey duration.
- Verified, modeled, or unavailable status for each leg.

The airport leg must remain explicitly modeled or unavailable where verified flight schedules and travel times are not present.

### Phase 2: Add one transport intervention comparison

Add one focused draft intervention, preferably an increase in frequency on an existing ferry route. Avoid replacing the existing scenario engine or adding a general-purpose transport planner at this stage.

Compare only the metrics needed to assess the intervention:

- Waiting time.
- Total journey duration.
- Transfer count.
- Affected or outbound demand.
- Estimated emissions.

Keep the result draft-only and clearly label it as a planning simulation rather than an approved policy outcome.

### Phase 3: Harden the transparent sustainability estimate

The current implementation provides a pure pollution-pressure calculation using vehicle categories, mode factors, modeled passenger demand, and limitations. Future route-level emissions work should add distance and factor provenance, then expose assumptions and confidence in the response and interface.

Do not present the current proxy as measured emissions or precise carbon output.

### Deferred work

The following work should remain outside the minimal implementation unless time and reliable data are available:

- Full versioned API migration.
- Freight analytics.
- Road-safety scoring.
- Climate-risk layers.
- Live traffic monitoring.
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

The project already matches the datathon strongly in GIS, multimodal transport representation, healthcare and education connectivity, public-data integration, and interactive planning. It becomes a much stronger submission after adding transport-first journey analysis, one transport intervention comparison, transparent sustainability estimates, and visible data provenance.

The project does not need to cover every possible scope. A focused sea-air-land essential-journey problem is more credible and memorable than a shallow attempt to cover freight, road safety, climate risk, traffic monitoring, and digital connectivity simultaneously.

## Review Status

This document records the current assessment and proposed direction. It does not authorize application changes by itself.
