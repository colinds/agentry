#!/usr/bin/env bash
set -e

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path')

if [[ -z "$file_path" || ! -f "$file_path" ]]; then
  exit 0
fi

if [[ "$file_path" =~ \.(js|jsx|ts|tsx)$ ]]; then
  bunx oxlint --fix "$file_path" 2>/dev/null || true
  bunx oxfmt --write "$file_path" 2>/dev/null || true
fi

exit 0
