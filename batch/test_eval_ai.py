"""
점심 시간 채점(10/23 v2) 테스트. 가게 원문은 쓰지 않고 만든 값으로만 확인해요.

실행: python3 -m unittest batch/test_eval_ai.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eval_ai import card_hours, hours_match, human_hours  # noqa: E402


def m(t):
    h, mm = t.split(":")
    return int(h) * 60 + int(mm)


class HumanHoursTest(unittest.TestCase):
    def test_표기가_달라도_앞의_두_시각을_읽음(self):
        for text in ["11:00～14:00", "11:00-14:00", "１１：００〜１４：００", "11:00~14:00 / 17:00~22:00"]:
            self.assertEqual(human_hours(text), (m("11:00"), m("14:00")), text)

    def test_비었거나_시각이_하나면_없음(self):
        self.assertIsNone(human_hours(None))
        self.assertIsNone(human_hours(""))
        self.assertIsNone(human_hours("11:00～"))


class CardHoursTest(unittest.TestCase):
    def test_평일_중_처음_여는_날(self):
        out = {"lunch_window": {"mon": None, "tue": {"start": "11:30", "end": "14:30", "last_order": None}}}
        self.assertEqual(card_hours(out), (m("11:30"), m("14:30")))

    def test_주말만_열면_주말_시간(self):
        out = {"lunch_window": {"mon": None, "sat": {"start": "12:00", "end": "15:00", "last_order": "14:30"}}}
        self.assertEqual(card_hours(out), (m("12:00"), m("15:00")))

    def test_점심_여는_날이_없으면_없음(self):
        self.assertIsNone(card_hours({"lunch_window": {"mon": None, "sat": None}}))


class HoursMatchTest(unittest.TestCase):
    def test_완전_일치(self):
        self.assertEqual(hours_match((m("11:30"), m("14:30")), (m("11:30"), m("14:30"))), (True, True))

    def test_하루_종일_여는_가게를_14시까지_자른_것은_규칙_A로_맞음(self):
        self.assertEqual(hours_match((m("11:00"), m("14:00")), (m("11:00"), m("23:00"))), (False, True))
        self.assertEqual(hours_match((m("11:00"), m("14:00")), (m("10:00"), m("22:00"))), (False, True))

    def test_점심_구간이_다르면_틀림(self):
        self.assertEqual(hours_match((m("11:30"), m("15:00")), (m("11:30"), m("14:30"))), (False, False))
        self.assertEqual(hours_match((m("11:00"), m("14:00")), (m("11:30"), m("16:00"))), (False, False))

    def test_카드에_시간이_없으면_틀림(self):
        self.assertEqual(hours_match(None, (m("11:00"), m("14:00"))), (False, False))


if __name__ == "__main__":
    unittest.main()
