<p align="center">
  <img src="docs/images/banner.jpg" alt="graph-memory" width="100%" />
</p>

<h1 align="center">graph-memory</h1>

<p align="center">
  <strong>Knowledge Graph Context Engine for OpenClaw</strong><br>
  By <a href="mailto:Wywelljob@gmail.com">adoresever</a> · MIT License
</p>

<p align="center">
  <a href="#installation">Installation</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="README_CN.md">中文文档</a>
</p>

---

<p align="center">
  <img src="docs/images/hero.png" alt="graph-memory overview" width="90%" />
</p>

## What it does

When conversations grow long, agents lose track of what happened. graph-memory solves three problems at once:

1. **Context explosion** — 174 messages eat 95K tokens. graph-memory compresses to ~24K by replacing raw history with structured knowledge graph nodes
2. **Cross-session amnesia** — Yesterday's bugs, solved problems, all gone in a new session. graph-memory recalls relevant knowledge automatically via FTS5/vector search + graph traversal
3. **Skill islands** — Self-improving agents record learnings as isolated markdown. graph-memory connects them: "installed libgl1" and "ImportError: libGL.so.1" are linked by a `SOLVED_BY` edge

**It feels like talking to an agent that learns from experience. Because it does.**

## Real-world results

<p align="center">
  <img src="docs/images/token-comparison.png" alt="Token comparison: 7 rounds" width="85%" />
</p>

7-round conversation installing bilibili-mcp + login + query:

| Round | Without graph-memory | With graph-memory |
|-------|---------------------|-------------------|
| R1 | 14,957 | 14,957 |
| R4 | 81,632 | 29,175 |
| R7 | **95,187** | **23,977** |

**75% compression.** Red = linear growth without graph-memory. Blue = stabilized with graph-memory.

## How it works

### The Knowledge Graph

graph-memory builds a typed property graph from conversations:

- **3 node types**: `TASK` (what was done), `SKILL` (how to do it), `EVENT` (what went wrong)
- **5 edge types**: `USED_SKILL`, `SOLVED_BY`, `REQUIRES`, `PATCHES`, `CONFLICTS_WITH`
- **Personalized PageRank**: ranks nodes by relevance to the current query, not global popularity
- **Community detection**: automatically groups related skills (Docker cluster, Python cluster, etc.)
- **Vector dedup**: merges semantically duplicate nodes via cosine similarity

### Data flow

```
Message in → ingest (zero LLM)
  ├─ All messages saved to gm_messages
  └─ Signal detection → errors/corrections/completions → gm_signals

assemble (zero LLM)
  ├─ Graph nodes → XML (systemPromptAddition)
  ├─ PPR ranking decides injection priority
  └─ Keep last N raw messages (fresh tail)

compact (background, async, non-blocking)
  ├─ Read gm_signals + gm_messages
  ├─ LLM extracts triples → gm_nodes + gm_edges
  └─ Does NOT block user messages (fire-and-forget)

session_end
  ├─ finalize (LLM): EVENT → SKILL promotion
  └─ maintenance (zero LLM): dedup → PageRank → community detection

Next session → before_agent_start
  ├─ FTS5/vector search for seed nodes
  ├─ Community expansion (same-cluster peers)
  ├─ Recursive CTE graph traversal
  └─ Personalized PageRank ranking → inject into context
```

### Personalized PageRank (PPR)

Unlike global PageRank, PPR ranks nodes **relative to your current query**:

- Ask about "Docker deployment" → Docker-related SKILLs rank highest
- Ask about "conda environment" → conda-related SKILLs rank highest
- Same graph, completely different rankings per query
- Computed in real-time at recall (~5ms for thousands of nodes)

## Installation

### Prerequisites

