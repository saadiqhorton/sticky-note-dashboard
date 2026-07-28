# Stickyboard

Shared sticky-note memory for an internal team: one company board everyone can edit, plus a private board per person.

## Language

**Team**:
People with accounts on this Stickyboard deployment.
_Avoid_: Organization, tenant, workspace (for v1 self-host)

**Admin**:
A teammate who can create invites, deactivate users, and permanently purge Trash.
_Avoid_: Superuser, owner (unless meaning board ownership)

**Member**:
A teammate with full edit access on the company board who is not an Admin.
_Avoid_: Viewer, guest

**Company Board**:
The single shared canvas of sticky notes visible and editable by the whole Team. Shown in the UI as **Team**.
_Avoid_: Shared board, main board, dashboard (when meaning the board itself)

**Private Board**:
One personal canvas owned by a single teammate; only that owner can see or edit it.
_Avoid_: Personal space, scratchpad (informal ok in UI copy)

**Sticky Note**:
A titled card on a board with body content, checklist items, attachments, color, and canvas position.
_Avoid_: Card, post-it, ticket, section

**Trash**:
Soft-deleted Sticky Notes that can be restored before permanent purge.
_Avoid_: Archive, recycle bin

**Invite**:
A copyable token link an Admin creates so a teammate can set a password and join.
_Avoid_: Magic link, invitation email (no SMTP in v1)

## Relationships

- A **Team** has many **Members** and one or more **Admins**
- A deployment has exactly one **Company Board**
- Each **Member** (and **Admin**) has exactly one **Private Board**
- A **Sticky Note** belongs to exactly one board (**Company Board** or **Private Board**)
- A **Sticky Note** may have many attachments and checklist items (in body content)
- An **Invite** is created by an **Admin** and consumed once to create a **Member**

## Example dialogue

> **Dev:** "If someone deletes a sticky on the Company Board, does it leave the Private Board alone?"
> **Domain expert:** "Yes — Sticky Notes never move between Company Board and Private Board. Delete only affects the board it lives on, and it goes to Trash first."

## Flagged ambiguities

- "Dashboard" in product talk means the whole app experience; the editable surface is the **Company Board** or **Private Board**.
- "Section" was rejected — Sticky Notes themselves are the units of organization.
- "Account" means a **User** login on this Team deployment, not a customer billing account.
