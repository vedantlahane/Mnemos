import asyncio
from app.db.repo import repo
async def check():
  res = await repo.get_workspace('500d54b7-f1b5-41b6-ba3b-d84333bc62ae')
  print(res)
asyncio.run(check())