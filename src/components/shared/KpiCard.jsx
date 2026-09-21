import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONES = {
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
  emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  orange: "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300",
  primary: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  red: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
  rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
  sky: "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-slate-300",
  teal: "bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300",
};

export default function KpiCard({
  icon: Icon,
  label,
  value,
  helper,
  badge,
  tone = "emerald",
  className,
  contentClassName,
  valueClassName,
}) {
  return (
    <Card className={cn("h-full overflow-hidden", className)}>
      <CardContent
        className={cn(
          "flex h-full min-w-0 items-start gap-3 p-4 sm:p-5",
          contentClassName,
        )}
      >
        {Icon && (
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              TONES[tone] || TONES.emerald,
            )}
          >
            <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <p className="min-w-0 break-words text-xs font-medium leading-4 text-muted-foreground">
              {label}
            </p>
            {badge ? (
              <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {badge}
              </span>
            ) : null}
          </div>
          <p
            className={cn(
              "mt-1 max-w-full break-words font-mono text-xl font-semibold leading-6 tabular-nums text-foreground [overflow-wrap:anywhere] sm:text-2xl sm:font-bold sm:leading-7",
              valueClassName,
            )}
          >
            {value ?? "-"}
          </p>
          {helper ? (
            <p className="mt-1 max-w-full break-words text-xs font-normal leading-4 text-muted-foreground">
              {helper}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
