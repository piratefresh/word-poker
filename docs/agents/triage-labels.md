# Triage Labels

The skills speak in terms of canonical triage roles. This file maps those roles to the
labels this repo's Linear workspace already carries, so `/triage` applies existing labels
instead of inventing duplicates.

| Role in the skills | Label in our tracker | Meaning                                  |
| ------------------ | -------------------- | ---------------------------------------- |
| `needs-triage`     | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`       | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`  | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`  | `ready-for-human`    | Requires human implementation            |
| `wontfix`          | `wontfix`            | Will not be actioned                     |
| `bug`              | `Bug`                | Something is broken                      |
| `enhancement`      | `Improvement`        | New feature or improvement               |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the string
from the right-hand column — Linear's are capitalised where the role isn't.

Every triaged issue carries exactly one category role and one state role.

The team's other labels — `Feature`, `frontend`, `Backend`, `UI`, `tutorial`, `powerups` —
describe the work rather than its triage state. A ticket carrying one of them still gets a
category and a state role.
