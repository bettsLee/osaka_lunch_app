package com.osakalunch.backend.menu;

import java.util.List;

/**
 * 결과 카드의 대표 메뉴 한 줄 (구글 지도 정보를 Gemini가 정리). 저장하지 않고 그때그때 만들어 돌려줌
 *
 * @param status  ok: 메뉴를 찾음 · guess: AI가 구글 지도를 안 보고 쓴 메뉴 ('AI 추측', 출처 없음 · 11/17) · unknown: 물어봤지만 메뉴 근거가 없음 · unavailable: 하루 한도 · 키 없음 · 오류로 묻지 못함
 * @param place   구글 지도 기준 평일 점심 영업: open · no_lunch · closed(폐업) · unknown
 * @param menus   대표 메뉴 최대 3개 (사용자 언어 + 일본어 원문 괄호)
 * @param kind    lunch: 평일 점심에 나오는 메뉴로 알려진 것 · signature: 가게 대표 메뉴(저녁일 수도) (11/17 상권: "대표메뉴가 점심메뉴가 맞아?")
 * @param sources 근거가 된 구글 지도 장소 (표시 규칙: 내용 바로 아래에 제목 + 링크)
 * @param placeId 구글 가게 ID (사진을 받을 때 씀. 그라운딩 약관상 저장 가능한 값)
 */
public record MenuHint(String status, String place, List<String> menus, String kind, List<Source> sources, String placeId) {

    public record Source(String title, String uri) {
    }

    public static MenuHint unavailable() {
        return new MenuHint("unavailable", "unknown", List.of(), "signature", List.of(), null);
    }
}
