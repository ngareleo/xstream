import { mergeClasses } from "@griffel/react";
import { type FC, useState } from "react";
import { AppHeader } from "../../components/AppHeader/AppHeader.js";
import { IconBug, IconSparkles, IconChat, IconQuestion } from "../../lib/icons.js";
import { tokens } from "../../styles/tokens.js";
import { useFeedbackStyles } from "./Feedback.styles.js";

type FeedbackType = "bug" | "feature" | "general" | "question";

const TYPE_CONFIG: Record<FeedbackType, { icon: FC<{ size?: number }>; label: string; color: string }> = {
  bug:     { icon: IconBug,      label: "Bug Report",       color: "rgba(206,17,38,0.8)" },
  feature: { icon: IconSparkles, label: "Feature Request",  color: tokens.colorGreen },
  general: { icon: IconChat,     label: "General",          color: tokens.colorMuted },
  question:{ icon: IconQuestion, label: "Question",         color: tokens.colorYellow },
};

const RECENT = [
  { id: 1, type: "bug" as FeedbackType,     title: "Player controls flicker on seek",   status: "open",     date: "3 days ago" },
  { id: 2, type: "feature" as FeedbackType, title: "Add subtitle track selector",        status: "planned",  date: "1 week ago" },
  { id: 3, type: "question" as FeedbackType,title: "How to add a NAS library?",          status: "answered", date: "2 weeks ago" },
];

export const Feedback: FC = () => {
  const [type, setType] = useState<FeedbackType>("general");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const s = useFeedbackStyles();

  const badgeForStatus = (status: string) => {
    if (status === "open")     return mergeClasses(s.badge, s.badgeRed);
    if (status === "planned")  return mergeClasses(s.badge, s.badgeGreen);
    return mergeClasses(s.badge, s.badgeGray);
  };

  const statusLabel = (status: string) => {
    if (status === "open")    return "Open";
    if (status === "planned") return "Planned";
    return "Answered";
  };

  return (
    <>
      <AppHeader collapsed={false}>
        <span className={s.topbarTitle}>Feedback</span>
      </AppHeader>

      <div className="main">
        <div className={s.content}>
          <div className={s.layout}>
            {/* Submit form */}
            <div>
              <div className={s.pageHeader}>
                <div>
                  <div className={s.pageTitle}>Submit Feedback</div>
                  <div className={s.pageDesc}>Help us improve Moran — bugs, ideas, and questions welcome</div>
                </div>
              </div>

              <div className={mergeClasses(s.card, s.cardPad)} style={{ marginBottom: 24 }}>
                <div className={s.formGroup}>
                  <label className={s.formLabel}>Type</label>
                  <div className={s.typeChips}>
                    {(["bug", "feature", "general", "question"] as FeedbackType[]).map((t) => {
                      const { icon: Icon, label } = TYPE_CONFIG[t];
                      return (
                        <button
                          key={t}
                          className={mergeClasses(s.typeChip, type === t && s.typeChipActive)}
                          style={type === t ? { color: TYPE_CONFIG[t].color, borderColor: TYPE_CONFIG[t].color } : undefined}
                          onClick={() => setType(t)}
                        >
                          <Icon size={11} />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className={s.formGroup}>
                  <label className={s.formLabel}>Title</label>
                  <input
                    className={s.formInput}
                    type="text"
                    placeholder="Brief summary of your feedback"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className={s.formGroup}>
                  <label className={s.formLabel}>Description</label>
                  <textarea
                    className={s.formTextarea}
                    rows={5}
                    placeholder={
                      type === "bug"
                        ? "Steps to reproduce, expected vs actual behavior…"
                        : type === "feature"
                        ? "Describe the feature and the problem it solves…"
                        : "Tell us more…"
                    }
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </div>
                <button className={s.submitBtn} disabled={!title.trim()}>
                  Submit Feedback
                </button>
              </div>
            </div>

            {/* Recent feedback */}
            <div>
              <div className={s.recentLabel}>Your Recent Feedback</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {RECENT.map((item) => {
                  const { icon: Icon, label, color } = TYPE_CONFIG[item.type];
                  return (
                    <div key={item.id} className={mergeClasses(s.card, s.cardPad)} style={{ cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <span style={{ color, marginTop: 2, flexShrink: 0, display: "inline-flex" }}><Icon size={14} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: tokens.colorWhite, marginBottom: 2 }}>{item.title}</div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: 10, color: tokens.colorMuted2 }}>{label}</span>
                            <span style={{ fontSize: 10, color: tokens.colorMuted2 }}>·</span>
                            <span style={{ fontSize: 10, color: tokens.colorMuted2 }}>{item.date}</span>
                          </div>
                        </div>
                        <span className={badgeForStatus(item.status)}>{statusLabel(item.status)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
