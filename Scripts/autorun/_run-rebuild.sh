#!/bin/bash
# Wrapper that bootstraps nvm + runs rebuild-frontend.sh.
# Designed to be invoked from osascript or any non-interactive shell.

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "/opt/homebrew/opt/nvm/nvm.sh" ]; then
  . "/opt/homebrew/opt/nvm/nvm.sh"
elif [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
fi

REPO="/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec"
bash "$REPO/Scripts/rebuild-frontend.sh" 2>&1 | tail -50
