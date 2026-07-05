#!/usr/bin/env python3
"""Report token usage and estimated cost for Claude Code sessions.

Reads the session transcript JSONL files that Claude Code writes under
~/.claude/projects/<project-slug>/ and sums usage per model, pricing each
token class (input, output, cache read, cache write 5m/1h) separately.

Usage:
  python3 session_cost.py            # latest session for this project
  python3 session_cost.py --all      # every session for this project
  python3 session_cost.py <file>     # a specific transcript .jsonl
"""
import json
import sys
from pathlib import Path

PROJECT_SLUG = "-Users-nabarunsengupta-Projects-kaushalstack"
TRANSCRIPT_DIR = Path.home() / ".claude" / "projects" / PROJECT_SLUG

# USD per 1M tokens: (input, output). Cache read = 0.1x input,
# cache write = 1.25x input (5m TTL) or 2x input (1h TTL).
PRICING = {
    "claude-fable-5": (10.00, 50.00),
    "claude-mythos-5": (10.00, 50.00),
    "claude-opus-4-8": (5.00, 25.00),
    "claude-opus-4-7": (5.00, 25.00),
    "claude-opus-4-6": (5.00, 25.00),
    "claude-sonnet-5": (3.00, 15.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-haiku-4-5": (1.00, 5.00),
}


def price_for(model):
    for key, p in PRICING.items():
        if model.startswith(key):
            return p
    return None


def collect(files):
    per_model = {}
    seen = set()
    for f in files:
        with open(f, encoding="utf-8") as fh:
            for line in fh:
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                msg = entry.get("message") or {}
                usage = msg.get("usage")
                model = msg.get("model", "")
                if not usage or not model or model.startswith("<"):
                    continue
                # streaming can persist the same assistant message twice
                key = (f.name, msg.get("id"), entry.get("requestId"))
                if msg.get("id") and key in seen:
                    continue
                seen.add(key)
                b = per_model.setdefault(
                    model, {"in": 0, "out": 0, "cr": 0, "cw5": 0, "cw1": 0, "msgs": 0}
                )
                b["in"] += usage.get("input_tokens", 0)
                b["out"] += usage.get("output_tokens", 0)
                b["cr"] += usage.get("cache_read_input_tokens", 0)
                cc = usage.get("cache_creation") or {}
                cw5 = cc.get("ephemeral_5m_input_tokens")
                cw1 = cc.get("ephemeral_1h_input_tokens", 0)
                if cw5 is None:  # older entries: only the flat total
                    cw5 = usage.get("cache_creation_input_tokens", 0)
                    cw1 = 0
                b["cw5"] += cw5
                b["cw1"] += cw1
                b["msgs"] += 1
    return per_model


def main():
    args = [a for a in sys.argv[1:]]
    if args and args[0] not in ("--all",):
        files = [Path(args[0])]
    else:
        jsonls = sorted(
            TRANSCRIPT_DIR.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True
        )
        if not jsonls:
            sys.exit(f"No transcripts found in {TRANSCRIPT_DIR}")
        files = jsonls if args and args[0] == "--all" else [jsonls[0]]

    per_model = collect(files)
    if not per_model:
        sys.exit("No usage entries found.")

    scope = f"{len(files)} session(s)" if len(files) > 1 else files[0].stem
    print(f"Token usage — {scope}\n")
    header = f"{'model':<20} {'msgs':>5} {'input':>10} {'output':>10} {'cache rd':>11} {'cache wr':>10} {'est. cost':>10}"
    print(header)
    print("-" * len(header))
    total = 0.0
    for model, b in sorted(per_model.items()):
        p = price_for(model)
        if p:
            pin, pout = p
            cost = (
                b["in"] * pin
                + b["out"] * pout
                + b["cr"] * pin * 0.10
                + b["cw5"] * pin * 1.25
                + b["cw1"] * pin * 2.00
            ) / 1_000_000
            total += cost
            cost_s = f"${cost:,.4f}"
        else:
            cost_s = "unknown"
        cw = b["cw5"] + b["cw1"]
        print(
            f"{model:<20} {b['msgs']:>5} {b['in']:>10,} {b['out']:>10,} {b['cr']:>11,} {cw:>10,} {cost_s:>10}"
        )
    print("-" * len(header))
    print(f"{'TOTAL':<20} {'':>5} {'':>10} {'':>10} {'':>11} {'':>10} {'$' + format(total, ',.4f'):>10}")
    print(
        "\nRates: cache read = 0.1x input, cache write = 1.25x (5m) / 2x (1h) input."
        "\nEstimates use list prices; batch/intro discounts not applied."
    )


if __name__ == "__main__":
    main()
