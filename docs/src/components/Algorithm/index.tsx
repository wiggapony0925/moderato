/**
 * The algorithm page's live sections, wired to the real rehearsal report.
 */

import report from "@site/static/rehearsal/latest.json";
import { AblationChart, type AblationRow } from "../Viz/AblationChart";
import { EvasionMatrix, type EvasionRow } from "../Viz/EvasionMatrix";
import { ConfusionGrid, type Confusion } from "../Viz/ConfusionGrid";
import { Pipeline } from "../Viz/Pipeline";

interface Report {
  ablation: AblationRow[];
  evasion: EvasionRow[];
  confusion: Confusion;
  corpus: { cases: number };
}

const data = report as unknown as Report;

export function AlgorithmPipeline(): JSX.Element {
  return <Pipeline />;
}

export function AlgorithmAblation(): JSX.Element {
  return <AblationChart rows={data.ablation} />;
}

export function AlgorithmEvasion(): JSX.Element {
  return <EvasionMatrix rows={data.evasion} />;
}

export function AlgorithmConfusion(): JSX.Element {
  return <ConfusionGrid grid={data.confusion} />;
}
