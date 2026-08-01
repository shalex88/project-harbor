"use client";

import type { ReactElement, ReactNode } from "react";

export function WorkItemOpenSurface({
  as = "div",
  className,
  label,
  onOpen,
  children,
}: {
  as?: "div" | "article";
  className: string;
  label: string;
  onOpen: () => void;
  children: ReactNode;
}): ReactElement {
  const content = (
    <>
      <button
        className="work-item-open-target"
        type="button"
        aria-label={label}
        onClick={onOpen}
      />
      {children}
    </>
  );

  return as === "article" ? (
    <article className={`${className} work-item-open-surface`}>{content}</article>
  ) : (
    <div className={`${className} work-item-open-surface`}>{content}</div>
  );
}
