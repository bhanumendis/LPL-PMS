#!/usr/bin/env bash
# Lyceum Placements — Placement Management System
# Copyright © Bhanu Mendis - LGH IT
#
# One-time GitHub setup for the release pipeline (docs/OPERATIONS.md, "One-time setup"), for a
# repository administrator signed in with the GitHub CLI (gh auth login). Safe to run again:
# every setting is written whole.
#
#   scripts/deploy/configure-repo.sh --repo owner/name --reviewer <login> [--reviewer …] [--team org/slug …] \
#     --api-url https://api.pms.example.lk --anon-key <public anon key> [--connect-src "<origins>"] \
#     [--required-reviews N] [--prevent-self-review] [--no-secrets] [--dry-run]
#
# It sets:
#   - branch protection on main: the CI gates below are required and up to date, N approving
#     reviews (--required-reviews, default 1; 0 for a single maintainer, who cannot approve their
#     own pull request), stale approvals dismissed, conversations resolved, no force pushes or
#     deletion, administrators included;
#   - the production and production-db environments, deployable from protected branches only,
#     with the given required reviewers (Group IT);
#   - GitHub Pages published by GitHub Actions;
#   - variables: VITE_API_URL, VITE_API_ANON_KEY (and LPL_CONNECT_SRC) for the repository,
#     API_URL and VITE_API_ANON_KEY for production;
#   - the workflows' default token to read-only, Dependabot alerts and security updates on;
#   - unless --no-secrets: prompts (input hidden, never echoed or logged) for API_DEPLOY_HOOK
#     (production, optional) and PRODUCTION_DATABASE_URL (production-db).
# --dry-run prints every request instead of sending it and needs neither gh nor a network.
set -euo pipefail
cd "$(dirname "$0")/../.."

# The CI jobs main requires, by their check names. Each must be a job name in ci.yml.
CHECKS=(
  "Web · types, lint, unit, contrast, build, budget"
  "Server · format, vet, staticcheck, govulncheck, unit and integration"
  "End to end · API client and browser (7 viewports + dark, axe)"
  "Secret scan · full history"
  "Pipeline · actionlint, shellcheck, repository setup"
  "Image · build, scan, deploy rehearsal"
)

usage() { sed -n '9,11p' "$0" | sed 's/^# \{0,1\}//'; }

REPO="" API_URL="" ANON_KEY="" CONNECT_SRC="" DRY=0 SECRETS=1 SELF_REVIEW=false REVIEWS=1
REVIEWERS=() TEAMS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="${2:?}"; shift 2 ;;
    --reviewer) REVIEWERS+=("${2:?}"); shift 2 ;;
    --team) TEAMS+=("${2:?}"); shift 2 ;;
    --api-url) API_URL="${2:?}"; shift 2 ;;
    --anon-key) ANON_KEY="${2:?}"; shift 2 ;;
    --connect-src) CONNECT_SRC="${2:?}"; shift 2 ;;
    --required-reviews) REVIEWS="${2:?}"; shift 2 ;;
    --prevent-self-review) SELF_REVIEW=true; shift ;;
    --no-secrets) SECRETS=0; shift ;;
    --dry-run) DRY=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

