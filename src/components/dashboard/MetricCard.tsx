import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  variant?: "default" | "success" | "warning" | "destructive" | "blue" | "purple";
}

const variantStyles: Record<string, string> = {
  default: "from-[hsl(224_76%_48%)] to-[hsl(230_76%_58%)]",
  success: "from-emerald-500 to-emerald-400",
  warning: "from-amber-500 to-amber-400",
  destructive: "from-red-500 to-red-400",
  blue: "from-blue-500 to-sky-400",
  purple: "from-violet-500 to-purple-400",
};

const variantBg: Record<string, string> = {
  default: "bg-primary/5",
  success: "bg-emerald-50",
  warning: "bg-amber-50",
  destructive: "bg-red-50",
  blue: "bg-blue-50",
  purple: "bg-violet-50",
};

export function MetricCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  variant = "default",
}: MetricCardProps) {
  const TrendIcon = changeType === "positive" ? TrendingUp : changeType === "negative" ? TrendingDown : Minus;

  return (
    <div className={cn(
      "rounded-xl p-5 bg-card shadow-card hover:shadow-md-custom transition-all duration-200 hover:-translate-y-0.5 border border-border/50 animate-fade-in"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">{title}</p>
          <p className="text-3xl font-extrabold text-foreground tracking-tight leading-none">{value}</p>
          {change && (
            <div className={cn(
              "flex items-center gap-1 text-xs font-medium mt-2",
              changeType === "positive" ? "text-emerald-600" :
              changeType === "negative" ? "text-red-500" : "text-muted-foreground"
            )}>
              <TrendIcon className="h-3 w-3 flex-shrink-0" />
              <span>{change}</span>
            </div>
          )}
        </div>
        <div className={cn(
          "h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br shadow-sm",
          variantStyles[variant]
        )}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}