- [OpenClaw](https://github.com/openclaw/openclaw) (v2026.3.x+)
- Node.js 22+

### Step 1: Install the plugin

```bash
pnpm openclaw plugins install graph-memory
```

That's it. No `node-gyp`, no manual compilation. The SQLite driver (`@photostructure/sqlite`) ships prebuilt binaries inside the npm tarball — works with OpenClaw's `--ignore-scripts` install.

You can also install from GitHub:

```bash
pnpm openclaw plugins install github:adoresever/graph-memory
```

### Step 2: Activate context engine

This is the **critical step** most people miss. graph-memory must be registered as the context engine, otherwise OpenClaw will only use it for recall but **won't ingest messages or extract knowledge**.

Edit `~/.openclaw/openclaw.json` and add `plugins.slots`:

```json
{
  "plugins": {
    "slots": {
      "contextEngine": "graph-memory"
    },
    "entries": {
      "graph-memory": {
        "enabled": true
      }
    }
  }
}
```

Without `"contextEngine": "graph-memory"` in `plugins.slots`, the plugin registers but the `ingest` / `assemble` / `compact` pipeline never fires — you'll see `recall` in logs but zero data in the database.

### Step 3: Configure LLM and Embedding

Add your API credentials inside `plugins.entries.graph-memory.config`:

```json
{
  "plugins": {
    "slots": {
      "contextEngine": "graph-memory"
    },
    "entries": {
      "graph-memory": {
        "enabled": true,
        "config": {
          "llm": {
            "apiKey": "your-llm-api-key",
            "baseURL": "https://api.openai.com/v1",
            "model": "gpt-4o-mini"
          },
          "embedding": {
            "apiKey": "your-embedding-api-key",
            "baseURL": "https://api.openai.com/v1",
            "model": "text-embedding-3-small",
            "dimensions": 512
          }
        }
      }
    }
  }
}
```

**LLM** (`config.llm`) — Required. Used for knowledge extraction during `compact`. Any OpenAI-compatible endpoint works. Use a cheap/fast model.

**Embedding** (`config.embedding`) — Optional. Enables semantic vector search + vector dedup. Without it, falls back to FTS5 full-text search (still works, just keyword-based).

If `config.llm` is not set, graph-memory falls back to the `ANTHROPIC_API_KEY` environment variable + Anthropic API.

### Full openclaw.json example

Here's a complete working configuration with a custom OpenAI-compatible provider:

```json
{
  "models": {
    "providers": {
      "my-provider": {
        "baseUrl": "https://api.example.com/v1",
        "apiKey": "your-main-api-key",
        "api": "openai-completions",
        "models": [
          {
            "id": "my-model",
            "name": "My Model",
            "reasoning": false,
            "input": ["text"],
            "contextWindow": 128000,
            "maxTokens": 8192
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "my-provider/my-model"
      },
      "compaction": {
        "mode": "safeguard"
      }
    }
  },
  "plugins": {
    "slots": {
      "contextEngine": "graph-memory"
    },
    "entries": {
      "graph-memory": {
        "enabled": true,
        "config": {
          "llm": {
            "apiKey": "your-llm-api-key",
            "baseURL": "https://api.example.com/v1",
            "model": "my-model"
          },
          "embedding": {
            "apiKey": "your-embedding-api-key",
            "baseURL": "https://api.embedding-provider.com/v1",
            "model": "text-embedding-model",
            "dimensions": 1024
          }
        }
      }
    }
  }
}
```

> **Note**: `config.llm.baseURL` uses uppercase `URL` (OpenAI SDK format). This is different from the OpenClaw provider's `baseUrl` (lowercase `l`). Don't mix them up.

### Restart and verify

```bash
pnpm openclaw gateway --verbose
```

You should see these two lines in the startup log:

```
[graph-memory] ready | db=~/.openclaw/graph-memory.db | provider=... | model=...
[graph-memory] vector search ready
```

If you see `FTS5 search mode` instead of `vector search ready`, your embedding config is missing or the API key is invalid.

After a few rounds of conversation, verify knowledge extraction:

```bash
# Check messages are being ingested
sqlite3 ~/.openclaw/graph-memory.db "SELECT COUNT(*) FROM gm_messages;"

# Check knowledge triples are being extracted
sqlite3 ~/.openclaw/graph-memory.db "SELECT type, name, description FROM gm_nodes LIMIT 10;"

# Check cross-session recall is working (in gateway logs)
# Look for: [graph-memory] recalled N nodes, M edges
```

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `recall` works but `gm_messages` is empty | `plugins.slots.contextEngine` not set | Add `"contextEngine": "graph-memory"` to `plugins.slots` |
| `FTS5 search mode` instead of `vector search ready` | Embedding not configured or API key invalid | Check `config.embedding` credentials |
| `Database is not defined` error on startup | Old version installed | Update to v1.1.1+: `pnpm openclaw plugins install graph-memory` |
| Nodes are empty after many messages | `compactTurnCount` not reached | Default is 7 messages. Keep chatting or set a lower value |

## Agent tools

| Tool | Description |
|------|-------------|
| `gm_search` | Search the knowledge graph for relevant skills, events, and solutions |
| `gm_record` | Manually record knowledge to the graph |
| `gm_stats` | View graph statistics: nodes, edges, communities, PageRank top nodes |
| `gm_maintain` | Manually trigger graph maintenance: dedup → PageRank → community detection |

## Configuration

All parameters have defaults. Only set what you want to override.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `dbPath` | `~/.openclaw/graph-memory.db` | SQLite database path |
| `compactTurnCount` | `7` | Messages needed to trigger knowledge extraction |
| `recallMaxNodes` | `6` | Max nodes injected per recall |
| `recallMaxDepth` | `2` | Graph traversal hops from seed nodes |
| `freshTailCount` | `10` | Recent messages kept as-is (not compressed) |
| `dedupThreshold` | `0.90` | Cosine similarity threshold for node dedup |
| `pagerankDamping` | `0.85` | PPR damping factor |
| `pagerankIterations` | `20` | PPR iteration count |

## Database

SQLite via `@photostructure/sqlite` (prebuilt binaries, zero native compilation). Default: `~/.openclaw/graph-memory.db`.

| Table | Purpose |
|-------|---------|
| `gm_nodes` | Knowledge nodes with pagerank + community_id |
| `gm_edges` | Typed relationships |
| `gm_nodes_fts` | FTS5 full-text index |
| `gm_messages` | Raw conversation messages |
| `gm_signals` | Detected signals |
| `gm_vectors` | Embedding vectors (optional) |

## vs lossless-claw

| | lossless-claw | graph-memory |
|--|---|---|
| **Approach** | DAG of summaries | Knowledge graph (triples) |
| **Recall** | FTS grep + sub-agent expansion | FTS5/vector → PPR → graph traversal |
| **Cross-session** | Per-conversation only | Automatic cross-session recall |
| **Compression** | Summaries (lossy text) | Structured triples (lossless semantics) |
| **Graph algorithms** | None | PageRank, community detection, vector dedup |

## Development

```bash
npm install
npm test        # 53 tests
npx vitest      # watch mode
```

### Project structure

```
graph-memory/
├── index.ts                     # Plugin entry point
├── openclaw.plugin.json         # Plugin manifest
├── src/
│   ├── types.ts                 # Type definitions
│   ├── store/                   # SQLite CRUD / FTS5 / CTE traversal
│   ├── engine/                  # Signal detection, LLM, Embedding
│   ├── extractor/               # Knowledge extraction prompts
│   ├── recaller/                # Cross-session recall (PPR)
│   ├── format/                  # Context assembly + transcript repair
│   └── graph/                   # PageRank, community, dedup, maintenance
└── test/                        # 53 vitest tests
```

## License

MIT
