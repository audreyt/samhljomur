#!/usr/bin/env bash
# Publish Samhljómur to github.com/audreyt/samhljomur (public) with GitHub
# Pages serving site/. DO NOT RUN inside the dev environment; run locally:
#   bash scripts/publish.sh
#
# Pushes ONE squashed orphan commit of the current tree (main's history
# stays local; the published repo contains a single root commit).
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. size check: GitHub rejects files > 100 MB; warn over 95 MB
big=$(find . -type f -not -path "./.git/*" -not -path "./node_modules/*" -size +95M -print)
if [ -n "$big" ]; then
  echo "refusing: files over 95 MB:"; echo "$big"; exit 1
fi

# 2. Pages workflow goes into the squashed tree
mkdir -p .github/workflows
cat > .github/workflows/pages.yml <<'YML'
name: pages
on:
  push:
    branches: [main]
permissions:
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: github-pages
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: site
      - uses: actions/deploy-pages@v4
YML

# 3. squashed orphan commit of the current tree
git checkout --orphan publish
git add -A
git commit -qm "Samhljómur"

# 4. create the public repo (idempotent) and push the squashed tree as main
gh repo create audreyt/samhljomur --public --description "Íslandsmedley from Samtal's open data / an Iceland medley" 2>/dev/null || true
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/audreyt/samhljomur.git"
git push -u origin publish:main

# 5. back to local main, drop the publish branch
git checkout main
git branch -D publish

# 6. enable Pages (source = GitHub Actions)
gh api repos/audreyt/samhljomur/pages -X POST -f "build_type=workflow" 2>/dev/null || \
  gh api repos/audreyt/samhljomur/pages -X PATCH -f "build_type=workflow" || true

echo ""
echo "published: https://github.com/audreyt/samhljomur"
echo "site:      https://audreyt.github.io/samhljomur/"
