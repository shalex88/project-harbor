export function followUpCreatedItemMode(
  action: string,
  createdItemId: string | null,
): { kind: "existing"; itemId: string } | null {
  if (action !== "create_follow_up_item" || !createdItemId) return null;
  return { kind: "existing", itemId: createdItemId };
}
