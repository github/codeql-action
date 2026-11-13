# Security Policy

Security is important to this project. We appreciate security researchers,
developers, contributors, and users who responsibly report potential
security vulnerabilities.

## Supported Versions

Security updates are generally provided for the latest maintained version
of this project.

| Version | Supported |
| ------- | --------- |
| Latest release / main branch | ✅ |
| Older versions | ❌ |

Users are encouraged to use the latest available version.

## Reporting a Vulnerability

Please do **not** report security vulnerabilities through public GitHub
issues, discussions, pull requests, or other public channels.

If you believe you have discovered a security vulnerability, please report
it privately.

### Preferred Reporting Method

Use GitHub Private Vulnerability Reporting for this repository when it is
available.

This allows the repository maintainers to review and investigate the report
privately before vulnerability information becomes public.

## Security Contact

For security-related questions or vulnerability reports, use one of the
following methods:

- **Preferred:** GitHub Private Vulnerability Reporting via https://github.com/github/codeql-action/security/advisories/new
- **GitHub Bug Bounty:** https://bounty.github.com
- **Security Team:** https://github.com/security

Do not include sensitive vulnerability information in public GitHub issues,
discussions, or pull requests.

## What to Include in a Report

Please provide as much of the following information as possible:

- A clear description of the vulnerability
- The affected component, workflow, dependency, file, or feature
- The affected version or commit, if known
- Steps required to reproduce the issue
- The potential security impact
- Relevant logs or screenshots with sensitive information removed
- Proof-of-concept information, when appropriate
- Any suggested mitigation or fix
- Your preferred contact information for follow-up

Detailed reports help maintainers investigate security issues more
efficiently.

## Security Scope

Security reports may include vulnerabilities involving:

- Source code
- GitHub Actions workflows
- Dependencies
- Authentication
- Authorization
- Access control
- Secrets or credentials exposure
- Code injection
- Configuration vulnerabilities
- Supply-chain security
- Dependency vulnerabilities
- Unexpected exposure of sensitive information
- Insecure handling of user or application data

General bugs that do not have a security impact should be reported through
the normal GitHub issue tracker.

## Secrets and Credentials

Never include real passwords, API keys, access tokens, private keys,
certificates, authentication cookies, or other active credentials in a
vulnerability report.

If you believe a credential belonging to this project has been exposed,
report the issue privately as soon as possible.

Affected credentials may be rotated or revoked as part of the security
response.

## Responsible Disclosure

Please give the project maintainers a reasonable opportunity to investigate
and address a reported vulnerability before publicly disclosing it.

Please avoid:

- Publishing vulnerability details before a fix or mitigation is available
- Creating public issues containing sensitive security information
- Accessing or modifying data that does not belong to you
- Attempting to obtain unnecessary sensitive information
- Disrupting services or systems
- Performing destructive security testing
- Using a vulnerability beyond what is necessary to demonstrate the issue

## Security Response Process

After receiving a security report, maintainers will aim to:

1. Acknowledge and review the report.
2. Determine the preliminary severity.
3. Attempt to reproduce and validate the vulnerability.
4. Evaluate the affected components and potential impact.
5. Identify an appropriate mitigation or fix.
6. Develop and test the security fix when necessary.
7. Release the fix through an appropriate project update.
8. Coordinate responsible disclosure when appropriate.
9. Publish a GitHub Security Advisory when appropriate.

Priority and response targets are determined according to the
Severity-Based Response Policy below.

## Severity-Based Response Policy

Reported vulnerabilities are reviewed and prioritized according to their
potential impact, exploitability, affected users, exposure of sensitive
information, and overall risk.

The following response targets are guidelines rather than guaranteed
service-level agreements (SLAs).

| Severity | Examples | Initial Response Target | Remediation Target |
| -------- | -------- | ----------------------- | ------------------ |
| 🔴 Critical | Remote code execution, authentication bypass, exposed secrets with significant impact, major supply-chain compromise | Within 24 hours | As soon as reasonably possible |
| 🟠 High | Privilege escalation, significant authorization bypass, serious data exposure, exploitable workflow or dependency vulnerabilities | Within 2 business days | Typically within 7 days |
| 🟡 Medium | Limited information disclosure, vulnerabilities requiring significant user interaction or specific conditions | Within 5 business days | Typically within 30 days |
| 🟢 Low | Minor security weaknesses, hardening opportunities, or issues with limited practical impact | Within 10 business days | Addressed as resources and release schedules allow |

