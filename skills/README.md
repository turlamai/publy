# Publy agent skill

[简体中文](README.zh-CN.md)

[`publy-publish/SKILL.md`](publy-publish/SKILL.md) is a portable instruction file for agents that support this skill format. It uses the Publy CLI and Markdown files; Obsidian and Typora are optional. It does not install Publy, add accounts, or grant permission to create drafts.

Install the Publy CLI separately using the current [user guide](../docs/USER-GUIDE.md). For Codex, copy the `publy-publish` folder into `~/.codex/skills/` and restart or reload skills if needed. For another agent, consult its instructions for the location and support of `SKILL.md`; if it cannot load skills, supply the file as workflow instructions only if that agent supports user-provided instructions. Do not assume every agent discovers this folder automatically. Check `publy capabilities --json` against the installed version before relying on optional features.

Ask the agent to preview a specific Markdown file, or authorize it to create a draft for that file in a named WeChat account. The skill never authorizes public publication. Original files remain in place; generated previews are local artifacts to review and remove when no longer needed.
