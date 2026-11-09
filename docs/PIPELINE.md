# How work is run

How this project is built with agents. CLAUDE.md has the commands and the hard rules; this file has the process. It
is adapted from the owner's song-charting project, cut down to this project's size. Each rule's reason is in
brackets, so a rule can be dropped once its reason no longer holds.

## Roles

The agent roles live in `.claude/agents/`. A role file loads as an agent type when the folder existed at the
session's start; otherwise start a general agent and tell it to follow the file. The model is left out of the role
files, since model names stay out of the repository: it is chosen when the agent is started.

| Role | Does | Effort | Can edit |
|---|---|---|---|
| orchestrator (the main session) | writes briefs, reviews plans, merges, keeps PROGRESS | session's | yes |
| planner | turns a goal into work orders, as a fresh agent that reads only the repository | xhigh | its plan branch only |
| `tf-builder` | builds one order | xhigh (high for a small order) | its worktree only |
| `tf-reviewer` | reviews a diff, testing the tests | high | no |
| `tf-skeptic` | tries to refute a major finding | xhigh | no |

[A reviewer that can edit can quietly fix what it is reviewing.]

## Size the process to the risk

- **Direct:** merges, doc edits and small fixes, by the orchestrator.
- **An order** (the normal case): the lifecycle below.
- **A plan first** for anything that changes how renders are computed or stored: the planner writes the orders, and a
  different model reviews them before any build. [A mistake found in an order costs minutes; one found after a build
  costs hours.]

## An order, from brief to merge

1. **The brief** is a work order in `docs/work-orders/`. It says: the intent; the files it may and may not touch;
   the spec; what done means, each check with its command; its branch and worktree; a time budget, after which the
   builder stops and reports. When an order starts, add it to PROGRESS's `in_flight`. [A check that is not written
   down is judged by "looks done"; an order that is only in a session's memory is lost with the session.]
2. **`tf-builder`** builds in its own worktree, checks its own tests by breaking the code they cover, pushes its
   branch so CI runs, and writes its report to `docs/reports/<order>.md` on the branch.
3. **`tf-reviewer`** reviews the diff for correctness only, and tests the tests: it breaks each new check a few ways.
   [A reviewer asked to find problems always finds something, so style and taste are out of scope; checks whose own
   tests can be gutted unnoticed are the findings that slip past.]
4. **Findings:** a major finding that would change code goes to `tf-skeptic` first. A test gap the reviewer proved
   goes straight to the fixer. The fixer reproduces each minor finding, fixes the cheap ones, and the rest go under
   `deferred` in PROGRESS. The fixer is the order's builder, resumed with its context.
5. **The inspection** is CI on GitHub: a fresh checkout on a clean runner. Read the run on the branch's head commit
   yourself (its conclusion and head SHA), not only the builder's word.
6. **The merge** is local, `--no-ff`, with a message that says what the order did and how it was checked, then
   `git push origin HEAD:main`. Never GitHub's merge button (CLAUDE.md). Then update PROGRESS, remove the worktree,
   and check the live site serves the new version.

## Briefs and reports

- An agent writes its full detail to a file and returns at most about 1,500 words, with the file's path. [Long
  reports fill the orchestrating session's context.]
- Every brief gives the session's paths (the main checkout, the scratch folder, the browser), the commit trailer
  lines, and what else is running on the machine.
- A report never claims a check that was not run, and says what was not done.

## Long runs

- **Heavy jobs** (the browser suite, a codec build) run one at a time: `flock /tmp/tf2ve-heavy.lock <command>`. [The
  browser suite times a live microphone chain; two at once on four cores make it flaky.]
- **Parallel builds** only for orders whose files don't overlap, each in its own worktree, and at most two at once.
  Reviewers, skeptics and planners don't count.
- **A pushed branch is never rebased or force-pushed**: bring main in with a merge.
- **Long jobs run as tracked tasks** (an agent, or the tool's background mode), never detached. [A cloud container
  with no turn running and nothing tracked is reclaimed after a few idle minutes.]
- **Stalls:** check in at least every 50 minutes while agents run; a stall is 20 minutes with no commit and no new
  output.
- Resume from the failure instead of starting over.
