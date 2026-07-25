from __future__ import annotations

import hashlib
import html
import json
import logging
import os
import re
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

import requests
from exa_py import Exa
from google import genai
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


LOGGER = logging.getLogger("opportunity_hunter")

CATEGORY_VALUES = [
    "Leadership",
    "Fellowships",
    "Public Policy & SDGs",
    "Essays & Writing",
    "Marketing & Business Cases",
    "Public Speaking & Pitching",
    "Entrepreneurship & Social Impact",
    "Innovation Challenges",
    "Youth Summits & Conferences",
    "Debate & MUN",
    "Awards & Grants",
    "Other",
]

ANALYSIS_ITEM_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "candidate_id": {"type": "string"},
        "is_relevant": {"type": "boolean"},
        "title": {"type": "string"},
        "organizer": {"type": "string"},
        "category": {"type": "string", "enum": CATEGORY_VALUES},
        "subcategory": {"type": "string"},
        "summary": {"type": "string"},
        "why_relevant": {"type": "string"},
        "opportunity_type": {"type": "string"},
        "format": {
            "type": "string",
            "enum": ["Online", "Offline", "Hybrid", "Unknown"],
        },
        "location": {"type": "string"},
        "host_country": {"type": "string"},
        "language": {"type": "string"},
        "official_source_status": {
            "type": "string",
            "enum": ["Official", "Credible Secondary", "Unverified"],
        },
        "official_url": {"type": "string"},
        "application_url": {"type": "string"},
        "opening_date": {"type": "string"},
        "start_date": {"type": "string"},
        "end_date": {"type": "string"},
        "deadline_raw": {"type": "string"},
        "deadline_date": {"type": "string"},
        "deadline_timezone": {"type": "string"},
        "eligibility_status": {
            "type": "string",
            "enum": [
                "Eligible",
                "Probably Eligible",
                "Unclear",
                "Probably Ineligible",
                "Ineligible",
            ],
        },
        "undergraduate_eligible": {
            "type": "string",
            "enum": ["Yes", "Probably", "Unclear", "No"],
        },
        "indonesian_eligible": {
            "type": "string",
            "enum": ["Yes", "Probably", "Unclear", "No"],
        },
        "age_requirement": {"type": "string"},
        "education_requirement": {"type": "string"},
        "experience_requirement": {"type": "string"},
        "nationality_requirement": {"type": "string"},
        "team_format": {"type": "string"},
        "team_size": {"type": "string"},
        "application_requirements": {"type": "string"},
        "application_fee_raw": {"type": "string"},
        "application_fee_idr": {"type": "integer"},
        "registration_fee_raw": {"type": "string"},
        "registration_fee_idr": {"type": "integer"},
        "estimated_personal_cost_idr": {"type": "integer"},
        "funding_status": {
            "type": "string",
            "enum": [
                "Fully Funded",
                "Partially Funded",
                "Free Participation",
                "No Application Fee",
                "Self Funded",
                "Unclear",
            ],
        },
        "funding_coverage": {"type": "string"},
        "prize_benefits": {"type": "string"},
        "travel_covered": {
            "type": "string",
            "enum": ["Yes", "No", "Partial", "Unclear", "Not Applicable"],
        },
        "accommodation_covered": {
            "type": "string",
            "enum": ["Yes", "No", "Partial", "Unclear", "Not Applicable"],
        },
        "meals_covered": {
            "type": "string",
            "enum": ["Yes", "No", "Partial", "Unclear", "Not Applicable"],
        },
        "visa_covered": {
            "type": "string",
            "enum": ["Yes", "No", "Partial", "Unclear", "Not Applicable"],
        },
        "eligibility_evidence": {"type": "string"},
        "funding_evidence": {"type": "string"},
        "deadline_evidence": {"type": "string"},
        "confidence": {"type": "integer"},
        "warning_flags": {
            "type": "array",
            "items": {"type": "string"},
        },
        "rejection_reason": {"type": "string"},
        "rejection_evidence": {"type": "string"},
    },
    "required": [
        "candidate_id",
        "is_relevant",
        "title",
        "organizer",
        "category",
        "subcategory",
        "summary",
        "why_relevant",
        "opportunity_type",
        "format",
        "location",
        "host_country",
        "language",
        "official_source_status",
        "official_url",
        "application_url",
        "opening_date",
        "start_date",
        "end_date",
        "deadline_raw",
        "deadline_date",
        "deadline_timezone",
        "eligibility_status",
        "undergraduate_eligible",
        "indonesian_eligible",
        "age_requirement",
        "education_requirement",
        "experience_requirement",
        "nationality_requirement",
        "team_format",
        "team_size",
        "application_requirements",
        "application_fee_raw",
        "application_fee_idr",
        "registration_fee_raw",
        "registration_fee_idr",
        "estimated_personal_cost_idr",
        "funding_status",
        "funding_coverage",
        "prize_benefits",
        "travel_covered",
        "accommodation_covered",
        "meals_covered",
        "visa_covered",
        "eligibility_evidence",
        "funding_evidence",
        "deadline_evidence",
        "confidence",
        "warning_flags",
        "rejection_reason",
        "rejection_evidence",
    ],
}

BATCH_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "analyses": {
            "type": "array",
            "items": ANALYSIS_ITEM_SCHEMA,
        }
    },
    "required": ["analyses"],
}

CATEGORY_WEIGHTS = {
    "Leadership": 20,
    "Fellowships": 20,
    "Public Policy & SDGs": 18,
    "Essays & Writing": 16,
    "Marketing & Business Cases": 15,
    "Public Speaking & Pitching": 14,
    "Entrepreneurship & Social Impact": 12,
    "Youth Summits & Conferences": 12,
    "Innovation Challenges": 10,
    "Awards & Grants": 10,
    "Debate & MUN": 4,
    "Other": 5,
}


