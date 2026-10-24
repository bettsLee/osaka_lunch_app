"""
수집 배치의 24시간 규칙 테스트 (10/24 리크루트 답). 네트워크 없이 만든 값만 씀

실행: python3 -m unittest batch/test_collect.py
"""
import datetime
import os
import sys
import unittest
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from collect import old_visit_names_path  # noqa: E402


class OldVisitNamesTest(unittest.TestCase):
    def test_이름이_남은_24시간_지난_기록만(self):
        now = datetime.datetime(2026, 10, 24, 7, 30, 15, 123, tzinfo=datetime.timezone.utc)
        path = old_visit_names_path(now)
        table, query = path.split("?")
        self.assertEqual(table, "visits")
        params = dict(p.split("=", 1) for p in query.split("&"))
        self.assertEqual(params["shop_name"], "not.is.null")
        self.assertEqual(urllib.parse.unquote(params["chosen_at"]), "lt.2026-10-23T07:30:15+00:00")


if __name__ == "__main__":
    unittest.main()
