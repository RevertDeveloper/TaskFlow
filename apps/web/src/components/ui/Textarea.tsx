import type { TextareaHTMLAttributes } from "react";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function Textarea({ id, label, hint, error, className = "", ...props }: TextareaProps) {
  const textareaId = id ?? props.name;
  if (!textareaId) {
    throw new Error("Textarea necesita id o name para asociar su label.");
  }
  const describedBy = [hint ? `${textareaId}-hint` : null, error ? `${textareaId}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="ui-field">
      <label htmlFor={textareaId}>{label}</label>
      <textarea
        {...props}
        id={textareaId}
        className={`ui-textarea ${className}`.trim()}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
      />
      {hint ? <span id={`${textareaId}-hint`} className="ui-field__hint">{hint}</span> : null}
      {error ? <span id={`${textareaId}-error`} className="ui-field__error" role="alert">{error}</span> : null}
    </div>
  );
}