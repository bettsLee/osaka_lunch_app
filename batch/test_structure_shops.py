"""
AI 실패 때 예전 결과를 남기는 규칙(10/23) 테스트. 가게 원문은 쓰지 않고 만든 값으로만 확인해요.

실행: python3 -m unittest batch/test_structure_shops.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from structure_shops import keep_previous, too_many_failures  # noqa: E402

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


class TooManyFailuresTest(unittest.TestCase):
    def test_가게_몇_곳만_실패하면_계속(self):
        self.assertFalse(too_many_failures(1, 1))  # 10/26: 계속 120초를 넘기는 가게 1곳뿐
        self.assertFalse(too_many_failures(2, 2))
        self.assertFalse(too_many_failures(2, 28))

    def test_키_한도_문제처럼_대부분_실패하면_멈춤(self):
        self.assertTrue(too_many_failures(10, 10))  # 10/25: 월 지출 한도 초과
        self.assertTrue(too_many_failures(3, 5))
        self.assertFalse(too_many_failures(3, 6))  # 절반은 넘지 않음


if __name__ == "__main__":
    unittest.main()
