# How work is run

How this project is built with agents. CLAUDE.md has the commands and the hard rules; this file has the process. It
is adapted from the owner's song-charting project, cut down to this project's size. Each rule's reason is in
brackets, so a rule can be dropped once its reason no longer holds.

## Roles

The agent roles live in `.claude/agents/`. A role file loads as an agent type when the folder existed at the
session's start; otherwise start a general agent and tell it to follow the file. The model is left out of the role
files, since model names stay out of the repository: it is chosen when the agent is started.

| Role | Does | Runs on | Effort | Can edit |
|---|---|---|---|---|
| orchestrator (the main session) | writes briefs, reads every diff it merges, judges findings, merges, keeps PROGRESS | the stronger model | high | yes |
| planner | turns a goal into work orders, as a fresh agent that reads only the repository | the stronger model | high | its plan branch only |
| plan reviewer | reads a plan as the one who would have to build it | the builders' model | high | no |
| `tf-builder` | builds one order | the builders' model | xhigh (high for a small order) | its worktree only |
| `tf-reviewer` | reviews a diff, testing the tests | the builders' model | high | no |
| `tf-skeptic` | tries to refute a major finding | the stronger model | high | no |

[A reviewer that can edit can quietly fix what it is reviewing.]

## Which model does what

Two models are in use: the stronger one the orchestrating session runs on, and the one builders run on, which costs
half as much per token.

- **The builders' model where a test can say whether the work is right:** building an order whose checks are written
  down, and breaking code to see whether the tests notice.
- **The stronger model where judgment is the only check:** what to build (plans), whether a finding is real (the
  skeptic), what the evidence shows (a constant, a recording, a root cause), and the last read of a diff before it
  merges.

[Their vendor's published comparison (2026-11) puts the two closest on agentic coding (a few points apart) and
furthest apart on long unattended work, scientific computing and research. So the stronger model's price buys least
on a well-specified build and most where nothing but judgment catches a mistake. The same source says most of the
stronger model's gain is present at high effort, and that more costs many more tokens for little. It also reports
the stronger model at high effort matching the builders' model at its highest for about half the cost per task on
one coding benchmark: that has not been tried here, and one order built that way would show it. Nearly all of these
figures are the vendor's own. Re-read this section when either model changes.]

- **The orchestrator reads the diff of what it merges,** not only the builder's and the reviewer's summaries. [A
  summary names the large changes and leaves out small ones.]
- **After a fix round the orchestrator reviews the fix itself,** and starts a second reviewer only when the fix is as
  large as an order.
- **A plan is still read by a different model before its build:** the stronger model writes it, and an agent on the
  builders' model reads it for what it could not build from the order as written.

## Size the process to the risk

- **Direct:** merges, doc edits and small fixes, by the orchestrator.
- **An order** (the normal case): the lifecycle below.
- **A plan first** for anything that changes how renders are computed or stored: the planner writes the orders, and a
  different model reviews them before any build (see "Which model does what"). [A mistake found in an order costs
  minutes; one found after a build costs hours.]

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
- A brief says what needs no approval (merging main in, a retry after a network error, re-running a job that died
  before any test ran) as well as what is forbidden, and a caution stays in a brief or in PROGRESS only while its
  reason holds. A reviewer's conditions apply to the order it reviewed, not to later ones. [Cautions pile up wherever
  context carries over, and an agent that follows them all asks for approvals nobody needs or holds routine work.]

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
