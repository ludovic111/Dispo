export function messageTabBadgeCount(
  directUnread: number,
  groupUnread: number,
  pendingInvitations: number,
): number {
  return [directUnread, groupUnread, pendingInvitations].reduce(
    (total, count) => total + Math.max(0, Math.trunc(count)),
    0,
  );
}

export function tabBadgeValue(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count > 99 ? '99+' : String(count);
}
