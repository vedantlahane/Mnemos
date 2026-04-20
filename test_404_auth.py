import urllib.request, json
req = urllib.request.Request('http://localhost:8000/api/workspaces/invalid_id/sync', data=json.dumps({'base_version': 1, 'scene': None}).encode(), headers={'Origin': 'http://localhost:5173', 'Content-Type': 'application/json', 'Authorization': 'Bearer asdf'}, method='POST')
try:
  r = urllib.request.urlopen(req)
  print(r.getcode())
except Exception as e:
  print(f'Code: {e.code}')
  print(e.headers)