@dataclass(frozen=True)
class Config:
    exa_api_key: str
    gemini_api_key: str
    telegram_bot_token: str
    telegram_chat_id: str
    webhook_url: str
    webhook_secret: str
    run_mode: str
    timezone_name: str
    gemini_model: str
    max_searches: int
    results_per_search: int
    max_content_pages: int
    max_text_chars: int
    gemini_batch_size: int
    max_gemini_calls: int
    telegram_score_threshold: int
    max_telegram_alerts: int
    application_fee_limit_idr: int
    personal_cost_guideline_idr: int
    send_run_summary: bool

    @classmethod
    def load(cls) -> "Config":
        mode = os.getenv("RUN_MODE", "full").strip().lower()
        if mode not in {"connections", "test", "dry-run", "bootstrap", "full"}:
            raise ValueError(
                "RUN_MODE must be connections, test, dry-run, bootstrap, or full."
            )

        defaults = {
            "connections": (1, 1, 1, 1, 1),
            "test": (2, 5, 8, 2, 8),
            "dry-run": (2, 5, 8, 2, 8),
            "bootstrap": (32, 10, 200, 4, 50),
            "full": (16, 8, 60, 3, 30),
        }
        searches, results, pages, batch_size, gemini_calls = defaults[mode]

        config = cls(
            exa_api_key=require_env("EXA_API_KEY"),
            gemini_api_key=require_env("GEMINI_API_KEY"),
            telegram_bot_token=require_env("TELEGRAM_BOT_TOKEN"),
            telegram_chat_id=require_env("TELEGRAM_CHAT_ID"),
            webhook_url=require_env("APPS_SCRIPT_WEBHOOK_URL"),
            webhook_secret=require_env("APPS_SCRIPT_WEBHOOK_SECRET"),
            run_mode=mode,
            timezone_name=os.getenv("USER_TIMEZONE", "Asia/Jakarta"),
            gemini_model=os.getenv(
                "GEMINI_MODEL", "gemini-3.5-flash-lite"
            ),
            max_searches=env_int(
                "MAX_SEARCHES_PER_RUN", searches, minimum=1, maximum=40
            ),
            results_per_search=env_int(
                "RESULTS_PER_SEARCH", results, minimum=1, maximum=10
            ),
            max_content_pages=env_int(
                "MAX_CONTENT_PAGES_PER_RUN", pages, minimum=1, maximum=250
            ),
            max_text_chars=env_int(
                "MAX_TEXT_CHARS_PER_PAGE", 12000, minimum=2000, maximum=30000
            ),
            gemini_batch_size=env_int(
                "GEMINI_BATCH_SIZE", batch_size, minimum=1, maximum=4
            ),
            max_gemini_calls=env_int(
                "MAX_GEMINI_CALLS_PER_RUN",
                gemini_calls,
                minimum=1,
                maximum=50,
            ),
            telegram_score_threshold=env_int(
                "TELEGRAM_SCORE_THRESHOLD", 75, minimum=0, maximum=100
            ),
            max_telegram_alerts=env_int(
                "MAX_TELEGRAM_ALERTS_PER_RUN", 12, minimum=0, maximum=25
            ),
            application_fee_limit_idr=env_int(
                "APPLICATION_FEE_LIMIT_IDR",
                300000,
                minimum=0,
                maximum=10000000,
            ),
            personal_cost_guideline_idr=env_int(
                "PERSONAL_COST_GUIDELINE_IDR",
                1000000,
                minimum=0,
                maximum=100000000,
            ),
            send_run_summary=env_bool("SEND_RUN_SUMMARY", True),
        )

        # Validate the timezone now rather than halfway through a run.
        ZoneInfo(config.timezone_name)
        return config


@dataclass
class Candidate:
    candidate_id: str
    title: str
    url: str
    published_date: str
    query: str
    source_domain: str
    text: str = ""


