import copy
import unittest
from datetime import date
from hunter_core import (PROPERTIES, CATEGORIES, candidate_id, canonical_url, deadline_info,
                         edition_id, fair_select, iso_date, plan_queries, rank_alerts,
                         safe_url, score_record, validate_batch)

def fixture(**overrides):
    row = {k: "" for k in PROPERTIES}
    row.update({k: -1 for k, p in PROPERTIES.items() if p["type"] == "integer"})
    row.update(candidate_id="candidate", title="Student Case Challenge 2027", organizer="Example University",
               category="Business Cases", opportunity_type="Competition", page_kind="Event", edition_year="2027",
               is_relevant=True, warning_flags=[], format="Online", official_source_status="Official", confidence=90,
               eligibility_status="Eligible", undergraduate_eligible="Yes", indonesian_eligible="Yes",
               deadline_date="2027-05-20", deadline_evidence="Entries close 20 May 2027", deadline_timezone="Asia/Jakarta",
               entry_fee_status="Free", entry_fee_evidence="Entry and participation are free", funding_status="Unclear")
    row.update(overrides)
    return row

class CoreTests(unittest.TestCase):
    def setUp(self):
        self.candidate = {"url": "https://example.org/event", "query": "case competition"}
        self.settings = {"application_fee_limit_idr": 300000, "personal_cost_guideline_idr": 1000000}
        self.today = date(2026, 11, 3)
    def score(self, **overrides):
        return score_record(fixture(**overrides), self.candidate, self.settings, self.today)
    def test_every_competition_family_is_in_default_run(self):
        for cursor in range(40):
            plan = plan_queries(cursor, 16, self.today)
            self.assertEqual({q["family"] for q in plan}, set(CATEGORIES[:5]))
            self.assertNotIn("Programs", [q["family"] for q in plan])
    def test_rotation_reaches_variants(self):
        queries = [q["query"] for c in range(0, 112, 16) for q in plan_queries(c, 16, self.today)]
        self.assertTrue(any("esai" in q for q in queries))
        self.assertGreater(len(set(queries)), 15)
    def test_targeted_query_keeps_family_coverage(self):
        sources = [{"family": "Marketing", "query": "marketing {year}", "domains": ["example.org"]}]
        self.assertEqual(len({q["family"] for q in plan_queries(0, 16, self.today, sources=sources)}), 5)
    def test_page_fairness_and_no_lost_deferred_records(self):
        items = [{"url": f"https://example.org/{f}/{i}", "family": f} for f in CATEGORIES[:5] for i in range(20)]
        selected, deferred = fair_select(items, 10)
        self.assertEqual(len(selected) + len(deferred), 100)
        self.assertEqual([q["family"] for q in selected].count("Marketing"), 2)
    def test_url_dedup_and_case_sensitive_path(self):
        self.assertEqual(canonical_url("https://www.EXAMPLE.org/Event/?utm_source=x&b=2&a=1#x"), "https://example.org/Event?a=1&b=2")
        self.assertNotEqual(candidate_id("https://example.org/Event"), candidate_id("https://example.org/event"))
        a = {"url": "https://example.org/event?utm_source=x", "family": "Marketing"}
        b = {"url": "https://example.org/event", "family": "Marketing"}
        self.assertEqual(len(fair_select([a, b], 10)[0]), 1)
    def test_private_and_credential_urls_rejected(self):
        for value in ["file:///tmp/key", "http://localhost/a", "http://127.0.0.1/x", "http://169.254.169.254/", "https://user:pass@example.org"]:
            self.assertEqual(safe_url(value), "")
    def test_unknown_funding_does_not_block_free_competition(self):
        self.assertEqual(self.score()["alert_level"], "PRIORITY")
    def test_paid_registration_overrides_free_label(self):
        r = self.score(registration_fee_idr=2000000)
        self.assertEqual(r["entry_fee_status"], "Paid")
        self.assertIn("FEE_CONFLICT", r["warning_flags"])
        self.assertNotEqual(r["alert_level"], "PRIORITY")
    def test_all_mandatory_costs_count(self):
        r = self.score(entry_fee_status="Paid", application_fee_idr=100000, registration_fee_idr=150000, participation_fee_idr=100000)
        self.assertEqual(r["entry_cost_idr"], 350000)
        self.assertIn("ENTRY_COST_ABOVE_GUIDELINE", r["warning_flags"])
    def test_unknown_not_zero(self):
        r = self.score(entry_fee_status="Unknown", entry_fee_evidence="", application_fee_idr=0)
        self.assertEqual(r["entry_cost_idr"], -1)
        self.assertNotEqual(r["alert_level"], "PRIORITY")
    def test_negated_free(self):
        self.assertNotEqual(self.score(entry_fee_evidence="Participation is not free")["alert_level"], "PRIORITY")
    def test_free_application_alone_does_not_prove_free_participation(self):
        self.assertNotEqual(self.score(entry_fee_evidence="Application is free")["alert_level"], "PRIORITY")
    def test_unverified_source_never_priority(self):
        self.assertNotEqual(self.score(official_source_status="Unverified")["alert_level"], "PRIORITY")
    def test_online_final_is_allowed_without_travel(self):
        self.assertEqual(self.score(rounds="Online preliminary and online final")["alert_level"], "PRIORITY")
    def test_registration_precedes_submission(self):
        self.assertEqual(self.score(registration_deadline="2026-11-02", submission_deadline="2027-01-01")["record_status"], "CLOSED")
    def test_unknown_deadline_is_reviewable(self):
        r = self.score(deadline_date="", deadline_evidence="")
        self.assertEqual(r["record_status"], "ACTIVE")
        self.assertNotEqual(r["alert_level"], "PRIORITY")
    def test_deadline_boundary(self):
        self.assertEqual(deadline_info("2026-11-03", self.today), (0, "URGENT"))
        self.assertEqual(deadline_info("2026-11-02", self.today), (-1, "EXPIRED"))
        self.assertIsNone(iso_date("2026-02-30"))
    def test_eligibility_flags_override_positive_label(self):
        r = self.score(warning_flags=["ELIGIBILITY_UNCLEAR"])
        self.assertEqual(r["eligibility_status"], "Unclear")
        self.assertNotEqual(r["alert_level"], "PRIORITY")
    def test_rejection_needs_evidence(self):
        r = self.score(is_relevant=False, rejection_evidence="")
        self.assertEqual(r["record_status"], "ACTIVE")
        self.assertIn("REJECTION_EVIDENCE_MISSING", r["warning_flags"])
    def test_offline_final_needs_cost_review(self):
        self.assertNotEqual(self.score(rounds="Online preliminary; compulsory offline final in Japan")["alert_level"], "PRIORITY")
    def test_scholarship_never_in_competition_alerts(self):
        self.assertNotEqual(self.score(opportunity_type="Scholarship")["alert_level"], "PRIORITY")
    def test_edition_and_track_identity(self):
        self.assertEqual(len({edition_id(x) for x in [fixture(), fixture(edition_year="2028"), fixture(track="Marketing")]}), 3)
    def test_sort_before_alert_cap(self):
        a, b = self.score(), self.score(title="Second competition")
        a["match_score"] = 75; b["match_score"] = 95
        self.assertEqual(rank_alerts([a, b], 1)[0]["title"], "Second competition")
    def test_exact_model_ids_and_types_required(self):
        good = fixture()
        self.assertEqual(validate_batch({"analyses": [good]}, ["candidate"]), [good])
        for rows in [[good, good], [fixture(candidate_id="foreign")], []]:
            with self.assertRaises(ValueError):validate_batch({"analyses": rows}, ["candidate"])
        bad = copy.deepcopy(good); bad["is_relevant"] = "false"
        with self.assertRaises(ValueError):validate_batch({"analyses": [bad]}, ["candidate"])
    def test_invalid_model_date(self):
        with self.assertRaises(ValueError):validate_batch({"analyses": [fixture(deadline_date="2026-02-31")]}, ["candidate"])

if __name__ == "__main__":unittest.main()
