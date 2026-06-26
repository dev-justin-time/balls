@echo off
REM Open all UI pages served by the Vite dev server (must be running on :5173).
REM Each `start` opens a new browser window/tab in the default browser.
title Going Balls — open all UI pages

start "" "http://127.0.0.1:5173/"
start "" "http://127.0.0.1:5173/build.html"
start "" "http://127.0.0.1:5173/offline.html"
start "" "http://127.0.0.1:5173/puter_workers_demo.html"
start "" "http://127.0.0.1:5173/apps/web-extractor.html"
start "" "http://127.0.0.1:5173/builderworkshop/index.html"
start "" "http://127.0.0.1:5173/docs/index.html"
start "" "http://127.0.0.1:5173/docs/api.html"
start "" "http://127.0.0.1:5173/docs/architecture.html"
start "" "http://127.0.0.1:5173/docs/monetization.html"
start "" "http://127.0.0.1:5173/docs/security.html"
start "" "http://127.0.0.1:5173/docs/zoning_plan.html"
start "" "http://127.0.0.1:5173/src/lumenshaders/index.html"
start "" "http://127.0.0.1:5173/temp_lumenshaders/index.html"
start "" "http://127.0.0.1:5173/temp_lumenshaders/docs.html"

echo All 15 pages dispatched to your default browser.
