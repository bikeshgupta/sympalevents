import { ArrowUpRight, Check, ChevronRight, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { SectionTone } from "@/features/settings/settings-sections";
import { cn } from "@/lib/utils";

/**
 * The iOS-Settings building blocks Event Settings is made of: a rounded white list, rows that touch with a hairline
 * between them (inset past the icon), a coloured icon tile, a value and a chevron on the right, switches and a
 * three-way segmented control. Presentation only - every control is still the same handler it was before.
 */

/** iOS Settings gives every row its own colour. Name -> the top and bottom of the tile's gradient. */
const tones: Record<SectionTone, [string, string]> = {
  blue: ["#5BA3FF", "#2F7CF6"],
  red: ["#FF7A6B", "#F0443A"],
  indigo: ["#8B8CF5", "#5A5BD6"],
  green: ["#5FD07F", "#2FB457"],
  orange: ["#FFB04D", "#F58A1F"],
  pink: ["#FF7AA8", "#EE4A86"],
  gray: ["#A7A9B2", "#7E808A"],
};

/** One rounded white list. `header` is the small grey caption above it, `footer` the note below. */
export function ListGroup({
  header,
  headerTone,
  footer,
  role,
  className,
  children,
}: {
  header?: ReactNode;
  headerTone?: "attention";
  footer?: ReactNode;
  role?: "status";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("mt-6 first:mt-0", className)} role={role}>
      {header ? (
        <p
          className={cn(
            "mb-1.5 px-4 text-[13px] uppercase tracking-wide",
            headerTone === "attention" ? "font-medium text-amber-800" : "text-muted-foreground",
          )}
        >
          {header}
        </p>
      ) : null}
      <ul className="ios-list overflow-hidden rounded-3xl bg-white shadow-[0_1px_2px_hsl(var(--foreground)/0.05)] ring-1 ring-black/[0.04]">
        {children}
      </ul>
      {footer ? <div className="mt-1.5 px-4 text-[13px] leading-snug text-muted-foreground">{footer}</div> : null}
    </section>
  );
}

export function IconTile({ icon: Icon, tone, size = "md" }: { icon: LucideIcon; tone: SectionTone; size?: "md" | "sm" }) {
  const [top, bottom] = tones[tone];
  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center text-white shadow-[inset_0_0.5px_0_rgba(255,255,255,0.45),0_1px_2px_rgba(0,0,0,0.12)]", size === "sm" ? "h-7 w-7 rounded-lg" : "h-7 w-7 rounded-lg")}
      style={{ background: `linear-gradient(180deg, ${top}, ${bottom})` }}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

/**
 * A row: an icon tile (or a picture), a title, an optional second line, a short value, then a chevron, a tick or an
 * "opens elsewhere" arrow. A link when it has `href`, a button when it has `onClick`, otherwise plain.
 * On a wide screen the index list is the side navigation, so its value and chevron step aside (`sideNav`) and the
 * open section is tinted.
 */
export function ListRow({
  icon,
  tone,
  lead,
  title,
  sub,
  sub2,
  value,
  href,
  onClick,
  selected = false,
  current = false,
  onLinkClick,
  expanded,
  checked = false,
  unsaved = false,
  external = false,
  chevron = true,
  destructive = false,
  disabled = false,
  big = false,
  sideNav = false,
  subWrap = false,
  trailing,
}: {
  icon?: LucideIcon;
  tone?: SectionTone;
  lead?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  sub2?: ReactNode;
  value?: ReactNode;
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  /** The page being looked at, in a menu: tinted at every width (`selected` only tints from lg, for the side navigation). */
  current?: boolean;
  /** Runs when a link row is followed (the drawer closes itself with it). */
  onLinkClick?: () => void;
  /** For a row that folds a list open and shut: announces its state. */
  expanded?: boolean;
  checked?: boolean;
  unsaved?: boolean;
  external?: boolean;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  big?: boolean;
  sideNav?: boolean;
  /** Let the second line wrap (a description) instead of cutting it off (an email). */
  subWrap?: boolean;
  trailing?: ReactNode;
}) {
  const interactive = Boolean(href || onClick);
  const body = (
    <>
      {lead ?? (icon ? <IconTile icon={icon} tone={tone ?? "gray"} /> : null)}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate",
            big ? "font-display text-lg font-semibold leading-tight" : "text-[15px]",
            destructive && "text-destructive",
            selected && "lg:font-semibold",
            current && "font-semibold",
          )}
        >
          {title}
          {unsaved ? (
            <span className="ml-2 inline-flex items-center gap-1 align-middle font-sans text-xs font-medium text-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-600" aria-hidden="true" />
              Unsaved
            </span>
          ) : null}
        </span>
        {sub ? <span className={cn("block text-[13px] text-muted-foreground", !subWrap && "truncate")}>{sub}</span> : null}
        {sub2 ? <span className="mt-0.5 block text-[13px] text-muted-foreground">{sub2}</span> : null}
      </span>
      {value ? (
        <span className={cn("max-w-[42%] shrink-0 truncate text-sm text-muted-foreground", sideNav && "lg:hidden")}>
          {value}
        </span>
      ) : null}
      {trailing}
      {checked ? <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /> : null}
      {external ? (
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
      ) : interactive && chevron && !checked ? (
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground/60", sideNav && "lg:hidden")} aria-hidden="true" />
      ) : null}
    </>
  );
  const cls = cn(
    "flex w-full items-center gap-3 px-4 text-left",
    big ? "min-h-[4.5rem] py-3" : "min-h-12 py-2",
    interactive &&
      "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-black/[0.05] [@media(hover:hover)]:hover:bg-black/[0.03]",
    disabled && "pointer-events-none opacity-50",
    selected && "lg:bg-primary/10",
    current && "bg-primary/10",
  );
  const inset: CSSProperties = { ["--ios-inset" as string]: big ? "5rem" : lead ? "4rem" : icon ? "3.5rem" : "1rem" } as CSSProperties;
  return (
    <li style={inset}>
      {href ? (
        <Link to={href} onClick={onLinkClick} aria-current={selected || current ? "true" : undefined} className={cls}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} disabled={disabled} aria-expanded={expanded} className={cls}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

/** A row whose value is something you type or pick: the label on the left, the control on the right. */
export function FieldRow({
  id,
  label,
  hint,
  labelClass = "w-28",
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  /** Width of the label column; narrower when the value on the right is long. */
  labelClass?: string;
  children: ReactNode;
}) {
  return (
    <li style={{ ["--ios-inset" as string]: "1rem" } as CSSProperties}>
      <div className="flex min-h-12 items-center gap-3 px-4">
        <label htmlFor={id} className={cn("shrink-0 text-[15px]", labelClass)}>
          {label}
          {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
        </label>
        {children}
      </div>
    </li>
  );
}

/** A free-form row: whatever is passed, padded like a row. For a picture, a text area, a block of buttons. */
export function BlockRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <li style={{ ["--ios-inset" as string]: "1rem" } as CSSProperties}>
      <div className={cn("px-4 py-3", className)}>{children}</div>
    </li>
  );
}

/** An on/off switch the size and shape of iOS's. */
export function IosSwitch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50",
        checked ? "bg-emerald-600" : "bg-black/[0.12]",
      )}
    >
      <span
        className={cn(
          "absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.25)] transition-transform duration-200",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

/** A small segmented control, for a choice of two to four things that belong on one row. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 rounded-[9px] bg-black/[0.07] p-0.5">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-8 min-w-[3.1rem] rounded-[7px] px-2 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              on ? "bg-white text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.18)]" : "text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
