# Changelog

## Windows 0.1.4 Preview — 2026-11-04

- Show service-provided reset times below quota labels: local 24-hour HH:mm for five-hour quota and MM-DD for weekly quota; keep full reset timestamps in tooltips, including single-ring accounts.
- Clear reset labels when missing, invalid, unavailable or expired under the existing 150-second freshness rule. Do not add requests or infer reset times.
- Keep percentages below the rings and explicitly centered; use compact muted time chips and a subtle divider. Renderer version is 56. Startup, safety and retry behavior remain unchanged.
- Add local-time, cross-day timezone, invalid-data and recovery unit tests. All 42 Node tests and native policy regressions pass; independent browser checks cover light/dark themes, 100%/77% alignment and expiry/recovery. User approved the layout on one Windows PC; other devices and all scaling settings remain unverified.

## Windows 0.1.3 Preview — 2026-11-04

- Replace synchronous runtime PowerShell probes with one bounded asynchronous check at a time; temporary query failures no longer exit the quota backend.
- Retry local checks and quota reads independently with 5/10/20/30-second capped backoff. Keep both rings unavailable without old percentages on quota failures, and restore fresh values after recovery.
- Pause CDP requests when ownership cannot be confirmed and revalidate before reconnecting. Wrong-process or non-loopback listeners remain fatal safety errors; startup handoff, Ctrl+Q and tray behavior are unchanged.
- Prevent overlapping quota reads and stale callbacks after stop; rate-limit temporary failure logs rather than repeatedly showing dialogs.
- Add simulated timeout, malformed output, outage/recovery, retry timing, cancellation and fail-closed regression tests. All 39 Node tests and existing native policy checks pass. User confirmed the local patch on one Windows PC; other devices and all offline/sleep scenarios remain unverified.

## Windows 0.1.2 Preview — 2026-11-03

- Replace Restart Manager session-end shutdown with the client's Ctrl+Q application Quit command. Ordinary window Close was tested and rejected because it left Codex running in the background and required a second click.
- Wait three seconds after process exit before reactivation; stop requests or another instance cancel the handoff. Keep the original Codex entry point, baseline, foreground, single-window, startup-age and cooldown guards.
- Check that the candidate window is still foreground and Ctrl/Shift/Alt/Win/Q are not held; send one ordered input batch, release any partially submitted keys and never retry, force-kill, elevate or confirm an exit dialog on the user's behalf.
- SendInput cannot atomically lock focus to the verified window: a last-moment focus change can send Ctrl+Q to another app. This preview does not eliminate that risk.
- On 2026-11-03 the user confirmed the repaired original-icon path worked on one Windows PC; logs show Quit, cleanup delay, relaunch and refreshing placed quota. Reboot/login with the new Quit path, other devices and versions remain unverified.
- Add native shortcut/layout/partial-input and relaunch timing tests to CI. Preserve upstream attribution and all previous release assets.

## Windows 0.1.1 Preview — 2026-11-02

- Extend fresh-process startup detection to 30 seconds for cold starts.
- Allow keyboard/mouse activity during the single startup handoff; this can interrupt newly started work or change focus. Keep baseline, foreground, single-window, cooldown and no-force-kill protections.
- Launch the watcher through the real Explorer desktop so it survives the originating launcher; retain per-user login startup.
- Verified on one Windows PC for both normal launch and reboot/login startup, handoff, visible rings and live quota. Other devices and versions remain unverified.
- Preserve upstream MIT attribution; exclude local state, credentials, machine shortcuts and unverified icons from the portable release. Existing 0.1.0 release assets are unchanged.

The entries below describe the original macOS project.

## v0.9.4 Beta — first public release (macOS, 2026-10-28)

- Usage-only sidebar card with remaining-rate-limit ring(s); separate 5-hour and weekly rings when the rate-limit response supports them.
- Light/dark theme, keyboard focus and tooltips. UI component version: 53.
- Protected original-icon launch handoff, including a fix to allow a single hidden relaunch after a successful guarded quit even when subsequent input prevents focus stealing.
- This version has been installed and checked on one Mac: launch from the original Codex icon, automatic Ring display, usage readings and UI VERSION 53 all passed. Startup takes a few seconds longer than the previous version; this is a known experience difference. Other devices and future Codex versions remain unverified.
- Manager CDP connections now require the WebSocket protocol, a loopback host and the expected debugging port.
- Installation no longer calls legacy launcher cleanup: no automatic Dock/Launchpad changes, Dock restart or shortcut moves. Compatibility cleanup code is retained.
- No active auto-update mechanism; legacy update shortcuts and old update metadata are omitted. Safety migration modules are retained. Future updates require a manually obtained and checked package.
- Public English/Chinese documentation and the original MIT license are included; the old cover, Windows and historical development documents are omitted.
- No project size, folder-color or conversation-token feature in the current usage-only agent.

**Compatibility and security:** Not Apple-notarized. Uses a local debugging interface with significant privileges. See [SECURITY.md](SECURITY.md).

The applicable MIT license and original copyright notice are preserved in [LICENSE](LICENSE).
