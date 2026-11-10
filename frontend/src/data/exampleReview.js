/**
 * A real PRHawk review, copied from aryen1101/Persona_Based_AIChatbot pull
 * request #2 ("PRHawk test", 10 Nov 2026). The file was written to contain
 * deliberate issues; the summary and comments are PRHawk's output as posted.
 */
export const exampleReview = {
  repository: "aryen1101/Persona_Based_AIChatbot",
  number: 2,
  title: "PRHawk test",
  author: "aryen1101",
  head: "prhawk-test",
  base: "main",
  additions: 16,
  deletions: 0,
  postedAfterSeconds: 9,
  summary: {
    qualityScore: 55,
    mergeDecision: "request_changes",
    highestRiskChanges: [
      "Hardcoded API key in source code",
      "SQL query built via string concatenation causing injection risk",
      "Off-by-one error in average loop leading to out-of-bounds access",
    ],
    rationale:
      "The PR introduces serious security flaws (hard-coded secret and unsafe SQL construction) and a clear bug in the averaging logic that can produce incorrect results or runtime errors. These issues must be fixed before the code can be safely merged.",
  },
  file: {
    path: "prhawk-test.js",
    lines: [
      "// PRHawk test file: contains deliberate issues for the reviewer to find.",
      'const API_KEY = "hardcoded-demo-key";',
      "",
      "function getUser(db, userId) {",
      '  return db.query("SELECT * FROM users WHERE id = " + userId);',
      "}",
      "",
      "function average(values) {",
      "  let total = 0;",
      "  for (let i = 0; i <= values.length; i++) {",
      "    total += values[i];",
      "  }",
      "  return total / values.length;",
      "}",
      "",
      "module.exports = { API_KEY, getUser, average };",
    ],
  },
  comments: [
    {
      line: 2,
      severity: "security",
      issue: "Hardcoded API key is committed in source code",
      whyItMatters:
        "Embedding secrets in the repository exposes them to anyone who can view the code, making it easy for attackers to misuse the key and preventing safe rotation of credentials.",
      suggestedFix:
        "Replace the literal with a runtime read, e.g., const API_KEY = process.env.API_KEY; and ensure the key is provided via environment configuration, not version-controlled files.",
    },
    {
      line: 5,
      severity: "security",
      issue: "SQL query is constructed by concatenating user-controlled input",
      whyItMatters:
        "Directly appending userId to the query string allows an attacker to inject malicious SQL, potentially compromising or destroying database data.",
      suggestedFix:
        "Use parameterised queries or a query builder, e.g., db.query('SELECT * FROM users WHERE id = ?', [userId]); so the database driver safely escapes the value.",
    },
    {
      line: 10,
      severity: "bug",
      issue: "Loop condition uses <= values.length, causing out-of-bounds access",
      whyItMatters:
        "When i equals values.length the code reads values[i] which is undefined; adding this to total yields NaN and the function returns an incorrect average, breaking downstream logic.",
      suggestedFix: "Change the condition to i < values.length so the loop iterates only over valid indices.",
    },
    {
      line: 13,
      severity: "bug",
      issue: "Division by values.length without handling an empty array",
      whyItMatters:
        "If values is empty, dividing by zero produces Infinity (or NaN), which can propagate unexpected values through the application and cause errors.",
      suggestedFix:
        "Add a guard before the division, e.g., if (values.length === 0) return 0; (or throw an error) to handle the empty-array case safely.",
    },
  ],
};
