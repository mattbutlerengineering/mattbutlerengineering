export async function ping() {
  return fetch("https://status.example.com/health");
}
