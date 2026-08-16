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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  defineModeration,
  type Action,
  type CategoryRule,
  type Verdict,
} from "moderato";
import { useModeratedField } from "moderato/react";
import { ActionBadge, ACTION_COPY } from "../Viz/ActionBadge";
import { ScoreBars } from "../Viz/ScoreBars";
import { clearLayout, useDraggable } from "./useDraggable";
import { Connectors } from "./Connectors";
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
 * What the rules panel is currently set to.
 *
 * Everything here maps onto a real `defineModeration` field, and the panel
 * prints the config it adds up to. That is the point: you fiddle until the
 * verdicts match what your product wants, then copy the object out.
 */
interface Rules {
  profanity: CategoryRule;
  hate: CategoryRule;
  personalData: boolean;
  allow: string;
}

/** The shipped behaviour, so "default" has something to mean. */
const DEFAULT_RULES: Rules = {
  profanity: "review",
  hate: "block",
  personalData: false,
  allow: "",
};

const words = (value: string): string[] =>
  value
    .split(/[,\n]/)
    .map((word) => word.trim())
    .filter(Boolean);

/**
 * Only the settings that differ from the defaults become rules.
 *
 * The distinction is real, not tidiness. A rule is an instruction, and an
 * explicit `profanity: "review"` says "never refuse this" — which is a
 * downgrade on a username, where the whole point is that profanity refuses.
 * Saying nothing leaves the surface's own judgement in place.
 */
function activeRules(rules: Rules): Record<string, CategoryRule> {
  const out: Record<string, CategoryRule> = {};
  if (rules.profanity !== DEFAULT_RULES.profanity) out.profanity = rules.profanity;
  if (rules.hate !== DEFAULT_RULES.hate) out.hate = rules.hate;
  return out;
}

/** The config those settings add up to — the thing you copy into your app. */
function configSource(rules: Rules): string {
  const lines: string[] = [];
  const ruled = Object.entries(activeRules(rules)).map(
    ([name, value]) => `${name}: "${value}"`,
  );
  if (ruled.length > 0) lines.push(`  rules: { ${ruled.join(", ")} },`);

  const allowed = words(rules.allow);
  if (allowed.length > 0) {
    lines.push(`  allow: [${allowed.map((w) => `"${w}"`).join(", ")}],`);
  }
  if (rules.personalData) lines.push(`  personalData: "all",`);
  lines.push("  surfaces: {");
  lines.push(`    comment: { kind: "body" },`);
  lines.push(`    username: { kind: "identity" },`);
  lines.push("  },");
  return `defineModeration({\n${lines.join("\n")}\n});`;
}

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

/**
 * Sample inputs, chosen to demonstrate a mechanism each.
 *
 * None of them is a slur. The fused-token scan is shown with ordinary
 * profanity ("bastardcollector") because it exercises exactly the same code
 * path, and a public page should not have a racial slur sitting on a button
 * for anyone who wanders past. The corpus keeps the real cases — a test
 * fixture has to contain the real thing — but a UI does not.
 */
/** The board is a pipeline; the wires say so even after you rearrange it. */
const CONNECTIONS = [
  { from: "composer", to: "verdict" },
  { from: "rules", to: "verdict" },
  { from: "verdict", to: "corpus" },
];

