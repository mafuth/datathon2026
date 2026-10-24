#!/usr/bin/env bash
# One-time administrative setup. GitHub Actions never invokes this installer.
set -euo pipefail
umask 077

[[ $EUID -eq 0 ]] || { echo 'Run this one-time installer with sudo.' >&2; exit 1; }
[[ $# -eq 3 ]] || { echo 'Usage: sudo bash deploy/install-server.sh EXISTING_USER /path/to/actions-key.pub /path/to/initial-local.db' >&2; exit 1; }
app_root=/opt/datathon2026
account=$1
public_key_file=$2
seed_database=$3
[[ "$account" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]] || exit 1
[[ -f "$public_key_file" && ! -L "$public_key_file" ]] || { echo 'Supply a regular Ed25519 public-key file.' >&2; exit 1; }
getent passwd "$account" > /dev/null || { echo 'The named server account must already exist.' >&2; exit 1; }
[[ -x /usr/bin/python3 && -x /usr/bin/docker ]] || { echo 'Install Python 3 and Docker Engine first.' >&2; exit 1; }
compose_version=$(/usr/bin/docker compose version --short)
if [[ ! "$compose_version" =~ ^v?([0-9]+)\.([0-9]+)(\.[0-9]+)?([+-].*)?$ ]] ||
   ! (( 10#${BASH_REMATCH[1]:-0} > 2 || (10#${BASH_REMATCH[1]:-0} == 2 && 10#${BASH_REMATCH[2]:-0} >= 20) )); then
  echo 'Docker Compose 2.20 or later is required for health-checked deployments.' >&2
  exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
key=$(cat -- "$public_key_file")
key=${key%$'\r'}
[[ $(wc -l < "$public_key_file") -le 1 && "$key" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ [a-zA-Z0-9@._-]+)?$ ]] || { echo 'Supply one plain Ed25519 public key, not a private key or authorized_keys options.' >&2; exit 1; }
key_data=$(printf '%s' "$key" | awk '{print $2}')

protected_directory() {
  local directory=$1
  [[ ! -L "$directory" ]] || { echo 'Symlinked deployment paths are forbidden.' >&2; exit 1; }
  if [[ -e "$directory" ]]; then
    [[ -d "$directory" && $(stat -c %u "$directory") == 0 ]] || { echo 'Deployment parents must be root-owned directories.' >&2; exit 1; }
    (( (8#$(stat -c %a "$directory") & 0022) == 0 )) || { echo 'Deployment parents must not be group/world writable.' >&2; exit 1; }
  fi
}
for directory in / /opt "$app_root" "$app_root/control"; do
  protected_directory "$directory"
done
if [[ -d "$app_root" && -n "$(ls -A -- "$app_root")" ]]; then
  marker="$app_root/control/INSTALLATION"
  [[ -f "$marker" && ! -L "$marker" && $(stat -c %u "$marker") == 0 ]] || { echo 'The destination belongs to another installation. Do not reuse it.' >&2; exit 1; }
  (( (8#$(stat -c %a "$marker") & 0022) == 0 )) || exit 1
  [[ $(cat -- "$marker") == datathon2026-install-v1 ]] || { echo 'The installation marker differs; review it manually.' >&2; exit 1; }
  for file in "$app_root/control/"*; do
    [[ -f "$file" && ! -L "$file" && $(stat -c %u "$file") == 0 ]] || { echo 'Unsafe existing deployment control file.' >&2; exit 1; }
    (( (8#$(stat -c %a "$file") & 0022) == 0 )) || exit 1
  done
fi

# Mark this protected destination before seed work so an interrupted first setup
# can safely resume without adopting a foreign application's existing directory.
install -d -o root -g root -m 0755 "$app_root" "$app_root/control"
printf 'datathon2026-install-v1\n' > "$app_root/control/INSTALLATION"
chmod 0644 "$app_root/control/INSTALLATION"

# Never overwrite an existing database. The entire directory is mounted so that
# SQLite journal/WAL files remain writable and persist together with local.db.
APP_ROOT="$app_root" SEED_DATABASE="$seed_database" /usr/bin/python3 -I - <<'PY'
import os, pathlib, sqlite3, stat, tempfile
root = pathlib.Path(os.environ['APP_ROOT'])
data = root / 'data'
database = data / 'local.db'
if data.exists() or data.is_symlink():
    info = data.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 1000 or info.st_mode & 0o077:
        raise SystemExit('Existing database directory must be a private regular directory owned by UID 1000.')
if database.exists() or database.is_symlink():
    info = database.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 1000 or info.st_mode & 0o077:
        raise SystemExit('Existing database must be a private regular file owned by UID 1000.')
    print('Preserving the existing database; the seed argument is not imported again.')
else:
    seed = pathlib.Path(os.environ['SEED_DATABASE']).absolute()
    if seed.is_symlink() or not seed.is_file():
        raise SystemExit('For initial installation, supply a regular populated SQLite database.')
    try:
        with sqlite3.connect(seed.as_uri() + '?mode=ro', uri=True) as source:
            if source.execute('PRAGMA quick_check').fetchone() != ('ok',):
                raise ValueError('integrity')
            if source.execute('SELECT id FROM island LIMIT 1').fetchone() is None:
                raise ValueError('baseline')
            source.execute('SELECT id FROM user LIMIT 1')
            source.execute('SELECT id FROM session LIMIT 1')
            root.mkdir(mode=0o755, exist_ok=True)
            data.mkdir(mode=0o700, exist_ok=True)
            os.chown(data, 1000, 1000)
            # Root must never open/chown a staging entry in a UID-1000-writable directory.
            with tempfile.TemporaryDirectory(prefix='.initial-', dir=root) as staging:
                temporary = pathlib.Path(staging) / 'snapshot.db'
                # SQLite backup includes committed WAL data; a raw file copy may lose it.
                with sqlite3.connect(temporary) as target:
                    source.backup(target)
                    target.execute('PRAGMA journal_mode=DELETE')
                os.chmod(temporary, 0o600)
                os.chown(temporary, 1000, 1000)
                # Atomic no-overwrite publication also refuses a file/symlink appearing mid-setup.
                try:
                    os.link(temporary, database, follow_symlinks=False)
                except FileExistsError:
                    raise SystemExit('The database appeared during setup; inspect it before retrying.') from None
    except (sqlite3.Error, ValueError):
        raise SystemExit('The initial SQLite seed must be valid, contain islands, and include user/session tables.') from None
PY

install -o root -g root -m 0755 "$script_dir/server/deploy.py" "$app_root/control/deploy.py"
install -o root -g root -m 0644 "$script_dir/server/compose.yaml" "$app_root/control/compose.yaml"

APP_ROOT="$app_root" /usr/bin/python3 -I - <<'PY'
import os, pathlib, secrets, stat
path = pathlib.Path(os.environ['APP_ROOT']) / 'control/app.env'
if not path.exists() and not path.is_symlink():
    with path.open('x') as stream:
        stream.write(
            '# Application URL includes its mount path; ORIGIN is the HTTPS host only.\n'
            'PUBLIC_BASE_URL=https://yoosufsayyid.com/apps/datathon\n'
            'BETTER_AUTH_URL=https://yoosufsayyid.com/apps/datathon\n'
            'ORIGIN=https://yoosufsayyid.com\n'
            f'BETTER_AUTH_SECRET={secrets.token_hex(32)}\n'
            'DATABASE_AUTH_TOKEN=\nGOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\n'
            'R2_ACCOUNT_ID=\nR2_ACCESS_KEY_ID=\nR2_SECRET_ACCESS_KEY=\n'
            'RESEND_API_KEY=\nEMAIL_SENDER=\n'
        )
    path.chmod(0o600)
info = path.lstat()
if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
    raise SystemExit('app.env must be a root-owned regular file with mode 0600.')
PY

# Inspect the installed tree before granting the dedicated key its fixed operation.
APP_ROOT="$app_root" /usr/bin/python3 -I - <<'PY'
import os, pathlib, runpy
control = pathlib.Path(os.environ['APP_ROOT']) / 'control'
gateway = runpy.run_path(str(control / 'deploy.py'))
gateway['secure_layout'](control)
PY

if [[ "$account" == root ]]; then
  forced="/usr/bin/python3 -I $app_root/control/deploy.py"
else
  [[ -x /usr/bin/sudo ]] || { echo 'sudo is required for a non-root existing account.' >&2; exit 1; }
  forced="/usr/bin/sudo -n /usr/bin/python3 -I $app_root/control/deploy.py"
  sudo_file=$(mktemp)
  trap 'rm -f -- "$sudo_file"' EXIT
  printf '%s ALL=(root) NOPASSWD: /usr/bin/python3 -I %s/control/deploy.py\n' "$account" "$app_root" > "$sudo_file"
  /usr/sbin/visudo -cf "$sudo_file" > /dev/null
  [[ ! -L /etc/sudoers.d/datathon2026-deploy ]] || { echo 'The sudo rule must not be a symlink.' >&2; exit 1; }
  if [[ -e /etc/sudoers.d/datathon2026-deploy ]] && ! cmp -s "$sudo_file" /etc/sudoers.d/datathon2026-deploy; then
    echo 'An existing Datathon 2026 sudo rule differs. Review it manually before replacing it.' >&2
    exit 1
  fi
  install -o root -g root -m 0440 "$sudo_file" /etc/sudoers.d/datathon2026-deploy
fi

account_home=$(getent passwd "$account" | cut -d: -f6)
account_group=$(id -gn "$account")
[[ -d "$account_home" && ! -L "$account_home/.ssh" && ! -L "$account_home/.ssh/authorized_keys" ]] || { echo 'Unsafe SSH account paths.' >&2; exit 1; }
if [[ ! -d "$account_home/.ssh" ]]; then
  install -d -o "$account" -g "$account_group" -m 0700 "$account_home/.ssh"
fi
authorized="$account_home/.ssh/authorized_keys"
[[ ! -e "$authorized" || -f "$authorized" ]] || exit 1
line="restrict,command=\"$forced\" $key"
if [[ -f "$authorized" ]] && grep -Fq -- "$key_data" "$authorized"; then
  grep -Fxq -- "$line" "$authorized" || { echo 'This key already exists with different restrictions; review it manually.' >&2; exit 1; }
else
  if [[ -f "$authorized" ]]; then
    install -o root -g root -m 0600 "$authorized" "$app_root/control/authorized_keys.before-install"
  fi
  printf '\n%s\n' "$line" >> "$authorized"
  chown "$account:$account_group" "$authorized"
  chmod 0600 "$authorized"
fi
echo 'Installed protected Datathon 2026 control at /opt/datathon2026/control.'
echo 'Edit control/app.env for the real domain, install the HTTPS route, then enable DATATHON_DEPLOY_ENABLED.'
echo 'No account was created, no Docker group membership was granted, and no app or migration was started.'
