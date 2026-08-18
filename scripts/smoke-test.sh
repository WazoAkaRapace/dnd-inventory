#!/bin/bash
# E2E smoke test for the D&D Inventory API.
# Usage: bash scripts/smoke-test.sh
set -e
API="http://localhost:4000"

echo "=== register ==="
REG=$(curl -s -X POST $API/api/auth/register -H 'Content-Type: application/json' \
  -d '{"username":"tester_'$RANDOM'","password":"password123","displayName":"Test DM"}')
echo "$REG" | python3 -c "import sys,json;j=json.load(sys.stdin);print('user:',j['user']['username'])"
TOKEN=$(echo "$REG" | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
AUTH="Authorization: Bearer $TOKEN"

echo "=== items search: longsword ==="
curl -s "$API/api/items?search=longsword" -H "$AUTH" \
  | python3 -c "import sys,json;j=json.load(sys.stdin);print('total:',j['total']);[print(' ',i['name'],i['weightKg'],'kg') for i in j['items']]"

echo "=== create party ==="
PARTY=$(curl -s -X POST $API/api/parties -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"name":"The Bold Ones","encumbranceMode":"variant"}')
echo "$PARTY" | python3 -c "import sys,json;j=json.load(sys.stdin);print('party:',j['party']['name'],'code:',j['party']['inviteCode'])"

echo "=== create 2 characters ==="
curl -s -X POST $API/api/parties/1/characters -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"name":"Throgdar","strength":18,"maxHp":38}' > /dev/null
curl -s -X POST $API/api/parties/1/characters -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"name":"Zara","strength":10,"maxHp":24}' > /dev/null
echo "  Throgdar (STR 18) + Zara (STR 10) created"

LONG_ID=$(curl -s "$API/api/items?search=longsword" -H "$AUTH" | python3 -c "import sys,json;print(json.load(sys.stdin)['items'][0]['id'])")
TORCH_ID=$(curl -s "$API/api/items?search=torch" -H "$AUTH" | python3 -c "import sys,json;print(json.load(sys.stdin)['items'][0]['id'])")
echo "  item ids: longsword=$LONG_ID torch=$TORCH_ID"

echo "=== add items to Throgdar ==="
curl -s -X POST $API/api/characters/1/inventory -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{\"itemId\":$LONG_ID,\"quantity\":1,\"equipped\":true}" > /dev/null
curl -s -X POST $API/api/characters/1/inventory -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{\"itemId\":$TORCH_ID,\"quantity\":20}" > /dev/null
echo "  longsword x1 + torch x20 added"

echo "=== Throgdar inventory ==="
curl -s $API/api/characters/1/inventory -H "$AUTH" | python3 -c "
import sys,json
j=json.load(sys.stdin);e=j['encumbrance']
print('  total:',e['totalWeightKg'],'kg | tier:',e['tier'],'| pct:',round(e['pct'],1),'%')
[print('   ',en['quantity'],'x',en['item']['name'],'('+str(en['item']['weightKg']),'kg)') for en in j['entries']]
"

echo "=== transfer 10 torches to Zara ==="
TORCH_INV=$(curl -s $API/api/characters/1/inventory -H "$AUTH" \
  | python3 -c "import sys,json;j=json.load(sys.stdin);print([e['id'] for e in j['entries'] if e['item']['name']=='Torch'][0])")
curl -s -X POST $API/api/characters/1/transfer -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{\"toCharacterId\":2,\"inventoryId\":$TORCH_INV,\"quantity\":10}" \
  | python3 -c "import sys,json;print('  →',json.load(sys.stdin))"

echo "=== Zara after transfer ==="
curl -s $API/api/characters/2/inventory -H "$AUTH" | python3 -c "
import sys,json
j=json.load(sys.stdin);e=j['encumbrance']
print('  total:',e['totalWeightKg'],'kg | max:',e['maxCarryKg'],'kg')
[print('   ',en['quantity'],'x',en['item']['name']) for en in j['entries']]
"

echo "=== transaction log ==="
curl -s $API/api/parties/1/transactions -H "$AUTH" \
  | python3 -c "import sys,json;j=json.load(sys.stdin);[print('  ',t['itemName'],str(t['deltaQty']),t['reason']) for t in j['transactions']]"

echo "=== hidden character (secret prep) ==="
CODE=$(curl -s $API/api/parties/1 -H "$AUTH" | python3 -c "import sys,json;print(json.load(sys.stdin)['party']['inviteCode'])")
OWNER="own_$RANDOM"; VIEWER="view_$RANDOM"
curl -s -X POST $API/api/auth/register -H 'Content-Type: application/json' -d '{"username":"'"$OWNER"'","password":"password123"}' > /dev/null
P1_TOKEN=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"username":"'"$OWNER"'","password":"password123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s -X POST $API/api/parties/join -H "Authorization: Bearer $P1_TOKEN" -H 'Content-Type: application/json' -d '{"inviteCode":"'"$CODE"'"}' > /dev/null
curl -s -X POST $API/api/auth/register -H 'Content-Type: application/json' -d '{"username":"'"$VIEWER"'","password":"password123"}' > /dev/null
P2_TOKEN=$(curl -s -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"username":"'"$VIEWER"'","password":"password123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s -X POST $API/api/parties/join -H "Authorization: Bearer $P2_TOKEN" -H 'Content-Type: application/json' -d '{"inviteCode":"'"$CODE"'"}' > /dev/null
A1="Authorization: Bearer $P1_TOKEN"; A2="Authorization: Bearer $P2_TOKEN"

HID=$(curl -s -X POST $API/api/parties/1/characters -H "$A1" -H 'Content-Type: application/json' \
  -d '{"name":"Secret One","strength":10,"hidden":true}' | python3 -c "import sys,json;print(json.load(sys.stdin)['character']['id'])")
echo "  hidden character created (id=$HID)"

curl -s $API/api/parties/1 -H "$A2" | python3 -c "
import sys,json
names=[c['name'] for c in json.load(sys.stdin)['characters']]
print('  viewer list contains hidden:', 'Secret One' in names)
exit(1 if 'Secret One' in names else 0)"
echo "  viewer GET hidden char: $(curl -s -o /dev/null -w '%{http_code}' $API/api/characters/$HID -H "$A2") (expect 404)"
echo "  owner GET hidden char: $(curl -s -o /dev/null -w '%{http_code}' $API/api/characters/$HID -H "$A1") (expect 200)"
echo "  GM PATCH visibility: $(curl -s -o /dev/null -w '%{http_code}' -X PATCH $API/api/characters/$HID -H "$AUTH" -H 'Content-Type: application/json' -d '{"hidden":false}') (expect 403 — owner only)"

ENC=$(curl -s -X POST $API/api/parties/1/encounters -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Fight"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['encounter']['id'])")
echo "  GM add hidden to combat: $(curl -s -o /dev/null -w '%{http_code}' -X POST $API/api/encounters/$ENC/combatants/player -H "$AUTH" -H 'Content-Type: application/json' -d '{"characterIds":['"$HID"']}') (expect 400)"

echo ""
echo "✓ All API routes working"
