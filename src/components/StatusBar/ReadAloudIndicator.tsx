import { AlertCircle, Pause, Play, Square, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { useReadAloudStore } from "@/features/readAloud/readAloudStore";
import {
  pauseReadAloud,
  resumeReadAloud,
  stopReadAloud,
} from "@/features/readAloud/runtime";
import { ICON_SM } from "@/utils/iconSizes";

export function ReadAloudIndicator() {
  const { t } = useTranslation("statusbar");
  const status = useReadAloudStore((state) => state.status);
  const index = useReadAloudStore((state) => state.index);
  const total = useReadAloudStore((state) => state.total);
  const error = useReadAloudStore((state) => state.error);
  if (status === "idle") return null;

  const current = Math.min(index + 1, total);
  const failed = status === "error";
  const paused = status === "paused";
  return (
    <span
      className={`status-read-aloud${failed ? " error" : ""}`}
      role="status"
      aria-live="polite"
      title={error ?? t("readAloudProgress", { current, total })}
    >
      {failed ? <AlertCircle size={ICON_SM} /> : <Volume2 size={ICON_SM} />}
      {failed ? (
        <span>{t("readAloudError")}</span>
      ) : (
        <>
          <span aria-hidden="true">{current}/{total}</span>
          <span className="sr-only">{t("readAloudProgress", { current, total })}</span>
        </>
      )}
      {!failed && status !== "stopping" && (
        <button
          type="button"
          className="vm-icon-btn vm-icon-btn--sm status-read-aloud__pause"
          title={i18n.t(paused ? "commands:speech.resume" : "commands:speech.pause")}
          aria-label={i18n.t(paused ? "commands:speech.resume" : "commands:speech.pause")}
          onClick={() => void (paused ? resumeReadAloud() : pauseReadAloud())}
        >
          {paused ? <Play size={ICON_SM} /> : <Pause size={ICON_SM} />}
        </button>
      )}
      <button
        type="button"
        className="vm-icon-btn vm-icon-btn--sm status-read-aloud__stop"
        title={i18n.t("commands:speech.stop")}
        aria-label={i18n.t("commands:speech.stop")}
        onClick={() => void stopReadAloud()}
      >
        <Square size={ICON_SM} />
      </button>
    </span>
  );
}
