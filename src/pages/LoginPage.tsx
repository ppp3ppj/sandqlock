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
    else if (password().length < 6) e.password = "Password must be at least 6 characters.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setApiError(undefined);
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
    <div class="min-h-screen flex flex-col items-center justify-center px-6 bg-base-200">
      <div class="card w-full max-w-sm bg-base-100 shadow-xl">
        <div class="card-body gap-5">

          {/* Logo / Title */}
          <div class="flex flex-col items-center gap-1 mb-2">
            <div class="text-4xl font-bold text-primary tracking-tight">SandQlock</div>
            <p class="text-sm text-base-content/50">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} class="flex flex-col gap-4">

            {/* Email or Username */}
            <label class="form-control w-full">
              <div class="label pb-1">
                <span class="label-text text-xs font-medium">Email or Username</span>
              </div>
              <label class={`input input-bordered flex items-center gap-2 ${errors().identifier ? "input-error" : ""}`}>
                <i class="ri-user-3-line text-base-content/40" />
                <input
                  type="text"
                  class="grow"
                  placeholder="you@example.com"
                  value={identifier()}
                  onInput={(e) => {
                    setIdentifier(e.currentTarget.value);
                    if (errors().identifier) setErrors((p) => ({ ...p, identifier: undefined }));
                  }}
                  autocomplete="username"
                />
              </label>
              {errors().identifier && (
                <div class="label pt-1">
                  <span class="label-text-alt text-error flex items-center gap-1">
                    <i class="ri-error-warning-line" />
                    {errors().identifier}
                  </span>
                </div>
              )}
            </label>

            {/* Password */}
            <label class="form-control w-full">
              <div class="label pb-1">
                <span class="label-text text-xs font-medium">Password</span>
              </div>
              <label class={`input input-bordered flex items-center gap-2 ${errors().password ? "input-error" : ""}`}>
                <i class="ri-lock-2-line text-base-content/40" />
                <input
                  type="password"
                  class="grow"
                  placeholder="••••••••"
                  value={password()}
                  onInput={(e) => {
                    setPassword(e.currentTarget.value);
                    if (errors().password) setErrors((p) => ({ ...p, password: undefined }));
                  }}
                  autocomplete="current-password"
                />
              </label>
              {errors().password && (
                <div class="label pt-1">
                  <span class="label-text-alt text-error flex items-center gap-1">
                    <i class="ri-error-warning-line" />
                    {errors().password}
                  </span>
                </div>
              )}
            </label>

            {/* Remember me */}
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                class="checkbox checkbox-sm checkbox-primary"
                checked={rememberMe()}
                onChange={(e) => setRememberMe(e.currentTarget.checked)}
              />
              <span class="text-sm">Remember me</span>
            </label>

            {/* API error */}
            <Show when={apiError()}>
              <div class="alert alert-error py-2 text-sm">
                <i class="ri-error-warning-line" />
                {apiError()}
              </div>
            </Show>

            {/* Submit */}
            <button
              type="submit"
              class="btn btn-primary w-full mt-1"
              disabled={loading()}
            >
              {loading() ? <span class="loading loading-spinner loading-sm" /> : "Sign in"}
            </button>

          </form>

          <div class="divider text-xs text-base-content/30 my-0">or</div>

          <p class="text-center text-sm text-base-content/50">
            Don't have an account?{" "}
            <a class="link link-primary font-medium">Sign up</a>
          </p>

        </div>
      </div>
    </div>
  );
}