const SAMPLES = [
  "I grew up in Scunthorpe",
  "that guitar solo is sick",
  "this is fucking great",
  "shit!",
  "bastardcollector",
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
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [cases, setCases] = useState<LabelledCase[]>(() => loadCases());
  const [answering, setAnswering] = useState(false);
  const [correction, setCorrection] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  // Rebuilt whenever the rules panel changes, which is exactly what a real
  // app does not do — but here the whole point is watching the config move
  // the verdict. It is the offline layer only: static site, no vendor key.
  const moderation = useMemo(
    () =>
      defineModeration<Surface>({
        rules: activeRules(rules),
        allow: words(rules.allow),
        ...(rules.personalData ? ({ personalData: "all" } as const) : {}),
        cache: false,
        surfaces: {
          comment: { kind: "body" },
          identity: { kind: "identity" },
        },
      }),
    [rules],
  );

  const { engine, policy } = moderation.field(surface);

  const field = useModeratedField({
    engine,
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

  // Change a rule and the verdict on screen has to move with it, or the panel
  // is describing a config that is not the one being applied.
  const recheck = useRef(field.check);
  recheck.current = field.check;
  const hasText = text.length > 0;
  useEffect(() => {
    if (hasText) void recheck.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moderation, surface, hasText]);

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

  // Full-bleed mode. The board is the page then — no sidebar, no table of
  // contents, no article column squeezing three panels into a third of the
  // window. Escape closes it, because anything that takes over the screen
  // has to give it back the way people expect.
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFocused(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [focused]);

  // Wires are remeasured every frame while a pointer is down anywhere on the
  // board, and left alone the rest of the time.
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [wiring, setWiring] = useState(false);
  useEffect(() => {
    const stop = () => setWiring(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, []);

  return (
    <div className={focused ? styles.boardFocused : styles.board}>
      <div className={styles.boardHint}>
        <span>
          Drag a panel by the handle in its corner. Positions snap to the grid
          and are remembered.
        </span>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => setFocused((f) => !f)}
          aria-pressed={focused}
        >
          {focused ? "Exit full screen (Esc)" : "Full screen"}
        </button>
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

      <div
        className={styles.grid}
        ref={boardRef}
        onPointerDown={() => setWiring(true)}
      >
        <Connectors
          boardRef={boardRef}
          active={wiring}
          links={CONNECTIONS}
        />
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
          id="rules"
          title="Your rules"
          hint="What a product would ship. Change one and the verdict moves."
          actions={
            <div className={styles.panelActions}>
              <button
                type="button"
                className={styles.ghost}
                onClick={() => setRules(DEFAULT_RULES)}
                disabled={
                  rules.profanity === DEFAULT_RULES.profanity &&
                  rules.hate === DEFAULT_RULES.hate &&
                  rules.personalData === DEFAULT_RULES.personalData &&
                  rules.allow === DEFAULT_RULES.allow
                }
              >
                Defaults
              </button>
            </div>
          }
        >
          {(
            [
              {
                key: "profanity" as const,
                label: "Profanity",
                hint: "Swearing. Allowed on plenty of grown-up products.",
              },
              {
                key: "hate" as const,
                label: "Slurs and hate",
                hint: "Refused by default, and worth leaving that way.",
              },
            ]
          ).map((row) => (
            <div className={styles.ruleRow} key={row.key}>
              <div className={styles.ruleLabels}>
                <span className={styles.ruleName}>{row.label}</span>
                <span className={styles.ruleHint}>{row.hint}</span>
              </div>
              <div
                className={styles.segmented}
                role="radiogroup"
                aria-label={`${row.label} rule`}
              >
                {(["allow", "review", "block"] as CategoryRule[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={rules[row.key] === value}
                    className={
                      rules[row.key] === value ? styles.segOn : styles.seg
                    }
                    onClick={() => {
                      setRules((r) => ({ ...r, [row.key]: value }));
                      reset();
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className={styles.ruleRow}>
            <div className={styles.ruleLabels}>
              <span className={styles.ruleName}>Personal data</span>
              <span className={styles.ruleHint}>
                Cards, SSNs, phones, emails, coordinates — each one validated,
                not just pattern-matched.
              </span>
            </div>
            <div className={styles.segmented} role="radiogroup" aria-label="Personal data">
              {[
                { on: false, label: "off" },
                { on: true, label: "detect" },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={rules.personalData === option.on}
                  className={
                    rules.personalData === option.on ? styles.segOn : styles.seg
                  }
                  onClick={() => {
                    setRules((r) => ({ ...r, personalData: option.on }));
                    reset();
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className={styles.ruleName} htmlFor="playground-allow">
            Words you allow anyway
          </label>
          <p className={styles.ruleHint}>
            Matched the way listed words are, so allowing “ass” allows “@ss”
            and “a s s” too. Comma-separated.
          </p>
          <input
            id="playground-allow"
            className={styles.noteInput}
            value={rules.allow}
            placeholder="damn, hell, ass"
            spellCheck={false}
            onChange={(event) => {
              setRules((r) => ({ ...r, allow: event.target.value }));
              reset();
            }}
          />

          <p className={styles.ruleName} style={{ marginTop: "0.9rem" }}>
            The config this is
          </p>
          <pre className={styles.config}>
            <code>{configSource(rules)}</code>
          </pre>
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
