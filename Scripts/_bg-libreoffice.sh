#!/usr/bin/env bash
chmod +x "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/Scripts/_install-libreoffice.sh"
nohup "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/Scripts/_install-libreoffice.sh" > /dev/null 2>&1 &
echo "PID=$!"
