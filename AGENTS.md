# Agent Guide

This repository is a static browser and LG webOS weather app. The same `app/`
directory powers both. No application build or dependency install is needed to
preview it.

## Start here

1. Read `README.md` for the product and `docs/INSTALL_ON_LG_TV.md` for TV setup.
2. Preview locally from `app/` with `python3 -m http.server 4173` and open
   `http://localhost:4173`.
3. For TV installation, guide the user through the physical Developer Mode steps
   before running CLI commands. Pair with the user's TV IP and temporary key
   passphrase. Never put those values in Git, logs, or documentation.
4. Package `app/` with `ares-package --no-minify`, install the exact resulting
   `.ipk`, and launch the app ID from `app/appinfo.json`.
5. Verify ZIP setup, remote focus/navigation, live-data fallback, and sound
   activation in a browser before claiming TV compatibility. LG C3 is the only
   model verified so far.

The code license is in `LICENSE`. Bundled music has separate CC BY 4.0 terms and
credits in `app/assets/audio/README.md`. Preserve the credits when distributing
the app. Weather and map services also require attribution; see `README.md`.
