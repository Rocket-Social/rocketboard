# Security Policy

## Reporting a Vulnerability

Please do not open public GitHub issues for suspected security vulnerabilities.

Use one of these private paths instead:

1. GitHub's private vulnerability reporting flow for this repository, if it is enabled.
2. A private maintainer contact path through the repository owner or organization, if private reporting is not available.

Include:

- affected version or commit
- deployment mode (`self-hosted` or hosted-service mirror validation)
- reproduction steps or proof of concept
- impact assessment
- any suggested mitigation

## Disclosure Expectations

- We will acknowledge good-faith reports as quickly as practical.
- Please give the maintainer a reasonable opportunity to investigate and ship a fix before public disclosure.
- If a fix requires a coordinated disclosure window, we will document the affected versions and remediation guidance in the release notes.

## Scope

This repository includes the Fair Source mirror of Rocketboard. Hosted-service-only infrastructure is intentionally excluded from the public release surface, but vulnerabilities in excluded components may still affect the managed service and should also be reported privately.
