#!/usr/bin/env bash
# Launches the desktop app. Builds the client first if it hasn't been built.
cd "$(dirname "$(readlink -f "$0")")"
unset ELECTRON_RUN_AS_NODE
if [ ! -f packages/client/dist/index.html ]; then
  npm run build || exit 1
fi
exec ./node_modules/electron/dist/electron packages/desktop "$@"
