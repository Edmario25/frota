import { Layout } from "@/components/layout/Layout";
import { cn } from "@/lib/utils";
import { Construction } from "lucide-react";

interface SmsModulePlaceholderProps {
  icon: React.ElementType;
  color: string;
  title: string;
  description: string;
  features?: string[];
}

export function SmsModulePlaceholder({
  icon: Icon,
  color,
  title,
  description,
  features = [],
}: SmsModulePlaceholderProps) {
  return (
    <Layout>
      <div className="max-w-screen-xl mx-auto">
        <div className="flex flex-col items-center justify-center min-h-[500px] text-center px-4">

          {/* Ícone do módulo */}
          <div className={cn(
            "h-20 w-20 rounded-2xl flex items-center justify-center shadow-lg mb-6",
            color
          )}>
            <Icon className="h-10 w-10 text-white" />
          </div>

          {/* Badge em construção */}
          <div className="flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-semibold px-3 py-1 rounded-full mb-4">
            <Construction className="h-3.5 w-3.5" />
            Em desenvolvimento
          </div>

          <h1 className="text-3xl font-extrabold text-foreground tracking-tight mb-3">{title}</h1>
          <p className="text-base text-muted-foreground max-w-md mb-8">{description}</p>

          {features.length > 0 && (
            <div className="bg-card border border-border/50 rounded-xl p-6 max-w-sm w-full text-left shadow-card">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                Funcionalidades previstas
              </p>
              <ul className="space-y-2">
                {features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
