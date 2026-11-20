#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Habit Tracker — Idempotent Google Cloud Run Deployment Script
# ==============================================================================
# Usage:
#   DRY_RUN=1 bash deploy/deploy.sh [--demo]   (preview — default, safe)
#   DRY_RUN=0 bash deploy/deploy.sh [--demo]   (REAL deploy — see below)
#
# Environment Variables (Optional):
#   PROJECT_ID   GCP Project ID (defaults to active gcloud config project)
#   REGION       GCP Region (default: asia-southeast1)
#   DRY_RUN      Defaults to 1 (preview only, no gcloud/docker calls actually
#                run). A REAL deploy requires explicitly setting DRY_RUN=0,
#                AND must be run from the main branch — the script's own
#                guard below refuses to run otherwise.
#
# WHAT THIS SCRIPT DOES  (manual first deploy; safe to re-run)
#   The course portal/TA pre-provisions every cloud resource this app needs
#   (APIs enabled, Artifact Registry, the Cloud SQL instance and database,
#   the runtime service account and its IAM, and the Secret Manager secrets
#   — see "Resource names" in docs/labs/lab-05/deployment.md). This script
#   does NOT create or enable any of that. It only:
#     9  builds and pushes the image         (Artifact Registry)
#     10 updates and runs the migrate+seed job on that image
#     11 updates the Cloud Run service to that image, with its traffic
#   After this first deploy, routine releases are done by GitHub Actions
#   (deploy.yml -> deploy/release.sh), which updates the same two resources.
#
# ⭐ IMPORTANT
#   - Idempotent: existing resources/secrets are reused, never overwritten
#     (a re-run does not replace credentials).
#   - Passwords are generated with openssl and live only in Secret Manager;
#     they are never printed (run_cmd redacts --password=...).
#   - Preview first with:  DRY_RUN=1 bash deploy/deploy.sh   (no gcloud calls;
#     this is also the default if DRY_RUN is unset)
#   - Run from the REPO ROOT (step 9 builds the root Dockerfile).
#
# REFERENCES
#   - gcloud run deploy : https://cloud.google.com/sdk/gcloud/reference/run/deploy
#   - Cloud Run jobs    : https://cloud.google.com/run/docs/create-jobs
#   - Cloud SQL + Run   : https://cloud.google.com/sql/docs/postgres/connect-run
#   - Secret Manager    : https://cloud.google.com/secret-manager/docs
#   - Artifact Registry : https://cloud.google.com/artifact-registry/docs/docker
#
# ⭐ CHANGE ME — groups using another tech stack must review (marked below):
#   # CHANGE ME: resource names (REPO_NAME, SQL_INSTANCE, SERVICE_NAME, ...)
#   # CHANGE ME: database engine/version (steps 3, 4, 6)
#   # CHANGE ME: migrate/seed command of the Cloud Run job (step 10)
#   # CHANGE ME: port / memory / scaling flags (step 11)
# ==============================================================================

# ------------------------------------------------------------------------------
# Settings & argument parsing
# ------------------------------------------------------------------------------
DRY_RUN="${DRY_RUN:-1}"
# CHANGE ME: default region if your group uses another one.
REGION="${REGION:-asia-southeast1}"
SEED_DEMO_DATA="false"

for arg in "$@"; do
  case "$arg" in
    --demo)
      SEED_DEMO_DATA="true"
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--demo]" >&2
      exit 1
      ;;
  esac
done

# Helper: prints the command (DRY_RUN=1) or prints then executes it.
# ⭐ IMPORTANT: --password=... is redacted in the log; keep this behaviour.
run_cmd() {
  # Log the command without exposing generated database credentials.
  local arg
  if [ "$DRY_RUN" = "1" ]; then
    printf '[DRY_RUN] '
  else
    printf '+ '
  fi
  for arg in "$@"; do
    case "$arg" in
      --password=*) printf '%s ' '--password=<REDACTED>' ;;
      *) printf '%q ' "$arg" ;;
    esac
  done
  printf '\n'
  if [ "$DRY_RUN" != "1" ]; then
    "$@"
  fi
}

# Resolve the GCP project: $PROJECT_ID, else the active gcloud project.
# Shared course project: no project discovery or project IAM changes.
PROJECT_ID="${PROJECT_ID:-cpe-se-course-2026}"
[[ "$PROJECT_ID" == "cpe-se-course-2026" ]] || { echo 'Wrong course project' >&2; exit 1; }
REGION="${REGION:-asia-southeast1}"
[[ "$REGION" == "asia-southeast1" ]] || { echo 'Wrong assigned region' >&2; exit 1; }
REPO_NAME="s65da36e2"
SQL_INSTANCE="s65da36e2-pg"
DB_NAME="s65da36e2"
DB_USER="s65da36e2"
SERVICE_NAME="s65da36e2"
MIGRATE_JOB_NAME="s65da36e2-migrate"
SA_NAME="s65da36e2-runner"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
SQL_CONN_NAME="${PROJECT_ID}:${REGION}:${SQL_INSTANCE}"
if [ "$DRY_RUN" = "1" ]; then
  IMAGE_TAG="${IMAGE_TAG:-0000000000000000000000000000000000000000}"