class OpportunityHunter:
    def __init__(self, config: Config) -> None:
        self.config = config
        self.session = build_http_session()
        self.exa = Exa(api_key=config.exa_api_key)
        self.gemini = genai.Client(api_key=config.gemini_api_key)
        self.timezone = ZoneInfo(config.timezone_name)
        self.run_id = (
            datetime.now(self.timezone).strftime("%Y%m%d-%H%M%S")
            + "-"
            + uuid.uuid4().hex[:8]
        )
        self.stats: dict[str, Any] = {
            "run_id": self.run_id,
            "started_at": now_string(self.timezone),
            "finished_at": "",
            "status": "RUNNING",
            "searches_attempted": 0,
            "searches_succeeded": 0,
            "candidates_found": 0,
            "candidates_deduplicated": 0,
            "pages_fetched": 0,
            "gemini_calls": 0,
            "opportunities_inserted": 0,
            "opportunities_updated": 0,
            "rejected_logged": 0,
            "telegram_alerts_sent": 0,
            "errors": [],
            "estimated_exa_cost_usd": 0.0,
            "notes": f"mode={config.run_mode}; model={config.gemini_model}",
        }

    def run(self) -> int:
        if self.config.run_mode == "connections":
            self.run_connection_test()
            return 0

        LOGGER.info("Starting run %s in %s mode.", self.run_id, self.config.run_mode)
        self.verify_webhook()

        queries = build_search_queries()[: self.config.max_searches]
        candidates = self.discover(queries)
        candidates = deduplicate_candidates(candidates)

        self.stats["candidates_found"] = len(candidates)
        LOGGER.info("%d unique candidates found before database check.", len(candidates))

        existing = self.check_existing(candidates)
        fresh_candidates = [
            candidate
            for candidate in candidates
            if not existing.get(candidate.candidate_id, False)
        ]
        self.stats["candidates_deduplicated"] = len(candidates) - len(
            fresh_candidates
        )

        fresh_candidates = fresh_candidates[: self.config.max_content_pages]
        LOGGER.info("%d new candidates will be fetched.", len(fresh_candidates))

        if not fresh_candidates:
            self.finish_success([])
            return 0

        self.fetch_contents(fresh_candidates)
        analyses = self.analyze_candidates(fresh_candidates)
        records = [
            self.score_and_build_record(analysis, candidate)
            for analysis, candidate in analyses
        ]

        if self.config.run_mode == "dry-run":
            LOGGER.info("Dry run complete. No Sheets writes or Telegram alerts.")
            for record in records[:3]:
                LOGGER.info(
                    "DRY RUN: %s | %s | score=%s | %s",
                    record.get("title"),
                    record.get("category"),
                    record.get("match_score"),
                    record.get("alert_level"),
                )
            self.finish_success(records, write_log=False, send_summary=False)
            return 0

        self.write_records(records)
        self.send_priority_alerts(records)
        self.finish_success(records)
        return 0

    def run_connection_test(self) -> None:
        LOGGER.info("Running connection tests.")

        self.verify_webhook()
        LOGGER.info("Google Sheets webhook: OK")

        telegram = self.telegram_request("getMe", {})
        username = (
            telegram.get("result", {}).get("username")
            if isinstance(telegram, dict)
            else None
        )
        LOGGER.info("Telegram bot: OK (@%s)", username or "unknown")

        exa_response = self.exa.search(
            "official undergraduate leadership fellowship application",
            type="auto",
            num_results=1,
        )
        if not result_list(exa_response):
            raise RuntimeError("Exa connection worked but returned no test result.")
        LOGGER.info("Exa API: OK")

        test_schema = {
            "type": "object",
            "properties": {"ok": {"type": "boolean"}},
            "required": ["ok"],
        }
        response = self.gemini.models.generate_content(
            model=self.config.gemini_model,
            contents=(
                'Return {"ok": true}. This is a connection test. '
                "Do not add any other information."
            ),
            config={
                "response_mime_type": "application/json",
                "response_json_schema": test_schema,
            },
        )
        parsed = parse_json_text(response.text or "")
        if parsed.get("ok") is not True:
            raise RuntimeError("Gemini returned an unexpected connection-test result.")
        LOGGER.info("Gemini API: OK")

        self.send_telegram(
            "✅ <b>Opportunity Hunter connection test passed</b>\n\n"
            "Exa, Gemini, Google Sheets, and Telegram are connected."
        )
        LOGGER.info("Connection-test Telegram message sent.")

    def verify_webhook(self) -> None:
        try:
            get_response = self.session.get(
                self.config.webhook_url,
                timeout=30,
            )
            get_response.raise_for_status()
            get_payload = get_response.json()
        except Exception as exc:
            raise RuntimeError(
                "The Apps Script URL is unreachable. Confirm that the secret "
                "contains the /exec URL and the deployment access is set to Anyone."
            ) from exc

        if get_payload.get("ok") is not True:
            raise RuntimeError(
                f"Apps Script GET health check failed: {get_payload}"
            )

        payload = self.webhook_post("health_check", {})
        if payload.get("ok") is not True:
            raise RuntimeError(
                "Apps Script secret validation failed. Check "
                "APPS_SCRIPT_WEBHOOK_SECRET."
            )

    def discover(self, queries: list[str]) -> list[Candidate]:
        found: list[Candidate] = []

        for query in queries:
            self.stats["searches_attempted"] += 1
            try:
                response = self.exa.search(
                    query,
                    type="auto",
                    num_results=self.config.results_per_search,
                )
                results = result_list(response)
                self.stats["searches_succeeded"] += 1
                LOGGER.info(
                    "Exa search %d/%d returned %d results.",
                    self.stats["searches_attempted"],
                    len(queries),
                    len(results),
                )
            except Exception as exc:
                self.record_error(f"Exa search failed: {query}: {exc}")
                continue

            for result in results:
                url = clean_url(read_value(result, "url"))
                if not url:
                    continue
                title = clean_text(read_value(result, "title"), 500)
                published_date = clean_text(
                    read_value(result, "published_date")
                    or read_value(result, "publishedDate"),
                    100,
                )
                candidate_id = stable_candidate_id(url, title)
                found.append(
                    Candidate(
                        candidate_id=candidate_id,
                        title=title,
                        url=url,
                        published_date=published_date,
                        query=query,
                        source_domain=domain_from_url(url),
                    )
                )

        self.stats["estimated_exa_cost_usd"] = round(
            self.stats["searches_attempted"] * 0.007, 4
        )
        return found

    def check_existing(self, candidates: list[Candidate]) -> dict[str, bool]:
        existence: dict[str, bool] = {}

        for chunk in chunks(candidates, 100):
            payload = {
                "candidates": [
                    {
                        "opportunity_id": candidate.candidate_id,
                        "url": candidate.url,
                    }
                    for candidate in chunk
                ]
            }
            response = self.webhook_post("check_duplicates", payload)
            if response.get("ok") is not True:
                raise RuntimeError(
                    f"Duplicate check failed: {response.get('message', response)}"
                )
            for item in response.get("results", []):
                existence[str(item.get("opportunity_id", ""))] = bool(
                    item.get("exists")
                )

        return existence

    def fetch_contents(self, candidates: list[Candidate]) -> None:
        by_url = {canonicalize_url(candidate.url): candidate for candidate in candidates}

        for candidate_chunk in chunks(candidates, 20):
            urls = [candidate.url for candidate in candidate_chunk]
            try:
                response = self.exa.get_contents(urls, text=True)
                results = result_list(response)
            except Exception as exc:
                self.record_error(
                    f"Exa content batch failed for {len(urls)} URLs: {exc}"
                )
                results = []

            returned_urls: set[str] = set()
            for result in results:
                url = clean_url(read_value(result, "url"))
                canonical = canonicalize_url(url)
                returned_urls.add(canonical)
                candidate = by_url.get(canonical)
                if candidate is None:
                    continue

                text = extract_page_text(result)
                candidate.text = clean_text(
                    text, self.config.max_text_chars
                )
                if candidate.text:
                    self.stats["pages_fetched"] += 1

            for candidate in candidate_chunk:
                if canonicalize_url(candidate.url) not in returned_urls:
                    candidate.text = (
                        f"Page title: {candidate.title}\n"
                        f"Source URL: {candidate.url}\n"
                        "Full page text was unavailable."
                    )

        self.stats["estimated_exa_cost_usd"] = round(
            self.stats["estimated_exa_cost_usd"]
            + self.stats["pages_fetched"] * 0.001,
            4,
        )

    def analyze_candidates(
        self, candidates: list[Candidate]
    ) -> list[tuple[dict[str, Any], Candidate]]:
        candidate_by_id = {
            candidate.candidate_id: candidate for candidate in candidates
        }
        paired: list[tuple[dict[str, Any], Candidate]] = []

        for batch in chunks(candidates, self.config.gemini_batch_size):
            if self.stats["gemini_calls"] >= self.config.max_gemini_calls:
                self.record_error(
                    "Gemini call cap reached. Remaining candidates were skipped."
                )
                break

            try:
                analyses = self.analyze_batch(batch)
            except Exception as exc:
                self.record_error(
                    f"Gemini batch failed for {len(batch)} candidates: {exc}"
                )
                analyses = []

                # Salvage individual candidates while respecting the hard call cap.
                for candidate in batch:
                    if self.stats["gemini_calls"] >= self.config.max_gemini_calls:
                        break
                    try:
                        analyses.extend(self.analyze_batch([candidate]))
                    except Exception as individual_exc:
                        self.record_error(
                            f"Gemini failed for {candidate.url}: {individual_exc}"
                        )

            for analysis in analyses:
                candidate_id = str(analysis.get("candidate_id", ""))
                candidate = candidate_by_id.get(candidate_id)
                if candidate is None:
                    LOGGER.warning(
                        "Gemini returned unknown candidate_id %s; skipped.",
                        candidate_id,
                    )
                    continue
                paired.append((analysis, candidate))

        return paired

    def analyze_batch(self, batch: list[Candidate]) -> list[dict[str, Any]]:
        self.stats["gemini_calls"] += 1

        today = datetime.now(self.timezone).date().isoformat()
        candidate_payload = [
            {
                "candidate_id": candidate.candidate_id,
                "search_result_title": candidate.title,
                "source_url": candidate.url,
                "source_domain": candidate.source_domain,
                "published_date": candidate.published_date,
                "search_query": candidate.query,
                "page_text": candidate.text,
            }
            for candidate in batch
        ]

        prompt = f"""
You are an evidence-based opportunity analyst.

TODAY: {today}
USER PROFILE:
- 20-year-old current undergraduate university student from Indonesia.
- Long-term goal: develop a strong profile for an LPDP scholarship and an MBA at NUS.
- Languages: include opportunities when information is available in English or Indonesian.
- Geography: include Indonesia, ASEAN, Asia-Pacific, worldwide, online, offline, and hybrid.
- Team opportunities, university nominations, individual opportunities, and all application formats are allowed.

PRIORITY ORDER:
1. Leadership programs and youth ambassador programs
2. Fellowships, exchanges, summer schools, and short programs
3. Public policy, governance, development, and SDG opportunities
4. Essay, writing, policy memo, and research competitions
5. Marketing, branding, strategy, and business case competitions
6. Public speaking, pitching, presentation, and communication contests
7. Entrepreneurship and social-impact competitions
8. Innovation challenges and non-technical hackathons
9. Youth summits, conferences, forums, and boot camps
10. Awards and grants
11. Debate and Model United Nations
12. Other valuable undergraduate competitions

DATABASE POLICY:
- Be broad. Store relevant opportunities even when funding, fees, eligibility,
  or deadline information is unclear.
- Reject only when the page is clearly irrelevant, clearly expired, clearly
  graduate-only, clearly restricted against Indonesian applicants, or clearly
  requires disqualifying full-time postgraduate experience.
- A free application is not the same as a fully funded opportunity.
- Do not invent missing facts.
- Use -1 for unknown numeric IDR amounts.
- Only put an IDR number in a numeric fee field when the page explicitly gives
  IDR or a trustworthy IDR equivalent. Do not invent currency conversions.
- Dates must use YYYY-MM-DD. Use an empty string when a date cannot be
  established.
- Evidence fields must quote or closely paraphrase the page.
- official_url should be the organizer's official page when it is present in
  the supplied text. Otherwise use an empty string.
- application_url should be the direct application page when present.
- confidence must be an integer from 0 to 100.
- warning_flags should contain short machine-readable warnings such as
  DEADLINE_UNCLEAR, FUNDING_UNCLEAR, FEE_UNCLEAR, SECONDARY_SOURCE,
  NATIONALITY_UNCLEAR, or ELIGIBILITY_UNCLEAR.
- Return one analysis for every candidate_id supplied.
- Do not expose private reasoning. Return only the requested structured facts.

CANDIDATES:
{json.dumps(candidate_payload, ensure_ascii=False)}
""".strip()

        last_error: Exception | None = None
        for attempt in range(3):
            try:
                response = self.gemini.models.generate_content(
                    model=self.config.gemini_model,
                    contents=prompt,
                    config={
                        "response_mime_type": "application/json",
                        "response_json_schema": BATCH_SCHEMA,
                        "max_output_tokens": 12000,
                    },
                )
                data = parse_json_text(response.text or "")
                analyses = data.get("analyses")
                if not isinstance(analyses, list):
                    raise ValueError("Gemini response has no analyses array.")
                return [
                    normalize_analysis(item)
                    for item in analyses
                    if isinstance(item, dict)
                ]
            except Exception as exc:
                last_error = exc
                if attempt < 2:
                    time.sleep(2**attempt)
        raise RuntimeError(str(last_error or "Unknown Gemini error."))

    def score_and_build_record(
        self,
        analysis: dict[str, Any],
        candidate: Candidate,
    ) -> dict[str, Any]:
        warnings = [
            clean_text(flag, 120)
            for flag in analysis.get("warning_flags", [])
            if clean_text(flag, 120)
        ]

        deadline_date = parse_iso_date(analysis.get("deadline_date"))
        today = datetime.now(self.timezone).date()
        days_remaining: int | str = ""
        deadline_status = "UNKNOWN"

        if deadline_date is not None:
            days_remaining = (deadline_date - today).days
            if days_remaining < 0:
                deadline_status = "EXPIRED"
            elif days_remaining < 5:
                deadline_status = "URGENT"
            else:
                deadline_status = "FUTURE"
        else:
            warnings.append("DEADLINE_UNCLEAR")

        undergrad = analysis.get("undergraduate_eligible", "Unclear")
        indonesia = analysis.get("indonesian_eligible", "Unclear")
        eligibility = analysis.get("eligibility_status", "Unclear")
        is_relevant = bool(analysis.get("is_relevant"))

        rejection_reason = clean_text(
            analysis.get("rejection_reason"), 1000
        )
        rejected = (
            not is_relevant
            or undergrad == "No"
            or indonesia == "No"
            or eligibility == "Ineligible"
            or deadline_status == "EXPIRED"
        )

        if rejected and not rejection_reason:
            if not is_relevant:
                rejection_reason = "Not a relevant opportunity."
            elif undergrad == "No":
                rejection_reason = "Current undergraduates are not eligible."
            elif indonesia == "No":
                rejection_reason = "Indonesian applicants are not eligible."
            elif deadline_status == "EXPIRED":
                rejection_reason = "The application deadline has passed."
            else:
                rejection_reason = "Clearly ineligible."

        score = CATEGORY_WEIGHTS.get(
            analysis.get("category", "Other"), 5
        )

        score += {
            "Eligible": 15,
            "Probably Eligible": 10,
            "Unclear": 3,
            "Probably Ineligible": -8,
            "Ineligible": -20,
        }.get(eligibility, 0)

        score += {"Yes": 12, "Probably": 8, "Unclear": 2, "No": -20}.get(
            undergrad, 0
        )
        score += {"Yes": 12, "Probably": 8, "Unclear": 2, "No": -20}.get(
            indonesia, 0
        )

        score += {
            "Fully Funded": 20,
            "Partially Funded": 12,
            "Free Participation": 10,
            "No Application Fee": 7,
            "Self Funded": 0,
            "Unclear": 2,
        }.get(analysis.get("funding_status", "Unclear"), 0)

        score += {
            "Official": 7,
            "Credible Secondary": 3,
            "Unverified": -3,
        }.get(analysis.get("official_source_status", "Unverified"), 0)

        if deadline_status == "FUTURE":
            score += 10
        elif deadline_status == "URGENT":
            score += 6
        elif deadline_status == "UNKNOWN":
            score += 1

        confidence = clamp_int(analysis.get("confidence"), 0, 100, 0)
        if confidence >= 80:
            score += 5
        elif confidence >= 60:
            score += 2
        elif confidence < 40:
            score -= 5

        application_fee_idr = integer_or_unknown(
            analysis.get("application_fee_idr")
        )
        estimated_cost_idr = integer_or_unknown(
            analysis.get("estimated_personal_cost_idr")
        )

        fee_text = (
            str(analysis.get("application_fee_raw", ""))
            + " "
            + str(analysis.get("registration_fee_raw", ""))
        ).lower()
        fee_explicitly_free = any(
            phrase in fee_text
            for phrase in [
                "free",
                "no fee",
                "without fee",
                "zero fee",
                "gratis",
                "tidak dipungut biaya",
            ]
        )

        if 0 <= application_fee_idr <= self.config.application_fee_limit_idr:
            score += 5
        elif application_fee_idr > self.config.application_fee_limit_idr:
            score -= 8
            warnings.append("APPLICATION_FEE_ABOVE_GUIDELINE")
        elif fee_explicitly_free:
            score += 5
        else:
            warnings.append("FEE_UNCLEAR")

        if 0 <= estimated_cost_idr <= self.config.personal_cost_guideline_idr:
            score += 4
        elif estimated_cost_idr > self.config.personal_cost_guideline_idr:
            score -= 5
            warnings.append("PERSONAL_COST_ABOVE_GUIDELINE")

        score = max(0, min(100, score))

        funding_status = analysis.get("funding_status", "Unclear")
        format_value = analysis.get("format", "Unknown")
        funding_priority_ok = funding_status in {
            "Fully Funded",
            "Partially Funded",
            "Free Participation",
            "No Application Fee",
        }
        eligibility_ok = (
            eligibility in {"Eligible", "Probably Eligible"}
            and undergrad in {"Yes", "Probably"}
            and indonesia in {"Yes", "Probably"}
        )
        fee_ok = (
            0 <= application_fee_idr <= self.config.application_fee_limit_idr
            or fee_explicitly_free
            or funding_status == "Fully Funded"
        )
        personal_cost_ok = (
            0 <= estimated_cost_idr
            <= self.config.personal_cost_guideline_idr
            or funding_status == "Fully Funded"
            or (
                estimated_cost_idr < 0
                and format_value == "Online"
                and fee_ok
            )
        )
        source_ok = (
            analysis.get("official_source_status") != "Unverified"
            or confidence >= 80
        )
        deadline_ok = deadline_status in {"FUTURE", "URGENT"}

        if rejected:
            alert_level = "REJECTED"
        elif (
            score >= self.config.telegram_score_threshold
            and eligibility_ok
            and funding_priority_ok
            and fee_ok
            and personal_cost_ok
            and source_ok
            and deadline_ok
        ):
            alert_level = "PRIORITY"
        elif score >= 55:
            alert_level = "REVIEW"
        else:
            alert_level = "DATABASE_ONLY"

        if analysis.get("official_source_status") == "Credible Secondary":
            warnings.append("SECONDARY_SOURCE")
        if eligibility == "Unclear":
            warnings.append("ELIGIBILITY_UNCLEAR")
        if indonesia == "Unclear":
            warnings.append("NATIONALITY_UNCLEAR")
        if funding_status == "Unclear":
            warnings.append("FUNDING_UNCLEAR")

        warnings = sorted(set(warnings))
        official_url = clean_url(analysis.get("official_url"))
        application_url = clean_url(analysis.get("application_url"))

        verification_status = (
            "Verified"
            if analysis.get("official_source_status") == "Official"
            and confidence >= 75
            and deadline_status in {"FUTURE", "URGENT"}
            else "Needs Verification"
        )

        record = {
            "opportunity_id": candidate.candidate_id,
            "date_found": now_string(self.timezone),
            "alert_level": alert_level,
            "match_score": score,
            "title": clean_text(
                analysis.get("title") or candidate.title, 500
            ),
            "organizer": clean_text(analysis.get("organizer"), 500),
            "category": analysis.get("category", "Other"),
            "subcategory": clean_text(analysis.get("subcategory"), 500),
            "summary": clean_text(analysis.get("summary"), 5000),
            "why_relevant": clean_text(
                analysis.get("why_relevant"), 3000
            ),
            "opportunity_type": clean_text(
                analysis.get("opportunity_type"), 500
            ),
            "format": analysis.get("format", "Unknown"),
            "location": clean_text(analysis.get("location"), 500),
            "host_country": clean_text(
                analysis.get("host_country"), 300
            ),
            "language": clean_text(analysis.get("language"), 300),
            "official_source_status": analysis.get(
                "official_source_status", "Unverified"
            ),
            "official_url": official_url,
            "application_url": application_url,
            "source_url": candidate.url,
            "source_type": analysis.get(
                "official_source_status", "Unverified"
            ),
            "source_domain": candidate.source_domain,
            "opening_date": clean_text(
                analysis.get("opening_date"), 100
            ),
            "start_date": clean_text(analysis.get("start_date"), 100),
            "end_date": clean_text(analysis.get("end_date"), 100),
            "deadline_raw": clean_text(
                analysis.get("deadline_raw"), 1000
            ),
            "deadline_date": (
                deadline_date.isoformat() if deadline_date else ""
            ),
            "deadline_timezone": clean_text(
                analysis.get("deadline_timezone"), 100
            ),
            "days_remaining": days_remaining,
            "deadline_status": deadline_status,
            "eligibility_status": eligibility,
            "undergraduate_eligible": undergrad,
            "indonesian_eligible": indonesia,
            "age_requirement": clean_text(
                analysis.get("age_requirement"), 1000
            ),
            "education_requirement": clean_text(
                analysis.get("education_requirement"), 2000
            ),
            "experience_requirement": clean_text(
                analysis.get("experience_requirement"), 2000
            ),
            "nationality_requirement": clean_text(
                analysis.get("nationality_requirement"), 2000
            ),
            "team_format": clean_text(
                analysis.get("team_format"), 500
            ),
            "team_size": clean_text(analysis.get("team_size"), 500),
            "application_requirements": clean_text(
                analysis.get("application_requirements"), 5000
            ),
            "application_fee_raw": clean_text(
                analysis.get("application_fee_raw"), 1000
            ),
            "application_fee_idr": (
                "" if application_fee_idr < 0 else application_fee_idr
            ),
            "registration_fee_raw": clean_text(
                analysis.get("registration_fee_raw"), 1000
            ),
            "registration_fee_idr": value_or_blank(
                analysis.get("registration_fee_idr")
            ),
            "estimated_personal_cost_idr": (
                "" if estimated_cost_idr < 0 else estimated_cost_idr
            ),
            "funding_status": funding_status,
            "funding_coverage": clean_text(
                analysis.get("funding_coverage"), 5000
            ),
            "prize_benefits": clean_text(
                analysis.get("prize_benefits"), 5000
            ),
            "travel_covered": analysis.get(
                "travel_covered", "Unclear"
            ),
            "accommodation_covered": analysis.get(
                "accommodation_covered", "Unclear"
            ),
            "meals_covered": analysis.get(
                "meals_covered", "Unclear"
            ),
            "visa_covered": analysis.get(
                "visa_covered", "Unclear"
            ),
            "eligibility_evidence": clean_text(
                analysis.get("eligibility_evidence"), 5000
            ),
            "funding_evidence": clean_text(
                analysis.get("funding_evidence"), 5000
            ),
            "deadline_evidence": clean_text(
                analysis.get("deadline_evidence"), 5000
            ),
            "confidence": confidence,
            "warning_flags": warnings,
            "verification_status": verification_status,
            "first_source_query": candidate.query,
            "run_id": self.run_id,
            "record_status": "REJECTED" if rejected else "ACTIVE",
            "rejection_reason": rejection_reason,
            "rejection_evidence": clean_text(
                analysis.get("rejection_evidence"), 5000
            ),
        }
        return record

    def write_records(self, records: list[dict[str, Any]]) -> None:
        for record_chunk in chunks(records, 25):
            response = self.webhook_post(
                "upsert_opportunities",
                {
                    "run_id": self.run_id,
                    "items": record_chunk,
                },
            )
            if response.get("ok") is not True:
                raise RuntimeError(
                    f"Sheets upsert failed: {response.get('message', response)}"
                )

            self.stats["opportunities_inserted"] += int(
                response.get("inserted", 0)
            )
            self.stats["opportunities_updated"] += int(
                response.get("updated", 0)
            )
            self.stats["rejected_logged"] += int(
                response.get("rejected_logged", 0)
            )

            for error in response.get("errors", []):
                self.record_error(f"Sheets item error: {error}")

    def send_priority_alerts(self, records: list[dict[str, Any]]) -> None:
        priority_records = [
            record
            for record in records
            if record.get("alert_level") == "PRIORITY"
        ][: self.config.max_telegram_alerts]

        for record in priority_records:
            try:
                self.send_telegram(format_priority_message(record))
                self.stats["telegram_alerts_sent"] += 1
            except Exception as exc:
                self.record_error(
                    f"Telegram alert failed for {record.get('title')}: {exc}"
                )

    def finish_success(
        self,
        records: list[dict[str, Any]],
        *,
        write_log: bool = True,
        send_summary: bool = True,
    ) -> None:
        self.stats["status"] = (
            "SUCCESS_WITH_WARNINGS"
            if self.stats["errors"]
            else "SUCCESS"
        )
        self.stats["finished_at"] = now_string(self.timezone)
        self.stats["errors"] = " | ".join(self.stats["errors"][:20])

        if write_log:
            try:
                self.webhook_post("log_run", {"run": self.stats})
            except Exception as exc:
                LOGGER.error("Could not write run log: %s", exc)

        if (
            send_summary
            and self.config.send_run_summary
            and self.config.run_mode in {"test", "bootstrap", "full"}
        ):
            try:
                self.send_telegram(format_run_summary(self.stats, records))
            except Exception as exc:
                LOGGER.error("Could not send run summary: %s", exc)

        LOGGER.info(
            "Run finished: %s. New=%s, updated=%s, rejected=%s, alerts=%s.",
            self.stats["status"],
            self.stats["opportunities_inserted"],
            self.stats["opportunities_updated"],
            self.stats["rejected_logged"],
            self.stats["telegram_alerts_sent"],
        )

    def webhook_post(
        self, action: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        body = {
            "secret": self.config.webhook_secret,
            "action": action,
            **payload,
        }
        response = self.session.post(
            self.config.webhook_url,
            json=body,
            timeout=60,
        )
        response.raise_for_status()

        try:
            result = response.json()
        except ValueError as exc:
            raise RuntimeError(
                "Apps Script returned non-JSON. Confirm that the URL ends in "
                "/exec and the deployment is accessible to Anyone."
            ) from exc

        if result.get("error") == "UNAUTHORIZED":
            raise RuntimeError(
                "Apps Script rejected the webhook secret. Replace the GitHub "
                "APPS_SCRIPT_WEBHOOK_SECRET with the value generated by the script."
            )
        return result

    def telegram_request(
        self, method: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        url = (
            f"https://api.telegram.org/bot"
            f"{self.config.telegram_bot_token}/{method}"
        )
        response = self.session.post(url, json=payload, timeout=30)
        response.raise_for_status()
        result = response.json()
        if result.get("ok") is not True:
            raise RuntimeError(
                f"Telegram {method} failed: {result.get('description', result)}"
            )
        return result

    def send_telegram(self, text: str) -> None:
        self.telegram_request(
            "sendMessage",
            {
                "chat_id": self.config.telegram_chat_id,
                "text": text[:4096],
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
        )

    def record_error(self, message: str) -> None:
        safe = clean_text(message, 2000)
        LOGGER.error(safe)
        self.stats["errors"].append(safe)


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(
            f"Missing required environment variable or GitHub secret: {name}"
        )
    return value


def env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer.") from exc
    return max(minimum, min(maximum, value))


def env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def build_http_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=4,
        connect=4,
        read=4,
        status=4,
        backoff_factor=1.0,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET", "POST"}),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update(
        {"User-Agent": "OpportunityHunterBot/1.0 (+GitHub Actions)"}
    )
    return session


def build_search_queries() -> list[str]:
    current_year = date.today().year
    next_year = current_year + 1
    suffix = (
        f"open applications deadline {current_year} or {next_year} "
        "undergraduate international students official"
    )
    return [
        # Leadership and youth representation
        f"leadership development programs youth leaders {suffix}",
        f"youth ambassador programs student delegates {suffix}",
        f"global youth leadership academy undergraduate {suffix}",
        f"ASEAN youth leadership program Indonesian students {suffix}",

        # Fellowships, exchanges, and short programs
        f"fully funded fellowships exchanges undergraduate students {suffix}",
        f"international summer schools short programs scholarships {suffix}",
        f"student exchange cultural exchange funded program {suffix}",
        f"emerging leaders fellowship university students {suffix}",

        # Public policy, governance, and SDGs
        f"public policy governance youth fellowship summit {suffix}",
        f"SDG sustainable development youth program conference {suffix}",
        f"climate policy social development youth opportunity {suffix}",
        f"United Nations youth program policy students {suffix}",

        # Essays, writing, policy memo, and research
        f"international essay writing competition university students {suffix}",
        f"policy memo research paper competition undergraduate {suffix}",
        f"op-ed article writing competition students international {suffix}",
        f"case study research competition undergraduate students {suffix}",

        # Marketing, strategy, branding, and business cases
        f"marketing brand management competition university students {suffix}",
        f"business case strategy competition international undergraduates {suffix}",
        f"consulting case competition university students {suffix}",
        f"consumer marketing advertising challenge students {suffix}",

        # Public speaking, pitching, and communication
        f"public speaking speech communication competition students {suffix}",
        f"pitching presentation competition university students {suffix}",
        f"storytelling communication challenge young people {suffix}",
        f"student conference speaker call for applications {suffix}",

        # Entrepreneurship, social impact, and innovation
        f"entrepreneurship social impact challenge undergraduate {suffix}",
        f"innovation challenge non technical hackathon university students {suffix}",
        f"social enterprise competition university students {suffix}",
        f"startup idea challenge student founders international {suffix}",

        # Summits, awards, grants, MUN, and broad discovery
        f"youth summit conference forum student delegates funding {suffix}",
        f"student awards grants recognition programs {suffix}",
        f"Model United Nations conference scholarship international students {suffix}",
        f"obscure niche undergraduate opportunity fellowship competition {suffix}",
    ]


def result_list(response: Any) -> list[Any]:
    if response is None:
        return []
    if isinstance(response, dict):
        results = response.get("results", [])
        return results if isinstance(results, list) else []
    results = getattr(response, "results", [])
    return list(results) if results is not None else []


def read_value(obj: Any, name: str) -> Any:
    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)


def extract_page_text(result: Any) -> str:
    text = read_value(result, "text")
    if isinstance(text, str):
        return text
    if isinstance(text, dict):
        for key in ("value", "text", "content"):
            value = text.get(key)
            if isinstance(value, str):
                return value

    highlights = read_value(result, "highlights")
    if isinstance(highlights, list):
        return "\n".join(str(item) for item in highlights)
    if isinstance(highlights, str):
        return highlights
    return ""


def deduplicate_candidates(candidates: list[Candidate]) -> list[Candidate]:
    seen_urls: set[str] = set()
    seen_ids: set[str] = set()
    unique: list[Candidate] = []

    for candidate in candidates:
        canonical = canonicalize_url(candidate.url)
        if not canonical:
            continue
        if canonical in seen_urls or candidate.candidate_id in seen_ids:
            continue
        seen_urls.add(canonical)
        seen_ids.add(candidate.candidate_id)
        unique.append(candidate)

    return unique


def canonicalize_url(value: Any) -> str:
    url = clean_url(value)
    if not url:
        return ""

    parsed = urlsplit(url)
    query = [
        (key, val)
        for key, val in parse_qsl(parsed.query, keep_blank_values=True)
        if not (
            key.lower().startswith("utm_")
            or key.lower()
            in {"fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source"}
        )
    ]
    path = parsed.path.rstrip("/") or "/"
    return urlunsplit(
        (
            parsed.scheme.lower(),
            parsed.netloc.lower().removeprefix("www."),
            path,
            urlencode(sorted(query)),
            "",
        )
    )


def clean_url(value: Any) -> str:
    text = clean_text(value, 5000)
    if not re.match(r"^https?://", text, flags=re.IGNORECASE):
        return ""
    return text


def domain_from_url(url: str) -> str:
    try:
        return urlsplit(url).netloc.lower().removeprefix("www.")
    except ValueError:
        return ""


def stable_candidate_id(url: str, title: str) -> str:
    identity = canonicalize_url(url) or title.strip().lower()
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]


