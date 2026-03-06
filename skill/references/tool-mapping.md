# Tool → Animation Mapping (Copilot CLI)

Reference for how Copilot CLI tool calls map to pixel character animations.

| Tool | Animation | Status Text |
|---|---|---|
| `powershell` | Typing | `Running: <command>` |
| `view` | Reading | `Reading <file>` |
| `edit` | Typing | `Editing <file>` |
| `create` | Typing | `Creating <file>` |
| `glob` | Reading | `Searching files` |
| `grep` | Reading | `Searching code` |
| `web_search` | Reading | `Searching the web` |
| `web_fetch` | Reading | `Fetching web content` |
| `task` | Sub-agent spawn | `Subtask: <description>` |
| `ask_user` | Permission bubble | `Waiting for your answer` |
| `report_intent` | Status label (no animation) | `<intent text>` |
| `sql` | Typing | `Querying database` |
| `read_powershell` | Reading | `Reading output` |
| `write_powershell` | Typing | `Sending input` |
| `github-mcp-server-*` | Reading | `GitHub: <action>` |

## Event → Character State

| Event Type | Character State |
|---|---|
| `assistant.turn_start` | Active (starts working) |
| `assistant.message` with tools | Active + tool animation |
| `tool.execution_complete` | Tool done animation |
| `assistant.turn_end` | Idle / Waiting |
| `tool.user_requested` | Permission speech bubble |
| `user.message` | Active (new task) |
| `report_intent` | Status label above character |
