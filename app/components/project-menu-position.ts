export type ProjectMenuPositionInput = {
  trigger: { top: number; right: number; bottom: number };
  menu: { width: number; height: number };
  viewport: { width: number; height: number };
  gap?: number;
  margin?: number;
};

export function calculateProjectMenuPosition({
  trigger,
  menu,
  viewport,
  gap = 6,
  margin = 8,
}: ProjectMenuPositionInput): { top: number; left: number } {
  const maximumLeft = Math.max(margin, viewport.width - menu.width - margin);
  const left = Math.min(
    Math.max(trigger.right - menu.width, margin),
    maximumLeft,
  );
  const below = trigger.bottom + gap;
  const above = trigger.top - gap - menu.height;
  const preferredTop =
    below + menu.height <= viewport.height - margin ? below : above;
  const maximumTop = Math.max(margin, viewport.height - menu.height - margin);
  const top = Math.min(Math.max(preferredTop, margin), maximumTop);
  return { top, left };
}
