#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACCOUNTA_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PCF_ROOT="${PCF_ROOT:-${ACCOUNTA_ROOT}/../private-cloud-federation}"
DEPLOY_SCRIPT="${PCF_ROOT}/deploy/nomad/scripts/deploy_accounta.sh"

if [[ ! -x "${DEPLOY_SCRIPT}" ]]; then
  echo "Nomad deploy script not found or not executable: ${DEPLOY_SCRIPT}" >&2
  echo "Set PCF_ROOT to your private-cloud-federation checkout." >&2
  exit 1
fi

ACCOUNTA_REPO="${ACCOUNTA_ROOT}" exec "${DEPLOY_SCRIPT}" "$@"
