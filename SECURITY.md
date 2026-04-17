# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

**Email:** wim.yedema@gmail.com

Please do **not** open a public GitHub issue for security vulnerabilities.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

You should receive a response within 72 hours.

## Architecture Notes

- This is a fully client-side application — no server stores or processes data
- P2P communication uses WebRTC with end-to-end encryption
- Nostr relay messages are encrypted with AES-256-GCM using room-derived keys
- No authentication tokens or user credentials are stored
