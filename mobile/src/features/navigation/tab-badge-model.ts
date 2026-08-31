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
