"""
AI 실패 때 예전 결과를 남기는 규칙(10/23) 테스트. 가게 원문은 쓰지 않고 만든 값으로만 확인해요.

실행: python3 -m unittest batch/test_structure_shops.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from structure_shops import keep_previous  # noqa: E402

SHOP = {"id": "J001", "text_hash": "new"}
FAIL = {"error": "RuntimeError: Gemini 오류 402"}
OK = {"lunch_days": {}, "under_990": "yes"}


class KeepPreviousTest(unittest.TestCase):
    def test_실패했고_예전_결과가_멀쩡하면_남김(self):
        done = {"J001": {"shop_id": "J001", "text_hash": "old", "error": None}}
        self.assertTrue(keep_previous(SHOP, FAIL, done))

    def test_성공하면_새_결과로_바꿈(self):
        done = {"J001": {"shop_id": "J001", "text_hash": "old", "error": None}}
        self.assertFalse(keep_previous(SHOP, OK, done))

    def test_처음_보는_가게는_실패도_기록(self):
        self.assertFalse(keep_previous(SHOP, FAIL, {}))

    def test_예전에도_실패였으면_실패로_덮어씀(self):
        done = {"J001": {"shop_id": "J001", "text_hash": "old", "error": "timeout"}}
        self.assertFalse(keep_previous(SHOP, FAIL, done))


if __name__ == "__main__":
    unittest.main()
