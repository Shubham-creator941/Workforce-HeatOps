"""Typed immutable rule evidence."""

from dataclasses import dataclass


@dataclass(frozen=True)
class RuleSource:
    rule_id: str
    source_title: str
    source_organization: str
    source_year: int
    publication_id: str | None = None