def clean_text(value: Any, maximum: int = 45000) -> str:
    if value is None:
        return ""
    return str(value).replace("\x00", "").strip()[:maximum]


def parse_iso_date(value: Any) -> date | None:
    text = clean_text(value, 50)
    if not text:
        return None
    try:
        return datetime.strptime(text[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def parse_json_text(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("Expected a JSON object.")
    return data


def normalize_analysis(item: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(item)
    normalized["confidence"] = clamp_int(
        normalized.get("confidence"), 0, 100, 0
    )
    for field in (
        "application_fee_idr",
        "registration_fee_idr",
        "estimated_personal_cost_idr",
    ):
        normalized[field] = integer_or_unknown(normalized.get(field))
    flags = normalized.get("warning_flags")
    normalized["warning_flags"] = flags if isinstance(flags, list) else []
    return normalized


def integer_or_unknown(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return -1


def value_or_blank(value: Any) -> int | str:
    parsed = integer_or_unknown(value)
    return "" if parsed < 0 else parsed


def clamp_int(
    value: Any, minimum: int, maximum: int, default: int
) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, parsed))


def chunks(items: list[Any], size: int) -> list[list[Any]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def now_string(timezone: ZoneInfo) -> str:
    return datetime.now(timezone).strftime("%Y-%m-%d %H:%M:%S")


def format_idr(value: Any) -> str:
    parsed = integer_or_unknown(value)
    if parsed < 0:
        return "Unclear"
    return "Rp" + f"{parsed:,}".replace(",", ".")


def best_url(record: dict[str, Any]) -> str:
    return (
        clean_url(record.get("application_url"))
        or clean_url(record.get("official_url"))
        or clean_url(record.get("source_url"))
    )


def format_priority_message(record: dict[str, Any]) -> str:
    title = html.escape(clean_text(record.get("title"), 500))
    organizer = html.escape(clean_text(record.get("organizer"), 300))
    category = html.escape(clean_text(record.get("category"), 200))
    deadline = html.escape(
        clean_text(record.get("deadline_date"), 100) or "Needs verification"
    )
    funding = html.escape(clean_text(record.get("funding_status"), 200))
    location = html.escape(
        clean_text(
            f"{record.get('format', '')} | {record.get('location', '')}",
            400,
        ).strip(" |")
        or "Unclear"
    )
    why = html.escape(clean_text(record.get("why_relevant"), 900))
    url = html.escape(best_url(record), quote=True)

    message = (
        "🔥 <b>PRIORITY OPPORTUNITY</b>\n\n"
        f"<b>{title}</b>\n"
        f"Organizer: {organizer or 'Unclear'}\n"
        f"Category: {category}\n"
        f"Match score: {record.get('match_score', 0)}/100\n"
        f"Deadline: {deadline}\n"
        f"Funding: {funding}\n"
        f"Application fee: {format_idr(record.get('application_fee_idr'))}\n"
        f"Format / location: {location}\n\n"
        f"<b>Why it may matter</b>\n{why or 'Strong profile fit.'}"
    )
    if url:
        message += f'\n\n<a href="{url}">Open official/application page</a>'
    return message


def format_run_summary(
    stats: dict[str, Any], records: list[dict[str, Any]]
) -> str:
    review_count = sum(
        1 for record in records if record.get("alert_level") == "REVIEW"
    )
    database_count = sum(
        1
        for record in records
        if record.get("alert_level") == "DATABASE_ONLY"
    )
    priority_count = sum(
        1
        for record in records
        if record.get("alert_level") == "PRIORITY"
    )
    rejected_count = sum(
        1
        for record in records
        if record.get("alert_level") == "REJECTED"
    )

    return (
        "📋 <b>Opportunity Hunter daily summary</b>\n\n"
        f"Searches completed: {stats.get('searches_succeeded', 0)}/"
        f"{stats.get('searches_attempted', 0)}\n"
        f"New pages analyzed: {len(records)}\n"
        f"Priority: {priority_count}\n"
        f"Review needed: {review_count}\n"
        f"Database only: {database_count}\n"
        f"Rejected: {rejected_count}\n"
        f"Estimated Exa cost: ${stats.get('estimated_exa_cost_usd', 0):.3f}\n\n"
        "Open the Google Sheet for the full database."
    )


def configure_logging() -> None:
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )


def main() -> int:
    configure_logging()
    hunter: OpportunityHunter | None = None

    try:
        config = Config.load()
        hunter = OpportunityHunter(config)
        return hunter.run()
    except Exception as exc:
        LOGGER.exception("Fatal error: %s", exc)
        if hunter is not None:
            try:
                hunter.send_telegram(
                    "⚠️ <b>Opportunity Hunter run failed</b>\n\n"
                    f"{html.escape(clean_text(exc, 1200))}\n\n"
                    "Check the latest GitHub Actions run for details."
                )
            except Exception:
                LOGGER.exception("Could not send the failure notification.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
