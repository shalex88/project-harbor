import {
  formatTimelinePeriod,
  type TimelineCalendarMode,
} from "./timeline-period";

export function TimelinePeriodLabel({
  anchor,
  mode,
}: {
  anchor: string;
  mode: TimelineCalendarMode;
}) {
  return (
    <strong className="timeline-period-label" aria-live="polite">
      {formatTimelinePeriod(anchor, mode)}
    </strong>
  );
}

export function TimelinePeriodControls({
  anchor,
  mode,
  onPrevious,
  onToday,
  onNext,
}: {
  anchor: string;
  mode: TimelineCalendarMode;
  onPrevious: () => void;
  onToday: () => void;
  onNext: () => void;
}) {
  return (
    <div className="timeline-period-controls">
      <TimelinePeriodLabel anchor={anchor} mode={mode} />
      <div className="timeline-period-navigation">
        <button
          className="icon-button"
          type="button"
          aria-label="Previous period"
          onClick={onPrevious}
        >
          ‹
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={onToday}
        >
          Today
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Next period"
          onClick={onNext}
        >
          ›
        </button>
      </div>
    </div>
  );
}
