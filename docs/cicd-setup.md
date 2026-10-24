# Datathon deployment and GitHub setup

This guide covers the `mafuth/datathon2026` deployment on `169.58.6.224` and the GitHub settings needed for subsequent automatic deployments. The application replaces the earlier Datathon containers while keeping the existing public address, HTTPS certificate and host port.

The working copy is `/Users/yoosufsayyid/Personal/Projects/datathon`. Private key material and the exact secrets handoff are stored separately in `/Users/yoosufsayyid/Personal/Projects/datathon-secrets`; they do not belong in this repository or in this document.

The replacement was live and healthy on 24 October 2026 at 09:39 Maldives time. Its image was built directly from the local working copy. Source changes remain uncommitted and unpushed, and GitHub settings have not been changed. Configure the fields below and publish the source before expecting Actions to build or deploy subsequent changes.

The server production build and HTTP checks passed, including the public map API returning 189 features. Local test suites were not run; the configured CI suites will run after the source is pushed.

## 1 Deployment details

| Setting | Exact value |
| --- | --- |
| Repository | `mafuth/datathon2026` |
| Public application | `https://yoosufsayyid.com/apps/datathon` |
| Public origin | `https://yoosufsayyid.com` |
| Application base path | `/apps/datathon` |
| SSH connection | `yoosuf@169.58.6.224`, port `22` |
| Host application listener | `127.0.0.1:18730` |
| Image repository | `ghcr.io/mafuth/datathon2026` |
| Compose project and service | `datathon2026` and `mobilix` |
| Healthy server container | `datathon2026-mobilix-1` |
| Protected server controls | `/opt/datathon2026/control` |
| Runtime environment | `/opt/datathon2026/control/app.env` |
| Persistent database | `/opt/datathon2026/data/local.db` |
| Container database path | `/app/data/runtime/local.db` |
| Previous server project | `/srv/apps/datathon` |
| Deployment receipt | `/opt/datathon2026/control/deployment-receipt.json` |

The previous `datathon-frontend-1` and `datathon-backend-1` containers have been removed. The replacement is one Node application with its own SQLite data directory. The existing Nginx route continues forwarding `/apps/datathon` to port `18730`. Public and local health checks reported `status: ok`, and the public page identified the new application as MobiliX.

The workflow at `.github/workflows/cicd.yml` is named **Test and deploy Datathon 2026**. It follows the reference repository's GitHub Actions, GHCR and restricted SSH pattern. Each deployment selects an immutable image digest and checks the application's reported Git revision.

## 2 Exact GitHub settings

