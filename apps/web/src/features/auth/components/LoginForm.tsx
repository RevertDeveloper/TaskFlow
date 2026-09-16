"use client";

import { FormEvent, useState } from "react";

import { login, AccountsApiError } from "@/infrastructure/accounts/client";

export function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ identifier, password }, "/app/dashboard");
    } catch (requestError) {
      setError(
        requestError instanceof AccountsApiError
          ? requestError.message
          : "No se ha podido iniciar sesión. Inténtalo de nuevo.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <div className="auth-form__header">
        <p className="eyebrow">Cuenta Carlos Revert</p>
        <h2>Iniciar sesión</h2>
      </div>
      <label htmlFor="identifier">Email o usuario</label>
      <input
        id="identifier"
        name="identifier"
        type="text"
        autoComplete="username"
        value={identifier}
        onChange={(event) => setIdentifier(event.target.value)}
        required
      />
      <label htmlFor="password">Contraseña</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}