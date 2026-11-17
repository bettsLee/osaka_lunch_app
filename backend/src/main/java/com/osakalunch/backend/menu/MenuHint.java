package com.osakalunch.backend.menu;

import java.util.List;

/**
 * 결과 카드의 대표 메뉴 한 줄 (구글 지도 정보를 Gemini가 정리). 저장하지 않고 그때그때 만들어 돌려줌
 *
 * @param status  ok: 메뉴를 찾음 · unknown: 물어봤지만 메뉴 근거가 없음 · unavailable: 하루 한도 · 키 없음 · 오류로 묻지 못함
 * @param place   구글 지도 기준 평일 점심 영업: open · no_lunch · closed(폐업) · unknown
 * @param menus   대표 메뉴 최대 3개 (사용자 언어 + 일본어 원문 괄호)
 * @param sources 근거가 된 구글 지도 장소 (표시 규칙: 내용 바로 아래에 제목 + 링크)
 */
public record MenuHint(String status, String place, List<String> menus, List<Source> sources) {

    public record Source(String title, String uri) {
    }

    public static MenuHint unavailable() {
        return new MenuHint("unavailable", "unknown", List.of(), List.of());
    }
}