### Critical Vulnerabilities

Critical vulnerabilities receive the highest priority.

When a critical vulnerability is confirmed, maintainers may:

1. Restrict public discussion of the issue.
2. Investigate the affected code, dependency, workflow, or configuration.
3. Develop and test an appropriate mitigation or fix.
4. Rotate or revoke affected secrets or credentials when necessary.
5. Release an emergency security update when appropriate.
6. Coordinate responsible disclosure after remediation.

### Severity Assessment

Severity may be adjusted during investigation as additional information
becomes available.

Factors considered may include:

- Attack complexity
- Required privileges
- User interaction
- Confidentiality impact
- Integrity impact
- Availability impact
- Scope of affected users or systems
- Exposure of secrets or credentials
- Supply-chain impact
- Availability of mitigations
- Likelihood of exploitation

Where appropriate, industry-standard vulnerability scoring approaches,
such as CVSS, may be used to help assess severity.

### Response Times

Response and remediation targets are goals, not guarantees.

Some vulnerabilities may require additional investigation, dependency
updates, coordination with third-party maintainers, or significant
architectural changes.

Security reporters should receive updates when there is meaningful progress
on a confirmed vulnerability.

## Dependency and Supply-Chain Security

This project may depend on third-party libraries, packages, GitHub Actions,
development tools, or other software.

Security issues originating in third-party dependencies may also need to be
reported to the relevant project's maintainers.

Where practical, the project aims to:

- Keep dependencies up to date
- Review security-related dependency updates
- Address known vulnerabilities
- Reduce unnecessary dependencies
- Review automated dependency security alerts
- Maintain secure GitHub Actions workflows
- Avoid exposing credentials or secrets in workflows

## Security Updates

Security-related fixes may be delivered through:

- Repository commits
- Pull requests
- Dependency updates
- GitHub Actions workflow changes
- Configuration changes
- Patches
- New project releases

Users should keep their local copies, dependencies, and integrations up to
date.

## Public Security Advisories

When appropriate, confirmed vulnerabilities may be documented using GitHub
Security Advisories following remediation or coordinated disclosure.

An advisory may contain information about:

- The affected versions
- The vulnerability severity
- The security impact
- Available mitigations
- Fixed versions
- Upgrade recommendations

## Good-Faith Security Research

We appreciate responsible, good-faith security research intended to improve
the security of this project.

Researchers should make reasonable efforts to:

- Protect user and project data
- Respect privacy
- Avoid unnecessary access to sensitive information
- Avoid disruption or degradation of services
- Avoid destructive testing
- Report discovered vulnerabilities privately
- Allow reasonable time for investigation and remediation

Security testing should be limited to what is reasonably necessary to
identify and demonstrate a vulnerability.

## Out of Scope

The following generally do not require a private security report unless
they create a genuine security risk:

- Feature requests
- General software bugs
- Documentation errors
- Unsupported versions
- Cosmetic issues
- Issues without a demonstrable security impact
- Vulnerabilities that only affect intentionally unsafe configurations

These issues may normally be submitted through the project's standard
GitHub issue tracker.

## Privacy

Please minimize the collection, storage, or sharing of personal or sensitive
information while conducting security research.

If sensitive information is encountered unintentionally:

1. Stop accessing the information.
2. Do not copy, distribute, publish, or retain it unnecessarily.
3. Report the issue privately.
4. Include only the minimum information necessary to explain the security
   issue.

## Coordinated Disclosure

If a vulnerability affects another project, package, dependency, or service,
the maintainers may coordinate disclosure with the relevant third party.

Please avoid publicly disclosing the vulnerability until affected parties
have had a reasonable opportunity to investigate and address the issue.

## Security Acknowledgements

We appreciate researchers and contributors who help improve the security of
this project through responsible disclosure.

Where appropriate and agreed upon, contributors who responsibly report
confirmed vulnerabilities may be acknowledged in release notes, security
advisories, or project documentation.

## Policy Changes

This security policy may be updated as the project evolves.

Please review the latest version of this file before submitting a security
report.

## Thank You

Thank you for helping keep this project and its users secure.

Responsible vulnerability reports help improve the security, reliability,
and trustworthiness of the project.
