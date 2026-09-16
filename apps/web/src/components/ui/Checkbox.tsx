import type { InputHTMLAttributes } from "react";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
};

export function Checkbox({ id, label, className = "", ...props }: CheckboxProps) {
  const checkboxId = id ?? props.name;
  if (!checkboxId) {
    throw new Error("Checkbox necesita id o name para asociar su label.");
  }

  return (
    <label className={`ui-checkbox ${className}`.trim()} htmlFor={checkboxId}>
      <input {...props} id={checkboxId} type="checkbox" />
      <span className="ui-checkbox__box" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}