# Installing & Configuring Chorale (Skill + MCP Server)

Chorale is a score-focused music workspace, agent skill, and MCP server for AI coding agents (**Codex**, **Google Antigravity**, **Claude Code**, and compatible MCP clients).

---

## 1. Prerequisites & Quick Build

Ensure you have **Node.js (v20+)** installed.

```bash
# Clone the repository
git clone https://github.com/hxy9243/chorale.git
cd chorale

# Install dependencies
npm install

# Build web workspace and compile TypeScript
npm run build

# Run verification tests
npm test
```

---

## 2. OpenAI Codex Setup

Chorale includes a native Codex plugin declaration in [`.codex-plugin/plugin.json`](./.codex-plugin/plugin.json).

### Option A: Local Plugin Directory
In your Codex environment or project:
```bash
codex plugin install /path/to/chorale
```
Codex automatically detects:
- **MCP Server:** [`.mcp.json`](./.mcp.json) (`node ./server.mjs`)
- **Agent Skill:** [`skills/chorale-score/SKILL.md`](./skills/chorale-score/SKILL.md)

---

## 3. Google Antigravity Setup

### Option A: Workspace Integration (Project-specific)
If you open this repository (or symlink Chorale into your workspace):
1. **Skill Discovery:** Antigravity automatically detects the skill located at [`.agents/skills/chorale-score/SKILL.md`](./.agents/skills/chorale-score/SKILL.md).
2. **MCP Configuration:** Register the MCP server in your project's `.agents/mcp_config.json` (or root `mcp_config.json`):
   ```json
   {
     "mcpServers": {
       "chorale": {
         "command": "node",
         "args": ["/path/to/chorale/server.mjs"]
       }
     }
   }
   ```

### Option B: Global Machine Installation
To use Chorale in any workspace:
1. Copy or symlink the skill to your global Antigravity config:
   ```bash
   mkdir -p ~/.gemini/config/skills/chorale-score
   cp /path/to/chorale/skills/chorale-score/SKILL.md ~/.gemini/config/skills/chorale-score/
   ```
2. Add the MCP server entry to your global MCP settings (`~/.gemini/antigravity/mcp/chorale.json` or global config):
   ```json
   {
     "command": "node",
     "args": ["/path/to/chorale/server.mjs"]
   }
   ```

---

## 4. Claude Code / Generic MCP Clients

Add the Chorale MCP server entry to your MCP configuration file (e.g. `claude_desktop_config.json` or `.mcp.json`):

```json
{
  "mcpServers": {
    "chorale": {
      "command": "node",
      "args": ["/absolute/path/to/chorale/server.mjs"],
      "cwd": "/absolute/path/to/chorale"
    }
  }
}
```

---

## 5. Tool Reference

| Tool | Description | Inputs |
| :--- | :--- | :--- |
| `create_score` | Persist a new score document from valid ABC source notation. | `title` (string), `abcSource` (string) |
| `list_scores` | List all saved scores with summary metrics. | (none) |
| `get_score_summary` | Read title, revision, measure count, and annotation count. | `documentId` (string) |
| `read_measure_range` | Read an exact inclusive range of written measures. | `documentId` (string), `startMeasure` (number), `endMeasure` (number), optional `viewId` |
| `read_measure_selection` | Read the currently selected measure range from a connected Chorale score view. | `viewId` (string, default: `"plugin-main"`) |
| `edit_score` | Authoritatively update/replace the ABC source of a score. | `documentId` (string), `expectedRevision` (number), `replacementAbc` (string), `summary` (string) |
| `add_annotations` | Add analytical or performance annotations to measure ranges. | `documentId` (string), `expectedRevision` (number), `annotations` (array of `{ startMeasure, endMeasure, label, body }`) |
| `edit_annotations` | Modify an existing annotation's text, label, or measure span. | `documentId` (string), `expectedRevision` (number), `annotationId` (string), `updates` (object) |
| `delete_annotations` | Remove one or more annotations by ID. | `documentId` (string), `expectedRevision` (number), `annotationIds` (array of strings) |
| `render_score_workspace` | Render an interactive sheet music view in compatible MCP Apps hosts. | `documentId` (string) |

---

## 6. Live Score Workspace

When running `node server.mjs`, Chorale serves the built score workspace UI at:
```
http://127.0.0.1:43171/
```
You can also run the Vite live development server:
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser. Any edits made by an agent via MCP will automatically synchronize to the live browser view.
