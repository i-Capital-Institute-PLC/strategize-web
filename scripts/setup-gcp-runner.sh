#!/usr/bin/env bash
# Installs a GitHub Actions self-hosted runner on the GCP VM so that every push
# to main / new-update runs .github/workflows/deploy.yml directly on the server.
#
# Run ON THE GCP VM (Ubuntu/Debian), as a user with sudo:
#   gcloud compute ssh <vm-name> --zone <zone>
#   bash setup-gcp-runner.sh <repo-url> <registration-token>
#
# Get the registration token from GitHub:
#   Repo -> Settings -> Actions -> Runners -> New self-hosted runner (copy the --token value)
# or:
#   gh api -X POST repos/<owner>/<repo>/actions/runners/registration-token --jq .token
# The token expires after 1 hour.

set -euo pipefail

REPO_URL="${1:?usage: $0 <repo-url> <registration-token>}"
REG_TOKEN="${2:?usage: $0 <repo-url> <registration-token>}"
RUNNER_USER="${RUNNER_USER:-github-runner}"
RUNNER_DIR="${RUNNER_DIR:-/opt/actions-runner-strategize-web}"
RUNNER_NAME="${RUNNER_NAME:-gcp-$(hostname)-strategize-web}"
RUNNER_LABELS="${RUNNER_LABELS:-gcp}"

echo "==> Installing system packages (docker, curl, psmisc for fuser)"
# Don't abort if an unrelated, outdated apt source fails to refresh
sudo apt-get update -y || echo "WARN: apt-get update had errors; continuing with cached package lists"
sudo apt-get install -y curl tar psmisc ca-certificates || echo "WARN: some packages could not be installed; continuing"
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get install -y docker.io
  sudo systemctl enable --now docker
fi

echo "==> Creating runner user '${RUNNER_USER}'"
if ! id "${RUNNER_USER}" >/dev/null 2>&1; then
  sudo useradd --create-home --shell /bin/bash "${RUNNER_USER}"
fi
sudo usermod -aG docker "${RUNNER_USER}"

# deploy.yml runs `sudo fuser -k 4410/tcp`; allow only that without a password
FUSER_BIN="$(command -v fuser)"
echo "${RUNNER_USER} ALL=(root) NOPASSWD: ${FUSER_BIN}" | sudo tee /etc/sudoers.d/${RUNNER_USER}-fuser >/dev/null
sudo chmod 440 /etc/sudoers.d/${RUNNER_USER}-fuser
sudo visudo -cf /etc/sudoers.d/${RUNNER_USER}-fuser

echo "==> Downloading latest actions/runner release"
ARCH="$(uname -m)"
case "${ARCH}" in
  x86_64) RUNNER_ARCH=x64 ;;
  aarch64) RUNNER_ARCH=arm64 ;;
  *) echo "Unsupported arch ${ARCH}"; exit 1 ;;
esac
VERSION="$(curl -fsSLI -o /dev/null -w "%{url_effective}" https://github.com/actions/runner/releases/latest | sed "s|.*/tag/v||")"
TARBALL="actions-runner-linux-${RUNNER_ARCH}-${VERSION}.tar.gz"

sudo mkdir -p "${RUNNER_DIR}"
sudo chown "${RUNNER_USER}:${RUNNER_USER}" "${RUNNER_DIR}"
sudo -u "${RUNNER_USER}" bash -c "cd '${RUNNER_DIR}' && \
  curl -fsSL -o '${TARBALL}' 'https://github.com/actions/runner/releases/download/v${VERSION}/${TARBALL}' && \
  tar xzf '${TARBALL}' && rm -f '${TARBALL}'"
sudo "${RUNNER_DIR}/bin/installdependencies.sh" || echo "WARN: installdependencies.sh had errors; continuing (deps are usually already present)"

echo "==> Registering runner '${RUNNER_NAME}' with labels: self-hosted, linux, ${RUNNER_LABELS}"
sudo -u "${RUNNER_USER}" bash -c "cd '${RUNNER_DIR}' && ./config.sh --unattended --replace \
  --url '${REPO_URL}' --token '${REG_TOKEN}' \
  --name '${RUNNER_NAME}' --labels '${RUNNER_LABELS}' --work _work"

echo "==> Installing runner as a systemd service (starts on boot)"
cd "${RUNNER_DIR}"
sudo ./svc.sh install "${RUNNER_USER}"
sudo ./svc.sh start
sudo ./svc.sh status --no-pager || true

echo
echo "Done. The runner should now show as 'Idle' under Repo -> Settings -> Actions -> Runners."
echo "Push to main/new-update (or use 'Run workflow' in the Actions tab) to deploy."
