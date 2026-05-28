#!/usr/bin/env bash
chmod +x "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/Scripts/_run-nlm-auth.sh"
rm -f /tmp/dwellium-nlm-auth.log
nohup "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/Scripts/_run-nlm-auth.sh" >/dev/null 2>&1 &
echo "PID=$!"
