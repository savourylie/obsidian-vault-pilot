# Ticket 047 — Provider-Specific Errors and Help Text

- Type: UX polish
- Owner: @you
- Status: Ready

## Summary
Improve user guidance for provider connection failures and model listing problems.

## Why
Clear, provider-specific guidance reduces confusion and support overhead.

## Scope
- Settings model list help:
  - Ollama: keep existing “Download/Start Ollama” guidance.
  - LM Studio: “Enable LM Studio Local Server (OpenAI-compatible) and try again.” Link to https://lmstudio.ai.
- Error notices:
  - Ollama: “Could not connect to Ollama. Is it running?”
  - LM Studio: “Could not connect to LM Studio. Is Local Server enabled?”

## Out of Scope
- Networking retries or backoff.

## Acceptance Criteria
- Correct help text appears according to provider.
- Error toasts show the right provider name.

## Implementation Steps
1. Branch help text and error notices on `settings.provider`.
2. Ensure no duplicated code; small helpers acceptable.

## Validation
- Toggle provider; simulate offline servers; verify messages.

