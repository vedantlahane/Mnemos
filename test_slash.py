import urllib.request, json
req = urllib.request.Request('http://localhost:8000/api/workspaces/500d54b7-f1b5-41b6-ba3b-d84333bc62ae/sync/', data=json.dumps({'base_version': 1, 'scene': None}).encode(), headers={'Origin': 'http://localhost:5173', 'Content-Type': 'application/json'}, method='POST')
try:
  urllib.request.urlopen(req)
except Exception as e:
  print(f'Code: {e.code}')
  print(e.headers)