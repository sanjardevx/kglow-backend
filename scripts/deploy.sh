#!/usr/bin/env bash
# Updates the live API on the Lightsail server to the latest `develop`.
#
# GitHub Actions runs this after the tests pass: its SSH key is locked to this
# one script in ~/.ssh/authorized_keys, so it can't run anything else. It can
# also be run by hand:  bash ~/kglow/scripts/deploy.sh
#
# Everything sits inside main() so bash reads the whole file before
# `git pull` can replace it mid-run.
set -eo pipefail

main() {
  # node, npm and pm2 may come from nvm, which a non-interactive SSH session
  # doesn't load on its own.
  export NVM_DIR="$HOME/.nvm"
  if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh"; fi

  cd "$HOME/kglow"
  git pull --ff-only origin develop
  npm ci --no-audit --no-fund
  npm run build
  pm2 restart kglow-api --update-env
  pm2 save
  echo "Deployed $(git log -1 --format='%h %s')"
}

main "$@"
exit
