# Theimposterissus

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Friends playing a private 4–10-player social deduction game in desktop and phone browsers. Hosts create a room and invite friends; guests enter through a link or five-letter code.

## Product Purpose

Help friends assemble a crew and play together on the original Hollow station. The current entry redesign prioritizes getting into a room intuitively.

## Capabilities and Constraints

Authoritative Colyseus server, Vite/TypeScript client, PixiJS gameplay and shared private/public protocol. No account is required. Names and named/numbered engineer colours identify players. Roles and tasks stay private until permitted by the game phase. Hosts control room settings and starting; four players are required, or seven with two impostors.

The user approved distinct Create/Join paths, optional colour selection with lobby customization, direct joining from invite links, and simplifying the waiting lobby. Preserve gameplay, reconnection and host authority.

## Brand Commitments

Theimposterissus and The Hollow; original engineer, station and task art. Preserve the established station palette when extending interfaces, as recorded in CLAUDE.md.

## Evidence on Hand

Working local game, automated tests, original assets and implementation records in completed.md. Human playtests, physical-device acceptance and public-hosting checks remain incomplete; do not invent results.

## Product Principles

- Make the next action clear to hosts and guests.
- Ask only what is necessary to enter; keep customization available.
- Protect private game information and reconnect credentials.
- Support touch and keyboard without relying on colour alone.
