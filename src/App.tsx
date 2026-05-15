import { createSignal, onMount } from "solid-js";
import logo from "./assets/logo.svg";
import { invoke } from "@tauri-apps/api/core";
import { initTheme } from "./theme";
import ThemeSelect from "./ThemeSelect";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = createSignal("");
  const [name, setName] = createSignal("");

  onMount(() => initTheme());

  async function greet() {
    setGreetMsg(await invoke("greet", { name: name() }));
  }

  return (
    <>
      <div class="navbar bg-base-100 shadow-sm px-4">
        <div class="flex-1">
          <span class="font-semibold">SandQlock</span>
        </div>
        <div class="flex-none">
          <ThemeSelect />
        </div>
      </div>

      <main class="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
        <h1 class="text-3xl font-bold">Welcome to Tauri + Solid</h1>

        <div class="flex gap-4">
          <a href="https://vite.dev" target="_blank">
            <img src="/vite.svg" class="h-20 p-4 transition-all duration-300 hover:drop-shadow-[0_0_2em_#747bff]" alt="Vite logo" />
          </a>
          <a href="https://tauri.app" target="_blank">
            <img src="/tauri.svg" class="h-20 p-4 transition-all duration-300 hover:drop-shadow-[0_0_2em_#24c8db]" alt="Tauri logo" />
          </a>
          <a href="https://solidjs.com" target="_blank">
            <img src={logo} class="h-20 p-4 transition-all duration-300 hover:drop-shadow-[0_0_2em_#2f5d90]" alt="Solid logo" />
          </a>
        </div>

        <p class="text-base-content/70">Click on the Tauri, Vite, and Solid logos to learn more.</p>

        <form
          class="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            greet();
          }}
        >
          <input
            class="input input-bordered"
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="Enter a name..."
          />
          <button class="btn btn-primary" type="submit">Greet</button>
        </form>

        {greetMsg() && (
          <div class="alert alert-success w-auto">
            <span>{greetMsg()}</span>
          </div>
        )}
      </main>
    </>
  );
}

export default App;
