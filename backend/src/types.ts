export type Severity = "bug" | "security" | "style" | "suggestion" | "performance"

export interface PullRequestRef {
    owner : string,
    repo : string,
    pullNumber : number;
}

export interface ParsedFile {
    path : string,
    patch : string,
    addedLines : number[];
}

export interface ConventionRule {
    id?: string,
    rule : string,
    rationale : string,
    severity : Severity,
    kind?: "learned" | "custom",
    enabled?: boolean,
}

export interface FileContext {
    path : string,
    patch : string,
    addedLines : number[],
    /** Line-numbered code around the changed lines at the PR head; empty if omitted. */
    excerpt : string
}

/** A changed file that was skipped or only partly reviewed, with the reason. */
export interface SkippedFile {
    path : string,
    reason : string
}
