import { LoginForm } from "@/features/auth/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="auth-page" aria-labelledby="login-title">
      <div className="auth-page__intro">
        <p className="eyebrow">TaskFlow / acceso</p>
        <h1 id="login-title">Vuelve a lo esencial.</h1>
        <p>Un espacio personal para capturar, ordenar y terminar tus tareas.</p>
      </div>
      <LoginForm />
    </main>
  );
}