problems=()
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || problems+=("--repo owner/name is required")
[[ "$API_URL" =~ ^https://[^/]+/?$ ]] || problems+=("--api-url must be the https origin of lpl-api, e.g. https://api.pms.example.lk")
[ -n "$ANON_KEY" ] || problems+=("--anon-key (the public anon key) is required")
[[ "$REVIEWS" =~ ^[0-6]$ ]] || problems+=("--required-reviews must be 0 to 6")
# The same refusal as the production build: never a service-role or secret key.
if [[ "$ANON_KEY" == sb_secret_* ]]; then problems+=("--anon-key is a secret key; give the public anon key")
elif [[ "$ANON_KEY" == *.*.* ]]; then
  payload=$(cut -d. -f2 <<< "$ANON_KEY" | tr '_-' '/+')
  case $(( ${#payload} % 4 )) in 2) payload="$payload==" ;; 3) payload="$payload=" ;; esac
  role=$(base64 -d <<< "$payload" 2> /dev/null | jq -r '.role // empty' 2> /dev/null || true)
  [ "$role" != "service_role" ] || problems+=("--anon-key is the service-role key; give the public anon key")
fi
[ $(( ${#REVIEWERS[@]} + ${#TEAMS[@]} )) -gt 0 ] || problems+=("at least one --reviewer or --team (Group IT) is required")
for c in "${CHECKS[@]}"; do
  grep -qxF "    name: $c" .github/workflows/ci.yml || problems+=("required check \"$c\" is not a job name in .github/workflows/ci.yml")
done
if [ ${#problems[@]} -gt 0 ]; then printf 'configure-repo: %s\n' "${problems[@]}" >&2; exit 2; fi
if [ "$DRY" = 0 ]; then command -v gh > /dev/null || { echo "configure-repo: the GitHub CLI (gh) is required" >&2; exit 2; }; fi

# api METHOD PATH [JSON]: one REST call; the body is checked as JSON either way.
api() {
  local method=$1 path=$2 body=${3-}
  if [ -n "$body" ]; then jq -e . > /dev/null <<< "$body" || { echo "configure-repo: invalid JSON for $method $path" >&2; exit 1; }; fi
  if [ "$DRY" = 1 ]; then
    echo "$method /$path"
    if [ -n "$body" ]; then jq -c . <<< "$body"; fi
    return 0
  fi
  if [ -n "$body" ]; then gh api -X "$method" "$path" --input - <<< "$body" > /dev/null; else gh api -X "$method" "$path" > /dev/null; fi
}
variable() { # NAME VALUE [ENVIRONMENT]
  if [ "$DRY" = 1 ]; then echo "variable $1${3:+ (environment $3)} = $2"; return 0; fi
  gh variable set "$1" --repo "$REPO" --body "$2" ${3:+--env "$3"}
}
secret() { # NAME ENVIRONMENT PROMPT
  if [ "$DRY" = 1 ]; then echo "secret $1 (environment $2): prompted"; return 0; fi
  local value
  read -r -s -p "$3: " value; echo
  if [ -z "$value" ]; then echo "  $1 left unset"; return 0; fi
  gh secret set "$1" --repo "$REPO" --env "$2" <<< "$value"
  echo "  $1 set"
}
id_of() { # users/<login> | orgs/<org>/teams/<slug>
  if [ "$DRY" = 1 ]; then echo 0; else gh api "$1" --jq .id; fi
}

echo "== reviewers"
reviewers='[]'
for u in "${REVIEWERS[@]}"; do
  reviewers=$(jq -c --argjson id "$(id_of "users/$u")" '. + [{type: "User", id: $id}]' <<< "$reviewers")
done
for t in "${TEAMS[@]}"; do
  reviewers=$(jq -c --argjson id "$(id_of "orgs/${t%%/*}/teams/${t#*/}")" '. + [{type: "Team", id: $id}]' <<< "$reviewers")
done
echo "$reviewers"

echo "== branch protection: main"
api PUT "repos/$REPO/branches/main/protection" "$(printf '%s\n' "${CHECKS[@]}" | jq -R . | jq -s --argjson n "$REVIEWS" '{
  required_status_checks: {strict: true, checks: map({context: .})},
  enforce_admins: true,
  required_pull_request_reviews: {required_approving_review_count: $n, dismiss_stale_reviews: true, require_code_owner_reviews: false},
  restrictions: null,
  required_conversation_resolution: true,
  allow_force_pushes: false,
  allow_deletions: false
}')"

echo "== environments"
for env in production production-db; do
  api PUT "repos/$REPO/environments/$env" "$(jq -n --argjson r "$reviewers" --argjson self "$SELF_REVIEW" '{
    reviewers: $r, prevent_self_review: $self,
    deployment_branch_policy: {protected_branches: true, custom_branch_policies: false}
  }')"
done

echo "== GitHub Pages from GitHub Actions"
if [ "$DRY" = 1 ]; then
  api POST "repos/$REPO/pages" '{"build_type": "workflow"}'
else
  api POST "repos/$REPO/pages" '{"build_type": "workflow"}' 2> /dev/null || api PUT "repos/$REPO/pages" '{"build_type": "workflow"}'
fi

echo "== variables"
variable VITE_API_URL "${API_URL%/}"
variable VITE_API_ANON_KEY "$ANON_KEY"
if [ -n "$CONNECT_SRC" ]; then variable LPL_CONNECT_SRC "$CONNECT_SRC"; fi
variable API_URL "${API_URL%/}" production
variable VITE_API_ANON_KEY "$ANON_KEY" production

echo "== workflow token read-only by default; Dependabot alerts and security updates"
api PUT "repos/$REPO/actions/permissions/workflow" '{"default_workflow_permissions": "read", "can_approve_pull_request_reviews": false}'
api PUT "repos/$REPO/vulnerability-alerts"
api PUT "repos/$REPO/automated-security-fixes"

if [ "$SECRETS" = 1 ]; then
  echo "== secrets (input hidden; leave empty to skip)"
  secret API_DEPLOY_HOOK production "API_DEPLOY_HOOK: the URL your container host exposes to pull lpl-api:production (optional)"
  secret PRODUCTION_DATABASE_URL production-db "PRODUCTION_DATABASE_URL: the production Postgres connection string, for migrations"
fi

if [ "$DRY" = 1 ]; then echo "dry run for $REPO: nothing was sent"; else echo "done: $REPO"; fi
