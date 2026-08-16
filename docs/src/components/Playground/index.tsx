/**
 * The playground: type anything, see what moderato does, tell it whether
 * it was right.
 *
 * Two jobs, and the second is the interesting one.
 *
 * 1. It is the fastest possible answer to "what would this library do to my
 *    users' text" — faster than installing it.
 * 2. Every "no, that's wrong" is a labelled case. Disagreements with a
 *    moderation system are the only data that tells you where its line is
 *    actually mis-set, and they are normally thrown away. Here they
 *    accumulate into a corpus the rehearsal is scored against, so a reader
 *    who spends two minutes disagreeing with us has measurably improved the
 *    library.
 *
 * It runs the OFFLINE provider, because this is a static site with no
 * server and no vendor key. That means it shows you the free instant layer
 * and nothing else — which is honest, and is exactly why the metrics page
 * exists to say how much that layer misses on its own.
 */

import { useCallback, useMemo, useState } from "react";
import {
  POLICY_PRESETS,
  PROFANITY_PRESET,
  createModerato,
  wordlistProvider,
  type Action,
  type Verdict,
} from "moderato";
import { useModeratedField } from "moderato/react";
import { ActionBadge, ACTION_COPY } from "../Viz/ActionBadge";
import { ScoreBars } from "../Viz/ScoreBars";
import {
  addCase,
  clearCases,
  loadCases,
  removeCase,
  toJsonl,
  type LabelledCase,
} from "./store";
import styles from "./styles.module.css";

type Surface = "comment" | "identity";

const engine = createModerato({
  provider: wordlistProvider(PROFANITY_PRESET),
  // Off, so retyping the same thing after changing the surface re-screens
  // rather than replaying a verdict from a different policy.
  cache: false,
});

const SURFACES: Array<{ id: Surface; label: string; hint: string }> = [
  {
    id: "comment",
    label: "Comment / post",
    hint: "Body text. Refuses the indefensible, queues the doubtful.",
  },
  {
    id: "identity",
    label: "Username / team name",
    hint: "Permanent public identity. Refuses anything that trips at all.",
  },
];

const SAMPLES = [
  "I grew up in Scunthorpe",
  "that guitar solo is sick",
  "this is fucking great",
  "shit!",
  "I hate black people",
  "n1gg3r",
];

