#!/bin/bash
set -uo pipefail

echo "=== STEP 1: Move ball textures to assets/image/ball/ ==="
mkdir -p assets/image/ball
mkdir -p assets/image/sky

moved_webp=0
moved_gif=0
for f in assets/image/*.webp; do
  [ -f "$f" ] || continue
  mv "$f" assets/image/ball/
  moved_webp=$((moved_webp + 1))
done
for f in assets/image/*.gif; do
  [ -f "$f" ] || continue
  mv "$f" assets/image/ball/
  moved_gif=$((moved_gif + 1))
done

echo "Moved: $moved_webp webp, $moved_gif gif"

echo ""
echo "=== STEP 2: Reconcile code references via Python (handles leave-alone for sky/X vs ball/X) ==="

cat > /tmp/reconcile_refs.py <<'PYEOF'
import os, re, sys

SKY_FILENAMES = {'sky_day', 'sky_sunset', 'sky_night', 'sky_void'}
TARGET_EXTS    = ('webp', 'gif', 'png', 'jpg', 'jpeg')
TARGET_FILES = [
    'src/ball_db.js',
    'engine/scene.js',
    'src/persistence.js',
    'src/audio.js',
    'src/i18n/locale_manager.js',
    'src/builder/ws_*.js',
    'src/world/world_minimap.js',
    'tests/ball_skin.test.js',
    'tests/levelgen.test.js',
    'tests/asset_loading.test.js',
    'index.html',
    'puter_workers_demo.html',
    'main.js',
]

import glob
expanded = []
for p in TARGET_FILES:
    if '*' in p:
        expanded.extend(sorted(glob.glob(p)))
    else:
        expanded.append(p)
TARGET_FILES = [f for f in expanded if os.path.isfile(f)]

changed = []
for f in TARGET_FILES:
    with open(f, 'r', encoding='utf-8') as fp:
        s = fp.read()
    before = s

    # Phase 1: move sky refs to assets/image/sky/X.{ext}
    for ext in TARGET_EXTS:
        s = re.sub(
            r"'assets/image/(sky_(?:day|sunset|night|void))\." + ext + r"(\?[^']*)?'",
            r"'assets/image/sky/\1." + ext + r"\2'",
            s,
        )

    # Phase 2: move remaining (non-sky/non-already-balled/non-already-skied) refs to image/ball/
    # Pattern: 'assets/image/X.{ext}' where X doesn't contain '/'
    for ext in TARGET_EXTS:
        s = re.sub(
            r"'assets/image/([^/]+)\." + ext + r"(\?[^']*)?'",
            lambda m: (
                m.group(0) if (
                    m.group(1) in SKY_FILENAMES
                    or '/ball/' in f  # don't double-prefix when target is itself under builder/
                )
                else f"'assets/image/ball/{m.group(1)}.{ext}{m.group(2) or ''}'"
            ),
            s,
        )

    if s != before:
        with open(f, 'w', encoding='utf-8') as fp:
            fp.write(s)
        changed.append(f)

print(f"Updated {len(changed)} files:")
for f in changed:
    print(f"  - {f}")

# Phase 3: index.html favicon (no quotes)
if os.path.isfile('index.html'):
    with open('index.html', 'r', encoding='utf-8') as fp:
        s = fp.read()
    before = s
    s = s.replace('href="assets/image/ball.webp"', 'href="assets/image/ball/ball.webp"')
    if s != before:
        with open('index.html', 'w', encoding='utf-8') as fp:
            fp.write(s)
        print(f"Updated index.html favicon path")

PYEOF

python /tmp/reconcile_refs.py

echo ""
echo "=== STEP 3: Verification ==="
echo ""
echo "--- assets/image/ top-level contents ---"
ls assets/image/ 2>&1
echo ""
echo "--- assets/image/ball/ count ---"
ls assets/image/ball/ 2>/dev/null | wc -l
echo ""
echo "--- assets/image/sky/ count ---"
ls assets/image/sky/ 2>/dev/null | wc -l
echo ""
echo "--- Any remaining 'assets/image/X' refs in code (without /ball/ or /sky/)? ---"
grep -rn "'assets/image/" --include='*.js' --include='*.html' src/ engine/ tests/ docs/ apps/ builderworkshop/ puter_workers_demo.html index.html main.js 2>/dev/null | grep -v "'assets/image/ball/" | grep -v "'assets/image/sky/" | grep -v "'assets/image/raw/" | head -20
echo "(if empty above, all ball/sky refs are properly prefixed)"
echo ""
echo "--- 5 sample lines from ball_db.js to verify ---"
grep -n "'assets/image/" src/ball_db.js 2>/dev/null | head -5
