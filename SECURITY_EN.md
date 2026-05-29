# Security Policy

[中文](./SECURITY.md) | English

## Supported Versions

Security fixes are prioritized for the latest released version of DevNexus.

## Reporting a Vulnerability

Please do not open public issues for suspected vulnerabilities.

Report security issues privately through GitHub Security Advisories when available, or contact the repository maintainer directly through GitHub.

Include:

- A concise description of the issue
- Reproduction steps or proof of concept
- Impacted versions or commits, if known
- Any relevant logs with secrets redacted

Please redact hostnames, usernames, access keys, private-key paths, passwords, and tokens from reports.

## Secret Handling

DevNexus stores connection profiles for developer tools. Sensitive fields such as passwords, access keys, tokens, MongoDB URIs, SSH credentials, and private-key passphrases must be encrypted before persistence.
