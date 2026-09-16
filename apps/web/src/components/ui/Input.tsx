import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function Input({ id, label, hint, error, className = "", ...props }: InputProps) {
  const inputId = id ?? props.name;
  if (!inputId) {
    throw new Error("Input necesita id o name para asociar su label.");
  }
  const describedBy = [hint ? `${inputId}-hint` : null, error ? `${inputId}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="ui-field">
      <label htmlFor={inputId}>{label}</label>
      <input
        {...props}
        id={inputId}
        className={`ui-input ${className}`.trim()}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
      />
      {hint ? <span id={`${inputId}-hint`} className="ui-field__hint">{hint}</span> : null}
      {error ? <span id={`${inputId}-error`} className="ui-field__error" role="alert">{error}</span> : null}
    </div>
  );
}