export default function Playground(): JSX.Element {
  const [surface, setSurface] = useState<Surface>("comment");
  const [cases, setCases] = useState<LabelledCase[]>(() => loadCases());
  // null = not answering yet; "asking" = the prompt is up.
  const [answering, setAnswering] = useState(false);
  const [correction, setCorrection] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const policy = surface === "identity" ? POLICY_PRESETS.identity : POLICY_PRESETS.balanced;

  const field = useModeratedField({
    engine,
    policy,
    // Screen everything, not just the blocking verdicts — this page is for
    // looking at the decision, so every verdict is interesting.
    blockOn: ["block", "review"],
    debounceMs: 250,
    minLength: 1,
    onBlocked: () => setAnswering(false),
    onCleared: () => setAnswering(false),
  });

  const verdict: Verdict | null = field.verdict;
  const text = field.value.trim();

  const reset = useCallback(() => {
    setAnswering(false);
    setCorrection(null);
    setNote("");
  }, []);

  const record = useCallback(
    (agreed: boolean, expected: Action) => {
      if (!verdict || !text) return;
      setCases(
        addCase({
          text: field.value,
          expected,
          surface,
          tags: ["playground", verdict.action],
          note: note.trim() || null,
          observed: {
            action: verdict.action,
            score: verdict.score,
            categories: verdict.categories,
            ...(verdict.rule ? { rule: verdict.rule } : {}),
          },
          agreed,
        }),
      );
      setSaved(agreed ? "Saved — logged as agreement." : "Saved — logged as a correction.");
      reset();
      window.setTimeout(() => setSaved(null), 3500);
    },
    [field.value, note, reset, surface, text, verdict],
  );

  const download = useCallback(() => {
    const blob = new Blob([toJsonl(cases)], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "playground.jsonl";
    a.click();
    URL.revokeObjectURL(url);
  }, [cases]);

  const agreements = useMemo(() => cases.filter((c) => c.agreed).length, [cases]);

  return (
    <div className={styles.root}>
      <div className={styles.surfaces} role="radiogroup" aria-label="Surface">
        {SURFACES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={surface === option.id}
            className={surface === option.id ? styles.surfaceOn : styles.surface}
            onClick={() => {
              setSurface(option.id);
              reset();
            }}
          >
            <span className={styles.surfaceLabel}>{option.label}</span>
            <span className={styles.surfaceHint}>{option.hint}</span>
          </button>
        ))}
      </div>

      <label className={styles.label} htmlFor="playground-input">
        Type anything
      </label>
      <textarea
        id="playground-input"
        className={styles.input}
        rows={3}
        placeholder="Say something a user of your product might say…"
        spellCheck={false}
        value={field.value}
        onChange={(event) => {
          field.inputProps.onChange(event);
          reset();
        }}
        onBlur={field.inputProps.onBlur}
      />

      <div className={styles.samples}>
        <span className={styles.samplesLabel}>Try:</span>
        {SAMPLES.map((sample) => (
          <button
            key={sample}
            type="button"
            className={styles.sample}
            onClick={() => {
              field.setValue(sample);
              reset();
            }}
          >
            {sample}
          </button>
        ))}
      </div>

      {text ? (
        <div className={styles.verdict} aria-live="polite">
          <div className={styles.verdictHead}>
            <ActionBadge action={verdict?.action ?? "allow"} pending={field.checking} />
            <div className={styles.verdictCopy}>
              <p className={styles.verdictWhat}>
                {ACTION_COPY[verdict?.action ?? "allow"].what}
              </p>
              <p className={styles.verdictWhy}>
                {verdict?.detail ??
                  "Nothing tripped. The offline wordlist found no listed term."}
              </p>
            </div>
          </div>

          {verdict && verdict.categories.length > 0 ? (
            <ScoreBars
              categories={verdict.categories}
              score={verdict.score}
              rule={verdict.rule}
            />
          ) : null}

          {!answering ? (
            <div className={styles.prompt}>
              <p className={styles.promptQ}>Is that what you expected?</p>
              <div className={styles.promptRow}>
                <button
                  type="button"
                  className={styles.yes}
                  onClick={() => record(true, verdict?.action ?? "allow")}
                  disabled={field.checking || !verdict}
                >
                  Yes — that's right
                </button>
                <button
                  type="button"
                  className={styles.no}
                  onClick={() => {
                    setAnswering(true);
                    setCorrection(null);
                  }}
                  disabled={field.checking || !verdict}
                >
                  No — it got this wrong
                </button>
              </div>
              <p className={styles.promptFine}>
                Saved in your browser only. Nothing is sent anywhere — you export
                the file and open a pull request if you want it counted.
              </p>
            </div>
          ) : (
            <div className={styles.prompt}>
              <p className={styles.promptQ}>What should it have done?</p>
              <div className={styles.promptRow}>
                {(["allow", "review", "block"] as Action[]).map((action) => (
                  <button
                    key={action}
                    type="button"
                    className={correction === action ? styles.choiceOn : styles.choice}
                    onClick={() => setCorrection(action)}
                    aria-pressed={correction === action}
                  >
                    <ActionBadge action={action} compact />
                    <span>{ACTION_COPY[action].short}</span>
                  </button>
                ))}
              </div>
              <label className={styles.label} htmlFor="playground-note">
                Why? (optional — this is the bit a maintainer reads)
              </label>
              <input
                id="playground-note"
                className={styles.noteInput}
                value={note}
                placeholder="e.g. this is a slur, not ordinary profanity"
                onChange={(event) => setNote(event.target.value)}
              />
              <div className={styles.promptRow}>
                <button
                  type="button"
                  className={styles.yes}
                  disabled={correction === null}
                  onClick={() => correction && record(false, correction)}
                >
                  Save correction
                </button>
                <button type="button" className={styles.ghost} onClick={reset}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {saved ? <p className={styles.saved}>{saved}</p> : null}
        </div>
      ) : null}

      <section className={styles.collected} aria-label="Cases you have labelled">
        <header className={styles.collectedHead}>
          <div>
            <h3 className={styles.collectedTitle}>
              Your corpus · {cases.length} case{cases.length === 1 ? "" : "s"}
            </h3>
            <p className={styles.mutedSmall}>
              {cases.length === 0
                ? "Nothing yet. Label a verdict above and it lands here."
                : `${agreements} agreement${agreements === 1 ? "" : "s"}, ${
                    cases.length - agreements
                  } correction${cases.length - agreements === 1 ? "" : "s"}.`}
            </p>
          </div>
          <div className={styles.collectedActions}>
            <button
              type="button"
              className={styles.ghost}
              onClick={download}
              disabled={cases.length === 0}
            >
              Download .jsonl
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => setCases(clearCases())}
              disabled={cases.length === 0}
            >
              Clear
            </button>
          </div>
        </header>

        {cases.length > 0 && (
          <div className="mdScroll">
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Text</th>
                  <th scope="col">moderato said</th>
                  <th scope="col">You said</th>
                  <th scope="col">Why</th>
                  <th scope="col">
                    <span className={styles.srOnly}>Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {cases.map((item) => (
                  <tr key={item.id}>
                    <td className={styles.cellText}>{item.text || "(empty)"}</td>
                    <td>
                      <ActionBadge action={item.observed.action} compact />
                    </td>
                    <td>
                      <ActionBadge action={item.expected} compact />
                    </td>
                    <td className={styles.cellNote}>{item.note ?? "—"}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.remove}
                        aria-label={`Remove "${item.text.slice(0, 40)}"`}
                        onClick={() => setCases(removeCase(item.id))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
