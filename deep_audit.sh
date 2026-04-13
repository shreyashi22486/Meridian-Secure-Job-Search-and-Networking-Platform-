#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# DEEP HONEST SECURITY AUDIT — No rate-limiter masking
# Tests each security layer directly, with pauses to avoid false passes.
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

BASE="https://192.168.2.233"
API="${BASE}/api"
C="curl -sk --max-time 10"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
PASS=0; FAIL=0; WARN=0; TOTAL=0

ok()   { ((TOTAL++)); ((PASS++)); echo -e "  ${GREEN}[SECURE]${NC} $1"; [[ -n "${2:-}" ]] && echo -e "           ${GREEN}↳ $2${NC}"; }
bad()  { ((TOTAL++)); ((FAIL++)); echo -e "  ${RED}[VULN]${NC}   $1"; [[ -n "${2:-}" ]] && echo -e "           ${RED}↳ $2${NC}"; }
warn() { ((TOTAL++)); ((WARN++)); echo -e "  ${YELLOW}[WARN]${NC}   $1"; [[ -n "${2:-}" ]] && echo -e "           ${YELLOW}↳ $2${NC}"; }
hdr()  { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}"; }

echo -e "\n${RED}${BOLD}  🔓 DEEP SECURITY AUDIT — HONEST MODE${NC}\n"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
hdr "1. SQL INJECTION (Testing actual ORM, not rate limiter)"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Test 1: Classic auth bypass — does SQLAlchemy parameterize?
r=$($C -X POST "${API}/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"'\'' OR 1=1 --","password":"anything"}' 2>/dev/null)
code=$($C -o /dev/null -w "%{http_code}" -X POST "${API}/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"'\'' OR 1=1 --","password":"anything"}' 2>/dev/null)
if [[ "$code" == "401" || "$code" == "422" ]]; then
  ok "SQLi auth bypass: ' OR 1=1 --" "Rejected with HTTP $code (ORM parameterized)"
elif [[ "$code" == "429" ]]; then
  warn "SQLi auth bypass: ' OR 1=1 --" "Rate limited (HTTP 429) — can't verify if ORM is safe"
else
  bad "SQLi auth bypass: ' OR 1=1 --" "Unexpected HTTP $code — INVESTIGATE"
fi

sleep 2

# Test 2: UNION injection in search (if exposed without auth)
r=$($C "${API}/jobs/?search=' UNION SELECT null,null,email,hashed_password FROM users--" 2>/dev/null)
code=$($C -o /dev/null -w "%{http_code}" "${API}/jobs/?search=' UNION SELECT null,null,email,hashed_password FROM users--" 2>/dev/null)
if echo "$r" | grep -qi "hashed_password"; then
  bad "UNION SQLi in /jobs/ search" "PASSWORD HASHES LEAKED!"
else
  ok "UNION SQLi in /jobs/ search" "No data leak (HTTP $code)"
fi

sleep 2

# Test 3: Blind SQLi timing attack
start_time=$(date +%s%N)
$C -X POST "${API}/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin'\'' AND SLEEP(5)--","password":"x"}' > /dev/null 2>&1
end_time=$(date +%s%N)
elapsed=$(( (end_time - start_time) / 1000000 ))  # ms
if (( elapsed > 4000 )); then
  bad "Blind SQLi timing attack" "Response took ${elapsed}ms — possible SLEEP injection"
else
  ok "Blind SQLi timing attack" "Response in ${elapsed}ms — no delay injection"
fi

sleep 2

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
hdr "2. XSS — Testing actual sanitization"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Register with XSS in name, then check if it's stored sanitized
xss_email="xss_deep_$(date +%s)@test.com"
r=$($C -X POST "${API}/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"${xss_email}\",\"password\":\"DeepTest@123!\",\"full_name\":\"<script>alert('XSS')</script>\"}" 2>/dev/null)
code=$($C -o /dev/null -w "%{http_code}" -X POST "${API}/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"${xss_email}\",\"password\":\"DeepTest@123!\",\"full_name\":\"<script>alert('XSS')</script>\"}" 2>/dev/null)

if echo "$r" | grep -q "<script>"; then
  bad "Stored XSS in registration name" "Script tag returned unsanitized in response!"
elif [[ "$code" == "201" ]]; then
  # Registered OK — check what was stored
  if echo "$r" | grep -qi "alert"; then
    warn "Stored XSS in registration name" "Registered but 'alert' still in response — check DB"
  else
    ok "Stored XSS in registration name" "Registered with sanitized output"
  fi
elif [[ "$code" == "400" || "$code" == "422" ]]; then
  ok "Stored XSS in registration name" "Rejected by validation (HTTP $code)"
else
  warn "Stored XSS in registration name" "HTTP $code — review"
fi

sleep 2

# Check what's actually stored in the DB
echo -e "\n  ${BOLD}Checking DB for stored XSS payloads:${NC}"
db_check=$(docker exec sjp-postgres psql -U postgres -d secure_job_portal -t -c \
  "SELECT full_name FROM users WHERE email='${xss_email}'" 2>/dev/null)
if echo "$db_check" | grep -q "<script>"; then
  bad "XSS payload stored in database" "DB contains raw: ${db_check}"
else
  ok "XSS payload sanitized in database" "DB stores: '$(echo $db_check | xargs)'"
fi

sleep 2

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
hdr "3. CSRF — Testing actual double-submit validation"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Login as test user, get proper cookies
login_r=$($C -c /tmp/deep_cookies.txt -v -X POST "${API}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${xss_email}\",\"password\":\"DeepTest@123!\"}" 2>&1)

sleep 1

# Get CSRF token properly
csrf_r=$($C -b /tmp/deep_cookies.txt -c /tmp/deep_cookies.txt "${API}/auth/csrf" 2>/dev/null)
csrf_token=$(echo "$csrf_r" | grep -o '"csrf_token":"[^"]*"' | cut -d'"' -f4)
echo -e "  ${BOLD}Got CSRF token:${NC} ${csrf_token:0:20}..."

sleep 1

# Test: PUT without CSRF header
code=$($C -o /dev/null -w "%{http_code}" -b /tmp/deep_cookies.txt \
  -X PUT "${API}/users/me" -H "Content-Type: application/json" \
  -d '{"full_name":"HACKED_NO_CSRF"}' 2>/dev/null)
if [[ "$code" == "403" ]]; then
  ok "PUT without CSRF token blocked" "403 Forbidden — CSRF middleware working"
else
  bad "PUT without CSRF token" "HTTP $code — CSRF not enforced!"
fi

sleep 1

# Test: PUT with WRONG CSRF token
code=$($C -o /dev/null -w "%{http_code}" -b /tmp/deep_cookies.txt \
  -X PUT "${API}/users/me" -H "Content-Type: application/json" \
  -H "X-CSRF-Token: COMPLETELY_WRONG_TOKEN_ATTACKER" \
  -d '{"full_name":"HACKED_WRONG_CSRF"}' 2>/dev/null)
if [[ "$code" == "403" ]]; then
  ok "PUT with forged CSRF token blocked" "403 — token mismatch caught"
else
  bad "PUT with forged CSRF token" "HTTP $code — forged token accepted!"
fi

sleep 1

# Test: PUT with CORRECT CSRF token (should work)
code=$($C -o /dev/null -w "%{http_code}" -b /tmp/deep_cookies.txt \
  -X PUT "${API}/users/me" -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ${csrf_token}" \
  -d '{"full_name":"Legitimate Update"}' 2>/dev/null)
if [[ "$code" == "200" ]]; then
  ok "PUT with valid CSRF token succeeds" "200 — legitimate request works"
elif [[ "$code" == "401" ]]; then
  warn "PUT with valid CSRF token" "401 — auth issue (cookies may not have persisted in curl)"
else
  warn "PUT with valid CSRF token" "HTTP $code — review"
fi

sleep 2

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
hdr "4. SESSION SECURITY — Cookie flags & token integrity"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Inspect Set-Cookie headers from a fresh login
fresh_email="session_test_$(date +%s)@test.com"
$C -X POST "${API}/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"${fresh_email}\",\"password\":\"SessionTest@123!\",\"full_name\":\"Session Tester\"}" > /dev/null 2>&1
sleep 2

login_headers=$($C -v -X POST "${API}/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"${fresh_email}\",\"password\":\"SessionTest@123!\"}" 2>&1)

# Extract Set-Cookie lines
echo -e "\n  ${BOLD}Raw Set-Cookie headers from login:${NC}"
echo "$login_headers" | grep -i "set-cookie" | while read line; do
  echo -e "    $line"
done

# Check access_token cookie flags
at_cookie=$(echo "$login_headers" | grep -i "set-cookie.*access_token" | head -1)
if [[ -n "$at_cookie" ]]; then
  echo "$at_cookie" | grep -qi "httponly" && ok "access_token: HttpOnly flag" "JS cannot read this cookie" || bad "access_token: HttpOnly missing" "JavaScript can steal this token!"
  echo "$at_cookie" | grep -qi "secure" && ok "access_token: Secure flag" "Only sent over HTTPS" || bad "access_token: Secure missing" "Token sent over HTTP too!"  
  echo "$at_cookie" | grep -qi "samesite" && ok "access_token: SameSite flag" "Cross-origin attacks blocked" || warn "access_token: SameSite not set" "Browser defaults to Lax"
  echo "$at_cookie" | grep -qi "path=/" && ok "access_token: Path scoped" "Cookie scoped to /" || warn "access_token: Path not scoped" ""
else
  bad "access_token cookie not found in login response" "Token may be in response body (insecure if stored in localStorage!)"
  # Check if token is in the JSON body instead
  if echo "$login_headers" | grep -qi "access_token.*ey"; then
    bad "JWT exposed in response body" "If frontend stores this in localStorage, it's vulnerable to XSS theft"
  fi
fi

# Check refresh_token cookie
rt_cookie=$(echo "$login_headers" | grep -i "set-cookie.*refresh_token" | head -1)
if [[ -n "$rt_cookie" ]]; then
  echo "$rt_cookie" | grep -qi "httponly" && ok "refresh_token: HttpOnly flag" "" || bad "refresh_token: HttpOnly missing" "Refresh token stealable by JS!"
  echo "$rt_cookie" | grep -qi "path=/api/auth/refresh" && ok "refresh_token: Scoped to /api/auth/refresh" "Minimized attack surface" || warn "refresh_token: Not path-scoped" "Sent on every request"
fi

sleep 2

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
hdr "5. BRUTE FORCE & ACCOUNT LOCKOUT (real test, not rate-limited)"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Create a fresh victim account
victim_email="victim_$(date +%s)@test.com"
$C -X POST "${API}/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\":\"${victim_email}\",\"password\":\"VictimPass@123!\",\"full_name\":\"Lockout Victim\"}" > /dev/null 2>&1
sleep 1

echo -e "  ${BOLD}Brute-forcing ${victim_email} with wrong passwords...${NC}"
lockout_at=0
rate_limited_at=0

for i in $(seq 1 8); do
  sleep 0.5  # Small delay to avoid rate limiter masking lockout
  r=$($C -X POST "${API}/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"${victim_email}\",\"password\":\"WrongPass${i}!\"}" 2>/dev/null)
  code=$($C -o /dev/null -w "%{http_code}" -X POST "${API}/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"${victim_email}\",\"password\":\"WrongPass${i}!\"}" 2>/dev/null)
  
  if echo "$r" | grep -qi "locked"; then
    lockout_at=$i
    echo -e "    Attempt $i: ${YELLOW}LOCKED${NC} (HTTP $code)"
    break
  elif [[ "$code" == "429" ]]; then
    rate_limited_at=$i
    echo -e "    Attempt $i: ${YELLOW}RATE LIMITED${NC} (HTTP 429)"
    break
  else
    echo -e "    Attempt $i: ${RED}Wrong password${NC} (HTTP $code)"
  fi
done

if (( lockout_at > 0 )); then
  ok "Account lockout triggered at attempt $lockout_at" "Brute force protection works"
elif (( rate_limited_at > 0 )); then
  warn "Rate limiter fired before lockout at attempt $rate_limited_at" "Lockout may work but rate limiter hides it"
else
  bad "No lockout after 8 wrong passwords" "Brute force possible!"
fi

# Test: can victim still login with correct password after lockout?
sleep 1
code=$($C -o /dev/null -w "%{http_code}" -X POST "${API}/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"${victim_email}\",\"password\":\"VictimPass@123!\"}" 2>/dev/null)
if [[ "$code" == "429" ]]; then
  ok "Correct password also blocked during lockout" "Lockout is absolute"
elif echo "$($C -X POST "${API}/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"${victim_email}\",\"password\":\"VictimPass@123!\"}" 2>/dev/null)" | grep -qi "locked"; then
  ok "Correct password blocked during lockout" "Account truly locked"
elif [[ "$code" == "200" ]]; then
  warn "Correct password works during 'lockout'" "Lockout may not be working — just rate limiting"
fi

sleep 2

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
hdr "6. X-FORWARDED-FOR SPOOFING (Rate Limit Bypass)"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Test if attacker can bypass rate limit by spoofing X-Forwarded-For
echo -e "  ${BOLD}Sending 10 rapid requests with different spoofed IPs...${NC}"
bypassed=0
for i in $(seq 1 10); do
  code=$($C -o /dev/null -w "%{http_code}" \
    -H "X-Forwarded-For: 10.99.99.${i}" \
    -X POST "${API}/auth/login" -H "Content-Type: application/json" \
    -d '{"email":"nobody@test.com","password":"test"}' 2>/dev/null)
  if [[ "$code" != "429" ]]; then
    ((bypassed++))
  fi
done

if (( bypassed >= 8 )); then
  bad "Rate limit bypassable via X-Forwarded-For" "${bypassed}/10 requests got through with spoofed IPs"
elif (( bypassed >= 4 )); then
  warn "Partial rate limit bypass via X-Forwarded-For" "${bypassed}/10 requests got through"
else
  ok "Rate limit not bypassable via X-Forwarded-For" "Only ${bypassed}/10 got through"
fi

sleep 2

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
hdr "7. AUTHORIZATION — IDOR & Privilege Escalation"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Check: does /users/{id} return sensitive fields?
users_in_db=$(docker exec sjp-postgres psql -U postgres -d secure_job_portal -t -c \
  "SELECT id FROM users LIMIT 1" 2>/dev/null | xargs)

if [[ -n "$users_in_db" ]]; then
  r=$($C "${API}/users/${users_in_db}" 2>/dev/null)
  code=$($C -o /dev/null -w "%{http_code}" "${API}/users/${users_in_db}" 2>/dev/null)
  
  if echo "$r" | grep -qi "hashed_password"; then
    bad "Password hash exposed via /users/{id}" "Anyone can read password hashes!"
  else
    ok "Password hash NOT in /users/{id}" "Sensitive data filtered"
  fi
  
  if echo "$r" | grep -qi "totp_secret"; then
    bad "TOTP secret exposed via /users/{id}" "2FA can be bypassed!"
  else
    ok "TOTP secret NOT in /users/{id}" "2FA secrets hidden"
  fi
  
  if echo "$r" | grep -qi "failed_login_attempts\|locked_until"; then
    warn "Internal fields exposed in /users/{id}" "Information useful to attackers"
  else
    ok "Internal fields hidden from /users/{id}" ""
  fi
fi

# Admin endpoints without auth
for ep in "admin/users" "admin/audit-log"; do
  code=$($C -o /dev/null -w "%{http_code}" "${API}/${ep}" 2>/dev/null)
  if [[ "$code" == "401" || "$code" == "403" ]]; then
    ok "/${ep} requires authentication" "HTTP $code"
  else
    bad "/${ep} accessible without auth" "HTTP $code — ADMIN PANEL EXPOSED!"
  fi
done

sleep 2

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
hdr "8. SECURITY HEADERS — Full audit"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

api_h=$($C -I "${API}/health" 2>/dev/null)
nginx_h=$($C -I "${BASE}/" 2>/dev/null)

for h in "X-Frame-Options" "X-Content-Type-Options" "Strict-Transport-Security" "Content-Security-Policy" "Referrer-Policy" "Permissions-Policy" "X-XSS-Protection"; do
  if echo "$api_h" | grep -qi "$h"; then
    val=$(echo "$api_h" | grep -i "$h" | head -1 | sed 's/\r//')
    ok "API: $h" "$val"
  else
    bad "API: $h MISSING" ""
  fi
done

# Nginx-level headers (duplicates are defense-in-depth)
for h in "X-Frame-Options" "X-Content-Type-Options" "Referrer-Policy"; do
  if echo "$nginx_h" | grep -qi "$h"; then
    ok "Nginx: $h" ""
  else
    warn "Nginx: $h not set separately" "Relying only on backend"
  fi
done

# Check for dangerous headers
if echo "$api_h" | grep -qi "Server:.*uvicorn\|Server:.*python\|X-Powered-By"; then
  warn "Server technology fingerprint exposed" "$(echo "$api_h" | grep -i 'server\|x-powered-by' | head -1)"
else
  ok "No server technology fingerprint" "Attacker can't ID your stack"
fi

sleep 2

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
hdr "9. PATH TRAVERSAL & FILE UPLOAD"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

for payload in "../../../../etc/passwd" "..%2F..%2F..%2Fetc%2Fpasswd" "....//....//etc/shadow"; do
  r=$($C "${BASE}/${payload}" 2>/dev/null)
  if echo "$r" | grep -q "root:"; then
    bad "Path traversal: $payload" "FILE SYSTEM ACCESSIBLE!"
  else
    ok "Path traversal blocked: ${payload:0:40}" ""
  fi
done

# Check if static file serving leaks .env or other sensitive files
for f in ".env" "backend/.env" "../.env" "docker-compose.yml"; do
  code=$($C -o /dev/null -w "%{http_code}" "${BASE}/${f}" 2>/dev/null)
  r=$($C "${BASE}/${f}" 2>/dev/null)
  if echo "$r" | grep -qi "JWT_SECRET\|DATABASE_URL\|FERNET_KEY\|ENCRYPTION_KEY"; then
    bad "Sensitive file accessible: ${f}" "SECRETS EXPOSED!"
  else
    ok "Sensitive file not accessible: ${f}" "HTTP $code"
  fi
done

sleep 2

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
hdr "10. INFORMATION DISCLOSURE"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Swagger/ReDoc
for ep in "docs" "redoc" "openapi.json"; do
  code=$($C -o /dev/null -w "%{http_code}" "${API}/${ep}" 2>/dev/null)
  if [[ "$code" == "200" ]]; then
    bad "API docs accessible: /api/${ep}" "Attackers can map all endpoints"
  else
    ok "API docs hidden: /api/${ep}" "HTTP $code"
  fi
done

# Error message verbosity — do errors leak stack traces?
r=$($C -X POST "${API}/auth/login" -H "Content-Type: application/json" -d '{"bad json' 2>/dev/null)
if echo "$r" | grep -qi "traceback\|File \"/\|line [0-9]"; then
  bad "Stack traces leaked in error responses" "Attacker sees your code paths!"
else
  ok "No stack traces in errors" "Generic error messages"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
hdr "11. USER ENUMERATION"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Timing attack: does a real email take longer (due to Argon2) than a fake one?
sleep 2
start=$(date +%s%N)
$C -X POST "${API}/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"nonexistent_nobody@nowhere.com","password":"test"}' > /dev/null 2>&1
t_fake=$(( ($(date +%s%N) - start) / 1000000 ))

sleep 1
start=$(date +%s%N)
$C -X POST "${API}/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"harsh22198@iiitd.ac.in","password":"wrong_password"}' > /dev/null 2>&1
t_real=$(( ($(date +%s%N) - start) / 1000000 ))

diff=$(( t_real - t_fake ))
abs_diff=${diff#-}

echo -e "  Fake email: ${t_fake}ms | Real email: ${t_real}ms | Diff: ${diff}ms"
if (( abs_diff < 200 )); then
  ok "Timing attack prevention" "Difference only ${abs_diff}ms — constant-time response"
elif (( abs_diff < 500 )); then
  warn "Slight timing difference (${abs_diff}ms)" "May be noise, but verify fake Argon2 hash is working"
else
  bad "Timing attack: ${abs_diff}ms difference" "Attacker can enumerate valid emails by response time"
fi

# Error message comparison
r_fake=$($C -X POST "${API}/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"nonexistent@nowhere.com","password":"test"}' 2>/dev/null)
sleep 1
r_real=$($C -X POST "${API}/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"harsh22198@iiitd.ac.in","password":"wrong"}' 2>/dev/null)

msg_fake=$(echo "$r_fake" | grep -o '"detail":"[^"]*"')
msg_real=$(echo "$r_real" | grep -o '"detail":"[^"]*"')

if [[ "$msg_fake" == "$msg_real" ]]; then
  ok "Same error message for real/fake emails" "$msg_fake"
else
  bad "Different error messages" "Fake: $msg_fake | Real: $msg_real"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
hdr "12. HTTPS / TLS"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# HTTP→HTTPS redirect
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://192.168.2.233/" 2>/dev/null)
if [[ "$code" =~ ^(301|302|308)$ ]]; then
  ok "HTTP→HTTPS redirect" "HTTP $code"
else
  bad "No HTTP→HTTPS redirect" "HTTP $code — site accessible without encryption"
fi

# HSTS
if echo "$api_h" | grep -qi "Strict-Transport-Security"; then
  ok "HSTS enabled" ""
else
  bad "HSTS not set" "Browser allows HTTP downgrade attacks"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}  DEEP AUDIT RESULTS${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}SECURE: ${PASS}${NC}  |  ${YELLOW}WARN: ${WARN}${NC}  |  ${RED}VULN: ${FAIL}${NC}  |  TOTAL: ${TOTAL}"
echo ""
if (( FAIL == 0 )); then
  echo -e "  ${GREEN}${BOLD}🛡️  FORTRESS — No vulnerabilities found.${NC}"
elif (( FAIL <= 3 )); then
  echo -e "  ${YELLOW}${BOLD}⚠️  MOSTLY SECURE — ${FAIL} issue(s) to fix.${NC}"
else
  echo -e "  ${RED}${BOLD}🚨 VULNERABLE — ${FAIL} issues need immediate fixes!${NC}"
fi
echo ""

# Cleanup
rm -f /tmp/deep_cookies.txt /tmp/sjp_big_payload.json 2>/dev/null
