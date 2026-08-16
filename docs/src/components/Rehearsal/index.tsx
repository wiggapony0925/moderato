/**
 * The rehearsal report — the metrics page, wired to the real JSON that
 * `npm run rehearse` writes.
 *
 * The threshold slider is not a demo. Everything below it recomputes from
 * the same sweep the library was tuned against, so a reader can put the
 * line where THEIR product wants it and see what that costs before they
 * write a config file.
 */

import { useMemo, useState } from "react";
import { SweepChart, type SweepPoint } from "../Viz/SweepChart";
import { OutcomeBar } from "../Viz/OutcomeBar";
import { StatRow, StatTile } from "../Viz/StatTile";
import { ActionBadge } from "../Viz/ActionBadge";
import report from "@site/static/rehearsal/latest.json";
import styles from "./styles.module.css";

interface Report {
  version: string;
  generatedAt: string;
  provider: string;
  shippedThreshold: number;
  corpus: { cases: number; byExpected: Record<string, number>; bySource: Record<string, number> };
  headline: {
    precision: number;
    recall: number;
    accuracy: number;
    autoHandled: number;
    queueRate: number;
    counts: { allow: number; review: number; block: number };
    confusion: { tp: number; fp: number; fn: number };
  };
  sweep: SweepPoint[];
  byTag: Array<{ tag: string; total: number; correct: number; accuracy: number }>;
  failures: Array<{
    id: string;
    text: string;
    expected: "allow" | "review" | "block";
    actual: "allow" | "review" | "block";
    note: string | null;
  }>;
}

const data = report as unknown as Report;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function Rehearsal(): JSX.Element {
  const [threshold, setThreshold] = useState(data.shippedThreshold);

  const point = useMemo(
    () =>
      data.sweep.reduce((closest, p) =>
        Math.abs(p.threshold - threshold) < Math.abs(closest.threshold - threshold)
          ? p
          : closest,
      ),
    [threshold],
  );

  const total = data.corpus.cases;
  const counts = useMemo(() => {
    const block = Math.round(point.blockRate * total);
    const review = Math.round(point.queueRate * total);
    return { allow: total - block - review, review, block };
  }, [point, total]);

  const shipped = Math.abs(threshold - data.shippedThreshold) < 0.001;

  return (
    <div className={styles.root}>
      <div className={styles.meta}>
        <span>
          moderato <strong>{data.version}</strong>
        </span>
        <span>
          provider <strong>{data.provider}</strong>
        </span>
        <span>
          corpus <strong>{total}</strong> cases
        </span>
        <span>
          run <strong>{data.generatedAt.slice(0, 10)}</strong>
        </span>
      </div>

      <StatRow>
        <StatTile
          label="Precision"
          value={pct(data.headline.precision)}
          caption="Of everything auto-refused, how much deserved it. This is the number that says how often we deleted a real post."
          tone={data.headline.precision >= 0.95 ? "good" : "warning"}
        />
        <StatTile
          label="Recall"
          value={pct(data.headline.recall)}
          caption="Of everything that deserved refusing, how much we caught without a human."
          tone={data.headline.recall >= 0.8 ? "good" : "warning"}
        />
        <StatTile
          label="Exact match"
          value={pct(data.headline.accuracy)}
          caption="Cases where allow / review / block matched the human label exactly."
        />
        <StatTile
          label="Decided alone"
          value={pct(data.headline.autoHandled)}
          caption="Share resolved with no moderator involved. The rest is queue work."
        />
      </StatRow>

      <div className={styles.callout}>
        <p>
          <strong>Read the recall number before you trust anything else here.</strong>{" "}
          This run uses the <code>{data.provider}</code> provider — the free,
          offline wordlist, which is what a static docs site can run. It sees
          listed words and nothing else, so &ldquo;I hate black people&rdquo; sails
          straight through it. That gap <em>is</em> the argument for putting a
          classifier behind your own endpoint; it is not a bug in the wordlist,
          it is the wordlist working as advertised. Re-run with{" "}
          <code>OPENAI_API_KEY</code> set and this page changes.
        </p>
      </div>

      <SweepChart sweep={data.sweep} threshold={threshold} onThreshold={setThreshold} />

      <div className={styles.split}>
        <OutcomeBar counts={counts} total={total} />
        <div className={styles.readout}>
          <h3>
            At <code>blockScore: {point.threshold.toFixed(2)}</code>
            {shipped ? <span className={styles.shippedPill}>shipped default</span> : null}
          </h3>
          <dl className={styles.dl}>
            <div>
              <dt>Precision</dt>
              <dd>{pct(point.precision)}</dd>
            </div>
            <div>
              <dt>Recall</dt>
              <dd>{pct(point.recall)}</dd>
            </div>
            <div>
              <dt>F1</dt>
              <dd>{pct(point.f1)}</dd>
            </div>
            <div>
              <dt>Queue rate</dt>
              <dd>{pct(point.queueRate)}</dd>
            </div>
          </dl>
          <p className="mdMuted">
            Drag the slider. Moving it left refuses more and queues less — you
            buy moderator time with false refusals. Moving it right does the
            reverse. There is no setting that gives you both, which is why this
            is a product decision and not a default we could pick for you.
          </p>
        </div>
      </div>

      <section>
        <h3>Where it is weakest</h3>
        <p className="mdMuted">
          Accuracy by tag at the shipped threshold, worst first. A tag scoring
          badly is a queue of work, not a verdict on the library — it is the
          list of what to fix next.
        </p>
        <div className="mdScroll">
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Tag</th>
                <th scope="col">Cases</th>
                <th scope="col">Correct</th>
                <th scope="col">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {data.byTag.map((row) => (
                <tr key={row.tag}>
                  <th scope="row">{row.tag}</th>
                  <td>{row.total}</td>
                  <td>{row.correct}</td>
                  <td>
                    <span className={styles.tagBar} aria-hidden>
                      <span
                        className={styles.tagFill}
                        style={{
                          width: `${row.accuracy * 100}%`,
                          background:
                            row.accuracy >= 0.9
                              ? "var(--viz-good)"
                              : row.accuracy >= 0.6
                                ? "var(--viz-warning)"
                                : "var(--viz-critical)",
                        }}
                      />
                    </span>
                    {pct(row.accuracy)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3>Every case it gets wrong ({data.failures.length})</h3>
        <p className="mdMuted">
          Published in full, deliberately. A metrics page that shows only the
          aggregate is marketing; the failures are the part you can act on.
        </p>
        <div className="mdScroll">
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Text</th>
                <th scope="col">Should be</th>
                <th scope="col">Actually</th>
                <th scope="col">Why it is hard</th>
              </tr>
            </thead>
            <tbody>
              {data.failures.map((row) => (
                <tr key={row.id}>
                  <td className={styles.cellText}>{row.text || "(empty)"}</td>
                  <td>
                    <ActionBadge action={row.expected} compact />
                  </td>
                  <td>
                    <ActionBadge action={row.actual} compact />
                  </td>
                  <td className={styles.cellNote}>{row.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
