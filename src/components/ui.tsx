import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "accent" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "btn-gradient text-white shadow-sm hover:brightness-110",
  secondary: "bg-white text-ink border border-line hover:border-magenta hover:text-magenta",
  accent: "bg-yellow text-violet font-semibold hover:brightness-105",
  danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
  ghost: "text-muted hover:text-magenta",
};

export function Button({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        variants[variant],
        className
      )}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(90,15,120,0.06)]", className)}>{children}</div>;
}

export function PageTitle({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl text-violet">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

const field = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-magenta focus:ring-2 focus:ring-magenta/15";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(field, props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(field, "min-h-24", props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(field, props.className)} />;
}
export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <label className="mb-1 mt-4 block text-sm font-semibold text-ink first:mt-0">
      {children} {hint && <span className="font-normal text-muted">· {hint}</span>}
    </label>
  );
}

const statusStyles: Record<string, string> = {
  nouveau: "bg-surface text-muted",
  actif: "bg-magenta/10 text-magenta",
  a_valider: "bg-yellow/30 text-violet",
  a_repondu: "bg-emerald-50 text-emerald-700",
  termine: "bg-violet/10 text-violet",
  non_accepte: "bg-red-50 text-red-600",
  pause: "bg-surface text-muted",
  erreur: "bg-red-50 text-red-600",
};
export function Badge({ children, tone = "nouveau" }: { children: ReactNode; tone?: string }) {
  return <span className={cx("inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", statusStyles[tone] || statusStyles.nouveau)}>{children}</span>;
}

export function fmtDate(t?: string | null) {
  return t ? new Date(t).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }) : "—";
}
