"""Set a single Vercel env var. Reads the name + value from the environment
(OIE_KEY_NAME / OIE_KEY_VALUE) so the secret never appears in a command string
or in any output. Used by sync-keys-to-vercel.sh."""
import json, os, urllib.request, urllib.error

tok = json.load(open(os.path.expanduser("~/Library/Application Support/com.vercel.cli/auth.json")))["token"]
TEAM = "team_E2sqSaS38IuoT0ZhsegO04PS"
PID = "prj_fIErp8X38dhXTEsXR89vPV3WXdKJ"
name = os.environ["OIE_KEY_NAME"]
value = os.environ["OIE_KEY_VALUE"]

url = f"https://api.vercel.com/v10/projects/{PID}/env?teamId={TEAM}&upsert=true"
# Live provider credentials are scoped to production ONLY. Preview/development
# deployments are a wider, less-protected exposure surface (preview URLs, PR
# builds), so they must use their own sandbox/test keys or rely on DRY_RUN +
# missing-key fallbacks — never the live keys. (Least privilege: SOC 2 CC6.1/CC6.6.)
body = {"key": name, "value": value, "type": "encrypted", "target": ["production"]}
req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                            headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req) as r:
        print(f"ok {r.status}")
except urllib.error.HTTPError as e:
    print(f"err {e.code}")
    raise SystemExit(1)
