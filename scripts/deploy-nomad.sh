#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACCOUNTA_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-ghcr.io/loyyd/accounta}"
JOB_FILE="${ACCOUNTA_ROOT}/deploy/nomad/accounta.nomad.hcl"

if ! command -v nomad >/dev/null 2>&1; then
  echo "nomad CLI not found in PATH" >&2
  exit 1
fi

image_arg="${1:-}"

if [[ -z "${image_arg}" ]]; then
  full_sha="$(git -C "${ACCOUNTA_ROOT}" rev-parse HEAD)"
  image_arg="${full_sha:0:7}"
fi

case "${image_arg}" in
  ghcr.io/*|*@sha256:*)
    image_ref="${image_arg}"
    ;;
  *)
    image_ref="${IMAGE_NAME}:${image_arg}"
    ;;
esac

if [[ "${image_ref}" != *@sha256:* ]] && command -v docker >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
  digest="$(
    docker buildx imagetools inspect "${image_ref}" --format '{{json .Manifest}}' 2>/dev/null \
      | jq -r '.digest // empty' 2>/dev/null || true
  )"

  if [[ "${digest}" == sha256:* ]]; then
    image_ref="${image_ref}@${digest}"
  fi
fi

echo "Deploying ${image_ref}"
exec nomad job run -var="accounta_image=${image_ref}" "${JOB_FILE}"
