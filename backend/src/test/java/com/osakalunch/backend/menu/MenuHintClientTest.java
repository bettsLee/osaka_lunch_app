package com.osakalunch.backend.menu;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Gemini 답 읽기 (11/17 오사카 실험에서 본 모양들) */
class MenuHintClientTest {

    static final List<MenuHint.Source> SRC = List.of(new MenuHint.Source("Hokkyokusei - Google Maps", "https://maps.google.com/?cid=1"));

    @Test
    void 네_줄을_읽어_메뉴와_영업을_꺼냄() {
        MenuHint h = MenuHintClient.parse("""
                STATUS: OPEN
                KIND: LUNCH
                MENU: 치킨 오므라이스(チキンオムライス) · 다이쇼 오므라이스(大正オムライス)
                PRICE: 전체 1,000~2,000엔
                BASIS: 가게 정보, 메뉴 정보
                """, SRC, "ChIJabcdefghij");
        assertThat(h.status()).isEqualTo("ok");
        assertThat(h.place()).isEqualTo("open");
        assertThat(h.menus()).containsExactly("치킨 오므라이스(チキンオムライス)", "다이쇼 오므라이스(大正オムライス)");
        assertThat(h.sources()).isEqualTo(SRC);
        assertThat(h.kind()).isEqualTo("lunch");
        assertThat(h.placeId()).isEqualTo("ChIJabcdefghij");
    }

    @Test
    void 굵은_글씨_쉼표_목록도_읽고_최대_3개() {
        MenuHint h = MenuHintClient.parse("**STATUS:** NO_LUNCH\n- **MENU:** 닭 요리(朝引き鶏), 말고기(熊本の馬肉), 흑돼지(鹿児島の黒豚), 넷째\n", SRC, null);
        assertThat(h.place()).isEqualTo("no_lunch");
        assertThat(h.kind()).isEqualTo("signature"); // KIND 줄이 없으면 '가게 대표 메뉴'로
        assertThat(h.menus()).containsExactly("닭 요리(朝引き鶏)", "말고기(熊本の馬肉)", "흑돼지(鹿児島の黒豚)");
    }

    @Test
    void 일본어_이름_안의_가운뎃점은_나누지_않음() {
        assertThat(MenuHintClient.menus("유바 모둠(ゆば・とりあわせランチ) · 오마카세(おまかせコース)"))
                .containsExactly("유바 모둠(ゆば・とりあわせランチ)", "오마카세(おまかせコース)");
    }

    @Test
    void 모름_폐업_출처없음() {
        assertThat(MenuHintClient.parse("STATUS: CLOSED\nMENU: UNKNOWN", SRC, null))
                .extracting(MenuHint::status, MenuHint::place).containsExactly("unknown", "closed");
        // 구글 지도 출처가 하나도 없으면 지도에서 찾은 답이 아니라서 메뉴를 쓰지 않음
        assertThat(MenuHintClient.parse("STATUS: OPEN\nMENU: 라멘(ラーメン)", List.of(), "ChIJabcdefghij").status()).isEqualTo("unknown");
        assertThat(MenuHintClient.parse("엉뚱한 답", SRC, null).place()).isEqualTo("unknown");
    }

    @Test
    void 출처는_구글_지도_장소만_겹치지_않게_3개까지() throws Exception {
        var meta = new ObjectMapper().readTree("""
                {"groundingChunks": [
                  {"maps": {"uri": "https://maps.google.com/?cid=1", "title": "A - Google Maps"}},
                  {"maps": {"uri": "https://maps.google.com/?cid=1", "title": "A - Google Maps"}},
                  {"web": {"uri": "https://example.com", "title": "web"}},
                  {"maps": {"uri": "javascript:alert(1)", "title": "bad"}},
                  {"maps": {"uri": "https://maps.google.com/?cid=2", "title": "Review of A - Google Maps"}}
                ]}""");
        assertThat(MenuHintClient.sources(meta)).extracting(MenuHint.Source::uri)
                .containsExactly("https://maps.google.com/?cid=1", "https://maps.google.com/?cid=2");
        var withId = new ObjectMapper().readTree("""
                {"groundingChunks": [{"web": {}}, {"maps": {"placeId": "places/ChIJN1t_tDeuEmsRUsoyG83frY4"}}]}""");
        assertThat(MenuHintClient.placeId(withId)).isEqualTo("ChIJN1t_tDeuEmsRUsoyG83frY4");
        assertThat(MenuHintClient.placeId(new ObjectMapper().readTree("{\"groundingChunks\": [{\"maps\": {\"placeId\": \"../x\"}}]}"))).isNull();
    }

    @Test
    void 질문은_사용자_언어로() {
        String p = MenuHintClient.prompt(new Shop("J1", "北極星", 34.65, 135.43), "ja");
        assertThat(p).contains("Name: 北極星").contains("latitude 34.65").contains("Japanese (ja)");
    }
}
