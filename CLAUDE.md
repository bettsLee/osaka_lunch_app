# CLAUDE.md

## Project Overview
오사카 여행 중 방문한 점심 식당을 저장하고,
메뉴·가격·평점을 기록해 다음 방문을 계획하는 앱.

## Tech Stack
- Frontend: Next.js 15 (TypeScript) + Tailwind CSS
- Backend: Spring Boot 3.5 (Java 17) + Gradle
- Database: PostgreSQL
- Auth: Supabase Auth
- Hosting: Vercel (frontend) + Render (backend)

## Folder Structure
- frontend/ → Next.js project
- backend/ → Spring Boot project

## Branch Strategy
- main: production (no direct commits)
- develop: integration branch
- feature/OL-{issue}-{name}: feature branches

## Code Rules
- Commit message: [OL-number] description
- PR title: [OL-number] description
- Comments: written in Korean
- Env vars: add keys only to .env.example (never commit values)

## Completion Checklist
After all work is done:
1. Commit to feature/OL-{issue} branch
2. Create PR with:
   ```
   gh pr create --base develop \
     --title "[OL-issue] title" \
     --body "summary of changes"
   ```

## References
- Jira board: https://lsk941017.atlassian.net/jira/software/projects/OL/boards/1
- GitHub: https://github.com/bettsLee/osaka_lunch_app

---

## AI Coding Guidelines

Behavioral guidelines to reduce common LLM coding mistakes.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
