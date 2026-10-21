"""
점심 시간 규칙(10/19 결정 A) 테스트. 가게 원문은 쓰지 않고 만든 값으로만 확인해요.

실행: python3 -m unittest batch/test_ai_structure.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ai_structure import lunch_window  # noqa: E402


def iv(o, c, lo=None):
    return {"open": o, "close": c, "last_order": lo}


class LunchWindowTest(unittest.TestCase):
    def test_점심_구간이_따로_있으면_그대로(self):
        got = lunch_window("O", [iv("11:30", "14:30", "14:00"), iv("17:00", "23:00", "22:30")], None)
        self.assertEqual(got, {"start": "11:30", "end": "14:30", "last_order": "14:00"})

    def test_17시까지_끝나는_구간은_그대로(self):
        got = lunch_window("O", [iv("11:30", "17:00", "16:00")], None)
        self.assertEqual(got, {"start": "11:30", "end": "17:00", "last_order": "16:00"})

    def test_저녁까지_이어지면_14시까지(self):
        got = lunch_window("O", [iv("11:30", "23:00", "22:30")], None)
        self.assertEqual(got, {"start": "11:30", "end": "14:00", "last_order": None})

    def test_아침부터_종일이면_11시부터(self):
        self.assertEqual(lunch_window("O", [iv("07:30", "22:00")], None)["start"], "11:00")
        self.assertEqual(lunch_window("O", [iv("00:00", "24:00")], None),
                         {"start": "11:00", "end": "14:00", "last_order": None})

    def test_자정_넘는_영업(self):
        self.assertEqual(lunch_window("O", [iv("11:00", "25:00")], None)["end"], "14:00")

    def test_글에_적힌_점심_시간이_우선(self):
        got = lunch_window("O", [iv("11:00", "23:00")], "11:00-15:00")
        self.assertEqual(got, {"start": "11:00", "end": "15:00", "last_order": None})

    def test_점심_영업이_아닌_날은_없음(self):
        self.assertIsNone(lunch_window("X", [iv("11:30", "14:00")], None))
        self.assertIsNone(lunch_window("?", None, None))
        self.assertIsNone(lunch_window("O", [iv("14:00", "16:00")], None))  # 14시부터는 점심 시간대 밖

    def test_이상한_값이면_멈추지_않고_없음(self):
        self.assertIsNone(lunch_window("O", [iv("11時", "14:00")], None))
        self.assertIsNone(lunch_window("O", [{"open": None, "close": None}], "모름"))


if __name__ == "__main__":
    unittest.main()
