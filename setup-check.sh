#!/bin/bash
# FILE PATH: setup-check.sh (at repo root — optional helper)
#
# Run this AFTER you've copied all the files in, to verify the structure
# matches what the tests expect. Also checks for the [id] bracket issue.
#
# Usage:  bash setup-check.sh

set -e

echo "Checking stoney-extractor structure..."
echo ""

REQUIRED_FILES=(
  "package.json"
  "tsconfig.json"
  "vitest.config.ts"
  "README.md"
  "LICENSE"
  ".gitignore"
  ".npmignore"
  ".github/workflows/ci.yml"
  ".github/workflows/publish.yml"
  "src/index.ts"
  "src/types.ts"
  "src/detect.ts"
  "src/adapters/index.ts"
  "src/adapters/nextjs-app-router.ts"
  "src/adapters/nextjs-pages-router.ts"
  "src/lib/virtual-fs.ts"
  "src/lib/route-path.ts"
  "src/lib/type-to-schema.ts"
  "src/lib/openapi-builder.ts"
  "__tests__/integration.test.ts"
  "__tests__/fixtures/nextjs-app-basic/app/api/posts/route.ts"
  "__tests__/fixtures/nextjs-app-basic/app/api/users/[id]/route.ts"
  "__tests__/fixtures/nextjs-pages-basic/pages/api/users/[id].ts"
)

MISSING=()
for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    MISSING+=("$f")
  fi
done

# Check for the _id_ macOS-mangled filename
if [ -e "__tests__/fixtures/nextjs-app-basic/app/api/users/_id_" ] || \
   [ -f "__tests__/fixtures/nextjs-pages-basic/pages/api/users/_id_.ts" ]; then
  echo "❌ FOUND MANGLED FILENAME: _id_ should be [id]"
  echo "   Rename the directory/file to include literal brackets."
  exit 1
fi

if [ ${#MISSING[@]} -eq 0 ]; then
  echo "✅ All ${#REQUIRED_FILES[@]} required files present"
  echo ""
  echo "Next: pnpm install && pnpm typecheck && pnpm test"
else
  echo "❌ Missing ${#MISSING[@]} file(s):"
  for f in "${MISSING[@]}"; do
    echo "   - $f"
  done
  exit 1
fi
