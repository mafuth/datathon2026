# Vehicle registration preparation

This directory contains a category-wise vehicle-registration dataset prepared from MBS Statistical Yearbook 2024 Table 11.6. The table reports registrations at four published locality groups: Male, Hulhumale, Addu and Other atolls.

## Files

- `vehicle-registration-official-locality-2018.csv`: official published locality totals.
- `vehicles-by-island-category.csv`: island-level planning allocation. Male and Hulhumale are direct official values. Addu and Other atolls use category-specific heuristics: smaller islands receive relatively more motor cycles and battery scooters, while cars, jeeps, buses, pick-ups, lorries, vans and other service vehicles receive stronger land-area weighting.
- `vehicle-registration-manifest.json`: source, checksum, assumptions and validation metadata.
- `vehicle-category-size-reweighting-20261021.json`: category-specific size reweighting report and total checks.
- `vehicles-by-island-category.population-only-20261021.csv`: backup of the previous population-only allocation.
- `vehicles-by-island-category.population-area-blend-20261021.csv`: age-aware population/area allocation using a legal driving-age and reduced elderly-use adjustment.
- `vehicle-age-area-reweighting-20261021.json`: age assumptions, allocation logic and total checks.
- `vehicles-by-island-category.population-area-blend.previous-20261021.csv`: backup of the previous non-age-adjusted population-plus-area allocation.

## Important limitation

The source does **not** publish a vehicle registry for every island. The island-level rows for Addu and Other atolls are estimates, not observed island registrations. They distribute the published locality totals across inhabited islands using project population, land-area, category-specific, smaller-island, and (for the imported age-aware blend) driver-pool assumptions. Resort, industrial, uninhabited and zero-population island registrations are not identified.

Battery-scooter rows are carried as a separate category so the scoring model
can apply its zero modeled tailpipe-pollution factor; this does not represent
zero electricity or lifecycle emissions.

Data preparation does not execute the application migration or import. The
backend provides the `vehicle_count` table and
`pnpm db:import:vehicle-counts` command. The checked-in local database has
been migrated and populated separately with 1,900 island-category rows;
deployment databases still require the migration and import command.
