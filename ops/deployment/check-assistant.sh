#!/usr/bin/env bash
set -Eeuo pipefail

# Check the public route, backend key, database lookup, provider request, and
# response shape after deployment. A /health check does not cover these.
ORIGIN="${ORIGIN:-http://127.0.0.1:3001}"
reply_file="$(mktemp)"
trap 'rm -f "${reply_file}"' EXIT

curl --fail --silent --show-error --max-time 45 \
  --header 'Content-Type: application/json' \
  --data '{"message":"Hello, what is your name?","language":"English"}' \
  "${ORIGIN}/api/v1/mobile/assistant/chat" >"${reply_file}"

"${PYTHON_BIN:-python3}" - "${reply_file}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding='utf-8') as response_file:
    response = json.load(response_file)

if not isinstance(response, dict) or not isinstance(response.get('reply'), str) or not response['reply'].strip():
    raise SystemExit('SRV Chat smoke check failed: response has no reply')

print('SRV Chat smoke check passed: live reply received')
PY
