"""
ONDC Lead Scout Agent — uses Claude + MCP tools to autonomously discover,
score, qualify, and report on ONDC leads.

Usage:
  python agent.py                          # local stdio MCP (default)
  AGENT_MCP_MODE=remote python agent.py   # remote SSE (deployed VPS)
  python agent.py "your custom query"     # override default query

Env vars:
  AGENT_MCP_MODE   local (default) | remote
  MCP_SSE_URL      SSE endpoint when remote (default: https://ondc.kaushalstack.com/mcp/sse)
  ANTHROPIC_API_KEY
"""

import asyncio
import json
import os
import sys
from contextlib import asynccontextmanager

import anthropic
from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.client.stdio import StdioServerParameters, stdio_client

DEFAULT_QUERY = (
    "Find physiotherapy and rehab service providers near Bengaluru on ONDC, "
    "score and qualify the top leads, then give me a digest of the funnel."
)

SYSTEM_PROMPT = """You are the KaushalStack ONDC Lead Scout agent. Your job is to
autonomously discover, score, and qualify business leads on the ONDC network.

You have access to these MCP tools:
- discover_nearby_demand  — fire a Beckn /search to find providers/buyers near a location
- get_leads               — read scored leads from the store
- qualify_lead            — advance a lead through the pipeline (new→qualified→responded→won/lost)
- lead_digest             — get a funnel snapshot (counts, top queries, avg score)
- generate_onboarding_keys — one-time Ed25519 keygen (only use if asked)

Workflow for each task:
1. Call discover_nearby_demand to seed the store with fresh results
2. Call get_leads to read and assess what came in
3. qualify_lead for leads that look strong (score ≥ 70) → status "qualified"
4. Call lead_digest for the funnel summary
5. Provide a concise final report: top leads, pipeline state, recommended next actions

Be decisive. Don't ask clarifying questions — act on the intent given."""


@asynccontextmanager
async def mcp_session():
    mode = os.getenv("AGENT_MCP_MODE", "local").lower()

    if mode == "remote":
        sse_url = os.getenv("MCP_SSE_URL", "https://ondc.kaushalstack.com/mcp/sse")
        print(f"[agent] connecting to remote MCP at {sse_url}")
        async with sse_client(sse_url) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                yield session
    else:
        venv_python = os.path.join(
            os.path.dirname(__file__), ".venv", "bin", "python"
        )
        if not os.path.exists(venv_python):
            venv_python = sys.executable
        params = StdioServerParameters(
            command=venv_python,
            args=["-m", "src.mcp_server"],
            cwd=os.path.dirname(__file__) or ".",
            env={**os.environ, "MCP_TRANSPORT": "stdio"},
        )
        print(f"[agent] spawning local MCP subprocess via {venv_python}")
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                yield session


def _fmt_tool_result(content) -> str:
    if isinstance(content, list):
        parts = []
        for block in content:
            if hasattr(block, "text"):
                parts.append(block.text)
            else:
                parts.append(str(block))
        return "\n".join(parts)
    return str(content)


async def run_agent(query: str):
    client = anthropic.Anthropic()

    async with mcp_session() as session:
        tools_result = await session.list_tools()
        tools = [
            {
                "name": t.name,
                "description": t.description or "",
                "input_schema": t.inputSchema,
            }
            for t in tools_result.tools
        ]
        print(f"[agent] loaded {len(tools)} MCP tools: {[t['name'] for t in tools]}\n")

        messages = [{"role": "user", "content": query}]

        turn = 0
        while True:
            turn += 1
            print(f"─── turn {turn} ───────────────────────────────────────")

            response = client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=4096,
                system=[
                    {
                        "type": "text",
                        "text": SYSTEM_PROMPT,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                tools=tools,
                messages=messages,
            )

            # Collect text and tool_use blocks
            text_parts = []
            tool_calls = []
            for block in response.content:
                if hasattr(block, "text"):
                    text_parts.append(block.text)
                elif block.type == "tool_use":
                    tool_calls.append(block)

            if text_parts:
                print("\n".join(text_parts))

            # Append assistant turn
            messages.append({"role": "assistant", "content": response.content})

            if response.stop_reason != "tool_use" or not tool_calls:
                break

            # Execute all tool calls and collect results
            tool_results = []
            for tc in tool_calls:
                print(f"\n[tool] {tc.name}({json.dumps(tc.input, ensure_ascii=False)})")
                mcp_result = await session.call_tool(tc.name, tc.input)
                result_text = _fmt_tool_result(mcp_result.content)
                # Truncate very long results for display
                display = result_text if len(result_text) <= 600 else result_text[:600] + "\n… (truncated)"
                print(f"[result] {display}")
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tc.id,
                    "content": result_text,
                })

            messages.append({"role": "user", "content": tool_results})

        print("\n" + "═" * 54)
        print("AGENT COMPLETE")
        print("═" * 54)


if __name__ == "__main__":
    query = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else DEFAULT_QUERY
    print(f"[agent] query: {query}\n")
    asyncio.run(run_agent(query))
