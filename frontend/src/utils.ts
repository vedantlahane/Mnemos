export function nanoid(size = 21): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let id = ""

  for (let i = 0; i < size; i += 1) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }

  return id
}
