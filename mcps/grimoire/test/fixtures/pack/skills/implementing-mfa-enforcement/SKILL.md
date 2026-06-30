---
name: implementing-mfa-enforcement
description: Enforce multi-factor authentication across an identity provider — configure
  conditional access policies, require phishing-resistant factors, and stage rollout
  with break-glass accounts so admins are never locked out.
domain: cybersecurity
subdomain: identity-access-management
tags:
- iam
- mfa
- authentication
---

# Implementing MFA Enforcement

Define a conditional-access policy that requires MFA for all interactive sign-ins,
prefer FIDO2/WebAuthn over OTP, exclude two monitored break-glass accounts, and roll
out in report-only mode before enforcing.
