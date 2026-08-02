---
change_id: testing-session-lifecycle
title: Testing session lifecycle
status: archived
created: 2026-07-29
updated: 2026-08-02
archived_at: 2026-08-02T11:34:52Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Dowód czerwieni fazy 3 (2026-07-29)

Oba testy ścieżki A padły na kodzie **przed** fixem — dowód, że łapią regresję,
a nie tylko opisują obecne zachowanie:

- `kliknięcie w trakcie łączenia nie dopuszcza do powstania sesji` →
  `expected 1 to be +0` na `countRealtimeCalls('connect')` (defekt D1: sesja
  powstawała po pokazaniu ekranu raportu).
- `odrzucone connect() po kliknięciu nie nadpisuje raportu kartą błędu` →
  `expected document not to contain element, found <h1>Połączenie przerwane</h1>`
  (defekt D2: surowy `setState('error')` w `catch` nadpisywał ekran `ended`).

Po fixie: 11/11 zielonych, w tym niezmienione testy B i C z fazy 2.
