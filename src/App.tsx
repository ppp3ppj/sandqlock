import { createSignal, onMount, Show } from "solid-js";
import { initTheme } from "./theme";
import ThemeSelect from "./ThemeSelect";
import LoginPage from "./pages/LoginPage";
import { getToken, clearToken } from "./lib/auth-store";
import "./App.css";

function App() {
  const [loggedIn, setLoggedIn] = createSignal(false);
  const [checking, setChecking] = createSignal(true);

  onMount(async () => {
    initTheme();
    const token = await getToken();
    if (token) setLoggedIn(true);
    setChecking(false);
  });

  async function handleLogout() {
    await clearToken();
    setLoggedIn(false);
  }

  return (
    <Show when={!checking()} fallback={<div class="min-h-screen flex items-center justify-center"><span class="loading loading-spinner loading-lg" /></div>}>
      <Show when={loggedIn()} fallback={<LoginPage onLogin={() => setLoggedIn(true)} />}>
        <div class="navbar bg-base-100 shadow-sm px-4">
          <div class="flex-1">
            <span class="font-semibold">SandQlock</span>
          </div>
          <div class="flex-none gap-2">
            <ThemeSelect />
            <button class="btn btn-ghost btn-sm" onClick={handleLogout}>
              <i class="ri-logout-box-r-line" />
              Logout
            </button>
          </div>
        </div>

        <main class="flex flex-col items-center justify-center gap-6 p-8">
          <h1 class="text-2xl font-bold">Welcome back!</h1>
          <p class="text-base-content/60 text-sm">You are now signed in.</p>
        </main>
      </Show>
    </Show>
  );
}

export default App;
