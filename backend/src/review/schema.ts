import { z } from "zod";

export const severitySchema = z.enum([
    "bug" , "security" , "performance" , "style" , "suggestion"
])

export const inlineCommentSchema = z.object({
    path: z.string().describe("File path exactly as given in the diff."),
    line: z.number().describe("Line number on the new (RIGHT) side. MUST be one of the addable line numbers listed for that file."),
    severity : severitySchema,
    issue: z.string().describe("What the problem is - the finding itself."),
    whyItMatters : z.string().describe("Plain-English explanation a junior developer can understand without external research: why this matters in production."),
    suggestedFix : z.string().describe("A concrete, actionable suggested fix."),
})

export const riskSummarySchema = z.object({
    qualityScore: z.number().describe("Overall code quality score from 0 (poor) to 100 (excellent)."),
    highestRiskChanges: z.array(z.string()).describe("Short descriptions of the highest-risk changes in this PR."),
    mergeDecisions : z.enum(["approve" , "request_changes" , "comment"]).describe("Recommended merge decision."),
    rationale: z.string().describe("Rationale for the recommended merge decisions.")
})

export const reviewResultSchema = z.object({
    summary : riskSummarySchema,
    comments : z.array(inlineCommentSchema)
})

export type ReviewResult = z.infer<typeof reviewResultSchema>
export type InlineComment = z.infer<typeof inlineCommentSchema>
export type RiskSummary = z.infer<typeof riskSummarySchema>