---
argument-hint: "<pdf | arxiv-id/url | title> [quick|deep]"
---

Arguments: $ARGUMENTS

This skill is installed at `${CLAUDE_SKILL_DIR}`. Resolve its helper scripts from that absolute directory. Use Claude Code's Read tool to inspect the full-page PNG before selecting a crop and the cropped PNG afterwards. Read can also inspect PDF pages for initial reading. Use Bash for the documented local helper commands with the selected interpreter; ordinary tool permissions continue to apply. Invoke this skill as `/cv-paper-visual-notes`.
