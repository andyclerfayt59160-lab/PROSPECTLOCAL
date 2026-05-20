#!/usr/bin/env python3
r"""
Runtime smoke test for the published ProspectLocal desktop backend.

This script authenticates against the local app, then exercises the
high-value read-only endpoints that must stay healthy for day-to-day use.

Usage examples:
  set PL_EMAIL=you@example.com
  set PL_PASSWORD=secret
  .venv\Scripts\python.exe tests\runtime_smoke.py

  .venv\Scripts\python.exe tests\runtime_smoke.py --email you@example.com --password secret
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Any, Callable

import requests


DEFAULT_BASE_URL = os.environ.get("PL_BASE_URL", "http://127.0.0.1:8011")


class SmokeFailure(RuntimeError):
    """Raised when a smoke assertion fails."""


class SmokeRunner:
    def __init__(self, base_url: str, email: str, password: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.email = email
        self.password = password
        self.session = requests.Session()
        self.token: str | None = None
        self.scan_id: str | None = None
        self.business_id: str | None = None
        self.scan_ids: list[str] = []
        self.failures: list[str] = []
        self.passes: list[str] = []

    def log(self, label: str, ok: bool, detail: str) -> None:
        marker = "PASS" if ok else "FAIL"
        print(f"[{marker}] {label}: {detail}")
        if ok:
            self.passes.append(label)
        else:
            self.failures.append(f"{label}: {detail}")

    def expect(self, condition: bool, message: str) -> None:
        if not condition:
            raise SmokeFailure(message)

    def request(
        self,
        method: str,
        path: str,
        *,
        expected_status: int = 200,
        **kwargs: Any,
    ) -> requests.Response:
        response = self.session.request(method, f"{self.base_url}{path}", timeout=30, **kwargs)
        if response.status_code != expected_status:
            body_preview = response.text[:500].replace("\n", " ")
            raise SmokeFailure(
                f"{method} {path} -> HTTP {response.status_code} (expected {expected_status}) | {body_preview}"
            )
        return response

    def run_step(self, label: str, func: Callable[[], None]) -> None:
        try:
            func()
            self.log(label, True, "ok")
        except Exception as exc:  # noqa: BLE001
            self.log(label, False, str(exc))

    def login(self) -> None:
        response = self.request(
            "POST",
            "/api/auth/login",
            json={"email": self.email, "password": self.password},
        )
        payload = response.json()
        token = payload.get("access_token")
        self.expect(bool(token), "Missing access_token in login response")
        self.token = token
        self.session.headers.update({"Authorization": f"Bearer {token}"})

    def auth_me(self) -> None:
        payload = self.request("GET", "/api/auth/me").json()
        self.expect(payload.get("email") == self.email, "Authenticated email does not match")

    def pappers_estimate(self) -> None:
        payload = self.request(
            "POST",
            "/api/pappers-scan/estimate",
            json={
                "domains": ["HABITAT", "BEAUTE"],
                "cities": [{"name": "Lille", "code": "59350", "postal_codes": ["59000"]}],
                "search_mode": "radius",
                "radius_km": 20,
                "max_age_days": 30,
            },
        ).json()
        self.expect(payload.get("estimated_requests", 0) >= 0, "Missing estimated_requests")
        self.expect("pappers_budget" in payload, "Missing pappers_budget in estimate")

    def credits_check(self) -> None:
        payload = self.request(
            "GET",
            "/api/api-usage/check-before-scan",
            params={"scan_type": "pappers", "estimated_pappers_credits": 120},
        ).json()
        self.expect("can_proceed" in payload, "Missing can_proceed")
        self.expect(isinstance(payload.get("budget_status"), list), "budget_status must be a list")

    def scans_list(self) -> None:
        payload = self.request("GET", "/api/scans").json()
        self.expect(isinstance(payload, list), "Scans response is not a list")
        self.scan_ids = [scan.get("id") for scan in payload if scan.get("id")]
        if self.scan_ids:
            self.scan_id = self.scan_ids[0]

    def scan_businesses(self) -> None:
        if not self.scan_ids:
            raise SmokeFailure("No scan available to inspect businesses")

        last_payload: dict[str, Any] | None = None
        for scan_id in self.scan_ids:
            payload = self.request("GET", f"/api/scans/{scan_id}/businesses").json()
            self.expect(isinstance(payload, dict), "Scan businesses response is not an object")
            last_payload = payload
            buckets = [
                payload.get("verified_businesses") or payload.get("businesses") or [],
                payload.get("unverified_businesses") or [],
                payload.get("visite_terrain_businesses") or [],
            ]
            for bucket in buckets:
                if bucket:
                    self.scan_id = scan_id
                    self.business_id = bucket[0].get("id")
                    return

        if last_payload is None:
            raise SmokeFailure("Unable to fetch any scan businesses payload")
        raise SmokeFailure("No business available in the scanned history to exercise detail routes")

    def business_detail(self) -> None:
        if not self.business_id:
            raise SmokeFailure("No business available for detail routes")
        payload = self.request("GET", f"/api/businesses/{self.business_id}").json()
        self.expect(payload.get("id") == self.business_id, "Business detail returned wrong business")

    def business_related_clues(self) -> None:
        if not self.business_id:
            raise SmokeFailure("No business available for related clues")
        payload = self.request("GET", f"/api/businesses/{self.business_id}/related-clues").json()
        self.expect(isinstance(payload, dict), "Related clues response is not an object")

    def crm_pipeline(self) -> None:
        payload = self.request("GET", "/api/crm/pipeline").json()
        self.expect(isinstance(payload, dict), "CRM pipeline response is not an object")
        self.expect("pipeline" in payload or "businesses" in payload, "CRM pipeline missing pipeline/businesses")
        self.expect("total" in payload or "stats" in payload, "CRM pipeline missing total/stats")

    def crm_action_brief(self) -> None:
        payload = self.request("GET", "/api/crm/action-brief").json()
        self.expect("now" in payload, "CRM action brief missing now")
        self.expect("tomorrow" in payload, "CRM action brief missing tomorrow")
        now_items = payload.get("now", {}).get("items", [])
        ids = [item.get("business_id") for item in now_items if item.get("business_id")]
        self.expect(len(ids) == len(set(ids)), "CRM action brief duplicates business_id values")

    def crm_callbacks_due(self) -> None:
        payload = self.request("GET", "/api/crm/callbacks-due").json()
        if isinstance(payload, list):
            return
        self.expect(isinstance(payload, dict), "Callbacks due response is not an object")
        self.expect(isinstance(payload.get("callbacks"), list), "Callbacks due object missing callbacks list")

    def visites(self) -> None:
        payload = self.request("GET", "/api/businesses/visites").json()
        if isinstance(payload, list):
            return
        self.expect(isinstance(payload, dict), "Visites response is not an object")
        self.expect(isinstance(payload.get("businesses"), list), "Visites object missing businesses list")

    def duplicates_stats(self) -> None:
        payload = self.request("GET", "/api/duplicates/stats").json()
        self.expect("total_businesses" in payload, "Duplicate stats missing total_businesses")

    def duplicates_conflicts(self) -> None:
        payload = self.request("GET", "/api/duplicates/conflicts").json()
        if isinstance(payload, list):
            return
        self.expect(isinstance(payload, dict), "Duplicate conflicts response is not an object")
        has_groups = isinstance(payload.get("groups"), list)
        has_conflicts = isinstance(payload.get("conflicts"), list)
        has_phone_conflicts = isinstance(payload.get("phone_conflicts"), list)
        has_review_required = isinstance(payload.get("review_required"), list)
        self.expect(
            has_groups or has_conflicts or has_phone_conflicts or has_review_required,
            "Duplicate conflicts object missing expected conflict collections",
        )

    def notifications(self) -> None:
        payload = self.request("GET", "/api/notifications").json()
        if isinstance(payload, list):
            return
        self.expect(isinstance(payload, dict), "Notifications response is not an object")
        self.expect(isinstance(payload.get("notifications"), list), "Notifications object missing notifications list")

    def notification_preferences(self) -> None:
        payload = self.request("GET", "/api/user/notification-preferences").json()
        self.expect(
            "email_runtime" in payload or "email_delivery_mode" in payload,
            "Notification preferences missing email runtime/delivery mode",
        )

    def run(self) -> int:
        steps: list[tuple[str, Callable[[], None]]] = [
            ("login", self.login),
            ("auth_me", self.auth_me),
            ("pappers_estimate", self.pappers_estimate),
            ("credits_check", self.credits_check),
            ("scans_list", self.scans_list),
            ("scan_businesses", self.scan_businesses),
            ("business_detail", self.business_detail),
            ("business_related_clues", self.business_related_clues),
            ("crm_pipeline", self.crm_pipeline),
            ("crm_action_brief", self.crm_action_brief),
            ("crm_callbacks_due", self.crm_callbacks_due),
            ("visites", self.visites),
            ("duplicates_stats", self.duplicates_stats),
            ("duplicates_conflicts", self.duplicates_conflicts),
            ("notifications", self.notifications),
            ("notification_preferences", self.notification_preferences),
        ]
        for label, func in steps:
            self.run_step(label, func)

        print("")
        print(f"Smoke summary: {len(self.passes)} passed, {len(self.failures)} failed")
        if self.failures:
            for failure in self.failures:
                print(f" - {failure}")
            return 1
        return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run ProspectLocal runtime smoke checks.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Backend base URL")
    parser.add_argument("--email", default=os.environ.get("PL_EMAIL"), help="Login email")
    parser.add_argument("--password", default=os.environ.get("PL_PASSWORD"), help="Login password")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.email or not args.password:
        print("Missing credentials. Provide --email/--password or set PL_EMAIL and PL_PASSWORD.", file=sys.stderr)
        return 2

    runner = SmokeRunner(
        base_url=args.base_url,
        email=args.email,
        password=args.password,
    )
    return runner.run()


if __name__ == "__main__":
    raise SystemExit(main())