Open [the repository settings](https://github.com/mafuth/datathon2026/settings). All GitHub fields in this guide are configured at repository level under Secrets and variables → Actions. The workflow's `production` environment can use these repository settings. Public build settings must be repository variables because the image job does not use the production environment.

On the Variables tab, configure these public build and deployment variables:

| Repository variable | Value |
| --- | --- |
| `PUBLIC_BASE_URL` | `https://yoosufsayyid.com/apps/datathon` without a trailing slash |
| `PUBLIC_APP_NAME` | `MobiliX` |
| `PUBLIC_R2_BUCKET_NAME` | Your R2 bucket name; leave unset if uploads are unused |
| `PUBLIC_R2_BUCKET_URL` | Your public R2 bucket or custom-domain URL; leave unset if unused |
| `DATATHON_DEPLOY_ENABLED` | `true` when server preparation is complete; `false` pauses automatic deployment |

The workflow already passes `PUBLIC_BASE_PATH=/apps/datathon` as a fixed Docker build argument. You do not need a GitHub variable with that name.

Under the same repository Actions settings, add the connection variables on the Variables tab and the two private values on the Secrets tab:

| Name | Type | Exact value or source |
| --- | --- | --- |
| `DATATHON_SSH_HOST` | Variable | `169.58.6.224` |
| `DATATHON_SSH_USER` | Variable | `yoosuf` |
| `DATATHON_SSH_PORT` | Variable | `22` |
| `DATATHON_SSH_PRIVATE_KEY` | Secret | Complete contents of `datathon-secrets/DATATHON_SSH_PRIVATE_KEY` |
| `DATATHON_SSH_KNOWN_HOSTS` | Secret | Complete contents of `datathon-secrets/DATATHON_SSH_KNOWN_HOSTS` |

Paste each secret exactly, preserving the private key's BEGIN and END lines and real line breaks. Store the private key and known-hosts line as two separate GitHub secrets. Do not paste the public key into the private-key secret.

The GitHub runner must be able to reach `169.58.6.224:22`. If server firewall rules restrict SSH to a private network or a fixed administrator address, provide an appropriately connected runner or approved network access for Actions.

The exact private handoff is `GITHUB-SECRETS.md` inside `/Users/yoosufsayyid/Personal/Projects/datathon-secrets`. It contains the two GitHub secret values, the public key for reference and the server authentication secret for recovery. The separate files named after the two GitHub secrets provide copyable values without the surrounding handoff text.

The server's `BETTER_AUTH_SECRET` stays in the protected server environment. It is included in the private recovery handoff so you can retain it; the workflow does not need it as a GitHub secret. R2, Google and email credentials also remain server runtime settings.

Do not create a `GITHUB_TOKEN` secret or a long-lived Docker password. GitHub supplies the token automatically. The image job has `packages: write`; the deployment job has `packages: read`. The deployment gateway receives the temporary registry token through SSH standard input and discards its temporary Docker login configuration afterward. See [GitHub's registry authentication guide](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

If the package already exists in GHCR, its package settings must grant Actions access to `mafuth/datathon2026`. The workflow references a `production` environment; when available, restrict that environment's deployment branches to `main`. The repository-level fields above do not need to be duplicated there. If your private repository's GitHub plan does not support environments, remove the deploy job's `environment` mapping while retaining its `main` and deployment-enable conditions. See [GitHub's environment availability](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

## 3 Deployment key and server identity

The dedicated Actions key was created on the server at `/home/yoosuf/.ssh/datathon2026_actions`; its public key is `/home/yoosuf/.ssh/datathon2026_actions.pub`. The public key is installed for the existing `yoosuf` account with a forced deployment command. The key can invoke the fixed gateway; it cannot open an interactive shell, upload files, forward SSH connections or run general Docker commands. Keep using your existing administrator key for server maintenance.

The protected handoff folder on your computer is outside the repository and must remain mode `0700`; files containing private material must remain mode `0600`. The local public-key copy is `datathon-secrets/datathon2026_actions.pub`. Do not attach the handoff to an issue, commit it, or paste its full contents into a shared document. Copy only the specific values into their corresponding GitHub secret fields.

The `DATATHON_SSH_KNOWN_HOSTS` entry is taken from the server host key through the trusted administrator connection. If the server is rebuilt or its host key changes, obtain the new SHA256 fingerprint through the provider console or an independently trusted connection before changing the GitHub secret. `ssh-keyscan` alone does not verify the identity of a server.

To rotate the Actions key later, generate a new dedicated Ed25519 key on the server, install its public key through the reviewed installer, update the GitHub private-key secret, complete a successful deployment, then remove the old restricted public key through your administrator connection. Keep your normal administrator key separate.

## 4 Server environment and persistent data

The server uses Docker Compose 2.20 or later, Python 3 and the existing HTTPS reverse proxy. The application runs as UID `1000`, with a read-only container filesystem and a writable database directory. Control files are root-owned; `app.env` is root-owned mode `0600`. The database directory is mode `0700` and its SQLite file is mode `0600`, owned by UID `1000`.

| Runtime setting | Exact value or source |
| --- | --- |
| `PUBLIC_BASE_URL` | `https://yoosufsayyid.com/apps/datathon` |
| `BETTER_AUTH_URL` | `https://yoosufsayyid.com/apps/datathon` |
| `ORIGIN` | `https://yoosufsayyid.com` with no application path |
| `BETTER_AUTH_SECRET` | Generated secret already stored in `app.env` and the private recovery handoff |
| `DATABASE_URL` | `file:/app/data/runtime/local.db`, set by Compose |
| `DATABASE_AUTH_TOKEN` | Empty for local SQLite |
| `MOBILITY_API_DELAY_MS` | `0`, set by production Compose |
| `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` | Optional Google sign-in credentials |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Optional R2 upload credentials |
| `RESEND_API_KEY` and `EMAIL_SENDER` | Email credentials and a verified sender |

Edit runtime settings through your normal administrator connection:

```bash
sudoedit /opt/datathon2026/control/app.env
sudo chown root:root /opt/datathon2026/control/app.env
sudo chmod 600 /opt/datathon2026/control/app.env
```

Use actual `KEY=value` entries. Compose interprets unquoted and double-quoted values; single-quote literal values containing `$`, `#` or spaces, for example `EMAIL_SENDER='MobiliX <accounts@your-domain.example>'`. Follow [Docker's environment-file rules](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/) for values containing quotes or backslashes.

Keep the generated authentication secret stable between deployments. Rotating it can invalidate sessions or other authentication state. Public `PUBLIC_` values are visible to users and are compiled into the image; they must never contain private keys. Changing the base path, public URL, application name or public bucket settings requires a new image build.

### Database installation and backups

The first installation uses a consistent snapshot of the repository's populated SQLite database. The installer validates database integrity, a nonempty `island` table and the `user` and `session` tables. It copies the seed only when the new production database is absent. Routine deployments and repeated installation preserve existing production data and do not rerun seeds or migrations.

For a future reinstallation, make a fresh snapshot before transfer rather than copying a database file while a writer may have an active WAL:

```bash
umask 077
sqlite3 local.db ".backup '/tmp/datathon2026-seed.db'"
chmod 600 /tmp/datathon2026-seed.db
```

Review seed contents before using them in production: the repository database may include users and sessions as well as mobility data. The one-time installer takes three arguments: the existing server account, the dedicated public-key file, and the initial SQLite seed:

```bash
sudo bash deploy/install-server.sh yoosuf /path/to/actions-key.pub /path/to/datathon2026-seed.db
```

Use your normal administrator connection for installation. The Actions key cannot upload installer files or open a shell.

Back up the live production database using SQLite's backup API, and keep an encrypted copy off the server:

```bash
sudo install -d -o root -g root -m 700 /var/backups/datathon2026
sudo sqlite3 /opt/datathon2026/data/local.db ".backup '/var/backups/datathon2026/local-before-change.db'"
sudo chmod 600 /var/backups/datathon2026/local-before-change.db
```

Choose a new filename for each backup. The pipeline does not install a backup schedule or retention policy. Back up `app.env` separately in encrypted storage. Database migrations, `db:push`, `db:clear` and data imports are separate reviewed administrator operations.

## 5 Existing route and first replacement

The public route and HTTPS certificate already exist. Keep the current Nginx server block and the `/apps/datathon` prefix. The replacement listens on the same loopback port `18730`; no new domain, certificate or public application port is needed.

The Datathon locations need larger proxy-header buffers for SvelteKit's preload Link headers. Keep these settings inside the two Datathon location blocks, as shown in `deploy/nginx.conf`:

```nginx
proxy_buffer_size 64k;
proxy_buffers 8 64k;
proxy_busy_buffers_size 128k;
```

The original Datathon proxy snippet is backed up at `/var/backups/datathon-proxy-20261024/datathon.conf.before`. Certificate settings and unrelated applications do not need changes for this replacement.

The old `/srv/apps/datathon` project was archived to `/var/backups/datathon-replaced-20261024T043930Z/previous-project`. Its old environment files, authorized-key backup and administrator rule are retained in the same protected backup folder. The old dedicated deployment key and administrator rule were disabled, and the old frontend and backend containers were removed. Unrelated applications and the host HTTPS service remain in place.

The initial replacement is built directly on the server, while you configure GitHub separately. Its immutable local image ID and source revision are recorded in the protected `/opt/datathon2026/control/manual-release.env` baseline. The first Actions deployment can roll back to that locally built new-app image if its health check fails. After the first successful Actions deployment, `/opt/datathon2026/control/release.env` records the registry image and becomes the active release state. The manual baseline remains as deployment history.

The new gateway cannot automatically restore the old two-container application during the initial replacement. That application is not its previous release. First-cutover recovery uses the separately preserved old deployment; later failed replacement health checks restore the previous new-app image.

The initial manual deployment reports Git revision `72ffba0935b0007dae636934211c9a6725a69775`. That is the checkout's baseline revision; the deployed image also includes the local changes prepared for this setup. Future CI releases will identify their pushed commit. The exact initial image ID and deployment state are recorded in the server deployment receipt.

## 6 Publish and activate the workflow

The CI/CD files must be committed and pushed before GitHub Actions can use them. Keep `DATATHON_DEPLOY_ENABLED=false` while publishing and checking the first workflow run. Review the changed paths and stage the deployment work explicitly, excluding environment files, private keys and SQLite snapshots:

```bash
git add .github/workflows/cicd.yml deploy Dockerfile .dockerignore .gitignore package.json vite.config.ts src README.md docs/cicd-setup.md
git diff --cached --name-only
git commit -m "Add CI/CD for the Datathon application"
git push origin main
```

Use your repository's branch and pull-request process when direct pushes to `main` are restricted. The protected secrets folder is outside the checkout and must remain there.

The standard workflow runs the application type check, unit tests and deployment gateway tests. It then builds and smoke-checks the production image. Manual input `full_checks=true` also runs lint and the existing browser regression suite. A failing required check blocks deployment. Pull requests do not publish production images or use the production SSH key.

After the workflow and exact GitHub settings are in place:

1. Confirm the new server controls, environment, data and dedicated public key are installed.
2. Set repository variable `DATATHON_DEPLOY_ENABLED=true`.
3. Open Actions → Test and deploy Datathon 2026 → Run workflow. Select `main` and enable the `deploy` input.
4. Check the run's deployment result. The public health response must report `status: ok` and the exact deployed commit revision.
5. Open `https://yoosufsayyid.com/apps/datathon` and check sign-in, navigation, the map and any configured email or upload features.

Future qualifying pushes to `main` deploy automatically after successful CI. Set `DATATHON_DEPLOY_ENABLED=false` to pause future deployments. This flag does not stop an application already running on the server.

## 7 Routine operations and rollback

Connect with your normal administrator key:

```bash
ssh yoosuf@169.58.6.224
```

Define a local helper in that server shell to address only the new application's Compose project:

```bash
app_compose() {
  local datathon_release_file=/opt/datathon2026/control/release.env
  sudo test -f "$datathon_release_file" || datathon_release_file=/opt/datathon2026/control/manual-release.env
  sudo docker compose --project-name datathon2026 \
    --project-directory /opt/datathon2026/control \
    --env-file "$datathon_release_file" \
    --file /opt/datathon2026/control/compose.yaml "$@"
}
app_compose ps
app_compose logs --tail 100 mobilix
curl --fail http://127.0.0.1:18730/apps/datathon/api/health
curl --fail https://yoosufsayyid.com/apps/datathon/api/health
```

Avoid sharing logs that contain personal data or provider responses. For an application regression after a successful deployment, revert the responsible application change on `main` and let the pipeline build and deploy a new image. Keep the previous known-good image available in GHCR and locally during incident recovery.

The gateway's automatic rollback preserves the database and restores the previous image when a local health check fails. It does not reverse database changes, external API side effects, Nginx, DNS or public network failures. There is a brief application restart during replacement. A public smoke-check failure after the local deployment needs an administrator to inspect the route and running release; it does not automatically restore the old public setup.

## 8 Optional service credentials

### Google sign in

Use a Google Web application OAuth client. The authorized JavaScript origin is `https://yoosufsayyid.com`. The application uses the Better Auth handler mounted under its application path:

```text
https://yoosufsayyid.com/apps/datathon/api/auth/callback/google
```

Configure that exact redirect URI and store the client ID and secret in the server's `app.env`. The base path belongs in the redirect URL, while the authorized origin has no path.

### Cloudflare R2

Create an R2 token with Object Read and Write permission limited to the application's bucket. Store the account ID, access-key ID and secret access key in `app.env`. Store the public bucket name and URL in the repository's public build variables.

Browser uploads use presigned PUT requests. Configure R2 CORS for the origin `https://yoosufsayyid.com`, with no `/apps/datathon` path:

```json
[
  {
    "AllowedOrigins": ["https://yoosufsayyid.com"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Use [Cloudflare's credential guide](https://developers.cloudflare.com/r2/api/tokens/) and [CORS guide](https://developers.cloudflare.com/r2/buckets/cors/) when configuring the bucket. Restrict public read access to assets intended to be public. Changing public bucket settings requires a new image build; rotating private credentials requires updating `app.env` and recreating the application container.

### Email

Verify your sending domain in Resend and configure the required DNS records. Set `RESEND_API_KEY` and a sender on that domain in `EMAIL_SENDER`. Password-reset email requires these settings. See the [Resend domain guide](https://resend.com/docs/dashboard/domains/introduction).

## 9 Troubleshooting

| Symptom | Check |
| --- | --- |
| Deploy job is skipped | `main` branch, `DATATHON_DEPLOY_ENABLED=true`, manual `deploy` input enabled and successful build |
| Missing public configuration | Public build values are repository variables rather than only environment variables |
| SSH authentication fails | Correct private-key block is in GitHub; its dedicated public key is installed for `yoosuf`; host and port are correct |
| SSH host-key failure | Known-hosts entry is for `169.58.6.224` port `22`; verify any changed fingerprint through the trusted server console |
| GHCR rejects the token | Package is linked to `mafuth/datathon2026` and grants the repository Actions access |
| Assets or links return 404 | Image was built for `/apps/datathon`; public URL, base path and Nginx prefix agree |
| Form or authentication origin error | `ORIGIN` is `https://yoosufsayyid.com`; application/auth URLs include `/apps/datathon` |
| Database cannot be opened | Production database exists and UID `1000` can write its mounted directory and journal files |
| Gateway refuses access | Control files and ancestors remain root-owned; `app.env` is mode `0600`; database directory permissions match the installer |
| Port is already in use on first cutover | Only the old Datathon frontend owning `18730` is stopped as part of the reviewed replacement |
| Local health works but public health fails | Existing Nginx route forwards the full prefix to `127.0.0.1:18730`; certificate and upstream are healthy |
| Nginx returns 502 with an oversized upstream header error | Datathon locations retain `proxy_buffer_size 64k`, `proxy_buffers 8 64k` and `proxy_busy_buffers_size 128k` for preload Link headers |
| Google rejects callback | Client has the exact HTTPS redirect URI including `/apps/datathon` |
| R2 upload fails in browser | Credentials are correct and CORS allows `https://yoosufsayyid.com`, without a path |
| Reset email fails | Resend domain is verified; runtime key and sender are configured |

The repository already tracks `.env` and SQLite snapshots. Ignore rules protect future untracked files but do not remove existing files or their history. Rotate real credentials previously committed, review database contents for personal data, and plan any shared-history cleanup separately.

## References

- [Target repository](https://github.com/mafuth/datathon2026)
- [Reference deployment pattern](https://github.com/lyashahid/datathon)
- [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [GitHub deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Compose environment-file syntax](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)
- [Cloudflare R2 credentials](https://developers.cloudflare.com/r2/api/tokens/)
- [Cloudflare R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [Resend sending domains](https://resend.com/docs/dashboard/domains/introduction)
