import { createSignal, Show } from "solid-js";
import { signIn } from "../lib/qlock-api";
import { saveToken } from "../lib/auth-store";

interface Props {
  onLogin: (token: string) => void;
}

interface Errors {
  identifier?: string;
  password?: string;
}

/* Bauhaus palette */
const RED    = "#E53935";
const YELLOW = "#FDD835";
const BLUE   = "#1E88E5";
const BLACK  = "#212121";
const WHITE  = "#FAFAFA";
const GRAY   = "#9E9E9E";
const BORDER = "#E0E0E0";

export default function LoginPage(props: Props) {
  const [identifier, setIdentifier] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [errors, setErrors] = createSignal<Errors>({});
  const [apiError, setApiError] = createSignal<string | undefined>();
  const [rememberMe, setRememberMe] = createSignal(false);

  function validate(): boolean {
    const e: Errors = {};
    if (!identifier().trim()) e.identifier = "Email or username is required.";
    if (!password()) e.password = "Password is required.";
    else if (password().length < 6) e.password = "Min 6 characters.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true); setApiError(undefined);
    try {
      const token = await signIn(identifier(), password());
      if (rememberMe()) await saveToken(token);
      props.onLogin(token);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="min-h-screen flex flex-col" style={`background:${WHITE}`}>

      {/* ── Top Bauhaus composition bar ─────────────────── */}
      <div class="flex items-stretch h-16 shrink-0" style={`background:${BLACK}`}>

        {/* Logo section */}
        <div class="flex items-center gap-3 px-6 flex-1">
          {/* Red circle — Bauhaus primary shape */}
          <div class="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
               style={`background:${RED}`}>
            <i class="ri-timer-line text-sm" style={`color:${WHITE}`} />
          </div>
          <span class="font-black text-lg uppercase tracking-widest" style={`color:${WHITE}`}>
            SandQlock
          </span>
        </div>

        {/* Geometric color blocks (Bauhaus accent) */}
        <div class="flex shrink-0">
          <div class="w-10 h-full" style={`background:${RED}`} />
          <div class="w-10 h-full" style={`background:${YELLOW}`} />
          <div class="w-10 h-full" style={`background:${BLUE}`} />
        </div>
      </div>

      {/* ── Main layout ──────────────────────────────────── */}
      <div class="flex-1 flex">

        {/* Left: large geometric composition */}
        <div class="hidden lg:flex flex-col w-80 shrink-0 relative overflow-hidden"
             style={`background:${BLACK};border-right:1px solid #333`}>

          {/* Bauhaus geometric shapes — primary color blocks */}
          <div class="absolute inset-0 flex flex-col">
            {/* Large yellow block at top */}
            <div class="h-48" style={`background:${YELLOW}`} />
            {/* Red horizontal strip */}
            <div class="h-3" style={`background:${RED}`} />
            {/* Black remainder */}
            <div class="flex-1" style={`background:${BLACK}`} />
          </div>

          {/* Overlaid geometric shapes */}
          <div class="absolute" style="bottom:20%;left:50%;transform:translateX(-50%)">
            {/* Large circle */}
            <div class="w-32 h-32 rounded-full" style={`background:${BLUE}`} />
          </div>
          <div class="absolute" style="bottom:10%;right:16px">
            {/* Small square */}
            <div class="w-12 h-12" style={`background:${RED}`} />
          </div>

          {/* Typography as design element */}
          <div class="absolute bottom-10 left-6 right-6">
            <p class="font-black text-xs uppercase tracking-widest leading-relaxed"
               style={`color:rgba(250,250,250,0.3)`}>
              Form<br />Follows<br />Function
            </p>
          </div>
        </div>

        {/* Right: login form */}
        <div class="flex-1 flex items-center justify-center px-8 py-12">
          <div class="w-full" style="max-width:360px">

            {/* Section title */}
            <div class="mb-10">
              <p class="text-xs font-bold uppercase tracking-widest mb-2" style={`color:${GRAY}`}>
                Authentication
              </p>
              <h1 class="font-black text-2xl uppercase tracking-tight" style={`color:${BLACK}`}>
                Sign In
              </h1>
              {/* Red underline — Bauhaus accent */}
              <div class="mt-2 h-0.5 w-12" style={`background:${RED}`} />
            </div>

            <form onSubmit={handleSubmit} class="flex flex-col gap-8">

              {/* Email / Username */}
              <div>
                <label class="bh-label">Email or Username</label>
                <input
                  type="text"
                  class="bh-input"
                  style={errors().identifier ? `border-bottom-color:${RED}` : ""}
                  placeholder="you@example.com"
                  value={identifier()}
                  onInput={(e) => {
                    setIdentifier(e.currentTarget.value);
                    if (errors().identifier) setErrors(p => ({ ...p, identifier: undefined }));
                  }}
                  autocomplete="username"
                />
                <Show when={errors().identifier}>
                  <p class="mt-1 text-xs font-bold uppercase tracking-wide" style={`color:${RED}`}>
                    {errors().identifier}
                  </p>
                </Show>
              </div>

              {/* Password */}
              <div>
                <label class="bh-label">Password</label>
                <input
                  type="password"
                  class="bh-input"
                  style={errors().password ? `border-bottom-color:${RED}` : ""}
                  placeholder="••••••••"
                  value={password()}
                  onInput={(e) => {
                    setPassword(e.currentTarget.value);
                    if (errors().password) setErrors(p => ({ ...p, password: undefined }));
                  }}
                  autocomplete="current-password"
                />
                <Show when={errors().password}>
                  <p class="mt-1 text-xs font-bold uppercase tracking-wide" style={`color:${RED}`}>
                    {errors().password}
                  </p>
                </Show>
              </div>

              {/* Remember me */}
              <div>
                <button
                  type="button"
                  class="flex items-center gap-3"
                  style="background:transparent;border:none;cursor:pointer;padding:0"
                  onClick={() => setRememberMe(v => !v)}
                >
                  {/* Square checkbox */}
                  <div class="w-5 h-5 flex items-center justify-center"
                       style={rememberMe()
                         ? `background:${BLACK};border:2px solid ${BLACK}`
                         : `background:transparent;border:2px solid ${GRAY}`}>
                    <Show when={rememberMe()}>
                      <span style={`color:${WHITE};font-size:11px;font-weight:900`}>✓</span>
                    </Show>
                  </div>
                  <span class="text-xs font-bold uppercase tracking-wide"
                        style={`color:${rememberMe() ? BLACK : GRAY}`}>
                    Remember me
                  </span>
                </button>
              </div>

              {/* API Error */}
              <Show when={apiError()}>
                <div class="px-4 py-3 text-xs font-bold uppercase tracking-wide"
                     style={`background:${RED};color:${WHITE};border-left:4px solid #B71C1C`}>
                  {apiError()}
                </div>
              </Show>

              {/* Submit — black rectangle (Bauhaus pure function) */}
              <button
                type="submit"
                class="bh-btn bh-btn-lg w-full mt-2"
                style={`background:${BLACK};color:${WHITE}`}
                disabled={loading()}
              >
                {loading()
                  ? <div class="w-4 h-4 rounded-full animate-spin" style={`border:2px solid rgba(255,255,255,0.3);border-top-color:${WHITE}`} />
                  : "Sign In →"}
              </button>

            </form>

            {/* Divider — geometric */}
            <div class="flex items-center gap-4 my-8">
              <div class="flex-1 h-px" style={`background:${BORDER}`} />
              <div class="w-2 h-2" style={`background:${GRAY}`} />
              <div class="flex-1 h-px" style={`background:${BORDER}`} />
            </div>

            <p class="text-center text-xs font-bold uppercase tracking-wide" style={`color:${GRAY}`}>
              No account?{" "}
              <span class="underline" style={`color:${BLACK};cursor:pointer`}>
                Sign up via qlock web
              </span>
            </p>

          </div>
        </div>
      </div>

      {/* ── Bottom Bauhaus stripe ─────────────────────────── */}
      <div class="flex h-1.5 shrink-0">
        <div class="flex-1" style={`background:${RED}`} />
        <div class="flex-1" style={`background:${YELLOW}`} />
        <div class="flex-1" style={`background:${BLUE}`} />
        <div class="flex-1" style={`background:${BLACK}`} />
      </div>

    </div>
  );
}
