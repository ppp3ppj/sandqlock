import { createSignal, onMount, Show } from "solid-js";
import { initTheme } from "./theme";
import ThemeSelect from "./ThemeSelect";
import LoginPage from "./pages/LoginPage";
import "./App.css";

function App() {
  const [loggedIn, setLoggedIn] = createSignal(false);

  onMount(() => initTheme());

  return (
    <Show when={loggedIn()} fallback={<LoginPage onLogin={() => setLoggedIn(true)} />}>
      <div class="navbar bg-base-100 shadow-sm px-4">
        <div class="flex-1">
          <span class="font-semibold">SandQlock</span>
        </div>
        <div class="flex-none">
          <ThemeSelect />
        </div>
      </div>

      <main class="flex flex-col items-center justify-center gap-6 p-8">
        <h1 class="text-2xl font-bold">Welcome back!</h1>
        <p class="text-base-content/60 text-sm">You are now signed in.</p>
      </main>
    </Show>
  );
}

export default App;
