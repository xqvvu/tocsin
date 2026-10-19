import { Badge } from "#/components/ui/badge";
import { useTranslations } from "#/i18n/use-i18n";

export function RouteMatchResultBadge({ matched }: { matched: boolean }) {
  const t = useTranslations();

  return (
    <Badge variant={matched ? "secondary" : "destructive"}>
      {matched ? t("routeChecks.matched") : t("routeChecks.missed")}
    </Badge>
  );
}
