/**
 * The playground: type anything, see what moderato does, tell it whether it
 * was right — and move the panels wherever you want them.
 *
 * Two jobs, and the second is the interesting one.
 *
 * 1. It is the fastest possible answer to "what would this library do to my
 *    users' text" — faster than installing it.
 * 2. Every "no, that's wrong" is a labelled case. Disagreements with a
 *    moderation system are the only data that says where its line is
 *    actually mis-set, and they are normally thrown away. Here they
 *    accumulate into a corpus the rehearsal is scored against.
 *
 * The panels sit on a grid you can drag them around. Not decoration:
 * comparing a verdict against the corpus you have been building means
 * wanting those two things side by side, and where they should sit depends
 * on your screen and what you are doing. Positions snap to the grid and are
 * remembered.
 *
 * It runs the OFFLINE provider, because this is a static site with no server
 * and no vendor key — the free instant layer and nothing else.
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
import { clearLayout, useDraggable } from "./useDraggable";
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

/**
 * Two engines, because the recommendation differs by surface. A username has
 * no spaces to tokenise on, so identity fields get the fused scan; body text
 * already has whitespace doing that job.
 */
const ENGINES: Record<Surface, ReturnType<typeof createModerato>> = {
  comment: createModerato({
    provider: wordlistProvider(PROFANITY_PRESET),
    cache: false,
  }),
  identity: createModerato({
    provider: wordlistProvider(PROFANITY_PRESET, { scanFused: true }),
    cache: false,
  }),
};

const SURFACES: Array<{ id: Surface; label: string; hint: string }> = [
  {
    id: "comment",
    label: "Comment or post",
    hint: "Body text. Refuses the indefensible, queues the doubtful.",
  },
  {
    id: "identity",
    label: "Username or team name",
    hint: "Permanent and public. Refuses anything that trips, and looks inside fused words.",
  },
];

const SAMPLES = [
  "I grew up in Scunthorpe",
  "that guitar solo is sick",
  "this is fucking great",
  "shit!",
  "niggercollector",
  "I hate black people",
];

/** A panel you can pick up and put somewhere else. */
function Panel({
  id,
  title,
  hint,
  children,
  actions,
}: {
  id: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}): JSX.Element {
  const drag = useDraggable(id, title);
  return (
    <section className={styles.panel} {...drag.panelProps}>
      <header className={styles.panelHead}>
        <span className={styles.grip} {...drag.handleProps}>
          <span aria-hidden className={styles.gripDots} />
        </span>
        <div className={styles.panelTitles}>
          <h3 className={styles.panelTitle}>{title}</h3>
          {hint && <p className={styles.panelHint}>{hint}</p>}
        </div>
        {drag.moved && (
          <button type="button" className={styles.snapBack} onClick={drag.reset}>
            Snap back
          </button>
        )}
        {actions}
      </header>
      {children}
    </section>
  );
}

export default function Playground(): JSX.Element {
  const [surface, setSurface] = useState<Surface>("comment");
  const [cases, setCases] = useState<LabelledCase[]>(() => loadCases());
  const [answering, setAnswering] = useState(false);
  const [correction, setCorrection] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const policy =
    surface === "identity" ? POLICY_PRESETS.identity : POLICY_PRESETS.balanced;

  const field = useModeratedField({
    engine: ENGINES[surface],
    policy,
    // Every verdict is interesting here, not just the refusals.
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
      setSaved(agreed ? "Logged as agreement." : "Logged as a correction.");
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
    <div className={styles.board}>
      <div className={styles.boardHint}>
        <span>
          Drag any panel by its handle to rearrange the board. Positions are
          remembered.
        </span>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => {
            clearLayout();
            window.location.reload();
          }}
        >
          Reset layout
        </button>
      </div>

      <div className={styles.grid}>
        <Panel
          id="composer"
          title="Try something"
          hint="Anything at all. It is screened in your browser; nothing is sent."
        >
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

          <label className={styles.srOnly} htmlFor="playground-input">
            Text to screen
          </label>
          <textarea
            id="playground-input"
            className={styles.input}
            rows={2}
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
            <span className={styles.samplesLabel}>Try</span>
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
        </Panel>

        <Panel
          id="verdict"
          title="What it decided"
          hint="And why — the rule that fired, and the score behind it."
        >
          {!text ? (
            <p className={styles.empty}>Type something and the verdict lands here.</p>
          ) : (
            <div aria-live="polite">
              <div
                className={`${styles.rule} ${styles[`rule_${verdict?.action ?? "allow"}`]}`}
              />
              <div className={styles.verdictHead}>
                <ActionBadge
                  action={verdict?.action ?? "allow"}
                  pending={field.checking}
                />
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
                      Yes, that's right
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
                      No, it got this wrong
                    </button>
                  </div>
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
                      </button>
                    ))}
                  </div>
                  <input
                    className={styles.noteInput}
                    value={note}
                    placeholder="Why? Optional — this is the bit a maintainer reads."
                    aria-label="Why was it wrong?"
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

              {saved ? (
                <p className={styles.saved}>
                  <span aria-hidden>✓</span>
                  {saved}
                </p>
              ) : null}
            </div>
          )}
        </Panel>

        <Panel
          id="corpus"
          title={`Your corpus · ${cases.length}`}
          hint={
            cases.length === 0
              ? "Kept in this browser. Nothing is sent anywhere."
              : `${agreements} agreement${agreements === 1 ? "" : "s"}, ${
                  cases.length - agreements
                } correction${cases.length - agreements === 1 ? "" : "s"}.`
          }
          actions={
            <div className={styles.panelActions}>
              <button
                type="button"
                className={styles.ghost}
                onClick={download}
                disabled={cases.length === 0}
              >
                Download
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
          }
        >
          {cases.length === 0 ? (
            <p className={styles.empty}>
              Label a verdict and it lands here, ready to export as JSONL.
            </p>
          ) : (
            <div className="mdScroll">
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Text</th>
                    <th scope="col">Said</th>
                    <th scope="col">You</th>
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
        </Panel>
      </div>
    </div>
  );
}
