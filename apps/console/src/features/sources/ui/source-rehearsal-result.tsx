import { Link } from "@tanstack/react-router";

import type { SourceRehearsalDedupe, SourceRehearsalResult } from "@tocsin/core";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { EventJsonBlock } from "#/features/events/ui/event-json-block";
import { SeverityBadge } from "#/features/events/ui/severity-badge";
import { RouteMatchCheckBadges } from "#/features/routes/ui/route-match-check-badges";
import { RouteMatchResultBadge } from "#/features/routes/ui/route-match-result-badge";
import { SourceRehearsalVerdictBadge } from "#/features/sources/ui/source-rehearsal-verdict-badge";
import { useTranslations } from "#/i18n/use-i18n";

/**
 * Result of a read-only intake rehearsal: what the parser understood, how every
 * current route judged it, and what each matched target would send.
 */
export function SourceRehearsalResultView({ result }: { result: SourceRehearsalResult }) {
  const t = useTranslations();
  const matchedRouteCount = result.routes.filter((route) => route.matched).length;

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {/* The server projects the result the same way a stored event is projected
          at its read boundary; say so, because the payload in the editor still
          carries the operator's original values. */}
      <p className="text-muted-foreground text-[11px]">{t("sources.rehearsal.redactedNotice")}</p>

      {/* The render below always shows what the target *would* carry. The pause
          banner explains why nothing would actually leave while it is on. */}
      {result.delivery.paused ? (
        <Alert>
          <AlertTitle>{t("sources.rehearsal.pausedTitle")}</AlertTitle>
          <AlertDescription>
            <span className="block">{t("sources.rehearsal.pausedDescription")}</span>
            {result.delivery.pausedAt ? (
              <span className="block font-mono text-[11px]">
                {t("sources.rehearsal.pausedSince", { time: result.delivery.pausedAt })}
              </span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {result.source.enabled ? null : (
        <Alert>
          <AlertTitle>{t("sources.rehearsal.sourceDisabledTitle")}</AlertTitle>
          <AlertDescription>{t("sources.rehearsal.sourceDisabledDescription")}</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium">{t("sources.rehearsal.parseTitle")}</h3>
        {result.parse.ok ? (
          <div className="border-border flex flex-col gap-2 border p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <SeverityBadge severity={result.parse.normalizedEvent.severity} />
              <Badge
                variant={
                  result.parse.normalizedEvent.status === "firing" ? "destructive" : "secondary"
                }
              >
                {t(`common.alertStatus.${result.parse.normalizedEvent.status}`)}
              </Badge>
              <span className="text-sm font-medium wrap-break-word">
                {result.parse.normalizedEvent.title}
              </span>
            </div>
            {result.parse.normalizedEvent.message ? (
              <p className="text-muted-foreground text-xs wrap-break-word">
                {result.parse.normalizedEvent.message}
              </p>
            ) : null}
            <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
              <Fact
                label={t("sources.rehearsal.facts.fingerprint")}
                value={result.parse.normalizedEvent.fingerprint}
                mono
              />
              <Fact
                label={t("sources.rehearsal.facts.occurredAt")}
                value={result.parse.normalizedEvent.occurredAt}
                mono
              />
            </dl>
            {Object.keys(result.parse.normalizedEvent.labels).length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                {Object.entries(result.parse.normalizedEvent.labels).map(([key, value]) => (
                  <Badge
                    key={key}
                    variant="outline"
                    className="max-w-full justify-start font-mono text-[11px]"
                    title={`${key}=${value}`}
                  >
                    <span className="text-muted-foreground">{key}=</span>
                    <span className="truncate">{value}</span>
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <Alert variant="destructive">
            <AlertTitle>
              {t("sources.rehearsal.parseFailed", {
                reason: t(`sources.rehearsal.reasons.${result.parse.reason}`),
              })}
            </AlertTitle>
            <AlertDescription className="font-mono text-xs break-words">
              {result.parse.message}
            </AlertDescription>
          </Alert>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium">
          {t("sources.rehearsal.routesTitle", {
            matched: matchedRouteCount,
            total: result.routes.length,
          })}
        </h3>
        {result.routes.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t("sources.rehearsal.routesEmpty")}</p>
        ) : (
          <div className="border-border overflow-x-auto border">
            <Table>
              <TableHeader className="bg-muted/50 text-muted-foreground">
                <TableRow>
                  <TableHead>{t("sources.rehearsal.routeHeaders.route")}</TableHead>
                  <TableHead>{t("sources.rehearsal.routeHeaders.result")}</TableHead>
                  <TableHead>{t("sources.rehearsal.routeHeaders.targets")}</TableHead>
                  <TableHead>{t("sources.rehearsal.routeHeaders.checks")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.routes.map((route) => (
                  <TableRow key={route.routeId} className="align-top">
                    <TableCell className="max-w-48 truncate font-medium" title={route.routeName}>
                      {route.routeName}
                    </TableCell>
                    <TableCell>
                      <RouteMatchResultBadge matched={route.matched} />
                    </TableCell>
                    <TableCell>{route.destinationIds.length}</TableCell>
                    <TableCell className="whitespace-normal">
                      <RouteMatchCheckBadges checks={route.checks} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium">{t("sources.rehearsal.rendersTitle")}</h3>
        {result.renders.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t("sources.rehearsal.rendersEmpty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {result.renders.map((render) => (
              <div key={render.destinationId} className="border-border border">
                <div className="border-border flex items-center justify-between gap-2 border-b px-3 py-2">
                  <span className="truncate text-xs font-medium" title={render.destinationName}>
                    {render.destinationName}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <SourceRehearsalVerdictBadge verdict={render.verdict} />
                    {/* The disabled verdict already says the target is disabled.
                        Rendering the state badge beside it showed "Target
                        disabled" next to "Disabled": two badges reading as two
                        different facts instead of one. Every other verdict
                        keeps the state badge, which still adds information
                        (for example a silenced alert on a disabled target). */}
                    {render.verdict === "destination_disabled" ? null : (
                      <Badge variant={render.enabled ? "secondary" : "outline"}>
                        {render.enabled
                          ? t("sources.rehearsal.targetEnabled")
                          : t("sources.rehearsal.targetDisabled")}
                      </Badge>
                    )}
                  </div>
                </div>
                {render.suppression ? (
                  <div className="border-border flex flex-col gap-1.5 border-b px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">
                        {t("sources.rehearsal.suppressionRule")}
                      </span>
                      <span className="font-medium">{render.suppression.name}</span>
                      <Badge variant="outline">
                        {t(`suppressions.kind.${render.suppression.kind}`)}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-[11px] break-words">
                      {render.suppression.reason}
                    </p>
                    <RouteMatchCheckBadges checks={render.suppression.checks} />
                  </div>
                ) : null}
                <RehearsalDedupeRow dedupe={render.dedupe} />
                {render.ok ? (
                  <div className="max-h-64 overflow-auto">
                    <EventJsonBlock
                      title={render.destinationName}
                      value={JSON.parse(render.renderedPayload) as unknown}
                    />
                  </div>
                ) : (
                  <p className="text-destructive p-3 text-xs break-words">{render.errorMessage}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Whether the dedupe window would absorb this target at enqueue.
 *
 * Only a hit needs an explanation: the muted state line already says the check
 * ran and found nothing, while a hit names how many matched pairs the window
 * absorbs and links the event that opened it.
 */
function RehearsalDedupeRow({ dedupe }: { dedupe: SourceRehearsalDedupe }) {
  const t = useTranslations();
  const deduped = dedupe.state === "would_dedupe" || dedupe.state === "partially_deduped";

  return (
    <div className="border-border flex flex-col gap-1 border-b px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">{t("sources.rehearsal.dedupeLabel")}</span>
        <span className="font-medium">{t(`sources.rehearsal.dedupeState.${dedupe.state}`)}</span>
      </div>
      {deduped ? (
        <>
          <p className="text-muted-foreground text-[11px] break-words">
            {t("sources.rehearsal.dedupeHitDetail", {
              deduped: dedupe.dedupedPairCount,
              matched: dedupe.matchedPairCount,
              minutes: Math.max(1, Math.round(dedupe.windowMs / 60_000)),
            })}
            {dedupe.routeName ? ` · ${dedupe.routeName}` : null}
          </p>
          {dedupe.firstEventId ? (
            <p className="text-[11px]">
              <span className="text-muted-foreground">
                {t("sources.rehearsal.dedupeFirstEvent")}{" "}
              </span>
              <Link
                to="/events/$eventId"
                params={{ eventId: dedupe.firstEventId }}
                className="underline-offset-4 hover:underline"
                title={dedupe.firstEventId}
              >
                {dedupe.firstEventId}
              </Link>
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className={mono ? "truncate font-mono" : "truncate"} title={value}>
        {value}
      </dd>
    </div>
  );
}
