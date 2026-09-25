/**
 * The result model of the release preflight.
 *
 * A release check can end in exactly three states:
 *
 *   PASS          the check ran and succeeded
 *   FAIL          the check ran and failed
 *   NOT EXECUTED  the check needs a capability this environment does not have
 *
 * `NOT EXECUTED` is deliberately not a failure: the Windows runtime checks
 * cannot run in a Linux container, and reporting them as failures would train
 * everyone to ignore the report. They are reported as *manual* blockers instead,
 * so they are impossible to overlook without pretending they failed.
 *
 * Nothing here inspects files by itself; it only holds and formats results.
 */

export const PASS = 'PASS';
export const FAIL = 'FAIL';
export const NOT_EXECUTED = 'NOT EXECUTED';

/** A check that could not run for an environmental reason. */
export function skipped(name, detail) {
  return { name, status: NOT_EXECUTED, detail };
}

/**
 * Collects the results of one run.
 *
 * `add` is used by the check modules; `run` wraps a check so a thrown error is
 * recorded as a failure of that check instead of aborting the whole preflight.
 */
export function createReport(label) {
  const results = [];
  let currentSection = 'general';

  return {
    label,
    results,
    section(name) {
      currentSection = name;
      return this;
    },
    add(name, status, detail = '') {
      if (![PASS, FAIL, NOT_EXECUTED].includes(status)) {
        throw new Error(`unknown release check status: ${status}`);
      }
      results.push({ section: currentSection, name, status, detail });
      return this;
    },
    /** Records `PASS`/`FAIL` from a boolean, the shape most checks have. */
    assert(name, passed, detail = '') {
      return this.add(name, passed ? PASS : FAIL, passed ? '' : detail);
    },
    async run(name, run) {
      try {
        const outcome = await run();
        if (outcome && typeof outcome === 'object' && 'status' in outcome) {
          this.add(name, outcome.status, outcome.detail ?? '');
        } else {
          this.assert(name, Boolean(outcome));
        }
      } catch (error) {
        this.add(name, FAIL, error instanceof Error ? error.message : String(error));
      }
      return this;
    },
  };
}

export function countByStatus(results, status) {
  return results.filter((result) => result.status === status).length;
}

/**
 * Splits the results into what blocks an automated release and what still needs
 * a person on Windows. Anything that did not run is a manual blocker; anything
 * that ran and failed is an automatic one.
 */
export function summarize(report, { sections = null } = {}) {
  const results = sections ? report.results.filter((r) => sections.includes(r.section)) : report.results;
  const failures = results.filter((result) => result.status === FAIL);
  const notExecuted = results.filter((result) => result.status === NOT_EXECUTED);
  const passed = results.filter((result) => result.status === PASS);

  return {
    total: results.length,
    passed: passed.length,
    failures,
    notExecuted,
    automaticBlockers: failures.map((result) => `${result.section}: ${result.name}${result.detail ? ` — ${result.detail}` : ''}`),
    manualBlockers: notExecuted.map((result) => `${result.section}: ${result.name}${result.detail ? ` — ${result.detail}` : ''}`),
    /** A release can only be automated-clean; Windows validation stays manual. */
    hasAutomaticBlockers: failures.length > 0,
    isAutomaticallyReady: failures.length === 0,
  };
}

/** Renders a report the way the console output does, grouped by section. */
export function formatResults(results) {
  const lines = [];
  const sections = [...new Set(results.map((result) => result.section))];
  for (const section of sections) {
    const sectionResults = results.filter((result) => result.section === section);
    const passed = countByStatus(sectionResults, PASS);
    lines.push('');
    lines.push(`${section.toUpperCase()} — ${passed}/${sectionResults.length} passed`);
    for (const result of sectionResults) {
      const suffix = result.detail ? `  (${result.detail})` : '';
      lines.push(`  [${result.status}] ${result.name}${suffix}`);
    }
  }
  return lines.join('\n');
}
