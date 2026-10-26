"""
점심 시간 규칙(10/19 결정 A) 테스트. 가게 원문은 쓰지 않고 만든 값으로만 확인해요.

실행: python3 -m unittest batch/test_ai_structure.py
"""
import os
import socket
import sys
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ai_structure  # noqa: E402
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


class CallGeminiRetryTest(unittest.TestCase):
    """10/26: 시간 초과는 다시 시도하지 않고, 잠깐 몰림(503)은 지금처럼 다시 시도"""

    def run_with(self, errors):
        calls = []

        def fake_urlopen(req, timeout):
            calls.append(timeout)
            raise errors[min(len(calls), len(errors)) - 1]

        with mock.patch("urllib.request.urlopen", fake_urlopen), mock.patch("time.sleep"):
            with self.assertRaises(RuntimeError) as cm:
                ai_structure.call_gemini("prompt", "key", "model")
        return calls, str(cm.exception)

    def test_응답_시간_초과는_한_번만(self):
        calls, msg = self.run_with([TimeoutError("The read operation timed out")])
        self.assertEqual(len(calls), 1)
        self.assertIn("초 안에 오지 않았어요", msg)

    def test_연결할_때_시간_초과도_한_번만(self):
        calls, _ = self.run_with([urllib.error.URLError(socket.timeout("timed out"))])
        self.assertEqual(len(calls), 1)

    def test_잠깐_몰리면_다섯_번까지(self):
        err = urllib.error.HTTPError("u", 503, "busy", {}, None)
        err.read = lambda: b"overloaded"
        calls, msg = self.run_with([err])
        self.assertEqual(len(calls), 5)
        self.assertIn("503", msg)

    def test_연결이_끊기면_다섯_번까지(self):
        calls, _ = self.run_with([urllib.error.URLError(ConnectionResetError("reset"))])
        self.assertEqual(len(calls), 5)


if __name__ == "__main__":
    unittest.main()
