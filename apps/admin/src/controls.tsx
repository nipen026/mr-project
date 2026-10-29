import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

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
/** Popover anchored under a trigger; rendered in a portal so modals never clip it. */
function Popover({
  anchor,
  onClose,
  minWidth,
  fit,
  children,
  label,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  minWidth?: number;
  fit?: boolean;
  children: ReactNode;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({
    position: "fixed",
    top: 0,
    left: 0,
    opacity: 0,
  });
  const place = () => {
    const a = anchor.current?.getBoundingClientRect();
    const b = box.current;
    if (!a || !b) return;
    const gap = 6;
    const edge = 8;
    // scrollHeight is the full content height even when max-height is set.
    const natural = b.scrollHeight + 2;
    const below = window.innerHeight - a.bottom - gap - edge;
    const above = a.top - gap - edge;
    const up = below < natural && above > below;
    const viewport = window.innerHeight - edge * 2;
    // Too little room on either side: let it overlap the field instead of cutting it off.
    const roomy =
      (up ? above : below) >= (fit ? natural : Math.min(natural, 260));
    const room = roomy ? (up ? above : below) : viewport;
    const height = Math.min(natural, room);
    const width = fit ? b.offsetWidth : Math.max(a.width, minWidth || 0);
    const wanted = up ? a.top - gap - height : a.bottom + gap;
    setStyle({
      position: "fixed",
      left: Math.max(edge, Math.min(a.left, window.innerWidth - width - edge)),
      top: roomy
        ? wanted
        : Math.min(Math.max(wanted, edge), window.innerHeight - height - edge),
      ...(fit ? {} : { minWidth: width }),
      maxHeight: room,
      opacity: 1,
    });
  };
  useLayoutEffect(place, []);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const move = (e: Event) => {
      if (box.current?.contains(e.target as Node)) return;
      place();
    };
    document.addEventListener("mousedown", away);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", move, true);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", move, true);
    };
  }, []);
  return createPortal(
    <div
      ref={box}
      className="popover"
      style={style}
      role="dialog"
      aria-label={label}
    >
      {children}
    </div>,
    document.body,
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const shortMonth = (i: number) => months[i].slice(0, 3);
export const formatDate = (v: string) => {
  const d = parse(v);
  return d
    ? `${d.getDate()} ${shortMonth(d.getMonth())} ${d.getFullYear()}`
    : "";
};
function Calendar({
  value,
  min,
  max,
  onPick,
  onClear,
  onClose,
}: {
  value: string;
  min?: string;
  max?: string;
  onPick: (v: string) => void;
  onClear?: () => void;
  onClose: () => void;
}) {
  const todayIso = iso(new Date());
  const [focus, setFocus] = useState(parse(value) || new Date());
  const grid = useRef<HTMLDivElement>(null);
  const first = new Date(focus.getFullYear(), focus.getMonth(), 1);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first);
    d.setDate(1 - first.getDay() + i);
    return d;
  });
  const blocked = (d: Date) =>
    (!!min && iso(d) < min) || (!!max && iso(d) > max);
  const shift = (days: number, monthsBy = 0) => {
    const d = new Date(focus);
    if (monthsBy) {
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + monthsBy);
      d.setDate(
        Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()),
      );
    } else d.setDate(d.getDate() + days);
    setFocus(d);
  };
  useEffect(() => {
    grid.current
      ?.querySelector<HTMLButtonElement>('button[tabindex="0"]')
      ?.focus({ preventScroll: true });
  }, [focus]);
  const key = (e: React.KeyboardEvent) => {
    const map: Record<string, () => void> = {
      ArrowLeft: () => shift(-1),
      ArrowRight: () => shift(1),
      ArrowUp: () => shift(-7),
      ArrowDown: () => shift(7),
      PageUp: () => shift(0, e.shiftKey ? -12 : -1),
      PageDown: () => shift(0, e.shiftKey ? 12 : 1),
      Home: () => shift(-focus.getDay()),
      End: () => shift(6 - focus.getDay()),
      Escape: onClose,
    };
    if (map[e.key]) {
      e.preventDefault();
      e.stopPropagation();
      map[e.key]();
    }
  };
  const canToday = !blocked(new Date());
  return (
    <div className="cal" onKeyDown={key}>
      <div className="cal-head">
        <button
          type="button"
          className="cal-nav"
          aria-label="Previous year"
          onClick={() => shift(0, -12)}
        >
          «
        </button>
        <button
          type="button"
          className="cal-nav"
          aria-label="Previous month"
          onClick={() => shift(0, -1)}
        >
          ‹
        </button>
        <strong aria-live="polite">
          {months[focus.getMonth()]} {focus.getFullYear()}
        </strong>
        <button
          type="button"
          className="cal-nav"
          aria-label="Next month"
          onClick={() => shift(0, 1)}
        >
          ›
        </button>
        <button
          type="button"
          className="cal-nav"
          aria-label="Next year"
          onClick={() => shift(0, 12)}
        >
          »
        </button>
      </div>
      <div className="cal-week" aria-hidden="true">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="cal-grid" ref={grid} role="grid">
        {cells.map((d) => {
          const v = iso(d);
          const out = d.getMonth() !== focus.getMonth();
          return (
            <button
              type="button"
              key={v}
              role="gridcell"
              tabIndex={v === iso(focus) ? 0 : -1}
              disabled={blocked(d)}
              aria-selected={v === value}
              aria-label={`${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`}
              className={`cal-day${out ? " out" : ""}${v === value ? " selected" : ""}${v === todayIso ? " today" : ""}`}
              onClick={() => onPick(v)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="cal-foot">
        {onClear && value ? (
          <button type="button" onClick={onClear}>
            Clear
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={!canToday}
          onClick={() => onPick(todayIso)}
        >
          Today
        </button>
      </div>
    </div>
  );
}
const calendarIcon = (
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
);
/** Custom date picker: themed calendar popover with min/max, keyboard and Today / Clear. */
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
  placeholder = "Select date",
}: Omit<InputProps, "type" | "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  const auto = useId();
  const key = id || auto;
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <FieldShell
      label={label}
      id={key}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <div className="control-date" ref={wrap}>
        {calendarIcon}
        <button
          type="button"
          id={key}
          ref={trigger}
          className={`control control-trigger${value ? "" : " placeholder"}`}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-invalid={!!error}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          {value ? formatDate(value) : placeholder}
        </button>
        {required && (
          <input
            className="control-proxy"
            tabIndex={-1}
            aria-hidden="true"
            required
            value={value}
            onChange={() => {}}
            onFocus={() => trigger.current?.focus()}
          />
        )}
        {open && (
          <Popover
            anchor={wrap}
            onClose={() => setOpen(false)}
            fit
            label={label}
          >
            <Calendar
              value={value}
              min={min as string | undefined}
              max={max as string | undefined}
              onPick={(v) => {
                onChange(v);
                close();
              }}
              onClear={
                required
                  ? undefined
                  : () => {
                      onChange("");
                      close();
                    }
              }
              onClose={close}
            />
          </Popover>
        )}
      </div>
    </FieldShell>
  );
}
type Option = { value: string; label: string; disabled?: boolean };
function readOptions(children: ReactNode): Option[] {
  const out: Option[] = [];
  const walk = (nodes: ReactNode) =>
    Children.forEach(nodes, (c) => {
      if (!isValidElement(c)) return;
      const el = c as ReactElement<any>;
      if (el.type === "option") {
        const text = Children.toArray(el.props.children).join("");
        out.push({
          value: String(el.props.value ?? text),
          label: text,
          disabled: el.props.disabled,
        });
      } else if (el.props?.children) walk(el.props.children);
    });
  walk(children);
  return out;
}
type SelectProps = Common &
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "className">;
/** Single selects use a themed dropdown; `multiple` keeps the native list. */
export function SelectField(props: SelectProps) {
  return props.multiple ? (
    <MultiSelect {...props} />
  ) : (
    <SingleSelect {...props} />
  );
}
function MultiSelect({
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
        className="control multi"
      >
        {children}
      </select>
    </FieldShell>
  );
}
function SingleSelect({
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
  const options = readOptions(children);
  const value = String(props.value ?? "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const searchable = options.length > 8;
  const shown = options.filter((o) =>
    o.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const current = options.find((o) => o.value === value);
  const openList = () => {
    setQuery("");
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (o: Option) => {
    if (o.disabled) return;
    props.onChange?.({ target: { value: o.value } } as any);
    close();
  };
  useEffect(() => {
    if (open && !searchable) list.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    // Scroll only the list itself; scrollIntoView could also move the page.
    const box = list.current;
    const el = box?.querySelector<HTMLElement>('[data-active="true"]');
    if (!box || !el) return;
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop - 6;
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight)
      box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight + 6;
  }, [active, open, query]);
  const move = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => Math.min(shown.length - 1, Math.max(0, a + step)));
    } else if (e.key === "Home" || e.key === "End") {
      if (!searchable) {
        e.preventDefault();
        setActive(e.key === "Home" ? 0 : shown.length - 1);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) choose(shown[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") setOpen(false);
  };
  return (
    <FieldShell
      label={label}
      id={key}
      hint={hint}
      error={error}
      required={props.required}
      className={className}
    >
      <div className="control-select-wrap">
        <SelectBody
          idKey={key}
          open={open}
          trigger={trigger}
          disabled={props.disabled}
          invalid={!!error}
          text={current?.label || ""}
          onToggle={() => (open ? setOpen(false) : openList())}
          onOpen={openList}
        />
        {props.required && (
          <input
            className="control-proxy"
            tabIndex={-1}
            aria-hidden="true"
            required
            value={value}
            onChange={() => {}}
            onFocus={() => trigger.current?.focus()}
          />
        )}
        {open && (
          <Popover
            anchor={trigger}
            onClose={() => setOpen(false)}
            label={label}
          >
            {searchable && (
              <input
                autoFocus
                className="popover-search"
                placeholder="Search…"
                value={query}
                aria-label={`Search ${label}`}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={move}
              />
            )}
            <div
              className="options"
              role="listbox"
              aria-label={label}
              ref={list}
              tabIndex={searchable ? -1 : 0}
              onKeyDown={move}
            >
              {shown.length === 0 && (
                <div className="option empty">No matches</div>
              )}
              {shown.map((o, i) => (
                <div
                  key={o.value + i}
                  role="option"
                  aria-selected={o.value === value}
                  aria-disabled={o.disabled}
                  data-active={i === active}
                  className={`option${o.value === value ? " selected" : ""}${o.disabled ? " disabled" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o)}
                >
                  <span>{o.label || "—"}</span>
                  {o.value === value && <b aria-hidden="true">✓</b>}
                </div>
              ))}
            </div>
          </Popover>
        )}
      </div>
    </FieldShell>
  );
}
function SelectBody({
  idKey,
  open,
  trigger,
  disabled,
  invalid,
  text,
  onToggle,
  onOpen,
}: {
  idKey: string;
  open: boolean;
  trigger: React.RefObject<HTMLButtonElement | null>;
  disabled?: boolean;
  invalid: boolean;
  text: string;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      id={idKey}
      ref={trigger}
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-invalid={invalid}
      disabled={disabled}
      className={`control control-trigger control-select${text ? "" : " placeholder"}`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key) && !open) {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <span>{text || "Select"}</span>
    </button>
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
