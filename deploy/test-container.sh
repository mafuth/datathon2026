#!/usr/bin/env bash
set -euo pipefail

: "${DATATHON_IMAGE:?Set the built image reference}"
: "${SOURCE_REVISION:?Set the source revision}"
APP_BASE_PATH=${APP_BASE_PATH:-/apps/datathon}
work=$(mktemp -d)
container="datathon2026-smoke-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-0}"
cleanup() {
  docker rm -f "$container" > /dev/null 2>&1 || true
  sudo rm -rf -- "$work"
}
trap cleanup EXIT

mkdir "$work/database"
# Make a consistent disposable snapshot; never mount or write the checkout DB.
python3 - "$PWD/local.db" "$work/database/local.db" <<'PY'
import pathlib, sqlite3, sys
source = pathlib.Path(sys.argv[1]).resolve()
with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as origin:
    with sqlite3.connect(sys.argv[2]) as target:
        origin.backup(target)
PY
sudo chown -R 1000:1000 "$work/database"

docker run --detach --name "$container" --init \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --network none \
  --mount "type=bind,src=$work/database,dst=/app/data/runtime" \
  --env DATABASE_URL=file:/app/data/runtime/local.db \
  --env BETTER_AUTH_SECRET=ci-only-container-placeholder-not-a-production-secret \
  --env "BETTER_AUTH_URL=http://localhost:3000$APP_BASE_PATH" \
  --env "PUBLIC_BASE_URL=http://localhost:3000$APP_BASE_PATH" \
  --env ORIGIN=http://localhost:3000 \
  --env "APP_BASE_PATH=$APP_BASE_PATH" \
  --env "HEALTHCHECK_PATH=$APP_BASE_PATH/api/health" \
  --env "DATATHON_REVISION=$SOURCE_REVISION" \
  "$DATATHON_IMAGE" > /dev/null

healthy=false
for attempt in $(seq 1 60); do
  if [[ $(docker inspect --format '{{.State.Health.Status}}' "$container") == healthy ]]; then
    healthy=true
    break
  fi
  if [[ $(docker inspect --format '{{.State.Running}}' "$container") != true ]]; then
    echo 'The production container exited during startup.' >&2
    exit 1
  fi
  sleep 2
done
[[ "$healthy" == true ]] || { echo 'The production container did not become healthy.' >&2; exit 1; }

docker exec "$container" node --input-type=module -e '
  const base = "http://127.0.0.1:3000" + process.env.APP_BASE_PATH;
  const health = await fetch(base + "/api/health");
  const data = await health.json();
  if (!health.ok || data.status !== "ok" || data.revision !== process.env.DATATHON_REVISION) process.exit(1);
  const page = await fetch(base + "/");
  if (!page.ok || !(await page.text()).includes("<html")) process.exit(1);
  const { access, writeFile, unlink } = await import("node:fs/promises");
  await access("data/mobility/normalized/current-db-baseline.json");
  await access("data/mobility/derived/presentation_story_jorny.json");
  await writeFile("data/runtime/.smoke-write", "ok");
  await unlink("data/runtime/.smoke-write");
'
echo 'Production container, seeded database, static data and writable database directory passed the smoke check.'
