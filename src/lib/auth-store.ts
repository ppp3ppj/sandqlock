import { LazyStore } from "@tauri-apps/plugin-store";

const store = new LazyStore("auth.json");

export async function getToken(): Promise<string | null> {
  return (await store.get<string>("token")) ?? null;
}

export async function saveToken(token: string): Promise<void> {
  await store.set("token", token);
}

export async function clearToken(): Promise<void> {
  await store.delete("token");
}
