import { load } from "@tauri-apps/plugin-store";

const STORE_FILE = "auth.json";
const TOKEN_KEY = "token";

export async function getToken(): Promise<string | null> {
  const store = await load(STORE_FILE);
  return (await store.get<string>(TOKEN_KEY)) ?? null;
}

export async function saveToken(token: string): Promise<void> {
  const store = await load(STORE_FILE);
  await store.set(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  const store = await load(STORE_FILE);
  await store.delete(TOKEN_KEY);
}
