import { useId, type ReactNode } from "react";

type Common = {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
};
/** Label, control, hint and error text laid out the same way everywhere. */
export function FieldShell({
  label,
  id,
  hint,
  error,
  required,
  className = "",
  children,
}: Common & { id: string; required?: boolean; children: ReactNode }) {
  return (
    <div className={`field ${error ? "has-error" : ""} ${className}`}>
      <label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </label>
      {children}
      <small
        className={error ? "error-text" : ""}
        role={error ? "alert" : undefined}
      >
        {error || hint}
      </small>
    </div>
  );
}
type InputProps = Common &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">;
export function TextField({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: InputProps) {
  const auto = useId();
  const key = id || auto;
  return (
    <FieldShell
      label={label}
      id={key}
      hint={hint}
      error={error}
      required={props.required}
      className={className}
    >
      <input {...props} id={key} aria-invalid={!!error} className="control" />
    </FieldShell>
  );
}
const today = () => new Date().toISOString().slice(0, 10);
/** Date picker: calendar icon, min/max limits and a Today shortcut. */
export function DateField({
  label,
  hint,
  error,
  className,
  id,
  onChange,
  value,
  min,
  max,
  required,
  disabled,
  showToday = true,
}: Omit<InputProps, "type" | "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  showToday?: boolean;
}) {
  const auto = useId();
  const key = id || auto;
  const t = today();
  const canToday =
    showToday &&
    !disabled &&
    value !== t &&
    (!min || t >= String(min)) &&
    (!max || t <= String(max));
  return (
    <FieldShell
      label={label}
      id={key}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <div className="control-date">
        <svg
          className="control-icon"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
        >
          <path
            d="M7 2v3M17 2v3M3.5 9h17M5 4.5h14A1.5 1.5 0 0 1 20.5 6v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <input
          id={key}
          type="date"
          className="control"
          value={value}
          min={min}
          max={max}
          required={required}
          disabled={disabled}
          aria-invalid={!!error}
          onChange={(e) => onChange(e.target.value)}
        />
        {canToday && (
          <button
            type="button"
            className="control-today"
            onClick={() => onChange(t)}
          >
            Today
          </button>
        )}
      </div>
    </FieldShell>
  );
}
type SelectProps = Common &
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "className">;
export function SelectField({
  label,
  hint,
  error,
  className,
  id,
  children,
  ...props
}: SelectProps) {
  const auto = useId();
  const key = id || auto;
  return (
    <FieldShell
      label={label}
      id={key}
      hint={hint}
      error={error}
      required={props.required}
      className={className}
    >
      <select
        {...props}
        id={key}
        aria-invalid={!!error}
        className={`control ${props.multiple ? "multi" : "control-select"}`}
      >
        {children}
      </select>
    </FieldShell>
  );
}
type AreaProps = Common &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className">;
export function TextAreaField({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: AreaProps) {
  const auto = useId();
  const key = id || auto;
  return (
    <FieldShell
      label={label}
      id={key}
      hint={hint}
      error={error}
      required={props.required}
      className={`full ${className || ""}`}
    >
      <textarea
        {...props}
        id={key}
        aria-invalid={!!error}
        className="control"
      />
    </FieldShell>
  );
}
