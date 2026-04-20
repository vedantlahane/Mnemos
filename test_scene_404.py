import urllib.request
req = urllib.request.Request('http://localhost:8000/api/workspaces/missing/scene', headers={'Origin': 'http://localhost:5173', 'Authorization': 'Bearer asdf'})
try:
  r = urllib.request.urlopen(req)
  print(r.getcode())
except Exception as e:
  print(f'Code: {e.code}')
  print(e.headers)