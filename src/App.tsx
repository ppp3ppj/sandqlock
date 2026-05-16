import { createSignal, onMount, Show } from "solid-js";
import { initTheme } from "./theme";
import LoginPage from "./pages/LoginPage";
import TimeEntriesPage from "./pages/TimeEntriesPage";
import { getToken, clearToken } from "./lib/auth-store";
import "./App.css";

function App() {
  const [loggedIn, setLoggedIn] = createSignal(false);
  const [checking, setChecking] = createSignal(true);
  const [token, setToken] = createSignal("");

  onMount(async () => {
    initTheme();
    const t = await getToken();
    if (t) {
      setToken(t);
      setLoggedIn(true);
    }
    setChecking(false);
  });

  async function handleLogout() {
    await clearToken();
    setToken("");
    setLoggedIn(false);
  }

  function handleLogin(t: string) {
    setToken(t);
    setLoggedIn(true);
  }

  return (
    <Show when={!checking()} fallback={<div class="min-h-screen flex items-center justify-center"><span class="loading loading-spinner loading-lg" /></div>}>
      <Show when={loggedIn()} fallback={<LoginPage onLogin={handleLogin} />}>
        <TimeEntriesPage token={token()} onLogout={handleLogout} />
      </Show>
    </Show>
  );
}

export default App;
