import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label: string;
};

export function IconButton({ icon, label, className = "", ...props }: IconButtonProps) {
  return (
    <button {...props} className={`ui-icon-button ${className}`.trim()} type={props.type ?? "button"} aria-label={label}>
      {icon}
    </button>
  );
}