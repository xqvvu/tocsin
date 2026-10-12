import * as React from "react";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "#/components/ui/pagination";
import { cn } from "#/lib/utils";

type TablePaginationSharedProps = {
  /** Omitted in cursor mode, where the total is not knowable. */
  rangeLabel?: string;
  previousLabel: string;
  nextLabel: string;
  className?: string;
};

type TablePaginationPageProps = {
  mode?: "pages";
  pageLabel: string;
  pageIndex: number;
  pageCount: number;
  onPageIndexChange: (pageIndex: number) => void;
};

/**
 * Cursor mode, for lists that page by cursor instead of by offset.
 *
 * Such a list has no page count, so page numbers cannot be offered — but
 * Previous/Next still can, and it is the same control language the
 * page-numbered tables use. `canPrevious` comes from the caller's cursor trail,
 * because a cursor list cannot derive its own history; a caller with no trail
 * says `false` rather than pretending the button works.
 */
type TablePaginationCursorProps = {
  mode: "cursor";
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

export type TablePaginationProps = TablePaginationSharedProps &
  (TablePaginationPageProps | TablePaginationCursorProps);

/** Footer chrome shared by both modes, so the two cannot drift apart. */
function PaginationShell({
  rangeLabel,
  className,
  children,
}: {
  rangeLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-border bg-background flex shrink-0 flex-col gap-3 border-x border-b px-3 py-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      {rangeLabel ? <div className="text-muted-foreground text-xs">{rangeLabel}</div> : null}
      <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  );
}

export function TablePagination(props: TablePaginationProps) {
  return props.mode === "cursor" ? <CursorPagination {...props} /> : <PagePagination {...props} />;
}

function CursorPagination({
  rangeLabel,
  previousLabel,
  nextLabel,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  className,
}: TablePaginationSharedProps & TablePaginationCursorProps) {
  return (
    <PaginationShell rangeLabel={rangeLabel} className={className}>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent className="gap-1">
          <PaginationItem>
            <PaginationPrevious
              href="#"
              size="xs"
              text={previousLabel}
              aria-label={previousLabel}
              aria-disabled={!canPrevious}
              tabIndex={canPrevious ? undefined : -1}
              className={cn(!canPrevious && "pointer-events-none opacity-50")}
              onClick={(event) => {
                event.preventDefault();
                if (canPrevious) onPrevious();
              }}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href="#"
              size="xs"
              text={nextLabel}
              aria-label={nextLabel}
              aria-disabled={!canNext}
              tabIndex={canNext ? undefined : -1}
              className={cn(!canNext && "pointer-events-none opacity-50")}
              onClick={(event) => {
                event.preventDefault();
                if (canNext) onNext();
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </PaginationShell>
  );
}

function PagePagination({
  rangeLabel,
  pageLabel,
  previousLabel,
  nextLabel,
  pageIndex,
  pageCount,
  onPageIndexChange,
  className,
}: TablePaginationSharedProps & TablePaginationPageProps) {
  const normalizedPageCount = Math.max(pageCount, 1);
  const normalizedPageIndex = Math.min(Math.max(pageIndex, 0), normalizedPageCount - 1);
  const canPreviousPage = normalizedPageIndex > 0;
  const canNextPage = normalizedPageIndex < normalizedPageCount - 1;
  const pageItems = tablePaginationItems(normalizedPageIndex, normalizedPageCount);

  function changePage(nextPageIndex: number) {
    const clampedPageIndex = Math.min(Math.max(nextPageIndex, 0), normalizedPageCount - 1);

    if (clampedPageIndex !== normalizedPageIndex) {
      onPageIndexChange(clampedPageIndex);
    }
  }

  return (
    <PaginationShell rangeLabel={rangeLabel} className={className}>
      <span className="text-muted-foreground text-xs">{pageLabel}</span>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent className="flex-wrap justify-end gap-1">
          <PaginationItem>
            <PaginationPrevious
              href="#"
              size="xs"
              text={previousLabel}
              aria-label={previousLabel}
              aria-disabled={!canPreviousPage}
              tabIndex={canPreviousPage ? undefined : -1}
              className={cn(!canPreviousPage && "pointer-events-none opacity-50")}
              onClick={(event) => {
                event.preventDefault();

                changePage(normalizedPageIndex - 1);
              }}
            />
          </PaginationItem>
          {pageItems.map((item) =>
            item.kind === "ellipsis" ? (
              <PaginationItem key={item.key}>
                <PaginationEllipsis className="size-6" />
              </PaginationItem>
            ) : (
              <PaginationItem key={item.page}>
                <PaginationLink
                  href="#"
                  size="icon-xs"
                  isActive={item.pageIndex === normalizedPageIndex}
                  aria-label={`${item.page}`}
                  onClick={(event) => {
                    event.preventDefault();
                    changePage(item.pageIndex);
                  }}
                >
                  {item.page}
                </PaginationLink>
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <PaginationNext
              href="#"
              size="xs"
              text={nextLabel}
              aria-label={nextLabel}
              aria-disabled={!canNextPage}
              tabIndex={canNextPage ? undefined : -1}
              className={cn(!canNextPage && "pointer-events-none opacity-50")}
              onClick={(event) => {
                event.preventDefault();

                changePage(normalizedPageIndex + 1);
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </PaginationShell>
  );
}

type TablePaginationItem =
  | {
      kind: "page";
      page: number;
      pageIndex: number;
    }
  | {
      kind: "ellipsis";
      key: "start-ellipsis" | "end-ellipsis";
    };

function tablePaginationItems(pageIndex: number, pageCount: number): TablePaginationItem[] {
  const currentPage = pageIndex + 1;
  const pages =
    pageCount <= 7
      ? Array.from({ length: pageCount }, (_, index) => index + 1)
      : compactPaginationPages(currentPage, pageCount);

  return pages.map((page) =>
    typeof page === "number"
      ? {
          kind: "page",
          page,
          pageIndex: page - 1,
        }
      : {
          kind: "ellipsis",
          key: page,
        },
  );
}

function compactPaginationPages(
  currentPage: number,
  pageCount: number,
): Array<number | "start-ellipsis" | "end-ellipsis"> {
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "end-ellipsis", pageCount];
  }

  if (currentPage >= pageCount - 3) {
    return [
      1,
      "start-ellipsis",
      pageCount - 4,
      pageCount - 3,
      pageCount - 2,
      pageCount - 1,
      pageCount,
    ];
  }

  return [
    1,
    "start-ellipsis",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "end-ellipsis",
    pageCount,
  ];
}
