#!/bin/sh
set -eu
set -f

REPOSITORY_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export AMI_SECRET=${AMI_SECRET:-synthetic-compose-policy-ami-secret}
export PBX_MASTER_KEY=${PBX_MASTER_KEY:-BgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgY=}
export ACCEPTANCE_ADMIN_PASSWORD=${ACCEPTANCE_ADMIN_PASSWORD:-SyntheticComposePolicy-2026!}

check_model() {
  project=$1
  expected_count=$2
  shift 2

  images=$(COMPOSE_PROJECT_NAME="$project" docker compose "$@" config --images)
  set -- $images
  if [ "$#" -ne "$expected_count" ]; then
    printf 'Expected %s images for %s, found %s.\n' "$expected_count" "$project" "$#" >&2
    exit 1
  fi

  for image do
    case "$image" in
      "$project"-*:latest)
        printf 'Implicit or explicit latest tag is forbidden: %s\n' "$image" >&2
        exit 1
        ;;
      "$project"-*:*)
        ;;
      *)
        printf 'Image is not explicitly tagged in the isolated project namespace: %s\n' "$image" >&2
        exit 1
        ;;
    esac
  done
}

cd "$REPOSITORY_ROOT"
check_model essentials-calls-image-policy 3 -f docker-compose.yml
check_model essentials-calls-acceptance-image-policy 4 \
  -f docker-compose.yml -f docker-compose.acceptance.yml --profile acceptance

printf 'Compose image policy passed: all build outputs have explicit, project-isolated non-latest tags.\n'
