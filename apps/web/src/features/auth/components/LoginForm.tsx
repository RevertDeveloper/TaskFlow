import { accountsLoginUrl } from "@/infrastructure/accounts/client";

export function LoginForm({ next = "/" }: { next?: string }) {
  return (
    <section className="auth-form" aria-labelledby="accounts-login-title">
      <div className="auth-form__header">
        <p className="eyebrow">Cuenta Carlos Revert</p>
        <h2 id="accounts-login-title">Iniciar sesión</h2>
      </div>
      <p>La identidad, el registro y la recuperación de acceso se gestionan en Carlos Revert Cuenta.</p>
      <a className="auth-form__link" href={accountsLoginUrl(next)}>
        Continuar en Carlos Revert Cuenta
      </a>
    </section>
  );
}