#!/bin/sh
# compile the Godot project headless and list script errors with their file:line
cd "$(dirname "$0")/../godot" && timeout 120 "${GODOT:-/e/tools/godot/Godot_v4.7.2-stable_win64_console.exe}" --headless --path . --quit-after ${1:-5} 2>&1 | grep -A1 "SCRIPT ERROR\|^ERROR\|WARNING" | grep -v "^--$" | head -${2:-30}
