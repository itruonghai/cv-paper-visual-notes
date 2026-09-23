#!/usr/bin/env python3
"""Run a bounded Playwright notebook check without using the user's desktop."""
import argparse
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("notebook", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--node", default=shutil.which("node"))
    parser.add_argument("--playwright", default=os.environ.get("CV_NOTEBOOK_PLAYWRIGHT", ""))
    parser.add_argument("--browser", default=os.environ.get("CV_NOTEBOOK_BROWSER", ""))
    parser.add_argument("--timeout", type=int, default=45)
    args = parser.parse_args()
    if not args.node:
        parser.error("Node.js is unavailable. Pass --node /absolute/path/to/node.")
    if not 5 <= args.timeout <= 50:
        parser.error("Timeout must be between 5 and 50 seconds.")
    command = [args.node, str(Path(__file__).with_name("check_notebook.cjs")),
               str(args.notebook.resolve(strict=True)), str(args.output.resolve()), args.playwright, args.browser]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, start_new_session=os.name != "nt")
    try:
        stdout, stderr = process.communicate(timeout=args.timeout)
    except subprocess.TimeoutExpired:
        if os.name != "nt":
            os.killpg(process.pid, signal.SIGTERM)
        else:
            process.terminate()
        try:
            process.communicate(timeout=3)
        except subprocess.TimeoutExpired:
            if os.name != "nt":
                os.killpg(process.pid, signal.SIGKILL)
            else:
                process.kill()
            process.communicate()
        parser.exit(2, "Browser check timed out. Do not loop on the same launch: inspect the environment/permissions, then report visual QA incomplete if unresolved.\n")
    if stdout:
        print(stdout, end="")
    if stderr:
        print(stderr, end="", file=sys.stderr)
    raise SystemExit(process.returncode)


if __name__ == "__main__":
    try:
        main()
    except OSError as error:
        sys.exit("Cannot run browser check: " + str(error))
