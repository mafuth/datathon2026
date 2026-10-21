# Vehicle registration preparation

This directory contains a category-wise vehicle-registration dataset prepared from MBS Statistical Yearbook 2024 Table 11.6. The table reports registrations at four published locality groups: Male, Hulhumale, Addu and Other atolls.

## Files

- `vehicle-registration-official-locality-2018.csv`: official published locality totals.
- `vehicles-by-island-category.csv`: island-level planning allocation. Male and Hulhumale are direct official values; Addu and Other atolls are population-proportional estimates rounded with largest remainder.
- `vehicle-registration-manifest.json`: source, checksum, assumptions and validation metadata.

## Important limitation

The source does **not** publish a vehicle registry for every island. The island-level rows for Addu and Other atolls are estimates, not observed island registrations. They use the existing project population table (`age_category=total`) only to distribute the published locality totals across inhabited islands. Resort, industrial, uninhabited and zero-population island registrations are not identified.

No application database table, migration, model, endpoint or production score was changed.
