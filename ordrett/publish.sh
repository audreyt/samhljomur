#!/usr/bin/env bash
# Rebuild Orðrétt and publish it to https://audreyt.github.io/samhljomur/
#
#   bash ordrett/publish.sh            rebuild from the newest local snapshot, verify, publish
#   bash ordrett/publish.sh --fetch    take a fresh snapshot from talasaman.is first
#                                      (new summaries, and a line on the mountain for new recordings)
#   DRY_RUN=1 bash ordrett/publish.sh  everything except the push
#   MSG="..." bash ordrett/publish.sh  a commit message of your own for the public commit
#
# The public repo holds a squashed history, so local main never fast-forwards to
# it and a plain `git push` is rejected. Never force-push: that would publish the
# whole local history. This script copies site/ and ordrett/ onto a worktree of
# origin/main and pushes one fast-forward commit. Screenshots stay local.
set -euo pipefail
cd "$(dirname "$0")/.."

bun ordrett/build.ts ${1:-}
bun ordrett/verify.ts
git add -A ordrett site
git diff --cached --quiet || git commit -qm "Orðrétt: rebuild from talasaman.is"

git fetch -q origin
W="$(mktemp -d)/publish"
git worktree add -q --detach "$W" origin/main
trap 'git worktree remove --force "$W" 2>/dev/null || true' EXIT
rsync -a --delete site/ "$W/site/"
rsync -a --delete --exclude 'qa/*.png' ordrett/ "$W/ordrett/"
git -C "$W" add -A site ordrett
if git -C "$W" diff --cached --quiet; then
  echo "nothing new to publish"
  exit 0
fi
git -C "$W" commit -qm "${MSG:-Orðrétt: rebuild from talasaman.is ($(date -u +%Y-%m-%dT%H:%MZ))}"
git -C "$W" --no-pager show --stat --oneline HEAD | head -20
if [ -n "${DRY_RUN:-}" ]; then
  echo "DRY_RUN: not pushed"
  exit 0
fi
git -C "$W" push origin HEAD:main
echo "published; Pages takes about a minute: https://audreyt.github.io/samhljomur/"
