"""Competition-first bot. Standard library only; no secrets in local files."""
from __future__ import annotations

import html
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin, urlsplit
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from hunter_core import (BATCH_SCHEMA, VERSION, candidate_id, canonical_url, fair_select,
                         plan_queries, prompt_for, rank_alerts, review_reasons,
                         safe_url, score_record, validate_batch)

LOG = logging.getLogger("hunter")


class APIError(RuntimeError):
    def __init__(self, service, code):
        super().__init__(f"{service}: HTTP {code}; see installation troubleshooting")
        self.code = code


def http_json(url, body=None, headers=None, service="API", timeout=90):
    """One attempt. Callers count/retry explicitly. Never log keys or raw errors."""
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    request = Request(url, data=data, headers={"Content-Type": "application/json", "User-Agent": "OpportunityHunter/2.0", **(headers or {})})
    try:
        with urlopen(request, timeout=timeout) as response:
            result = json.load(response)
        if not isinstance(result, dict):
            raise ValueError("Response was not a JSON object")
        return result
    except HTTPError as exc:
        raise APIError(service, exc.code) from None
    except (URLError, TimeoutError, ValueError, OSError):
        raise RuntimeError(f"{service}: unavailable or non-JSON response; no secrets logged") from None


class Bot:
    def __init__(self, mode="full", transport=http_json, environ=None):
        self.env = os.environ if environ is None else environ
        self.mode, self.http = mode, transport
        self.settings = json.loads(Path(__file__).with_name("config.json").read_text())
        self.tz = ZoneInfo(self.env.get("USER_TIMEZONE", "Asia/Jakarta"))
        self.today = datetime.now(self.tz).date()
        self.run_id = datetime.now(self.tz).strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:8]
        self.stats = {"run_id": self.run_id, "started_at": self.now(), "searches_attempted": 0,
                      "searches_succeeded": 0, "candidates_found": 0, "candidates_deduplicated": 0,
                      "pages_fetched": 0, "content_attempts": 0, "gemini_calls": 0,
                      "opportunities_inserted": 0, "opportunities_updated": 0, "rejected_logged": 0,
                      "telegram_alerts_sent": 0, "estimated_exa_cost_usd": 0,
                      "review_calls": 0, "errors": [], "coverage": {}, "benchmark": [], "mode": mode}
        self.review_available = False
        self.reviews_used = 0
        self.remaining_pages = 0

    def now(self):
        return datetime.now(self.tz).strftime("%Y-%m-%d %H:%M:%S")

    def key(self, name, optional=False):
        value = self.env.get(name, "").strip()
        if not value and not optional:
            raise RuntimeError("Missing GitHub Actions secret: " + name)
        return value

    def note(self, message):
        # Only code-owned messages are recorded, not upstream error bodies.
        self.stats["errors"].append(str(message)[:300])
        LOG.warning("%s", str(message)[:300])

    def sheets(self, action, **payload):
        body = {"secret": self.key("APPS_SCRIPT_WEBHOOK_SECRET"), "action": action, **payload}
        # All v2 mutations carry stable keys or operation IDs, making retries safe.
        for attempt in range(3):
            try:
                result = self.http(self.key("APPS_SCRIPT_WEBHOOK_URL"), body, service="Google Sheets")
                if result.get("ok") is not True:
                    code = str(result.get("error", "SHEETS_ERROR"))
                    message = str(result.get("message", ""))[:200]
                    raise RuntimeError("Sheets " + code + ": " + message)
                return result
            except APIError as exc:
                if exc.code not in {404, 429, 500, 502, 503, 504} or attempt == 2:
                    raise
            except RuntimeError:
                # Application errors should be fixed, not retried.
                raise
            time.sleep(2 ** attempt)

    def exa(self, endpoint, payload):
        result = self.http("https://api.exa.ai/" + endpoint, payload,
                           {"x-api-key": self.key("EXA_API_KEY")}, service="Exa")
        cost = result.get("costDollars", {}).get("total")
        if isinstance(cost, (int, float)):
            self.stats["estimated_exa_cost_usd"] += cost
        return result

    def gemini(self, prompt, schema, output_tokens=8000):
        if self.stats["gemini_calls"] >= int(self.settings["max_gemini_calls"]):
            raise RuntimeError("Gemini attempt budget reached; candidates remain queued")
        self.stats["gemini_calls"] += 1
        model = self.env.get("GEMINI_MODEL", "gemini-3.5-flash-lite")
        result = self.http("https://generativelanguage.googleapis.com/v1beta/models/" + quote(model, safe="") + ":generateContent",
                           {"contents": [{"role": "user", "parts": [{"text": prompt}]}],
                            "generationConfig": {"responseMimeType": "application/json", "responseJsonSchema": schema, "maxOutputTokens": output_tokens}},
                           {"x-goog-api-key": self.key("GEMINI_API_KEY")}, service="Gemini", timeout=120)
        candidates = result.get("candidates", [])
        if not candidates or candidates[0].get("finishReason") not in {None, "STOP"}:
            raise RuntimeError("Gemini returned a blocked or truncated response")
        text = "".join(p.get("text", "") for p in candidates[0].get("content", {}).get("parts", []) if not p.get("thought"))
        try:
            return json.loads(text)
        except (ValueError, TypeError):
            raise RuntimeError("Gemini returned invalid JSON; candidate remains queued") from None

    def check_reviewer(self):
        if not self.settings.get("review_enabled") or not self.key("OPENROUTER_API_KEY", True):
            self.note("OpenRouter reviewer disabled or key missing; extraction continues with review flags")
            return False
        try:
            catalog = self.http("https://openrouter.ai/api/v1/models", service="OpenRouter catalog")
            model = next((m for m in catalog.get("data", []) if m.get("id") == self.settings["review_model"]), None)
            if not model or not {"response_format", "structured_outputs"}.intersection(model.get("supported_parameters", [])):
                self.note("Reviewer unavailable or lacks structured output support; review tasks stay pending")
                return False
            return True
        except (RuntimeError, ValueError):
            self.note("OpenRouter model availability check failed; review tasks stay pending")
            return False

    def reviewer(self, prompt, schema=BATCH_SCHEMA, output_tokens=5000):
        if not self.review_available or self.mode == "dry-run" or self.reviews_used >= int(self.settings["review_max_per_run"]):
            return None
        inp = float(self.settings["review_input_ceiling_per_million"])
        out = float(self.settings["review_output_ceiling_per_million"])
        # UTF-8 bytes plus full schema plus envelope give a conservative upper
        # bound for text tokenization. Reservations survive network ambiguity.
        input_bound = len(prompt.encode()) + len(json.dumps(schema).encode()) + 4096
        reserve = round((input_bound * inp + output_tokens * out) / 1000000, 6)
        request_id = self.run_id + "-review-" + str(self.reviews_used)
        permit = self.sheets("reserve_review", request_id=request_id, month=self.today.strftime("%Y-%m"),
                             amount=reserve, budget=float(self.settings["review_monthly_budget_usd"]))
        if not permit.get("allowed"):
            self.note("Monthly reviewer budget exhausted; review flags retained")
            return None
        self.reviews_used += 1
        self.stats["review_calls"] += 1
        # One attempt only. A timeout might already have been billed.
        try:
            response = self.http("https://openrouter.ai/api/v1/chat/completions",
                                 {"model": self.settings["review_model"], "messages": [{"role": "user", "content": prompt}],
                                  "max_tokens": output_tokens,
                                  "provider": {"require_parameters": True, "max_price": {"prompt": inp, "completion": out, "request": 0}},
                                  "response_format": {"type": "json_schema", "json_schema": {"name": "opportunity_analysis", "strict": True, "schema": schema}}},
                                 {"Authorization": "Bearer " + self.key("OPENROUTER_API_KEY"), "X-OpenRouter-Title": "Opportunity Hunter"},
                                 service="OpenRouter", timeout=120)
            usage = response.get("usage", {})
            cost = usage.get("cost")
            if isinstance(cost, (int, float)) and cost >= 0:
                self.sheets("settle_review", request_id=request_id, amount=cost)
            # Missing cost keeps the full reservation; it is never reset per run.
            if response.get("error"):
                raise RuntimeError("Reviewer provider returned an error")
            choice = response.get("choices", [{}])[0]
            if choice.get("finish_reason") not in {None, "stop"}:
                raise RuntimeError("Reviewer response truncated")
            return json.loads(choice.get("message", {}).get("content", ""))
        except (RuntimeError, ValueError, IndexError, TypeError):
            self.note("Strong review failed; original extraction retained with review pending")
            return None

    def telegram(self, message):
        result = self.http("https://api.telegram.org/bot" + self.key("TELEGRAM_BOT_TOKEN") + "/sendMessage",
                           {"chat_id": self.key("TELEGRAM_CHAT_ID"), "text": message[:4000], "parse_mode": "HTML", "disable_web_page_preview": True}, service="Telegram")
        if not result.get("ok"):
            raise RuntimeError("Telegram rejected message; verify chat ID and bot access")

    def verify(self):
        self.exa("search", {"query": "undergraduate business case competition official", "type": "auto", "numResults": 1})
        schema = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"], "additionalProperties": False}
        if self.gemini('Return {"ok":true}. This is a connection test.', schema, 256) != {"ok": True}:
            raise RuntimeError("Gemini structured output check failed")
        self.review_available = self.check_reviewer()
        reviewer_result = self.reviewer('Return {"ok":true}. Connection test.', schema, 256) if self.review_available else None
        reviewer_text = "PASS" if reviewer_result == {"ok": True} else "UNAVAILABLE / deferred (see run report)"
        self.telegram("✅ <b>Opportunity Hunter v2 verification</b>\nSheets: PASS\nExa: PASS\nGemini JSON: PASS\nOpenRouter JSON: " + reviewer_text + "\nTelegram: PASS\nNo opportunity rows were inserted by this check.")
        self.finish()

    def enqueue(self, candidates):
        if self.mode == "dry-run":
            return
        for start in range(0, len(candidates), 100):
            self.sheets("enqueue", items=candidates[start:start + 100])

    def discover(self, plan):
        candidates = []
        for query in plan:
            family = query["family"]
            coverage = self.stats["coverage"].setdefault(family, {"attempted": 0, "succeeded": 0, "results": 0, "processed": 0})
            coverage["attempted"] += 1
            self.stats["searches_attempted"] += 1
            payload = {"query": query["query"], "type": "auto", "numResults": int(self.settings["results_per_search"])}
            if query.get("domains"):
                payload["includeDomains"] = query["domains"]
            try:
                response = self.exa("search", payload)
                self.stats["searches_succeeded"] += 1
                coverage["succeeded"] += 1
                for result in response.get("results", []):
                    url = safe_url(result.get("url"))
                    if url:
                        candidates.append({"url": url, "title": str(result.get("title", ""))[:500], "family": family,
                                           "query": query["query"], "kind": "discovery"})
                        coverage["results"] += 1
            except RuntimeError:
                self.note("Search failed in family " + family)
        unique, _ = fair_select(candidates, len(candidates))
        self.stats["candidates_found"] = len(unique)
        self.enqueue(unique)
        return unique

    def fetch(self, candidate):
        if not safe_url(candidate.get("url")):
            raise RuntimeError("Source URL is invalid or not a public HTTP URL")
        if self.remaining_pages <= 0:
            raise RuntimeError("Content page budget reached")
        self.remaining_pages -= 1
        self.stats["content_attempts"] += 1
        response = self.exa("contents", {"urls": [candidate["url"]], "text": {"maxCharacters": 18000},
                                        "extras": {"links": 30}, "maxAgeHours": 24 if candidate.get("kind") == "refresh" else 168})
        results = response.get("results", [])
        if not results or len(str(results[0].get("text", ""))) < 80:
            raise RuntimeError("Page empty or inaccessible")
        result = results[0]
        self.stats["pages_fetched"] += 1
        links = []
        extras = result.get("extras", {})
        for link in extras.get("links", []) + extras.get("richLinks", []):
            url = link.get("url", "") if isinstance(link, dict) else link
            title = link.get("anchor", "") if isinstance(link, dict) else ""
            url = safe_url(urljoin(candidate["url"], str(url)))
            if url:
                links.append({"url": url, "title": title})
        return {"candidate_id": candidate_id(candidate["url"]), "url": candidate["url"], "title": candidate.get("title", ""),
                "page_text": str(result["text"])[:18000], "links": links, "truncated": len(str(result["text"])) >= 18000}

    def analyze(self, candidate, page):
        prompt = prompt_for([page], self.settings["profile"], self.today)
        extracted = self.gemini(prompt, BATCH_SCHEMA)
        try:
            analysis = validate_batch(extracted, [page["candidate_id"]])[0]
        except ValueError:
            fallback = self.reviewer(prompt + "\nThe initial extraction failed schema validation. Return the exact required IDs and types.")
            if fallback is None:
                raise
            analysis = validate_batch(fallback, [page["candidate_id"]])[0]
            analysis["warning_flags"].append("STRONG_REVIEW_COMPLETED")
        # Fetch at most one supporting rule/registration page per event before
        # escalating to a more expensive model. All pages share the global cap.
        reasons = review_reasons(analysis)
        allowed = {canonical_url(link["url"]) for link in page["links"]}
        for field in ["official_url", "application_url"]:
            if analysis.get(field) and canonical_url(analysis[field]) not in allowed | {canonical_url(candidate["url"])}:
                analysis[field] = ""
                analysis["warning_flags"].append("UNSUPPORTED_LINK_REMOVED")
        if analysis["page_kind"] == "Event" and (reasons or not analysis.get("deadline_date")):
            rule_links = [link for link in page["links"] if re.search(r"rules|guide|booklet|panduan|eligib|registration|register|apply|\.pdf", link["url"] + " " + link["title"], re.I)]
            if rule_links and self.remaining_pages and self.stats["gemini_calls"] < int(self.settings["max_gemini_calls"]) - 1:
                try:
                    supporting = self.fetch({"url": rule_links[0]["url"], "kind": "refresh"})
                    page["page_text"] += "\nSUPPORTING SOURCE " + rule_links[0]["url"] + "\n" + supporting["page_text"]
                    page["links"] += supporting["links"]
                    allowed |= {canonical_url(rule_links[0]["url"])} | {canonical_url(link["url"]) for link in supporting["links"]}
                    prompt = prompt_for([page], self.settings["profile"], self.today)
                    analysis = validate_batch(self.gemini(prompt, BATCH_SCHEMA), [page["candidate_id"]])[0]
                except (RuntimeError, ValueError):
                    analysis["warning_flags"].append("SUPPORTING_SOURCE_UNAVAILABLE")
        reasons = review_reasons(analysis)
        # Deterministic 10% sample catches some confidently wrong exclusions.
        sample_rejection = not analysis["is_relevant"] and int(page["candidate_id"][:4], 16) % 10 == 0
        if reasons or sample_rejection:
            reviewed = self.reviewer(prompt + "\nSECOND PASS: independently check all restrictions and evidence. Reasons: " + "; ".join(reasons))
            if reviewed is not None:
                try:
                    analysis = validate_batch(reviewed, [page["candidate_id"]])[0]
                    analysis["warning_flags"].append("STRONG_REVIEW_COMPLETED")
                except ValueError:
                    analysis["warning_flags"].append("STRONG_REVIEW_PENDING")
            else:
                analysis["warning_flags"].append("STRONG_REVIEW_PENDING")
        for field in ["official_url", "application_url"]:
            if analysis.get(field) and canonical_url(analysis[field]) not in allowed | {canonical_url(candidate["url"])}:
                analysis[field] = ""
                analysis["warning_flags"].append("UNSUPPORTED_LINK_REMOVED")
        if page["truncated"]:
            analysis["warning_flags"].append("SOURCE_TEXT_TRUNCATED")
        return analysis

    def process(self, candidate):
        page = self.fetch(candidate)
        analysis = self.analyze(candidate, page)
        if analysis["page_kind"] == "Listing":
            try:
                links = json.loads(analysis.get("source_links") or "[]")
            except ValueError:
                links = []
            allowed = {canonical_url(link["url"]) for link in page["links"]}
            children = [{"url": link["url"], "title": str(link.get("title", ""))[:500], "family": candidate["family"],
                         "query": "Listing: " + candidate["url"], "kind": "discovery"}
                        for link in links[:30] if isinstance(link, dict) and canonical_url(link.get("url")) in allowed and canonical_url(link.get("url")) != canonical_url(candidate["url"])]
            self.enqueue(children)
            return None, "Listing expanded" if children else "Listing: no supported child links; manual review"
        if analysis["page_kind"] == "Other":
            return None, "Non-event page; retained for scheduled revisit"
        record = score_record(analysis, candidate, self.settings, self.today)
        record.update(date_found=self.now(), run_id=self.run_id, last_checked=self.now(),
                      extraction_model=self.env.get("GEMINI_MODEL", "gemini-3.5-flash-lite"), schema_version=VERSION)
        return record, "Event processed"

    def send_alerts(self, records):
        for record in rank_alerts(records, int(self.settings["max_alerts"])):
            notification_id = record["opportunity_id"] + ":priority:" + record.get("deadline_date", "")
            permit = self.sheets("claim_alert", notification_id=notification_id)
            if not permit.get("allowed"):
                continue
            escape = lambda v: html.escape(str(v or "Unknown"))
            link = safe_url(record.get("application_url")) or safe_url(record.get("official_url")) or record["source_url"]
            text = ("🏆 <b>Competition match</b>\n<b>" + escape(record["title"]) + "</b>\n" +
                    escape(record["category"]) + " | Fit " + str(record["match_score"]) + "/100\n" +
                    "Entry deadline: " + escape(record["deadline_date"]) + " (" + escape(record.get("deadline_timezone")) + ")\n" +
                    "Eligibility: " + escape(record["eligibility_status"]) + "\nTeam: " + escape(record.get("team_size") or record.get("team_format")) +
                    "\nSubmit: " + escape(record.get("main_deliverable"))[:500] + "\nEntry cost: Rp" + str(record["entry_cost_idr"]) +
                    "\nChecked: " + escape(record["last_checked"]) + '\n<a href="' + html.escape(link, quote=True) + '">Open application/source</a>')
            try:
                self.telegram(text)
                self.stats["telegram_alerts_sent"] += 1
                self.sheets("complete_alert", notification_id=notification_id)
            except RuntimeError:
                # Keep a claimed state: retrying after an ambiguous network result
                # could duplicate a Telegram message. Surface it for manual check.
                self.note("Alert delivery uncertain; saved record remains available in Sheets")

    def finish(self, send=True):
        self.stats["status"] = "SUCCESS_WITH_WARNINGS" if self.stats["errors"] else "SUCCESS"
        self.stats["finished_at"] = self.now()
        self.stats["notes"] = json.dumps({"version": VERSION, "mode": self.mode, "coverage": self.stats["coverage"], "content_attempts": self.stats["content_attempts"], "review_calls": self.stats["review_calls"]})
        report = dict(self.stats)
        Path("run-report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
        if self.mode != "dry-run":
            self.sheets("finish_run", run=report)
            if send and self.mode not in {"verify", "connections"}:
                lines = ["📋 <b>Opportunity Hunter v2</b>", "New competitions: " + str(self.stats.get("new_competitions", 0)),
                         "Saved / updated: " + str(self.stats["opportunities_inserted"]) + " / " + str(self.stats["opportunities_updated"]),
                         "Queued: " + str(self.stats.get("queue_remaining", "?")), "Coverage:"]
                lines += [html.escape(k) + ": " + str(v["succeeded"]) + "/" + str(v["attempted"]) + " searches" for k, v in self.stats["coverage"].items()]
                lines += ["Strong reviews: " + str(self.stats["review_calls"]), "Warnings: " + str(len(self.stats["errors"])), "See Settings and Run Logs for checks."]
                try:
                    self.telegram("\n".join(lines))
                except RuntimeError:
                    LOG.warning("Run saved, but Telegram summary failed")

    def run(self):
        for name in ["EXA_API_KEY", "GEMINI_API_KEY", "APPS_SCRIPT_WEBHOOK_URL", "APPS_SCRIPT_WEBHOOK_SECRET", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]:
            self.key(name)
        health = self.sheets("health_check")
        if health.get("schema_version") != 2:
            raise RuntimeError("Sheet is not upgraded to v2. Run upgradeOpportunityHunter, then edit the existing deployment to New version")
        runtime = self.sheets("runtime")
        self.settings.update(runtime.get("settings", {}))
        if self.mode in {"verify", "connections"}:
            self.verify()
            return
        if not runtime.get("enabled", True):
            LOG.info("Bot is paused in Settings. No search/model requests made.")
            return
        if self.mode in {"test", "dry-run"}:
            self.settings.update(max_searches=5, results_per_search=2, max_content_pages=8, max_gemini_calls=8, review_max_per_run=1)
        if self.mode == "bootstrap":
            # Broadening rotates queries; no unbounded one-off bill.
            self.settings["max_searches"] = 20
        cursor = int(runtime.get("query_cursor", 0))
        plan = plan_queries(cursor, int(self.settings["max_searches"]), self.today,
                            bool(self.settings.get("include_programs")), self.settings.get("sources"))
        new = self.discover(plan)
        if self.stats["searches_succeeded"] == 0:
            self.note("All searches failed; existing queue still processed if available")
        if self.mode == "dry-run":
            pool = new
        else:
            self.sheets("set_cursor", request_id=self.run_id, cursor=cursor + len(plan))
            pool = self.sheets("queue_due").get("items", [])
        self.remaining_pages = int(self.settings["max_content_pages"])
        # Supporting pages and queued discovery/refresh pages share one cap.
        selected, deferred = fair_select(pool, int(self.settings["max_content_pages"]))
        self.stats["queue_remaining"] = len(deferred)
        self.review_available = self.check_reviewer() if self.mode != "dry-run" else False
        records = []
        for index, candidate in enumerate(selected):
            if not self.remaining_pages or self.stats["gemini_calls"] >= int(self.settings["max_gemini_calls"]):
                self.stats["queue_remaining"] += len(selected) - index
                break
            try:
                record, result = self.process(candidate)
                if record:
                    if self.mode != "dry-run":
                        saved = self.sheets("save_record", record=record, operation_id=self.run_id + ":" + candidate_id(candidate["url"]))
                        record["opportunity_id"] = saved["opportunity_id"]
                        self.stats["opportunities_inserted"] += int(saved.get("inserted", 0))
                        self.stats["opportunities_updated"] += int(saved.get("updated", 0))
                        if saved.get("inserted") and record["opportunity_type"] == "Competition" and record["record_status"] == "ACTIVE":
                            self.stats["new_competitions"] = self.stats.get("new_competitions", 0) + 1
                        if saved.get("changed_deadline"):
                            self.stats.setdefault("changes", []).append({"id": saved["opportunity_id"], "title": record["title"], "deadline": record["deadline_date"]})
                    records.append(record)
                if self.mode != "dry-run":
                    self.sheets("queue_result", url=candidate["url"], outcome="DONE", detail=result,
                                revisit_days=30 if not record or record.get("record_status") != "ACTIVE" else 3 if record.get("days_remaining", 999) != "" and record["days_remaining"] < 14 else 7)
                coverage = self.stats["coverage"].setdefault(candidate.get("family", "Unknown"), {"attempted": 0, "succeeded": 0, "results": 0, "processed": 0})
                coverage["processed"] += 1
            except (RuntimeError, ValueError, KeyError, TypeError):
                self.note("Candidate deferred after fetch, validation or save failure: " + candidate_id(candidate["url"]))
                self.stats["queue_remaining"] += 1
                if self.mode != "dry-run":
                    self.sheets("queue_result", url=candidate["url"], outcome="RETRY", detail="Fetch, model validation or persistence failed; candidate kept", revisit_days=1)
        if self.mode != "dry-run":
            # Sending only after an acknowledged save avoids orphan alerts.
            self.send_alerts(records)
            final = self.sheets("refresh_views")
            self.stats["queue_remaining"] = final.get("queue_remaining", self.stats["queue_remaining"])
            self.stats["benchmark"] = final.get("benchmark", [])
        else:
            self.stats["preview"] = [{k: r.get(k) for k in ["title", "category", "alert_level", "review_reason"]} for r in records]
        self.finish()


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    mode = os.getenv("RUN_MODE", "verify").strip().lower()
    if mode not in {"verify", "connections", "test", "dry-run", "full", "bootstrap"}:
        raise SystemExit("Invalid RUN_MODE")
    bot = Bot(mode)
    try:
        bot.run()
        return 0
    except Exception as exc:
        # Do not dump exception chains containing request URLs or headers.
        LOG.error("Run failed: %s", str(exc)[:300] if isinstance(exc, RuntimeError) else type(exc).__name__)
        bot.note("Run stopped; see GitHub step and START-HERE troubleshooting")
        try:
            bot.finish(send=False)
        except Exception:
            Path("run-report.json").write_text(json.dumps(bot.stats, indent=2))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
