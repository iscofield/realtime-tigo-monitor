"""Test doubles imported by both conftest and individual tests."""
from __future__ import annotations


class FakeBouncer:
    """In-process replacement for HttpBouncer.

    `mode` is one of "ok" / "error" / a callable returning None or raising.
    """
    def __init__(self, mode="ok") -> None:
        self.mode = mode
        self.calls: list[str] = []

    def restart(self, name: str) -> None:
        self.calls.append(name)
        if callable(self.mode):
            self.mode(name)
            return
        if self.mode == "ok":
            return
        if self.mode == "error":
            raise RuntimeError("docker proxy unavailable")
        raise AssertionError(f"unknown mode {self.mode!r}")
