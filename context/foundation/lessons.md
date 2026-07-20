# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Nigdy nie commituj bezpośrednio na master — zawsze branch + PR

- **Context**: Każdy commit w tym repo — w szczególności rytuały commitów /10x-implement i /10x-archive.
- **Problem**: Commit wylądowany bezpośrednio na lokalnym masterze nie da się wypchnąć — ruleset protect-master odrzuca push (GH013) — i trzeba go ręcznie przenosić na branch; do tego zmiana omija preview z PR.
- **Rule**: Nigdy nie commituj bezpośrednio na master — każda zmiana powstaje na osobnym branchu i wchodzi przez PR (każdy PR dostaje preview z Vercela); push na master blokuje ruleset protect-master.
- **Applies to**: all

## Komunikacja z użytkownikiem po polsku

- **Context**: Interakcja na żywo z użytkownikiem — odpowiedzi agenta, rundy pytań (AskUserQuestion), raporty i podsumowania prezentowane w rozmowie, we wszystkich skillach. Dokumenty i artefakty w repo mogą pozostać po angielsku.
- **Problem**: Rundy pytań i raporty przychodzą po angielsku — użytkownik musi prosić o tłumaczenie (jak przy triage znalezisk F2/F3 w plan-review zmiany `minimal-oauth-login`, 2026-07-20), co spowalnia decyzje i wybija z rytmu.
- **Rule**: Zawsze komunikuj się z użytkownikiem po polsku — odpowiedzi, pytania i raporty. Kod, nazwy plików i identyfikatory pozostają po angielsku.
- **Applies to**: all
