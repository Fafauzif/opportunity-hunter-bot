import json
import os
import tempfile
import unittest
from bot_v2 import Bot
from test_core import fixture

ENV = {k: "test-placeholder" for k in ["EXA_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "APPS_SCRIPT_WEBHOOK_SECRET"]}
ENV["APPS_SCRIPT_WEBHOOK_URL"] = "https://example.org/webhook"

class FakeServices:
    def __init__(self):
        self.queue, self.records, self.calls, self.reservations = [], [], [], {}
        self.fail_save = False
    def __call__(self, url, body=None, headers=None, **kw):
        self.calls.append((url, body))
        if url == ENV["APPS_SCRIPT_WEBHOOK_URL"]:
            action = body["action"]
            if action == "health_check":return {"ok": True, "schema_version": 2}
            if action == "runtime":return {"ok": True, "enabled": True, "query_cursor": 0}
            if action == "enqueue":
                existing = {x["url"] for x in self.queue}
                self.queue += [x for x in body["items"] if x["url"] not in existing]
            if action == "queue_due":return {"ok": True, "items": self.queue}
            if action == "save_record":
                if self.fail_save:raise RuntimeError("Simulated persistence failure")
                self.records.append(body["record"])
                return {"ok": True, "opportunity_id": body["record"]["opportunity_id"], "inserted": 1}
            if action == "reserve_review":
                self.reservations[body["request_id"]] = body["amount"]
                return {"ok": True, "allowed": True}
            if action == "claim_alert":return {"ok": True, "allowed": True}
            if action == "refresh_views":return {"ok": True, "queue_remaining": 0, "benchmark": []}
            return {"ok": True}
        if url.endswith("/search"):return {"results": [{"url": "https://example.org/competition", "title": "Example"}]}
        if url.endswith("/contents"):return {"results": [{"url": body["urls"][0], "text": "Official rules: entry and participation free; undergraduate students worldwide eligible. Deadline 20 May 2027. " * 3, "extras": {"links": []}}]}
        if "generativelanguage" in url:
            prompt = body["contents"][0]["parts"][0]["text"]
            if "CANDIDATES:" in prompt:
                data = json.loads(prompt.split("CANDIDATES:\n", 1)[1])
                result = {"analyses": [fixture(candidate_id=data[0]["candidate_id"])]}
            else:result = {"ok": True}
            return {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": json.dumps(result)}]}}]}
        if url.endswith("/models"):return {"data": [{"id": "google/gemini-3.6-flash", "supported_parameters": ["structured_outputs"]}]}
        if url.endswith("/chat/completions"):return {"usage": {"cost": 0.001}, "choices": [{"finish_reason": "stop", "message": {"content": '{"ok":true}'}}]}
        if "api.telegram.org" in url:return {"ok": True}
        raise AssertionError(url)

class FlowTests(unittest.TestCase):
    def run_bot(self, mode="test", service=None):
        service = service or FakeServices()
        with tempfile.TemporaryDirectory() as path:
            previous = os.open(".", os.O_RDONLY)
            try:
                os.chdir(path); bot = Bot(mode, transport=service, environ=ENV); bot.run()
                return bot, service
            finally:os.fchdir(previous); os.close(previous)
    def test_saves_before_alerts(self):
        bot, services = self.run_bot()
        self.assertEqual(len(services.records), 1)
        saved = next(i for i, (_, b) in enumerate(services.calls) if b and b.get("action") == "save_record")
        alert = next(i for i, (_, b) in enumerate(services.calls) if b and b.get("action") == "claim_alert")
        self.assertLess(saved, alert); self.assertEqual(len(bot.stats["coverage"]), 5)
    def test_failed_save_never_alerts(self):
        services = FakeServices(); services.fail_save = True
        bot, services = self.run_bot(service=services)
        self.assertFalse(any(b and b.get("action") == "claim_alert" for _, b in services.calls))
        self.assertTrue(any(b and b.get("action") == "queue_result" and b["outcome"] == "RETRY" for _, b in services.calls))
    def test_dry_run_no_mutation_or_telegram(self):
        bot, services = self.run_bot("dry-run")
        actions = [b["action"] for u, b in services.calls if u == ENV["APPS_SCRIPT_WEBHOOK_URL"]]
        self.assertEqual(actions, ["health_check", "runtime"])
        self.assertFalse(any("api.telegram.org" in u for u, _ in services.calls))
    def test_verification_reserves_reviewer_budget(self):
        bot, services = self.run_bot("verify")
        self.assertEqual(len(services.records), 0); self.assertEqual(len(services.reservations), 1)
        request = next(b for u, b in services.calls if u.endswith("/chat/completions"))
        self.assertTrue(request["provider"]["require_parameters"])
        self.assertEqual(request["provider"]["max_price"]["request"], 0)
    def test_actual_gemini_attempt_cap(self):
        services = FakeServices(); bot = Bot("test", transport=services, environ=ENV)
        bot.settings["max_gemini_calls"] = 1; bot.gemini("test", {"type": "object"})
        with self.assertRaises(RuntimeError):bot.gemini("test", {"type": "object"})
        self.assertEqual(sum("generativelanguage" in u for u, _ in services.calls), 1)
    def test_missing_openrouter_key_does_not_call_paid_provider(self):
        services = FakeServices(); env = dict(ENV); env.pop('OPENROUTER_API_KEY')
        bot = Bot('test', transport=services, environ=env)
        self.assertFalse(bot.check_reviewer())
        self.assertIsNone(bot.reviewer('Never call this'))
        self.assertFalse(any(u.endswith('/chat/completions') for u, _ in services.calls))
    def test_review_timeout_keeps_reservation(self):
        services = FakeServices()
        def fail_review(url, *args, **kwargs):
            if url.endswith('/chat/completions'):raise RuntimeError('ambiguous network timeout')
            return services(url, *args, **kwargs)
        bot = Bot('test', transport=fail_review, environ=ENV);bot.review_available = True
        self.assertIsNone(bot.reviewer('test'))
        self.assertEqual(len(services.reservations), 1)
        self.assertFalse(any(b and b.get('action') == 'settle_review' for _, b in services.calls))

if __name__ == "__main__":unittest.main()
