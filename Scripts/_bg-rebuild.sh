#!/usr/bin/env bash
rm -f /tmp/dwellium-rebuild.log
nohup bash "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/Scripts/_rebuild-with-nvm.sh" > /tmp/dwellium-rebuild.log 2>&1 &
echo "PID=$!"
