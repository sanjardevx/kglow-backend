/**
 * Paging for the admin's server-rendered lists.
 *
 * Every list used to render the whole collection into one page: a shop with a
 * few hundred orders sent a megabyte of HTML the admin had to scroll through
 * to reach anything. These helpers keep the three lists consistent — same page
 * size, same query parameter, same shape handed to the view.
 */

export const ADMIN_PAGE_SIZE = 20;

/** What the pager partial needs, and what the row numbers count from. */
export interface Paging {
  page: number;
  pages: number;
  total: number;
  size: number;
}

/** `?page=` as the admin typed it. Anything that isn't a whole number above
 *  zero — a word, a negative, a float, nothing at all — means page one. */
export function pageFromQuery(raw: unknown): number {
  const page = Number(raw);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function skipFor(page: number, size: number = ADMIN_PAGE_SIZE): number {
  return (page - 1) * size;
}

export function pagingFor(
  total: number,
  page: number,
  size: number = ADMIN_PAGE_SIZE,
): Paging {
  // An empty list is still page 1 of 1, so the view never has to special-case
  // a zero.
  return { page, pages: Math.max(1, Math.ceil(total / size)), total, size };
}
