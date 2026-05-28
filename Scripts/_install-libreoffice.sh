#!/usr/bin/env bash
# Background installer for LibreOffice via Homebrew.
# Output: /tmp/dwellium-libreoffice-install.log
set -e
exec > /tmp/dwellium-libreoffice-install.log 2>&1
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
echo "Starting at $(date)"
brew --version
brew install --cask libreoffice
echo "Done at $(date)"
which soffice || echo "(soffice still not on PATH; binary lives at /Applications/LibreOffice.app/Contents/MacOS/soffice)"
ls -d /Applications/LibreOffice.app 2>&1 || echo "LibreOffice.app not found"
