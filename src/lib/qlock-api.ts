import { fetch } from "@tauri-apps/plugin-http";

const BASE_URL = "http://localhost:4000";

export async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/json/users/sign_in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
    body: JSON.stringify({ data: { email, password } }),
  });

  if (res.status === 401) throw new Error("Invalid email or password.");
  if (!res.ok) throw new Error("Login failed. Please try again.");

  const body = await res.json();
  if (!body.token) throw new Error("Login failed. Please try again.");
  return body.token as string;
}
