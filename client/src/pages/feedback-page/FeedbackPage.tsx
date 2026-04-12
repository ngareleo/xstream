import React, { type FC, useState } from "react";

import { strings } from "./FeedbackPage.strings.js";
import { useFeedbackStyles } from "./FeedbackPage.styles.js";

type Category = "bug" | "feature" | "other";

export const FeedbackPage: FC = () => {
  const styles = useFeedbackStyles();
  const [category, setCategory] = useState<Category>("bug");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (): void => {
    if (!message.trim()) return;
    setMessage("");
    setCategory("bug");
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 4000);
  };

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div className={styles.heading}>{strings.heading}</div>
        <div className={styles.sub}>{strings.subtitle}</div>

        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="category">
            {strings.labelCategory}
          </label>
          <select
            id="category"
            className={styles.select}
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            <option value="bug">{strings.optionBug}</option>
            <option value="feature">{strings.optionFeature}</option>
            <option value="other">{strings.optionOther}</option>
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="message">
            {strings.labelMessage}
          </label>
          <textarea
            id="message"
            className={styles.textarea}
            placeholder={strings.messagePlaceholder}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <button
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={!message.trim()}
          type="button"
        >
          {strings.submitBtn}
        </button>

        {submitted && <div className={styles.successMsg}>{strings.successMsg}</div>}
      </div>
    </div>
  );
};
