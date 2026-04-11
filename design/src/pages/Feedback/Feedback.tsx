import { type FC, useState } from "react";
import { AppHeader } from "../../components/AppHeader/AppHeader.js";
import { IconBug, IconSparkles, IconChat, IconQuestion } from "../../lib/icons.js";
import "./Feedback.css";

type FeedbackType = "bug" | "feature" | "general" | "question";

const TYPE_CONFIG: Record<FeedbackType, { icon: FC<{ size?: number }>; label: string; color: string }> = {
  bug: { icon: IconBug, label: "Bug Report", color: "rgba(206,17,38,0.8)" },
  feature: { icon: IconSparkles, label: "Feature Request", color: "var(--green)" },
  general: { icon: IconChat, label: "General", color: "var(--muted)" },
  question: { icon: IconQuestion, label: "Question", color: "var(--yellow)" },
};

const RECENT = [
  { id: 1, type: "bug" as FeedbackType, title: "Player controls flicker on seek", status: "open", date: "3 days ago" },
  { id: 2, type: "feature" as FeedbackType, title: "Add subtitle track selector", status: "planned", date: "1 week ago" },
  { id: 3, type: "question" as FeedbackType, title: "How to add a NAS library?", status: "answered", date: "2 weeks ago" },
];

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "badge badge-red" },
  planned: { label: "Planned", className: "badge badge-green" },
  answered: { label: "Answered", className: "badge badge-gray" },
};

export const Feedback: FC = () => {
  const [type, setType] = useState<FeedbackType>("general");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const TypeChip: FC<{ t: FeedbackType }> = ({ t }) => {
    const { icon: Icon, label, color } = TYPE_CONFIG[t];
    return (
      <button
        className={`type-chip${type === t ? " active" : ""}`}
        style={type === t ? { color, borderColor: color } : undefined}
        onClick={() => setType(t)}
      >
        <Icon size={11} />
        {label}
      </button>
    );
  };

  return (
    <>
      <AppHeader collapsed={false}>
        <span className="topbar-title">Feedback</span>
      </AppHeader>

      <div className="main">
        <div className="content">
          <div className="feedback-layout">
            {/* Submit form */}
            <div>
              <div className="page-header">
                <div>
                  <div className="page-title">Submit Feedback</div>
                  <div className="page-desc">Help us improve Moran — bugs, ideas, and questions welcome</div>
                </div>
              </div>

              <div className="card card-pad" style={{ marginBottom: 24 }}>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <div className="type-chips">
                    <TypeChip t="bug" />
                    <TypeChip t="feature" />
                    <TypeChip t="general" />
                    <TypeChip t="question" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Title</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Brief summary of your feedback"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-input"
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
                    style={{ resize: "vertical" }}
                  />
                </div>
                <button className="btn btn-red btn-md" disabled={!title.trim()}>
                  Submit Feedback
                </button>
              </div>
            </div>

            {/* Recent feedback */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted2)", marginBottom: 12 }}>
                Your Recent Feedback
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {RECENT.map((item) => {
                  const { icon: Icon, label, color } = TYPE_CONFIG[item.type];
                  const badge = STATUS_BADGE[item.status];
                  return (
                    <div key={item.id} className="card card-pad" style={{ cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <Icon size={14} style={{ color, marginTop: 2, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--white)", marginBottom: 2 }}>{item.title}</div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: 10, color: "var(--muted2)" }}>{label}</span>
                            <span style={{ fontSize: 10, color: "var(--muted2)" }}>·</span>
                            <span style={{ fontSize: 10, color: "var(--muted2)" }}>{item.date}</span>
                          </div>
                        </div>
                        <span className={badge.className}>{badge.label}</span>
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