else
  IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse HEAD)}"
  [[ "$(git branch --show-current)" == "main" ]] || { echo 'Deploy reviewed main only' >&2; exit 1; }
  [[ "$IMAGE_TAG" == "$(git rev-parse HEAD)" ]] || { echo 'IMAGE_TAG must match HEAD' >&2; exit 1; }
fi
[[ "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]] || { echo 'Use full commit SHA' >&2; exit 1; }
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:${IMAGE_TAG}"

# Secret Manager secret names (values are never stored in this repo).
SECRET_DB_URL="s65da36e2-database-url"
SECRET_ADMIN_PASS="s65da36e2-admin-password"
SECRET_DEMO_PASS="s65da36e2-demo-password"
# UNVERIFIED: confirm this secret exists in the course portal. Our app
# refuses to start without SESSION_SECRET (backend/src/lib/session.ts).
SECRET_SESSION="s65da36e2-app-secret-1"

GENERATED_ADMIN_PASSWORD=""
GENERATED_DEMO_PASSWORD=""

echo "=================================================================="
echo "Habit Tracker Cloud Run Deployment"
echo "Project : ${PROJECT_ID}"
echo "Region  : ${REGION}"
echo "Demo    : ${SEED_DEMO_DATA}"
echo "Dry Run : ${DRY_RUN}"
echo "=================================================================="

# ==============================================================================
# Portal/TA pre-provisions infrastructure and public service IAM (Guide 5.3 steps 1–8, 5.4).
# These names must exist. Never create or modify project-level IAM here.
# Our seed (backend/prisma/seed.ts) has no demo/non-demo branch — it always
# upserts the same three fixed accounts — so every SEED_PASSWORD_* name it
# needs is mapped unconditionally, not gated behind --demo/SEED_DEMO_DATA.
# The kit's original names (ADMIN_PASSWORD, DEMO_USER_PASSWORD) are removed:
# our seed script never reads them. Both participants share one secret
# (s65da36e2-demo-password) — only one demo password is provisioned.
JOB_SECRETS="DATABASE_URL=${SECRET_DB_URL}:latest,SEED_PASSWORD_MANAGER=${SECRET_ADMIN_PASS}:latest,SEED_PASSWORD_PARTICIPANT_1=${SECRET_DEMO_PASS}:latest,SEED_PASSWORD_PARTICIPANT_2=${SECRET_DEMO_PASS}:latest"
if [ "$DRY_RUN" != "1" ]; then
  gcloud run services describe "$SERVICE_NAME" --project "$PROJECT_ID" --region "$REGION" >/dev/null
  gcloud run jobs describe "$MIGRATE_JOB_NAME" --project "$PROJECT_ID" --region "$REGION" >/dev/null
fi
# 9. Build & Push Unified Container Image via Cloud Build
#    Builds the root Dockerfile (run this script from the repo root).
#    Tag `latest` is only for this first manual setup; deploy.yml uses commit SHAs.
# ==============================================================================
run_cmd gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
run_cmd docker build --platform linux/amd64 --tag "$IMAGE_URI" .
run_cmd docker push "$IMAGE_URI"
if [ "$DRY_RUN" != "1" ]; then
  IMAGE_URI="$(gcloud artifacts docker images describe "$IMAGE_URI" --project "$PROJECT_ID" --format='value(image_summary.fully_qualified_digest)')"
  [[ "$IMAGE_URI" == "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}@sha256:"* ]] || { echo 'Missing image digest' >&2; exit 1; }
fi

# ==============================================================================
# 10. Create/Update & Execute Cloud Run Job for Migration + Non-destructive Seed
#     ⭐ IMPORTANT: if this job fails the script stops BEFORE deploying the
#        service, so a broken migration never reaches users.
#     CHANGE ME (done for our stack): `npm run db:seed` runs
#        backend/prisma/seed.ts via tsx, upsert-only (prisma.user.upsert with
#        update: {}) — re-running never overwrites or wipes an already-seeded
#        account, so this is safe to run on every deploy, not just the first.
#     The job's default working directory is /app/backend (our Dockerfile's
#        WORKDIR, which Cloud Run jobs inherit regardless of --command/--args
#        overriding the image's own CMD), so both commands below find
#        backend/package.json and backend/prisma/schema.prisma correctly.
#     deploy.yml / release.sh later re-run this same job (name: s65da36e2-migrate).
#     --update-secrets/--update-env-vars (not --set-*): "set" replaces the
#        job's ENTIRE secret/env-var set, which would silently wipe anything
#        the portal configured on it that this script doesn't know about;
#        "update" only touches the keys named here.
# ==============================================================================
run_cmd gcloud run jobs update "$MIGRATE_JOB_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --set-cloudsql-instances "$SQL_CONN_NAME" \
  --update-secrets "$JOB_SECRETS" \
  --update-env-vars "NODE_ENV=production,TZ=Asia/Bangkok,SEED_DEMO_DATA=${SEED_DEMO_DATA}" \
  --command "sh" \
  --args "-c,npx prisma migrate deploy && npm run db:seed" \
  --max-retries 1 \
  --task-timeout 300s \
  --project "$PROJECT_ID"

if ! run_cmd gcloud run jobs execute "$MIGRATE_JOB_NAME" \
  --region "$REGION" \
  --wait \
  --project "$PROJECT_ID"; then
  printf '%s\n' "ERROR: Cloud Run migration job '${MIGRATE_JOB_NAME}' failed. Aborting service deployment." >&2
  printf '%s\n' "View job logs with:" >&2
  printf '%s\n' "  gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${MIGRATE_JOB_NAME}\" --project \"${PROJECT_ID}\" --limit 50 --format=\"value(textPayload)\"" >&2
  exit 1
fi

# ==============================================================================
# 11. Deploy Cloud Run Service
#     CHANGE ME (done for our stack): --port 3000 matches our Dockerfile's
#        EXPOSE/ENV PORT. --memory/--cpu/--max-instances are unchanged — a
#        small Express + Postgres demo app for a course lab doesn't need
#        more than 512Mi/1 CPU, and max-instances 1 matches the single Cloud
#        SQL connection the portal provisioned.
#     ⚠️ --allow-unauthenticated makes the service public (needed for the demo).
#
#     FRONTEND_ORIGIN = the service's own URL: single container, single
#        origin (see docs/labs/lab-05/cloud-ready-contract.md item 5) — the
#        app serves its own frontend, so CORS only ever needs to allow
#        requests from itself. The service already exists (portal/TA
#        pre-provisioned it), so its URL is stable and describable before
#        this same update changes anything else about it.
#     --update-secrets/--update-env-vars (not --set-*): see step 10's note —
#        "set" would wipe any portal-managed secret/env-var this script
#        doesn't name.
# ==============================================================================
if [ "$DRY_RUN" = "1" ]; then
  FRONTEND_ORIGIN_VALUE="https://${SERVICE_NAME}-<hash>-as.a.run.app"
else
  FRONTEND_ORIGIN_VALUE="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
fi

run_cmd gcloud run services update "$SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --add-cloudsql-instances "$SQL_CONN_NAME" \
  --update-secrets "DATABASE_URL=${SECRET_DB_URL}:latest,SESSION_SECRET=${SECRET_SESSION}:latest" \
  --update-env-vars "NODE_ENV=production,TZ=Asia/Bangkok,FRONTEND_ORIGIN=${FRONTEND_ORIGIN_VALUE}" \
  --min-instances 0 \
  --max-instances 1 \
  --memory 512Mi \
  --cpu 1 \
  --port 3000 \
  --project "$PROJECT_ID"

run_cmd gcloud run services update-traffic "$SERVICE_NAME" --to-latest --project "$PROJECT_ID" --region "$REGION" --quiet
if [ "$DRY_RUN" != "1" ]; then
  SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
fi

# ------------------------------------------------------------------------------
# Summary output (URLs; passwords stay in Secret Manager and are not printed)
# A dry run never had a real deploy to report, so it gets its own, honest
# summary instead of a fake-looking "Deployment Completed!" with a
# placeholder URL.
# ------------------------------------------------------------------------------
printf '\n'
printf '%s\n' "=================================================================="
if [ "$DRY_RUN" = "1" ]; then
  printf '%s\n' "DRY RUN: nothing was deployed."
  printf '%s\n' "Re-run with DRY_RUN=0 (from the main branch) to actually deploy."
else
  printf '%s\n' "Deployment Completed!"
  printf '%s\n' "Service URL    : ${SERVICE_URL}"
  printf '%s\n' "Health Check   : ${SERVICE_URL}/health"
  printf '%s\n' "Readiness Check: ${SERVICE_URL}/ready"
  printf '%s\n' "Admin Email    : manager@example.com"
  printf '%s\n' "Admin Password : Stored in Secret Manager: ${SECRET_ADMIN_PASS} (not printed)."
  if [ "$SEED_DEMO_DATA" = "true" ]; then
    printf '%s\n' "Demo Password  : Stored in Secret Manager: ${SECRET_DEMO_PASS} (not printed)."
  fi
fi
printf '%s\n' "=================================================================="
